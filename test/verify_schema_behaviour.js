/* Schema behaviour — the half verify_rls_contract.js says it cannot do.

   WHY THIS FILE EXISTS. verify_rls_contract.js reads two files and says so in
   its own header: "it does not connect to Supabase. It therefore proves the
   schema is internally complete and consistent, not that the owner has run
   it." That leaves a real gap. A policy can be present, correctly shaped, and
   still not do what its name claims — and three releases in a row went 95/95
   green with defects inside, because every check read what the file SAYS.

   This file applies supabase/schema.sql to a real PostgreSQL database and
   attacks it. It found two things the static checks could not:

     * The file could not build the database it protects. Every statement
       ALTERed; none CREATEd. Applying it to a project without the tables died
       on statement one with 42P01, before a single policy existed.
     * The device cap counted a re-registration as a new device. The unique
       index was documented as making a second POST "a no-op collision instead
       of a new row", but a BEFORE INSERT trigger runs before any index is
       consulted, so at the cap a customer re-registering a browser they
       ALREADY owned was told to delete one.

   WHAT IT NEEDS. A PostgreSQL server it may create scratch databases on. CI
   supplies one as a service container. Locally:

       docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16

   Connection comes from the standard PG* environment variables (PGHOST,
   PGPORT, PGUSER, PGPASSWORD), defaulting to localhost:5432/postgres.

   IT DOES NOT SKIP. A test that quietly passes when it cannot reach a database
   certifies nothing, which is worse than not existing. With no server it FAILS
   and says how to start one.

   WHAT IT STILL CANNOT DO. Supabase's own auth and storage schemas are stood
   in for by a minimal stub below (auth.users, auth.uid(), storage.buckets /
   objects / foldername). It proves the schema's logic, not Supabase's.

   Usage: node test/verify_schema_behaviour.js */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCHEMA = path.join(ROOT, "supabase", "schema.sql");
const DB = "hnk_schema_behaviour_test";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "localhost",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});

/* Run SQL, return {ok, out}. Never throws — a refused statement is frequently
   the expected result here, so the caller decides what a failure means. */
