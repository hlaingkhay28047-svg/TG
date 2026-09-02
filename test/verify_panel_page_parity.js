/* v6.55.0 — EVERY page of the panel IS the web app's page.
 *
 * WHY THIS FILE EXISTS. The owner's requirement is one studio everywhere:
 * "webapp လို အတိအကျ ui ux pages function features ကွက်တိ" — nothing extra,
 * nothing missing, nothing out of place. The three Retouch pages are held to
 * that by verify_panel_studio_sync.js, which compares every visible string of
 * the panel against the live app. The ten pages here are hand-built rather
 * than sliced out of the app, so they are exactly the ones that drift: a
 * label rewritten on the web is invisible here until a student reads the
 * panel in Burmese and finds English.
 *
 * So both surfaces are opened in a browser, at the same width, IN THE SAME
 * STATE — signed in as the same Premium member, same key, same balance — and
 * their visible strings are compared in DOM order. The panel's list must be
 * the app's list, with the panel-only lines named one by one below. A
 * difference that is NOT in that list fails this test.
 *
 * With verify_panel_studio_sync.js this covers all thirteen pages the panel
 * has: Home, Setup, Workflows, Edit, Retouch A, Retouch B, Retouch Pro, Path,
 * Text to Image, Video, VidUp, Library and Gallery.
 *
 * Three things are normalised on BOTH sides rather than compared — the
 * greeting clock, measured storage sizes, and each surface's own version
 * number. Each is explained at REWRITE, and each is pinned elsewhere, so
 * nothing goes unchecked by being normalised here.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_panel_page_parity.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { APP_INIT, APP_PORT } = require("../tools/build_panel_studio_suites.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 500)));
  if (!ok) failures++;
}

/* THE PANEL-ONLY LINES, each with the reason it exists. A plugin writes its
   output to disk where a browser downloads it, so the studio has to be able
   to say where — that is the whole list. */
const PANEL_ONLY = {
  vidup: [
    "သိမ်းမယ့် folder ရွေးရန်",   /* Upscale: choose the save folder */
    "သိမ်းမယ့် folder ရွေးရန်"    /* Video Tools: the same, for its own run */
  ],
  gallery: [],
  create: [],
  /* Path's save-folder controls live in its SAVE card, which — like the app's
     own — stays hidden until there are photos in the album. With none loaded
     the page carries nothing the app does not. */
  path: [],
  home: [], wf: [], edit: [], lib: [], video: [],
  setup: []
};
/* Strings the APP shows that the panel draws instead of writing: the app's
   size tile is an inline <svg> with the letters HD inside it, which counts as
   text here; the panel's tile is the same picture as a file, so it carries no
   text node. Nothing a student sees differs. */
const APP_ONLY = {
  vidup: ["HD"], gallery: [], create: [], path: [],
  home: [], wf: [], lib: [],
  /* the app's Size tile is an inline <svg> with the letters HD drawn inside
     it, which counts as text here; the panel's tile is that same picture as a
     file, so it carries no text node. Nothing a student sees differs. */
  edit: ["HD"], video: ["HD"],
  /* The app's Setup offers the Photoshop panel as a download. The panel IS
     that download — a card inviting a student to install what they are
     already looking at is the one thing this page must not carry. */
  setup: [
    "Photoshop Panel",
    "Premium plan သက်တမ်းရှိကြောင်း စစ်ပြီးပါပြီ။ Photoshop 24.2+ အတွက် Panel ကို ဒီမှာရယူနိုင်ပါတယ်။",
    "Panel ccx v6.50.0 ရယူမယ်"
  ]
};
/* The panel keeps its results as files, so its counter names the panel's own
   cap where the app names the browser's 60. */
