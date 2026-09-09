/* v6.34.0 — THE SESSION IS KEPT FRESH, NOT REPAIRED AFTER IT BREAKS.

   Both surfaces used to rotate an access token only when the server refused one:
   the call went out with a spent credential, came back 401, and was sent again.
   Two round trips for every call after the hour mark — and because a refresh that
   answers 400 signs the student out, it was also the moment a perfectly good
   account could be told its session had expired, mid-task. (The Photoshop panel
   carried the same shape of lie until 6.102.4, where a dead remembered session
   was reported as a wrong password.)

   This file proves the new rule on the surface that students use — by DRIVING it,
   not by reading it — and pins the identical rule in the admin's own source. */
"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8931;
const APP = "http://127.0.0.1:" + PORT + "/index.html";
let failures = 0;

function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : " :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* The session the app restores on boot. `exp` is what accTokenLeft reads. */
function seed(secondsLeft) {
  return function (left) {
    try {
      localStorage.setItem("hnk_acc_sess_v1", JSON.stringify({
        access: "token-old", refresh: "refresh-1",
        exp: Math.floor(Date.now() / 1000) + left,
        uid: "11111111-2222-4333-8444-555555555555", email: "student@example.com",
      }));
      localStorage.setItem("hnk_acc_login_at", String(Date.now()));
    } catch (e) {}
  };
}

async function open(browser, secondsLeft) {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  await page.addInitScript(seed(), secondsLeft);
  await page.addInitScript(() => { window.__calls = []; });
  /* Every API call the page makes is recorded and answered here, so the walk is
     deterministic and nothing leaves the machine. */
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = request.url();
    const auth = request.headers()["authorization"] || "";
    await page.evaluate(([u, a]) => window.__calls.push({ url: u, auth: a }), [url, auth]).catch(() => {});
    if (url.indexOf("grant_type=refresh_token") >= 0) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        access_token: "token-new", refresh_token: "refresh-2", expires_in: 3600,
        user: { id: "11111111-2222-4333-8444-555555555555", email: "student@example.com" },
      }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      account: { account_status: "active", effective_status: "active", approved: true },
      license: { status: "active", active: true }, permissions: {}, allowed: {}, reasons: {},
      devices: { phone: null, computer: null, slots: [] },
      panel: { latest_version: "6.24.0", minimum_supported_version: "6.24.0" },
    }) });
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof accFetch === "function" && typeof accNeedsRefresh === "function",
    null, { timeout: 30000 });
  await settle(page);
  return page;
}

/* v6.42.0 — THE FIXTURE MUST NOT RACE THE PAGE'S OWN BOOT.

   This test failed intermittently — once in a local 199-test sweep and once on
   main, while the identical tree passed on the pull request. The failure data
   named the cause: check A's recorded calls began with a /v1/me/entitlement
   already carrying "token-new", and ended with a /v1/devices/enroll the test
   never makes. Both are BOOT's requests, landing inside the measurement window
   after it had cleared window.__calls. With one of them ahead of the test's own
   read, refreshAt < readAt is false and A reports a rotation that came late.

   Check C failed the same way from the other side: it set a spent token with no
   wait at all, so a boot rotation still in flight resolved afterwards and left
   the session healthy — no rotation for the visibilitychange to make, and
   nothing to observe. C asserted the app was broken when the app was fine.

   v6.39.4 saw half of this and waited for the boot ROTATION in A. That is not
   enough: boot also issues the entitlement and enroll calls, and those are what
   land late. So every page now waits for quiet — no new recorded call for 350ms
   — before a check touches the session, and C waits for the boot rotation the
   way A already did. The contracts are untouched: each check still fails if the
   app stops rotating (fault-injected below by pinning accNeedsRefresh to false,
   which turns A red exactly as it should). */
