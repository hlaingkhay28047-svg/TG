/* v6.46.0 — THE ADMIN CONSOLE MUST SURVIVE THE ADMIN'S OWN ACTIONS.

   THE COMPLAINT, in the owner's words on 2026-09-09:
       "ငါ့ addmin လဲခနခန ဝင်ထွက်နေတယ်"   (my admin keeps signing in and out)
   photographed alongside a "Force Logout completed." toast on his phone and a
   signed-out web app on his laptop.

   Reading the code found TWO faults, and the second one is the answer.

   FAULT B — AN IDLE CLOCK THAT NOTHING WINDS.  public.sessions carries
   client_type 'admin' (schema.sql), and the console signs in with
   CLIENT_TYPE="admin", so the console session is CANONICAL: the legacy
   hnk_auth_refresh_tokens bridge cannot revive it and nothing has written a row
   to that table since v5.43. session.js then kills any admin session whose
   last_seen_at is older than ADMIN_SESSION_TIMEOUT_SECONDS. But last_seen_at is
   bumped ONLY by an authenticated request, and the console only calls the server
   when its access token is within ADMIN_FRESH_MARGIN_MS of dying — once an hour,
   with ACCESS_TTL at 3600. With the window at 900 seconds the console therefore
   signed ITSELF out roughly every hour, and any break longer than fifteen
   minutes ended the session — the exact opposite of the instruction recorded in
   admin.js since 2026-08-31, that leaving and returning must not sign the
   administrator out. The fix is a real keep-alive on a cadence strictly inside
   the window, and a window long enough to survive a backgrounded phone.

   FAULT A — FORCE LOGOUT ON YOURSELF.  revokeByUser revokes by user_id with no
   client-type filter and no exception for the admin doing the revoking. The
   owner is is_admin on his own student record, so Force Logout on it took his
   console down with his phone and his computer.

   B and C below are the proofs that matter, and B runs against a REAL database:
   sessions are inserted, the shipped studentAction is called, and the rows are
   read back. Nothing here reads the fix and calls that a pass.

   A) the console's keep-alive: it exists, it is admin-authenticated, and its
      cadence is strictly inside the server's own idle window — measured from
      both files, not asserted twice
   B) a live database:
      B1 force logout on YOUR OWN account ends your phone and your computer and
         LEAVES YOUR CONSOLE STANDING
      B2 the same action on ANOTHER admin ends everything of theirs, console
         included — the keep-alive must never become a way to spare a target
      B3 suspending your own account ends everything of yours, console included:
         an account that may not be used may not be administered from
      B4 the acting admin's session is untouched by an action on someone else
   C) the console stops printing a ceiling it does not know: the device rows and
      the summary read allowed_devices and the slot list, executed, not read
   D) CI runs this test

   Usage: node test/verify_admin_self_action.js   (needs local Postgres for B) */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SESSION_SRC = fs.readFileSync(path.join(ROOT, "server/lib/session.js"), "utf8");
const LIVE_AUTH_SRC = fs.readFileSync(path.join(ROOT, "server/lib/live-auth.js"), "utf8");
const AUTH_SRC = fs.readFileSync(path.join(ROOT, "server/lib/auth.js"), "utf8");
const API_SRC = fs.readFileSync(path.join(ROOT, "server/lib/admin-api.js"), "utf8");
const V1_SRC = fs.readFileSync(path.join(ROOT, "server/lib/v1.js"), "utf8");
const ADMIN_JS = fs.readFileSync(path.join(ROOT, "docs/admin/admin.js"), "utf8");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
/* the same trick verify_offline_grace uses: a comment must never satisfy a
   source assertion about code */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
const num = (src, re) => { const m = re.exec(decomment(src)); return m ? Number(m[1]) : NaN; };

/* ---------------- A) the clock, and the hand that winds it ---------------- */

