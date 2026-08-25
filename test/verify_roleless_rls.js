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
    "-t", "-A", "-c", sql], { env, encoding: "utf8" });
  return { ok: out.status === 0, out: ((out.stdout || "") + (out.stderr || "")).trim() };
}
function ownerRequest(role, uid, isAdmin, body) {
  const context =
    "select set_config('hnk.request_role', '" + role + "', true), " +
    "set_config('request.jwt.claim.sub', '" + (uid || "") + "', true), " +
    "set_config('hnk.request_is_admin', '" + (isAdmin ? "true" : "false") + "', true); ";
  return run("begin; " + context + body + " commit;", DB, OWNER_ENV);
}

const reachable = run("select 1");
if (!reachable.ok) {
  console.log("FAIL — a PostgreSQL server is reachable\n       :: " + reachable.out.split("\n")[0]);
  console.log("\nFAIL (1)");
  process.exit(1);
}

run('drop database if exists "' + DB + '"');
run("drop role if exists " + OWNER);
for (const role of ["anon", "authenticated", "service_role"]) run("drop role if exists " + role);
run("create role " + OWNER + " login password '" + PASSWORD +
  "' nosuperuser nocreaterole nocreatedb noreplication nobypassrls");
run('create database "' + DB + '" owner ' + OWNER);

try {
  const flags = run("select rolsuper||'|'||rolcreaterole||'|'||rolbypassrls " +
    "from pg_roles where rolname=current_user", DB, OWNER_ENV);
  report("A) fixture is a NOSUPERUSER NOCREATEROLE NOBYPASSRLS database owner",
    flags.ok && flags.out === "false|false|false", flags.out);

  const applied = spawnSync("psql", ["-X", "-d", DB, "-v", "ON_ERROR_STOP=1", "-q",
    "-c", "select set_config('hnk.request_role','service_role',false), " +
          "set_config('request.jwt.claim.sub','',false), " +
          "set_config('hnk.request_is_admin','false',false)",
    "-f", PLATFORM, "-f", SCHEMA], { env: OWNER_ENV, encoding: "utf8" });
  const appliedOut = ((applied.stdout || "") + (applied.stderr || "")).trim();
  report("B) restricted owner applies platform.sql and schema.sql without CREATE ROLE",
    applied.status === 0, appliedOut.split("\n").slice(0, 4));

  if (applied.status === 0) {
    const namedRoles = run("select count(*) from pg_roles where rolname in " +
      "('anon','authenticated','service_role')").out;
    report("C) migration creates no cluster-wide request roles", namedRoles === "0", { namedRoles });

    const forced = run("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
      "where (n.nspname,c.relname) in (('public','profiles'),('public','payment_requests')," +
      "('public','app_settings'),('public','devices'),('storage','objects')) " +
      "and c.relrowsecurity and c.relforcerowsecurity", DB).out;
    report("D) all five request tables have ENABLE + FORCE RLS", forced === "5", { forced });

    run("insert into auth.users(id,email) values ('" + CUSTOMER + "','customer@example.test')," +
      "('" + ADMIN + "','admin@example.test'); " +
      "insert into public.profiles(id,email,is_admin) values ('" + CUSTOMER + "','customer@example.test',false)," +
      "('" + ADMIN + "','admin@example.test',true)", DB);

    const bareOwner = run("select count(*) from public.profiles", DB, OWNER_ENV);
    report("E) an uncontextualized table owner sees no customer rows",
      bareOwner.ok && bareOwner.out === "0", bareOwner.out);

    const anonSettings = ownerRequest("anon", null, false,
      "select count(*) from public.app_settings;");
    const anonProfiles = ownerRequest("anon", null, false,
      "select count(*) from public.profiles;");
    report("F) anon reads settings but no profiles",
      anonSettings.ok && anonSettings.out.endsWith("1") && anonProfiles.ok && anonProfiles.out.endsWith("0"),
      { settings: anonSettings.out, profiles: anonProfiles.out });

    const own = ownerRequest("authenticated", CUSTOMER, false,
      "select count(*) from public.profiles;");
    const cross = ownerRequest("authenticated", CUSTOMER, false,
      "select count(*) from public.profiles where id='" + ADMIN + "';");
    report("G) authenticated customer sees only their own profile",
      own.ok && own.out.endsWith("1") && cross.ok && cross.out.endsWith("0"),
      { own: own.out, cross: cross.out });

    const promote = ownerRequest("authenticated", CUSTOMER, false,
      "update public.profiles set is_admin=true where id='" + CUSTOMER + "';");
    const promoted = run("select is_admin from public.profiles where id='" + CUSTOMER + "'", DB).out;
    report("H) customer cannot promote themselves", promote.ok && promoted === "f",
      { update: promote.out, isAdmin: promoted });

    const adminRows = ownerRequest("authenticated", ADMIN, true,
      "select count(*) from public.profiles;");
    report("I) database-derived admin context sees both profiles",
      adminRows.ok && adminRows.out.endsWith("2"), adminRows.out);

    const oldRole = ownerRequest("authenticated", CUSTOMER, false,
      "set local role authenticated;");
    report("J) no hidden dependency on SET ROLE remains",
      !oldRole.ok && /role \"authenticated\" does not exist/i.test(oldRole.out), oldRole.out.split("\n")[0]);
  }
} finally {
  run('drop database if exists "' + DB + '"');
  run("drop role if exists " + OWNER);
  for (const role of ["anon", "authenticated", "service_role"]) run("drop role if exists " + role);
}

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