function sql(text, db) {
  const args = ["-d", db || "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", text];
  try {
    return { ok: true, out: execFileSync("psql", args, { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, out: ((e.stderr || "") + (e.stdout || "")).trim() };
  }
}
function file(p, db) {
  try {
    execFileSync("psql", ["-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-f", p],
      { env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: "" };
  } catch (e) { return { ok: false, out: ((e.stderr || "") + (e.stdout || "")).trim() }; }
}
/* As a signed-in customer: RLS applies and auth.uid() answers. Both settings
   must be SET LOCAL inside a transaction — outside one they are a no-op that
   silently leaves you as superuser with a null uid, which makes every "the
   attack was refused" assertion pass for the wrong reason. */
function asUser(uid, body, db) {
  return sql("begin; set local role authenticated; set local request.jwt.claim.sub = '" + uid + "'; " + body + " commit;", db);
}
function asAnon(body, db) {
  return sql("begin; set local role anon; " + body + " commit;", db);
}

/* The platform objects supabase/schema.sql leans on. This used to be a stub
   written here; it is now the REAL file the service ships and the owner
   applies, so this test proves the shipped platform schema works rather than a
   hand-written stand-in that could drift from it. */
const PLATFORM = path.join(ROOT, "server", "sql", "platform.sql");

const OWNER = "11111111-1111-1111-1111-111111111111";
const CUST  = "22222222-2222-2222-2222-222222222222";
const NEWBIE= "33333333-3333-3333-3333-333333333333";
const TWIN  = "44444444-4444-4444-4444-444444444444";

/* ---- reachable? ---- */
const ping = sql("select 1");
if (!ping.ok) {
  console.log("FAIL — a PostgreSQL server is reachable");
  console.log("       :: " + ping.out.split("\n")[0]);
  console.log("");
  console.log("       This file deliberately does not skip. Start one with:");
  console.log("         docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16");
  console.log("       or point PGHOST/PGPORT/PGUSER/PGPASSWORD at an existing server.");
  console.log("\nFAIL (1)");
  process.exit(1);
}
report("a PostgreSQL server is reachable", true);

sql('drop database if exists "' + DB + '"');
sql('create database "' + DB + '"');
const stubbed = file(PLATFORM, DB);
report("server/sql/platform.sql loads (auth.users, auth.uid, storage, roles)",
  stubbed.ok, stubbed.out.split("\n").slice(0, 3));

/* ---- A) it builds a database from nothing ---- */
const first = file(SCHEMA, DB);
report("A) schema.sql applies to an EMPTY database", first.ok, first.out.split("\n").slice(0, 4));

/* ---- B) ...repeatedly ---- */
const second = file(SCHEMA, DB), third = file(SCHEMA, DB);
report("B) it is idempotent (three consecutive runs)", second.ok && third.ok,
  { second: second.out.split("\n").slice(0, 2), third: third.out.split("\n").slice(0, 2) });

/* ---- C) the singleton seed does not multiply ---- */
const rows = sql("select count(*) from public.app_settings", DB).out;
report("C) app_settings still holds exactly one row after three runs", rows === "1", { rows });

/* ---- D) RLS is on everywhere the client reaches ---- */
const rls = sql("select count(*) from pg_tables where schemaname='public' and rowsecurity " +
  "and tablename in ('profiles','payment_requests','app_settings','devices')", DB).out;
report("D) RLS is enabled on all four tables", rls === "4", { withRls: rls });

/* seed two accounts; the app creates its own profiles row (v5.38.0) */
sql("insert into auth.users (id,email) values ('" + OWNER + "','owner@example.com'),('" + CUST + "','customer@example.com')", DB);
sql("insert into public.profiles (id,email,name) values ('" + OWNER + "','owner@example.com','Owner'),('" + CUST + "','customer@example.com','Customer')", DB);

/* ---- E) the bootstrap the README hands out actually works ---- */
sql("update public.profiles set is_admin = true where email='owner@example.com'", DB);
const admin = sql("select is_admin from public.profiles where email='owner@example.com'", DB).out;
report("E) the SQL-editor bootstrap (no JWT) can create the first admin", admin === "t", { is_admin: admin });

/* ---- F) a customer cannot promote themselves ----
   NOTE ON BOOLEANS: psql -t -A prints a bare boolean column as t/f, but a
   boolean concatenated with || is cast to text as true/false. These composite
   assertions therefore expect true/false; check E, which selects the column on
   its own, expects t. Getting this backwards makes the check fail against a
   perfectly correct schema. */
asUser(CUST, "update public.profiles set is_admin=true, plan_status='active', " +
  "plan_expires_at=now()+interval '99 years', allowed_devices=99, joined_paid=true, price_1m_override=0 " +
  "where id = auth.uid();", DB);
const after = sql("select is_admin||'|'||plan_status||'|'||allowed_devices||'|'||joined_paid||'|'||" +
  "coalesce(price_1m_override::text,'null')||'|'||coalesce(plan_expires_at::text,'null') " +
  "from public.profiles where id='" + CUST + "'", DB).out;
report("F) a customer promoting themselves has every field reverted",
  after === "false|none|2|false|null|null", { after });

/* ---- G) identity is not the customer's to edit ----
   The address here must be one NOBODY holds. Pointing it at owner@example.com
   made this check pass without the guard doing anything: profiles_email_uniq
   refuses the duplicate first, so the assertion held even with the guard
   trigger dropped. An unused address leaves the unique index with no opinion,
   so the only thing that can preserve the row is the guard. */
asUser(CUST, "update public.profiles set email='stolen@example.com', name='Somebody Else' where id = auth.uid();", DB);
const ident = sql("select email||'|'||name from public.profiles where id='" + CUST + "'", DB).out;
report("G) a customer cannot rewrite their own email or name",
  ident === "customer@example.com|Customer", { ident });

/* ---- H) a customer cannot approve their own payment ---- */
asUser(CUST, "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'plan_1m','123456',30000);", DB);
asUser(CUST, "update public.payment_requests set status='approved';", DB);
const stat = sql("select status from public.payment_requests", DB).out;
report("H) a customer cannot approve their own payment", stat === "pending", { status: stat });

/* ---- I) nor forge one that arrives already reviewed ---- */
const forge = asUser(CUST, "insert into public.payment_requests (user_id,kind,status,reviewed_by,note) " +
  "values (auth.uid(),'plan_6m','approved','" + OWNER + "','approved by owner');", DB);
report("I) a forged already-reviewed row is refused", !forge.ok && /row-level security/i.test(forge.out),
  { accepted: forge.ok, err: forge.out.split("\n")[0] });

/* ---- J) an admin approval extends the plan, in the database ---- */
asUser(OWNER, "update public.payment_requests set status='approved', reviewed_at=now(), " +
  "reviewed_by=auth.uid() where status='pending';", DB);
const plan = sql("select plan_status||'|'||(plan_expires_at between now()+interval '27 days' " +
  "and now()+interval '32 days') from public.profiles where id='" + CUST + "'", DB).out;
report("J) an admin approval extends the plan by one month", plan === "active|true", { plan });

/* ---- K) the device cap ---- */
asUser(CUST, "insert into public.devices (user_id,device_id,label) values (auth.uid(),'dev-a','A');", DB);
asUser(CUST, "insert into public.devices (user_id,device_id,label) values (auth.uid(),'dev-b','B');", DB);
const third_dev = asUser(CUST, "insert into public.devices (user_id,device_id,label) values (auth.uid(),'dev-c','C');", DB);
report("K) a THIRD new device is refused at the default cap of two",
  !third_dev.ok && /device limit reached/i.test(third_dev.out), { err: third_dev.out.split("\n")[0] });

/* ---- L) ...but re-registering one you already have is not a new device ---- */
const again = asUser(CUST, "insert into public.devices (user_id,device_id,label) values (auth.uid(),'dev-a','A again');", DB);
const devCount = sql("select count(*) from public.devices where user_id='" + CUST + "'", DB).out;
report("L) re-registering an existing device at the cap is a silent no-op",
  again.ok && devCount === "2", { accepted: again.ok, devices: devCount, err: again.out.split("\n")[0] });

/* ---- M) the bank details are readable by everyone and writable by nobody ---- */
const anonRead = asAnon("select count(*) from public.app_settings;", DB);
report("M) anon may READ app_settings (the buy screen quotes prices signed-out)", anonRead.ok,
  { err: anonRead.out.split("\n")[0] });
const anonWrite = asAnon("update public.app_settings set payment_phone='09-ATTACKER';", DB);
report("M2) anon may NOT redirect the payment details", !anonWrite.ok, { accepted: anonWrite.ok });
const custWrite = asUser(CUST, "update public.app_settings set price_1m = 1;", DB);
report("M3) a signed-in customer may NOT rewrite prices either", !custWrite.ok, { accepted: custWrite.ok });

/* ---- N) row visibility ---- */
const own = asUser(CUST, "select count(*) from public.profiles;", DB);
const all = asUser(OWNER, "select count(*) from public.profiles;", DB);
report("N) a customer sees only their own profile; an admin sees every one",
  /(^|\n)1(\n|$)/.test(own.out) && /(^|\n)2(\n|$)/.test(all.out),
  { customerSees: own.out.trim(), adminSees: all.out.trim() });

/* ---- O) the v5.38.0 self-heal on a database this file built ---- */
sql("insert into auth.users (id,email) values ('" + NEWBIE + "','NewCustomer@Example.com')", DB);
const heal = asUser(NEWBIE, "insert into public.profiles (id) values (auth.uid());", DB);
const healed = sql("select email||'|'||plan_status||'|'||allowed_devices||'|'||is_admin||'|'||joined_paid " +
  "from public.profiles where id='" + NEWBIE + "'", DB).out;
report("O) accEnsureProfile's insert of {id} alone yields a complete free-tier row",
  heal.ok && healed === "NewCustomer@Example.com|none|2|false|false", { healed, err: heal.out.split("\n")[0] });

/* ---- P) one address, one account, refused at BOTH layers ----

   On Supabase the duplicate first became visible at profiles_email_uniq,
   because auth.users was the platform's private table. server/sql/platform.sql
   owns it now and carries users_email_uniq on lower(email), so a second signup
   for the same address in another letter case is refused a layer EARLIER — the
   account is never created at all, which is the better place to stop it.

   Both are asserted. The auth-layer index is what a real signup hits; the
   profiles-layer index still has to exist, because it is what protects admGrant
   from an arbitrary `limit=1` pick if a row ever reaches profiles by another
   route (a manual insert, a migration, an import from the old project). */
const twinUser = sql("insert into auth.users (id,email) values ('" + TWIN + "','newcustomer@EXAMPLE.com')", DB);
report("P) a second ACCOUNT claiming the same address in another case is refused",
  !twinUser.ok && /users_email_uniq/i.test(twinUser.out),
  { accepted: twinUser.ok, err: twinUser.out.split("\n")[0] });

const profIdx = sql("select count(*) from pg_indexes where schemaname='public' " +
  "and indexname='profiles_email_uniq'", DB).out;
report("P2) profiles keeps its own duplicate-address index as defence in depth",
  profIdx === "1", { found: profIdx });

sql('drop database if exists "' + DB + '"');

console.log("      (this file proves the schema ENFORCES what it claims, on a database it " +
  "built from nothing — it still cannot prove the owner has applied it to their project)");
console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