async function settle(page, quietMs = 350, capMs = 8000) {
  const started = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - started < capMs) {
    const n = await page.evaluate(() => (window.__calls || []).length).catch(() => -1);
    if (n !== last) { last = n; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();

  /* ---- A) a token inside the margin is rotated BEFORE the call goes out ---- */
  let page = await open(browser, 60);
  /* 6.39.4 — WAIT FOR BOOT TO FINISH ROTATING. This page opens with a spent
     token, so the boot path rotates it (that is B2's feature). Setting the
     session back inside the margin while that rotation is still in flight let
     it land afterwards, leaving a healthy token at request time and no refresh
     to observe — the measurement raced its own fixture, and under a loaded
     machine it lost. This waits for the boot rotation to be visible, then puts
     the spent token back and measures the request path. */
  await page.waitForFunction(() => typeof acc !== "undefined" && acc.sess &&
    acc.sess.access === "token-new", null, { timeout: 30000 }).catch(() => {});
  await settle(page);
  const near = await page.evaluate(async () => {
    /* boot itself already rotates a spent token — that is the feature. Put the
       session back inside the margin so the request path is what is measured. */
    acc.sess.access = "token-old";
    acc.sess.exp = Math.floor(Date.now() / 1000) + 60;
    window.__calls = [];
    const before = accNeedsRefresh();
    await accFetch("/v1/me/entitlement");
    return { before, needsAfter: accNeedsRefresh(), calls: window.__calls,
      access: (acc.sess || {}).access, left: accTokenLeft() };
  });
  const refreshAt = near.calls.findIndex(c => c.url.indexOf("grant_type=refresh_token") >= 0);
  const readAt = near.calls.findIndex(c => c.url.indexOf("/v1/me/entitlement") >= 0);
  report("A) a token with a minute of life left is rotated before the request, not after a 401",
    near.before === true && refreshAt >= 0 && readAt >= 0 && refreshAt < readAt, near);
  report("A2) and the request that follows carries the new token",
    readAt >= 0 && near.calls[readAt].auth.indexOf("token-new") >= 0 && near.access === "token-new", near.calls);
  report("A3) once rotated, the same call no longer asks for a refresh",
    near.needsAfter === false && near.left > 300, { needsAfter: near.needsAfter, left: near.left });
  await page.close();

  /* ---- B) a healthy token is left alone: no refresh traffic at all ---- */
  page = await open(browser, 3600);
  const healthy = await page.evaluate(async () => {
    acc.sess.exp = Math.floor(Date.now() / 1000) + 3600;
    window.__calls = [];
    const before = accNeedsRefresh();
    await accFetch("/v1/me/entitlement");
    return { before, calls: window.__calls };
  });
  report("B) a healthy token is never rotated — the margin is a floor, not a heartbeat",
    healthy.before === false && !healthy.calls.some(c => c.url.indexOf("grant_type=refresh_token") >= 0),
    healthy.calls);
  await page.close();

  /* ---- B2) the boot path itself rotates a spent token, before the first screen paints ---- */
  page = await open(browser, 45);
  const booted = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 600));
    return { access: (acc.sess || {}).access, left: accTokenLeft(), calls: window.__calls.length };
  });
  report("B2) a session restored from storage with a spent token is rotated at boot, before anything is asked of it",
    booted.access === "token-new" && booted.left > 300, booted);
  await page.close();

  /* ---- C) coming back to the tab rotates a spent token with no request to carry it ---- */
  page = await open(browser, 30);
  /* the same boot gate A carries: a rotation still in flight would land on top
     of the spent token this check installs, leaving nothing for the wake to do */
  await page.waitForFunction(() => typeof acc !== "undefined" && acc.sess &&
    acc.sess.access === "token-new", null, { timeout: 30000 }).catch(() => {});
  await settle(page);
  const woke = await page.evaluate(async () => {
    acc.sess.access = "token-old";
    acc.sess.exp = Math.floor(Date.now() / 1000) + 30;
    window.__calls = [];
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise(r => setTimeout(r, 400));
    return { calls: window.__calls, access: (acc.sess || {}).access };
  });
  report("C) returning to the tab rotates a spent token on its own, so the first click already works",
    woke.calls.some(c => c.url.indexOf("grant_type=refresh_token") >= 0) && woke.access === "token-new", woke);
  await page.close();
  await browser.close();

  /* ---- D) the same rule, written the same way, in the admin ---- */
  const admin = fs.readFileSync(path.join(ROOT, "docs/admin/admin.js"), "utf8");
  report("D) the admin rotates before it spends: a near-expiry gate on the way into api(), not only on a 401",
    /const ADMIN_FRESH_MARGIN_MS = 300000;/.test(admin) &&
    /function sessionNearExpiry\(\) \{/.test(admin) &&
    /async function keepSessionFresh\(\) \{[\s\S]*?if \(!refreshToken\(\) \|\| !sessionNearExpiry\(\)\) return true;[\s\S]*?return await refreshSession\(\);/.test(admin) &&
    /if \(!retried && accessToken\(\) && sessionNearExpiry\(\)\) await keepSessionFresh\(\);/.test(admin) &&
    /if \(response\.status === 401 && !retried\)/.test(admin), null);
  report("D2) and it watches the same three moments the student app watches",
    /visibilitychange[\s\S]{0,120}keepSessionFresh\(\)/.test(admin) &&
    /addEventListener\("online", \(\) => \{ keepSessionFresh\(\); \}\)/.test(admin) &&
    /setInterval\(\(\) => \{[\s\S]{0,120}keepSessionFresh\(\);[\s\S]{0,40}\}, ADMIN_FRESH_TICK_MS\)/.test(admin), null);

  /* The server may write expires_at as epoch seconds, epoch milliseconds or a
     date string; a parser that reads one of the three and shrugs at the others
     silently disables the whole rule. Run it against all three. */
  const parserSrc = admin.slice(admin.indexOf("function sessionExpiresAtMs()"),
    admin.indexOf("function sessionNearExpiry()"));
  const now = Date.now();
  const runParser = raw => {
    // eslint-disable-next-line no-new-func
    const fn = new Function("RAW", "function readSession(){ return { expires_at: RAW }; }\n" + parserSrc + "\nreturn sessionExpiresAtMs();");
    return fn(raw);
  };
  const seconds = Math.floor(now / 1000) + 600;
  const cases = [
    [seconds, seconds * 1000],
    [seconds * 1000, seconds * 1000],
    [new Date(seconds * 1000).toISOString(), seconds * 1000],
    [null, 0], ["", 0], [undefined, 0],
  ];
  const wrong = cases.filter(([raw, want]) => Math.abs(runParser(raw) - want) > 1000)
    .map(([raw]) => String(raw) + " -> " + runParser(raw));
  report("D3) the admin reads an expiry written as epoch seconds, epoch milliseconds or a date string",
    wrong.length === 0, wrong);

  /* ---- E) the student app's own source says the same three moments ---- */
  const app = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
  report("E) the student app watches the tab, the network and the clock, and its margin is a constant",
    /var ACC_FRESH_MARGIN = 300;/.test(app) && /var ACC_FRESH_TICK = 60000;/.test(app) &&
    /function accNeedsRefresh\(\)\{[\s\S]*?accTokenLeft\(\) <= ACC_FRESH_MARGIN/.test(app) &&
    /if \(!o\.anon && !o\._retried && accNeedsRefresh\(\)\)\{\n      await accKeepFresh\(\);/.test(app) &&
    /accFreshWire[\s\S]*?visibilitychange[\s\S]*?accKeepFresh\(\)[\s\S]*?"online"[\s\S]*?accKeepFresh\(\)[\s\S]*?setInterval[\s\S]*?ACC_FRESH_TICK/.test(app), null);
  /* "offline" must never sign anybody out — the subway rule, kept from §7.2. */
  const keepFresh = app.slice(app.indexOf("function accKeepFresh()"), app.indexOf("(function accFreshWire()"));
  report("E2) only a credential verdict signs a student out; an unreachable server never does",
    /if \(ok === "dead"\) accSignOutLocal\("expired"\);/.test(keepFresh) &&
    !/offline[\s\S]*?accSignOutLocal/.test(keepFresh), keepFresh.slice(0, 200));

  const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("F) CI runs this test", ci.includes("node test/verify_session_freshness.js"), null);

  if (failures) process.exit(1);
  console.log("\nSession freshness verified — the token rotates before it is spent, on both surfaces.");
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
