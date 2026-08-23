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
const { execFileSync } = require("child_process");
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
psqlFile(path.join(ROOT, "server", "sql", "platform.sql"), DB);
psqlFile(path.join(ROOT, "supabase", "schema.sql"), DB);
report("platform.sql + schema.sql build the database", true);

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
  await new Promise(r => server.listen(PORT, r));

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

  server.close();
  await require(path.join(ROOT, "server", "lib", "db")).pool.end();
  psql(`drop database if exists ${DB}`);
  console.log("      (drives the real HTTP service against a real database — it cannot prove the owner has deployed it)");
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
