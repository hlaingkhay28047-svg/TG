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
/* the panel host, its signed-in state and the string walker — shared with
   verify_panel_studio_sync.js so both read the panel the same way */
const { UXP_STUB, COLLECT, COLLECT_STATE, stateDiff } = require("./lib/panel-parity-harness.js");

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
  /* v6.2.0 — Video Tools moved to its own page, so VidUp is Upscale alone and
     carries ONE save-folder control; the other went with it. */
  vidup: [
    "သိမ်းမယ့် folder ရွေးရန်"    /* Upscale: choose the save folder */
  ],
  v2v: [
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
  vidup: ["HD"], v2v: [], gallery: [], create: [], path: [],
  home: [], wf: [], lib: [],
  /* the app's Size tile is an inline <svg> with the letters HD drawn inside
     it, which counts as text here; the panel's tile is that same picture as a
     file, so it carries no text node. Nothing a student sees differs. */
  edit: ["HD"], video: ["HD"],
  /* The app's Setup offers the Photoshop panel as a download. The panel IS
     that download — a card inviting a student to install what they are
     already looking at is the one thing this page must not carry. */
  setup: [
    /* v5.85.0 — the launch chime and its switch. The chime belongs to the
       INSTALLED WEB APP's splash: a Photoshop plugin has no launch screen to
       sound over, it opens inside an application the studio already has open,
       and Adobe's own UI owns any sound at that moment. Offering the switch in
       the panel would be offering a setting that could never do anything. */
    "\u1016\u103d\u1004\u1037\u103a\u1010\u1032\u1037\u1021\u1001\u102b \u1021\u101e\u1036",
    "\u1015\u102d\u1010\u103a\u1011\u102c\u1038",
    "Default \u1015\u102d\u1010\u103a\u1011\u102c\u1038\u1015\u102b\u1010\u101a\u103a\u104b \u1016\u103d\u1004\u1037\u103a\u1011\u102c\u1038\u101b\u1004\u103a install \u101c\u102f\u1015\u103a\u1011\u102c\u1038\u1010\u1032\u1037 app \u1000\u102d\u102f \u1016\u103d\u1004\u1037\u103a\u1010\u102d\u102f\u1004\u103a\u1038 \u1010\u1005\u103a\u1001\u102b \u1019\u103c\u100a\u103a\u1015\u102b\u1019\u101a\u103a \u2014 \u1016\u102f\u1014\u103a\u1038\u1000 \u1021\u101e\u1036\u1015\u102d\u1010\u103a\u1011\u102c\u1038\u101b\u1004\u103a (\u101e\u102d\u102f\u1037) browser \u1000 \u1001\u103d\u1004\u1037\u103a\u1019\u1015\u103c\u102f\u101b\u1004\u103a \u1019\u1019\u103c\u100a\u103a\u1015\u102b\u104b",
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
  /* v6.2.0 — the new Video → Video page: the smart cards and all thirty-one
     video-in tools, on both surfaces. */
  { key: "v2v", panelKey: "v2v", appKey: "pgV2V", panelRoot: "#pageV2V", appRoot: "#pgV2V", label: "Video to Video" },
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

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/* the UXP host the panel boots against, in the same signed-in, key-configured
   state the app is read in */
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

      /* v6.56.0 — and the STATE, which the string list cannot see: the
         placeholders (an attribute, never a text node) and which chip is
         actually chosen. Same page, same moment, both surfaces. */
      const bState = await panel.evaluate(`${COLLECT_STATE}(${JSON.stringify(p.panelRoot)})`, null);
      const aState = await app.evaluate(`${COLLECT_STATE}(${JSON.stringify(p.appRoot)})`, null);
      const sd = stateDiff(aState, bState);
      report(`${p.label} opens on the web app's own choices — ${aState.ph.length} placeholder(s), ${aState.sel.length} selection(s)`,
        sd.length === 0, sd.slice(0, 4).join(" | "));

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
