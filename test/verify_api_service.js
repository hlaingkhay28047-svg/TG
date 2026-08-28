/* The API service, end to end, against a real PostgreSQL database.
 *
 * WHY THIS FILE EXISTS. Moving off Supabase replaces a hosted auth service and
 * PostgREST with about a thousand lines of our own. verify_schema_behaviour.js
 * proves the database still refuses what it should when a statement arrives
 * with the right role and uid set. It says nothing about whether the service
 * SETS them correctly — and a service that forgets, or sets them from something
 * an attacker controls, hands over every row while every schema test stays
 * green.
 *
 * So this file drives the real HTTP server: signs up, logs in, refreshes,
 * uploads a proof, and then attacks it as a customer, as an anonymous caller,
 * and with forged tokens.
 *
 * Usage: node test/verify_api_service.js   (needs PostgreSQL; see
 *        verify_schema_behaviour.js for how to start one) */
const { execFile, execFileSync, spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const DB = "hnk_api_test";
const RUNTIME_USER = "hnk_api_runtime";
const RUNTIME_PASSWORD = "roleless-api-probe";
const PORT = 8977;
const EXPECTED_API_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs", "app", "version.json"), "utf8")).v;
const EXPECTED_SCHEMA_SHA = crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(ROOT, "server", "sql", "schema.sql")))
  .digest("hex");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
});
const RUNTIME_ENV = Object.assign({}, ENV, {
  PGUSER: RUNTIME_USER,
  PGPASSWORD: RUNTIME_PASSWORD,
});
const psql = (sql, db) => execFileSync("psql",
  ["-d", db || "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
  { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const psqlAsync = (sql, db) => new Promise((resolve,reject)=>{
  execFile("psql",["-d",db||"postgres","-v","ON_ERROR_STOP=1","-t","-A","-c",sql],
    {env:ENV,encoding:"utf8"},(error,stdout,stderr)=>{
      if (error) {
        error.message += stderr ? "\n"+stderr.trim() : "";
        reject(error);
      } else resolve(String(stdout||"").trim());
    });
});
const runtimePsql = (sql, db) => execFileSync("psql",
  ["-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql],
  { env: RUNTIME_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const runtimeUrl = db =>
  `postgres://${encodeURIComponent(RUNTIME_USER)}:${encodeURIComponent(RUNTIME_PASSWORD)}` +
  `@${ENV.PGHOST}:${ENV.PGPORT}/${db}`;
const createRuntimeDatabase = db => {
  psql(`drop database if exists ${db}`);
  psql(`create database ${db}`);
  psql(`revoke all on database ${db} from ${RUNTIME_USER}; ` +
    `revoke create on database ${db} from public; ` +
    `grant connect on database ${db} to ${RUNTIME_USER}`);
  psql(`revoke create on schema public from public; ` +
    `grant usage, create on schema public to ${RUNTIME_USER}`, db);
};
const LOCAL_SERVICE_CONTEXT =
  "set local request.role = 'service_role'; " +
  "set local request.jwt.claim.sub = ''; " +
  "set local request.is_admin = 'false'; " +
  "set local request.user_email = ''";
const SESSION_SERVICE_CONTEXT =
  "select set_config('request.role', 'service_role', false), " +
  "set_config('request.jwt.claim.sub', '', false), " +
  "set_config('request.is_admin', 'false', false), " +
  "set_config('request.user_email', '', false)";
const runtimeServicePsql = (sql, db) =>
  runtimePsql(`begin; ${LOCAL_SERVICE_CONTEXT}; ${sql}; commit`, db);
const applyRuntimeSchema = db => execFileSync("psql", [
  "-d", db, "-v", "ON_ERROR_STOP=1", "-q",
  "-c", SESSION_SERVICE_CONTEXT,
  "-f", path.join(ROOT, "server", "sql", "platform.sql"),
  "-f", path.join(ROOT, "server", "sql", "schema.sql"),
], { env: RUNTIME_ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/* ---- build a database ---- */
try { psql("select 1"); } catch (e) {
  console.log("FAIL — a PostgreSQL server is reachable\n       :: " + String(e.message).split("\n")[0]);
  console.log("\nFAIL (1)"); process.exit(1);
}
for (const db of [DB, DB + "_partial", DB + "_late", DB + "_locked",
  DB + "_packaged", DB + "_packaged_missing"]) {
  psql(`drop database if exists ${db}`);
}
psql("drop role if exists anon, authenticated, service_role");
psql(`drop role if exists ${RUNTIME_USER}`);
psql(`create role ${RUNTIME_USER} login password '${RUNTIME_PASSWORD}' ` +
  "nosuperuser nocreaterole nocreatedb noreplication nobypassrls");
createRuntimeDatabase(DB);

/* ---- boot the service against it ---- */
/* The password belongs in the URL even though a local trust-auth server
   ignores it. Leaving it out worked on a development cluster and failed in CI
   with "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
   because the service container authenticates. psql-based checks did not catch
   it — they read PGPASSWORD from the environment, while the pg driver only sees
   what this string carries. */
process.env.DATABASE_URL = runtimeUrl(DB);
process.env.PGSSLMODE = "disable";
process.env.ALLOW_UNVERIFIED_DB_TLS = "1";
delete process.env.ALLOW_DERIVED_SECURITY_SECRETS;
process.env.PG_POOL_MAX = "1";
process.env.FAILED_LOGIN_LIMIT = "3";
process.env.PASSWORD_KDF_MAX_CONCURRENCY = "1";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.MFA_ENCRYPTION_KEY = "api-service-mfa-encryption-key-2026-08-26";
process.env.DEVICE_ID_HASH_SECRET = "api-service-device-id-hash-key-2026-08-26";
process.env.DEVICE_PAIRING_SECRET = "api-service-device-pairing-key-2026-08-26";
process.env.CCX_DOWNLOAD_SECRET = "api-service-ccx-download-key-2026-08-26";
process.env.PANEL_LEASE_SECRET = "api-service-panel-lease-key-2026-08-26";
process.env.MAX_UPLOAD_BYTES = "1024";
process.env.ALLOWED_ORIGIN = "https://example.test";
/* The schema is built by the SERVICE'S OWN migration, not by psql here. That
   is deliberate: it is the code path a real deployment takes on first boot, so
   this check fails if boot-time migration breaks — which is the only thing
   standing between an empty DigitalOcean database and a working one, now that
   the owner applies no SQL by hand. */
const { migrate } = require(path.join(ROOT, "server", "lib", "migrate.js"));
const { server } = require(path.join(ROOT, "server", "index.js"));

const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, { token, body, headers, raw } = {}) {
  const h = Object.assign({}, headers);
  if (token) h.authorization = "Bearer " + token;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) { h["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(BASE + p, { method, headers: h, body: payload });
  const bytes = Buffer.from(await r.arrayBuffer());
  const text = bytes.toString("utf8");
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  const responseHeaders = {};
  r.headers.forEach((value,key)=>{ responseHeaders[key.toLowerCase()]=value; });
  return { status: r.status, json, text, bytes, headers: responseHeaders };
}

function testPasswordHash(password,parallelization) {
  return new Promise((resolve,reject)=>{
    const salt=crypto.randomBytes(16);
    crypto.scrypt(password,salt,64,{N:16384,r:8,p:parallelization,maxmem:64*1024*1024},
      (error,key)=>error?reject(error):resolve(
        `scrypt$16384$8$${parallelization}$${salt.toString("base64")}$${key.toString("base64")}`));
  });
}

(async () => {
  const dbRuntime = require(path.join(ROOT, "server", "lib", "db"));
  const readRequestContext = async client => (await client.query(
    "select coalesce(current_setting('request.role', true), '') as role, " +
    "coalesce(current_setting('request.jwt.claim.sub', true), '') as uid, " +
    "coalesce(current_setting('request.is_admin', true), '') as is_admin, " +
    "coalesce(current_setting('request.user_email', true), '') as email"
  )).rows[0];
  const contextIsEmpty = context =>
    context && context.role === "" && context.uid === "" &&
    context.is_admin === "" && context.email === "";

  let migrated = null;
  try { await migrate(); } catch (err) { migrated = err.message; }
  const tables = psql("select count(*)::int from pg_tables where schemaname='public' " +
    "and tablename in ('profiles','payment_requests','app_settings','devices')", DB);
  report("the service migrates an EMPTY database to a working schema on boot",
    migrated === null && tables === "4", { error: migrated, tables });

  const runtimeFlags = psql(
    "select rolsuper::text||'|'||rolcreaterole::text||'|'||rolbypassrls::text " +
    `from pg_roles where rolname='${RUNTIME_USER}'`);
  const databaseOwner = psql(
    `select pg_get_userbyid(datdba) from pg_database where datname='${DB}'`);
  const runtimePrivileges = psql(
    `select has_database_privilege('${RUNTIME_USER}','${DB}','create')::text||'|'||` +
    `has_schema_privilege('${RUNTIME_USER}','public','usage')::text||'|'||` +
    `has_schema_privilege('${RUNTIME_USER}','public','create')::text`, DB);
  report("the runtime is restricted to object creation in existing public schema",
    runtimeFlags === "false|false|false" && databaseOwner !== RUNTIME_USER &&
    runtimePrivileges === "false|true|true",
    { runtimeFlags, databaseOwner, runtimePrivileges });

  const requestRoles = psql(
    "select coalesce(string_agg(rolname, ',' order by rolname), '') from pg_roles " +
    "where rolname in ('anon','authenticated','service_role')");
  report("roleless migration does not require cluster-wide request roles",
    requestRoles === "", { requestRoles });

  const nativeSchemas = psql(
    "select (to_regnamespace('auth') is null)::text||'|'||" +
    "(to_regnamespace('storage') is null)::text", DB);
  report("migration creates no auth/storage schema",
    nativeSchemas === "true|true", { nativeSchemas });

  const forcedTables = psql(
    "select coalesce(string_agg(n.nspname||'.'||c.relname, ',' order by n.nspname,c.relname), '') " +
    "from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
    "where (n.nspname,c.relname) in " +
    "(('public','profiles'),('public','payment_requests'),('public','app_settings')," +
    "('public','devices'),('public','hnk_storage_buckets'),('public','hnk_storage_objects')," +
    "('public','hnk_auth_users'),('public','hnk_auth_refresh_tokens')) " +
    "and c.relrowsecurity and c.relforcerowsecurity", DB);
  const expectedForcedTables =
    "public.app_settings,public.devices,public.hnk_auth_refresh_tokens,public.hnk_auth_users," +
    "public.hnk_storage_buckets,public.hnk_storage_objects,public.payment_requests,public.profiles";
  report("all request and auth tables enforce RLS even for their runtime owner",
    forcedTables === expectedForcedTables, { forcedTables });

  /* migrate() uses session-scoped timeouts, so its connection must be
     discarded instead of returning to the request pool. Reacquiring
     immediately is the deterministic regression: before the fix this was the
     same session and SHOW returned 5s / 2min instead of PostgreSQL defaults. */
  const cleanClient = await dbRuntime.pool.connect();
  const cleanLockTimeout = (await cleanClient.query("show lock_timeout")).rows[0].lock_timeout;
  const cleanStatementTimeout = (await cleanClient.query("show statement_timeout")).rows[0].statement_timeout;
  const cleanContext = await readRequestContext(cleanClient);
  cleanClient.release();
  report("the migration's session timeouts never leak into payment/auth requests",
    cleanLockTimeout === "0" && cleanStatementTimeout === "0",
    { lockTimeout: cleanLockTimeout, statementTimeout: cleanStatementTimeout });
  report("PG_POOL_MAX=1 makes context reuse deterministic and migration context is cleared",
    dbRuntime.pool.options.max === 1 && contextIsEmpty(cleanContext),
    { poolMax: dbRuntime.pool.options.max, context: cleanContext });

  await new Promise(r => server.listen(PORT, r));

  /* ---- /health: the only window the owner has into a deployment ---- */
  {
    const h = await call("GET", "/health");
    report("A0) /health attests this API version and exact applied schema",
      h.status === 200 && h.json && h.json.schema === 4 && h.json.ready === true &&
      h.json.apiVersion === EXPECTED_API_VERSION &&
      h.json.schemaFingerprint === EXPECTED_SCHEMA_SHA &&
      h.json.error === undefined, h.json);
    const recoveryIndex=psql(
      "select to_regclass('public.hnk_auth_users_recovery_token_uniq')::text",DB);
    report("A0.1) recovery-token lookup is indexed before auth traffic is admitted",
      recoveryIndex==="hnk_auth_users_recovery_token_uniq",{recoveryIndex});
  }

  /* ================= the ordinary journey ================= */
  const cust = { email: "customer@example.test", password: "hunter2hunter" };
  const owner = { email: "owner@example.test", password: "ownerpass123" };

  let r = await call("POST", "/auth/v1/signup", { body: cust });
  const custSession = r.json;
  report("A) signup returns a session envelope the client can save",
    r.status === 200 && !!custSession.access_token && !!custSession.refresh_token && !!(custSession.user && custSession.user.id),
    { status: r.status, keys: Object.keys(custSession || {}) });
  const CUST = custSession.user.id;

  r = await call("POST", "/auth/v1/signup", { body: owner });
  const OWNER = r.json.user.id;
  let ownerToken = r.json.access_token;

  r = await call("POST", "/auth/v1/signup", { body: cust });
  report("B) a duplicate signup says exactly what the client matches on",
    r.status === 422 && /User already registered/.test(r.text), { status: r.status, text: r.text.slice(0, 90) });

  r = await call("POST", "/auth/v1/token?grant_type=password", { body: cust });
  let custToken = r.json && r.json.access_token;
  report("C) login with the right password returns a session", r.status === 200 && !!custToken, { status: r.status });

  r = await call("POST", "/auth/v1/token?grant_type=password", { body: { email: cust.email, password: "wrong" } });
  report("D) a wrong password says 'Invalid login credentials'",
    r.status === 400 && /Invalid login credentials/.test(r.text), { status: r.status, text: r.text.slice(0, 80) });

  r = await call("POST", "/auth/v1/token?grant_type=password", { body: { email: "nobody@example.test", password: "x" } });
  report("E) an unknown address answers identically, not 'no such user'",
    r.status === 400 && /Invalid login credentials/.test(r.text), { status: r.status });

  const bruteEmail = "parallel-bruteforce@example.test";
  const bruteStatuses = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await call("POST", "/auth/v1/token?grant_type=password", {
      body: { email: bruteEmail, password: "wrong" },
    });
    bruteStatuses.push(response.status);
  }
  const bruteEmailHash = crypto.createHmac("sha256", process.env.JWT_SECRET)
    .update(bruteEmail, "utf8").digest("hex");
  const bruteEvidence = runtimeServicePsql(
    `select (select count(*) from public.auth_attempts where operation='login' ` +
    `and email_hash='${bruteEmailHash}')||'|'||` +
    `(select count(*) from public.auth_attempts where operation='login_admission' ` +
    `and email_hash='${bruteEmailHash}')||'|'||` +
    `(select count(*) from public.login_history where event_type='failed_login' ` +
    `and attempted_email='${bruteEmail}')`, DB);
  report("E2) failed-password admission stops at the durable pre-KDF limit without audit amplification",
    bruteStatuses.join(",") === "400,400,400,429" && bruteEvidence === "3|3|3",
    { statuses: bruteStatuses, failureAdmissionAndAudit: bruteEvidence });

  /* Make verification slow enough to observe the transaction after it reads
     the old hash. A concurrent password update must wait on that shared row
     lock, then revoke the session the login just created. Without FOR SHARE,
     the update commits first and an in-flight old password creates a fresh,
     unrevoked session afterward. */
  const raceEmail="password-race@example.test";
  const racePassword="old-password-race";
  const slowOldHash=await testPasswordHash(racePassword,12);
  const replacementHash=await testPasswordHash("replacement-password",1);
  runtimeServicePsql(
    `insert into public.hnk_auth_users (email,encrypted_password,email_confirmed_at) ` +
    `values ('${raceEmail}','${slowOldHash}',now())`,DB);
  const raceUserId=psql(
    `select id from public.hnk_auth_users where email='${raceEmail}'`,DB);
  const racingLogin=call("POST","/auth/v1/token?grant_type=password",{
    body:{email:raceEmail,password:racePassword},
  });
  let observedPasswordRead=false;
  const observeDeadline=Date.now()+5000;
  while (Date.now()<observeDeadline) {
    const active=await psqlAsync(
      `select count(*) from pg_stat_activity where datname='${DB}' ` +
      `and usename='${RUNTIME_USER}' and state='idle in transaction' ` +
      `and query ilike '%encrypted_password%'`,"postgres");
    if (Number(active)>0) { observedPasswordRead=true;break; }
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  const overflowRecoveryToken=crypto.randomBytes(32).toString("base64url");
  const recoveryProbeBefore=await psqlAsync(
    "select count(*) from public.auth_attempts where operation='recovery_probe'",DB);
  const overflowRecovery=await call("PUT",
    "/auth/v1/user?token="+encodeURIComponent(overflowRecoveryToken),{
      body:{password:"replacement-password"},
    });
  const recoveryProbeAfter=await psqlAsync(
    "select count(*) from public.auth_attempts where operation='recovery_probe'",DB);
  report("E3) a saturated KDF gate rejects recovery before token lookup or durable reservation",
    observedPasswordRead&&overflowRecovery.status===429&&
      overflowRecovery.json&&overflowRecovery.json.error==="auth_busy"&&
      recoveryProbeAfter===recoveryProbeBefore,
    {observedPasswordRead,status:overflowRecovery.status,
      error:overflowRecovery.json&&overflowRecovery.json.error,
      recoveryProbeBefore,recoveryProbeAfter});
  const racingReset=psqlAsync(
    `begin; ${LOCAL_SERVICE_CONTEXT}; ` +
    `update public.hnk_auth_users set encrypted_password='${replacementHash}',updated_at=now() ` +
    `where id='${raceUserId}'; ` +
    `update public.sessions set revoked_at=coalesce(revoked_at,now()),` +
    `revoked_reason=coalesce(revoked_reason,'password_reset') where user_id='${raceUserId}'; commit`,DB);
  const raceLoginResult=await racingLogin;
  await racingReset;
  const racedSessionId=raceLoginResult.json&&raceLoginResult.json.session_id;
  const racedSessionRevoked=racedSessionId
    ? runtimeServicePsql(
      `select (revoked_at is not null)::text from public.sessions where id='${racedSessionId}'`,DB)
    : "missing";
  report("E4) password reset revokes a session created by an in-flight old-password login",
    observedPasswordRead&&raceLoginResult.status===200&&racedSessionRevoked==="true",
    {observedPasswordRead,status:raceLoginResult.status,sessionRevoked:racedSessionRevoked});
  /* The race account is an isolated concurrency fixture. Remove it before the
     ordinary two-account visibility/admin assertions below. */
  runtimeServicePsql(
    `delete from public.hnk_auth_users where id='${raceUserId}'`,DB);

  /* Unified signup creates the profile and enforcement rows transactionally;
     a canonical live session must never point at a missing profile. */
  r = await call("GET", "/rest/v1/profiles?select=*&id=eq." + CUST,
    { token: custToken, headers: { accept: "application/vnd.pgrst.object+json" } });
  report("F) signup leaves a complete own-only pending profile behind",
    r.status === 200 && r.json && r.json.plan_status === "none" &&
      r.json.allowed_devices === 2 && r.json.is_admin === false &&
      r.json.account_status === "pending" && r.json.email === cust.email,
    { status: r.status, row: r.json });
  const unifiedSignupRows = psql(
    `select (select count(*) from public.user_roles ur join public.roles rr on rr.id=ur.role_id ` +
    `where ur.user_id='${CUST}' and rr.name='student')||'|'||` +
    `(select count(*) from public.app_permissions where user_id='${CUST}')`, DB);
  report("G) signup atomically creates the student's canonical role and permissions",
    unifiedSignupRows === "1|1", { roleAndPermissions: unifiedSignupRows });

  runtimeServicePsql(`update public.profiles set is_admin = true where id = '${OWNER}'`, DB);

  const serviceAuthRows = await dbRuntime.asService(client =>
    client.query("select count(*)::int as n from public.hnk_auth_users"));
  const customerAuthRows = await dbRuntime.asUser(CUST, client =>
    client.query("select count(*)::int as n from public.hnk_auth_users"));
  const anonAuthRows = await dbRuntime.asAnon(client =>
    client.query("select count(*)::int as n from public.hnk_auth_users"));
  report("auth rows are visible only inside the trusted service context",
    serviceAuthRows.rows[0].n === 2 && customerAuthRows.rows[0].n === 0 &&
    anonAuthRows.rows[0].n === 0,
    { service: serviceAuthRows.rows[0].n, customer: customerAuthRows.rows[0].n,
      anon: anonAuthRows.rows[0].n });

  const rollbackMarker = "deliberate service-context rollback";
  let rolledBack = false;
  try {
    await dbRuntime.asService(async client => {
      await client.query("select 1 from public.hnk_auth_users limit 1");
      throw new Error(rollbackMarker);
    });
  } catch (err) { rolledBack = err.message === rollbackMarker; }
  const resetClient = await dbRuntime.pool.connect();
  const resetContext = await readRequestContext(resetClient);
  const resetVisibility = (await resetClient.query(
    "select (select count(*)::int from public.profiles) as profiles, " +
    "(select count(*)::int from public.hnk_auth_users) as auth_users"
  )).rows[0];
  resetClient.release();
  report("one reused pool connection clears trusted context after commit and rollback",
    dbRuntime.pool.options.max === 1 && rolledBack && contextIsEmpty(resetContext) &&
    resetVisibility.profiles === 0 && resetVisibility.auth_users === 0,
    { poolMax: dbRuntime.pool.options.max, rolledBack, context: resetContext,
      contextlessRows: resetVisibility });

  /* ================= attacks ================= */
  r = await call("PATCH", "/rest/v1/profiles?id=eq." + CUST,
    { token: custToken, body: { is_admin: true, plan_status: "active", allowed_devices: 99 }, headers: { prefer: "return=representation" } });
  const after = psql(`select is_admin||'|'||plan_status||'|'||allowed_devices from public.profiles where id='${CUST}'`, DB);
  report("H) a customer promoting themselves through the API is reverted",
    after === "false|none|2", { httpStatus: r.status, after });

  r = await call("GET", "/rest/v1/profiles?select=*", { token: custToken });
  report("I) a customer listing profiles sees only their own row",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 1 && r.json[0].id === CUST,
    { status: r.status, count: Array.isArray(r.json) ? r.json.length : null });

  r = await call("GET", "/rest/v1/profiles?select=*", { token: ownerToken });
  report("J) an ordinary admin bearer remains scoped to its own profile",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 1 && r.json[0].id === OWNER,
    { count: Array.isArray(r.json) ? r.json.length : null, rows: r.json });

  const adminProfileBatch = "/rest/v1/profiles?select=id,name,email,joined_paid,allowed_devices," +
    "price_1m_override,price_3m_override,price_6m_override,price_join_first_override" +
    "&id=in.(" + OWNER + "," + CUST + ")";
  r = await call("GET", adminProfileBatch, { token: ownerToken });
  const batchIds = Array.isArray(r.json) ? r.json.map(row => row.id).sort() : [];
  report("J2) a bounded generic REST batch cannot widen an admin bearer",
    r.status === 200 && batchIds.join(",") === OWNER,
    { status: r.status, ids: batchIds });
  r = await call("GET", adminProfileBatch, { token: custToken });
  report("J3) an id batch still obeys profile RLS for a customer",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 1 && r.json[0].id === CUST,
    { status: r.status, rows: r.json });
  const tooManyIds = Array(101).fill(CUST).join(",");
  r = await call("GET", "/rest/v1/profiles?select=id&id=in.(" + tooManyIds + ")", { token: ownerToken });
  report("J4) generic REST still caps an oversized id filter",
    r.status === 400, { status: r.status });

  r = await call("GET", "/v1/admin/students", { token: ownerToken });
  report("J5) a web-session admin bearer cannot enter the strict admin API",
    r.status === 403, { status: r.status, body: r.json });

  r = await call("POST", "/auth/v1/token?grant_type=password", {
    body: { email: owner.email, password: owner.password, client_type: "admin" },
  });
  const ownerAdminToken = r.json && r.json.access_token;
  report("J6) admin login creates a dedicated admin-client session",
    r.status === 200 && !!ownerAdminToken, { status: r.status });

  /* MFA is OPTIONAL. A dedicated admin session whose account has enrolled no
     second factor reaches the strict admin API on password alone — the forced
     first-sign-in enrolment that could lock out the sole administrator is
     gone. */
  r = await call("GET", "/v1/admin/students", { token: ownerAdminToken });
  report("J7) an admin-client session with no enrolled MFA reaches the strict admin API",
    r.status === 200, { status: r.status, body: r.json });
  const paymentBeforeMfa = await call("GET", "/v1/admin/payment-requests?status=pending", {
    token: ownerAdminToken,
  });
  report("J7b) the strict payment queue is likewise reachable before any MFA is enrolled",
    paymentBeforeMfa.status === 200, { status: paymentBeforeMfa.status, body: paymentBeforeMfa.json });

  const mfaSetup = await call("POST", "/v1/admin/mfa/setup", { token: ownerAdminToken, body: {} });
  const mfaSecret = mfaSetup.json && mfaSetup.json.secret;
  const mfaCode = mfaSecret
    ? require(path.join(ROOT, "server", "lib", "mfa")).totp(mfaSecret, Date.now())
    : "";
  const mfaVerified = await call("POST", "/v1/admin/mfa/verify", {
    token: ownerAdminToken, body: { code: mfaCode },
  });
  report("J8) the dedicated admin session can still opt into TOTP and verify it",
    mfaSetup.status === 200 && !!mfaSecret && mfaVerified.status === 200 &&
      mfaVerified.json && mfaVerified.json.mfa_verified === true,
    { setup: mfaSetup.status, verify: mfaVerified.status });

  /* Opting in is enforced from then on: once the account has a confirmed
     secret, a FRESH admin login is blocked until it passes the second factor.
     Optional does not mean toothless for an administrator who chose it. */
  const secondLogin = await call("POST", "/auth/v1/token?grant_type=password", {
    body: { email: owner.email, password: owner.password, client_type: "admin" },
  });
  const secondAdminToken = secondLogin.json && secondLogin.json.access_token;
  const enrolledBlocked = await call("GET", "/v1/admin/students", { token: secondAdminToken });
  report("J8b) once enrolled, a fresh admin session is blocked until it verifies MFA",
    enrolledBlocked.status === 403 && enrolledBlocked.json &&
      enrolledBlocked.json.error === "mfa_required",
    { status: enrolledBlocked.status, body: enrolledBlocked.json });

  r = await call("GET", "/v1/admin/students?limit=10", { token: ownerAdminToken });
  const strictAdminIds = r.json && Array.isArray(r.json.students)
    ? r.json.students.map(row => row.id).sort() : [];
  report("J9) cross-account student reads use only the MFA-verified strict admin API",
    r.status === 200 && strictAdminIds.join(",") === [CUST, OWNER].sort().join(","),
    { status: r.status, ids: strictAdminIds });

  r = await call("POST", `/v1/admin/students/${CUST}/actions`, {
    token: ownerAdminToken,
    body: { action: "set_permission", permission: "ccx_download", enabled: false },
  });
  const strictPermissionAudit = psql(
    `select (select ccx_download_enabled::text from public.app_permissions where user_id='${CUST}')||'|'||` +
    `(select count(*)::text from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and target_user_id='${CUST}' and action='set_permission')`, DB);
  report("J10) strict admin mutations are server-authorized and audited",
    r.status === 200 && strictPermissionAudit === "false|1",
    { status: r.status, stateAndAudit: strictPermissionAudit });
  await call("POST", `/v1/admin/students/${CUST}/actions`, {
    token: ownerAdminToken,
    body: { action: "set_permission", permission: "ccx_download", enabled: true },
  });

  /* Approval is a one-way registration transition, not an alias for rewriting
     an already-active account. Seed a longer canonical term to prove that the
     initial pending -> active transition cannot shorten paid time either. */
  runtimeServicePsql(
    `update public.profiles set account_status='pending',plan_status='none',plan_expires_at=null ` +
    `where id='${CUST}'; ` +
    `insert into public.licenses (user_id,status,starts_at,expires_at,created_by) ` +
    `values ('${CUST}','active',now(),now()+interval '11 months','${OWNER}') ` +
    `on conflict (user_id) do update set status='active',starts_at=excluded.starts_at,` +
    `expires_at=excluded.expires_at,created_by=excluded.created_by`, DB);
  const approvalExpiryBefore=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const approvedAccount=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,body:{action:"approve",months:1},
  });
  const approvalExpiryAfter=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const approvalEvidence=psql(
    `select account_status||'|'||(select count(*) from public.admin_audit_logs ` +
    `where actor_user_id='${OWNER}' and target_user_id='${CUST}' and action='approve') ` +
    `from public.profiles where id='${CUST}'`,DB);
  const repeatedApproval=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,body:{action:"approve",months:1},
  });
  const approvalExpiryAfterReplay=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  runtimeServicePsql(`update public.profiles set account_status='suspended' where id='${CUST}'`,DB);
  const invalidApproval=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,body:{action:"approve",months:1},
  });
  runtimeServicePsql(`update public.profiles set account_status='active' where id='${CUST}'`,DB);
  report("J11) Approve permits only pending -> active and never truncates an existing license",
    approvedAccount.status===200&&approvalEvidence==="active|1"&&
      approvalExpiryAfter===approvalExpiryBefore&&approvalExpiryAfterReplay===approvalExpiryBefore&&
      repeatedApproval.status===409&&repeatedApproval.json&&
      repeatedApproval.json.error==="account_not_pending"&&
      invalidApproval.status===409&&invalidApproval.json&&invalidApproval.json.error==="account_not_pending",
    {approved:approvedAccount.status,evidence:approvalEvidence,before:approvalExpiryBefore,
      after:approvalExpiryAfter,replay:repeatedApproval,invalid:invalidApproval});

  runtimeServicePsql(`update public.profiles set account_status='pending' where id='${CUST}'`,DB);
  const explicitApprovalExpiryBefore=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const explicitApproval=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,
    body:{action:"approve",expires_at:new Date(Date.now()+31*24*60*60*1000).toISOString()},
  });
  const explicitApprovalExpiryAfter=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  report("J11b) explicit-expiry Approve preserves a longer existing canonical term",
    explicitApproval.status===200&&explicitApprovalExpiryAfter===explicitApprovalExpiryBefore,
    {status:explicitApproval.status,before:explicitApprovalExpiryBefore,
      after:explicitApprovalExpiryAfter,body:explicitApproval.json});

  const EXTEND_REPLAY_ID="55555555-5555-4555-8555-555555555551";
  const extendExpiryBefore=approvalExpiryAfter;
  const extendFirst=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,
    body:{action:"extend_license",months:1,mutation_id:EXTEND_REPLAY_ID},
  });
  const extendExpiryFirst=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const extendFirstIsOneTerm=psql(
    `select (expires_at=to_timestamp(${extendExpiryBefore})+interval '1 month')::text ` +
    `from public.licenses where user_id='${CUST}'`,DB);
  const extendReplay=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,
    body:{action:"extend_license",months:1,mutation_id:EXTEND_REPLAY_ID},
  });
  const extendExpiryReplay=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const extendReplayAudit=psql(
    `select count(*)||'|'||bool_and(result is not null)::text from public.admin_audit_logs ` +
    `where actor_user_id='${OWNER}' and action='extend_license' and mutation_id='${EXTEND_REPLAY_ID}'`,DB);
  const extendConflict=await call("POST",`/v1/admin/students/${CUST}/actions`,{
    token:ownerAdminToken,
    body:{action:"extend_license",months:3,mutation_id:EXTEND_REPLAY_ID},
  });
  report("J12) sequential extend_license replay returns one persisted result and extends once",
    extendFirst.status===200&&extendReplay.status===200&&
      extendFirst.json&&extendReplay.json&&extendFirst.json.action==="extend_license"&&
      extendReplay.json.student_id===extendFirst.json.student_id&&
      extendFirstIsOneTerm==="true"&&extendExpiryReplay===extendExpiryFirst&&
      extendReplayAudit==="1|true"&&extendConflict.status===409&&extendConflict.json&&
      extendConflict.json.error==="mutation_conflict",
    {first:extendFirst,replay:extendReplay,before:extendExpiryBefore,after:extendExpiryFirst,
      exactOneTerm:extendFirstIsOneTerm,
      afterReplay:extendExpiryReplay,audit:extendReplayAudit,conflict:extendConflict});

  const {Client:DirectPgClient}=require(path.join(ROOT,"server","node_modules","pg"));
  const adminContract=require(path.join(ROOT,"server","lib","admin-api.js"));
  const directAdminIdentity={uid:OWNER,clientType:"admin",roles:["admin"],mfaVerified:true};
  async function directAdminMutation(invoke) {
    const client=new DirectPgClient({connectionString:runtimeUrl(DB),ssl:false});
    await client.connect();
    try {
      await client.query("begin");
      await client.query(LOCAL_SERVICE_CONTEXT);
      const result=await invoke(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try { await client.query("rollback"); } catch (_) {}
      throw error;
    } finally { await client.end(); }
  }
  const EXTEND_CONCURRENT_ID="55555555-5555-4555-8555-555555555552";
  const concurrentExtendBefore=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const concurrentExtends=await Promise.all([
    directAdminMutation(client=>adminContract.studentAction(client,directAdminIdentity,CUST,
      {action:"extend_license",months:1,mutation_id:EXTEND_CONCURRENT_ID},{})),
    directAdminMutation(client=>adminContract.studentAction(client,directAdminIdentity,CUST,
      {action:"extend_license",months:1,mutation_id:EXTEND_CONCURRENT_ID},{})),
  ]);
  const concurrentExtendAfter=psql(
    `select extract(epoch from expires_at) from public.licenses where user_id='${CUST}'`,DB);
  const concurrentExtendIsOneTerm=psql(
    `select (expires_at=to_timestamp(${concurrentExtendBefore})+interval '1 month')::text ` +
    `from public.licenses where user_id='${CUST}'`,DB);
  const concurrentExtendAudit=psql(
    `select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and action='extend_license' and mutation_id='${EXTEND_CONCURRENT_ID}'`,DB);
  report("J13) concurrent extend_license replay commits one entitlement mutation and one audit",
    concurrentExtends.length===2&&concurrentExtends.every(item=>item&&item.action==="extend_license")&&
      concurrentExtendIsOneTerm==="true"&&concurrentExtendAudit==="1",
    {results:concurrentExtends,before:concurrentExtendBefore,after:concurrentExtendAfter,
      exactOneTerm:concurrentExtendIsOneTerm,audit:concurrentExtendAudit});

  /* Keep this fixture in the historical flat/no-join-fee mode while giving the
     quote trigger an authoritative positive SKU price. */
  runtimeServicePsql("update public.app_settings set price_1m=30000", DB);
  const paymentCreated = await call("POST", "/rest/v1/payment_requests",
    { token: custToken, body: { user_id: CUST, kind: "plan_1m", txn_last6: "123456",
      amount_mmk: 30000, screenshot_path: `${CUST}/plan_1m-1.jpg` } });
  const PAYMENT_ID = psql(`select id from public.payment_requests where user_id='${CUST}'`, DB);
  r = await call("PATCH", "/rest/v1/payment_requests?id=eq." +
    PAYMENT_ID,
    { token: custToken, body: { status: "approved" }, headers: { prefer: "return=representation" } });
  const stat = psql("select status||'|'||pricing_mode||'|'||quoted_amount_mmk from public.payment_requests", DB);
  report("K) a customer cannot approve their own payment through the API",
    paymentCreated.status === 201 && PAYMENT_ID.length === 36 &&
    r.status === 200 && Array.isArray(r.json) && r.json.length === 0 &&
    stat === "pending|flat|30000",
    { created: paymentCreated.status, httpStatus: r.status, response: r.json, status: stat });

  r = await call("PATCH", "/rest/v1/payment_requests?id=eq." + PAYMENT_ID,
    { token: ownerToken, body: { status: "approved" }, headers: { prefer: "return=representation" } });
  const statusAfterAdminBearer = psql(
    `select status from public.payment_requests where id='${PAYMENT_ID}'`, DB);
  report("K2) an ordinary admin bearer cannot review another account's payment",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 0 &&
      statusAfterAdminBearer === "pending",
    { status: r.status, response: r.json, paymentStatus: statusAfterAdminBearer });

  r = await call("POST", "/rest/v1/payment_requests",
    { token: custToken, body: { user_id: CUST, kind: "plan_1m", status: "approved", reviewed_by: OWNER, note: "ok" } });
  const paymentRowsAfterForgery = psql(`select count(*) from public.payment_requests where user_id='${CUST}'`, DB);
  report("L) a forged already-approved row is refused",
    r.status >= 400 && paymentRowsAfterForgery === "1",
    { status: r.status, rows: paymentRowsAfterForgery });

  const webPaymentList = await call("GET", "/v1/admin/payment-requests?status=pending&page=1&limit=10", {
    token: ownerToken,
  });
  report("L2) an owner web-session bearer cannot enter strict payment administration",
    webPaymentList.status === 403 && webPaymentList.json && webPaymentList.json.error === "forbidden",
    { status: webPaymentList.status, body: webPaymentList.json });

  const strictPaymentList = await call("GET",
    "/v1/admin/payment-requests?status=pending&page=1&limit=10", { token: ownerAdminToken });
  const listedPayment = strictPaymentList.json && Array.isArray(strictPaymentList.json.payment_requests)
    ? strictPaymentList.json.payment_requests.find(item=>item.id===PAYMENT_ID) : null;
  report("L3) MFA-verified payment listing returns the bounded server-owned queue contract",
    strictPaymentList.status === 200 && strictPaymentList.json &&
      strictPaymentList.json.page === 1 && strictPaymentList.json.limit === 10 &&
      strictPaymentList.json.total === 1 && listedPayment && listedPayment.status === "pending" &&
      Array.isArray(strictPaymentList.json.configuration_warnings) &&
      strictPaymentList.json.configuration_warnings.length === 0 &&
      listedPayment.proof_available === true &&
      listedPayment.proof_url === `/api/v1/admin/payment-requests/${PAYMENT_ID}/proof` &&
      listedPayment.screenshot_path === undefined,
    { status: strictPaymentList.status, body: strictPaymentList.json });

  runtimeServicePsql("insert into public.app_settings (price_1m) values (99999)", DB);
  const misconfiguredPaymentList = await call("GET",
    "/v1/admin/payment-requests?status=pending&page=1&limit=10", { token: ownerAdminToken });
  const configurationWarnings = misconfiguredPaymentList.json &&
    misconfiguredPaymentList.json.configuration_warnings;
  runtimeServicePsql("delete from public.app_settings where price_1m=99999", DB);
  const restoredSettingsCount = psql("select count(*) from public.app_settings", DB);
  report("L3b) payment listing warns without exposing settings when the singleton row count drifts",
    misconfiguredPaymentList.status === 200 && Array.isArray(configurationWarnings) &&
      configurationWarnings.length === 1 &&
      configurationWarnings[0].code === "app_settings_row_count" &&
      configurationWarnings[0].count === 2 && restoredSettingsCount === "1",
    { status: misconfiguredPaymentList.status, warnings: configurationWarnings,
      restoredSettingsCount });

  const strictReview = await call("POST", `/v1/admin/payment-requests/${PAYMENT_ID}/review`, {
    token: ownerAdminToken,
    body: { status: "approved", note: "Bank transfer and proof verified" },
  });
  const reviewEvidence = psql(
    `select r.status||'|'||(r.reviewed_by='${OWNER}')::text||'|'||` +
    `(r.reviewed_at is not null)::text||'|'||p.plan_status||'|'||p.account_status||'|'||` +
    `(p.plan_expires_at>now())::text||'|'||` +
    `(select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and target_user_id='${CUST}' and action='review_payment' ` +
    `and details->>'payment_request_id'='${PAYMENT_ID}')::text ` +
    `from public.payment_requests r join public.profiles p on p.id=r.user_id ` +
    `where r.id='${PAYMENT_ID}'`, DB);
  report("L4) strict review atomically stamps the reviewer, applies entitlement and audits",
    strictReview.status === 200 && strictReview.json && strictReview.json.payment_request &&
      strictReview.json.payment_request.status === "approved" &&
      reviewEvidence === "approved|true|true|active|active|true|1",
    { status: strictReview.status, body: strictReview.json, evidence: reviewEvidence });

  const replayReview = await call("POST", `/v1/admin/payment-requests/${PAYMENT_ID}/review`, {
    token: ownerAdminToken,
    body: { status: "rejected", note: "Duplicate review attempt" },
  });
  const replayEvidence = psql(
    `select r.status||'|'||(select count(*) from public.admin_audit_logs ` +
    `where actor_user_id='${OWNER}' and target_user_id='${CUST}' and action='review_payment' ` +
    `and details->>'payment_request_id'='${PAYMENT_ID}')::text ` +
    `from public.payment_requests r where r.id='${PAYMENT_ID}'`, DB);
  report("L5) a reviewed payment replays as 409 without a second transition or audit",
    replayReview.status === 409 && replayReview.json &&
      replayReview.json.error === "payment_already_reviewed" && replayEvidence === "approved|1",
    { status: replayReview.status, body: replayReview.json, evidence: replayEvidence });

  const paymentHistory = await call("GET",
    "/v1/admin/payment-requests?status=history&page=1&limit=10", { token: ownerAdminToken });
  report("L6) payment history maps to approved and rejected terminal requests",
    paymentHistory.status === 200 && paymentHistory.json &&
      Array.isArray(paymentHistory.json.payment_requests) &&
      paymentHistory.json.payment_requests.some(item=>item.id===PAYMENT_ID&&item.status==="approved"),
    { status: paymentHistory.status, body: paymentHistory.json });

  const expiryBeforeGrant = psql(
    `select extract(epoch from plan_expires_at)::bigint from public.profiles where id='${CUST}'`, DB);
  const grantExpiryBeforeExact=psql(
    `select extract(epoch from plan_expires_at) from public.profiles where id='${CUST}'`,DB);
  const GRANT_REPLAY_ID="66666666-6666-4666-8666-666666666661";
  const strictGrant = await call("POST", "/v1/admin/payment-grants", {
    token: ownerAdminToken,
    body: { email: cust.email, kind: "plan_3m", note: "Three-month scholarship",
      mutation_id:GRANT_REPLAY_ID },
  });
  const strictGrantId = strictGrant.json && strictGrant.json.payment_request &&
    /^[0-9a-f-]{36}$/i.test(String(strictGrant.json.payment_request.id||""))
    ? strictGrant.json.payment_request.id : "00000000-0000-0000-0000-000000000000";
  const grantEvidence = psql(
    `select r.status||'|'||r.is_grant::text||'|'||(r.reviewed_by='${OWNER}')::text||'|'||` +
    `(r.reviewed_at is not null)::text||'|'||r.pricing_mode||'|'||r.quoted_amount_mmk::text||'|'||` +
    `p.plan_status||'|'||(extract(epoch from p.plan_expires_at)::bigint>${expiryBeforeGrant})::text||'|'||` +
    `(select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and target_user_id='${CUST}' and action='grant_payment' ` +
    `and details->>'payment_request_id'='${strictGrantId}')::text ` +
    `from public.payment_requests r join public.profiles p on p.id=r.user_id ` +
    `where r.id='${strictGrantId}'`, DB);
  report("L7) a strict grant atomically approves, extends entitlement and writes one audit row",
    strictGrant.status === 201 && strictGrant.json && strictGrant.json.payment_request &&
      strictGrant.json.payment_request.status === "approved" &&
      grantEvidence === "approved|true|true|true|grant|0|active|true|1",
    { status: strictGrant.status, body: strictGrant.json, evidence: grantEvidence });

  const grantExpiryFirst=psql(
    `select extract(epoch from plan_expires_at) from public.profiles where id='${CUST}'`,DB);
  const grantFirstIsOneTerm=psql(
    `select (plan_expires_at=to_timestamp(${grantExpiryBeforeExact})+interval '3 months')::text ` +
    `from public.profiles where id='${CUST}'`,DB);
  const grantReplay=await call("POST","/v1/admin/payment-grants",{
    token:ownerAdminToken,
    body:{email:cust.email,kind:"plan_3m",note:"Three-month scholarship",mutation_id:GRANT_REPLAY_ID},
  });
  const grantExpiryReplay=psql(
    `select extract(epoch from plan_expires_at) from public.profiles where id='${CUST}'`,DB);
  const grantReplayEvidence=psql(
    `select (select count(*) from public.payment_requests where id='${strictGrantId}')||'|'||` +
    `(select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and action='grant_payment' and mutation_id='${GRANT_REPLAY_ID}')`,DB);
  report("L8) sequential grantPayment replay returns the original grant without extending twice",
    grantReplay.status===201&&grantReplay.json&&grantReplay.json.payment_request&&
      grantReplay.json.payment_request.id===strictGrantId&&grantFirstIsOneTerm==="true"&&
      grantExpiryReplay===grantExpiryFirst&&
      grantReplayEvidence==="1|1",
    {replay:grantReplay,firstExpiry:grantExpiryFirst,replayExpiry:grantExpiryReplay,
      exactOneTerm:grantFirstIsOneTerm,
      evidence:grantReplayEvidence});

  const GRANT_CONCURRENT_ID="66666666-6666-4666-8666-666666666662";
  const concurrentGrantBefore=grantExpiryReplay;
  const concurrentGrants=await Promise.all([
    directAdminMutation(client=>adminContract.grantPayment(client,directAdminIdentity,
      {email:cust.email,kind:"plan_1m",note:"Concurrent scholarship",mutation_id:GRANT_CONCURRENT_ID},{})),
    directAdminMutation(client=>adminContract.grantPayment(client,directAdminIdentity,
      {email:cust.email,kind:"plan_1m",note:"Concurrent scholarship",mutation_id:GRANT_CONCURRENT_ID},{})),
  ]);
  const concurrentGrantIds=concurrentGrants.map(item=>item&&item.payment_request&&item.payment_request.id);
  const concurrentGrantAfter=psql(
    `select extract(epoch from plan_expires_at) from public.profiles where id='${CUST}'`,DB);
  const concurrentGrantIsOneTerm=psql(
    `select (plan_expires_at=to_timestamp(${concurrentGrantBefore})+interval '1 month')::text ` +
    `from public.profiles where id='${CUST}'`,DB);
  const concurrentGrantEvidence=psql(
    `select (select count(*) from public.payment_requests where id='${concurrentGrantIds[0]}')||'|'||` +
    `(select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and action='grant_payment' and mutation_id='${GRANT_CONCURRENT_ID}')`,DB);
  report("L9) concurrent grantPayment replay creates one payment, one extension and one audit",
    concurrentGrantIds.length===2&&concurrentGrantIds[0]&&
      concurrentGrantIds[0]===concurrentGrantIds[1]&&
      concurrentGrantIsOneTerm==="true"&&concurrentGrantEvidence==="1|1",
    {ids:concurrentGrantIds,before:concurrentGrantBefore,after:concurrentGrantAfter,
      exactOneTerm:concurrentGrantIsOneTerm,evidence:concurrentGrantEvidence});

  r = await call("GET", "/rest/v1/app_settings?select=*&limit=50");
  report("M) anon may read app_settings (the buy screen quotes prices signed out)",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 1,
    { status: r.status, rows: Array.isArray(r.json) ? r.json.length : null });

  r = await call("PATCH", "/rest/v1/app_settings?price_1m=eq.30000", { body: { payment_phone: "09-ATTACKER" } });
  const phone = psql("select coalesce(payment_phone,'(null)') from public.app_settings", DB);
  report("N) anon cannot redirect the payment details",
    (r.status === 200 || r.status === 403) && phone === "(null)",
    { httpStatus: r.status, phone });

  r = await call("PATCH", "/rest/v1/app_settings?price_1m=eq.30000", { token: custToken, body: { price_1m: 1 } });
  const price = psql("select coalesce(price_1m::text,'(null)') from public.app_settings", DB);
  report("O) a signed-in customer cannot rewrite prices either",
    (r.status === 200 || r.status === 403) && price === "30000",
    { httpStatus: r.status, price });

  /* ---- tokens ---- */
  /* A bad token must not authenticate. Whether that surfaces as 403 (the anon
     role may not read profiles at all) or as 200 with an empty array does not
     matter; what matters is that no row comes back. Asserting the leak rather
     than the status keeps this honest if the mapping changes. */
  const leaked = res => Array.isArray(res.json) && res.json.length > 0;

  r = await call("GET", "/rest/v1/profiles?select=*", { token: custToken + "x" });
  report("P) a tampered token authenticates nobody and leaks no row",
    r.status !== 500 && !leaked(r), { status: r.status, body: r.json });

  const forged = require(path.join(ROOT, "server", "lib", "crypto"))
    .signToken({ sub: OWNER }, "wrong-api-signing-secret-with-32-bytes", 3600).token;
  r = await call("GET", "/rest/v1/profiles?select=*", { token: forged });
  report("Q) a token signed with the wrong secret grants nothing",
    r.status !== 500 && !leaked(r), { status: r.status, body: r.json });

  /* Signature-valid JWT fields still are attacker-controlled data. Only sub is
     accepted from the verified token; role, admin state and email are derived
     or fixed by db.js before any request query runs. */
  const forgedTrustedClaims = require(path.join(ROOT, "server", "lib", "crypto"))
    .signToken({ sub: CUST, sid: custSession.session_id,
      role: "service_role", is_admin: true, email: owner.email },
      process.env.JWT_SECRET, 3600).token;
  r = await call("GET", "/rest/v1/profiles?select=*", { token: forgedTrustedClaims });
  report("Q2) signed-but-forged service_role/is_admin claims cannot widen customer access",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 1 && r.json[0].id === CUST,
    { status: r.status, rows: r.json });

  r = await call("PATCH", "/rest/v1/app_settings?price_1m=eq.30000",
    { token: forgedTrustedClaims, body: { price_1m: 1 } });
  const priceAfterForgedClaims = psql(
    "select coalesce(price_1m::text,'(null)') from public.app_settings", DB);
  report("Q3) signed-but-forged service_role/is_admin claims cannot rewrite settings",
    (r.status === 200 || r.status === 403) && priceAfterForgedClaims === "30000",
    { status: r.status, price: priceAfterForgedClaims });

  const forgedClaimsWithoutSubject = require(path.join(ROOT, "server", "lib", "crypto"))
    .signToken({ role: "service_role", is_admin: true, email: owner.email },
      process.env.JWT_SECRET, 3600).token;
  r = await call("GET", "/rest/v1/profiles?select=*", { token: forgedClaimsWithoutSubject });
  report("Q4) signed service/admin claims without a valid subject authenticate nobody",
    r.status !== 500 && !leaked(r), { status: r.status, body: r.json });

  /* ---- injection through identifiers ---- */
  r = await call("GET", "/rest/v1/profiles?select=id,email);drop%20table%20public.devices;--", { token: custToken });
  const devicesAlive = psql("select count(*) from pg_tables where tablename='devices'", DB);
  report("R) an identifier that is not a real column is refused, and nothing is dropped",
    r.status === 400 && devicesAlive === "1", { status: r.status, devicesTable: devicesAlive });

  r = await call("GET", "/rest/v1/pg_shadow?select=*", { token: custToken });
  report("S) a table outside the allowlist is refused", r.status === 404, { status: r.status });

  r = await call("GET", "/rest/v1/profiles?id=gt.0", { token: custToken });
  report("T) an unsupported operator is refused rather than ignored", r.status === 400, { status: r.status });

  /* ---- storage ---- */
  const boundary = "----hnk";
  const proofBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    proofBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  r = await call("POST", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`,
    { token: custToken, raw: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-upsert": "true" } });
  report("U) a customer can upload a proof into their own folder", r.status === 200, { status: r.status, text: r.text.slice(0, 90) });

  r = await call("GET", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`, { token: custToken });
  report("U2) a customer can read their own payment proof", r.status === 200, { status: r.status });

  const webProof = await call("GET", `/v1/admin/payment-requests/${PAYMENT_ID}/proof`, {
    token: ownerToken,
  });
  const proofAuditAfterWebDenial = psql(
    `select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and target_user_id='${CUST}' and action='view_payment_proof'`, DB);
  report("U3) an owner web-session bearer cannot read proof through the strict admin route",
    webProof.status === 403 && proofAuditAfterWebDenial === "0",
    { status: webProof.status, body: webProof.json, auditRows: proofAuditAfterWebDenial });

  const strictProof = await call("GET", `/v1/admin/payment-requests/${PAYMENT_ID}/proof`, {
    token: ownerAdminToken,
  });
  const proofAudit = psql(
    `select count(*) from public.admin_audit_logs where actor_user_id='${OWNER}' ` +
    `and target_user_id='${CUST}' and action='view_payment_proof' ` +
    `and details->>'payment_request_id'='${PAYMENT_ID}'`, DB);
  report("U4) MFA-verified proof retrieval returns the exact private bytes and audits the view",
    strictProof.status === 200 && strictProof.bytes.equals(proofBytes) &&
      strictProof.headers["content-type"] === "image/jpeg" &&
      /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s*,|$)/i.test(strictProof.headers["cache-control"]||"") &&
      strictProof.headers["x-content-type-options"] === "nosniff" &&
      strictProof.headers["content-length"] === String(proofBytes.length) && proofAudit === "1",
    { status: strictProof.status, headers: strictProof.headers,
      bytes: strictProof.bytes.toString("hex"), auditRows: proofAudit });

  const unsafePaymentCreated = await call("POST", "/rest/v1/payment_requests", {
    token: custToken,
    body: { user_id: CUST, kind: "plan_1m", txn_last6: "654321", amount_mmk: 30000,
      screenshot_path: `${CUST}/unsafe.svg` },
  });
  const unsafePaymentId = psql(
    `select id from public.payment_requests where screenshot_path='${CUST}/unsafe.svg'`, DB);
  runtimeServicePsql(
    `insert into public.hnk_storage_objects (bucket_id,name,owner,mime_type,data) values (` +
    `'payment-proofs','${CUST}/unsafe.svg','${CUST}','image/svg+xml',decode('3c7376672f3e','hex'))`, DB);
  const unsafeProof = await call("GET", `/v1/admin/payment-requests/${unsafePaymentId}/proof`, {
    token: ownerAdminToken,
  });
  const unsafeProofAudit = psql(
    `select count(*) from public.admin_audit_logs where action='view_payment_proof' ` +
    `and details->>'payment_request_id'='${unsafePaymentId}'`, DB);
  report("U5) strict proof retrieval rejects active stored MIME before bytes or audit",
    unsafePaymentCreated.status === 201 && unsafePaymentId.length === 36 &&
      unsafeProof.status === 415 && unsafeProof.json &&
      unsafeProof.json.error === "unsupported_payment_proof_type" && unsafeProofAudit === "0",
    { created: unsafePaymentCreated.status, status: unsafeProof.status,
      body: unsafeProof.json, auditRows: unsafeProofAudit });

  const largePaymentCreated = await call("POST", "/rest/v1/payment_requests", {
    token: custToken,
    body: { user_id: CUST, kind: "plan_1m", txn_last6: "777777", amount_mmk: 30000,
      screenshot_path: `${CUST}/large.jpg` },
  });
  const largePaymentId = psql(
    `select id from public.payment_requests where screenshot_path='${CUST}/large.jpg'`, DB);
  runtimeServicePsql(
    `insert into public.hnk_storage_objects (bucket_id,name,owner,mime_type,data) values (` +
    `'payment-proofs','${CUST}/large.jpg','${CUST}','image/jpeg',decode(repeat('00',1025),'hex'))`, DB);
  const largeProof = await call("GET", `/v1/admin/payment-requests/${largePaymentId}/proof`, {
    token: ownerAdminToken,
  });
  const largeProofAudit = psql(
    `select count(*) from public.admin_audit_logs where action='view_payment_proof' ` +
    `and details->>'payment_request_id'='${largePaymentId}'`, DB);
  report("U6) strict proof retrieval rejects a stored object above the response cap before audit",
    largePaymentCreated.status === 201 && largePaymentId.length === 36 &&
      largeProof.status === 413 && largeProof.json &&
      largeProof.json.error === "payment_proof_too_large" && largeProofAudit === "0",
    { created: largePaymentCreated.status, status: largeProof.status,
      body: largeProof.json, auditRows: largeProofAudit });

  r = await call("POST", `/storage/v1/object/payment-proofs/${OWNER}/stolen.jpg`,
    { token: custToken, raw: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-upsert": "true" } });
  report("V) a customer cannot upload into another user's folder", r.status >= 400, { status: r.status });

  r = await call("GET", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`, { token: ownerToken });
  report("W) an ordinary admin bearer cannot read a customer's proof",
    r.status === 404, { status: r.status });

  /* a second customer must not */
  const other = { email: "other@example.test", password: "otherpass123" };
  const otherToken = (await call("POST", "/auth/v1/signup", { body: other })).json.access_token;
  r = await call("GET", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`, { token: otherToken });
  report("X) another customer cannot read that proof", r.status === 404, { status: r.status });

  /* ---- refresh and logout ---- */
  r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: custSession.refresh_token } });
  const refreshed = r.json;
  report("Y) a refresh token exchanges for a new session", r.status === 200 && !!refreshed.access_token, { status: r.status });

  r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: custSession.refresh_token } });
  report("Y2) the spent refresh token cannot be replayed", r.status === 400, { status: r.status });

  await call("POST", "/auth/v1/logout", { token: refreshed.access_token, body: { refresh_token: refreshed.refresh_token } });
  r = await call("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: refreshed.refresh_token } });
  report("Z) logout revokes the refresh token server-side", r.status === 400, { status: r.status });

  /* ================= /health when the database is gone =================
     WHY THIS IS HERE. A DigitalOcean deploy answered
     {"ok":true,"schema":null,"ready":false} and said nothing at all about why,
     and reading App Platform's runtime logs from a phone is a genuine
     obstacle. /health has to name the cause, and must never name it with the
     password attached — it is a public endpoint. */
  const mig = require(path.join(ROOT, "server", "lib", "migrate.js"));
  mig.setLastError("could not connect to postgres://doadmin:AVNS_secret@db.ondigitalocean.com:25060/defaultdb");
  const redacted = mig.getLastError();
  report("H1) a connection string in the reason is redacted before /health can show it",
    !/AVNS_secret/.test(redacted) && !/doadmin/.test(redacted), redacted);

  r = await call("GET", "/health");
  report("H2) a stale error stops being reported once the database answers again",
    r.json && r.json.schema === 4 && r.json.error === undefined, r.json);
  mig.setLastError("");

  /* Booted as child processes, because this one already holds a working pool.
     Each starts the real server with a broken DATABASE_URL and is asked the
     same question the owner asks from a phone: what is wrong? */
  let childPort = PORT;
  function waitForChildExit(child, timeoutMs) {
    return new Promise(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
      let settled = false;
      const finish = exited => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeListener("exit", onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      child.once("exit", onExit);
    });
  }

  async function stopChild(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const gracefulExit = waitForChildExit(child, 2000);
    child.kill("SIGTERM");
    if (await gracefulExit) return;

    const forcedExit = waitForChildExit(child, 2000);
    child.kill("SIGKILL");
    if (!await forcedExit) {
      throw new Error("child process " + child.pid + " did not exit after SIGKILL");
    }
  }

  async function bootChild(url, extraEnv, scriptPath) {
    childPort++;
    const port = childPort;
    const child = spawn(process.execPath, [scriptPath || path.join(ROOT, "server", "index.js")], {
      env: Object.assign({}, process.env,
        { DATABASE_URL: url, PGSSLMODE: "disable", PORT: String(port) }, extraEnv || {}),
      stdio: "ignore",
    });
    let health = null;
    for (let i = 0; i < 80; i++) {
      try {
        const candidate = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
        health = candidate;
        /* Listening now deliberately precedes migration. Ignore only this
           explicit transient so success/failure tests observe the settled
           migration result, while a genuinely not-ready result still returns. */
        if (!candidate || candidate.error !== "database schema migration is still applying") break;
      } catch (_) { /* process has not opened its port yet */ }
      await new Promise(done => setTimeout(done, 250));
    }
    return { port, health, stop: () => stopChild(child) };
  }
  async function healthWith(url, extraEnv) {
    const boot = await bootChild(url, extraEnv);
    await boot.stop();
    return boot.health;
  }

  const dead = await healthWith("postgres://someone:hunter2pw@127.0.0.1:59999/nope");
  report("H3) an unreachable database still BOOTS — exiting would make App Platform roll back",
    !!dead && dead.ok === true && dead.schema === null && dead.ready === false, dead);
  report("H4) ...and /health names the reason instead of leaving it a mystery",
    !!dead && /ECONNREFUSED/.test(dead.error || ""), dead);
  report("H5) ...without the credentials that reason arrived with",
    !!dead && !!dead.error && !/hunter2pw/.test(JSON.stringify(dead)), dead && dead.error);

  /* The trap this whole section exists for. An App Platform database component
     named anything other than hnk-db leaves ${hnk-db.DATABASE_URL} unsubstituted,
     and pg answers `getaddrinfo ENOTFOUND base` — which names neither the
     database nor the binding. */
  const unbound = await healthWith("${hnk-db.DATABASE_URL}");
  report("H6) an unresolved App Platform binding is diagnosed, not handed to pg to garble",
    !!unbound && /unresolved App Platform binding/.test(unbound.error || "") &&
    /hnk-db\.DATABASE_URL/.test(unbound.error || ""), unbound);

  const unset = await healthWith("");
  report("H7) a DATABASE_URL that was never set says exactly that",
    !!unset && /DATABASE_URL is not set/.test(unset.error || ""), unset);

  /* ...and the same situation is RECOVERED FROM, not merely described. Both .do
     specs bind the URL twice, under `hnk-db` and under `db`, exactly because
     only one of them can resolve — so the second key is the one that carries a
     real URL when the first is text. */
  const REAL = process.env.DATABASE_URL;
  const ALT = "DATABASE_URL_IF_COMPONENT_IS_NAMED_DB";
  const rescued = await healthWith("${hnk-db.DATABASE_URL}", { [ALT]: REAL });
  report("H8) the binding that DID resolve is found and used, not merely reported",
    !!rescued && rescued.schema === 4 && rescued.ready === true &&
    rescued.schemaFingerprint === EXPECTED_SCHEMA_SHA && rescued.error === undefined, rescued);

  const ambiguous = await healthWith("${hnk-db.DATABASE_URL}",
    { [ALT]: REAL, DATABASE_URL_THIRD: "postgres://a:b@127.0.0.1:5432/other" });
  report("H9) two candidates are refused rather than guessed between — the wrong one holds the payments",
    !!ambiguous && ambiguous.ready === false && /guess/.test(ambiguous.error || ""), ambiguous);

  const directAndAlternate = await healthWith(REAL,
    { [ALT]: "postgres://a:b@127.0.0.1:5432/other" });
  report("H9a) a resolved DATABASE_URL does not hide a second resolved candidate",
    !!directAndAlternate && directAndAlternate.ready === false &&
    /DATABASE_URL/.test(directAndAlternate.error || "") &&
    new RegExp(ALT).test(directAndAlternate.error || "") &&
    /guess/.test(directAndAlternate.error || ""), directAndAlternate);

  /* The restriction that makes H8 safe rather than reckless. During a migration
     the OLD database is still live and its URL may still be sitting in the
     environment under some unrelated name; sweeping the whole environment for
     anything postgres-shaped would find it and quietly apply this schema to
     someone else's database. Only keys this spec controls are candidates. */
  const strayed = await healthWith("${hnk-db.DATABASE_URL}", { SUPABASE_DB_URL: REAL });
  report("H9b) a PostgreSQL URL under an unrelated key is NOT adopted — it could be the old database",
    !!strayed && strayed.ready === false &&
    /unresolved App Platform binding/.test(strayed.error || ""), strayed);

  /* Four table names alone are not proof that this running build applied their
     current columns, policies and triggers. A skipped migration against the
     already-populated fixture must therefore remain not-ready. */
  const skippedBoot = await bootChild(REAL, { SKIP_MIGRATE: "1" });
  const skipped = skippedBoot.health;
  let skippedRoute = null;
  try {
    const response = await fetch(`http://127.0.0.1:${skippedBoot.port}/rest/v1/app_settings`);
    skippedRoute = { status: response.status, body: await response.json().catch(() => null) };
  } catch (err) { skippedRoute = { status: 0, error: err.message }; }
  await skippedBoot.stop();
  report("H9c) four existing tables without this process applying the tracked schema are not ready",
    !!skipped && skipped.schema === 4 && skipped.ready === false &&
    skipped.schemaFingerprint === null && skippedRoute.status === 503 &&
    skippedRoute.body && skippedRoute.body.error === "schema_incomplete",
    { health: skipped, route: skippedRoute });

  /* ============ a schema that failed PARTWAY through ============
     The other half of the same lesson. A migration that never reached the
     database has applied nothing and is safe to boot from; one that stopped
     midway may have left tables whose policies were never created, and
     answering a query against those is worse than answering nothing. Exiting
     is worse still — App Platform rolls the deployment back and the reason
     stops being reachable at all, which is exactly how the previous failure
     stayed a mystery.

     Reproduced, not simulated: a `profiles` table that already exists with the
     wrong shape makes `create table if not exists` a no-op and the statements
     after it fail, with platform.sql already applied. */
  const PARTIAL = DB + "_partial";
  createRuntimeDatabase(PARTIAL);
  runtimeServicePsql("create table public.profiles (id int); " +
                     "create table public.payment_requests (id int); " +
                     "create table public.app_settings (id int); " +
                     "create table public.devices (id int);", PARTIAL);
  const partial = await bootChild(runtimeUrl(PARTIAL));
  report("H10) a half-applied schema still boots, so the reason stays readable",
    !!partial.health && partial.health.ok === true && partial.health.schema === 4 &&
    partial.health.ready === false && partial.health.schemaFingerprint === null &&
    !!partial.health.error, partial.health);

  /* Asked through a helper that survives a child which never came up, so a
     regression here reports as a FAIL rather than a stack trace that hides the
     checks after it. */
  const askPartial = async (p2, init) => {
    try {
      const rr = await fetch(`http://127.0.0.1:${partial.port}${p2}`, init);
      return { status: rr.status, body: await rr.json().catch(() => null) };
    } catch (err) { return { status: 0, body: null, error: err.message }; }
  };

  const refused = await askPartial("/auth/v1/token?grant_type=password",
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "someone@example.test", password: "hunter2hunter" }) });
  report("H11) ...and every route that touches the database answers 503 instead of querying it",
    refused.status === 503 && !!refused.body && refused.body.error === "schema_incomplete", refused);

  const stillAnswers = await askPartial("/health");
  report("H12) ...while /health itself keeps answering — it is the only way in",
    !!stillAnswers.body && stillAnswers.body.ok === true && stillAnswers.body.ready === false,
    stillAnswers);
  await partial.stop();
  psql(`drop database if exists ${PARTIAL}`);

  /* ============ TLS to the database ============
     Tested against resolveSsl() directly because the pool reads it once, at
     require time, and its config is otherwise unobservable from outside — but
     it IS the function that decides, not a copy of the logic. */
  const { resolveSsl } = require(path.join(ROOT, "server", "lib", "db"));
  /* A genuine certificate, generated rather than pasted.
     The fixture this replaces was the literal string "-----BEGIN
     CERTIFICATE-----\\nMIIBfake\\n-----END CERTIFICATE-----": it satisfied the
     old `BEGIN CERTIFICATE` test and parses as nothing, so S2 was asserting
     that a NON-certificate gets trusted as a CA — the exact defect that took
     production down, written into the check meant to catch it. */
  const PEM = execFileSync("openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "/dev/null",
     "-subj", "/CN=verify-api-service", "-days", "1"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const OTHER_PEM = execFileSync("openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "/dev/null",
     "-subj", "/CN=wrong-database", "-days", "1"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const sslWith = env => {
    const saved = {};
    for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
    const saveMode = process.env.PGSSLMODE;
    if (!("PGSSLMODE" in env)) delete process.env.PGSSLMODE;
    let out;
    try { out = resolveSsl(); } finally {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
      if (saveMode === undefined) delete process.env.PGSSLMODE; else process.env.PGSSLMODE = saveMode;
    }
    return out;
  };

  const literal = sslWith({ DATABASE_CA_CERT: "${hnk-db.CA_CERT}" });
  report("S1) an unresolved CA binding is NOT trusted as a certificate — that cost a whole deploy",
    !!literal && literal.rejectUnauthorized === false && literal.ca === undefined, literal);

  const bound = sslWith({
    DATABASE_URL: "${hnk-db.DATABASE_URL}",
    [ALT]: REAL,
    DATABASE_CA_CERT: OTHER_PEM,
    DATABASE_CA_CERT_IF_COMPONENT_IS_NAMED_DB: PEM,
  });
  report("S2) the CA paired with the resolved URL binding is used, not another database's CA",
    !!bound && bound.rejectUnauthorized === true && bound.ca === PEM, bound);

  const unpaired = sslWith({
    DATABASE_URL: "${hnk-db.DATABASE_URL}",
    [ALT]: REAL,
    DATABASE_CA_CERT: PEM,
    DATABASE_CA_CERT_IF_COMPONENT_IS_NAMED_DB: "${db.CA_CERT}",
  });
  report("S2b) a usable CA for an unresolved URL binding is not borrowed for the selected database",
    !!unpaired && unpaired.rejectUnauthorized === false && unpaired.ca === undefined, unpaired);

  const stray = sslWith({ DATABASE_CA_CERT: "${hnk-db.CA_CERT}", PROXY_CA_CERT: PEM });
  report("S3) a certificate under an unrelated key is not adopted — the wrong CA refuses every connection",
    !!stray && stray.rejectUnauthorized === false && stray.ca === undefined, stray);

  report("S4) PGSSLMODE=disable still turns TLS off for a local database",
    sslWith({ PGSSLMODE: "disable", DATABASE_CA_CERT: PEM }) === false);

  /* ---- the one that took production down ----
     `BEGIN CERTIFICATE` is not the same test as "is a usable CA". A PEM carried
     through a layer that escaped its newlines contains the phrase and parses as
     nothing, so pg is handed a trust anchor that anchors nothing and every
     handshake is refused as `self-signed certificate in certificate chain` — an
     error naming the server's chain rather than our own broken input. */
  const dbModule = require(path.join(ROOT, "server", "lib", "db"));
  const { usableCa } = dbModule;
  const REAL_PEM = PEM;

  /* Asserts the RESULT parses, not merely that something was returned. An
     earlier version of these three checked only for non-null and passed with
     the repair and the parse both removed — certifying that a string which
     anchors nothing is a usable CA, which is the defect itself. */
  const parses = value => {
    if (!value) return false;
    try { new crypto.X509Certificate(value); return true; } catch (_) { return false; }
  };
  report("S5) a real certificate is accepted, and what comes back is a real certificate",
    parses(usableCa(REAL_PEM)));
  report("S6) a certificate whose newlines were escaped is REPAIRED into a usable one",
    parses(usableCa(REAL_PEM.replace(/\n/g, "\\n"))));
  report("S7) a base64-wrapped certificate is decoded into a usable one",
    parses(usableCa(Buffer.from(REAL_PEM).toString("base64"))));
  report("S8) text that merely contains the phrase is NOT a certificate",
    usableCa("BEGIN CERTIFICATE but not really") === null &&
    usableCa("${hnk-db.CA_CERT}") === null && usableCa("") === null);

  const unusable = sslWith({ DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\nnot base64 at all\n-----END CERTIFICATE-----" });
  report("S9) an unusable certificate connects UNVERIFIED rather than refusing every connection",
    !!unusable && unusable.rejectUnauthorized === false && unusable.ca === undefined, unusable);
  report("S10) ...and that downgrade is recorded so /health can report it",
    /could not be parsed/.test(dbModule.getTlsNote() || ""), dbModule.getTlsNote());

  /* ---- the failure PARSING cannot catch ----
     A certificate can be perfectly well-formed and simply not this database's
     CA. That refuses every connection forever and looks identical from outside,
     so it can only be told apart at the moment the handshake fails. Verified
     end to end against a real TLS PostgreSQL serving a chain signed by one root
     while the service was given a different, entirely valid root: it connects,
     and /health reports `unverified — ... (SELF_SIGNED_CERT_IN_CHAIN)`. That
     rig needs a TLS-enabled server, which the CI postgres service is not, so
     what runs here is the decision itself. */
  const savedSsl = dbModule.pool.options.ssl;
  dbModule.pool.options.ssl = { rejectUnauthorized: true };
  const certErr = Object.assign(new Error("self-signed certificate in certificate chain"),
    { code: "SELF_SIGNED_CERT_IN_CHAIN" });
  const savedUnverifiedOverride=process.env.ALLOW_UNVERIFIED_DB_TLS;
  delete process.env.ALLOW_UNVERIFIED_DB_TLS;
  report("S11) production refuses to downgrade after certificate verification fails",
    dbModule.downgradeTlsAfter(certErr) === false &&
    dbModule.pool.options.ssl.rejectUnauthorized === true,
    dbModule.pool.options.ssl);
  process.env.ALLOW_UNVERIFIED_DB_TLS="1";
  report("S12) an explicit local/test override may stand down from verification",
    dbModule.downgradeTlsAfter(certErr) === true &&
    dbModule.pool.options.ssl.rejectUnauthorized === false,
    dbModule.pool.options.ssl);
  report("S12b) ...and says so, naming the code, so the downgrade is never silent",
    /SELF_SIGNED_CERT_IN_CHAIN/.test(dbModule.getTlsNote() || "") &&
    /UNVERIFIED/.test(dbModule.getTlsNote() || ""), dbModule.getTlsNote());
  report("S13) ...and does not downgrade again once already unverified",
    dbModule.downgradeTlsAfter(certErr) === false);

  dbModule.pool.options.ssl = { rejectUnauthorized: true };
  const downErr = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    { code: "ECONNREFUSED" });
  report("S14) a database that is merely DOWN is not a certificate problem and keeps verifying",
    dbModule.downgradeTlsAfter(downErr) === false &&
    dbModule.pool.options.ssl.rejectUnauthorized === true,
    dbModule.pool.options.ssl);
  report("S15) /health reports the TLS state in every case, not only the bad ones",
    dbModule.tlsState() === "verified", dbModule.tlsState());
  dbModule.pool.options.ssl = savedSsl;
  if (savedUnverifiedOverride===undefined) delete process.env.ALLOW_UNVERIFIED_DB_TLS;
  else process.env.ALLOW_UNVERIFIED_DB_TLS=savedUnverifiedOverride;

  /* ---- the check that was missing, and why ----
     Asserting on pool.options.ssl passes while the driver ignores it. pg builds
     every connection with `new Client(pool.options)`, and Client re-parses
     connectionString and lets sslmode there REPLACE the ssl config. So a URL
     ending `?sslmode=require` — what DigitalOcean hands out — discards
     { ca, rejectUnauthorized } silently, and pg-connection-string treats
     `require` as an alias for `verify-full`: the mode that reads like "encrypt
     this" means "verify it fully". The CA never reached the driver, so every
     handshake failed on the server's chain, for a parameter in our own URL.
     These assert what a CLIENT receives, which is the only thing that matters. */
  const clientSsl = url => {
    const throwaway = new dbModule.pool.constructor(
      { connectionString: url, ssl: { rejectUnauthorized: false } });
    const effective = new throwaway.Client(throwaway.options).connectionParameters.ssl;
    throwaway.end().catch(() => {});
    return effective;
  };
  const WITH_MODE = "postgres://u:p@h:5432/d?sslmode=require";

  report("U1) sslmode is removed from the connection string, wherever it sits",
    dbModule.stripSslMode(WITH_MODE).url === "postgres://u:p@h:5432/d" &&
    dbModule.stripSslMode("postgres://u:p@h:5432/d?sslmode=verify-full&pool=x").url ===
      "postgres://u:p@h:5432/d?pool=x" &&
    dbModule.stripSslMode("postgres://u:p@h:5432/d?a=1&sslmode=require").url ===
      "postgres://u:p@h:5432/d?a=1");
  report("U2) a URL that never had one is left alone",
    dbModule.stripSslMode("postgres://u:p@h:5432/d").url === "postgres://u:p@h:5432/d" &&
    dbModule.stripSslMode("postgres://u:p@h:5432/d").stripped === null);

  const kept = clientSsl(WITH_MODE);
  report("U3) left in, sslmode makes the DRIVER discard our ssl config — this is the bug",
    !!kept && kept.rejectUnauthorized === undefined, kept);
  const stripped = clientSsl(dbModule.stripSslMode(WITH_MODE).url);
  report("U4) stripped, the driver keeps it — which is what makes the CA and the downgrade real",
    !!stripped && stripped.rejectUnauthorized === false, stripped);

  /* ============ a database that was not ready yet ============
     A DigitalOcean development database is created WITH the app and takes
     minutes to provision. One attempt was all there was, so a container that
     booted first sat there reporting schema:null forever — the database
     becoming ready a minute later changed nothing, because nothing looked
     again and nothing restarts the container.

     Driven for real: the service is started against a database that does not
     exist, the database is then created underneath it, and the service has to
     notice by itself. */
  const LATE = DB + "_late";
  psql(`drop database if exists ${LATE}`);
  const late = await bootChild(runtimeUrl(LATE));
  report("H13) a database that does not exist yet still boots, and says so",
    !!late.health && late.health.ok === true && late.health.ready === false &&
    /does not exist/.test(late.health.error || ""), late.health);

  createRuntimeDatabase(LATE);
  let recovered = null;
  for (let i = 0; i < 45 && !recovered; i++) {
    await new Promise(done => setTimeout(done, 1000));
    try {
      const h = await (await fetch(`http://127.0.0.1:${late.port}/health`)).json();
      if (h && h.ready === true) recovered = h;
    } catch (_) { /* mid-restart of nothing; keep looking */ }
  }
  report("H14) ...and applies the schema itself once it appears, with no restart and nobody watching",
    !!recovered && recovered.schema === 4 && recovered.schemaFingerprint === EXPECTED_SCHEMA_SHA &&
    recovered.error === undefined, recovered);
  await late.stop();
  psql(`drop database if exists ${LATE}`);

  /* ============ DDL lock during a zero-downtime deploy ============
     Keep an old-style read transaction open on profiles while a new process
     applies the idempotent schema. The migration must time out instead of
     owning startup forever, liveness must keep answering, readiness must keep
     traffic on the old instance, and the retry must converge after release. */
  const LOCKED = DB + "_locked";
  createRuntimeDatabase(LOCKED);
  applyRuntimeSchema(LOCKED);
  const lockedUrl = runtimeUrl(LOCKED);
  const { Client } = require(path.join(ROOT, "server", "node_modules", "pg"));
  const locker = new Client({ connectionString: lockedUrl, ssl: false });
  await locker.connect();
  await locker.query("begin");
  await locker.query("lock table public.profiles in access share mode");
  const lockBoot = await bootChild(lockedUrl, {
    MIGRATION_LOCK_TIMEOUT_MS: "200",
    MIGRATION_STATEMENT_TIMEOUT_MS: "5000",
  });
  const lockLiveResponse = await fetch(`http://127.0.0.1:${lockBoot.port}/live`);
  const lockReadyResponse = await fetch(`http://127.0.0.1:${lockBoot.port}/ready`);
  const lockReadyBody = await lockReadyResponse.json().catch(() => null);
  report("H14b) a conflicting DDL lock is bounded instead of owning startup",
    !!lockBoot.health && lockBoot.health.ready === false &&
    /lock timeout/i.test(lockBoot.health.error || ""), lockBoot.health);
  report("H14c) liveness stays 200 while readiness keeps traffic off the locked process",
    lockLiveResponse.status === 200 && lockReadyResponse.status === 503 &&
    lockReadyBody && lockReadyBody.ready === false,
    { live: lockLiveResponse.status, ready: lockReadyResponse.status, body: lockReadyBody });

  await locker.query("commit");
  let lockRecovered = null;
  for (let i = 0; i < 40 && !lockRecovered; i++) {
    await new Promise(done => setTimeout(done, 250));
    try {
      const response = await fetch(`http://127.0.0.1:${lockBoot.port}/ready`);
      const body = await response.json();
      if (response.status === 200 && body.ready === true) lockRecovered = body;
    } catch (_) { /* retry is still applying */ }
  }
  report("H14d) releasing the old transaction lets the migration retry reach readiness",
    !!lockRecovered && lockRecovered.apiVersion === EXPECTED_API_VERSION,
    lockRecovered);
  await lockBoot.stop();
  await locker.end();
  psql(`drop database if exists ${LOCKED}`);

  /* H15) Copy /server into an isolated directory: this is the exact App
     Platform source_dir shape. Its tracked DigitalOcean dialect must be
     sufficient by itself and must never depend on a sibling Supabase file. */
  const PACKAGED = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-packaged-"));
  fs.cpSync(path.join(ROOT, "server"), path.join(PACKAGED, "server"), { recursive: true });
  const PACKAGED_DB = DB + "_packaged";
  createRuntimeDatabase(PACKAGED_DB);
  const packaged = await bootChild(runtimeUrl(PACKAGED_DB),
    {}, path.join(PACKAGED, "server", "index.js"));
  report("H15) server/sql/schema.sql alone — no supabase/ sibling at all — still reaches ready:true",
    !!packaged.health && packaged.health.ready === true && packaged.health.schema === 4 &&
    packaged.health.schemaFingerprint === EXPECTED_SCHEMA_SHA, packaged.health);
  await packaged.stop();
  psql(`drop database if exists ${PACKAGED_DB}`);

  /* A packaged service without its tracked fallback schema must stay visibly
     not-ready. migrate() deliberately resolves after applying platform.sql so
     /health can explain the packaging fault; index.js must not mistake that
     resolution for a successful application migration and erase the reason. */
  fs.rmSync(path.join(PACKAGED, "server", "sql", "schema.sql"));
  const PACKAGED_MISSING_DB = DB + "_packaged_missing";
  createRuntimeDatabase(PACKAGED_MISSING_DB);
  const packagedMissing = await bootChild(runtimeUrl(PACKAGED_MISSING_DB),
    {}, path.join(PACKAGED, "server", "index.js"));
  report("H15b) a packaged server missing application schema stays not-ready and names the fault",
    !!packagedMissing.health && packagedMissing.health.ready === false &&
    packagedMissing.health.schemaFingerprint === null &&
    /application schema file was not found/i.test(packagedMissing.health.error || ""),
    packagedMissing.health);

  /* The process must keep retrying a migration that resolved without an
     application fingerprint. Restoring the packaged file proves that this is
     an active diagnostic state, not a permanent not-ready process whose error
     merely happened to survive the first attempt. */
  fs.copyFileSync(path.join(ROOT, "server", "sql", "schema.sql"),
    path.join(PACKAGED, "server", "sql", "schema.sql"));
  let packagedRecovered = null;
  for (let i = 0; i < 60 && !packagedRecovered; i++) {
    await new Promise(done => setTimeout(done, 250));
    try {
      const response = await fetch(`http://127.0.0.1:${packagedMissing.port}/health`);
      const body = await response.json();
      if (response.status === 200 && body.ready === true) packagedRecovered = body;
    } catch (_) { /* retry is still applying */ }
  }
  report("H15c) restoring the packaged schema lets the missing-schema retry recover",
    !!packagedRecovered && packagedRecovered.schemaFingerprint === EXPECTED_SCHEMA_SHA &&
    packagedRecovered.error === undefined,
    packagedRecovered);
  await packagedMissing.stop();
  psql(`drop database if exists ${PACKAGED_MISSING_DB}`);
  fs.rmSync(PACKAGED, { recursive: true, force: true });

  server.close();
  await dbRuntime.pool.end();
  psql(`drop database if exists ${DB}`);
  psql(`drop role if exists ${RUNTIME_USER}`);
  console.log("      (drives the real HTTP service against a real database — it cannot prove the owner has deployed it)");
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
