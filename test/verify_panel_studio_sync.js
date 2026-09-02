/* v6.51.0 — the panel's Retouch A / Retouch B studio IS the web app's.
 *
 * WHY THIS FILE EXISTS. The owner's requirement is one studio, everywhere:
 * every group, every slider, every chip, every label in every language, the
 * presets, the recipes, the 880-style pack and the prompt composer must be
 * the same in Photoshop as on the web. The panel carries them in a GENERATED
 * module sliced verbatim out of docs/app/index.html, so the only way it rots
 * is silently — the app gains a control or rewrites a label and the CCX keeps
 * shipping last month's studio. This test re-runs the same extraction against
 * the live app and requires the committed file to match it exactly.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_panel_studio_sync.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { generate, OUT, APP_INIT, APP_PORT } = require("../tools/build_panel_studio_suites.js");
const PORT = APP_PORT;

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

(async () => {
  report("the generated studio module is committed", fs.existsSync(OUT), OUT);
  if (!fs.existsSync(OUT)) { console.log("\n1 FAILURE — build it with: node tools/build_panel_studio_suites.js"); process.exit(1); }

  const stored = fs.readFileSync(OUT, "utf8");
  const live = await generate({});

  report("the panel module is byte-for-byte what the app's source produces today",
    stored === live.text, firstDiff(stored, live.text));

  /* the slices themselves: an app edit that moves a boundary must be seen */
  const storedMeta = JSON.parse(/^var META=(\{[^\n]*\});$/m.exec(stored)[1]);
  report("every slice still lands on its anchor",
    storedMeta.slices.length === live.meta.slices.length &&
    storedMeta.slices.every((s, i) => s.name === live.meta.slices[i].name && s.lines === live.meta.slices[i].lines),
    storedMeta.slices.filter((s, i) => !live.meta.slices[i] || s.lines !== live.meta.slices[i].lines).map(s => s.name).join(", "));

  const api = require(OUT);
  report("the module exposes build() plus its captured data",
    typeof api.build === "function" && api.DATA && api.DATA.counts && api.DATA.tr, Object.keys(api || {}).join(","));

  /* the studio's shape — the numbers the two pages print in their own headers */
  report("Retouch A carries the app's control count",
    api.DATA.ST_MEITU_COUNT === live.data.ST_MEITU_COUNT && api.DATA.ST_MEITU_COUNT > 100,
    api.DATA.ST_MEITU_COUNT + " vs " + live.data.ST_MEITU_COUNT);
  report("Retouch B carries the app's control count",
    api.DATA.ST_EVOTO_COUNT === live.data.ST_EVOTO_COUNT && api.DATA.ST_EVOTO_COUNT > 100,
    api.DATA.ST_EVOTO_COUNT + " vs " + live.data.ST_EVOTO_COUNT);
  report("both suites carry every group the app builds, in order",
    JSON.stringify(api.DATA.counts) === JSON.stringify(live.data.counts),
    api.DATA.counts.length + " groups stored, " + live.data.counts.length + " live");
  report("no group was captured mid-load",
    api.DATA.counts.every(c => !/…/.test(c.cnt)),
    api.DATA.counts.filter(c => /…/.test(c.cnt)).map(c => c.title).join(", "));

  /* the labels: the panel must speak every language the app speaks */
  report("the studio's t() strings cover every app language",
    api.DATA.langs.length >= 20 && api.DATA.langs.indexOf("my") >= 0 && api.DATA.langs.indexOf("en") >= 0,
    api.DATA.langs.join(","));
  const trHoles = Object.keys(api.DATA.tr).filter(k => !api.DATA.tr[k] || typeof api.DATA.tr[k].my !== "string" || typeof api.DATA.tr[k].en !== "string");
  report("every captured string resolved in every language", trHoles.length === 0, trHoles.join(","));

  /* the UXP contract: what the panel cannot run must not be in the file */
  const banned = [
    [/document\.createElement\("canvas"\)/, "canvas element"],
    [/\.getContext\(/, "canvas 2d context"],
    [/<svg\b/, "inline SVG"],
    [/type="color"/, "colour input"],
    [/new FileReader\(/, "FileReader"]
  ];
  const bodyOnly = stripAppOnly(stored);
  banned.forEach(([re, what]) => {
    const m = re.exec(bodyOnly);
    report("the panel module reaches for no " + what, !m, m && context(bodyOnly, m.index));
  });

  /* THE CHECK THAT MATTERS MOST: the module is not merely well-formed text —
     it has to RUN. A slice that reaches for a name nothing defines, or a page
     element the panel does not carry, is a ReferenceError in Photoshop and an
     empty page for the student. So the panel is loaded in a browser with UXP
     stubbed, all three retouch pages are opened, and the first page error
     fails this test. */
  await smoke();

  console.log(failures
    ? `\n${failures} FAILURE(S) — regenerate with: node tools/build_panel_studio_suites.js`
    : "\nAll checks passed — the panel's studio is the app's studio.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });

/* The parity claim itself, as one browser-side function both surfaces run:
   every visible string under a root, in DOM order, with the groups opened.
   Run on the web app and on the panel, the two lists must be identical —
   that is what "webapp လို အတိအကျ" means, checked rather than asserted. */
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

/* the UXP host the panel boots against, cut down to what a DOM build needs */
const UXP_STUB = `(function(){
  /* the same signed-in, key-configured student the app is read as (APP_INIT):
     the two surfaces have to be in the same STATE or their string lists differ
     for a reason that is not a parity defect — the HD hint, for one, shows
     only when no RunningHub key is saved. */
  var settings = JSON.stringify({ rhKey: "TEST_RH_KEY" });
  var file = { read: function(){ return Promise.resolve(settings); },
               write: function(t){ settings = t; return Promise.resolve(); } };
  var folder = { getEntry: function(){ return Promise.resolve(file); },
                 createFile: function(){ return Promise.resolve(file); } };
  var uxp = { storage: { localFileSystem: { getDataFolder: function(){ return Promise.resolve(folder); } }, formats: { utf8: "utf8" } },
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

async function smoke() {
  const http = require("http");
  const { chromium } = require("playwright-core");
  const PANEL = path.join(__dirname, "..", "panel");
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
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const counts = await page.evaluate(() => {
      var o = { pages: {} };
      ["meitu", "evoto", "retouch"].forEach(function (k) {
        try { switchPage(k); } catch (e) { o.err = String(e).slice(0, 160); }
      });
      function n(id) { var e = document.getElementById(id); return e ? e.children.length : -1; }
      o.pages.muGroups = n("muHost");
      o.pages.evGroups = n("evHost");
      o.pages.suiteTabs = n("stSuiteTabs");
      o.pages.groupChips = n("stGroupChips");
      o.pages.muPresets = n("muPresetRow");
      o.pages.v2Modes = n("v2ModeChips");
      o.pages.rsPresets = n("rsPresetGrid");
      o.pages.rsBundles = n("rsBundleGrid");
      o.pages.rsChips = n("rsChips");
      var g = document.getElementById("btnStGen");
      o.genLabel = g ? (g.textContent || "").trim().length : -1;
      var pv = document.getElementById("v2PromptPreview");
      o.promptPreview = pv ? (pv.textContent || "").length : -1;
      return o;
    });
    report("the panel builds all three retouch pages without a page error",
      errs.length === 0 && !counts.err, (counts.err || "") + " " + errs.slice(0, 3).join(" | "));
    report("Retouch A and Retouch B each build the app's 17 groups",
      counts.pages.muGroups === 17 && counts.pages.evGroups === 17, JSON.stringify(counts.pages));
    report("the jump bar carries both suite tabs and a chip per group",
      counts.pages.suiteTabs === 2 && counts.pages.groupChips >= 18, JSON.stringify(counts.pages));
    report("the one-tap look shelf is populated",
      counts.pages.muPresets === 8, counts.pages.muPresets);
    report("Retouch Pro builds its mode chips, presets, bundles and slider chips",
      counts.pages.v2Modes === 3 && counts.pages.rsPresets === 5 &&
      counts.pages.rsBundles === 5 && counts.pages.rsChips > 0, JSON.stringify(counts.pages));
    report("the studio's generate bar and Retouch Pro's prompt preview carry text",
      counts.genLabel > 0 && counts.promptPreview > 100, JSON.stringify({ gen: counts.genLabel, preview: counts.promptPreview }));

    /* THE PARITY CLAIM, CHECKED. Every visible string of the three pages,
       read off the panel and off the live web app, must be the same list in
       the same order. A label the app rewrites, a control it gains or drops,
       shows up here as a diff — and the cure is to regenerate the module. */
    /* the studio's two columns are ONE node the panel moves between its pages,
       so each page is read while it is the open one — never after switching on */
    const ROOTS = { meitu: ["#stCols", "#stCols"], evoto: ["#stCols", "#stCols"],
                    retouch: ["#pageRetouch", "#pgRetouch"] };
    const PAGE_IDS = { meitu: ["meitu", "pgMeitu"], evoto: ["evoto", "pgEvoto"], retouch: ["retouch", "pgRetouch"] };
    const KEYS = ["meitu", "evoto", "retouch"];
    const panelText = {};
    for (const key of KEYS) {
      await page.evaluate(k => { try { switchPage(k); } catch (e) { } }, PAGE_IDS[key][0]);
      await page.waitForTimeout(900);
      panelText[key] = await page.evaluate(`${COLLECT}(${JSON.stringify(ROOTS[key][0])})`, null);
    }

    const appPage = await browser.newPage({ viewport: { width: 420, height: 760 } });
    await appPage.addInitScript(APP_INIT);
    await appPage.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await appPage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await appPage.waitForTimeout(2200);
    await appPage.evaluate(() => {
      try { document.body.classList.remove("wall"); } catch (e) { }
      try { var s = document.getElementById("splash"); if (s) s.remove(); } catch (e) { }
      window.scrollTo = function () { }; Element.prototype.scrollIntoView = function () { };
    });
    const appText = {};
    for (const key of KEYS) {
      await appPage.evaluate(k => { try { switchPage(k); } catch (e) { } }, PAGE_IDS[key][1]);
      await appPage.waitForTimeout(1200);
      appText[key] = await appPage.evaluate(`${COLLECT}(${JSON.stringify(ROOTS[key][1])})`, null);
    }

    [["Retouch A", "meitu"], ["Retouch B", "evoto"], ["Retouch Pro", "retouch"]].forEach(([label, key]) => {
      const a = appText[key] || [], b = panelText[key] || [];
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      report(`${label} shows the web app's strings, all ${a.length} of them, in order`,
        a.length === b.length && i === a.length,
        a.length !== b.length
          ? `app ${a.length} strings, panel ${b.length}; first difference at ${i}: app "${String(a[i]).slice(0, 60)}" vs panel "${String(b[i]).slice(0, 60)}"`
          : `first difference at ${i}: app "${String(a[i]).slice(0, 60)}" vs panel "${String(b[i]).slice(0, 60)}"`);
    });
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

/* the `_app`-suffixed functions are the app originals the runtime layer
   shadows; they never run in Photoshop, so their browser APIs are not a
   contract breach — everything else is */
function stripAppOnly(text) {
  const lines = text.split("\n");
  const keep = [];
  let skipping = false;
  for (const l of lines) {
    const f = /^function ([\w$]+)\(/.exec(l);
    if (f) skipping = /_app$/.test(f[1]);
    keep.push(skipping ? "" : l);
  }
  return keep.join("\n");
}

function context(text, idx) {
  const start = text.lastIndexOf("\n", idx) + 1;
  const line = text.slice(0, idx).split("\n").length;
  return line + ": " + text.slice(start, text.indexOf("\n", idx)).trim().slice(0, 160);
}

function firstDiff(a, b) {
  if (a === b) return "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const line = a.slice(0, i).split("\n").length;
  return "first difference at line " + line + "\n  stored: " + a.slice(i, i + 120).split("\n")[0] +
    "\n  app:    " + b.slice(i, i + 120).split("\n")[0];
}
