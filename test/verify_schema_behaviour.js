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
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCHEMA = path.join(ROOT, "supabase", "schema.sql");
const DB = "hnk_schema_behaviour_test";
const REQUEST_ROLES = ["anon", "authenticated", "service_role"];

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
  /* Direct SQL below is trusted fixture/setup work. Once platform.sql has
     installed the marker, BEFORE triggers require the same explicit service
     context as production migrations; request helpers override it locally. */
  PGOPTIONS: [process.env.PGOPTIONS, "-c request.role=service_role"]
    .filter(Boolean).join(" "),
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
function mustFixture(label, result) {
  if (result.ok) return result;
  console.log("FAIL — " + label + "  :: " + JSON.stringify(result.out.split(/\r?\n/).slice(0, 3)));
  process.exit(1);
}
/* As a signed-in customer: the marker makes policies read the internal request
   context, while SET ROLE keeps this broad behaviour suite non-owner even
   though its fixture uses the CI postgres superuser. The production API never
   SETs a PostgreSQL role; verify_roleless_rls.js covers the real owner shape. */
function userTransaction(uid, body) {
  return "begin; " +
    "set local request.role = 'service_role'; " +
    "set local request.jwt.claim.sub = '" + uid + "'; " +
    "do $ctx$ begin " +
      "perform set_config('request.is_admin', coalesce((select is_admin::text from public.profiles where id='" + uid + "'),'false'), true); " +
      "perform set_config('request.user_email', coalesce((select email from auth.users where id='" + uid + "'),''), true); " +
    "end $ctx$; " +
    "set local request.role = 'authenticated'; " +
    "set local role authenticated; " + body + " commit;";
}
function asUser(uid, body, db) {
  return sql(userTransaction(uid, body), db);
}
function asAnon(body, db) {
  return sql("begin; set local request.role = 'anon'; set local request.jwt.claim.sub = ''; " +
    "set local request.is_admin = 'false'; set local request.user_email = ''; " +
    "set local role anon; " + body + " commit;", db);
}
function waitForAdvisory(lockId, db) {
  for (let wait = 0; wait < 50; wait++) {
    if (sql("select exists(select 1 from pg_locks where locktype='advisory' " +
      "and objid=" + lockId + ")", db).out === "t") return true;
    sql("select pg_sleep(0.05)", db);
  }
  return false;
}
function waitForAdvisoryRelease(lockId, db) {
  return sql("select pg_advisory_lock(" + lockId + "); " +
    "select pg_advisory_unlock(" + lockId + ")", db);
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

mustFixture("fixture removes the prior main scratch database",
  sql('drop database if exists "' + DB + '"'));
for (const role of REQUEST_ROLES) {
  mustFixture("fixture removes role " + role, sql("drop role if exists " + role));
  mustFixture("fixture creates role " + role, sql("create role " + role + " nologin"));
}
mustFixture("fixture creates a fresh main scratch database", sql('create database "' + DB + '"'));
const stubbed = file(PLATFORM, DB);
report("server/sql/platform.sql loads (auth.users, auth.uid, storage, roleless marker)",
  stubbed.ok, stubbed.out.split("\n").slice(0, 3));

/* ---- A) it builds a database from nothing ---- */
const first = file(SCHEMA, DB);
report("A) schema.sql applies to an EMPTY database", first.ok, first.out.split("\n").slice(0, 4));

/* ---- B) ...repeatedly ---- */
const second = file(SCHEMA, DB), third = file(SCHEMA, DB);
report("B) it is idempotent (three consecutive runs)", second.ok && third.ok,
  { second: second.out.split("\n").slice(0, 2), third: third.out.split("\n").slice(0, 2) });

/* Existing Supabase projects may inherit anon/authenticated DML grants from
   public-schema defaults. Simulate that upgraded-project state, reapply the
   schema, and require the explicit least-privilege repair to win. */
const inheritedGrants = sql("grant insert,update,delete on public.profiles,public.payment_requests," +
  "public.devices,public.app_settings to anon; " +
  "grant insert,update,delete on public.app_settings to authenticated", DB);
const privilegeRepair = file(SCHEMA, DB);
const repairedPrivileges = sql("select " +
  "has_table_privilege('anon','public.profiles','insert')||'|'||" +
  "has_table_privilege('anon','public.payment_requests','insert')||'|'||" +
  "has_table_privilege('anon','public.devices','insert')||'|'||" +
  "has_table_privilege('anon','public.app_settings','update')||'|'||" +
  "has_table_privilege('authenticated','public.app_settings','update')", DB).out;
report("B2) reapplying removes inherited anonymous/app-settings write grants",
  inheritedGrants.ok && privilegeRepair.ok && repairedPrivileges === "false|false|false|false|false",
  { granted: inheritedGrants.ok, reapplied: privilegeRepair.ok, privileges: repairedPrivileges });

/* ---- C) the singleton seed does not multiply ---- */
const rows = sql("select count(*) from public.app_settings", DB).out;
report("C) app_settings still holds exactly one row after three runs", rows === "1", { rows });

/* ---- D) RLS is on and forced everywhere the roleless service reaches ----
   ENABLE alone is not enough: the DigitalOcean connection owns these tables,
   and PostgreSQL table owners bypass ordinary RLS. */
const forcedRls = sql("select count(*) from pg_class c " +
  "join pg_namespace n on n.oid=c.relnamespace where " +
  "((n.nspname='public' and c.relname in ('profiles','payment_requests','app_settings','devices')) " +
  "or (n.nspname='storage' and c.relname='objects') " +
  "or (n.nspname='auth' and c.relname in ('users','refresh_tokens'))) " +
  "and c.relrowsecurity and c.relforcerowsecurity", DB).out;
report("D) all seven request/auth tables have ENABLE + FORCE RLS",
  forcedRls === "7", { forcedRls });

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

/* A payment product must have a configured server-side price. This keeps the
   early flat-price compatibility checks realistic while the tier-specific
   section below deliberately changes the menu and exercises both modes. */
sql("update public.app_settings set price_1m=30000", DB);

/* BEFORE triggers execute ahead of RLS. A definer trigger must therefore
   reject another user_id before reading that profile, and return the same
   answer whether the guessed account exists or not. */
const UNKNOWN_ACCOUNT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const anonPaymentExisting = asAnon(
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values ('" + OWNER + "','plan_1m','110001',30000);", DB);
const anonPaymentMissing = asAnon(
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values ('" + UNKNOWN_ACCOUNT + "','plan_1m','110002',30000);", DB);
const anonDeviceExisting = asAnon(
  "insert into public.devices (user_id,device_id,label) values ('" + OWNER + "','anon-a','A');", DB);
const anonDeviceMissing = asAnon(
  "insert into public.devices (user_id,device_id,label) values ('" + UNKNOWN_ACCOUNT + "','anon-b','B');", DB);
const anonProbeRows = sql("select (select count(*) from public.payment_requests)||'|'||" +
  "(select count(*) from public.devices)", DB).out;
report("G1) anon never enters account-reading BEFORE triggers for existing or missing IDs",
  !anonPaymentExisting.ok && !anonPaymentMissing.ok && !anonDeviceExisting.ok && !anonDeviceMissing.ok &&
  /permission denied for table payment_requests/i.test(anonPaymentExisting.out) &&
  /permission denied for table payment_requests/i.test(anonPaymentMissing.out) &&
  /permission denied for table devices/i.test(anonDeviceExisting.out) &&
  /permission denied for table devices/i.test(anonDeviceMissing.out) && anonProbeRows === "0|0",
  { paymentExisting: anonPaymentExisting.out.split("\n")[0],
    paymentMissing: anonPaymentMissing.out.split("\n")[0],
    deviceExisting: anonDeviceExisting.out.split("\n")[0],
    deviceMissing: anonDeviceMissing.out.split("\n")[0], rows: anonProbeRows });
const crossExisting = asUser(CUST,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values ('" + OWNER + "','plan_1m','120001',30000);", DB);
const crossMissing = asUser(CUST,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values ('" + UNKNOWN_ACCOUNT + "','plan_1m','120002',30000);", DB);
report("G2) forged cross-account payments reveal neither profile state nor existence",
  !crossExisting.ok && !crossMissing.ok &&
  /payment user does not match authenticated caller/i.test(crossExisting.out) &&
  /payment user does not match authenticated caller/i.test(crossMissing.out),
  { existing: crossExisting.out.split("\n")[0], missing: crossMissing.out.split("\n")[0] });

/* ---- H) a customer cannot approve their own payment ---- */
asUser(CUST, "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'plan_1m','123456',30000);", DB);
asUser(CUST, "update public.payment_requests set status='approved';", DB);
const stat = sql("select status from public.payment_requests", DB).out;
report("H) a customer cannot approve their own payment", stat === "pending", { status: stat });

/* ---- I) nor forge one that arrives already reviewed ---- */
const forge = asUser(CUST, "insert into public.payment_requests (user_id,kind,status,reviewed_by,note) " +
  "values (auth.uid(),'plan_1m','approved','" + OWNER + "','approved by owner');", DB);
report("I) a forged already-reviewed row is refused", !forge.ok && /row-level security/i.test(forge.out),
  { accepted: forge.ok, err: forge.out.split("\n")[0] });

/* ---- J) an admin approval extends the plan, in the database ---- */
asUser(OWNER, "update public.payment_requests set status='approved', reviewed_at=now(), " +
  "reviewed_by=auth.uid() where status='pending';", DB);
const plan = sql("select plan_status||'|'||(plan_expires_at between now()+interval '27 days' " +
  "and now()+interval '32 days') from public.profiles where id='" + CUST + "'", DB).out;
report("J) an admin approval extends the plan by one month", plan === "active|true", { plan });

/* ---- J2) the database, not the browser, owns the device-tier quote ----

   device_count is customer input: the REST endpoint accepts every live table
   column and the app is a public HTML file. The database must therefore decide
   whether tiers are active, whether the requested count has a configured price,
   and what that price was at submission time. A later settings edit must not
   rewrite the amount an admin is reviewing. */
const DEVBUYER = "55555555-5555-5555-5555-555555555555";
sql("insert into auth.users (id,email) values ('" + DEVBUYER + "','devbuyer@example.com')", DB);
asUser(DEVBUYER, "insert into public.profiles (id) values (auth.uid());", DB);
sql("update public.app_settings set price_join_first=480000, " +
    "price_device_1=511000, price_device_2=819000, price_device_3=1003000, " +
    "price_device_4=1207000, price_device_5=1411000, price_device_step=213000, " +
    "price_extra_device=17000, price_1m=11000, price_3m=29000, price_6m=55000", DB);
/* CUST bought a normal flat plan before any joining fee existed. The client
   and schema backfill both treat that payment history as already joined; a
   later tier rollout must not strand the account if the settings change before
   schema.sql is run again. */
const upgradedRenewal = asUser(CUST,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'plan_1m','222333',22000);", DB);
const upgradedAddon = asUser(CUST,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'extra_device','222334',17000);", DB);
const upgradedQuotes = sql("select string_agg(kind||':'||pricing_mode||':'||quoted_amount_mmk,',' order by kind) " +
  "from public.payment_requests where user_id='" + CUST + "' and status='pending'", DB).out;
report("J2) a pre-tier paid account can renew and add a slot after tiers are enabled",
  upgradedRenewal.ok && upgradedAddon.ok &&
  upgradedQuotes === "extra_device:tier:17000,plan_1m:tier:22000",
  { renewal: upgradedRenewal.ok, addOn: upgradedAddon.ok, stored: upgradedQuotes });
sql("delete from public.payment_requests where user_id='" + CUST + "' and status='pending'", DB);
const quoteOracle = asUser(DEVBUYER,
  "select * from public.hnk_payment_quote('" + OWNER + "','plan_1m',null,false);", DB);
report("J2) the internal quote function is not a cross-account price oracle",
  !quoteOracle.ok && /permission denied for function hnk_payment_quote/i.test(quoteOracle.out),
  { callable: quoteOracle.ok, err: quoteOracle.out.split("\n")[0] });
asUser(DEVBUYER, "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','654321',1003000,3);", DB);
const tierQuote = sql("select pricing_mode||'|'||quoted_amount_mmk||'|'||device_count " +
  "from public.payment_requests where user_id='" + DEVBUYER + "'", DB).out;
report("J2) a tiered request stores a server-authored mode, quote and bounded count",
  tierQuote === "tier|1003000|3", { stored: tierQuote });

/* A forged quote/mode is overwritten, never trusted. The customer may claim a
   different amount sent — admins deliberately review mismatches — but cannot
   rewrite what the configured product cost. */
const QUOTEBUYER = "77777777-7777-7777-7777-777777777777";
sql("insert into auth.users (id,email) values ('" + QUOTEBUYER + "','quote@example.com')", DB);
asUser(QUOTEBUYER, "insert into public.profiles (id) values (auth.uid());", DB);
const forgedQuote = asUser(QUOTEBUYER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count,pricing_mode,quoted_amount_mmk) " +
  "values (auth.uid(),'join_first','777777',1,6,'flat',1);", DB);
const storedQuote = sql("select amount_mmk||'|'||pricing_mode||'|'||quoted_amount_mmk from public.payment_requests " +
  "where user_id='" + QUOTEBUYER + "'", DB).out;
report("J2b) customer-supplied quote fields are overwritten from authoritative settings",
  forgedQuote.ok && storedQuote === "1|tier|1624000", { accepted: forgedQuote.ok, stored: storedQuote });

/* The quote is a snapshot. Changing today's menu must not change yesterday's
   pending request or the amount the approval queue compares against. */
const priceChanged = sql("update public.app_settings set price_device_3=1999000", DB);
const stableQuote = sql("select quoted_amount_mmk from public.payment_requests " +
  "where user_id='" + DEVBUYER + "'", DB).out;
const livePrice = sql("select price_device_3 from public.app_settings", DB).out;
report("J2c) a pending request keeps its original server quote after prices change",
  priceChanged.ok && livePrice === "1999000" && stableQuote === "1003000",
  { changed: priceChanged.ok, livePrice, quote: stableQuote });

asUser(OWNER, "update public.payment_requests set status='approved', reviewed_at=now(), " +
  "reviewed_by=auth.uid() where user_id='" + DEVBUYER + "' and status='pending';", DB);
const tierDevCount = sql("select allowed_devices from public.profiles where id='" + DEVBUYER + "'", DB).out;
report("J2d) approving the tiered bundle sets its exact device entitlement",
  tierDevCount === "3", { allowed_devices: tierDevCount });

/* A tiered add-on is not a substitute for the base bundle. Once the bundle is
   approved it increments exactly once, and the approved audit row becomes
   immutable. A separate valid rejected-row replay proof follows below. */
const tierAddonInsert = asUser(DEVBUYER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'extra_device','333444',17000);", DB);
const tierAddonPending = sql("select count(*) from public.payment_requests where user_id='" + DEVBUYER +
  "' and kind='extra_device' and status='pending'", DB).out;
asUser(OWNER, "update public.payment_requests set status='approved', reviewed_at=now(), " +
  "reviewed_by=auth.uid() where user_id='" + DEVBUYER + "' and kind='extra_device' and status='pending';", DB);
const afterExtra = sql("select allowed_devices from public.profiles where id='" + DEVBUYER + "'", DB).out;
const terminalFlip = asUser(OWNER, "update public.payment_requests set status='rejected' " +
  "where user_id='" + DEVBUYER + "' and kind='extra_device' and status='approved';", DB);
const serviceRewrite = sql("update public.payment_requests set amount_mmk=1 " +
  "where user_id='" + DEVBUYER + "' and kind='extra_device' and status='approved';", DB);
const afterReplay = sql("select allowed_devices from public.profiles where id='" + DEVBUYER + "'", DB).out;
report("J2e) add-on increments once and terminal audit rows are immutable for every caller",
  tierAddonInsert.ok && tierAddonPending === "1" && afterExtra === "4" &&
  !terminalFlip.ok && !serviceRewrite.ok && afterReplay === "4",
  { inserted: tierAddonInsert.ok, pending: tierAddonPending, afterExtra,
    flipAccepted: terminalFlip.ok, serviceRewrite: serviceRewrite.ok, afterReplay });

const secondJoin = asUser(DEVBUYER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','333445',1999000,3);", DB);
report("J2f) an existing entitlement cannot be reset by filing a second bundle",
  !secondJoin.ok, { accepted: secondJoin.ok, err: secondJoin.out.split("\n")[0] });

/* Re-check the maximum at approval, not only submission: an allowance can
   change while a request is waiting in the admin queue. */
sql("update public.profiles set allowed_devices=9 where id='" + DEVBUYER + "'", DB);
const queuedAddonInsert = asUser(DEVBUYER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'extra_device','333446',17000);", DB);
const queuedAddonPending = sql("select count(*) from public.payment_requests where user_id='" + DEVBUYER +
  "' and kind='extra_device' and status='pending'", DB).out;
sql("update public.profiles set allowed_devices=10 where id='" + DEVBUYER + "'", DB);
const approveAtMax = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + DEVBUYER + "' and kind='extra_device' and status='pending';", DB);
const atMaxState = sql("select status from public.payment_requests where user_id='" + DEVBUYER + "' " +
  "and kind='extra_device' and status='pending'", DB).out;
const atMaxCount = sql("select allowed_devices from public.profiles where id='" + DEVBUYER + "'", DB).out;
report("J2g) a queued add-on cannot cross the tier maximum during approval",
  queuedAddonInsert.ok && queuedAddonPending === "1" && !approveAtMax.ok &&
  atMaxState === "pending" && atMaxCount === "10",
  { inserted: queuedAddonInsert.ok, pending: queuedAddonPending,
    approved: approveAtMax.ok, status: atMaxState, allowed_devices: atMaxCount });
const grantPastMax = asUser(OWNER,
  "insert into public.payment_requests (user_id,kind,is_grant,amount_mmk) " +
  "values ('" + DEVBUYER + "','extra_device',true,0);", DB);
const grantAddOnRows = sql("select count(*) from public.payment_requests where user_id='" + DEVBUYER +
  "' and kind='extra_device' and is_grant", DB).out;
report("J2g2) a free admin grant cannot bypass the paid tier base/max rules",
  !grantPastMax.ok && grantAddOnRows === "0",
  { accepted: grantPastMax.ok, grantRows: grantAddOnRows });

/* A baseline account can already have two registered devices. Buying a
   one-device bundle must not leave two active registrations behind a cap of
   one, so approval fails atomically until the customer reconciles them. */
const SMALLBUYER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
sql("insert into auth.users (id,email) values ('" + SMALLBUYER + "','small@example.com')", DB);
asUser(SMALLBUYER, "insert into public.profiles (id) values (auth.uid());", DB);
asUser(SMALLBUYER, "insert into public.devices (user_id,device_id,label) values " +
  "(auth.uid(),'small-a','A'),(auth.uid(),'small-b','B');", DB);
asUser(SMALLBUYER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','333447',511000,1);", DB);
const shrinkApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + SMALLBUYER + "' and status='pending';", DB);
const shrinkState = sql("select r.status||'|'||p.joined_paid||'|'||p.allowed_devices " +
  "from public.payment_requests r join public.profiles p on p.id=r.user_id " +
  "where r.user_id='" + SMALLBUYER + "'", DB).out;
report("J2h) approval cannot shrink the cap below already registered devices",
  !shrinkApproval.ok && shrinkState === "pending|false|2",
  { approved: shrinkApproval.ok, state: shrinkState });

/* Tier-off is the backward-compatible mode: a plain join never carries a
   count, stores the flat quote, and leaves the historical default cap alone. */
const PLAINBUYER = "66666666-6666-6666-6666-666666666666";
sql("insert into auth.users (id,email) values ('" + PLAINBUYER + "','plainbuyer@example.com')", DB);
asUser(PLAINBUYER, "insert into public.profiles (id) values (auth.uid());", DB);
sql("update public.app_settings set price_device_1=null, price_device_2=null, price_device_3=null, " +
    "price_device_4=null, price_device_5=null, price_device_step=null, price_join_first=480000", DB);
asUser(PLAINBUYER, "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'join_first','111222',480000);", DB);
const flatQuote = sql("select pricing_mode||'|'||quoted_amount_mmk||'|'||coalesce(device_count::text,'null') " +
  "from public.payment_requests where user_id='" + PLAINBUYER + "'", DB).out;
const flatApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), " +
  "reviewed_by=auth.uid() where user_id='" + PLAINBUYER + "' and status='pending';", DB);
const flatState = sql("select r.status||'|'||p.joined_paid||'|'||p.allowed_devices " +
  "from public.payment_requests r join public.profiles p on p.id=r.user_id " +
  "where r.user_id='" + PLAINBUYER + "'", DB).out;
report("J3) a flat legacy join stores the flat quote and preserves the existing device cap",
  flatQuote === "flat|480000|null" && flatApproval.ok && flatState === "approved|true|2",
  { stored: flatQuote, approved: flatApproval.ok, state: flatState });

/* ---- J4) adversarial REST shapes fail before they can become entitlement ---- */
const ATTACKER = "88888888-8888-8888-8888-888888888888";
sql("insert into auth.users (id,email) values ('" + ATTACKER + "','attacker@example.com')", DB);
asUser(ATTACKER, "insert into public.profiles (id) values (auth.uid());", DB);

const flatForgedCount = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','800001',480000,3);", DB);
report("J4) flat-price requests cannot smuggle an arbitrary device entitlement",
  !flatForgedCount.ok, { accepted: flatForgedCount.ok, err: flatForgedCount.out.split("\n")[0] });

sql("update public.app_settings set price_device_1=511000, price_device_2=null, " +
    "price_device_3=1003000, price_device_4=1207000, price_device_5=1411000, price_device_step=213000", DB);
const tierMissing = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'join_first','800002',511000);", DB);
const tierZero = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','800003',511000,0);", DB);
const tierTooHigh = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','800004',511000,11);", DB);
const tierUnpriced = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','800005',511000,2);", DB);
const wrongKind = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'plan_1m','800006',11000,3);", DB);
report("J4b) tier mode refuses missing, zero, over-limit, unpriced and non-join counts",
  !tierMissing.ok && !tierZero.ok && !tierTooHigh.ok && !tierUnpriced.ok && !wrongKind.ok,
  { missing:tierMissing.ok, zero:tierZero.ok, high:tierTooHigh.ok,
    unpriced:tierUnpriced.ok, wrongKind:wrongKind.ok });

