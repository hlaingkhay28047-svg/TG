/* v6.52.0 — the panel's Gallery and VidUp ARE the web app's pages.
 *
 * WHY THIS FILE EXISTS. The owner's requirement is one studio everywhere:
 * "webapp လို အတိအကျ ui ux pages function features ကွက်တိ" — nothing extra,
 * nothing missing, nothing out of place. The Retouch pages are held to that
 * by verify_panel_studio_sync.js, which compares every visible string of the
 * panel against the live app. These two pages are hand-built rather than
 * sliced out of the app, so they are exactly the ones that drift: a label
 * rewritten on the web is invisible here until a student reads the panel in
 * Burmese and finds English.
 *
 * So both surfaces are opened in a browser, at the same width, in the same
 * state, and their visible strings are compared in DOM order. The panel's
 * list must be the app's list — with the panel-only lines named, one by one,
 * below. Each is a control Photoshop needs and a browser does not; a
 * difference that is NOT in that list fails this test.
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
  gallery: []
};
/* Strings the APP shows that the panel draws instead of writing: the app's
   size tile is an inline <svg> with the letters HD inside it, which counts as
   text here; the panel's tile is the same picture as a file, so it carries no
   text node. Nothing a student sees differs. */
const APP_ONLY = { vidup: ["HD"], gallery: [] };
/* The panel keeps its results as files, so its counter names the panel's own
   cap where the app names the browser's 60. */
const REWRITE = [
  [/(· \d+ )\/ 60$/, "$1/ 200"]
];

const PAGES = [
  { key: "gallery", panelKey: "gallery", appKey: "pgGallery", panelRoot: "#pageGallery", appRoot: "#pgGallery", label: "Gallery" },
  { key: "vidup", panelKey: "vidup", appKey: "pgVideoUp", panelRoot: "#pageVideoUp", appRoot: "#pgVideoUp", label: "VidUp" }
];

const COLLECT = `(function(sel){
  var root = document.querySelector(sel);
  if (!root) return ["NO ROOT " + sel];
  root.querySelectorAll(".grp").forEach(function (g) { if (g.className.indexOf("open") < 0) g.className += " open"; });
  var out = [];
  (function walk(e) {
    var cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return;
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
const UXP_STUB = `(function(){
  var settings = JSON.stringify({ rhKey: "TEST_RH_KEY" });
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
  window.fetch = function(url, init){
    url = String(url);
    if (url.indexOf("127.0.0.1") >= 0) return realFetch(url, init);
    return Promise.resolve(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
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
    : "\nAll checks passed — Gallery and VidUp are the web app's pages.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