const idleDefault = num(SESSION_SRC, /ADMIN_SESSION_TIMEOUT_SECONDS \|\| (\d+)/);
const idleLive = num(LIVE_AUTH_SRC, /ADMIN_SESSION_TIMEOUT_SECONDS \|\| (\d+)/);
const accessTtl = num(AUTH_SRC, /ACCESS_TOKEN_TTL\s+\|\| (\d+)/);
const keepAliveMs = num(ADMIN_JS, /ADMIN_KEEPALIVE_MS = (\d+)/);
const freshTickMs = num(ADMIN_JS, /ADMIN_FRESH_TICK_MS = (\d+)/);

report("A1) the two files that enforce the admin idle window agree on its length",
  Number.isFinite(idleDefault) && idleDefault === idleLive,
  { session_js: idleDefault, live_auth_js: idleLive });

report("A2) the console pings on a cadence STRICTLY INSIDE the idle window, with room for one lost ping",
  Number.isFinite(keepAliveMs) && Number.isFinite(idleDefault) &&
  keepAliveMs > 0 && keepAliveMs * 2 < idleDefault * 1000,
  { keepAliveMs, idleWindowMs: idleDefault * 1000 });

/* The defect in one line: before this wave the ONLY thing that touched the
   server was the near-expiry rotation, so the console's request gap was
   ACCESS_TTL less the fresh margin — 55 minutes against a 15-minute window. It
   signed itself out on a clock nothing wound. The keep-alive must therefore be
   its own, far more frequent beat, not a rename of the rotation: several pings
   have to fall inside one rotation gap, or the same defect is back under a new
   variable name. */
const freshMarginMs = num(ADMIN_JS, /ADMIN_FRESH_MARGIN_MS = (\d+)/);
const rotationGapMs = accessTtl * 1000 - freshMarginMs;
report("A3) the keep-alive is its OWN beat, several pings inside one token rotation — not the rotation renamed",
  Number.isFinite(rotationGapMs) && Number.isFinite(keepAliveMs) &&
  keepAliveMs > 0 && keepAliveMs * 4 <= rotationGapMs,
  { keepAliveMs, rotationGapMs });