/* A customer cannot buy a tier add-on first, then have a later absolute bundle
   overwrite that paid slot. The database rejects the unsafe order; after a
   valid base purchase, the same add-on path is available. */
const extraBeforeJoin = asUser(ATTACKER,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk) " +
  "values (auth.uid(),'extra_device','800007',17000);", DB);
report("J4c) a tier add-on cannot be filed before the base bundle",
  !extraBeforeJoin.ok, { accepted: extraBeforeJoin.ok, err: extraBeforeJoin.out.split("\n")[0] });

const badRows = sql("select count(*) from public.payment_requests where user_id='" + ATTACKER + "'", DB).out;
const badEntitlement = sql("select allowed_devices from public.profiles where id='" + ATTACKER + "'", DB).out;
report("J4d) refused payloads leave no request and no entitlement mutation",
  badRows === "0" && badEntitlement === "2", { rows: badRows, allowed_devices: badEntitlement });

/* Legacy rows may be too malformed to price, but rejecting one grants nothing
   and must always remain possible. Simulate a pre-v5.42.1 pending row through
   the documented SQL-editor repair path, then close it as an admin. */
const LEGACY = "99999999-9999-9999-9999-999999999999";
sql("insert into auth.users (id,email) values ('" + LEGACY + "','legacy@example.com')", DB);
asUser(LEGACY, "insert into public.profiles (id) values (auth.uid());", DB);
asUser(OWNER,
  "insert into public.payment_requests (user_id,kind,is_grant,amount_mmk) " +
  "values ('" + LEGACY + "','plan_1m',true,0);", DB);