const REWRITE = [
  [/(· \d+ )\/ 60$/, "$1/ 200"],
  /* THE THREE THINGS THAT CANNOT BE EQUAL, normalised on BOTH sides so a real
     difference still fails.
     1. the greeting's clock. The two surfaces are read seconds apart, so the
        minute can roll over between them; the DATE is compared, the minute is
        not — a clock that stopped would fail check I of the landing counts,
        not this one. */
  [/·\s*\d{1,2}:\d{2}\s*(AM|PM)\s*·/, "· TIME ·"],
  /* 2. measured storage. A browser reports its own quota and a plugin reports
        its data folder; the units are the same sentence, the numbers are the
        machine's. Both sides lose the number, so a missing FIELD still fails. */
  [/\d+(\.\d+)?\s*(KB|MB|GB)/g, "SIZE"],
  /* and the noun that sentence uses for its own host — a plugin has no
     browser storage, and saying "browser" inside Photoshop would be wrong. */
  [/(browser|plugin) (သိုလှောင်မှု)/, "HOST $2"],
  /* 3. the version each surface names is its OWN: the app's Setup names the
        web app, the panel's names the panel. Both are pinned hard elsewhere —
        verify_unified_routes.js and verify_release_contract.js fail on a stale
        one — so here only the SHAPE has to match. */
  [/^v\d+\.\d+\.\d+$/, "vX.Y.Z"]
];

const PAGES = [
  { key: "gallery", panelKey: "gallery", appKey: "pgGallery", panelRoot: "#pageGallery", appRoot: "#pgGallery", label: "Gallery" },
  { key: "vidup", panelKey: "vidup", appKey: "pgVideoUp", panelRoot: "#pageVideoUp", appRoot: "#pgVideoUp", label: "VidUp" },
  { key: "create", panelKey: "create", appKey: "pgText2Img", panelRoot: "#pageCreate", appRoot: "#pgText2Img", label: "Text to Image" },
  { key: "path", panelKey: "path", appKey: "pgPath", panelRoot: "#pagePath", appRoot: "#pgPath", label: "Path" },
  /* v6.55.0 — the six pages built in the 6.51.0 wave and matched by hand.
     Home and Workflows share ONE panel page (the app's #pgDash and #pgWf), so
     each is opened by its own key and read from the same root; Setup is the
     app's #pgHome, which is where the web app keeps its own settings. */
  { key: "home", panelKey: "aitools", appKey: "pgDash", panelRoot: "#pageAiTools", appRoot: "#pgDash", label: "Home" },
  { key: "wf", panelKey: "wf", appKey: "pgWf", panelRoot: "#pageAiTools", appRoot: "#pgWf", label: "Workflows" },
  { key: "edit", panelKey: "prompt", appKey: "pgCreate", panelRoot: "#pagePrompt", appRoot: "#pgCreate", label: "Edit" },
  { key: "lib", panelKey: "presets", appKey: "pgLib", panelRoot: "#pagePresets", appRoot: "#pgLib", label: "Library" },
  { key: "video", panelKey: "video", appKey: "pgVideo", panelRoot: "#pageVideo", appRoot: "#pgVideo", label: "Video" },
  { key: "setup", panelKey: "setup", appKey: "pgHome", panelRoot: "#pageSetup", appRoot: "#pgHome", label: "Setup" }
];

const COLLECT = `(function(sel){
  var root = document.querySelector(sel);
  if (!root) return ["NO ROOT " + sel];
  root.querySelectorAll(".grp").forEach(function (g) { if (g.className.indexOf("open") < 0) g.className += " open"; });
  var out = [];
  (function walk(e) {
    var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    /* A button label that wraps is ONE label. The app lets inline flow wrap it
       and the text stays a single node; UXP centres a flex row, so main.js
       (fitBtnIn) splits the label into .icn-l1 + .icn-rest to put the icon on
       line one. Reading those as two strings would report a difference the
       student never sees, so the wrapper is read whole. */
    if (typeof e.__txt === "string") {
      /* THE LABEL, not its line boxes. The app lets inline flow wrap a button
         label and the text stays one node; UXP centres a flex row, so main.js
         (setIcnText/fitBtnIn) splits the label across .icn-l1 + .icn-rest to
         keep the icon on line one — and it splits wherever the line broke,
         which in Burmese is mid-word, with no space to rejoin on. main.js
         keeps the original label on the element as __txt, so that is what is
         read: the string the student sees, however it happened to wrap. */
      var whole = String(e.__txt).replace(/\\s+/g, " ").trim();
      if (whole) out.push(whole);
      return;
    }
    var own = "";
    e.childNodes.forEach(function (n) { if (n.nodeType === 3) own += n.textContent; });
    own = own.replace(/\\s+/g, " ").trim();
    if (own) out.push(own);
    Array.prototype.forEach.call(e.children, walk);
  })(root);
  return out;
})`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/* the UXP host the panel boots against, in the same signed-in, key-configured
   state the app is read in */
