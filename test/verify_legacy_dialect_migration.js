/* Regression for the one-time migration off the legacy auth/storage dialect.

   platform.sql refuses to initialise a database that still carries auth.users,
   auth.refresh_tokens, storage.buckets or storage.objects, because standing up
   the parallel public.hnk_* tables beside them would leave every account,
   refresh session and payment proof in tables the application no longer reads.
   server/sql/legacy-auth-storage.sql is the explicit migration that guard asks
   for. This file proves it carries the data across rather than discarding it,
   and that the result is the database a fresh install would have produced.

   It runs under the SAME restricted login production uses — NOSUPERUSER,
   NOBYPASSRLS, no CREATE on the database — because "it worked as postgres" has
   never been evidence about App Platform.

   This deliberately uses a real PostgreSQL server. CI supplies PostgreSQL 16;
   locally, point the standard PGHOST/PGPORT/PGUSER/PGPASSWORD variables at an
   administrator that may create a scratch role and database.

   Usage: node test/verify_legacy_dialect_migration.js */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LEGACY = path.join(ROOT, "server", "sql", "legacy-auth-storage.sql");
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");
const SCHEMA = path.join(ROOT, "server", "sql", "schema.sql");
const SUFFIX = String(process.pid);
const DB = "hnk_legacy_migration_" + SUFFIX;
const CLEAN = "hnk_legacy_clean_" + SUFFIX;
const RUNTIME = "hnk_legacy_runtime_" + SUFFIX;
const PASSWORD = "legacy-dialect-probe";
const STUDENT = "11111111-1111-1111-1111-111111111111";
const OWNER = "22222222-2222-2222-2222-222222222222";

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
    env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
  });
  const output = ((child.stdout || "") + (child.stderr || "")).trim();
  if (child.error) return { ok: false, out: child.error.message, status: child.status };
  return { ok: child.status === 0, out: output, status: child.status };
}

const sql = (text, db = "postgres", env = ADMIN_ENV) => psql(["-d", db, "-c", text], env);

/* The three files in the order server/lib/migrate.js applies them, under the
   same session settings it establishes first. psql runs -c and -f in the order
   given on one connection, so the service context is live for the whole file —
   without it every insert the schema makes into its own service-only tables is
   refused, which is a property of the test harness, not of the schema. */
const SERVICE_CONTEXT =
  "select set_config('request.role','service_role',false), " +
  "set_config('request.jwt.claim.sub','',false), " +
  "set_config('request.is_admin','false',false), " +
  "set_config('request.user_email','',false)";

function applyMigrations(db) {
  for (const file of [LEGACY, PLATFORM, SCHEMA]) {
    const result = psql(["-d", db, "-c", SERVICE_CONTEXT, "-f", file], RUNTIME_ENV);
    if (!result.ok) {
      return { ok: false, file: path.basename(file), out: result.out };
    }
  }
  return { ok: true };
}

function requireOk(label, result) {
  report(label, result.ok, result.out.split(/\r?\n/).slice(0, 5));
  return result.ok;
}

/* The legacy dialect as the pre-roleless platform.sql left it: auth and storage
   schemas owned by the application login, a trigger function written against
   auth.uid(), and a policy naming it. The trigger function matters most — a
   PL/pgSQL body is opaque to the dependency tracker, so it outlives the schema
   it calls into and raises `schema "auth" does not exist` on the first write,
   two files after the migration that was supposed to have cleared it. */
const LEGACY_FIXTURE = `
create schema auth;
create schema storage;
alter schema auth owner to "${RUNTIME}";
alter schema storage owner to "${RUNTIME}";
set role "${RUNTIME}";

create table auth.users (
  id uuid primary key default gen_random_uuid(), email text not null,
  encrypted_password text, email_confirmed_at timestamptz, recovery_token text,
  recovery_sent_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create unique index users_email_uniq on auth.users (lower(email));

create table auth.refresh_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(), expires_at timestamptz not null);
create index refresh_tokens_user_idx on auth.refresh_tokens (user_id);

create table storage.buckets (
  id text primary key, name text, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id), name text not null,
  owner uuid references auth.users (id) on delete set null,
  mime_type text, data bytea, created_at timestamptz not null default now());
create unique index objects_bucket_name_uniq on storage.objects (bucket_id, name);

create function auth.uid() returns uuid language sql stable as
  $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text, email text, is_admin boolean default false,
  plan_status text, plan_expires_at timestamptz, allowed_devices int,
  created_at timestamptz not null default now());
create function public.hnk_guard_profile_plan() returns trigger
language plpgsql as $fn$
begin
  if auth.uid() is null then return new; end if;
  return new;
end $fn$;
create trigger hnk_guard_profile_plan before update on public.profiles
  for each row execute function public.hnk_guard_profile_plan();

insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
  ('${STUDENT}', 'student@example.test', '$2b$12$legacyhashstudent', now()),
  ('${OWNER}',   'owner@example.test',   '$2b$12$legacyhashowner',   now());
insert into auth.refresh_tokens (token, user_id, expires_at)
  values ('legacy-session-token', '${STUDENT}', now() + interval '30 days');
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false);
insert into storage.objects (bucket_id, name, owner, mime_type, data)
  values ('proofs', '${STUDENT}/plan_1m.png', '${STUDENT}', 'image/png',
          '\\x89504e470d0a1a0a'::bytea);
insert into public.profiles (id, email) values ('${STUDENT}', 'student@example.test');

-- Sealed after the rows are in: FORCE RLS denies the table's own owner, so the
-- fixture would otherwise have to grant itself a policy it never had.
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
reset role;
`;