const legacyDrop = sql("alter table public.payment_requests drop constraint payment_requests_device_count_shape_chk", DB);
const legacyMalformed = sql("update public.payment_requests set is_grant=false, device_count=3, " +
  "pricing_mode=null, quoted_amount_mmk=null where user_id='" + LEGACY + "';", DB);
const legacyFixture = sql("select kind||'|'||is_grant||'|'||device_count||'|'||" +
  "coalesce(pricing_mode,'null')||'|'||coalesce(quoted_amount_mmk::text,'null') " +
  "from public.payment_requests where user_id='" + LEGACY + "'", DB).out;
const legacyReapply = file(SCHEMA, DB);
const legacyApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + LEGACY + "' and status='pending';", DB);
const legacyPending = sql("select status from public.payment_requests where user_id='" + LEGACY + "'", DB).out;
const rejectedLegacy = asUser(OWNER,
  "update public.payment_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + LEGACY + "' and status='pending';", DB);
const legacyState = sql("select status from public.payment_requests where user_id='" + LEGACY + "'", DB).out;
const legacyEntitlement = sql("select joined_paid||'|'||allowed_devices from public.profiles " +
  "where id='" + LEGACY + "'", DB).out;
report("J4e) an unquotable legacy row can be rejected without granting entitlement",
  legacyDrop.ok && legacyMalformed.ok &&
  legacyFixture === "plan_1m|false|3|null|null" && legacyReapply.ok &&
  !legacyApproval.ok && legacyPending === "pending" &&
  rejectedLegacy.ok && legacyState === "rejected" && legacyEntitlement === "false|2",
  { dropped: legacyDrop.ok, malformed: legacyMalformed.ok, fixture: legacyFixture,
    reapplied: legacyReapply.ok, approval: legacyApproval.ok, beforeReject: legacyPending,
    rejected: rejectedLegacy.ok,
    status: legacyState, entitlement: legacyEntitlement });

/* Prove the terminal state machine with a fully valid, already quoted row.
   If rejected -> approved ever regresses, this grant would activate a month;
   no unrelated shape/quote failure can make the test pass accidentally. */
const replayFixture = asUser(OWNER,
  "insert into public.payment_requests (user_id,kind,is_grant,amount_mmk) " +
  "values ('" + ATTACKER + "','plan_1m',true,0);", DB);
const replayOriginalId = sql("select id from public.payment_requests " +
  "where user_id='" + ATTACKER + "' and status='pending'", DB).out;
const replayQuote = sql("select pricing_mode||'|'||quoted_amount_mmk from public.payment_requests " +
  "where user_id='" + ATTACKER + "' and status='pending'", DB).out;
const replayIdMutation = asUser(OWNER,
  "update public.payment_requests set id='dededede-dede-dede-dede-dededededede', " +
  "status='rejected', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + ATTACKER + "' and status='pending';", DB);
const replayAfterIdMutation = sql("select id||'|'||status from public.payment_requests " +
  "where user_id='" + ATTACKER + "'", DB).out;
const replayReject = asUser(OWNER,
  "update public.payment_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + ATTACKER + "' and status='pending';", DB);
const rejectedReplay = asUser(OWNER,
  "update public.payment_requests set status='approved' where user_id='" + ATTACKER + "';", DB);
const replayState = sql("select r.status||'|'||r.pricing_mode||'|'||r.quoted_amount_mmk||'|'||" +
  "p.joined_paid||'|'||coalesce(p.plan_status,'none')||'|'||p.allowed_devices " +
  "from public.payment_requests r join public.profiles p on p.id=r.user_id " +
  "where r.user_id='" + ATTACKER + "'", DB).out;
report("J4e2) a valid rejected payment cannot be replayed into entitlement",
  replayFixture.ok && replayOriginalId.length === 36 && replayQuote === "grant|0" &&
  !replayIdMutation.ok && replayAfterIdMutation === replayOriginalId + "|pending" && replayReject.ok &&
  !rejectedReplay.ok && replayState === "rejected|grant|0|false|none|2",
  { inserted: replayFixture.ok, quote: replayQuote, idMutation: replayIdMutation.ok,
    afterIdMutation: replayAfterIdMutation, rejected: replayReject.ok,
    replayAccepted: rejectedReplay.ok, state: replayState });

/* A well-shaped pre-v5.42 renewal still cannot manufacture its own base
   entitlement. It receives a current server quote during review, then the
   entitlement trigger refuses it because tier/configured-fee accounts must
   settle join_first first. */
const LEGACY_RENEW = "cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd";
sql("insert into auth.users (id,email) values ('" + LEGACY_RENEW + "','legacy-renew@example.com')", DB);
asUser(LEGACY_RENEW, "insert into public.profiles (id) values (auth.uid());", DB);
asUser(OWNER,
  "insert into public.payment_requests (user_id,kind,is_grant,amount_mmk) " +
  "values ('" + LEGACY_RENEW + "','plan_1m',true,0);", DB);
const legacyRenewNullified = sql("update public.payment_requests set is_grant=false, amount_mmk=11000, " +
  "pricing_mode=null, quoted_amount_mmk=null where user_id='" + LEGACY_RENEW + "'", DB);
const legacyRenewApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + LEGACY_RENEW + "' and status='pending';", DB);
const legacyRenewState = sql("select r.status||'|'||coalesce(r.pricing_mode,'null')||'|'||" +
  "coalesce(r.quoted_amount_mmk::text,'null')||'|'||p.joined_paid||'|'||" +
  "coalesce(p.plan_status,'none')||'|'||p.allowed_devices " +
  "from public.payment_requests r join public.profiles p on p.id=r.user_id " +
  "where r.user_id='" + LEGACY_RENEW + "'", DB).out;
report("J4f) a legacy renewal cannot bypass a required first purchase",
  legacyRenewNullified.ok && !legacyRenewApproval.ok &&
  legacyRenewState === "pending|null|null|false|none|2",
  { nullified: legacyRenewNullified.ok, approved: legacyRenewApproval.ok,
    state: legacyRenewState });

const LEGACY_VALID = "abababab-abab-abab-abab-abababababab";
sql("insert into auth.users (id,email) values ('" + LEGACY_VALID + "','legacy-valid@example.com')", DB);
asUser(LEGACY_VALID, "insert into public.profiles (id) values (auth.uid());", DB);
asUser(LEGACY_VALID,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','919191',1003000,3);", DB);
const legacyNullified = sql("update public.payment_requests set pricing_mode=null, quoted_amount_mmk=null " +
  "where user_id='" + LEGACY_VALID + "' and status='pending'", DB);
const legacyNullState = sql("select coalesce(pricing_mode,'null')||'|'||" +
  "coalesce(quoted_amount_mmk::text,'null') from public.payment_requests " +
  "where user_id='" + LEGACY_VALID + "'", DB).out;
const legacyValidApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + LEGACY_VALID + "' and status='pending';", DB);
const legacyValidState = sql("select r.status||'|'||r.pricing_mode||'|'||r.quoted_amount_mmk||'|'||" +
  "p.joined_paid||'|'||p.allowed_devices from public.payment_requests r " +
  "join public.profiles p on p.id=r.user_id where r.user_id='" + LEGACY_VALID + "'", DB).out;
report("J4f2) a valid legacy tier join is quoted once at approval and applies exactly once",
  legacyNullified.ok && legacyNullState === "null|null" && legacyValidApproval.ok &&
  legacyValidState === "approved|tier|1003000|true|3",
  { nullified: legacyNullified.ok, before: legacyNullState,
    approved: legacyValidApproval.ok, state: legacyValidState });

/* Two simultaneous first-purchase submissions must serialize on the profile
   row. The second session starts only after the first has inserted its
   uncommitted row and published an advisory marker; without FOR UPDATE both
   pending rows commit because neither can see the other yet. */
const PAY_MUTEX = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const PAY_MUTEX_LOCK = 542102;
sql("insert into auth.users (id,email) values ('" + PAY_MUTEX + "','pay-mutex@example.com')", DB);
asUser(PAY_MUTEX, "insert into public.profiles (id) values (auth.uid());", DB);
spawn("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-c",
  userTransaction(PAY_MUTEX,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','929291',511000,1); " +
  "select pg_advisory_lock(" + PAY_MUTEX_LOCK + "); select pg_sleep(1);")],
  { env: ENV, stdio: "ignore" });
const payMutexReady = waitForAdvisory(PAY_MUTEX_LOCK, DB);
const secondPendingJoin = asUser(PAY_MUTEX,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','929292',511000,1);", DB);
waitForAdvisoryRelease(PAY_MUTEX_LOCK, DB);
const pendingJoinCount = sql("select count(*) from public.payment_requests where user_id='" +
  PAY_MUTEX + "' and kind='join_first' and status='pending'", DB).out;
report("J4g) concurrent first-purchase submissions leave exactly one pending row",
  payMutexReady && !secondPendingJoin.ok && pendingJoinCount === "1",
  { marker: payMutexReady, secondAccepted: secondPendingJoin.ok, rows: pendingJoinCount });

/* Cross-trigger race: a second registration is uncommitted while an admin
   tries to approve a one-device bundle. Approval must wait on the SAME profile
   mutex, then see both devices and remain pending without shrinking the cap. */
const APPROVAL_RACE = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const APPROVAL_RACE_LOCK = 542103;
sql("insert into auth.users (id,email) values ('" + APPROVAL_RACE + "','approval-race@example.com')", DB);
asUser(APPROVAL_RACE, "insert into public.profiles (id) values (auth.uid());", DB);
asUser(APPROVAL_RACE,
  "insert into public.devices (user_id,device_id,label) values (auth.uid(),'approval-a','A');", DB);
asUser(APPROVAL_RACE,
  "insert into public.payment_requests (user_id,kind,txn_last6,amount_mmk,device_count) " +
  "values (auth.uid(),'join_first','939393',511000,1);", DB);
spawn("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-c",
  userTransaction(APPROVAL_RACE,
  "insert into public.devices (user_id,device_id,label) values (auth.uid(),'approval-b','B'); " +
  "select pg_advisory_lock(" + APPROVAL_RACE_LOCK + "); select pg_sleep(1);")],
  { env: ENV, stdio: "ignore" });
const approvalRaceReady = waitForAdvisory(APPROVAL_RACE_LOCK, DB);
const racedApproval = asUser(OWNER,
  "update public.payment_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid() " +
  "where user_id='" + APPROVAL_RACE + "' and status='pending';", DB);
waitForAdvisoryRelease(APPROVAL_RACE_LOCK, DB);
const approvalRaceState = sql("select r.status||'|'||p.joined_paid||'|'||p.allowed_devices||'|'||" +
  "(select count(*) from public.devices d where d.user_id=p.id) " +
  "from public.payment_requests r join public.profiles p on p.id=r.user_id " +
  "where r.user_id='" + APPROVAL_RACE + "'", DB).out;
report("J4h) registration racing a smaller bundle cannot leave devices above entitlement",
  approvalRaceReady && !racedApproval.ok && approvalRaceState === "pending|false|2|2",
  { marker: approvalRaceReady, approved: racedApproval.ok, state: approvalRaceState });

/* cleanup — check N below counts rows in public.profiles and expects exactly
   the OWNER/CUST cast that predates this block; cascading through auth.users
   removes DEVBUYER/PLAINBUYER's profiles and payment_requests with them. */
sql("delete from auth.users where id in ('" + DEVBUYER + "','" + PLAINBUYER + "','" +
    QUOTEBUYER + "','" + ATTACKER + "','" + LEGACY + "','" + LEGACY_RENEW + "','" + LEGACY_VALID + "','" +
    SMALLBUYER + "','" + PAY_MUTEX + "','" + APPROVAL_RACE + "');", DB);

/* ---- K) the device cap ---- */
const deviceCrossExisting = asUser(CUST,
  "insert into public.devices (user_id,device_id,label) values ('" + OWNER + "','probe-a','A');", DB);
const deviceCrossMissing = asUser(CUST,
  "insert into public.devices (user_id,device_id,label) values ('" + UNKNOWN_ACCOUNT + "','probe-b','B');", DB);
report("J5) forged cross-account device inserts expose neither victim cap nor existence",
  !deviceCrossExisting.ok && !deviceCrossMissing.ok &&
  /device user does not match authenticated caller/i.test(deviceCrossExisting.out) &&
  /device user does not match authenticated caller/i.test(deviceCrossMissing.out),
  { existing: deviceCrossExisting.out.split("\n")[0], missing: deviceCrossMissing.out.split("\n")[0] });

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

/* Two sessions prove the profile row is a real per-account mutex, not merely a
   sequential count check. Session A inserts one device and holds both the row
   lock and a visible advisory marker; session B then attempts a distinct one.
   Without the shared profile lock both see zero committed devices and the cap
   of one ends with two rows. */
const RACE = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const RACE_LOCK = 542101;
sql("insert into auth.users (id,email) values ('" + RACE + "','race@example.com')", DB);
asUser(RACE, "insert into public.profiles (id) values (auth.uid());", DB);
sql("update public.profiles set allowed_devices=1 where id='" + RACE + "'", DB);
spawn("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-c",
  userTransaction(RACE,
  "insert into public.devices (user_id,device_id,label) values (auth.uid(),'race-a','A'); " +
  "select pg_advisory_lock(" + RACE_LOCK + "); select pg_sleep(2);")],
  { env: ENV, stdio: "ignore" });
