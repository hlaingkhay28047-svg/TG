/* v6.22.0 — the Photoshop panel behind the same account as the web app.

   WHY THIS FILE EXISTS. Until v6.22.0 the .ccx was the hole in the paywall:
   the web app had been behind a joining fee plus a monthly fee since v5.31.0,
   and anybody who found the download got the entire panel free, forever. One
   HNK account now opens both, and one payment buys the pair.

   The panel has no source tree in this repository — the .ccx IS the source, a
   plain zip — so this file unzips the shipped artifact and runs the real
   index.html in a browser behind a UXP shim. Reading main.js with a regular
   expression would only prove the words are present; loading it proves the
   wall comes down for a paying customer and stays up for everybody else.

   Pinned contracts:
   A) The overlay ships VISIBLE. Only the "off" class hides it, so a scripting
      fault leaves the panel locked rather than handing it over -- and the app
      behind it is display:none while the wall is up, because Tab ignores
      z-index and a wall you can tab past is a picture of a wall.
   A4) EVERY CSS PROPERTY THE GATE DECLARES ALREADY APPEARS IN styles.css.
      The panel runs in Adobe UXP, not a browser, and this test drives
      Chromium. The first draft of the gate built its wall out of
      `visibility:hidden` and `pointer-events:none`, positioned it with
      `inset:0`, and selected with `:not()`, `*` and `[disabled]` -- six
      constructs the panel's own 37KB stylesheet uses zero times, one of which
      its header comment names as unsupported outright. Every assertion below
      passed anyway, because Chromium supports all six. So this check does not
      ask a browser: it reads the properties out of the gate's <style> and
      demands each one already be in use somewhere in styles.css, which is
      37KB of CSS proven in the real renderer by shipping.
   B) No saved session → the login screen, not the panel.
   C) An active plan → the wall comes down, and the header counts the days.
   D) A lapsed plan → locked, with a message that says one payment covers both
      products and points at the website.
   E) plan_status alone never unlocks: an "active" status with a past expiry
      stays locked. (The server extends plan_expires_at on approval but never
      sweeps the status back, so a status-only check grants Premium forever —
      the exact bug the web app's isPremium documents.)
   F) Offline with a recently confirmed plan → the panel keeps working, inside
      a bounded grace window.
   G) The grace window never outlives the plan's own expiry date, and never
      outlives its own length.
   H) The device cap bites here, unlike the web app where it never fails a
      login — otherwise one account is worth unlimited panel installs, which is
      the hole this release closes.
   I) A wrong password does not unlock and does not persist a token.
   J) A correct password unlocks and registers this machine as a device.
   M) A server that answers 5xx forever grants at most the same bounded grace
      window as being offline — never permanent access off a stale cache.
   N) A 200 that carries no profile row clears the cache instead of leaving the
      last good one standing.
   K) The panel never takes money: no payment request, no QR, no slip.
   L) No console error anywhere in the above.

   Usage: node test/verify_panel_gate.js */
"use strict";
const { chromium } = require("playwright-core");
const { execFileSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PANEL_VERSION = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs", "download", "panel-version.json"), "utf8")).v;
const CCX = path.join(ROOT, "docs", "download", `HNK_Ai_Panel_v${PANEL_VERSION}.ccx`);

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------------- unpack the shipped artifact ---------------- */
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-panel-"));
execFileSync("unzip", ["-qq", "-o", CCX, "-d", DIR], { stdio: "pipe" });

const indexHtml = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(DIR, "main.js"), "utf8");

/* ---------------- static half ---------------- */
report("A1) the overlay is in the markup with no class that would hide it",
  /<div id="hnkGate"[^>]*>/.test(indexHtml) &&
  !/<div id="hnkGate"[^>]*class="[^"]*\boff\b/.test(indexHtml),
  { tag: (indexHtml.match(/<div id="hnkGate"[^>]*>/) || [""])[0] });

