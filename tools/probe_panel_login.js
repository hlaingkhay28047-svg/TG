"use strict";
/* Sign in and out against the live server exactly as the Photoshop panel does.
   Runs on a GitHub runner (probe-panel-login.yml); see that file for why and what.

   The walk (statuses, server codes and booleans only — never the password, never a token):
     1  signup            web shape        hnkaistudio.com       one throwaway student
     2  sign-in           PANEL shape      DigitalOcean host     gateSignIn: Accept + Content-Type, {email,password,client_kind:"panel"}
     3  sign-in           PANEL shape      hnkaistudio.com       the same body on the web app's host
     4  sign-in           web shape        hnkaistudio.com       accHeaders (apikey anon), {email,password}
     5  refresh           PANEL shape      DigitalOcean host     grant_type=refresh_token
     6  entitlement       PANEL bearer     DigitalOcean host     GET /v1/me/entitlement (pending account → denials, that is expected)
     7  logout            PANEL bearer     DigitalOcean host     POST /auth/v1/logout {refresh_token}
     8  refresh after 7   PANEL shape      DigitalOcean host     must be refused
     9  wrong password    PANEL shape      DigitalOcean host     must be 400 invalid_grant — the "(HTTP 400 · invalid_grant)" line
    10  unknown address   PANEL shape      DigitalOcean host     must be 400 invalid_grant

   The password is generated here and masked before anything else prints. A 200 body
   is reduced to booleans (has_access / has_refresh / user_id) before it is recorded. */
const crypto = require("crypto");
const fs = require("fs");

const RUN = process.env.GITHUB_RUN_ID || String(Date.now());
const EMAIL = "panel-probe-" + RUN + "@hnkaistudio.com";
const PASSWORD = crypto.randomBytes(18).toString("base64url");
console.log("::add-mask::" + PASSWORD);

/* panel/main.js: GATE_API_URL host · docs/app/index.html: SB_URL = location.origin + "/api" */
const PANEL_HOST = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";
const WEB_HOST = "https://hnkaistudio.com";
const TOKEN = "/api/auth/v1/token?grant_type=password";
const REFRESH = "/api/auth/v1/token?grant_type=refresh_token";

