/* Regression for the managed-database privilege shape used in staging.

   The application login is not the database owner and cannot CREATE SCHEMA:
   it receives only CONNECT on the database plus USAGE, CREATE on the existing
   public schema. Both server migrations must still apply under that login.

   This deliberately uses a real PostgreSQL server. CI supplies PostgreSQL 16;
   locally, point the standard PGHOST/PGPORT/PGUSER/PGPASSWORD variables at an
   administrator that may create a scratch role and database.

   Usage: node test/verify_no_create_schema.js */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");
const SCHEMA = path.join(ROOT, "server", "sql", "schema.sql");
const SUFFIX = String(process.pid);
const DB = "hnk_no_create_schema_" + SUFFIX;
const RUNTIME = "hnk_no_create_runtime_" + SUFFIX;
const PASSWORD = "no-create-schema-probe";
const USER_ID = "11111111-1111-1111-1111-111111111111";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;
const RUNTIME_ENV = Object.assign({}, ADMIN_ENV, {
  PGUSER: RUNTIME,
  PGPASSWORD: PASSWORD,
});

let failures = 0;

function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function psql(args, env = ADMIN_ENV) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args), {
    env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = ((child.stdout || "") + (child.stderr || "")).trim();
  if (child.error) {
    return { ok: false, out: child.error.message, status: child.status };
  }
  return { ok: child.status === 0, out: output, status: child.status };
}

function sql(text, db = "postgres", env = ADMIN_ENV) {
  return psql(["-d", db, "-c", text], env);
}

function requireOk(label, result) {
  report(label, result.ok, result.out.split(/\r?\n/).slice(0, 5));
  return result.ok;
}

function lastLine(result) {
  return result.out.split(/\r?\n/).filter(Boolean).at(-1) || "";
}

function serviceSql(text) {
  return sql("begin; " +
    "select set_config('request.role','service_role',true), " +
      "set_config('request.jwt.claim.sub','',true), " +
      "set_config('request.is_admin','false',true), " +
      "set_config('request.user_email','',true); " +
    text + " commit;", DB, RUNTIME_ENV);
}

const reachable = sql("select 1");
if (!reachable.ok) {
  report("a PostgreSQL administrator is reachable", false,
    reachable.out.split(/\r?\n/).slice(0, 3));
  console.log("\nFAIL (1)");
  process.exit(1);
}
report("a PostgreSQL administrator is reachable", true);

let setupOk = true;
if (!requireOk("setup removes the prior scratch database",
  sql('drop database if exists "' + DB + '"'))) setupOk = false;
if (!requireOk("setup removes the prior scratch runtime role",
  sql('drop role if exists "' + RUNTIME + '"'))) setupOk = false;
if (!requireOk("setup creates a restricted runtime role",
  sql('create role "' + RUNTIME + '" login password \'' + PASSWORD +
    "' nosuperuser nocreaterole nocreatedb noreplication nobypassrls"))) setupOk = false;
if (!requireOk("setup creates an administrator-owned scratch database",
  sql('create database "' + DB + '"'))) setupOk = false;

