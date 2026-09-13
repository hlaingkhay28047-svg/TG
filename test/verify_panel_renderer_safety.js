/* v6.38.0 / panel 6.107.0 — THE THREE THINGS A BROWSER COULD NOT SEE.

   THE DEFECT. The owner installed panel 6.106.0 in real Photoshop and
   photographed it: on the Workflows page "Subject / Face" and "AI Retouch"
   carried their pictures and every other card in the same grid was an empty
   box; the video model picker was empty; some labels had lost their text.
   Driven in a browser with UXP's require/uxp/photoshop stubbed, the SAME build
   walks all fourteen pages with zero page errors, 188 video models, 37 video
   tools, 194 workflows, 49 text-to-image models and every picker face painted.
   Nothing was wrong with the panel's logic or its data. The failures belonged
   to the renderer, and no browser test could ever have reproduced them.

   So this file does not try to reproduce them. It pins the three STRUCTURAL
   differences that separated what drew from what did not — each one a thing
   the panel can be checked for here, in a browser, forever:

   A) NO REMOTE <img src>. Every picture confirmed drawing in the owner's
      Photoshop is a local file or a data: URL. Every blank one is a remote
      https <img>. There is no counterexample in either direction, and the
      Library — which loads from the same remote host and DRAWS — is the one
      surface that fetches the bytes and paints a data: URL (since 6.47.1).
      Every remote picture now takes that path, so the panel asks this
      renderer for nothing it has ever failed to deliver.
      A remote <img> that fails is also silent: the owner's cards raised no
      error at all, which is why the im.onerror fallbacks written for exactly
      that case never ran. A fetch says what went wrong.

   B) NO <optgroup>. Of the panel's twenty <select>s, the video model picker
      was the only one whose <option>s all sat inside <optgroup> — 41 groups
      and ZERO direct option children — and it is the one picker the owner
      photographed empty. Chromium flattens a group when it reads .options; a
      renderer that reads only direct children reads nothing.

   C) THE LABEL SPLITTER IS GUARDED. fitBtnIn splits a wrapped button label on
      Range.getClientRects(). A renderer that answers with one box per glyph
      makes every label look wrapped and the cut lands after one character.

   D) THE PANEL REPORTS ON ITSELF, so the next round is measured rather than
      guessed: an error hook installed before anything else can throw, three
      renderer probes, the module counts, the picture tallies.

   J) NO <img> WITHOUT A src (v6.58.1). The owner's self-test on 6.127.0
      photographed eight load errors: "<img no src>" seven times and
      "<img #resultImg no src>" once. A browser treats an <img> with no src as
      inert — no request, no error — so nothing here could ever have caught it
      and nothing in the panel looked wrong. This renderer treats it as a
      picture it was asked for and could not fetch.
      Two shapes made them. The gallery creates a thumbnail, classes it,
      appends it, and only sets src when galThumb resolves — seven items,
      seven errors. And refreshCompare stripped #resultImg with
      removeAttribute("src") whenever there was no result yet. Both now set a
      1x1 transparent GIF instead, which always decodes and draws nothing.
      The rule is simple enough to check: no <img> in the markup ships without
      a src, and removeAttribute("src") appears nowhere in the panel.

      v6.58.2 — AND THE SEVEN CAME BACK, WHICH IS HOW THE FIX PROVED ITSELF.
      6.58.1 gave the reporter a tongue and the next card named them:
      "<img in .wfv no src> ×7". Not the gallery — the WORKFLOW CARDS. .wfv is
      vidWfCard's picture wrapper, and its <img> goes through pnlArt into
      remoteArt.paint, which fetches the bytes BEFORE it has a src to give.
      Six fetches run at a time across 194 cards, so several of those elements
      are always sitting in the document with nothing in them. paint() now
      fills the element first, before every return it has.

      That is the shape of this whole defect: not one bug but one RULE — an
      <img> must never be reachable without a src — broken in four places
      (static markup, a gallery await, a fetch await, and a src built out of
      state that can be absent). J1..J8 below are that rule, not those four.

   E) CI runs this test.

   v6.38.1 / panel 6.107.1 — THE SECOND PHOTOGRAPH. With 6.107.0 installed the
   owner photographed Media Lab ▸ Video: #vidWfIntro empty, the shelf empty,
   the three picker faces blank — while the self-test card two pages away read
   "Errors: none". Both true at once: the card heard only UNCAUGHT errors, and
   the panel's own safe() had caught the throw, logged it where no student
   looks, and moved on; and because bindDiag ran its five page binds as one
   unguarded sequence, one throw had unbound four pages. So:

   F) EVERY WIRING STAGE IS GUARDED AND RECORDED. bindDiag guards each page;
      bindSetup, bindSetupRefresh and bindVideo guard each stage; safe() writes
      "ok" or the message AND THE LINE into WIRED; and the card reports Wiring,
      the Video page as the DOM holds it, the labels that only JavaScript
      writes, and the panel's own log.

   G) AND THE LIKELIEST LINE IS NO LONGER LOAD-BEARING. `option.disabled` is
      written in exactly three places in the panel and all three belong to the
      video model picker — the family headers and the greyed down models. The
      two pickers the owner confirmed FULL on the same Photoshop (Text→Img,
      Freeform) never touch it, and the down-model line predates 6.106.0,
      where this picker was already empty. optOff attempts the property and
      depends on the attribute, so a renderer that refuses it costs the grey,
      not the list.

   Both are PROVEN BY FAULT INJECTION rather than by reading: one page where
   the option.disabled setter throws (G — the picker must fill anyway), and
   one where an arbitrary write inside the same stage throws (H — the picker
   cannot survive, and everything else must).
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP_DIR = path.join(ROOT, "docs", "app");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };
const ASSET_HOST = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const INDEX = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
const WFSCREEN = fs.readFileSync(path.join(PANEL, "src/ui/screens/workflow-tools-screen.js"), "utf8");
const HOMESCREEN = fs.readFileSync(path.join(PANEL, "src/ui/screens/home-screen.js"), "utf8");

/* ---------------------------------------------------------------- source */

report("A1) the remote-art loader ships and publishes on the panel's own global",
  fs.existsSync(path.join(PANEL, "src/ui/remote-art.js")) &&
  /globalThis\.HNK\.remoteArt = API/.test(fs.readFileSync(path.join(PANEL, "src/ui/remote-art.js"), "utf8")),
  "panel/src/ui/remote-art.js");

report("A2) index.html loads it, and loads it before the screens that paint with it",
  INDEX.indexOf('src="src/ui/remote-art.js"') > 0 &&
  INDEX.indexOf('src="src/ui/remote-art.js"') < INDEX.indexOf('src="src/ui/screens/home-screen.js"') &&
  INDEX.indexOf('src="src/ui/remote-art.js"') < INDEX.indexOf('src="main.js"'),
  "order in panel/index.html");

/* The three places main.js pointed at the licensed host, and the two screens.
   Each must go through the loader; a bare `im.src = <remote base> + …` coming
   back is the whole defect coming back. */