/* THE UXP HOST THE PANEL BOOTS AGAINST — and, just as importantly, the STATE
   it boots into. The web app is read through APP_INIT (tools/build_panel_studio_suites.js)
   as a signed-in Premium member called "Student Name" with a RunningHub key
   and a balance reading. A panel read signed-out would differ from it on
   every page that greets the member or names the plan, and those differences
   would be the harness's, not the product's. So this stub puts the panel in
   the SAME state: the same account on disk, the same profile row, the same
   entitlement, the same balance. Then a difference means a difference. */
const UXP_STUB = `(function(){
  var UID = "77777777-8888-4999-aaaa-bbbbbbbbbbbb";
  var EXP = new Date(Date.now() + 30*86400000).toISOString();
  var PROF = { id: UID, name: "Student Name", email: "student@example.com",
               created_at: "2026-01-15T10:00:00Z", plan_status: "active",
               plan_expires_at: EXP, allowed_devices: 2, is_admin: false, avatar: null };
  var settings = JSON.stringify({
    rhKey: "TEST_RH_KEY", lang: "my",
    accRefresh: "r", accUid: UID, accEmail: "student@example.com",
    accDevId: "11111111-2222-4333-8444-555555555555",
    accProfile: { account: { status: "active" }, license: { active: true, status: "active", expires_at: EXP } },
    accSeenAt: Date.now(),
    /* the app's money strip appears once a balance has been read; the panel's
       does the same, so the stub carries one reading for both */
    /* the queue reading rides along, as the live RunningHub answer carries it:
       the app's money line names running/queued/limit and the panel's does
       too, so the seeded reading has to carry the same shape */
    rhBal: { ts: Date.now(), cur: "USD", bal: 0, queue: { running: 0, queued: 0, limit: 0 } }
  });
  var file = { read: function(){ return Promise.resolve(settings); },
               write: function(t){ settings = t; return Promise.resolve(); } };
  var folder = { getEntry: function(){ return Promise.resolve(file); },
                 createFile: function(){ return Promise.resolve(file); },
                 getEntries: function(){ return Promise.resolve([]); } };
  var uxp = { storage: { localFileSystem: { getDataFolder: function(){ return Promise.resolve(folder); } }, formats: { utf8: "utf8", binary: "binary" } },
              shell: { openExternal: function(){ return Promise.resolve(); }, openPath: function(){ return Promise.resolve(); } },
              entrypoints: { setup: function(){} } };
  var ps = { app: { documents: [] }, core: { executeAsModal: function(){} }, imaging: {},
             action: { batchPlay: function(){ return Promise.resolve([]); } }, constants: {} };
  window.require = function(n){ return n === "photoshop" ? ps : n === "uxp" ? uxp : n === "os" ? { platform: function(){ return "test"; } } : {}; };
  var realFetch = window.fetch.bind(window);
  function json(b, s){ return Promise.resolve(new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json" } })); }
  window.fetch = function(url, init){
    url = String(url);
    if (url.indexOf("127.0.0.1") >= 0) return realFetch(url, init);
    /* the same answers APP_INIT gives the web app, in the panel's own shapes */
    if (url.indexOf("/auth/v1/token") >= 0)
      return json({ access_token: "a", refresh_token: "r", expires_in: 7200, user: { id: UID, email: PROF.email } });
    if (url.indexOf("/v1/devices/enroll") >= 0) return json({ ok: true });
    if (url.indexOf("/v1/panel/validate") >= 0)
      return json({ ok: true, lease_token: "L", lease_expires_at: new Date(Date.now() + 3600000).toISOString(),
        entitlement: { account: { status: "active" }, license: { active: true, status: "active", expires_at: EXP },
          permissions: { panel: true, photoshop_panel: true, ccx_download: true, web_app: true } } });
    if (url.indexOf("/rest/v1/profiles") >= 0) return json([PROF]);
    if (url.indexOf("/rest/v1/devices") >= 0) return json([]);
    if (url.indexOf("runninghub.ai") >= 0) return json({ code: 0, data: {} });
    return json({});
  };
})();`;