try {
  if (setupOk) {
    const grants = sql(
      'revoke all on database "' + DB + '" from "' + RUNTIME + '"; ' +
      'revoke create on database "' + DB + '" from public; ' +
      'grant connect on database "' + DB + '" to "' + RUNTIME + '"; ' +
      'revoke create on schema public from public; ' +
      'grant usage, create on schema public to "' + RUNTIME + '";', DB);
    if (!requireOk("fixture grants only public-schema object creation", grants)) setupOk = false;
  }

  if (setupOk) {
    const privileges = sql(
      "select rolsuper||'|'||rolcreaterole||'|'||rolbypassrls||'|'||rolcreatedb||'|'||" +
        "has_database_privilege(current_user,current_database(),'CREATE')||'|'||" +
        "has_schema_privilege(current_user,'public','USAGE')||'|'||" +
        "has_schema_privilege(current_user,'public','CREATE')||'|'||" +
        "(pg_get_userbyid(d.datdba)=current_user) " +
      "from pg_roles r cross join pg_database d " +
      "where r.rolname=current_user and d.datname=current_database();",
      DB, RUNTIME_ENV);
    report("A) runtime is restricted, lacks database CREATE, and is not the database owner",
      privileges.ok && privileges.out ===
        "false|false|false|false|false|true|true|false",
      { ok: privileges.ok, privileges: privileges.out });

    const schemaAttempt = sql("create schema hnk_forbidden_probe", DB, RUNTIME_ENV);
    report("A2) runtime cannot CREATE SCHEMA",
      !schemaAttempt.ok && /permission denied/i.test(schemaAttempt.out),
      { accepted: schemaAttempt.ok, error: schemaAttempt.out.split(/\r?\n/)[0] });

    const applied = psql([
      "-d", DB,
      "-c", "select set_config('request.role','service_role',false), " +
        "set_config('request.jwt.claim.sub','',false), " +
        "set_config('request.is_admin','false',false), " +
        "set_config('request.user_email','',false)",
      "-f", PLATFORM,
      "-f", SCHEMA,
    ], RUNTIME_ENV);
    report("B) runtime applies platform.sql and schema.sql without database CREATE",
      applied.ok, applied.out.split(/\r?\n/).slice(0, 8));

    const reapplied = applied.ok ? psql([
      "-d", DB,
      "-c", "select set_config('request.role','service_role',false), " +
        "set_config('request.jwt.claim.sub','',false), " +
        "set_config('request.is_admin','false',false), " +
        "set_config('request.user_email','',false)",
      "-f", PLATFORM,
      "-f", SCHEMA,
    ], RUNTIME_ENV) : { ok: false, out: "first application failed" };
    report("B1) both DigitalOcean schema files are idempotent",
      reapplied.ok, reapplied.out.split(/\r?\n/).slice(0, 8));

    if (applied.ok && reapplied.ok) {
      const nativeSchemas = sql(
        "select (to_regnamespace('auth') is null)||'|'||" +
          "(to_regnamespace('storage') is null);", DB, RUNTIME_ENV);
      report("B2) migration creates no auth/storage schema",
        nativeSchemas.ok && nativeSchemas.out === "true|true",
        { ok: nativeSchemas.ok, schemasAbsent: nativeSchemas.out });

      const forced = sql(
        "select string_agg(n.nspname||'.'||c.relname,',' order by n.nspname,c.relname) " +
        "from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
        "where (n.nspname,c.relname) in (" +
          "('public','profiles'),('public','payment_requests')," +
          "('public','app_settings'),('public','devices')," +
          "('public','hnk_auth_users'),('public','hnk_auth_refresh_tokens')," +
          "('public','hnk_storage_buckets')," +
          "('public','hnk_storage_objects')) " +
        "and c.relrowsecurity and c.relforcerowsecurity;",
        DB, RUNTIME_ENV);
      const expectedForced = [
        "public.app_settings",
        "public.devices",
        "public.hnk_auth_refresh_tokens",
        "public.hnk_auth_users",
        "public.hnk_storage_buckets",
        "public.hnk_storage_objects",
        "public.payment_requests",
        "public.profiles",
      ].join(",");
      report("C) all eight request/auth/session/storage tables FORCE RLS",
        forced.ok && forced.out === expectedForced,
        { ok: forced.ok, tables: forced.out });

      const contract = sql(
        "with expected(table_name,column_name) as (values " +
          "('hnk_auth_users','id'),('hnk_auth_users','email')," +
          "('hnk_auth_users','encrypted_password'),('hnk_auth_users','email_confirmed_at')," +
          "('hnk_auth_users','recovery_token'),('hnk_auth_users','recovery_sent_at')," +
          "('hnk_auth_refresh_tokens','token'),('hnk_auth_refresh_tokens','user_id')," +
          "('hnk_auth_refresh_tokens','expires_at'),('hnk_storage_buckets','id')," +
          "('hnk_storage_buckets','public'),('hnk_storage_objects','bucket_id')," +
          "('hnk_storage_objects','name'),('hnk_storage_objects','owner')," +
          "('hnk_storage_objects','mime_type'),('hnk_storage_objects','data')) " +
        "select count(*)||'|'||" +
          "(to_regprocedure('public.hnk_uid()') is not null)||'|'||" +
          "(to_regprocedure('public.hnk_foldername(text)') is not null) " +
        "from expected e left join information_schema.columns c " +
          "on c.table_schema='public' and c.table_name=e.table_name " +
          "and c.column_name=e.column_name where c.column_name is null;",
        DB, RUNTIME_ENV);
      report("D) auth/session/storage relations retain the server API contract",
        contract.ok && contract.out === "0|true|true",
        { ok: contract.ok, contract: contract.out });

      const seeded = serviceSql(
        "insert into public.hnk_auth_users(id,email,encrypted_password) values (" +
          "'" + USER_ID + "','probe@example.test','password-hash'); " +
        "insert into public.hnk_auth_refresh_tokens(token,user_id,expires_at) values (" +
          "'session-probe','" + USER_ID + "',now()+interval '1 day'); " +
        "insert into public.hnk_storage_objects(bucket_id,name,owner,mime_type,data) values (" +
          "'payment-proofs','" + USER_ID + "/proof.png','" + USER_ID +
          "','image/png',decode('89504e47','hex')); " +
        "select u.email||'|'||t.token||'|'||o.mime_type||'|'||encode(o.data,'hex') " +
          "from public.hnk_auth_users u " +
          "join public.hnk_auth_refresh_tokens t on t.user_id=u.id " +
          "join public.hnk_storage_objects o on o.owner=u.id;");
      report("E) service-context auth, session, and storage queries remain API-compatible",
        seeded.ok && lastLine(seeded) ===
          "probe@example.test|session-probe|image/png|89504e47",
        { ok: seeded.ok, result: lastLine(seeded) });

      const bare = sql(
        "select (select count(*) from public.hnk_auth_users)||'|'||" +
          "(select count(*) from public.hnk_auth_refresh_tokens)||'|'||" +
          "(select count(*) from public.hnk_storage_buckets)||'|'||" +
          "(select count(*) from public.hnk_storage_objects);",
        DB, RUNTIME_ENV);
      report("F) the same runtime sees no protected rows without service context",
        bare.ok && bare.out === "0|0|0|0",
        { ok: bare.ok, rows: bare.out });

      const legacyFixture = sql(
        "create schema auth; create table auth.users(id uuid primary key);", DB);
      const legacyAttempt = legacyFixture.ok
        ? psql(["-d", DB, "-f", PLATFORM], RUNTIME_ENV)
        : { ok: false, out: "legacy fixture failed" };
      report("G) an initialized old dialect is refused before any silent account switch",
        legacyFixture.ok && !legacyAttempt.ok &&
          /legacy auth\/storage tables detected/i.test(legacyAttempt.out),
        { fixture: legacyFixture.ok, accepted: legacyAttempt.ok,
          error: legacyAttempt.out.split(/\r?\n/).slice(0, 3) });
    }
  }
} finally {
  requireOk("cleanup drops the scratch database",
    sql('drop database if exists "' + DB + '"'));
  requireOk("cleanup drops the scratch runtime role",
    sql('drop role if exists "' + RUNTIME + '"'));
}

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