report("A3) main.js paints its video-shelf art through the loader, never straight onto <img>",
  /function pnlArt\(im, url, onFail\)/.test(MAIN) &&
  (MAIN.match(/pnlArt\(im, vidArtSrc\(w\)/g) || []).length === 3 &&
  !/im\.src = VID_ART_BASE/.test(MAIN),
  "pnlArt sites: " + (MAIN.match(/pnlArt\(im, vidArtSrc\(w\)/g) || []).length);

report("A4) the Workflows screen paints its 194 catalog cards through the loader",
  /function setArt\(im, url, onFail\)/.test(WFSCREEN) &&
  /setArt\(im, visual, function \(\)/.test(WFSCREEN) &&          /* the hero art card */
  (WFSCREEN.match(/setArt\(im, wf\.visual, function \(\)/g) || []).length === 2 &&  /* the grid card AND the favourites chip */
  !/im\.src = wf\.visual/.test(WFSCREEN) && !/im\.src = visual/.test(WFSCREEN),
  "setArt occurrences (1 definition + 2 call sites): " + (WFSCREEN.match(/setArt\(im, /g) || []).length);

report("A5) the Home screen paints its Library teaser strip through the loader",
  /HNK && globalThis\.HNK\.remoteArt/.test(HOMESCREEN) &&
  !/im2\.src = APP_ASSETS/.test(HOMESCREEN), null);

report("B1) the video model picker builds flat options with an unselectable family header, and creates no optgroup",
  /const head = mkOption\("", "— " \+ lab \+ " —"\);/.test(MAIN) &&
  /optOff\(head\);/.test(MAIN) &&
  !/createElement\("optgroup"\)/.test(MAIN),
  "vidFillModels");

report("B2) a disabled header is never left as the picker's value",
  /function vidFirstSelectable\(sel\)/.test(MAIN) &&
  /if \(!sel\.value\) \{ const first = vidFirstSelectable\(sel\); if \(first\) \{ try \{ sel\.value = first; \} catch \(e\) \{ \} \} \}/.test(MAIN),
  null);

report("B6) the picker never depends on option.disabled — the property is attempted, the attribute carries the meaning",
  /function optOff\(o\)/.test(MAIN) && /function optIsOff\(o\)/.test(MAIN) &&
  /try \{ o\.disabled = true; \} catch \(e\) \{ \}/.test(MAIN) &&
  /o\.setAttribute\("data-off", "1"\)/.test(MAIN) &&
  !/\bhead\.disabled = true;/.test(MAIN) &&
  !/\{ o\.disabled = true; const lab = vidDownLabel/.test(MAIN) &&
  !/if \(m\.down\) \{ o\.disabled = true;/.test(MAIN) &&
  /if \(!optIsOff\(opts\[i\]\) && opts\[i\]\.value\) return opts\[i\]\.value;/.test(MAIN),
  "optOff / optIsOff and the three former .disabled writes");

report("C1) the label splitter refuses a measurement that reads one box per glyph",
  /if \(lines > Math\.max\(3, txt\.length \/ 4\)\) return;/.test(MAIN), null);

report("D1) the self-test module loads FIRST, before every other script",
  INDEX.indexOf('src="src/app/panel-selftest.js"') > 0 &&
  INDEX.indexOf('src="src/app/panel-selftest.js"') < INDEX.indexOf('src="js/hnk_wf_catalog_data.js"'),
  "order in panel/index.html");

report("D2) it hooks errors, rejections and the silent resource-load failure",
  (() => {
    const ST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
    return /addEventListener\("error"/.test(ST) &&
      /addEventListener\("unhandledrejection"/.test(ST) &&
      /t\.tagName/.test(ST) &&
      /caps\.optgroup = /.test(ST) && /caps\.rangeLineBoxes = /.test(ST) && /caps\.svgImg = /.test(ST);
  })(), "panel/src/app/panel-selftest.js");

report("D3) Setup carries the card, and the parity walk is told it is panel-only",
  /id="cardSelfTest" data-panel-only="self-test"/.test(INDEX) &&
  /function renderSelfTest\(\)/.test(MAIN) &&
  /renderRows\("selfTestRows", selfTestRows\(\)\)/.test(MAIN), null);

/* F) the guards, in the source */
report("F1) bindDiag binds its five pages one guard each — a throw in Setup can no longer unbind Video, Gallery and Talk",
  /function bindDiag\(\) \{[\s\S]*?safe\("setup", bindSetup\);\s*safe\("path", bindPath\);\s*safe\("video", bindVideo\);\s*safe\("gallery", bindGallery\);\s*safe\("talk", bindTalk\);\s*\}/.test(MAIN),
  "bindDiag");
report("F2) bindVideo wires in guarded stages, so the labels, the shelf and the faces each paint whatever threw before them",
  ["video:models", "video:buttons", "video:labels", "video:shelf", "vidup:models", "v2v:models", "video:paint", "vidup:paint", "v2v:paint"]
    .every(n => MAIN.indexOf('safe("' + n + '"') > 0) &&
  /safe\("video:labels", vidPaintLabels\);\s*safe\("video:shelf", renderVidWf\);/.test(MAIN),
  "stage names in bindVideo");
report("F3) bindSetup and its repaint are staged the same way",
  ["setup:account", "setup:runninghub", "setup:money", "setup:about-wire", "setup:statics", "setup:readiness", "setup:rh-models"]
    .every(n => MAIN.indexOf('safe("' + n + '"') > 0), "stage names in bindSetup / bindSetupRefresh");
report("F4) safe() records every stage — ok, or the message and the line — and the log carries the line too",
  /const WIRED = \{\};/.test(MAIN) &&
  /try \{ fn\(\); if \(!WIRED\[name\]\) WIRED\[name\] = "ok"; \}/.test(MAIN) &&
  /WIRED\[name\] = \(\(e && e\.message\) \|\| String\(e\)\) \+ errWhere\(e\);/.test(MAIN) &&
  /function errWhere\(e\)/.test(MAIN) &&
  /if \(a instanceof Error\) return \(a\.message \|\| String\(a\)\) \+ errWhere\(a\);/.test(MAIN),
  "safe / errWhere / pushLog");
report("F5) the card reads WIRED, the Video page's DOM, the JavaScript-only labels and the panel's log",
  /label: "Wiring", detail: \(wnames\.length - wfail\.length\) \+ " ok · " \+ wfail\.length \+ " failed"/.test(MAIN) &&
  /label: "Video page", detail: vOpts \+ " opt · face "/.test(MAIN) &&
  /label: "Labels", detail: blank\.length \? blank\.join\(", "\)/.test(MAIN) &&
  /label: "Panel log", detail: bad\.length \? bad\.length \+ " · " \+ HNK_LOG\.length/.test(MAIN),
  "selfTestRowsInner");

/* the self-test card's rows, as the DOM holds them */
const READ_CARD = () => {
  const box = document.getElementById("selfTestRows");
  if (!box) return null;
  const rows = [];
  box.querySelectorAll(".diagrow").forEach(function (r) {
    rows.push({
      name: (r.querySelector(".diag-nm") || {}).textContent || "",
      detail: (r.querySelector(".diag-st") || {}).textContent || "",
      level: ((r.querySelector(".diag-ic") || {}).className || "").replace("diag-ic", "").trim()
    });
  });
  const caps = (window.HNK && window.HNK.selfTest && window.HNK.selfTest.capabilities()) || {};
  return { rows: rows, caps: caps, errors: (window.HNK.selfTest.errors() || []).length,
    errorList: (window.HNK.selfTest.errors() || []).slice(0, 5),
    copy: typeof selfTestText === "function" ? selfTestText() : "" };
};

/* --------------------------------------------------------------- runtime */

(async () => {
  /* the panel's own files, plus the licensed host's tree under /__app/ on the
     SAME origin, so the fetches the loader now makes are answered exactly as
     Photoshop's would be */
  let served = 0;
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    let base = PANEL, fromApp = false;
    if (rel.indexOf("__app/") === 0) { base = APP_DIR; rel = rel.slice(6); fromApp = true; }
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    if (fromApp) served++;
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(UXP_STUB);
    await page.addInitScript(`(function(){
      var stub = window.fetch;
      var BASE = ${JSON.stringify(ASSET_HOST + "/app/")};
      window.fetch = function(url, init){
        var u = String(url);
        if (u.indexOf(BASE) === 0) u = "http://127.0.0.1:${port}/__app/" + u.slice(BASE.length);
        return stub(u, init);
      };
    })();`);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); }
      catch (e) { return false; }
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);

    /* A) NOT ONE element in the whole document may point at the licensed host.
       This is the check that would have caught 6.106.0 had it existed: the
       cards drew perfectly in Chromium while every src was a remote URL. */
    const remote = await page.evaluate((host) => {
      const out = [];
      document.querySelectorAll("img, video, source").forEach(function (el) {
        const s = el.getAttribute("src") || "";
        if (s.indexOf(host) === 0) out.push(s.slice(-60));
      });
      /* background-image too — the Library paints its plates that way */
      document.querySelectorAll("*").forEach(function (el) {
        const bg = el.style && el.style.backgroundImage;
        if (bg && bg.indexOf(host) >= 0) out.push("bg " + bg.slice(0, 60));
      });
      return out;
    }, ASSET_HOST);
    report("A6) with every page built, no element in the panel points at the licensed host — the bytes arrive as data:",
      remote.length === 0, remote.length + " remote: " + remote.slice(0, 4).join(" | "));

    /* walk every page so the art, the pickers and the self-test all build */
    const PAGES = ["aitools", "wf", "prompt", "imagine", "retouch", "path", "create",
      "video", "vidup", "v2v", "talk", "presets", "gallery", "setup"];
    for (const key of PAGES) {
      await page.evaluate(k => { try { switchPage(k); } catch (e) { } }, key);
      await page.waitForTimeout(320);
    }
    await page.waitForTimeout(1500);

    const after = await page.evaluate((host) => {
      const out = [];
      document.querySelectorAll("img").forEach(function (im) {
        const s = im.getAttribute("src") || "";
        if (s.indexOf(host) === 0) out.push(s.slice(-60));
      });
      return out;
    }, ASSET_HOST);
    report("A7) and still none after all fourteen pages have been opened",
      after.length === 0, after.length + " remote: " + after.slice(0, 4).join(" | "));

    report("A8) the loader really did fetch the licensed host's art (it is not simply drawing nothing)",
      served > 100, served + " files served from the app tree");

    const art = await page.evaluate(() => {
      const ra = window.HNK && window.HNK.remoteArt;
      return ra ? ra.stats() : null;
    });
    report("A9) and every one of those fetches succeeded",
      !!art && art.ok > 100 && art.failed === 0, JSON.stringify(art));

    /* B) the picker, as the renderer sees it */
    await page.evaluate(() => { try { switchPage("video"); } catch (e) { } });
    await page.waitForTimeout(600);
    const sel = await page.evaluate(() => {
      const s = document.getElementById("vidModel");
      if (!s) return null;
      return {
        options: s.options ? s.options.length : -1,
        direct: s.querySelectorAll(":scope > option").length,
        groups: s.querySelectorAll("optgroup").length,
        heads: s.querySelectorAll("option[data-fam-head]").length,
        value: s.value,
        valueDisabled: !!(s.selectedIndex >= 0 && s.options[s.selectedIndex] && s.options[s.selectedIndex].disabled),
        face: (document.getElementById("vidModelVal") || {}).textContent || ""
      };
    });
    report("B3) every option is a DIRECT child of the picker — a renderer that does not walk into a group still sees all of them",
      !!sel && sel.groups === 0 && sel.direct === sel.options && sel.options > 150,
      JSON.stringify(sel));
    report("B4) the families survive as header rows, and the picker's own value is a real model, never a header",
      !!sel && sel.heads > 10 && !!sel.value && !sel.valueDisabled && sel.face.length > 0,
      JSON.stringify(sel));

    /* the rest of the panel's pickers must not have grown one either */
    const anyGroup = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll("select").forEach(function (s) {
        if (s.querySelectorAll("optgroup").length) out.push(s.id || s.className);
      });
      return out;
    });
    report("B5) and no other picker in the panel carries an optgroup",
      anyGroup.length === 0, anyGroup.join(", "));

    /* D) the self-test card, drawn and readable */
    await page.evaluate(() => { try { switchPage("setup"); } catch (e) { } });
    await page.waitForTimeout(700);
    const st = await page.evaluate(READ_CARD);
    const named = (n) => !!st && st.rows.some(r => r.name === n);
    report("D4) the card names the panel, the host, the renderer's three answers and every list a page is built from",
      !!st && ["Panel", "Photoshop", "optgroup", "line boxes", "SVG in img", "Video model",
        "Video tool", "Talk model", "Smart Workflow", "Text→Img", "Library", "Pictures", "Errors"]
        .every(named),
      !!st && st.rows.map(r => r.name).join(", "));
    report("D5) its counts are the panel's real ones, not placeholders",
      !!st && st.rows.some(r => r.name === "Video model" && Number(r.detail) > 150) &&
      st.rows.some(r => r.name === "Smart Workflow" && Number(r.detail) > 150) &&
      st.rows.some(r => r.name === "Pictures" && /\d+ ok/.test(r.detail)),
      !!st && JSON.stringify(st.rows.filter(r => ["Video model", "Smart Workflow", "Pictures"].indexOf(r.name) >= 0)));
    report("D6) a list that failed to arrive would be RED, so the card cannot flatter the panel",
      /level: lvl\(nVid > 0\)/.test(MAIN) && /const lvl = function \(ok\) \{ return ok \? "ok" : "err"; \};/.test(MAIN), null);
    report("D7) the renderer probes answered, and this renderer flattens an optgroup — which is why a browser never saw the defect",
      !!st && st.caps.optgroup === true && typeof st.caps.rangeRects === "number",
      !!st && JSON.stringify(st.caps));
    report("D8) it can be copied as text, so a student with no camera can still send it",
      !!st && st.copy.indexOf("HNK panel self-test") === 0 && st.copy.indexOf("Video model:") > 0,
      !!st && st.copy.slice(0, 120));
    report("D9) nothing threw while all of that was built",
      errs.length === 0 && !!st && st.errors === 0,
      errs.slice(0, 3).join(" | ") + " | selfTest: " + (st ? st.errors : "?") +
      " " + JSON.stringify(st && st.errorList));

    /* F) the new rows, on the healthy build */
    const row = (n) => (st && st.rows.find(r => r.name === n)) || null;
    report("F6) the card reports the wiring: dozens of stages, none failed",
      !!row("Wiring") && /^(\d+) ok · 0 failed$/.test(row("Wiring").detail) && Number(/^(\d+)/.exec(row("Wiring").detail)[1]) >= 50 && row("Wiring").level === "ok",
      JSON.stringify(row("Wiring")));
    report("F7) it reports the Video page as the DOM holds it — options, a named face, shelf cards",
      !!row("Video page") && /^(\d+) opt · face ✓ · (\d+) cards$/.test(row("Video page").detail) &&
      Number(/^(\d+)/.exec(row("Video page").detail)[1]) > 150 && Number(/· (\d+) cards$/.exec(row("Video page").detail)[1]) > 20 && row("Video page").level === "ok",
      JSON.stringify(row("Video page")));
    report("F8) every JavaScript-written label it watches carries text, and the panel's own log is clean",
      !!row("Labels") && /^5\/5 ✓$/.test(row("Labels").detail) && row("Labels").level === "ok" &&
      !!row("Panel log") && row("Panel log").level === "ok",
      JSON.stringify([row("Labels"), row("Panel log")]));
    report("F9) the copy text carries all of it",
      !!st && ["Wiring:", "Video page:", "Labels:", "Panel log:"].every(k => st.copy.indexOf(k) > 0), !!st && st.copy.slice(-200));

    /* K) v6.74.0 — THE FIFTH LEVEL. The owner's six photographs of 6.144.0
       showed eight "!" rows that were all the same non-fact: the host declined
       to measure. A wrong measurement and no measurement can no longer share a
       mark. Both claims are proved on the live page by feeding selfTestRows()
       the answers the photographs carried, then wrong ones, and reading the
       level it assigns each row. */
    const HOST_CAPS = { rangeRects: -1, rangeLineBoxes: false,
      cssBox: "unmeasurable", cssBoxC: "border-box", cssGap: "unmeasurable", cssGapC: "?",
      cssCalc: "unmeasurable", cssCalcC: "calc(50px + 10px)", cssFixed: "unmeasurable", cssFixedC: "fixed",
      cssObjectFit: "kept", cssBgSize: "kept",
      rulers: "rect 0 \u00b7 client 0 \u00b7 scroll 0 \u00b7 computed 100px \u00b7 offset 0",
      cssEcho: "echo (calc came back unresolved)", scopeOk: "yes", scopeAttr: "stpg apg",
      glyphMiss: "unmeasurable", glyphRef: "notdef -1 \u00b7 n -1" };
    const WRONG_CAPS = { rangeRects: 40, rangeLineBoxes: false,
      cssBox: "content-box", cssBoxC: "content-box", cssGap: "no", cssGapC: "normal",
      cssCalc: "no", cssCalcC: "60px", cssFixed: "no", cssFixedC: "static",
      cssObjectFit: "DROPPED", cssBgSize: "DROPPED",
      rulers: "rect 88 \u00b7 client 88 \u00b7 scroll 88 \u00b7 computed 100px \u00b7 offset 88",
      cssEcho: "88px", scopeOk: "LOST", scopeAttr: "", scopeProp: "",
      glyphMiss: "27A1 1F504", glyphN: 2, glyphRef: "notdef 13 \u00b7 n 9" };
    const HOST_ROWS = ["line boxes", "box-sizing", "flex gap", "calc()", "position:fixed",
      "rulers (100px box)", "\u21b3 computed is", "glyphs"];
    const levelsWith = async (caps) => page.evaluate((c) => {
      const real = window.HNK.selfTest.capabilities;
      window.HNK.selfTest.capabilities = function () { return Object.assign({}, real.call(this), c); };
      try {
        const out = {};
        selfTestRows().forEach(function (r) { out[r.label] = r.level; });
        /* and as the DOM draws it: the class the stylesheet keys on and the mark itself */
        renderSelfTestInner();
        const drawn = {};
        document.querySelectorAll("#selfTestRows .diagrow").forEach(function (r) {
          drawn[(r.querySelector(".diag-nm") || {}).textContent] = {
            cls: (r.querySelector(".diag-ic") || {}).className || "",
            mark: (r.querySelector(".diag-ic") || {}).textContent || "" };
        });
        return { levels: out, drawn: drawn };
      } finally { window.HNK.selfTest.capabilities = real; renderSelfTestInner(); }
    }, caps);
    const hostLv = await levelsWith(HOST_CAPS);
    report("K1) the eight answers the owner's Photoshop cannot give are marked host (~), not warn (!) — and the rows it DID answer stay ok",
      HOST_ROWS.every(n => hostLv.levels[n] === "host") && hostLv.levels["glyph ruler"] === "host" &&
      hostLv.levels["object-fit"] === "ok" && hostLv.levels["background-size"] === "ok" && hostLv.levels["page scope"] === "ok",
      JSON.stringify(HOST_ROWS.map(n => [n, hostLv.levels[n]])));
    report("K2) the DOM draws every one of them with the host class and the ~ mark, so the stylesheet can mute them",
      HOST_ROWS.every(n => hostLv.drawn[n] && hostLv.drawn[n].cls === "diag-ic host" && hostLv.drawn[n].mark === "~"),
      JSON.stringify(HOST_ROWS.map(n => [n, hostLv.drawn[n]])));
    const wrongLv = await levelsWith(WRONG_CAPS);
    report("K3) the same rows answered WRONG stay warn (!) — the new mark is for silence, never for a bad answer",
      HOST_ROWS.every(n => wrongLv.levels[n] === "warn") && wrongLv.levels["glyph ruler"] === "ok" &&
      wrongLv.levels["object-fit"] === "warn" && wrongLv.levels["background-size"] === "warn" && wrongLv.levels["page scope"] === "warn" &&
      HOST_ROWS.every(n => wrongLv.drawn[n] && wrongLv.drawn[n].cls === "diag-ic warn" && wrongLv.drawn[n].mark === "!"),
      JSON.stringify(HOST_ROWS.map(n => [n, wrongLv.levels[n], wrongLv.drawn[n] && wrongLv.drawn[n].mark])));
    const hostMark = await page.evaluate(() => ({
      icons: DIAG_ICON,
      legend: ((document.getElementById("selfTestLegend") || {}).textContent || "").trim(),
      want: ff9(ST_L.legend), langs: Object.keys(ST_L.legend).join(","),
      lang: state.lang,
      css: Array.from(document.styleSheets).some(function (sh) {
        try { return Array.from(sh.cssRules).some(function (r) { return r.selectorText === ".diag-ic.host"; }); }
        catch (e) { return false; }
      })
    }));
    report("K4) the five marks are distinct ASCII-or-drawn glyphs, the legend under the rows says what ~ and ! mean in the panel's own language, and the stylesheet knows the class",
      hostMark.icons.host === "~" && hostMark.icons.warn === "!" &&
      new Set(Object.values(hostMark.icons)).size === 5 &&
      hostMark.legend.length > 20 && hostMark.legend === hostMark.want &&
      hostMark.langs === "my,en,shn,kac,th,zh,vi,id,ms" &&
      Object.values(hostMark.icons).every(function (g) { return g.length === 1; }) &&
      hostMark.css === true,
      JSON.stringify(hostMark));
    /* the Licence row: the harness stub signs the panel in with a live lease,
       so the card must count that lease down rather than say anything else —
       the gate suite covers signed out, the grace and locked */
    report("K5) the card carries a Licence row, and on this build's live lease it counts the seconds left (ok)",
      !!row("Licence") && row("Licence").level === "ok" && /^live lease · \d+s left$/.test(row("Licence").detail) &&
      Number(/(\d+)s left/.exec(row("Licence").detail)[1]) > 60,
      JSON.stringify(row("Licence")));

    /* L) v6.75.0 — THE FIFTEEN PHOTOGRAPHS OF 6.145.0, on the live page. */
    /* L1: a RunningHub refusal has a line in every language, and the
       progress strip asks for it by the normalizer's own code */
    const BOOT = fs.readFileSync(path.join(ROOT, "panel/src/app/bootstrap.js"), "utf8");
    const rhI18n = await page.evaluate(() => {
      const b = window.HNK.i18n, keys = ["rh_err_network", "rh_err_timeout", "rh_err_rate_limited", "rh_err_invalid_key"];
      const missing = [];
      /* the nine tables that carry their own strings; the other codes in the picker fall back to one of these */
      const tables = Object.keys(b.table).filter(function (l) { return b.table[l] && typeof b.table[l].err_net === "string"; });
      tables.forEach(function (l) { keys.forEach(function (k) { if (!b.table[l][k] || b.table[l][k].length < 20) missing.push(l + "." + k); }); });
      return { lang: b.lang(), tables: tables.length, missing: missing, my: b.t("rh_err_network"), en: b.table.en.rh_err_network };
    });
    report("L1) a dead-line refusal speaks the panel's language: four RunningHub refusals carry a line in all nine tables, the strip looks them up by code, and the Burmese line is not the English one",
      rhI18n.tables === 9 && rhI18n.missing.length === 0 && rhI18n.lang === "my" && /RunningHub/.test(rhI18n.my) && rhI18n.my !== rhI18n.en &&
      /"rh_err_" \+ String\(n\.code\)\.replace\(\/-\/g, "_"\)/.test(BOOT) && /if \(loc\) line = loc;/.test(BOOT),
      JSON.stringify(rhI18n).slice(0, 300));

    /* L2: a slot's name has a line of its own above the five source buttons */
    const slotDom = await page.evaluate(async () => {
      try { switchPage("wf"); } catch (e) { }
      await new Promise(r => setTimeout(r, 700));
      const cards = Array.from(document.querySelectorAll("[id^='hnkWf_']")).slice(0, 20);
      let blocks = [];
      for (let i = 0; i < cards.length && !blocks.length; i++) {
        try { cards[i].click(); } catch (e) { }
        await new Promise(r => setTimeout(r, 60));
        blocks = Array.from(document.querySelectorAll(".hnk-req-block"));
      }
      const shape = blocks.map(function (b) {
        const head = b.querySelector(".hnk-req-head"), row = b.querySelector(".hnk-req-row");
        return {
          headHasLabel: !!(head && head.querySelector(".hnk-req-label")),
          headHasMark: !!(head && head.querySelector(".hnk-req-mark")),
          headFirst: !!(head && b.firstElementChild === head),
          /* the panel's buttons are divs the stylesheet owns (check Q), so count the row's children */
          rowButtons: row ? row.children.length : -1,
          rowHasLabel: !!(row && row.querySelector(".hnk-req-label")),
          labelText: head ? String((head.querySelector(".hnk-req-label") || {}).textContent || "").trim() : ""
        };
      });
      const css = Array.from(document.styleSheets).some(function (sh) {
        try { return Array.from(sh.cssRules).some(function (r) { return r.selectorText === ".hnk-req-head"; }); } catch (e) { return false; }
      });
      try { switchPage("setup"); } catch (e) { }
      return { blocks: blocks.length, shape: shape, css: css };
    });
    report("L2) every photo slot names itself on its own line (label + mark in .hnk-req-head, drawn first), the five source buttons follow in their own row, and the stylesheet knows the head",
      slotDom.blocks > 0 && slotDom.css === true &&
      slotDom.shape.every(s => s.headHasLabel && s.headHasMark && s.headFirst && s.rowButtons === 5 && !s.rowHasLabel && s.labelText.length > 0),
      JSON.stringify(slotDom).slice(0, 400));

    /* L3: an error event with nothing in it is still named, and the
       collector counts past its cap — DONE LAST on this page, because it
       dirties the card the checks above read clean */
    const evErr = await page.evaluate(() => {
      const st = window.HNK.selfTest;
      const before = { kept: st.errors().length, total: st.errorCount() };
      for (let i = 1; i <= 15; i++) window.dispatchEvent(new ErrorEvent("error", { lineno: 1000 + i }));
      const after = { kept: st.errors().length, total: st.errorCount() };
      const last = st.errors()[st.errors().length - 1] || {};
      const rows = selfTestRows();
      const errRow = rows.filter(r => r.label === "Errors")[0] || {};
      const lineRows = rows.filter(r => /^error \u00b7 line \d+$/.test(r.label));
      return { before, after, cap: st.errorCap, last: last.message, lastKind: last.kind, errRow: errRow.detail, errLevel: errRow.level, lineRows: lineRows.length,
        firstLine: lineRows[0] ? lineRows[0].detail : "" };
    });
    report("L3) fifteen bare error events: twelve are kept, fifteen are counted, each row names its target and line instead of reading \"error · error\", and the Errors row confesses the cap",
      evErr.cap === 12 && evErr.after.kept === 12 && evErr.after.total === evErr.before.total + 15 &&
      /^error event with no message \(target window, line \d+\)$/.test(evErr.last) && evErr.lastKind === "error" &&
      /^\d+ \u00b7 12 kept$/.test(evErr.errRow) && evErr.errLevel === "err" && evErr.lineRows >= 1 &&
      /^error event with no message/.test(evErr.firstLine),
      JSON.stringify(evErr));

    /* S) v6.75.1 — the Imagine photo sheet, as the owner's screenshot showed
       it: "Where from? — Where from?", a "phone" on a computer, and a photo
       announced as a reference. */
    const sheet = await page.evaluate(() => {
      /* v6.78.0 — the sheet is a <dialog> with its own Cancel row; the option buttons are the ones that are not it */
      const read = () => { const s = document.getElementById("ffSheet"); return s ? { tag: s.tagName, head: (s.querySelector(".subh") || {}).textContent || "", btns: Array.from(s.querySelectorAll(".btn:not(.ff-sheet-cancel)")).map(b => b.textContent), cancel: !!s.querySelector(".ff-sheet-cancel") } : null; };
      photoSheet(ff9(FF_L.where), { onLayer: function () { }, onFile: function () { } });
      const bare = read();
      photoSheet("IMG 1", { onLayer: function () { }, onFile: function () { } });
      const named = read();
      ffSheetClose();
      const b = window.HNK.i18n, tables = Object.keys(b.table).filter(l => typeof b.table[l].err_net === "string");
      const missing = tables.filter(l => !b.table[l].st_photo_layer_added || b.table[l].st_photo_layer_added === b.table[l].st_ref_layer_added);
      return { where: ff9(FF_L.where), bare, named, srcFileMy: FF_L.srcFile.my, missing, tables: tables.length, closed: !document.getElementById("ffSheet") };
    });
    report("S1) a sheet opened with no name of its own asks \"Where from?\" once, not twice; a named slot keeps its name in front; it is a <dialog> with a Cancel row (6.78.0); the sheet closes",
      !!sheet.bare && sheet.bare.tag === "DIALOG" && sheet.bare.cancel && sheet.bare.head === sheet.where && sheet.bare.btns.length === 2 &&
      !!sheet.named && sheet.named.head === "IMG 1 \u2014 " + sheet.where && sheet.closed,
      JSON.stringify(sheet).slice(0, 300));
    report("S2) the file source names this device, not a phone; a layer added as the photo says so in all nine languages, apart from a layer added as a reference",
      !/ဖုန်း/.test(sheet.srcFileMy) && /ဒီစက်/.test(sheet.srcFileMy) && sheet.tables === 9 && sheet.missing.length === 0 &&
      /pickWire: function \(btn, onFiles, kind\)/.test(MAIN) && /kind === "imRefFile" \? "st_ref_layer_added" : "st_photo_layer_added"/.test(MAIN),
      JSON.stringify({ srcFileMy: sheet.srcFileMy, missing: sheet.missing, tables: sheet.tables }));

    /* FAULT INJECTION. Two pages, each loaded with one renderer behaviour
       simulated, because reading the source cannot prove either claim. */
    const hurtPage = async (poison) => {
      const p = await browser.newPage({ viewport: { width: 380, height: 900 } });
      const errors = [];
      p.on("pageerror", e => errors.push(String(e).slice(0, 200)));
      await p.addInitScript(poison);
      await p.addInitScript(UXP_STUB);
      await p.addInitScript(`(function(){
        var stub = window.fetch;
        var BASE = ${JSON.stringify(ASSET_HOST + "/app/")};
        window.fetch = function(url, init){
          var u = String(url);
          if (u.indexOf(BASE) === 0) u = "http://127.0.0.1:${port}/__app/" + u.slice(BASE.length);
          return stub(u, init);
        };
      })();`);
      await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
      await p.waitForFunction(() => {
        try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); }
        catch (e) { return false; }
      }, null, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1200);
      for (const key of ["video", "talk", "gallery", "setup"]) {
        await p.evaluate(k => { try { switchPage(k); } catch (e) { } }, key);
        await p.waitForTimeout(400);
      }
      const state = await p.evaluate(() => {
        const t = id => { const el = document.getElementById(id); return el ? String(el.textContent || "").trim() : "<missing>"; };
        const sel = document.getElementById("vidModel");
        return {
          vidModelOpts: sel && sel.options ? sel.options.length : -1,
          vidModelValue: sel ? sel.value : "<missing>",
          heads: sel ? sel.querySelectorAll("option[data-fam-head]").length : -1,
          modelFace: t("vidModelVal"),
          wfIntro: t("vidWfIntro"), shelf: (document.getElementById("vidWfRow") || { children: [] }).children.length,
          resFace: t("vidResVal"), tkGen: t("btnTkGen"), tkFace: t("tkModelVal"),
          galDl: t("galDl"), checkUpdate: t("btnCheckUpdate"),
          wired: (typeof WIRED !== "undefined") ? Object.keys(WIRED).filter(k => WIRED[k] !== "ok") : null,
          log: (typeof HNK_LOG !== "undefined") ? HNK_LOG.filter(e => e.level === "ERR").map(e => e.msg) : null
        };
      });
      const card = await p.evaluate(READ_CARD);
      return { page: p, errors: errors, state: state, card: card,
        row: n => (card && card.rows.find(r => r.name === n)) || null };
    };

    /* G) THE HYPOTHESIS ITSELF. option.disabled is written in exactly three
       places in the panel and all three belong to this one picker; Text→Img
       and Freeform, full on the same Photoshop that showed this one empty,
       never touch it. So: a renderer whose option.disabled setter throws. The
       picker must fill anyway — that is what optOff buys. */
    const A = await hurtPage(`Object.defineProperty(HTMLOptionElement.prototype, "disabled", {
      configurable: true, get: function () { return false; },
      set: function () { throw new TypeError("UXP-sim: option.disabled is read-only"); } });`);
    report("G1) a renderer that refuses option.disabled no longer empties the picker — every model arrives, with its family headers",
      A.state.vidModelOpts > 150 && A.state.heads > 10, JSON.stringify(A.state));
    report("G2) and the picker's value is a real model with a painted face, never a header row",
      !!A.state.vidModelValue && A.state.vidModelValue.indexOf("—") < 0 &&
      A.state.modelFace.length > 0 && A.state.modelFace !== "—", JSON.stringify(A.state));
    report("G3) nothing failed at all under that fault, and the card's Video page row is green",
      Array.isArray(A.state.wired) && A.state.wired.length === 0 &&
      !!A.row("Video page") && A.row("Video page").level === "ok" &&
      !!A.row("Wiring") && / · 0 failed$/.test(A.row("Wiring").detail),
      JSON.stringify([A.state.wired, A.row("Video page"), A.row("Wiring")]));
    report("G4) the whole page is whole: labels, shelf, resolution face, and Talk / Gallery / Setup behind it",
      A.state.wfIntro.length > 10 && A.state.shelf > 20 && A.state.resFace.length > 0 &&
      A.state.tkGen.length > 0 && A.state.tkFace.length > 3 && A.state.galDl.length > 0 && A.state.checkUpdate.length > 0,
      JSON.stringify(A.state));
    report("G5) and no uncaught error escaped", A.errors.length === 0, A.errors.join(" | "));
    await A.page.close();

    /* H) AND WHATEVER THE LINE REALLY IS. The hypothesis above may be wrong —
       this wave was already wrong once, about the optgroup. So a second fault
       nothing has fixed: an arbitrary throw inside the same stage (the
       data-fam-head attribute write, which only vidFillModels performs). The
       picker cannot survive it. Everything else must. */
    const B = await hurtPage(`(function(){
      var set = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (n, v) {
        if (String(n) === "data-fam-head") throw new TypeError("UXP-sim: attribute refused");
        return set.call(this, n, v);
      };
    })();`);
    report("H1) the arbitrary fault really did stop the picker from filling (the shape of what the owner photographed)",
      B.state.vidModelOpts === 0 && B.state.modelFace === "—", JSON.stringify(B.state));
    report("H2) the Video page still painted its labels, its shelf and its resolution face around the failure",
      B.state.wfIntro.length > 10 && B.state.shelf > 20 && B.state.resFace.length > 0, JSON.stringify(B.state));
    report("H3) Talk, Gallery and Setup — bound after Video — are labelled: one page's throw no longer unbinds the rest",
      B.state.tkGen.length > 0 && B.state.tkFace.length > 3 && B.state.galDl.length > 0 && B.state.checkUpdate.length > 0,
      JSON.stringify(B.state));
    report("H4) WIRED names exactly the stage that failed, and the log line carries the file and line",
      Array.isArray(B.state.wired) && B.state.wired.length === 1 && B.state.wired[0] === "video:models" &&
      Array.isArray(B.state.log) && B.state.log.some(m => /^wire-fail: video:models UXP-sim: attribute refused @ main\.js:\d+$/.test(m)),
      JSON.stringify({ wired: B.state.wired, log: B.state.log }));
    report("H5) the card says so: Wiring counts the failure, the failing stage is a red row with message, file and line",
      !!B.row("Wiring") && / · 1 failed$/.test(B.row("Wiring").detail) && B.row("Wiring").level === "err" &&
      !!B.row("✗ video:models") && /UXP-sim: attribute refused @ main\.js:\d+/.test(B.row("✗ video:models").detail) &&
      B.row("✗ video:models").level === "err",
      JSON.stringify([B.row("Wiring"), B.row("✗ video:models")]));
    report("H6) and the Video page row is red with the DOM's own numbers — 0 options, no face — while the shelf count stands",
      !!B.row("Video page") && /^0 opt · face — · (\d+) cards$/.test(B.row("Video page").detail) && B.row("Video page").level === "err",
      JSON.stringify(B.row("Video page")));
    report("H7) the copy text names the stage too, so a student with no camera still sends the line",
      !!B.card && B.card.copy.indexOf("✗ video:models: UXP-sim") > 0 && /main\.js:\d+/.test(B.card.copy),
      !!B.card && B.card.copy.slice(0, 200));
    report("H8) the fault stayed caught — no uncaught page error escaped the guards",
      B.errors.length === 0, B.errors.join(" | "));
    await B.page.close();

    /* M) v6.75.0 — THE BLANK FIRST OPEN. In the owner's Photoshop every
       element's getClientRects() is an empty list; the Imagine module's init
       takes that as "hidden" and draws nothing, so the first entry painted a
       hero head over an empty page and only the second drew the hub. The same
       renderer behaviour, simulated on a fresh page. */
    const C = await hurtPage(`Element.prototype.getClientRects = function () { return []; };`);
    const imagineFirst = await C.page.evaluate(async () => {
      const root = document.getElementById("imRoot");
      const beforeKids = root ? root.children.length : -1;
      try { switchPage("imagine"); } catch (e) { }
      await new Promise(r => setTimeout(r, 600));
      return { beforeKids, kids: root ? root.children.length : -1,
        drawn: !!(window.HNK.imagine && window.HNK.imagine.drawn()),
        hub: !!document.querySelector("#imRoot .im-hub"),
        rects: document.body.getClientRects().length,
        ready: (typeof imagineReady !== "undefined") ? imagineReady : null };
    });
    report("M1) the fault is in force — this page measures no element",
      imagineFirst.rects === 0, JSON.stringify(imagineFirst));
    report("M2) …and the FIRST entry to Imagine draws the hub anyway: init declined, the panel rendered",
      imagineFirst.beforeKids === 0 && imagineFirst.kids > 0 && imagineFirst.drawn === true && imagineFirst.hub === true && imagineFirst.ready === true,
      JSON.stringify(imagineFirst));
    report("M3) nothing threw on the way", C.errors.length === 0 && Array.isArray(C.state.wired) && C.state.wired.length === 0,
      JSON.stringify({ errors: C.errors, wired: C.state.wired }));
    await C.page.close();

    /* N) v6.75.0 — NO localStorage AT ALL, which is what UXP is. The What's
       New strip forgot every dismissal at relaunch because that is the only
       place it wrote; the owner's Home opened on "(105)" every time. With
       localStorage absent, a dismissal must reach the settings file and come
       back from it. */
    const D = await hurtPage(`Object.defineProperty(window, "localStorage", { configurable: true,
      get: function () { throw new Error("UXP-sim: no localStorage"); } });`);
    const seenFile = await D.page.evaluate(async () => {
      /* v6.77.0 — the HOST's storage throws (the injection above); the panel's
         own shim (src/app/uxp-local-storage.js) now stands in for it, so the
         fault shows as the shim being installed rather than as a throw. */
      let lsGone = false, shim = false;
      try { window.localStorage; } catch (e) { lsGone = true; }
      try { shim = !!(window.HNK.localStore && window.HNK.localStore.shimmed && window.HNK.localStore.installed); } catch (e) { shim = false; }
      try { switchPage("home"); } catch (e) { }
      await new Promise(r => setTimeout(r, 700));
      const total = window.HNK.whatsNew.LIST.length;
      const head = () => ((document.getElementById("hnkDashNewH2") || {}).textContent || "");
      const h0 = head();
      const x = document.querySelector("#hnkDashNew .nw-x");
      if (!x) return { lsGone, shim, h0, noX: true };
      x.click();
      await new Promise(r => setTimeout(r, 400));
      const h1 = head();
      /* the settings file, read back through the same UXP surface the panel wrote it with */
      const uxp = window.require("uxp");
      const folder = await uxp.storage.localFileSystem.getDataFolder();
      const f = await folder.getEntry("settings");
      const txt = await f.read({ format: "utf8" });
      const onDisk = JSON.parse(txt).nwSeen;
      /* a relaunch: forget in memory, read the file again, redraw Home */
      const inMem = Array.isArray(state.nwSeen) ? state.nwSeen.slice() : null;
      state.nwSeen = [];
      await loadSettings();
      const restored = Array.isArray(state.nwSeen) ? state.nwSeen.slice() : null;
      try { switchPage("wf"); switchPage("home"); } catch (e) { }
      await new Promise(r => setTimeout(r, 500));
      return { lsGone, shim, total, h0, h1, onDisk, inMem, restored, h2: head() };
    });
    report("N1) the fault is in force — the host's localStorage throws, as in UXP, and the panel's storage shim stands in — and the panel still booted with nothing unbound",
      (seenFile.lsGone || seenFile.shim === true) === true && Array.isArray(D.state.wired) && D.state.wired.length === 0 && D.errors.length === 0,
      JSON.stringify({ lsGone: seenFile.lsGone, shim: seenFile.shim, wired: D.state.wired, errors: D.errors }));
    report("N2) one × on Home counts the heading down by one, lands in the settings file, and survives a relaunch: read back from the file, Home still counts it as read",
      !seenFile.noX && seenFile.h0.indexOf("(" + seenFile.total + ")") >= 0 &&
      seenFile.h1.indexOf("(" + (seenFile.total - 1) + ")") >= 0 &&
      Array.isArray(seenFile.onDisk) && seenFile.onDisk.length === 1 &&
      Array.isArray(seenFile.inMem) && seenFile.inMem.length === 1 && seenFile.inMem[0] === seenFile.onDisk[0] &&
      Array.isArray(seenFile.restored) && seenFile.restored.length === 1 &&
      seenFile.h2.indexOf("(" + (seenFile.total - 1) + ")") >= 0,
      JSON.stringify(seenFile).slice(0, 400));
    await D.page.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  /* D) className IS NOT A STRING IN UXP.
        v6.53.0 — the owner photographed the self-test on panel 6.119.0: Wiring
        56 ok / 4 FAILED, every failure the same line —
        "Cannot read properties of null (reading 'replace') @ main.js:276" —
        and Labels ✗ "Setup #btnCheckUpdate" beneath it.

        A browser hands back "" for an element with no class attribute. UXP
        hands back null. Line 276 read host.className and called .replace on
        it. Every one of the four failing wirings paints an accordion title of
        exactly one shape — <span id="..."> carrying an id and NO class, inside
        <div class="grp-h"> — and setup:statics threw on platPS seven lines
        before it would have written btnCheckUpdate's label. One null produced
        six red rows, and no browser test could see it, because in a browser
        that expression is simply "".

        So this pins the shape rather than the symptom: every className READ in
        the panel goes through clsOf(), which answers "" for null. A write is
        fine and stays untouched. */
  const clsFn = MAIN.match(/function clsOf\(el\)\s*\{[^}]*\}/);
  report("D1) the panel has one place that reads className, and it survives null",
    !!clsFn && (function () {
      const fn = new Function("return " + clsFn[0] + "; clsOf")();
      const f = eval("(" + clsFn[0] + ")");
      return f({ className: null }) === "" && f(null) === "" && f({}) === "" &&
             f({ className: "grp-h open" }) === "grp-h open";
    })(),
    { found: !!clsFn });

  /* every OTHER .className in the file must be a write (x.className = ...),
     never a read — a read is what threw in the owner's Photoshop */
  const withoutHelper = MAIN.replace(/function clsOf\(el\)\s*\{[^}]*\}/, "");
  const rawReads = [];
  const reRe = /\.className\s*(?!=[^=])(?:[.[(]|==|!=|\))/g;
  let m;
  while ((m = reRe.exec(withoutHelper))) {
    const at = withoutHelper.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, " ");
    rawReads.push(at);
  }
  report("D2) nothing else reads className raw, so UXP's null cannot throw again",
    rawReads.length === 0, rawReads.slice(0, 4));

  /* and the markup shape that caused it still ships, so the guard is not
     protecting against something hypothetical */
  const grpH = INDEX.match(/class="grp-h"[^>]*>[\s\S]*?<\/div>/g) || [];
  const bare = grpH.filter(h => /<span id="[A-Za-z0-9_]+"(?!\s+class)/.test(h)).length;
  report("D3) accordion titles still ship with an id and no class — the guard is live, not theoretical",
    bare > 0, { bareTitles: bare, groups: grpH.length });

  /* ---- J) no <img> reaches this renderer without a src (v6.58.1) ---- */
  /* prose that merely MENTIONS <img> is not markup, so comments come out first */
  const INDEX_TAGS = INDEX.replace(/<!--[\s\S]*?-->/g, "");
  const imgTags = INDEX_TAGS.match(/<img\b[^>]*>/g) || [];
  const srcless = imgTags.filter(t => !/\ssrc\s*=/.test(t));
  report("J1) every <img> in the panel's markup ships with a src",
    imgTags.length > 0 && srcless.length === 0,
    { tags: imgTags.length, without: srcless.slice(0, 4) });

  /* the placeholder has to BE a picture, not an empty string dressed up as one */
  const blank = (MAIN.match(/const IMG_BLANK = "([^"]+)"/) || [])[1] || "";
  let blankOk = false;
  try {
    const m = /^data:image\/(gif|png);base64,([A-Za-z0-9+/=]+)$/.exec(blank);
    const buf = m ? Buffer.from(m[2], "base64") : null;
    blankOk = !!buf && buf.length > 8 &&
      (buf.slice(0, 6).toString("latin1") === "GIF89a" ||
       buf.slice(1, 4).toString("latin1") === "PNG");
  } catch (e) { blankOk = false; }
  report("J2) the empty-slot placeholder is a real image this renderer can decode",
    blankOk, { bytes: blank.length, head: blank.slice(0, 32) });

  /* every srcless tag carries the SAME placeholder, so one edit moves them all */
  const usesBlank = imgTags.filter(t => blank && t.indexOf(blank) >= 0).length;
  report("J3) the twelve slots that have no picture yet all carry that one placeholder",
    blankOk && usesBlank >= 12, { carrying: usesBlank });

  /* removeAttribute("src") is the other way to make an empty <img>, and it now
     lives in exactly one place — clearSrc — because a <video> genuinely does
     need it: handing the video slot a GIF traded eight image errors for one
     video error, and D9 above caught that before Photoshop did. */
  const MAIN_CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const removals = (MAIN_CODE.match(/removeAttribute\(\s*["']src["']\s*\)/g) || []);
  const helper = (MAIN_CODE.match(/function clearSrc\(el\) \{[\s\S]*?\n\}/) || [])[0] || "";
  report("J4) a src comes off an element in one place only, and only for a <video>",
    removals.length === 1 && /VIDEO/.test(helper) &&
    /removeAttribute\(\s*["']src["']\s*\)/.test(helper) && /IMG_BLANK/.test(helper),
    { removals: removals.length, helperFound: !!helper });

  /* the gallery thumbnail is the one that made seven of them: it must have a
     src before it can enter the document, not only when galThumb answers */
  const galBlock = (MAIN.match(/im\.alt = f\.name;[\s\S]{0,400}?galThumb\(f\)/) || [])[0] || "";
  report("J5) a gallery thumbnail carries the placeholder before galThumb answers",
    galBlock.indexOf("IMG_BLANK") >= 0 &&
    galBlock.indexOf("IMG_BLANK") < galBlock.indexOf("galThumb(f)"),
    { block: galBlock ? galBlock.replace(/\s+/g, " ").slice(0, 90) : "not found" });

  /* and the diagnostic that failed to name them: it read .className, which
     6.53.0 proved is null here, so a class could never be printed */
  const SELFTEST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
  const namer = (SELFTEST.match(/if \(!who\) \{[\s\S]*?\n\s{10}\}/) || [])[0] || "";
  report("J6) the self-test names a failing <img> by class, read the way UXP answers",
    namer.indexOf('getAttribute("class")') >= 0 && !/\.className/.test(namer),
    { readsClassName: /\.className/.test(namer) });

  /* v6.58.2 — the fetch path. Every card picture in the panel comes through
     here, and it is the one place that legitimately has no src to give yet. */
  const RA = fs.readFileSync(path.join(PANEL, "src/ui/remote-art.js"), "utf8");
  const paintFn = (RA.match(/function paint\(img, url, onFail\) \{[\s\S]*?\n\}/) || [])[0] || "";
  /* ONE return may precede the fill, and only one: the guard for having no
     element at all, which has nothing to fill. Every other way out of paint —
     no url, a local path, the cache, and above all the fetch — must find the
     element already carrying something. */
  const iFill  = paintFn.indexOf("BLANK");
  const iNoUrl = paintFn.indexOf("if (!url)");
  const iFetch = paintFn.indexOf("fetchArt");
  const before = paintFn.slice(0, iFill);
  const retsBeforeFill = (before.match(/\breturn\b/g) || []).length;
  report("J7) a picture element is filled before every way out of paint that leaves one behind",
    !!paintFn && iFill > 0 && retsBeforeFill === 1 && /if \(!img\) return;/.test(before) &&
    iNoUrl > iFill && iFetch > iFill,
    { fillAt: iFill, returnsBeforeFill: retsBeforeFill, noUrlAt: iNoUrl, fetchAt: iFetch });

  /* one placeholder, two files — a second literal that drifts is a second bug */
  const raBlank = (RA.match(/var BLANK = "([^"]+)"/) || [])[1] || "";
  report("J8) the fetch path and the panel agree on the same placeholder, byte for byte",
    !!raBlank && !!blank && raBlank === blank && /API = \{\s*BLANK: BLANK/.test(RA),
    { same: raBlank === blank, exported: /BLANK: BLANK/.test(RA) });

  /* the third road: a src ASSEMBLED out of state. "data:image/png;base64," +
     undefined is a string, so it throws nothing and reads as present — and is
     not a picture. One helper checks the payload, so the rule is a grep. */
  const builtRaw = (MAIN_CODE.match(/\.src\s*=\s*"data:/g) || []).length;
  const helper2 = (MAIN_CODE.match(/function dataSrc\(el, mime, b64\) \{[\s\S]*?\n\}/) || [])[0] || "";
  report("J9) no data: URL is assembled straight onto a .src — they go through one checked helper",
    builtRaw === 0 && /b64 \?/.test(helper2) && /IMG_BLANK/.test(helper2),
    { rawAssignments: builtRaw, helperChecksPayload: /b64 \?/.test(helper2) });

  /* R) v6.75.0 — remote-art asks again for what a dead line took. The
     owner's card after a Wi-Fi drop read "121 ok · 126 failed", and the 126
     stayed failed after the line returned. Node, with a fetch that fails
     and then works. */
  {
    const RA_PATH = path.join(ROOT, "panel/src/ui/remote-art.js");
    delete require.cache[require.resolve(RA_PATH)];
    const realFetch = global.fetch;
    let lineUp = false;
    global.fetch = () => lineUp
      ? Promise.resolve({ ok: true, status: 200, headers: { get: () => "image/png" },
          arrayBuffer: () => Promise.resolve(new Uint8Array([137, 80, 78, 71, 13, 10]).buffer) })
      : Promise.reject(new Error("Network request failed"));
    const ra = require(RA_PATH);
    const mkImg = (doc) => ({ src: "", getAttribute() { return this.src || null; }, ownerDocument: doc || null });
    const settle = () => new Promise(r => setTimeout(r, 30));
    const a = mkImg(), b = mkImg({ body: { contains: () => false } }), c = mkImg();
    const fails = [];
    ra.paint(a, "https://hnkaistudio.com/app/lib/a.jpg", e => fails.push("a:" + e.message));
    ra.paint(b, "https://hnkaistudio.com/app/lib/b.jpg", e => fails.push("b:" + e.message));
    await settle();
    const s1 = ra.stats();
    report("R1) with the line dead both paints fail loudly, keep the placeholder, and are remembered",
      fails.length === 2 && /Network request failed/.test(fails[0]) && s1.failed === 2 && ra.failedCount() === 2 &&
      a.src === ra.BLANK && b.src === ra.BLANK && /b\.jpg: Network request failed$/.test(s1.lastError),
      JSON.stringify({ fails, s1, a: a.src.slice(0, 30) }));
    report("R2) a retry inside the throttle window, unforced, is declined — page switches cannot hammer a dead line",
      ra.retryFailed(false) === 0 && ra.failedCount() === 2, { count: ra.failedCount() });
    lineUp = true;
    const n = ra.retryFailed(true);
    await settle();
    report("R3) forced (a validate landed): the picture still on screen is asked for again and drawn; the one no longer in the document is dropped, not fetched",
      n === 1 && a.src.indexOf("data:image/png;base64,") === 0 && b.src === ra.BLANK && ra.failedCount() === 0 && ra.stats().ok === 1,
      JSON.stringify({ n, a: a.src.slice(0, 40), b: b.src.slice(0, 30), s: ra.stats() }));
    ra.paint(c, "https://hnkaistudio.com/app/lib/a.jpg");
    await settle();
    report("R4) a second element asking for the same url is served from the cache without another fetch",
      c.src.indexOf("data:image/png;base64,") === 0 && ra.stats().ok === 1 && ra.stats().asked === 4,
      JSON.stringify(ra.stats()));
    global.fetch = realFetch;
  }
  /* the two hooks: a licence validate that lands forces the retry; a page
     switch offers the throttled one */
  report("R5) main.js asks for the lost pictures again when a validate lands (forced) and on every page switch (throttled)",
    /gateS\.leaseExp = expires;[\s\S]{0,600}remoteArt\.retryFailed\(true\)/.test(MAIN) &&
    /function switchPage\(key\) \{[\s\S]*?ra\.retryFailed\(false\)/.test(MAIN), null);

  const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("E) CI runs this test", CI.includes("node test/verify_panel_renderer_safety.js"), null);

  console.log(failures
    ? "\nFAIL (" + failures + ")"
    : "\nPASS — the panel asks this renderer for nothing it has ever failed to draw, and it says so out loud");
  process.exit(failures ? 1 : 0);
})();
