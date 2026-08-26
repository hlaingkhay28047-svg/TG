/* The App Platform database gives the service object-creation rights only in
   the existing public schema. This test reproduces that exact security shape:
   the login does not own the database and cannot create schemas or roles,
   bypass RLS, or become superuser.

   The application must therefore enforce request identity without relying on
   cluster-wide anon/authenticated/service_role roles. FORCE RLS matters here:
   without it, a runtime that owns the objects it creates silently bypasses
   every policy and a green request test proves nothing. */
"use strict";
const { execFileSync, spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");
const SCHEMA = path.join(ROOT, "server", "sql", "schema.sql");
const DB = "hnk_roleless_rls_test";
const OWNER = "hnk_roleless_owner";
const PASSWORD = "roleless-probe";
const CUSTOMER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
const OWNER_ENV = Object.assign({}, ADMIN_ENV, { PGUSER: OWNER, PGPASSWORD: PASSWORD });

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
function run(sql, db, env = ADMIN_ENV) {
  const out = spawnSync("psql", ["-X", "-d", db || "postgres", "-v", "ON_ERROR_STOP=1",
    "-q", "-t", "-A", "-c", sql], { env, encoding: "utf8" });
  return { ok: out.status === 0, out: ((out.stdout || "") + (out.stderr || "")).trim() };
}
const lastLine = result => result.out.split(/\r?\n/).filter(Boolean).at(-1) || "";
function requireOk(label, result) {
  if (!result.ok) report(label, false, result.out.split(/\r?\n/).slice(0, 3));
  return result.ok;
}
function ownerRequest(role, uid, isAdmin, body) {
  const context =
    "select set_config('request.role', '" + role + "', true), " +
    "set_config('request.jwt.claim.sub', '" + (uid || "") + "', true), " +
    "set_config('request.is_admin', '" + (isAdmin ? "true" : "false") + "', true), " +
    "set_config('request.user_email', '', true); ";
  return run("begin; " + context + body + " commit;", DB, OWNER_ENV);
}
function ownerUserRequest(uid, body) {
  const bootstrap =
    "select set_config('request.role', 'service_role', true), " +
    "set_config('request.jwt.claim.sub', '" + uid + "', true), " +
    "set_config('request.is_admin', 'false', true), " +
    "set_config('request.user_email', '', true); " +
    "select set_config('request.is_admin', coalesce((select is_admin::text " +
      "from public.profiles where id='" + uid + "'),'false'), true), " +
    "set_config('request.user_email', coalesce((select email from public.hnk_auth_users " +
      "where id='" + uid + "'),''), true); " +
    "select set_config('request.role', 'authenticated', true); ";
  return run("begin; " + bootstrap + body + " commit;", DB, OWNER_ENV);
}

const reachable = run("select 1");
if (!reachable.ok) {
  console.log("FAIL — a PostgreSQL server is reachable\n       :: " + reachable.out.split("\n")[0]);
  console.log("\nFAIL (1)");
  process.exit(1);
}

let setupOk = true;
if (!requireOk("setup drops the prior scratch database", run('drop database if exists "' + DB + '"'))) setupOk = false;
if (!requireOk("setup drops the prior scratch owner", run("drop role if exists " + OWNER))) setupOk = false;
for (const role of ["anon", "authenticated", "service_role"]) {
  if (!requireOk("setup removes cluster role " + role, run("drop role if exists " + role))) setupOk = false;
}
if (!requireOk("setup creates the restricted database owner",
  run("create role " + OWNER + " login password '" + PASSWORD +
    "' nosuperuser nocreaterole nocreatedb noreplication nobypassrls"))) setupOk = false;
if (!requireOk("setup creates an administrator-owned database",
  run('create database "' + DB + '"'))) setupOk = false;
if (!requireOk("setup grants only public-schema object creation",
  run('revoke all on database "' + DB + '" from ' + OWNER + '; ' +
      'revoke create on database "' + DB + '" from public; ' +
      'grant connect on database "' + DB + '" to ' + OWNER))) setupOk = false;
if (!requireOk("setup grants runtime CREATE only within public",
  run('revoke create on schema public from public; ' +
      'grant usage, create on schema public to ' + OWNER, DB))) setupOk = false;

try {
if (setupOk) {
  const flags = run("select rolsuper||'|'||rolcreaterole||'|'||rolbypassrls||'|'||" +
    "has_database_privilege(current_user,current_database(),'create')||'|'||" +
    "has_schema_privilege(current_user,'public','usage')||'|'||" +
    "has_schema_privilege(current_user,'public','create')||'|'||" +
    "(pg_get_userbyid(d.datdba)=current_user) from pg_roles r cross join pg_database d " +
    "where r.rolname=current_user and d.datname=current_database()", DB, OWNER_ENV);
  report("A) fixture matches the restricted managed-database runtime",
    flags.ok && flags.out === "false|false|false|false|true|true|false", flags.out);

  const applied = spawnSync("psql", ["-X", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q",
    "-c", "select set_config('request.role','service_role',false), " +
          "set_config('request.jwt.claim.sub','',false), " +
          "set_config('request.is_admin','false',false), " +
          "set_config('request.user_email','',false)",
    "-f", PLATFORM, "-f", SCHEMA], { env: OWNER_ENV, encoding: "utf8" });
  const appliedOut = ((applied.stdout || "") + (applied.stderr || "")).trim();
  report("B) restricted runtime applies both DO schemas without CREATE SCHEMA",
    applied.status === 0, appliedOut.split("\n").slice(0, 4));

  if (applied.status === 0) {
    const namedRoles = run("select count(*) from pg_roles where rolname in " +
      "('anon','authenticated','service_role')");
    report("C) migration creates no cluster-wide request roles",
      namedRoles.ok && namedRoles.out === "0", namedRoles);

    const nativeSchemas = run("select (to_regnamespace('auth') is null)||'|'||" +
      "(to_regnamespace('storage') is null)", DB, OWNER_ENV);
    report("C2) migration creates no auth/storage schema",
      nativeSchemas.ok && nativeSchemas.out === "true|true", nativeSchemas);

    const forced = run("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where (n.nspname,c.relname) in (('public','profiles'),('public','payment_requests')," +
      "('public','app_settings'),('public','devices'),('public','hnk_storage_buckets')," +
      "('public','hnk_storage_objects')," +
      "('public','hnk_auth_users'),('public','hnk_auth_refresh_tokens')) " +
      "and c.relrowsecurity and c.relforcerowsecurity", DB);
    report("D) all eight request/auth/storage tables have ENABLE + FORCE RLS",
      forced.ok && forced.out === "8", forced);

    const seeded = ownerRequest("service_role", null, false,
      "insert into public.hnk_auth_users(id,email) values ('" + CUSTOMER + "','customer@example.test')," +
      "('" + ADMIN + "','admin@example.test'); " +
      "insert into public.profiles(id,email,is_admin) values ('" + CUSTOMER + "','customer@example.test',false)," +
      "('" + ADMIN + "','admin@example.test',true);");
    report("E) internal service context can seed identity and profile rows", seeded.ok, seeded.out);
    const seededAdminRole = ownerRequest("service_role", null, false,
      "select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id " +
      "where ur.user_id='" + ADMIN + "' and r.name='admin';");
    report("E2) the authoritative profile flag bootstraps the canonical admin role",
      seededAdminRole.ok && lastLine(seededAdminRole) === "1", seededAdminRole.out);

    const bareOwner = run("select count(*) from public.profiles", DB, OWNER_ENV);
    report("F) an uncontextualized runtime sees no customer rows",
      bareOwner.ok && bareOwner.out === "0", bareOwner.out);

    const anonSettings = ownerRequest("anon", null, false,
      "select count(*) from public.app_settings;");
    const anonProfiles = ownerRequest("anon", null, false,
      "select count(*) from public.profiles;");
    report("G) anon reads settings but no profiles",
      anonSettings.ok && lastLine(anonSettings) === "1" &&
      anonProfiles.ok && lastLine(anonProfiles) === "0",
      { settings: anonSettings.out, profiles: anonProfiles.out });

    const own = ownerUserRequest(CUSTOMER,
      "select count(*) from public.profiles;");
    const cross = ownerUserRequest(CUSTOMER,
      "select count(*) from public.profiles where id='" + ADMIN + "';");
    report("H) authenticated customer sees only their own profile",
      own.ok && lastLine(own) === "1" && cross.ok && lastLine(cross) === "0",
      { own: own.out, cross: cross.out });

    const promote = ownerUserRequest(CUSTOMER,
      "update public.profiles set is_admin=true where id='" + CUSTOMER + "';");
    const promoted = ownerRequest("service_role", null, false,
      "select is_admin from public.profiles where id='" + CUSTOMER + "';");
    report("I) customer cannot promote themselves",
      promote.ok && promoted.ok && lastLine(promoted) === "f",
      { update: promote.out, isAdmin: promoted });

    const adminRows = ownerUserRequest(ADMIN,
      "select count(*) from public.profiles;");
    report("J) an ordinary admin bearer remains scoped to its own profile",
      adminRows.ok && lastLine(adminRows) === "1", adminRows.out);

    const serviceAuth = ownerRequest("service_role", null, false,
      "select count(*) from public.hnk_auth_users;");
    const customerAuth = ownerUserRequest(CUSTOMER,
      "select count(*) from public.hnk_auth_users;");
    report("K) auth rows are visible only to the internal service context",
      serviceAuth.ok && lastLine(serviceAuth) === "2" &&
      customerAuth.ok && lastLine(customerAuth) === "0",
      { service: serviceAuth.out, customer: customerAuth.out });

    const demoted = ownerRequest("service_role", null, false,
      "insert into public.sessions(user_id,client_type,refresh_token_hash,expires_at) values " +
      "('" + ADMIN + "','admin','demotion-session',now()+interval '1 hour'); " +
      "insert into public.hnk_auth_refresh_tokens(token,user_id,expires_at) values " +
      "('demotion-refresh','" + ADMIN + "',now()+interval '1 hour'); " +
      "update public.profiles set is_admin=false where id='" + ADMIN + "'; " +
      "select (select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id " +
      "where ur.user_id='" + ADMIN + "' and r.name='admin')||'|'||" +
      "(select (revoked_at is not null)::text from public.sessions where refresh_token_hash='demotion-session')||'|'||" +
      "(select count(*) from public.hnk_auth_refresh_tokens where token='demotion-refresh');");
    report("K2) admin demotion removes RBAC and revokes canonical and legacy sessions",
      demoted.ok && lastLine(demoted) === "0|true|0", demoted.out);

    const oldRole = ownerUserRequest(CUSTOMER,
      "set local role authenticated;");
    report("L) no hidden dependency on SET ROLE remains",
      !oldRole.ok && /role \"authenticated\" does not exist/i.test(oldRole.out), oldRole.out.split("\n")[0]);
  }
}
} finally {
  requireOk("cleanup drops the scratch database", run('drop database if exists "' + DB + '"'));
  requireOk("cleanup drops the scratch owner", run("drop role if exists " + OWNER));
  for (const role of ["anon", "authenticated", "service_role"]) {
    requireOk("cleanup removes cluster role " + role, run("drop role if exists " + role));
  }
}

/* Keep the focused red-first privilege regression in the same CI test group,
   so landing-page suite inventory remains a count of top-level workflow
   scripts while this exact managed-database contract is still executed. */
const noCreate = spawnSync(process.execPath,
  [path.join(ROOT, "test", "verify_no_create_schema.js")],
  { env: ADMIN_ENV, encoding: "utf8" });
if (noCreate.stdout) process.stdout.write(noCreate.stdout);
if (noCreate.stderr) process.stderr.write(noCreate.stderr);
report("M) focused no-CREATE-SCHEMA regression passes",
  noCreate.status === 0, { status: noCreate.status, error: noCreate.error && noCreate.error.message });

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