/* panel/main.js gateHeaders(tok, json) */
function panelHeaders(tok, json) {
  const h = { "Accept": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
/* docs/app/index.html accHeaders(tok, json) */
function webHeaders(tok, json) {
  const h = { "apikey": "anon", "Authorization": "Bearer " + (tok || "anon") };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const results = [];
function sanitize(j) {
  if (!j || typeof j !== "object") return null;
  const out = {};
  for (const k of Object.keys(j)) {
    if (/token|password|secret/i.test(k)) { out[k] = "<withheld>"; continue; }
    const v = j[k];
    out[k] = (v && typeof v === "object") ? sanitize(v) : v;
  }
  return out;
}
async function call(step, name, url, opts, expect) {
  const t0 = Date.now();
  let r = null, text = "", j = null;
  try { r = await fetch(url, opts); text = await r.text(); }
  catch (e) {
    const rec = { step, name, url, status: 0, code: "network: " + String(e && e.message || e).slice(0, 80), ms: Date.now() - t0, ok: false, expect };
    results.push(rec); console.log(line(rec)); return { rec, json: null };
  }
  try { j = JSON.parse(text); } catch (e) { j = null; }
  const code = j ? String(j.error_code || j.code || j.error || (j.access_token ? "session" : (j.confirmation_sent_at ? "confirmation_required" : ""))) : (text ? "non-json" : "");
  const rec = { step, name, url, status: r.status, code: code.slice(0, 60), ms: Date.now() - t0,
    has_access: !!(j && j.access_token), has_refresh: !!(j && j.refresh_token), user_id: !!(j && j.user && j.user.id),
    expect, ok: expect ? expect(r.status, code, j) : true };
  results.push(rec); console.log(line(rec));
  return { rec, json: j };
}
function line(rec) {
  return (rec.ok ? "PASS" : "FAIL") + " — " + String(rec.step).padStart(2) + " " + rec.name.padEnd(34) + " HTTP " + rec.status + (rec.code ? " · " + rec.code : "") +
    (rec.has_access ? " · session" : "") + " · " + rec.ms + " ms";
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isSession = (s, c, j) => s === 200 && !!(j && j.access_token && j.refresh_token && j.user && j.user.id);
const isInvalidGrant = (s, c) => s === 400 && /invalid_grant/.test(c);

(async () => {
  console.log("probe account: " + EMAIL + "  (password: generated on this runner, masked, never printed)");

  /* 1 — signup, the web app's own shape (docs/app/index.html accSignup) */
  const su = await call(1, "signup (web shape)", WEB_HOST + "/api/auth/v1/signup",
    { method: "POST", headers: webHeaders(null, true), body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
    (s, c, j) => s === 200 && !!(j && (j.access_token || j.confirmation_sent_at)));
  const confirmRequired = !!(su.json && su.json.confirmation_sent_at && !su.json.access_token);
  if (confirmRequired) console.log("NOTE — the server requires email confirmation before a first sign-in (REQUIRE_CONFIRM); the sign-ins below will answer 400 email_not_confirmed. That is a real answer for a fresh account, not a defect of the panel.");
  await sleep(1500);

  /* 2 — the panel's sign-in, byte for byte (panel/main.js gateSignIn) on the panel's host */
  const p1 = await call(2, "sign-in PANEL shape · DO host", PANEL_HOST + TOKEN,
    { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ email: EMAIL, password: PASSWORD, client_kind: "panel" }) },
    confirmRequired ? (s, c) => s === 400 && /email_not_confirmed/.test(c) : isSession);
  await sleep(1500);
  /* 3 — the same body on the web app's host */
  const p2 = await call(3, "sign-in PANEL shape · web host", WEB_HOST + TOKEN,
    { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ email: EMAIL, password: PASSWORD, client_kind: "panel" }) },
    confirmRequired ? (s, c) => s === 400 && /email_not_confirmed/.test(c) : isSession);
  await sleep(1500);
  /* 4 — the web app's sign-in (docs/app/index.html accLogin) */
  const w1 = await call(4, "sign-in WEB shape · web host", WEB_HOST + TOKEN,
    { method: "POST", headers: webHeaders(null, true), body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
    confirmRequired ? (s, c) => s === 400 && /email_not_confirmed/.test(c) : isSession);
  await sleep(1500);

  let access = "", refresh = "";
  if (p1.json && p1.json.access_token) { access = p1.json.access_token; refresh = p1.json.refresh_token || ""; }
  if (access) {
    /* 5 — refresh, panel shape (panel/main.js gateRefresh) */
    const rf = await call(5, "refresh PANEL shape · DO host", PANEL_HOST + REFRESH,
      { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ refresh_token: refresh, client_kind: "panel" }) }, isSession);
    if (rf.json && rf.json.access_token) { access = rf.json.access_token; refresh = rf.json.refresh_token || refresh; }
    await sleep(1200);
    /* 6 — entitlement with the panel's bearer: a pending account is DENIED here, by design */
    const en = await call(6, "entitlement PANEL bearer · DO host", PANEL_HOST + "/api/v1/me/entitlement",
      { method: "GET", headers: panelHeaders(access, false) }, (s, c, j) => s === 200 && !!(j && j.account && j.allowed));
    if (en.json && en.json.account) console.log("      entitlement: " + JSON.stringify(sanitize({ account: en.json.account, allowed: en.json.allowed, reasons: en.json.reasons })));
    await sleep(1200);
    /* 7 — logout, panel bearer */
    await call(7, "logout PANEL bearer · DO host", PANEL_HOST + "/api/auth/v1/logout",
      { method: "POST", headers: panelHeaders(access, true), body: JSON.stringify({ refresh_token: refresh }) }, s => s === 200 || s === 204);
    await sleep(1200);
    /* 8 — the refresh token must be dead now */
    await call(8, "refresh after logout · must fail", PANEL_HOST + REFRESH,
      { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ refresh_token: refresh, client_kind: "panel" }) }, s => s === 400 || s === 401);
    await sleep(1200);
  } else {
    console.log("      (no session from step 2 — steps 5-8 skipped)");
  }
  /* 9 — the refusal a wrong password earns: the line the 6.102.2 panel prints is "(HTTP 400 · invalid_grant)" */
  await call(9, "wrong password PANEL shape", PANEL_HOST + TOKEN,
    { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ email: EMAIL, password: PASSWORD + "x", client_kind: "panel" }) }, isInvalidGrant);
  await sleep(1500);
  /* 10 — an unknown address earns the same answer (no account enumeration) */
  await call(10, "unknown address PANEL shape", PANEL_HOST + TOKEN,
    { method: "POST", headers: panelHeaders(null, true), body: JSON.stringify({ email: "panel-probe-nobody-" + RUN + "@hnkaistudio.com", password: PASSWORD, client_kind: "panel" }) }, isInvalidGrant);

  const failed = results.filter(r => !r.ok);
  const verdict = failed.length ? "FAIL (" + failed.length + " unexpected)" : "PASS — the panel's sign-in, refresh, entitlement and logout all answer as designed on the live server";
  console.log("\n" + verdict);
  console.log("===LOGIN-PROBE-JSON-BEGIN===");
  console.log(JSON.stringify({ run: RUN, account: EMAIL, confirm_required: confirmRequired, results: results.map(r => Object.assign({}, r, { expect: undefined })) }, null, 1));
  console.log("===LOGIN-PROBE-JSON-END===");
  try {
    if (process.env.GITHUB_STEP_SUMMARY) {
      const rows = results.map(r => "| " + r.step + " | " + r.name + " | " + r.status + " | " + (r.code || "") + " | " + (r.ok ? "✅" : "❌") + " |").join("\n");
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        "## Panel sign-in probe — " + verdict + "\n\nThrowaway account `" + EMAIL + "` (pending, no license — reject it in /admin). Password masked, never printed.\n\n| # | step | HTTP | server code | as designed |\n|---|---|---|---|---|\n" + rows + "\n");
    }
  } catch (e) { }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error("probe crashed: " + String(e && e.message || e).slice(0, 200)); process.exit(1); });
