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
const { execFileSync, spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const DB = "hnk_api_test";
const PORT = 8977;

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
const psql = (sql, db) => execFileSync("psql",
  ["-d", db || "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
  { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const psqlFile = (file, db) => execFileSync("psql",
  ["-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-f", file],
  { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/* ---- build a database ---- */
try { psql("select 1"); } catch (e) {
  console.log("FAIL — a PostgreSQL server is reachable\n       :: " + String(e.message).split("\n")[0]);
  console.log("\nFAIL (1)"); process.exit(1);
}
psql(`drop database if exists ${DB}`);
psql(`create database ${DB}`);

/* ---- boot the service against it ---- */
/* The password belongs in the URL even though a local trust-auth server
   ignores it. Leaving it out worked on a development cluster and failed in CI
   with "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string",
   because the service container authenticates. psql-based checks did not catch
   it — they read PGPASSWORD from the environment, while the pg driver only sees
   what this string carries. */
process.env.DATABASE_URL =
  `postgres://${encodeURIComponent(ENV.PGUSER)}:${encodeURIComponent(ENV.PGPASSWORD)}` +
  `@${ENV.PGHOST}:${ENV.PGPORT}/${DB}`;
process.env.PGSSLMODE = "disable";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
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
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text };
}

(async () => {
  let migrated = null;
  try { await migrate(); } catch (err) { migrated = err.message; }
  const tables = psql("select count(*)::int from pg_tables where schemaname='public' " +
    "and tablename in ('profiles','payment_requests','app_settings','devices')", DB);
  report("the service migrates an EMPTY database to a working schema on boot",
    migrated === null && tables === "4", { error: migrated, tables });

  await new Promise(r => server.listen(PORT, r));

  /* ---- /health: the only window the owner has into a deployment ---- */
  {
    const h = await call("GET", "/health");
    report("A0) /health on a working database reports ready, with no error to explain",
      h.status === 200 && h.json && h.json.schema === 4 && h.json.ready === true &&
      h.json.error === undefined, h.json);
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

  /* ---- the v5.38.0 self-heal, over HTTP ---- */
  r = await call("GET", "/rest/v1/profiles?select=*&id=eq." + CUST,
    { token: custToken, headers: { accept: "application/vnd.pgrst.object+json" } });
  report("F) a missing profile answers 406, which is what accLoadProfile keys on",
    r.status === 406, { status: r.status });

  r = await call("POST", "/rest/v1/profiles", { token: custToken, body: { id: CUST }, headers: { prefer: "return=representation" } });
  report("G) accEnsureProfile's insert of {id} yields a complete free-tier row",
    r.status === 201 && r.json && r.json[0] && r.json[0].plan_status === "none" &&
    r.json[0].allowed_devices === 2 && r.json[0].is_admin === false && r.json[0].email === cust.email,
    { status: r.status, row: r.json && r.json[0] });

  await call("POST", "/rest/v1/profiles", { token: ownerToken, body: { id: OWNER } });
  psql(`update public.profiles set is_admin = true where id = '${OWNER}'`, DB);

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
  report("J) an admin listing profiles sees every row",
    r.status === 200 && Array.isArray(r.json) && r.json.length === 2, { count: Array.isArray(r.json) ? r.json.length : null });

  await call("POST", "/rest/v1/payment_requests",
    { token: custToken, body: { user_id: CUST, kind: "plan_1m", txn_last6: "123456", amount_mmk: 30000 } });
  r = await call("PATCH", "/rest/v1/payment_requests?id=eq." +
    psql(`select id from public.payment_requests limit 1`, DB),
    { token: custToken, body: { status: "approved" }, headers: { prefer: "return=representation" } });
  const stat = psql("select status from public.payment_requests", DB);
  report("K) a customer cannot approve their own payment through the API",
    stat === "pending", { httpStatus: r.status, status: stat });

  r = await call("POST", "/rest/v1/payment_requests",
    { token: custToken, body: { user_id: CUST, kind: "plan_6m", status: "approved", reviewed_by: OWNER, note: "ok" } });
  report("L) a forged already-approved row is refused", r.status >= 400, { status: r.status });

  r = await call("GET", "/rest/v1/app_settings?select=*&limit=50");
  report("M) anon may read app_settings (the buy screen quotes prices signed out)",
    r.status === 200 && Array.isArray(r.json), { status: r.status });

  r = await call("PATCH", "/rest/v1/app_settings?price_1m=eq.0", { body: { payment_phone: "09-ATTACKER" } });
  const phone = psql("select coalesce(payment_phone,'(null)') from public.app_settings", DB);
  report("N) anon cannot redirect the payment details", phone === "(null)", { httpStatus: r.status, phone });

  r = await call("PATCH", "/rest/v1/app_settings?price_1m=eq.0", { token: custToken, body: { price_1m: 1 } });
  const price = psql("select coalesce(price_1m::text,'(null)') from public.app_settings", DB);
  report("O) a signed-in customer cannot rewrite prices either", price === "(null)", { httpStatus: r.status, price });

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
    .signToken({ sub: OWNER }, "not-the-real-secret", 3600).token;
  r = await call("GET", "/rest/v1/profiles?select=*", { token: forged });
  report("Q) a token signed with the wrong secret grants nothing",
    r.status !== 500 && !leaked(r), { status: r.status, body: r.json });

  /* ---- injection through identifiers ---- */
  r = await call("GET", "/rest/v1/profiles?select=id,email);drop%20table%20public.devices;--", { token: custToken });
  const devicesAlive = psql("select count(*) from pg_tables where tablename='devices'", DB);
  report("R) an identifier that is not a real column is refused, and nothing is dropped",
    r.status === 400 && devicesAlive === "1", { status: r.status, devicesTable: devicesAlive });

  r = await call("GET", "/rest/v1/pg_shadow?select=*", { token: custToken });
  report("S) a table outside the allowlist is refused", r.status === 404, { status: r.status });

  r = await call("GET", "/rest/v1/profiles?id=gt.0", { token: custToken });
  report("T) an operator other than eq is refused rather than ignored", r.status === 400, { status: r.status });

  /* ---- storage ---- */
  const boundary = "----hnk";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  r = await call("POST", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`,
    { token: custToken, raw: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-upsert": "true" } });
  report("U) a customer can upload a proof into their own folder", r.status === 200, { status: r.status, text: r.text.slice(0, 90) });

  r = await call("POST", `/storage/v1/object/payment-proofs/${OWNER}/stolen.jpg`,
    { token: custToken, raw: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-upsert": "true" } });
  report("V) a customer cannot upload into another user's folder", r.status >= 400, { status: r.status });

  r = await call("GET", `/storage/v1/object/payment-proofs/${CUST}/plan_1m-1.jpg`, { token: ownerToken });
  report("W) an admin can read a customer's proof", r.status === 200, { status: r.status });

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
  async function bootChild(url, extraEnv) {
    childPort++;
    const port = childPort;
    const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
      env: Object.assign({}, process.env,
        { DATABASE_URL: url, PGSSLMODE: "disable", PORT: String(port) }, extraEnv || {}),
      stdio: "ignore",
    });
    let health = null;
    for (let i = 0; i < 80 && !health; i++) {
      try { health = await (await fetch(`http://127.0.0.1:${port}/health`)).json(); }
      catch (_) { await new Promise(done => setTimeout(done, 250)); }
    }
    return { port, health, stop: () => child.kill() };
  }
  async function healthWith(url, extraEnv) {
    const boot = await bootChild(url, extraEnv);
    boot.stop();
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
    !!rescued && rescued.schema === 4 && rescued.ready === true && rescued.error === undefined, rescued);

  const ambiguous = await healthWith("${hnk-db.DATABASE_URL}",
    { [ALT]: REAL, DATABASE_URL_THIRD: "postgres://a:b@127.0.0.1:5432/other" });
  report("H9) two candidates are refused rather than guessed between — the wrong one holds the payments",
    !!ambiguous && ambiguous.ready === false && /guess/.test(ambiguous.error || ""), ambiguous);

  /* The restriction that makes H8 safe rather than reckless. During a migration
     the OLD database is still live and its URL may still be sitting in the
     environment under some unrelated name; sweeping the whole environment for
     anything postgres-shaped would find it and quietly apply this schema to
     someone else's database. Only keys this spec controls are candidates. */
  const strayed = await healthWith("${hnk-db.DATABASE_URL}", { SUPABASE_DB_URL: REAL });
  report("H9b) a PostgreSQL URL under an unrelated key is NOT adopted — it could be the old database",
    !!strayed && strayed.ready === false &&
    /unresolved App Platform binding/.test(strayed.error || ""), strayed);

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
  psql(`drop database if exists ${PARTIAL}`);
  psql(`create database ${PARTIAL}`);
  psql("create table public.profiles (id int)", PARTIAL);
  const partial = await bootChild(
    `postgres://${encodeURIComponent(ENV.PGUSER)}:${encodeURIComponent(ENV.PGPASSWORD)}` +
    `@${ENV.PGHOST}:${ENV.PGPORT}/${PARTIAL}`);
  report("H10) a half-applied schema still boots, so the reason stays readable",
    !!partial.health && partial.health.ok === true && partial.health.ready === false &&
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
  partial.stop();
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

  const bound = sslWith({ DATABASE_CA_CERT: "${hnk-db.CA_CERT}",
                          DATABASE_CA_CERT_IF_COMPONENT_IS_NAMED_DB: PEM });
  report("S2) the binding that DID resolve is verified against, so the database is authenticated",
    !!bound && bound.rejectUnauthorized === true && bound.ca === PEM, bound);

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
  report("S11) a certificate failure stands down from VERIFYING rather than from connecting",
    dbModule.downgradeTlsAfter(certErr) === true &&
    dbModule.pool.options.ssl.rejectUnauthorized === false,
    dbModule.pool.options.ssl);
  report("S12) ...and says so, naming the code, so the downgrade is never silent",
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
  const late = await bootChild(
    `postgres://${encodeURIComponent(ENV.PGUSER)}:${encodeURIComponent(ENV.PGPASSWORD)}` +
    `@${ENV.PGHOST}:${ENV.PGPORT}/${LATE}`);
  report("H13) a database that does not exist yet still boots, and says so",
    !!late.health && late.health.ok === true && late.health.ready === false &&
    /does not exist/.test(late.health.error || ""), late.health);

  psql(`create database ${LATE}`);
  let recovered = null;
  for (let i = 0; i < 45 && !recovered; i++) {
    await new Promise(done => setTimeout(done, 1000));
    try {
      const h = await (await fetch(`http://127.0.0.1:${late.port}/health`)).json();
      if (h && h.ready === true) recovered = h;
    } catch (_) { /* mid-restart of nothing; keep looking */ }
  }
  report("H14) ...and applies the schema itself once it appears, with no restart and nobody watching",
    !!recovered && recovered.schema === 4 && recovered.error === undefined, recovered);
  late.stop();
  psql(`drop database if exists ${LATE}`);

  server.close();
  await require(path.join(ROOT, "server", "lib", "db")).pool.end();
  psql(`drop database if exists ${DB}`);
  console.log("      (drives the real HTTP service against a real database — it cannot prove the owner has deployed it)");
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