const adminJs = decomment(ADMIN_JS);
report("A4) the ping is an ADMIN-AUTHENTICATED call — an unauthenticated one would never bump last_seen_at",
  /async function adminKeepAlive\(\)/.test(adminJs) &&
  /adminKeepAlive[\s\S]{0,400}api\(API\.(session|panelVersion|dashboard)/.test(adminJs),
  null);

report("A5) the ping runs on the timer and on the way back to a visible tab, and never when signed out",
  /setInterval\(\(\) => \{[\s\S]{0,200}adminKeepAlive\(\);[\s\S]{0,60}\}, ADMIN_(KEEPALIVE|FRESH_TICK)_MS\)/.test(adminJs) &&
  /visibilitychange[\s\S]{0,200}adminKeepAlive\(\)/.test(adminJs) &&
  /adminKeepAlive[\s\S]{0,200}if \(!accessToken\(\)(\s|&|\|)/.test(adminJs),
  null);

report("A6) v6.34.0's rule is untouched: the console still rotates before it spends",
  /const ADMIN_FRESH_MARGIN_MS = 300000;/.test(adminJs) &&
  /if \(!retried && accessToken\(\) && sessionNearExpiry\(\)\) await keepSessionFresh\(\);/.test(adminJs) &&
  Number.isFinite(freshTickMs), null);

/* ---------------- A7) the server keeps the exception, in one place ---------------- */
report("A7) revokeByUser can spare exactly one session, and the SQL says so",
  /async revokeByUser\(userId, ?revokedAt, ?reason, ?keepSessionId\)/.test(decomment(SESSION_SRC)) &&
  /id ?<> ?\$4/.test(SESSION_SRC), null);

report("A8) only force_logout passes the acting admin's own session id — a suspension still sweeps everything",
  /revokeAllUserSessions\(client,userId,"force_logout",identity\.sessionId\)/.test(decomment(API_SRC)) &&
  /revokeAllUserSessions\(client,userId,status\)(?![\s\S]{0,40}identity\.sessionId)/.test(decomment(API_SRC)),
  null);

/* ---------------- C) the console stops inventing a ceiling ---------------- */

/* decomment first: this file's own explanation of what was removed quotes the
   literal it is checking for, and verify_offline_grace G2 already lost an hour
   to exactly that. A comment must never satisfy an assertion about code. */
report("C1) the hard-coded 1/1 · 0/1 is gone from the console",
  !/"1\/1"\s*:\s*"0\/1"/.test(adminJs), null);

/* deviceRowLabel and deviceSummary are pure, so EXECUTE them out of the shipped
   file rather than reading them. */
function lift(name) {
  const start = ADMIN_JS.indexOf("function " + name + "(");
  if (start < 0) return null;
  let depth = 0, i = ADMIN_JS.indexOf("{", start);
  for (let j = i; j < ADMIN_JS.length; j++) {
    if (ADMIN_JS[j] === "{") depth++;
    else if (ADMIN_JS[j] === "}") { depth--; if (!depth) return ADMIN_JS.slice(start, j + 1); }
  }
  return null;
}
const summarySrc = lift("deviceSummary");
const rowSrc = lift("deviceRowLabel");
let summary = null, rowLabel = null;
try {
  /* t() is the console's translator; here it is the English fallback */
  const make = new Function("t", (summarySrc || "") + (rowSrc || "") +
    "return {deviceSummary:typeof deviceSummary==='function'?deviceSummary:null," +
    "deviceRowLabel:typeof deviceRowLabel==='function'?deviceRowLabel:null};");
  const fns = make((key, fallback) => fallback);
  summary = fns.deviceSummary; rowLabel = fns.deviceRowLabel;
} catch (e) { report("C) the console's device helpers could be executed", false, String(e).slice(0, 160)); }

/* the shape the ADMIN API actually returns: allowed_devices at the top level
   (normalizeStudent) and a slot list under devices (normalizeDeviceSlots).
   devices.allowed / devices.used belong to the student app's entitlement and
   must not be what the console is proved against. */
const FOUR_SEATS = {
  allowed_devices: 4,
  devices: {
    phone: { registered: true, label: "Android Chrome" },
    computer: null,
    slots: [{ slot_type: "phone", status: "active", registered: true, label: "Android Chrome" }],
  },
};
report("C2) an account the teacher set to four seats is summarised against FOUR, not two",
  !!summary && /\b1\/4\b/.test(summary(FOUR_SEATS)), summary ? summary(FOUR_SEATS) : null);

report("C3) a registered row does not claim to be the only seat there is",
  !!rowLabel && !/1\/1/.test(rowLabel("Phone", FOUR_SEATS.devices.phone, 1, 4)) &&
  !/0\/1/.test(rowLabel("Computer", null, 0, 4)),
  rowLabel ? [rowLabel("Phone", FOUR_SEATS.devices.phone, 1, 4), rowLabel("Computer", null, 0, 4)] : null);

const THREE_PHONES = {
  allowed_devices: 4,
  devices: {
    phone: { registered: true, label: "A" }, computer: null,
    slots: [
      { slot_type: "phone", status: "active", registered: true, label: "A" },
      { slot_type: "phone", status: "active", registered: true, label: "B" },
      { slot_type: "phone", status: "active", registered: true, label: "C" },
    ],
  },
};
report("C4) three phones on a four-seat account are counted as three, not as one",
  !!summary && /\b3\/4\b/.test(summary(THREE_PHONES)), summary ? summary(THREE_PHONES) : null);

/* ---------------- D) CI ---------------- */
report("D) CI runs this test",
  WORKFLOW.indexOf("verify_admin_self_action.js") >= 0, null);

/* ---------------- B) the live database ---------------- */

const DB = "hnk_self_action_probe";
const RUNTIME = "hnk_self_action_role";
const PASSWORD = "self-action-probe";
const ADMIN_A = "eeeeeeee-0000-4000-8000-00000000000a";
const ADMIN_B = "eeeeeeee-0000-4000-8000-00000000000b";

const ADMIN_ENV = Object.assign({}, process.env, {
  PGHOST: process.env.PGHOST || "127.0.0.1",
  PGPORT: process.env.PGPORT || "5432",
  PGUSER: process.env.PGUSER || "postgres",
  PGPASSWORD: process.env.PGPASSWORD || "postgres",
  PGCLIENTENCODING: "UTF8",
});
delete ADMIN_ENV.PGOPTIONS;

function psql(args, env = ADMIN_ENV) {
  const child = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"].concat(args),
    { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (child.error) return { ok: false, out: child.error.message };
  return { ok: child.status === 0, out: ((child.stdout || "") + (child.stderr || "")).trim() };
}
const sql = (text, db = "postgres") => psql(["-d", db, "-c", text]);
function cleanup() {
  sql(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${DB}'`);
  sql(`drop database if exists "${DB}"`);
  sql(`drop role if exists "${RUNTIME}"`);
}

(async () => {
  const probe = sql("select 1");
  if (!probe.ok) {
    report("B) a live database proves the console survives your own Force Logout", false,
      "no local Postgres: " + probe.out.slice(0, 160));
    console.log("\n" + (failures ? failures + " FAILURE(S)" : "All checks passed"));
    process.exit(failures ? 1 : 0);
  }
  cleanup();
  let r = sql(`create role "${RUNTIME}" login password '${PASSWORD}' nosuperuser nobypassrls nocreatedb`);
  if (r.ok) r = sql(`create database "${DB}" owner "${RUNTIME}"`);
  if (!r.ok) { report("B) scratch role and database", false, r.out.slice(0, 200)); cleanup(); process.exit(1); }

  const url = `postgres://${RUNTIME}:${PASSWORD}@${ADMIN_ENV.PGHOST}:${ADMIN_ENV.PGPORT}/${DB}`;
  const migrated = spawnSync("node",
    ["-e", 'require("./lib/migrate").migrate().then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1);});'],
    {
      cwd: path.join(ROOT, "server"),
      env: Object.assign({}, ADMIN_ENV, {
        PGSSLMODE: "disable", ALLOW_UNVERIFIED_DB_TLS: "1", DATABASE_URL: url,
      }),
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 180000,
    });
  if (migrated.status !== 0) {
    report("B0) the scratch database carries the tracked schema", false,
      ((migrated.stdout || "") + (migrated.stderr || "")).split(/\r?\n/).slice(-4));
    cleanup(); process.exit(1);
  }
  report("B0) the scratch database carries the tracked schema", true);

  const { Client } = require(path.join(ROOT, "server/node_modules/pg"));
  const admin = require(path.join(ROOT, "server/lib/admin-api.js"));
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  /* the API always runs inside asService(); db.js sets that context with SET
     LOCAL, so here it is set once for the whole connection instead */
  await client.query(
    "select set_config('request.role','service_role',false)," +
    "set_config('request.jwt.claim.sub','',false)," +
    "set_config('request.is_admin','true',false)," +
    "set_config('request.user_email','',false)");

  async function seed(uid, email) {
    await client.query(
      `insert into public.hnk_auth_users (id,email,encrypted_password,email_confirmed_at)
       values ($1,$2,'x',now()) on conflict do nothing`, [uid, email]);
    await client.query(
      `insert into public.profiles (id,name,email,account_status,is_admin)
       values ($1,$2,$3,'active',true) on conflict (id) do update
       set account_status='active',is_admin=true`, [uid, email, email]);
  }
  /* one session per client_type, all live, all far from expiry */
  async function session(uid, clientType, tag) {
    const { rows } = await client.query(
      `insert into public.sessions (user_id,client_type,refresh_token_hash,expires_at,last_seen_at)
       values ($1,$2,$3,now()+interval '7 days',now()) returning id`,
      [uid, clientType, tag]);
    return rows[0].id;
  }
  const live = async id => {
    const { rows } = await client.query("select revoked_at from public.sessions where id=$1", [id]);
    return !!rows.length && rows[0].revoked_at === null;
  };

  await seed(ADMIN_A, "owner@probe.test");
  await seed(ADMIN_B, "second-admin@probe.test");

  const identity = uid => ({
    uid, clientType: "admin", roles: ["admin"], mfaVerified: false, mfaEnrolled: false,
    payload: { email: "probe" },
  });
  const ctx = { ipHash: null, userAgent: "probe" };

  /* ---- B1: force logout on your own account ---- */
  let aWeb = await session(ADMIN_A, "web", "a-web-1");
  let aPanel = await session(ADMIN_A, "panel", "a-panel-1");
  let aConsole = await session(ADMIN_A, "admin", "a-admin-1");
  const meA = Object.assign(identity(ADMIN_A), { sessionId: aConsole });

  await client.query("begin");
  await admin.studentAction(client, meA, ADMIN_A, { action: "force_logout" }, ctx);
  await client.query("commit");

  report("B1) Force Logout on YOUR OWN account ends your phone and your computer — and leaves your console standing",
    !(await live(aWeb)) && !(await live(aPanel)) && (await live(aConsole)),
    { web: await live(aWeb), panel: await live(aPanel), console: await live(aConsole) });

  /* ---- B2: the same action on ANOTHER admin spares nothing of theirs ---- */
  const bWeb = await session(ADMIN_B, "web", "b-web-1");
  const bConsole = await session(ADMIN_B, "admin", "b-admin-1");
  await client.query("begin");
  await admin.studentAction(client, meA, ADMIN_B, { action: "force_logout" }, ctx);
  await client.query("commit");

  report("B2) the same action on ANOTHER admin ends everything of theirs, their console included",
    !(await live(bWeb)) && !(await live(bConsole)),
    { theirWeb: await live(bWeb), theirConsole: await live(bConsole) });
  report("B4) and it does not touch the acting admin's own session",
    await live(aConsole), null);

  /* ---- B5: every account-status action writes a value the DATABASE accepts.

     This check exists because B3 below found that it did not. studentAction
     derived the stored status as `... : requested`, so "suspend" wrote
     'suspend' and "ban" wrote 'ban' — neither of which
     profiles_account_status_chk permits. Postgres refused both with 23514, so
     Suspend and Ban had simply never worked, on any account, since the
     constraint was added. Reject and Activate were spelled out and were fine,
     which is exactly why nobody noticed. Nothing in the suite executed this
     branch against a real database before this file did.

     So all four run here, in order, and the row is read back each time. ---- */
  const statusProbe = "eeeeeeee-0000-4000-8000-00000000000c";
  await seed(statusProbe, "status-probe@probe.test");
  const statusOf = async () => {
    const { rows } = await client.query("select account_status from public.profiles where id=$1", [statusProbe]);
    return rows[0] && rows[0].account_status;
  };
  const wrote = {};
  for (const [action, expected] of [["suspend","suspended"],["ban","banned"],
                                    ["reject","rejected"],["activate","active"]]) {
    try {
      await client.query("begin");
      await admin.studentAction(client, meA, statusProbe, { action }, ctx);
      await client.query("commit");
      wrote[action] = await statusOf();
    } catch (error) {
      await client.query("rollback");
      wrote[action] = "REFUSED " + (error && error.code || error && error.message);
    }
    wrote[action + "_want"] = expected;
  }
  report("B5) Suspend, Ban, Reject and Activate each write a status the database actually accepts",
    wrote.suspend === "suspended" && wrote.ban === "banned" &&
    wrote.reject === "rejected" && wrote.activate === "active", wrote);

  /* ---- B3: an account you may not use, you may not administer from ---- */
  aWeb = await session(ADMIN_A, "web", "a-web-2");
  await client.query("begin");
  await admin.studentAction(client, meA, ADMIN_A, { action: "suspend" }, ctx);
  await client.query("commit");

  report("B3) suspending your own account ends everything of yours, console included",
    !(await live(aWeb)) && !(await live(aConsole)),
    { web: await live(aWeb), console: await live(aConsole) });

  await client.end();
  cleanup();

  console.log(failures
    ? failures + " FAILURE(S) — an admin action could still sign the administrator out."
    : "All checks passed — the console survives the admin's own actions, and its clock is wound.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); try { cleanup(); } catch (_) {} process.exit(1); });