function routeAll(page, chromiumPixel) {
  return page.route("**/*", route => {
    const u = route.request().url();
    if (u.indexOf("127.0.0.1") >= 0) return route.continue();
    if (route.request().resourceType() === "image")
      return route.fulfill({ status: 200, contentType: "image/gif", body: chromiumPixel });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

/* the panel-only lines are removed once each, in order, so an accidental
   SECOND copy of one still fails */
function dropOnce(list, drop) {
  const out = list.slice();
  drop.forEach(function (d) {
    const i = out.indexOf(d);
    if (i >= 0) out.splice(i, 1);
  });
  return out;
}
function rewrite(list) {
  return list.map(function (s) {
    let v = s;
    REWRITE.forEach(function (r) { v = v.replace(r[0], r[1]); });
    return v;
  });
}

(async () => {
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const panel = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    panel.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await routeAll(panel, PIXEL);
    await panel.addInitScript(UXP_STUB);
    await panel.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await panel.waitForTimeout(2000);
    /* WAIT FOR THE STATE, NOT A CLOCK. The panel's Home greets the member by
       name and shows the spend strip, and both arrive over the network — the
       profile row and the balance reading. Read too early and Home greets from
       the email local-part with no money card, which is a race in this test
       and not a difference in the product. Waiting on the settled values makes
       the read deterministic, and a profile that never lands fails here with a
       message that says so rather than as a mystery string mismatch. */
    await panel.waitForFunction(() => {
      try {
        const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash();
        return !!(d && d.name === "Student Name" && d.planLine && d.money);
      } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => {
      throw new Error("the panel never reached the signed-in state the app is read in " +
        "(profile row / plan line / balance reading) — check the UXP_STUB fetch answers");
    });

    const app = await browser.newPage({ viewport: { width: 420, height: 760 } });
    app.on("pageerror", e => errs.push("app: " + String(e).slice(0, 160)));
    await routeAll(app, PIXEL);
    await app.addInitScript(APP_INIT);
    await app.goto(`http://127.0.0.1:${APP_PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await app.waitForTimeout(2200);
    await app.evaluate(() => {
      try { document.body.classList.remove("wall"); } catch (e) { }
      try { var s = document.getElementById("splash"); if (s) s.remove(); } catch (e) { }
      window.scrollTo = function () { }; Element.prototype.scrollIntoView = function () { };
    });

    for (const p of PAGES) {
      await panel.evaluate(k => { try { switchPage(k); } catch (e) { } }, p.panelKey);
      await panel.waitForTimeout(900);
      /* UXP has no position:sticky, so main.js LIFTS a GENERATE button out of
         its card into #genDock while its natural spot is below the fold — the
         app gets the same effect from the CSS and never moves the node. The
         button is put back before reading, so the page is compared with its
         own controls in it rather than with a hole where the renderer's
         workaround carried one away. */
      await panel.evaluate(() => {
        try {
          ["btnGenerate", "btnStGen", "btnPtRun", "btnV2Start", "btnRsGen"].forEach(function (id) {
            var b = document.getElementById(id);
            if (b && typeof stickyGenUndock === "function") stickyGenUndock(b);
          });
        } catch (e) { }
      });
      await panel.waitForTimeout(120);
      const b = await panel.evaluate(`${COLLECT}(${JSON.stringify(p.panelRoot)})`, null);
      await app.evaluate(k => { try { switchPage(k); } catch (e) { } }, p.appKey);
      await app.waitForTimeout(1000);
      const a = await app.evaluate(`${COLLECT}(${JSON.stringify(p.appRoot)})`, null);

      const want = rewrite(dropOnce(a, APP_ONLY[p.key] || []));
      const got = rewrite(dropOnce(b, PANEL_ONLY[p.key] || []));
      let i = 0;
      while (i < want.length && i < got.length && want[i] === got[i]) i++;
      report(`${p.label} shows the web app's strings, all ${want.length} of them, in order`,
        want.length === got.length && i === want.length,
        want.length !== got.length
          ? `app ${want.length} strings, panel ${got.length}; first difference at ${i}: app "${String(want[i]).slice(0, 70)}" vs panel "${String(got[i]).slice(0, 70)}"`
          : `first difference at ${i}: app "${String(want[i]).slice(0, 70)}" vs panel "${String(got[i]).slice(0, 70)}"`);
    }
    report("neither page raises an error while it builds", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
  console.log(failures
    ? `\n${failures} FAILURE(S) — the panel page and the web app page have parted; fix the panel, or name the new panel-only line in PANEL_ONLY with its reason.`
    : "\nAll checks passed — these panel pages are the web app's pages.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