const raceReady = waitForAdvisory(RACE_LOCK, DB);
const racedDevice = asUser(RACE,
  "insert into public.devices (user_id,device_id,label) values (auth.uid(),'race-b','B');", DB);
/* A session-level advisory lock survives COMMIT until psql disconnects. Taking
   and releasing it here waits for session A to be fully visible before count. */
waitForAdvisoryRelease(RACE_LOCK, DB);
const racedCount = sql("select count(*) from public.devices where user_id='" + RACE + "'", DB).out;
report("L2) concurrent distinct registrations cannot exceed a one-device cap",
  raceReady && !racedDevice.ok && racedCount === "1",
  { marker: raceReady, secondAccepted: racedDevice.ok, devices: racedCount });
sql("delete from auth.users where id='" + RACE + "'", DB);

/* ---- M) the bank details are readable by everyone and writable by nobody ---- */
const anonRead = asAnon("select count(*) from public.app_settings;", DB);
report("M) anon may READ the one app_settings row (the buy screen quotes prices signed-out)",
  anonRead.ok && /(^|\n)1(\n|$)/.test(anonRead.out),
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

mustFixture("cleanup removes the main scratch database",
  sql('drop database if exists "' + DB + '"'));
for (const role of REQUEST_ROLES) {
  mustFixture("cleanup removes role " + role, sql("drop role if exists " + role));
}

/* ---- R) the exact restricted-owner shape DigitalOcean supplies ----
   Request identity is transaction-local now, so a NOCREATEROLE owner must be
   able to apply both files while the old cluster-wide role names stay absent. */
const LIMITED_DB = DB + "_limited";
const LIMITED_USER = "hnk_limited_probe";
mustFixture("fixture removes the prior restricted-owner database",
  sql('drop database if exists "' + LIMITED_DB + '"'));
mustFixture("fixture removes the prior restricted owner",
  sql('drop role if exists ' + LIMITED_USER));
mustFixture("fixture creates the restricted owner", sql("create role " + LIMITED_USER +
  " login password 'probe' nocreaterole nosuperuser nobypassrls"));
mustFixture("fixture creates its owner database",
  sql('create database "' + LIMITED_DB + '" owner ' + LIMITED_USER));

for (const role of REQUEST_ROLES) {
  mustFixture("restricted fixture removes cluster role " + role,
    sql("drop role if exists " + role));
}
const dropped = true;

const asLimited = (f, db) => {
  const out = require("child_process").spawnSync("psql",
    ["-h", ENV.PGHOST, "-p", ENV.PGPORT, "-U", LIMITED_USER, "-d", db,
     "-v", "ON_ERROR_STOP=1", "-q", "-f", f],
    { env: Object.assign({}, ENV, { PGUSER: LIMITED_USER, PGPASSWORD: "probe" }),
      encoding: "utf8" });
  return { ok: out.status === 0, out: (out.stdout || "") + (out.stderr || "") };
};

const limitedFlags = sql("select rolsuper||'|'||rolcreaterole||'|'||rolbypassrls " +
  "from pg_roles where rolname='" + LIMITED_USER + "'");
const limitedPlatform = dropped
  ? asLimited(PLATFORM, LIMITED_DB) : { ok: false, out: "request roles could not be removed" };
const limitedSchema = limitedPlatform.ok
  ? asLimited(SCHEMA, LIMITED_DB) : { ok: false, out: "platform.sql did not apply" };
report("R) a NOCREATEROLE owner applies platform.sql and schema.sql without request roles",
  dropped && limitedFlags.ok && limitedFlags.out === "false|false|false" &&
  limitedPlatform.ok && limitedSchema.ok,
  { flags: limitedFlags.out,
    platform: limitedPlatform.out.split("\n").slice(0, 2),
    schema: limitedSchema.out.split("\n").slice(0, 2) });

const rolesAfterMigration = sql("select count(*) from pg_roles where rolname in " +
  "('anon','authenticated','service_role')");
const limitedForcedRls = sql("select count(*) from pg_class c " +
  "join pg_namespace n on n.oid=c.relnamespace where " +
  "((n.nspname='public' and c.relname in ('profiles','payment_requests','app_settings','devices')) " +
  "or (n.nspname='storage' and c.relname='objects') " +
  "or (n.nspname='auth' and c.relname in ('users','refresh_tokens'))) " +
  "and c.relrowsecurity and c.relforcerowsecurity", LIMITED_DB);
report("R2) roleless migration creates no cluster roles and forces owner RLS",
  rolesAfterMigration.ok && rolesAfterMigration.out === "0" &&
  limitedForcedRls.ok && limitedForcedRls.out === "7",
  { roles: rolesAfterMigration.out, forcedRls: limitedForcedRls.out });

mustFixture("cleanup removes the restricted-owner database",
  sql('drop database if exists "' + LIMITED_DB + '"'));

/* ---- R3) another privilege a managed database user may not have ----
   CREATE SCHEMA needs CREATE on the
   DATABASE itself, which belongs to the owner alone by default — and R/R2's
   probe cannot tell that apart from the role gap, because it OWNS the database
   it is tested against, which grants CREATE along with everything else. That
   is not the shape a converted Managed Database cluster hands an app user: the
   database is created by the admin, the app user only gets CONNECT. Same
   catch-and-re-raise shape, proven against that shape specifically. */
const LIMITED_DB2 = DB + "_limited2";
mustFixture("fixture removes the prior restricted-grant database",
  sql('drop database if exists "' + LIMITED_DB2 + '"'));
mustFixture("fixture creates the restricted-grant database",
  sql('create database "' + LIMITED_DB2 + '"')); // owned by ENV.PGUSER, not the probe
mustFixture("fixture grants only CONNECT to the restricted owner",
  sql('grant connect on database "' + LIMITED_DB2 + '" to ' + LIMITED_USER));

const deniedSchema = asLimited(PLATFORM, LIMITED_DB2);
report("R3) a user that cannot CREATE SCHEMA is told exactly what to run, not just that it failed",
  !deniedSchema.ok &&
  /cannot CREATE SCHEMA/.test(deniedSchema.out) &&
  new RegExp("grant create on database " + LIMITED_DB2 + " to " + LIMITED_USER + ";").test(deniedSchema.out),
  deniedSchema.out.split("\n").slice(0, 2));

/* ...and once an admin has run that one grant, the same user applies the rest
   of the file unaided — the database-privilege gap is a single unblocking
   action too, not a dead end. */
mustFixture("fixture grants CREATE on the restricted-grant database",
  sql('grant create on database "' + LIMITED_DB2 + '" to ' + LIMITED_USER));
const afterSchemaGrant = asLimited(PLATFORM, LIMITED_DB2);
report("R4) ...and with CREATE on the database granted it applies the whole file unaided",
  afterSchemaGrant.ok, afterSchemaGrant.out.split("\n").slice(0, 2));

mustFixture("cleanup removes the restricted-grant database",
  sql('drop database if exists "' + LIMITED_DB2 + '"'));
mustFixture("cleanup removes the restricted owner", sql('drop role if exists ' + LIMITED_USER));
for (const role of REQUEST_ROLES) {
  mustFixture("cleanup removes role " + role, sql("drop role if exists " + role));
}

console.log("      (this file proves the schema ENFORCES what it claims, on a database it " +
  "built from nothing — it still cannot prove the owner has applied it to their project)");
console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
