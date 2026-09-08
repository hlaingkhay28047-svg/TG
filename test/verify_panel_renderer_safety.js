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

   G) PROVEN BY FAULT INJECTION, not by reading: a second page is loaded with
      one renderer gap simulated (the option.disabled setter throws, exactly
      where vidFillModels sets its family headers). The page must still paint
      its labels, its shelf and its other pages, and the card must name the
      failing stage with its file and line.
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

report("B1) the video model picker builds flat options with a disabled family header, and creates no optgroup",
  /const head = mkOption\("", "— " \+ lab \+ " —"\);/.test(MAIN) &&
  /head\.disabled = true;/.test(MAIN) &&
  !/createElement\("optgroup"\)/.test(MAIN),
  "vidFillModels");

report("B2) a disabled header is never left as the picker's value",
  /function vidFirstSelectable\(sel\)/.test(MAIN) &&
  /if \(!sel\.value\) \{ const first = vidFirstSelectable\(sel\); if \(first\) \{ try \{ sel\.value = first; \} catch \(e\) \{ \} \} \}/.test(MAIN),
  null);

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
      errs.slice(0, 3).join(" | ") + " | selfTest: " + (st ? st.errors : "?"));

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

    /* G) FAULT INJECTION. A second page, one renderer gap simulated: the
       option.disabled setter throws — the statement vidFillModels reaches for
       its family header rows, which no other picker on the panel uses at
       build time. On 6.107.0 that single throw left the Video page without
       labels, shelf or faces and unbound Gallery and Talk behind it, and the
       card said nothing. */
    const page2 = await browser.newPage({ viewport: { width: 380, height: 900 } });
    const errs2 = [];
    page2.on("pageerror", e => errs2.push(String(e).slice(0, 200)));
    await page2.addInitScript(`Object.defineProperty(HTMLOptionElement.prototype, "disabled", {
      configurable: true, get: function () { return false; },
      set: function () { throw new TypeError("UXP-sim: option.disabled is read-only"); } });`);
    await page2.addInitScript(UXP_STUB);
    await page2.addInitScript(`(function(){
      var stub = window.fetch;
      var BASE = ${JSON.stringify(ASSET_HOST + "/app/")};
      window.fetch = function(url, init){
        var u = String(url);
        if (u.indexOf(BASE) === 0) u = "http://127.0.0.1:${port}/__app/" + u.slice(BASE.length);
        return stub(u, init);
      };
    })();`);
    await page2.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page2.waitForFunction(() => {
      try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); }
      catch (e) { return false; }
    }, null, { timeout: 30000 }).catch(() => {});
    await page2.waitForTimeout(1200);
    for (const key of ["video", "talk", "gallery", "setup"]) {
      await page2.evaluate(k => { try { switchPage(k); } catch (e) { } }, key);
      await page2.waitForTimeout(400);
    }
    const hurt = await page2.evaluate(() => {
      const t = id => { const el = document.getElementById(id); return el ? String(el.textContent || "").trim() : "<missing>"; };
      const sel = document.getElementById("vidModel");
      return {
        vidModelOpts: sel && sel.options ? sel.options.length : -1,
        wfIntro: t("vidWfIntro"), shelf: (document.getElementById("vidWfRow") || { children: [] }).children.length,
        resFace: t("vidResVal"), tkGen: t("btnTkGen"), tkFace: t("tkModelVal"), galDl: t("galDl"), checkUpdate: t("btnCheckUpdate"),
        wired: (typeof WIRED !== "undefined") ? Object.keys(WIRED).filter(k => WIRED[k] !== "ok") : null,
        log: (typeof HNK_LOG !== "undefined") ? HNK_LOG.filter(e => e.level === "ERR").map(e => e.msg) : null
      };
    });
    report("G1) the simulated gap really did stop the model picker from filling (the fault landed where 6.107.0 broke)",
      hurt.vidModelOpts === 0, JSON.stringify(hurt));
    report("G2) and the Video page still painted its labels, its shelf and its resolution face around the failure",
      hurt.wfIntro.length > 10 && hurt.shelf > 20 && hurt.resFace.length > 0, JSON.stringify(hurt));
    report("G3) Talk, Gallery and Setup — bound after Video — are labelled: one page's throw no longer unbinds the rest",
      hurt.tkGen.length > 0 && hurt.tkFace.length > 3 && hurt.galDl.length > 0 && hurt.checkUpdate.length > 0, JSON.stringify(hurt));
    report("G4) WIRED names exactly the stage that failed, and the log line carries the file and line",
      Array.isArray(hurt.wired) && hurt.wired.length === 1 && hurt.wired[0] === "video:models" &&
      Array.isArray(hurt.log) && hurt.log.some(m => /^wire-fail: video:models UXP-sim: option\.disabled is read-only @ main\.js:\d+$/.test(m)),
      JSON.stringify({ wired: hurt.wired, log: hurt.log }));
    const st2 = await page2.evaluate(READ_CARD);
    const row2 = (n) => (st2 && st2.rows.find(r => r.name === n)) || null;
    report("G5) the card says so: Wiring counts the failure, the failing stage is a red row with message, file and line",
      !!row2("Wiring") && / · 1 failed$/.test(row2("Wiring").detail) && row2("Wiring").level === "err" &&
      !!row2("✗ video:models") && /UXP-sim: option\.disabled is read-only @ main\.js:\d+/.test(row2("✗ video:models").detail) && row2("✗ video:models").level === "err",
      JSON.stringify([row2("Wiring"), row2("✗ video:models")]));
    report("G6) and the Video page row is red with the DOM's own numbers — 0 options, no face — while the shelf count stands",
      !!row2("Video page") && /^0 opt · face — · (\d+) cards$/.test(row2("Video page").detail) && row2("Video page").level === "err",
      JSON.stringify(row2("Video page")));
    report("G7) the copy text names the stage too, so a student with no camera still sends the line",
      !!st2 && st2.copy.indexOf("✗ video:models: UXP-sim") > 0 && /main\.js:\d+/.test(st2.copy), !!st2 && st2.copy.slice(0, 200));
    report("G8) the fault stayed caught — no uncaught page error escaped the guards",
      errs2.length === 0, errs2.join(" | "));
    await page2.close();
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("E) CI runs this test", CI.includes("node test/verify_panel_renderer_safety.js"), null);

  console.log(failures
    ? "\nFAIL (" + failures + ")"
    : "\nPASS — the panel asks this renderer for nothing it has ever failed to draw, and it says so out loud");
  process.exit(failures ? 1 : 0);
})();
