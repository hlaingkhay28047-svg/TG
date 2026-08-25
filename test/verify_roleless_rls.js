/* The App Platform development database gives the service a database owner
   that is deliberately not a cluster administrator. This test reproduces that
   exact security shape: the login may create tables in its database, but it
   cannot create roles, bypass RLS, or become superuser.

   The application must therefore enforce request identity without relying on
   cluster-wide anon/authenticated/service_role roles. FORCE RLS matters here:
   without it, the database owner silently bypasses every policy and a green
   request test proves nothing. */
"use strict";
const { execFileSync, spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");
const SCHEMA = path.join(ROOT, "supabase", "schema.sql");
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
    "set_config('request.user_email', coalesce((select email from auth.users " +
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
if (!requireOk("setup creates a fresh owner database",
  run('create database "' + DB + '" owner ' + OWNER))) setupOk = false;

try {
if (setupOk) {
  const flags = run("select rolsuper||'|'||rolcreaterole||'|'||rolbypassrls " +
    "from pg_roles where rolname=current_user", DB, OWNER_ENV);
  report("A) fixture is a NOSUPERUSER NOCREATEROLE NOBYPASSRLS database owner",
    flags.ok && flags.out === "false|false|false", flags.out);

  const applied = spawnSync("psql", ["-X", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q",
    "-c", "select set_config('request.role','service_role',false), " +
          "set_config('request.jwt.claim.sub','',false), " +
          "set_config('request.is_admin','false',false), " +
          "set_config('request.user_email','',false)",
    "-f", PLATFORM, "-f", SCHEMA], { env: OWNER_ENV, encoding: "utf8" });
  const appliedOut = ((applied.stdout || "") + (applied.stderr || "")).trim();
  report("B) restricted owner applies platform.sql and schema.sql without CREATE ROLE",
    applied.status === 0, appliedOut.split("\n").slice(0, 4));

  if (applied.status === 0) {
    const namedRoles = run("select count(*) from pg_roles where rolname in " +
      "('anon','authenticated','service_role')");
    report("C) migration creates no cluster-wide request roles",
      namedRoles.ok && namedRoles.out === "0", namedRoles);

    const forced = run("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where (n.nspname,c.relname) in (('public','profiles'),('public','payment_requests')," +
      "('public','app_settings'),('public','devices'),('storage','objects')," +
      "('auth','users'),('auth','refresh_tokens')) " +
      "and c.relrowsecurity and c.relforcerowsecurity", DB);
    report("D) all seven request/auth tables have ENABLE + FORCE RLS",
      forced.ok && forced.out === "7", forced);

    const seeded = ownerRequest("service_role", null, false,
      "insert into auth.users(id,email) values ('" + CUSTOMER + "','customer@example.test')," +
      "('" + ADMIN + "','admin@example.test'); " +
      "insert into public.profiles(id,email,is_admin) values ('" + CUSTOMER + "','customer@example.test',false)," +
      "('" + ADMIN + "','admin@example.test',true);");
    report("E) internal service context can seed identity and profile rows", seeded.ok, seeded.out);

    const bareOwner = run("select count(*) from public.profiles", DB, OWNER_ENV);
    report("F) an uncontextualized table owner sees no customer rows",
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
    report("J) database-derived admin context sees both profiles",
      adminRows.ok && lastLine(adminRows) === "2", adminRows.out);

    const serviceAuth = ownerRequest("service_role", null, false,
      "select count(*) from auth.users;");
    const customerAuth = ownerUserRequest(CUSTOMER,
      "select count(*) from auth.users;");
    report("K) auth rows are visible only to the internal service context",
      serviceAuth.ok && lastLine(serviceAuth) === "2" &&
      customerAuth.ok && lastLine(customerAuth) === "0",
      { service: serviceAuth.out, customer: customerAuth.out });

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

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
