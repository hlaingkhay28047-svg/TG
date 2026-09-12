/* v6.43.0 — A DROPPED CONNECTION IS NOT A REFUSAL.

   THE DEFECT, reported by the owner on 2026-09-09 with four photographs, one of
   them the app's own waiting screen: "ခနခနအကောင့်စစ်တဲ့ဟာကြောင့်လား
   အင်တာနက်ကမကောင်းဘူး ခနခနကျတယ်" — is the constant account-checking why this
   keeps dropping? It was. The chain was four of our own lines:

     setInterval(unifiedHeartbeat, 15000)   forces GET /v1/me/entitlement
     accFetch                               aborts it after ACC_TIMEOUT (15 s)
     unifiedRefresh's catch                 unified.entitlement = null
     appWallState                           no entitlement -> "checking" -> wall

   so one timed-out request threw away a verdict the server had given seconds
   earlier and dropped the wall over the whole studio, roughly every fifteen
   seconds, for as long as the line was bad. Nothing in that sequence was a
   decision by the server, and the app already knew better elsewhere: §2.4's
   rule, pinned by verify_session_freshness E2, is that only a real non-2xx
   answer ends a session, because a request that never arrived is not a verdict.
   The entitlement now lives under the same rule.

   The Photoshop panel had the same fault and worse odds: gateValidate's catch
   deleted the lease and locked the panel, and gateHeartbeat is bound to window
   "focus", which in Photoshop fires every time a retoucher clicks back from the
   canvas.

   A ) a failed re-check no longer walls a session that has a verdict
   A2) ...but a verdict older than the grace window does wall it
   A3) ...and a session that has NEVER been verified is walled, as before
   B ) unifiedRefresh keeps the last entitlement when the request throws
   C ) the heartbeat backs off while calls are failing, and snaps back on success
   D ) the heartbeat sends nothing while the browser says it is offline, and at
       most one call per interval
   E ) the card says the answer is the last one that got through, in the
       running language
   F ) a re-check in flight does not blank a card that already has an answer
   G ) the panel keeps a live lease through a dropout, and its beat is gated
   I ) v6.70.0 — THE OTHER HALF: the app CLOSED, and opened again on the same
       dead line. 6.43.0 held a verdict in memory; a cold boot had none, so the
       waiting screen went up over an account the server had approved minutes
       earlier. The last VERIFIED answer is now written down with the account it
       belongs to and the moment it arrived, and a boot starts from it — marked
       unconfirmed, on the same six-hour clock measured from that success, gone
       the instant the server refuses or the student signs out.
   H ) CI runs this test
*/
"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8931;
const APP = "http://127.0.0.1:" + PORT + "/index.html";
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const hasBurmese = s => /[က-႟]/.test(String(s || ""));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_lang", "my"); } catch (e) {} });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof appWallState === "function"
    && typeof unifiedRefresh === "function" && typeof unifiedBeatMs === "function",
    null, { timeout: 30000 });

  const R = await page.evaluate(async () => {
    const granted = () => ({
      account: { account_status: "active", effective_status: "active", approved: true },
      license: { status: "active", active: true, expires_at: "2027-01-01" },
      permissions: { web_app: true, ccx_download: true, panel: true },
      devices: { phone: { registered: true }, computer: null, slots: [] },
      reasons: {}, allowed: { web_app: true },
    });
    const out = {};

    /* ---- A / A2 / A3 : what the wall reads ---- */
    window.acc = window.acc || {};
    acc.sess = { access: "a", refresh: "r", uid: "u", exp: Math.floor(Date.now() / 1000) + 3600 };
    acc.profile = { plan_expires_at: "2027-01-01" };
    unified.enforced = true; unified.legacy = false; unified.loading = false;

    unified.entitlement = granted(); unified.error = true; unified.last = Date.now() - 60000;
    out.staleInGrace = appWallState();

    unified.last = Date.now() - (UNIFIED_GRACE_MS + 60000);
    out.staleBeyondGrace = appWallState();

    unified.entitlement = null; unified.error = false; unified.last = 0;
    out.neverVerified = appWallState();

    /* a re-check in flight over a good verdict is not a wall either */
    unified.entitlement = granted(); unified.error = false; unified.last = Date.now();
    unified.loading = true;
    out.loadingOverVerdict = appWallState();
    unified.loading = false;

    /* ---- B : the verdict survives a request that never lands ---- */
    const realFetch = window.accFetch;
    unified.entitlement = granted(); unified.error = false; unified.last = Date.now();
    unified.fails = 0; unified.inFlight = null;
    window.accFetch = async function () { throw new Error("net"); };
    await unifiedRefresh(true);
    out.keptAfterThrow = !!unified.entitlement && unified.entitlement.permissions.web_app === true;
    out.errAfterThrow = unified.error === true;
    out.failsAfterThrow = unified.fails;

    /* ...and a real answer replaces it */
    const replaced = granted(); replaced.allowed.web_app = false; replaced.reasons.web_app = "device_required";
    window.accFetch = async function () {
      return { ok: true, status: 200, headers: { get: () => "application/json" },
               json: async () => replaced };
    };
    unified.inFlight = null;
    await unifiedRefresh(true);
    out.verdictReplaced = unified.entitlement && unified.entitlement.allowed.web_app === false;
    out.failsResetOnOk = unified.fails;

    /* ...and a response the server DOES send that is not an entitlement — a
       403, a 5xx — clears it at once. Only silence earns the grace. */
    unified.entitlement = granted(); unified.error = false; unified.last = Date.now();
    unified.fails = 0; unified.inFlight = null;
    window.accFetch = async function () {
      return { ok: false, status: 403, headers: { get: () => "application/json" },
               json: async () => ({ error: "forbidden" }) };
    };
    await unifiedRefresh(true);
    out.clearedOn403 = unified.entitlement;
    out.wallOn403 = appWallState();
    window.accFetch = realFetch;

    /* ---- C : backoff curve ---- */
    const beats = [];
    for (let f = 0; f <= 7; f++) { unified.fails = f; beats.push(unifiedBeatMs()); }
    out.beats = beats;

    /* ---- D : offline sends nothing; one call per interval ---- */
    let calls = 0;
    window.accFetch = async function () { calls++; throw new Error("net"); };
    unified.fails = 0; unified.nextBeat = 0; unified.inFlight = null;
    const onLineDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    unifiedHeartbeat(); unifiedHeartbeat();
    out.callsWhileOffline = calls;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    unifiedHeartbeat();
    await new Promise(r => setTimeout(r, 50));
    unified.inFlight = null;
    unifiedHeartbeat(); unifiedHeartbeat(); unifiedHeartbeat();
    out.callsInOneInterval = calls;
    if (onLineDesc) Object.defineProperty(navigator, "onLine", onLineDesc);
    window.accFetch = realFetch;

    /* ---- E / F : what the card says ---- */
    unified.entitlement = granted(); unified.last = Date.now(); unified.fails = 0;
    unified.loading = false; unified.error = true;
    unifiedRender();
    out.staleText = document.getElementById("unifiedAccessText").textContent;
    out.staleTitle = document.getElementById("unifiedAccessTitle").textContent;
    out.staleWebTile = document.getElementById("unifiedWebPermission").textContent;

    unified.error = false; unified.loading = true;
    unifiedRender();
    out.inFlightWebTile = document.getElementById("unifiedWebPermission").textContent;
    unified.loading = false;

    /* ---- I : v6.70.0 — the cold boot ----
       6.43.0 held a verdict while the app was OPEN. Everything here is about
       the app being CLOSED and opened again on the same dead line. */
    const okFetch = function (ent) {
      return async function () {
        return { ok: true, status: 200, headers: { get: () => "application/json" },
                 json: async () => ent };
      };
    };
    const wipe = () => { try { localStorage.removeItem(ACC_LS_ENT); } catch (e) {} };
    const rec = () => { try { return JSON.parse(localStorage.getItem(ACC_LS_ENT) || "null"); } catch (e) { return null; } };
    /* a fresh boot: nothing in memory, exactly as every page load starts */
    const coldBoot = function () {
      unified.entitlement = null; unified.enforced = false; unified.legacy = false;
      unified.error = false; unified.loading = false; unified.last = 0; unified.fails = 0;
      unified.inFlight = null;
    };

    wipe();
    acc.sess = { access: "a", refresh: "r", uid: "u", exp: Math.floor(Date.now() / 1000) + 3600 };
    /* an approved, paid-up student — the wall must be the ONLY thing this
       section can be measuring */
    acc.profile = { plan_status: "active", plan_expires_at: "2027-01-01" };
    unified.enforced = true; unified.legacy = false; unified.loading = false; unified.inFlight = null;
    window.accFetch = okFetch(granted());
    await unifiedRefresh(true);
    const wrote = rec();
    out.I_wroteUid = wrote && wrote.uid;
    out.I_wroteLast = !!(wrote && Math.abs(wrote.last - unified.last) < 5);
    out.I_wroteEnt = !!(wrote && wrote.ent && wrote.ent.permissions.web_app === true);
    const successAt = unified.last;

    /* THE COLD BOOT ITSELF. The real sequence is what matters, and it is the
       one the owner photographed as "works for a moment, then Access blocked":
       the page loads with nothing verified, the first entitlement call goes out
       and never lands, its catch marks the server as enforcing, and THAT is the
       moment the wall decides. So the boot is driven through the real call with
       a dead line, once without the record and once with it. */
    const deadLine = async function () { throw new Error("net"); };
    coldBoot();
    window.accFetch = deadLine;
    await unifiedRefresh(true);
    out.I_wallWithoutRecall = appWallState();          /* what 6.43.0 left: the wall */

    coldBoot();
    out.I_recalled = unifiedRecall();
    out.I_recallStale = unified.error === true && unified.enforced === true;
    /* the clock is the SUCCESS, not the boot — the window cannot be extended
       by staying offline */
    out.I_recallKeepsLast = unified.last === successAt;
    window.accFetch = deadLine;
    unified.inFlight = null;
    await unifiedRefresh(true);                        /* the same dead first call */
    out.I_recallOpens = appWallState();                /* what 6.70.0 gives: open */
    out.I_recallSurvivesBeat = !!unified.entitlement;

    /* a record past the window is refused AND deleted, so it cannot be retried */
    coldBoot();
    accLSSet(ACC_LS_ENT, { uid: "u", ent: granted(), last: Date.now() - (UNIFIED_GRACE_MS + 60000) });
    out.I_staleRefused = unifiedRecall() === false && !unified.entitlement;
    out.I_staleDeleted = rec() === null;
    window.accFetch = deadLine;
    unified.inFlight = null;
    await unifiedRefresh(true);
    out.I_staleWalls = appWallState();

    /* another account's record is not this account's verdict */
    coldBoot();
    accLSSet(ACC_LS_ENT, { uid: "SOMEONE-ELSE", ent: granted(), last: Date.now() - 60000 });
    out.I_otherUidRefused = unifiedRecall() === false && !unified.entitlement;
    out.I_otherUidDeleted = rec() === null;

    /* a record stamped in the future is a moved clock, not a verdict */
    coldBoot();
    accLSSet(ACC_LS_ENT, { uid: "u", ent: granted(), last: Date.now() + 3600000 });
    out.I_futureRefused = unifiedRecall() === false && !unified.entitlement;

    /* and a record with no session at all is never read */
    coldBoot();
    accLSSet(ACC_LS_ENT, { uid: "u", ent: granted(), last: Date.now() - 60000 });
    const keepSess = acc.sess; acc.sess = null;
    out.I_noSessRefused = unifiedRecall() === false;
    acc.sess = keepSess;

    /* A REFUSAL DELETES IT. Otherwise a reload would resurrect exactly the
       access the server just took away. */
    wipe();
    unified.enforced = true; unified.inFlight = null;
    window.accFetch = okFetch(granted());
    await unifiedRefresh(true);
    out.I_recordBefore403 = !!rec();
    unified.inFlight = null;
    window.accFetch = async function () {
      return { ok: false, status: 403, headers: { get: () => "application/json" },
               json: async () => ({ error: "forbidden" }) };
    };
    await unifiedRefresh(true);
    out.I_recordAfter403 = rec();

    /* signing out takes it with everything else */
    wipe();
    unified.enforced = true; unified.inFlight = null;
    window.accFetch = okFetch(granted());
    await unifiedRefresh(true);
    out.I_recordBeforeSignOut = !!rec();
    accSignOutLocal("quiet");
    out.I_recordAfterSignOut = rec();

    window.accFetch = realFetch;
    wipe();
    return out;
  });

  report("A) a failed re-check does not wall a session that already has a verdict",
    R.staleInGrace !== "checking", R.staleInGrace);
  report("A2) a verdict older than the grace window does wall it",
    R.staleBeyondGrace === "checking", R.staleBeyondGrace);
  report("A3) a session that has never been verified is still walled",
    R.neverVerified === "checking", R.neverVerified);
  report("A4) a re-check in flight over a good verdict is not a wall",
    R.loadingOverVerdict !== "checking", R.loadingOverVerdict);
  report("B) unifiedRefresh keeps the last entitlement when the request throws",
    R.keptAfterThrow === true && R.errAfterThrow === true && R.failsAfterThrow === 1,
    { kept: R.keptAfterThrow, err: R.errAfterThrow, fails: R.failsAfterThrow });
  report("B2) a real answer still replaces the verdict, and clears the failure run",
    R.verdictReplaced === true && R.failsResetOnOk === 0,
    { replaced: R.verdictReplaced, fails: R.failsResetOnOk });
  report("B3) an answer that is not an entitlement (403) clears the verdict and walls",
    R.clearedOn403 === null && R.wallOn403 === "checking",
    { entitlement: R.clearedOn403, wall: R.wallOn403 });
  report("C) the beat is 15 s while healthy, doubles per failure and caps at 5 min",
    R.beats[0] === 15000 && R.beats[1] === 30000 && R.beats[2] === 60000
      && R.beats[7] === 300000 && R.beats[6] === 300000,
    R.beats);
  report("D) the heartbeat sends nothing while the browser is offline",
    R.callsWhileOffline === 0, R.callsWhileOffline);
  report("D2) and at most one call per interval once it is back",
    R.callsInOneInterval === 1, R.callsInOneInterval);
  report("E) the card says the answer is the last one that got through, in Burmese",
    hasBurmese(R.staleText) && /နောက်ဆုံး/.test(R.staleText),
    R.staleText);
  report("E2) a stale answer still shows the real status, not 'Checking'",
    R.staleWebTile === "ON" && !/Checking/.test(R.staleTitle),
    { tile: R.staleWebTile, title: R.staleTitle });
  report("F) a re-check in flight does not blank a card that already has an answer",
    R.inFlightWebTile === "ON", R.inFlightWebTile);

  /* ---- G : the Photoshop panel ---- */
  const main = fs.readFileSync(path.join(ROOT, "panel", "main.js"), "utf8");
  const vBody = main.slice(main.indexOf("async function gateValidate"),
                           main.indexOf("async function gateRequireLease"));
  /* the prose in these blocks NAMES both strings, so the assertions below read
     the code with the comments taken out */
  const decomment = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const catchBody = decomment(vBody.slice(vBody.lastIndexOf("} catch (e) {")));
  report("G) gateValidate keeps a live lease when the request never lands",
    /gateLeaseValid\(\)\s*\)\s*return true;/.test(catchBody)
      && catchBody.indexOf("gateLeaseValid()") < catchBody.indexOf('gateS.lease = ""'),
    catchBody.replace(/\s+/g, " ").slice(0, 220));
  report("G2) and says the connection was lost, not that the service is down",
    /gate_offline/.test(catchBody) && !/gate_service_down/.test(catchBody),
    catchBody.replace(/\s+/g, " ").slice(-160));
  const hBody = decomment(main.slice(main.indexOf("function gateHeartbeat()"),
                                     main.indexOf("async function gateBoot")));
  report("G3) the panel's automatic beat is gated and backs off",
    /nextBeat/.test(hBody) && /gateBeatMs\(\)/.test(hBody)
      && /netFails/.test(main.slice(main.indexOf("function gateBeatMs"), main.indexOf("function gateHeartbeat()"))),
    hBody.replace(/\s+/g, " ").slice(0, 200));
  report("G4) a check the student presses jumps the backoff",
    /gateS\.nextBeat = 0;/.test(main.slice(main.indexOf("async function gateCheck"),
                                           main.indexOf("async function gateCheck") + 400)),
    "gateCheck");

  /* ---- I : v6.70.0 — the cold boot ---- */
  report("I1) a verified answer is written down with the account it belongs to and when it arrived",
    R.I_wroteUid === "u" && R.I_wroteLast === true && R.I_wroteEnt === true,
    { uid: R.I_wroteUid, last: R.I_wroteLast, ent: R.I_wroteEnt });
  report("I2) a cold boot on a dead line opens on that answer instead of the waiting screen",
    R.I_wallWithoutRecall === "checking" && R.I_recalled === true && R.I_recallOpens === ""
      && R.I_recallSurvivesBeat === true,
    { before: R.I_wallWithoutRecall, recalled: R.I_recalled, after: R.I_recallOpens,
      keptThroughBeat: R.I_recallSurvivesBeat });
  report("I3) it comes back marked UNCONFIRMED, and its clock is the success, not the boot",
    R.I_recallStale === true && R.I_recallKeepsLast === true,
    { stale: R.I_recallStale, keptLast: R.I_recallKeepsLast });
  report("I4) an answer older than the grace window is refused, deleted, and walls",
    R.I_staleRefused === true && R.I_staleDeleted === true && R.I_staleWalls === "checking",
    { refused: R.I_staleRefused, deleted: R.I_staleDeleted, wall: R.I_staleWalls });
  report("I5) another account's answer is never this account's, and a moved clock is not a verdict",
    R.I_otherUidRefused === true && R.I_otherUidDeleted === true && R.I_futureRefused === true
      && R.I_noSessRefused === true,
    { otherUid: R.I_otherUidRefused, deleted: R.I_otherUidDeleted,
      future: R.I_futureRefused, noSess: R.I_noSessRefused });
  report("I6) a refusal the server DID send deletes it, so a reload cannot resurrect the access",
    R.I_recordBefore403 === true && R.I_recordAfter403 === null,
    { before: R.I_recordBefore403, after: R.I_recordAfter403 });
  report("I7) and signing out takes it with everything else",
    R.I_recordBeforeSignOut === true && R.I_recordAfterSignOut === null,
    { before: R.I_recordBeforeSignOut, after: R.I_recordAfterSignOut });

  /* ---- H : CI ---- */
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
  report("H) CI runs this test", wf.indexOf("test/verify_offline_grace.js") >= 0, "test.yml");

  report("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(failures ? "\nFAILURES: " + failures : "\nAll offline-grace checks passed.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