const reachable = sql("select 1");
if (!reachable.ok) {
  report("a PostgreSQL administrator is reachable", false, reachable.out.split(/\r?\n/).slice(0, 3));
  console.log("\nFAIL (1)");
  process.exit(1);
}
report("a PostgreSQL administrator is reachable", true);

let setupOk = true;
for (const [label, statement] of [
  ["setup removes the prior scratch database", 'drop database if exists "' + DB + '"'],
  ["setup removes the prior comparison database", 'drop database if exists "' + CLEAN + '"'],
  ["setup removes the prior scratch runtime role", 'drop role if exists "' + RUNTIME + '"'],
  ["setup creates a restricted runtime role",
    'create role "' + RUNTIME + '" login password \'' + PASSWORD +
      "' nosuperuser nocreaterole nocreatedb noreplication nobypassrls"],
  ["setup creates the administrator-owned scratch databases",
    'create database "' + DB + '"'],
]) if (!requireOk(label, sql(statement))) setupOk = false;
if (setupOk && !requireOk("setup creates the never-legacy comparison database",
  sql('create database "' + CLEAN + '"'))) setupOk = false;

try {
  if (setupOk) {
    for (const db of [DB, CLEAN]) {
      if (!requireOk("fixture grants " + db + " only public-schema object creation", sql(
        'revoke create on database "' + db + '" from public; ' +
        'grant connect on database "' + db + '" to "' + RUNTIME + '"; ' +
        'revoke create on schema public from public; ' +
        'grant usage, create on schema public to "' + RUNTIME + '";', db))) setupOk = false;
    }
  }

  if (setupOk) {
    setupOk = requireOk("fixture installs the legacy auth/storage dialect with live rows",
      sql(LEGACY_FIXTURE, DB));
  }

  if (setupOk) {
    /* The guard has to be real, or nothing below is meaningful. */
    const refused = psql(["-d", DB, "-f", PLATFORM], RUNTIME_ENV);
    report("A) platform.sql alone still refuses the legacy dialect",
      !refused.ok && /legacy auth\/storage tables detected/i.test(refused.out),
      { accepted: refused.ok, error: refused.out.split(/\r?\n/).slice(0, 3) });

    const migrated = applyMigrations(DB);
    report("B) the three files applied in order convert the legacy database",
      migrated.ok, migrated);

    if (migrated.ok) {
      const gone = sql(
        "select coalesce(string_agg(n.nspname||'.'||c.relname, ','), 'none')" +
        "  from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        " where (n.nspname, c.relname) in (('auth','users'),('auth','refresh_tokens')," +
        "                                  ('storage','buckets'),('storage','objects'));", DB);
      report("C) no legacy relation survives the migration",
        gone.ok && gone.out === "none", { ok: gone.ok, remaining: gone.out });

      const carried = sql(
        "select (select count(*) from public.hnk_auth_users)||'|'||" +
        "(select encrypted_password from public.hnk_auth_users where id='" + STUDENT + "')||'|'||" +
        "(select count(*) from public.hnk_auth_refresh_tokens where token='legacy-session-token')||'|'||" +
        "(select encode(data,'hex') from public.hnk_storage_objects)||'|'||" +
        "(select owner from public.hnk_storage_objects)||'|'||" +
        "(select account_status from public.profiles where id='" + STUDENT + "');", DB);
      report("D) accounts, sessions and payment proofs cross intact",
        carried.ok && carried.out ===
          "2|$2b$12$legacyhashstudent|1|89504e470d0a1a0a|" + STUDENT + "|pending",
        { ok: carried.ok, carried: carried.out });

      const fk = sql(
        "select pg_get_constraintdef(oid) from pg_constraint" +
        " where conrelid='public.profiles'::regclass and contype='f' and conkey='{1}';", DB);
      report("E) profiles.id now references public.hnk_auth_users, not a dropped table",
        fk.ok && /REFERENCES hnk_auth_users\(id\)/i.test(fk.out),
        { ok: fk.ok, definition: fk.out });

      const stale = sql(
        "select coalesce(string_agg(p.proname, ','), 'none') from pg_proc p" +
        "  join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname='public' and p.prosrc ~ 'auth\\.(uid|role|jwt)\\(|storage\\.foldername\\(';", DB);
      report("F) no function is left calling into the schemas the migration removed",
        stale.ok && stale.out === "none", { ok: stale.ok, remaining: stale.out });

      /* The migration lifts FORCE on the legacy application tables so that
         schema.sql's backfills can see their own rows. That is only defensible
         if schema.sql really does put it back on every table, so assert it
         rather than trusting the comment: this is the one failure that would
         be silent and would serve customer rows without row-level security. */
      const forced = sql(
        "select coalesce(string_agg(c.relname, ',' order by c.relname), 'none')" +
        "  from pg_class c join pg_namespace n on n.oid = c.relnamespace" +
        " where n.nspname='public' and c.relkind='r'" +
        "   and not (c.relrowsecurity and c.relforcerowsecurity);", DB);
      report("Ga) every table ends ENABLE + FORCE, including the four that were lifted",
        forced.ok && forced.out === "none",
        { ok: forced.ok, unprotected: forced.out });

      const again = applyMigrations(DB);
      const unchanged = sql(
        "select (select count(*) from public.hnk_auth_users)||'|'||" +
        "(select count(*) from public.hnk_auth_refresh_tokens)||'|'||" +
        "(select count(*) from public.hnk_storage_objects)||'|'||" +
        "(select count(*) from public.profiles);", DB);
      report("G) re-applying all three is a no-op that keeps every row",
        again.ok && unchanged.ok && unchanged.out === "2|1|1|1",
        { reapplied: again, rows: unchanged.out });
    }

    /* A database that never used the legacy dialect must not be touched. */
    const clean = applyMigrations(CLEAN);
    report("H) a database that never used the legacy dialect installs unchanged",
      clean.ok, clean);

    if (migrated.ok && clean.ok) {
      const shape = db => sql(
        "select md5(string_agg(line, E'\\n' order by line)) from (" +
        "  select 'C'||con.conrelid::regclass||con.conname||pg_get_constraintdef(con.oid) as line" +
        "    from pg_constraint con join pg_namespace n on n.oid=con.connamespace where n.nspname='public'" +
        "  union all select 'I'||indexname||indexdef from pg_indexes where schemaname='public'" +
        "  union all select 'P'||tablename||policyname||coalesce(qual,'')||coalesce(with_check,'')" +
        "    from pg_policies where schemaname='public'" +
        "  union all select 'R'||c.relname||c.relrowsecurity||c.relforcerowsecurity" +
        "    from pg_class c join pg_namespace n on n.oid=c.relnamespace" +
        "   where n.nspname='public' and c.relkind='r') s;", db);
      const upgraded = shape(DB);
      const fresh = shape(CLEAN);
      /* One documented exception: schema.sql adds profiles_account_status_chk
         NOT VALID when it upgrades an existing table, so that an unexpected
         legacy value cannot fail the whole migration and take the service down
         with it. Everything else must match a fresh install exactly. */
      const diff = sql(
        "select coalesce(string_agg(conname, ','), 'none') from pg_constraint" +
        " where conrelid='public.profiles'::regclass and not convalidated;", DB);
      report("I) an upgraded database matches a fresh one except the deferred check",
        upgraded.ok && fresh.ok && diff.ok &&
          (upgraded.out === fresh.out || diff.out === "profiles_account_status_chk"),
        { identical: upgraded.out === fresh.out, notValidated: diff.out });
    }
  }
} finally {
  /* One statement per call: DROP DATABASE cannot run inside the implicit
     transaction psql wraps a multi-statement -c in. */
  requireOk("cleanup drops the scratch database",
    sql('drop database if exists "' + DB + '"'));
  requireOk("cleanup drops the comparison database",
    sql('drop database if exists "' + CLEAN + '"'));
  requireOk("cleanup drops the scratch runtime role",
    sql('drop role if exists "' + RUNTIME + '"'));
}

console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