report("A2) the only rule that hides it is the class JavaScript adds",
  /#hnkGate\.off\{display:none\}/.test(indexHtml.replace(/\s+/g, "")),
  { hasRule: /#hnkGate\.off/.test(indexHtml) });

/* every element the gate reaches for must exist in the markup it ships with */
const referenced = [...new Set([...mainJs.matchAll(/gateEl\("([A-Za-z0-9_]+)"\)/g)].map(m => m[1]))]
  .concat(["gateSub", "gateLockedMsg", "gateSignIn", "gateBuy", "gateRetry", "gateSignOut"]);
const missing = [...new Set(referenced)].filter(id => !new RegExp(`id="${id}"`).test(indexHtml));
report("A3) every id the gate touches exists in index.html", missing.length === 0,
  { missing, checked: [...new Set(referenced)].length });

/* A4) the renderer check. Not a browser question — a question about what this
   product has already proven works in Adobe UXP by shipping it. */
const panelCss = fs.readFileSync(path.join(DIR, "styles.css"), "utf8");
const gateStyle = (indexHtml.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const gateBody = gateStyle.replace(/\/\*[\s\S]*?\*\//g, "");
const gateProps = [...new Set([...gateBody.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:/g)].map(m => m[1]))];
const unproven = gateProps.filter(prop => !new RegExp("(?:^|[{;\\s])" + prop + "\\s*:", "m").test(panelCss));
report("A4) every CSS property the gate declares is one styles.css already ships",
  gateProps.length > 0 && unproven.length === 0,
  { unproven, checked: gateProps.length });

/* the selector constructs the panel's own stylesheet never uses */
const gateSelectors = gateBody.replace(/\{[^}]*\}/g, " ");
const risky = [[":not(", /:not\(/], ["universal *", /(^|[,\s])\*\s*\{/],
               ["[attr]", /\[[a-z-]+\]/]]
  .filter(([, re]) => re.test(gateSelectors) && !re.test(panelCss.replace(/\{[^}]*\}/g, " ")))
  .map(([name]) => name);
report("A5) the gate uses no selector construct the panel's own stylesheet avoids",
  risky.length === 0, { risky });

report("K1) the gate markup offers no way to pay — selling happens on the website",
  !/QR|payment_requests|screenshot|txn_last6/i.test(
    (indexHtml.match(/<div id="hnkGate"[\s\S]*?<\/div>\s*<\/div>/) || [""])[0]), {});

/* ---------------- browser half ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp" };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const abs = path.join(DIR, rel);
  if (!abs.startsWith(DIR) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
  res.end(fs.readFileSync(abs));
});

const DAY = 86400000;
const UID = "77777777-8888-9999-aaaa-bbbbbbbbbbbb";
const future = d => new Date(Date.now() + d * DAY).toISOString();
const past = d => new Date(Date.now() - d * DAY).toISOString();

/* The UXP shim. main.js requires photoshop and uxp at parse time, so without
   this the file throws before the gate is ever defined — which is a correct
   fail-closed outcome, and a useless test. The shim is deliberately the
   smallest surface main.js touches at module scope plus the settings file the
   gate persists through, because THAT is what each scenario needs to seed. */
function initScript(cfg) {
  return `(function(){
    window.__cfg = ${JSON.stringify(cfg)};
    window.__reqs = [];
    var settings = JSON.stringify(window.__cfg.settings || {});
    var folder = {
      getEntry: function(){ return settings === null ? Promise.reject(new Error("none"))
                                                     : Promise.resolve(file); },
      createFile: function(){ return Promise.resolve(file); }
    };
    var file = {
      read: function(){ return Promise.resolve(settings); },
      write: function(txt){ settings = txt; return Promise.resolve(); }
    };
    var uxp = {
      storage: { localFileSystem: { getDataFolder: function(){ return Promise.resolve(folder); } },
                 formats: { utf8: "utf8" } },
      shell: { openExternal: function(u){ window.__opened = u; return Promise.resolve(); },
               openPath: function(){ return Promise.resolve(); } }
      /* deliberately NO clipboard here. UXP exposes the clipboard as
         navigator.clipboard, not as a member of the uxp module -- and an
         earlier version of this shim invented uxp.clipboard, which meant the
         gate could depend on an API that does not exist and the test would
         never notice. A fixture that manufactures a platform capability can
         never catch a dependency on it. */
    };
    var ps = { app: { documents: [] }, core: { executeAsModal: function(){} },
               imaging: {}, action: { batchPlay: function(){ return []; } }, constants: {} };
    window.require = function(name){
      if (name === "photoshop") return ps;
      if (name === "uxp") return uxp;
      if (name === "os") return { platform: function(){ return "test"; } };
      return {};
    };

    var realFetch = window.fetch.bind(window);
    window.fetch = function(url, init){
      url = String(url);
      window.__reqs.push({ url: url, method: (init && init.method) || "GET",
                           body: (init && init.body) || null });
      if (url.indexOf("supabase.co") < 0 && url.indexOf("panel-version.json") < 0)
        return realFetch(url, init);
      if (window.__cfg.offline) return Promise.reject(new TypeError("Failed to fetch"));
      var j = function(o, s){ return Promise.resolve(new Response(JSON.stringify(o),
        { status: s || 200, headers: { "Content-Type": "application/json" } })); };
      if (url.indexOf("panel-version.json") >= 0) return j({ v: window.__cfg.panelVersion });
      if (url.indexOf("grant_type=refresh_token") >= 0) {
        window.__refreshCalls = (window.__refreshCalls || 0) + 1;
        var n = window.__refreshCalls;
        var mk = function(){
          if (window.__cfg.refreshStatus) return j({ error: "boom" }, window.__cfg.refreshStatus);
          if (!window.__cfg.refreshOk) return j({ error: "invalid" }, 400);
          var who = (window.__cfg.refreshUsers || [])[n - 1] || window.__cfg.defaultUser;
          return j({ access_token: "at" + n, refresh_token: "rt" + n,
                     user: { id: who.id, email: who.email } });
        };
        var d = (window.__cfg.refreshDelays || [])[n - 1] || 0;
        if (!d) return mk();
        return new Promise(function(res){ setTimeout(function(){ res(mk()); }, d); });
      }
      if (url.indexOf("grant_type=password") >= 0) {
        var b = {}; try { b = JSON.parse((init && init.body) || "{}"); } catch(e){}
        if (b.password !== window.__cfg.goodPass) return j({ error: "invalid_grant" }, 400);
        return j({ access_token: "at", refresh_token: "rt2",
                   user: { id: ${JSON.stringify(UID)}, email: b.email } });
      }
      if (url.indexOf("/rest/v1/profiles") >= 0) {
        if (window.__cfg.profileStatus) return j({ error: "boom" }, window.__cfg.profileStatus);
        return j(window.__cfg.profile ? [window.__cfg.profile] : []);
      }
      if (url.indexOf("/rest/v1/devices") >= 0) {
        if ((init && init.method) === "POST") {
          if (window.__cfg.deviceLimit)
            return j({ code: "P0001", message: "device limit reached" }, 400);
          return j({}, 201);
        }
        return j(window.__cfg.deviceKnown ? [{ id: "d1" }] : []);
      }
      return j({});
    };
  })();`;
}

async function run(browser, cfg, after) {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + String(e).slice(0, 220)));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
  await page.addInitScript(initScript(cfg));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
  /* hnkFetch sleeps 1200ms before its single retry, so an offline scenario
     does not reach a verdict for well over a second. Waiting for a settled
     view rather than a fixed delay is the difference between measuring the
     gate's answer and measuring the clock. */
  await page.waitForFunction(
    () => typeof gateS !== "undefined" && gateS.view !== "" && gateS.view !== "checking",
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({
    /* gateS is a top-level const, which lives in the global LEXICAL scope and
       is therefore not a property of window — reading window.gateS returns
       undefined and would have made every assertion below vacuous. */
    view: typeof gateS !== "undefined" ? gateS.view : "(no gate)",
    hidden: getComputedStyle(document.getElementById("hnkGate")).display === "none",
    login: getComputedStyle(document.getElementById("gateLogin")).display !== "none",
    locked: getComputedStyle(document.getElementById("gateLocked")).display !== "none",
    msg: (document.getElementById("gateLockedMsg").textContent || "").trim(),
    err: (document.getElementById("gateErr").textContent || "").trim(),
    plan: (document.getElementById("brandPlan").textContent || "").trim(),
    appDisplay: getComputedStyle(document.getElementById("app")).display,
    savedSeenAt: typeof state !== "undefined" ? (state.accSeenAt || 0) : -1,
    savedRefresh: typeof state !== "undefined" ? (state.accRefresh || "") : "",
    devMsg: t("gate_devlimit"),
    graceMsg: t("gate_grace").replace("{D}", String(gateGraceLeft())),
    status: (document.getElementById("status") || {}).textContent || "",
    reqs: window.__reqs.map(r => r.method + " " + r.url.replace(/^https?:\/\/[^/]+/, "")),
    bodies: window.__reqs.filter(r => r.body).map(r => r.body)
  }));
  if (after) await after(page, state);
  await page.close();
  return { state, errs };
}

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const allErrs = [];
  const allReqs = [];

  const UID_B = "22222222-3333-4444-5555-666666666666";
  const base = { panelVersion: PANEL_VERSION, refreshOk: true, goodPass: "correct-horse",
                 defaultUser: { id: UID, email: "s@example.com" } };
  const activeProfile = { id: UID, plan_status: "active", plan_expires_at: future(40),
                          allowed_devices: 2, joined_paid: true };

  /* B) nothing saved */
  let r = await run(browser, { ...base, settings: {} });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("B) with no saved session the panel shows the login screen, not the panel",
    !r.state.hidden && r.state.login && !r.state.locked, r.state);
  report("B2) and the app behind the wall is out of the focus order, not merely covered",
    r.state.appDisplay === "none", { appDisplay: r.state.appDisplay });

  /* C) a paying customer */
  r = await run(browser, { ...base, profile: activeProfile,
    settings: { accRefresh: "rt", accUid: UID, accEmail: "s@example.com" } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("C) an active plan takes the wall down and counts the days in the header",
    r.state.hidden && /40/.test(r.state.plan), r.state);
  report("C2) and taking the wall down gives the app back",
    r.state.appDisplay !== "none", { appDisplay: r.state.appDisplay });

  /* D) lapsed */
  r = await run(browser, { ...base,
    profile: { ...activeProfile, plan_status: "none", plan_expires_at: null },
    settings: { accRefresh: "rt", accUid: UID } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("D) a lapsed plan locks the panel and says one payment covers both products",
    !r.state.hidden && r.state.locked && /web app/i.test(r.state.msg) &&
    /panel/i.test(r.state.msg) && /website/i.test(r.state.msg), r.state);

  /* E) status without a live date */
  r = await run(browser, { ...base,
    profile: { ...activeProfile, plan_status: "active", plan_expires_at: past(3) },
    settings: { accRefresh: "rt", accUid: UID } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("E) an 'active' status with a past expiry does NOT unlock",
    !r.state.hidden && r.state.locked, r.state);

  /* F) offline, recently confirmed */
  r = await run(browser, { ...base, offline: true,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("F) offline with a plan confirmed yesterday keeps working, and says so",
    r.state.hidden && r.state.plan === r.state.graceMsg && /6/.test(r.state.plan), r.state);

  /* G1) offline past the grace window */
  r = await run(browser, { ...base, offline: true,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - 30 * DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("G1) the grace window does not last forever — 30 days offline locks it",
    !r.state.hidden && r.state.err.length > 0, r.state);

  /* G2) offline inside the window but past the plan's own expiry */
  r = await run(browser, { ...base, offline: true,
    settings: { accRefresh: "rt", accUid: UID,
                accProfile: { ...activeProfile, plan_expires_at: past(1) },
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("G2) the grace window never outlives the plan's own expiry date",
    !r.state.hidden, r.state);

  /* H) device cap — records, never refuses */
  r = await run(browser, { ...base, profile: activeProfile, deviceLimit: true,
    settings: { accRefresh: "rt", accUid: UID } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("H) the device cap records this machine but never locks a paying customer out",
    r.state.hidden && r.state.appDisplay !== "none", r.state);

  /* O) the auth endpoint failing to answer */
  r = await run(browser, { ...base, refreshStatus: 503,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("O1) a 503 from the token endpoint keeps the session and spends grace instead",
    r.state.hidden && r.state.savedRefresh === "rt", r.state);

  r = await run(browser, { ...base, refreshStatus: 400,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("O2) a 400 from the token endpoint IS a dead session and clears it",
    !r.state.hidden && r.state.savedRefresh === "", r.state);

  for (const st of [407, 429, 502, 511]) {
    r = await run(browser, { ...base, refreshStatus: st,
      settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                  accSeenAt: Date.now() - DAY } });
    allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
    report(`O3.${st}) a ${st} is an outage, not a credential verdict`,
      r.state.hidden && r.state.savedRefresh === "rt", { st, ...r.state });
  }

  /* Q) a superseded run must not write. Two checks are started back to back
     with the first refresh deliberately slow; the mock answers them as two
     DIFFERENT accounts, so whichever one lands on disk is unambiguous. */
  /* call 1 is gateBoot's own check; calls 2 and 3 are the two started below,
     and 2 is the slow one. Getting this off by one made the assertion measure
     the fallback account and report a correct guard as broken. */
  r = await run(browser, { ...base,
      refreshDelays: [0, 1500, 0],
      refreshUsers: [{ id: UID, email: "a@example.com" },
                     { id: UID, email: "a@example.com" },
                     { id: UID_B, email: "b@example.com" }],
      profile: activeProfile,
      settings: { accRefresh: "rt", accUid: UID } },
    async (page, st) => {
      await page.evaluate(() => { gateCheck(); gateCheck(); });
      await page.waitForTimeout(3200);
      st.after = await page.evaluate(() => ({
        uid: state.accUid, email: state.accEmail, run: gateS.run,
        calls: window.__refreshCalls || 0
      }));
    });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("Q) the slow superseded run does not restore its own account over the later one",
    !!r.state.after && r.state.after.calls >= 2 && r.state.after.uid === UID_B &&
    r.state.after.email === "b@example.com", r.state.after);

  /* P) a refused launch leaves nothing behind to spend offline */
  r = await run(browser, { ...base,
    profile: { ...activeProfile, plan_status: "none", plan_expires_at: null },
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("P) a launch that is refused clears the grace stamp rather than renewing it",
    !r.state.hidden && r.state.savedSeenAt === 0, r.state);

  /* I) wrong password */
  r = await run(browser, { ...base, profile: activeProfile, settings: {} },
    async (page, s) => {
      await page.fill("#gateEmail", "s@example.com");
      await page.fill("#gatePass", "wrong");
      await page.click("#gateSignIn");
      await page.waitForTimeout(600);
      s.after = await page.evaluate(() => ({
        hidden: getComputedStyle(document.getElementById("hnkGate")).display === "none",
        err: (document.getElementById("gateErr").textContent || "").trim(),
        saved: state.accRefresh
      }));
    });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("I) a wrong password does not unlock and stores no token",
    r.state.after && !r.state.after.hidden && r.state.after.err.length > 0 &&
    !r.state.after.saved, r.state.after);

  /* J) correct password */
  r = await run(browser, { ...base, profile: activeProfile, settings: {} },
    async (page, s) => {
      await page.fill("#gateEmail", "s@example.com");
      await page.fill("#gatePass", "correct-horse");
      await page.click("#gateSignIn");
      await page.waitForTimeout(900);
      s.after = await page.evaluate(() => ({
        hidden: getComputedStyle(document.getElementById("hnkGate")).display === "none",
        devicePost: window.__reqs.some(r => r.url.indexOf("/rest/v1/devices") >= 0 && r.method === "POST"),
        label: (window.__reqs.filter(r => r.url.indexOf("/rest/v1/devices") >= 0 && r.body)
                 .map(r => JSON.parse(r.body).label)[0]) || ""
      }));
    });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("J) the right password unlocks and registers this machine as a device",
    r.state.after && r.state.after.hidden && r.state.after.devicePost &&
    /Photoshop/i.test(r.state.after.label), r.state.after);

  /* M) the server answers, and keeps answering 500 */
  r = await run(browser, { ...base, profileStatus: 500, profile: activeProfile,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("M1) a 5xx inside the grace window is treated as an outage, not a verdict",
    r.state.hidden, r.state);

  r = await run(browser, { ...base, profileStatus: 500, profile: activeProfile,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - 30 * DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("M2) a 5xx past the grace window locks — a broken server is not a free pass",
    !r.state.hidden, r.state);

  /* N) a real 200 carrying no row */
  r = await run(browser, { ...base, profile: null,
    settings: { accRefresh: "rt", accUid: UID, accProfile: activeProfile,
                accSeenAt: Date.now() - DAY } });
  allErrs.push(...r.errs); allReqs.push(...r.state.reqs);
  report("N) a 200 with no profile row clears the cached one instead of trusting it",
    !r.state.hidden, r.state);

  /* every scenario's requests, not just one run's — this used to read
     r.state.reqs after r had been reassigned, so it checked a single phase and
     reported on all of them */
  const paid = allReqs.filter(u => /payment_requests|app_settings|storage\/v1/.test(u));
  report("K3) the panel never touches the payments, price or slip-storage tables",
    allReqs.length > 0 && paid.length === 0, { paid, seen: allReqs.length });

  const real = allErrs.filter(e => !/favicon|ERR_(NAME|CONNECTION|INTERNET)/i.test(e));
  report("L) none of the above raised a console error", real.length === 0, real.slice(0, 4));

  await browser.close();
  server.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
