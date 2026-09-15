/* verify_panel_video_wizard_result.js — 6.85.0 / panel 6.156.0
   THE VIDEO SMART WORKFLOW WIZARD'S RESULT, IN PHOTOSHOP.

   Found by audit, not by photograph, after 6.83.0/6.84.0 gave the image
   wizard a real Results card. The video wizard (image→video and
   video→video cards) had three defects the real host would show:

     1. Its sheet was a position:fixed <div> appended to <body>. Photoshop's
        renderer lays a fixed box out as an ordinary block at the end of the
        document — the same defect the 6.78.0 photo sheet and the 6.82.0
        Freeform sheet had — so a card tap put the wizard a whole page below
        the fold. It now renders INSIDE the tapped page (its first child,
        the page's own cards hidden until it closes).
     2. An image→video Result was a raw <video>: black in Photoshop, whose
        <video> does not decode (VIDEO_OK, 6.77.0). The step now says so in
        the student's language (vid_no_inline), draws the takes as numbered
        tiles, and offers what works — Download and the direct link.
     3. A video→video Result was one text row, "hnk-videotool-….mp4 · saved",
        with no way to see, open or re-save the clip, and the V→V page had no
        result box at all. vtRun now records the take (vtHist), the wizard
        names the saved file with "Open the folder", and the page gets the
        app's result box: player or tile, Download again, direct link, a
        strip with ✕ per take.

   On both surfaces the Result step also shows WHERE the take came from (the
   page's own photo or clip), a meta line, and every earlier take of the page
   in a strip a tap switches to — the page's selection follows.

   Fault-injected while writing: `.vwiz-sheet { position: fixed` restored
   fails A1/C1; the VIDEO_OK branch removed fails A3/C2; vtRun's vtHist push
   removed fails A3/C5; the app's From chip removed fails A4/B1.
   Usage: PORT=8931 node test/verify_panel_video_wizard_result.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { build } = require("../tools/build_panel_video_wizard.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CSS = read("panel/styles.css");
const PHTML = read("panel/index.html");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

(async () => {
  /* ---------------- A. source pins ---------------- */
  report("A1) the panel's wizard sheet is no longer position:fixed — it is a block rendered inside the tapped page (first child), the page's cards hidden while it is open and restored on close, and the sheet removed on close",
    /\.vwiz-sheet \{ display: block; background-color: var\(--bg\); \}/.test(CSS) && !/\.vwiz-sheet \{ position: fixed/.test(CSS) &&
    /function vwizPageEl\(\) \{ return \$\(vwiz\.kind === "v2v" \? "pageV2V" : "pageVideo"\); \}/.test(MAIN) &&
    /if \(pg\) pg\.insertBefore\(sh, pg\.firstChild\); else document\.body\.appendChild\(sh\);/.test(MAIN) &&
    /function vwizHidePage\(sh\)/.test(MAIN) && /function vwizShowPage\(\)/.test(MAIN) &&
    /vwizShowPage\(\);\n  const sh = \$\("vwizSheet"\); if \(sh && sh\.parentNode\) sh\.parentNode\.removeChild\(sh\);/.test(MAIN) &&
    /function vwizRepaint\(\) \{ if \(vwizOpen\(\) && vwiz\.w\) renderVWiz\(\); \}/.test(MAIN), null);

  const a = APP.indexOf("/* ---- VWIZ_DATA ----"), b = APP.indexOf("/* ---- /VWIZ_DATA ---- */");
  const D = new Function(APP.slice(a, b) + "\nreturn { L: VWIZ_L };")();
  const NEW_KEYS = ["from", "fromClip", "takes", "openLink", "savedTo", "openFolder"];
  const gaps = [];
  NEW_KEYS.forEach(k => LANGS.forEach(l => { if (!D.L[k] || !D.L[k][l]) gaps.push(k + "." + l); }));
  const committed = fs.readFileSync(path.join(PANEL, "js", "hnk_video_wizard.js"), "utf8");
  report("A2) the six new Result words (from · fromClip · takes · openLink · savedTo · openFolder) exist in nine languages in the app's lifted block, savedTo carries {F}, and the panel's copy is exactly what the block produces",
    gaps.length === 0 && LANGS.every(l => /\{F\}/.test(D.L.savedTo[l])) && committed === build(), gaps.slice(0, 6));

  report("A3) the panel's Result step reads the page's history (vwizHistList), plays the take only where <video> decodes and otherwise says vid_no_inline with numbered tiles, offers Download · the direct link (openUrl) · the folder (vtOpenFolder); vtRun records every take in vtHist (url · bytes · file · folder · path) and paints the page's result box; the v2v run reads vtHist[0]",
    /function vwizHistList\(\) \{ return vwiz\.kind === "i2v" \? vidHist : vtHist; \}/.test(MAIN) &&
    /function vwizResultCard\(body, nav, el, goStep\)/.test(MAIN) && /vwizResultCard\(body, nav, el, goStep\);/.test(MAIN) &&
    /if \(VIDEO_OK && cur\.url\) \{\n    const v = document\.createElement\("video"\); v\.controls = true; v\.src = cur\.url; v\.className = "wiz-clip";/.test(MAIN) &&
    /t\("vid_no_inline"\)\.replace\("\{n\}", String\(vwiz\.sel \+ 1\)\)/.test(MAIN) && /strip\.id = "vwizTakes";/.test(MAIN) &&
    /lk\.id = "vwizOpenLink";[^\n]*openUrl\(cur\.url\);/.test(MAIN) && /fo\.id = "vwizOpenFolder";[^\n]*vtOpenFolder\(cur\.folderPath\);/.test(MAIN) &&
    /vtHist\.unshift\(\{ url: res\.results\[0\]\.url \|\| "", ref: res\.results\[0\]\.ref, name: name, folder: VT\.out\.name \|\| "", folderPath: VT\.out\.nativePath \|\| "",/.test(MAIN) &&
    /vtHistSel = 0;\n    try \{ showVtResult\(\); \} catch \(eS\) \{ \}/.test(MAIN) &&
    /if \(vtHist\[0\] !== beforeT\) \{ vwiz\.result = vtHist\[0\]; vwiz\.sel = 0; \}/.test(MAIN) &&
    /if \(vidHist\[0\] !== before\) \{ vwiz\.result = vidHist\[0\]; vwiz\.sel = 0; \}/.test(MAIN), null);

  const vtl = (MAIN.match(/const VT_L = \{[\s\S]*?\n\};/) || [""])[0];
  report("A4) the V→V page carries the app's result box (vtResultBox · player · vid_no_inline line · saved-file line · Download · direct link · strip · Clear), its four words in nine languages (resultH2 · openLink · histH · savedTo), and both controls bound",
    ["vtResultBox", "vtResultVideo", "vtNoInline", "vtSavedLine", "btnVtDl", "btnVtOpen", "vtHistH", "vtHist", "vtHistClear"].every(id => PHTML.indexOf('id="' + id + '"') >= 0) &&
    ["resultH2", "openLink", "histH", "savedTo"].every(k => { const line = (vtl.match(new RegExp("\\n  " + k + ": \\{[^\\n]*")) || [""])[0]; return LANGS.every(l => new RegExp("[{,]" + l + ':"').test(line)); }) &&
    /function showVtResult\(scroll\)/.test(MAIN) && /function vtRemoveP\(i\)/.test(MAIN) && /async function vtDownload\(\)/.test(MAIN) && /function vtOpen\(\)/.test(MAIN) &&
    /const vtd = \$\("btnVtDl"\); if \(vtd\) vtd\.addEventListener\("click", vtDownload\);/.test(MAIN) &&
    /const vto = \$\("btnVtOpen"\); if \(vto\) vto\.addEventListener\("click", vtOpen\);/.test(MAIN) &&
    /set\("vtResultH2", ff9\(VT_L\.resultH2\)\);/.test(MAIN) && /set\("vtHistH", ff9\(VT_L\.histH\)\);/.test(MAIN), null);

  report("A5) the app's Result step draws the From chip (the page's photo or clip), the meta line, the earlier-takes strip (vwizTakes, a tap moves the page's selection too) and the direct link as a new-tab anchor; vwiz remembers the shown take (sel)",
    /var vwiz=\{kind:"",w:null,step:1,token:0,busy:false,result:null,error:"",tick:null,sel:0\};/.test(APP) &&
    /var from=el\("div","wiz-from"\);/.test(APP) && /from\.appendChild\(el\("div","nm",vwizL\("from"\)\)\);/.test(APP) &&
    /vwizL\("fromClip"\)\+" · "\+\(state\.vtFile\.name\|\|"video"\)/.test(APP) &&
    /var strip=el\("div","hist wiz-takes"\); strip\.id="vwizTakes";/.test(APP) &&
    /makePickable\(tv, function\(\)\{ vwiz\.sel=i; state\[hk\+"Sel"\]=i; if\(vwiz\.kind==="i2v"\) showVidResult\(false\); else showVtResult\(false\); renderVWiz\(\); \}\);/.test(APP) &&
    /lk\.id="vwizOpenLink"; lk\.href=cur\.url; lk\.target="_blank"; lk\.rel="noopener"; setIcnText\(lk,"i-external",vwizL\("openLink"\)\);/.test(APP) &&
    /if\(state\[histKey\]\[0\]!==before\)\{ vwiz\.result=state\[histKey\]\[0\]; vwiz\.sel=0; \}/.test(APP) &&
    /\.wiz-from\{display:flex;align-items:center;gap:10px;margin:8px 0 10px\}/.test(APP), null);

  const wn = (APP.match(/\{ v:"6\.85\.0", kind:"page", ref:"pgVideo",[\s\S]*?\} \},\n/) || [""])[0];
  const wnP = (WHATS.match(/\{ v:"6\.85\.0", kind:"page", ref:"pgVideo",[\s\S]*?\} \},\n/) || [""])[0];
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A6) CI runs this test right after verify_panel_selection_results; the landing counts at least 220 tests; What's New carries the 6.85.0 Video row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_video_wizard_result.js") > CI.indexOf("node test/verify_panel_selection_results.js") && tests >= 220 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  /* ---------------- B. the web app ---------------- */
  const browser = await chromium.launch();
  withPremium(browser);
  let app;
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    app = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const q = s => document.querySelectorAll(s);
      const byWord = w => [...q("#wizIn .wiz-nav .btn")].find(b => b.textContent.trim() === w);
      const lastNav = () => [...q("#wizIn .wiz-nav .btn")].pop();
      state.rhKey = state.rhKey || "TEST_RH_KEY";
      state.vidHist = []; state.vidHistSel = 0;
      switchPage("pgVideo"); await settle();
      q("#vidWfRow .wfmini")[0].click(); await settle();
      document.querySelector("#wizIn .wiz-nav .btn-gold").click(); await settle();
      state.refs[0] = { mime: "image/png", b64: arg.px, label: "test.png" }; state.imgRoles = null; renderRefs();
      if (window._wizOnPick) window._wizOnPick(); await settle();
      lastNav().click(); await settle();
      rhGenerateVideo = async function () { await new Promise(r => setTimeout(r, 200)); return [{ url: arg.clip }]; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      const lk = document.getElementById("vwizOpenLink");
      out.first = { fromImg: !!document.querySelector("#wizIn .wiz-from .th img"), fromWord: ((document.querySelector("#wizIn .wiz-from .nm") || {}).textContent || ""),
        link: lk && lk.getAttribute("href"), target: lk && lk.getAttribute("target"), navBtns: q("#wizIn .wiz-nav .btn").length,
        takes: q("#vwizTakes").length, mainSrc: (document.querySelector("#wizIn .wiz-body > video") || {}).src || "" };
      /* a second take: Make another → Inputs (photo kept) → Generate again */
      byWord(vwizL("again")).click(); await settle();
      out.again = { filled: q("#wizIn .wslot.filled").length };
      lastNav().click(); await settle();
      rhGenerateVideo = async function () { await new Promise(r => setTimeout(r, 200)); return [{ url: arg.clip2 }]; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.second = { takes: q("#vwizTakes video").length, selIdx: [...q("#vwizTakes video")].findIndex(v => /\bsel\b/.test(v.className)),
        mainSrc: (document.querySelector("#wizIn .wiz-body > video") || {}).src || "", hist: state.vidHist.length, header: ((document.querySelector("#wizIn .wiz-takes-h") || {}).textContent || "") };
      /* tapping the older take shows it and moves the page's selection */
      q("#vwizTakes video")[1].click(); await settle();
      out.tap = { mainSrc: (document.querySelector("#wizIn .wiz-body > video") || {}).src || "", expect: vidPlayUrl(state.vidHist[1]), pageSel: state.vidHistSel, wizSel: vwiz.sel,
        selIdx: [...q("#vwizTakes video")].findIndex(v => /\bsel\b/.test(v.className)), link: (document.getElementById("vwizOpenLink") || {}).getAttribute("href") };
      document.querySelector("#wizIn .wiz-x").click(); await settle();
      /* video → video: the From chip names the clip */
      switchPage("pgV2V"); await settle();
      q("#vtWfRow .wfmini")[0].click(); await settle();
      document.querySelector("#wizIn .wiz-nav .btn-gold").click(); await settle();
      state.vtFile = { mime: "video/mp4", b64: "AAAAHGZ0eXBpc29t", name: "clip.mp4" };
      state.vtImg = { mime: "image/png", b64: arg.px };
      renderVtPicks(); await settle();
      lastNav().click(); await settle();
      rhGenerateVideoTool = async function () { await new Promise(r => setTimeout(r, 200)); return [{ url: arg.clip }]; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.v2v = { fromWord: ((document.querySelector("#wizIn .wiz-from .nm") || {}).textContent || ""), link: (document.getElementById("vwizOpenLink") || {}).getAttribute("href"),
        navBtns: q("#wizIn .wiz-nav .btn").length, video: !!document.querySelector("#wizIn .wiz-body > video") };
      document.querySelector("#wizIn .wiz-x").click(); await settle();
      out.lang = LANG;
      return out;
    }, { px: PX, clip: "http://127.0.0.1:" + PORT + "/lib/banners/motion/hero-mermaid.mp4", clip2: "http://127.0.0.1:" + PORT + "/lib/banners/motion/hero-mermaid.mp4?take=2" });
    app.errs = errs;
  } finally { await browser.close(); }

  const F = app.first, S = app.second, T = app.tap;
  report("B1) app · image→video Result: the From chip shows the page's photo with the word, the direct link is a new-tab anchor to the clip, six ways on (6.94.0: + Send to Upscale · Send to Video Tools), no takes strip with a single take",
    F.fromImg && F.fromWord === D.L.from[app.lang] && F.link && /hero-mermaid\.mp4$/.test(F.link) && F.target === "_blank" && F.navBtns === 6 /* 6.94.0 — + Send to Upscale · Send to Video Tools */ && F.takes === 0 && /hero-mermaid\.mp4$/.test(F.mainSrc), F);
  report("B2) app · Make another keeps the photo; the second take shows first, and the strip lists both takes under its heading",
    app.again.filled === 1 && S.takes === 2 && S.selIdx === 0 && /take=2$/.test(S.mainSrc) && S.hist === 2 && S.header === D.L.takes[app.lang], { again: app.again, second: S });
  report("B3) app · tapping the older take plays it (the page's own play URL — the Gallery's saved copy once it is home), marks it, moves the page's own selection, and points the direct link at it",
    T.mainSrc && T.mainSrc === T.expect && !/take=2$/.test(T.mainSrc) && T.pageSel === 1 && T.wizSel === 1 && T.selIdx === 1 && /hero-mermaid\.mp4$/.test(String(T.link)), T);
  report("B4) app · video→video Result: the From chip names the clip, the clip plays, the direct link and six ways on",
    app.v2v.fromWord.indexOf(D.L.fromClip[app.lang]) === 0 && /clip\.mp4$/.test(app.v2v.fromWord) && !!app.v2v.link && app.v2v.navBtns === 6 /* 6.94.0 */ && app.v2v.video, app.v2v);
  report("B5) app · no page error", app.errs.length === 0, app.errs.slice(0, 3));

  /* ---------------- C. the panel, on a renderer that cannot play video (Photoshop) ---------------- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  let pan;
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    /* Photoshop's <video> decodes nothing: canPlayType answers "" and VIDEO_OK is false */
    await page.addInitScript(() => { try { HTMLMediaElement.prototype.canPlayType = function () { return ""; }; } catch (e) { } });
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    pan = await page.evaluate(async arg => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 10000) r(); else setTimeout(w, 40); })(); });
      const q = s => document.querySelectorAll(s);
      const txt = s => [...q(s)].map(n => n.textContent.trim());
      const byWord = w => [...q("#vwizIn .wiz-nav .btn")].find(b => b.textContent.trim() === w);
      const lastNav = () => [...q("#vwizIn .wiz-nav .btn")].pop();
      const P = window.HNK.videoWizard;
      const sheet = () => document.getElementById("vwizSheet");
      const sibs = () => [...document.getElementById("pageVideo").children].filter(c => c.id !== "vwizSheet");
      out.videoOk = VIDEO_OK;
      out.beforeOpen = !sheet();
      state.rhKey = state.rhKey || "TEST_RH_KEY";
      switchPage("video"); await settle();
      out.sibsBefore = sibs().map(c => c.style.display);
      q("#vidWfRow .wfmini")[0].click(); await settle();
      const sh = sheet();
      out.open = { inPage: !!(sh && sh.parentNode && sh.parentNode.id === "pageVideo"), first: !!(sh && sh.parentNode.firstElementChild === sh),
        position: sh ? getComputedStyle(sh).position : "", sibsHidden: sibs().every(c => c.style.display === "none"), sibCount: sibs().length,
        pageOn: /\bon\b/.test(document.getElementById("pageVideo").className) };
      document.querySelector("#vwizIn .wiz-nav .btn-gold").click(); await settle();
      ffSlotSet(0, { mime: "image/png", b64: arg.px, label: "test.png" }); await settle();
      lastNav().click(); await settle();
      vidGenerate = async function () { await new Promise(r => setTimeout(r, 200)); vidHist.unshift({ url: arg.clip, ref: "data:video/mp4;base64,AAAA", prompt: "p", resolution: "1080p", duration: "5", ts: Date.now() }); vidHistSel = 0; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.i2v = { onDot: txt("#vwizIn .wiz-dot.on .l"), video: !!document.querySelector("#vwizIn video"),
        note: ((document.getElementById("vwizNoInline") || {}).textContent || ""), want: t("vid_no_inline").replace("{n}", "1"),
        tiles: txt("#vwizTakes .hvt"), sel: txt("#vwizTakes .hvt.sel"), fromThumb: !!document.querySelector("#vwizIn .wiz-from .th .im"),
        fromWord: ((document.querySelector("#vwizIn .wiz-from .nm") || {}).textContent || ""), meta: ((document.querySelector("#vwizIn .wiz-meta") || {}).textContent || ""),
        navWords: txt("#vwizIn .wiz-nav .btn"), navBtns: q("#vwizIn .wiz-nav .btn").length, link: !!document.getElementById("vwizOpenLink") };
      /* the direct link goes through the panel's one door to the system browser */
      openUrl = async function (u) { window.__opened = u; };
      document.getElementById("vwizOpenLink").click(); await settle();
      out.i2v.opened = window.__opened;
      /* a second take, then the older one tapped */
      byWord(P.tr(P.L.again)).click(); await settle();
      out.i2v.againFilled = q("#vwizIn .wslot.filled").length;
      lastNav().click(); await settle();
      vidGenerate = async function () { await new Promise(r => setTimeout(r, 200)); vidHist.unshift({ url: arg.clip + "?take=2", ref: "data:video/mp4;base64,AAAA", prompt: "p", resolution: "720p", duration: "10", ts: Date.now() }); vidHistSel = 0; };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.i2v.second = { tiles: txt("#vwizTakes .hvt"), sel: txt("#vwizTakes .hvt.sel"), header: ((document.querySelector("#vwizIn .wiz-takes-h") || {}).textContent || ""), meta: ((document.querySelector("#vwizIn .wiz-meta") || {}).textContent || "") };
      q("#vwizTakes .hvt")[1].click(); await settle();
      out.i2v.tap = { note: ((document.getElementById("vwizNoInline") || {}).textContent || ""), want: t("vid_no_inline").replace("{n}", "2"), sel: txt("#vwizTakes .hvt.sel"), pageSel: vidHistSel, meta: ((document.querySelector("#vwizIn .wiz-meta") || {}).textContent || "") };
      window.__opened = null; document.getElementById("vwizOpenLink").click(); await settle();
      out.i2v.tap.opened = window.__opened;
      document.querySelector("#vwizIn .wiz-x").click(); await settle();
      out.closed = { gone: !sheet(), sibsBack: sibs().map(c => c.style.display), pageOn: /\bon\b/.test(document.getElementById("pageVideo").className) };

      /* video → video: the recorded take, the saved file, the folder, the page's result box */
      switchPage("v2v"); await settle();
      q("#vtWfRow .wfmini")[0].click(); await settle();
      const sh2 = sheet();
      out.v2vOpen = { inPage: !!(sh2 && sh2.parentNode && sh2.parentNode.id === "pageV2V"), boxHidden: document.getElementById("vtResultBox").style.display === "none" };
      document.querySelector("#vwizIn .wiz-nav .btn-gold").click(); await settle();
      VT.video = { name: "clip.mp4", _url: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", _size: "12 B" };
      VT.img = { mime: "image/png", b64: arg.px, _url: "data:image/png;base64," + arg.px };
      VT.out = { name: "Renders", nativePath: "/tmp/Renders" };
      renderVt(); await settle();
      lastNav().click(); await settle();
      vtRun = async function () { await new Promise(r => setTimeout(r, 200));
        vtHist.unshift({ url: arg.clip, ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", name: "hnk-videotool-1.mp4", folder: VT.out.name, folderPath: VT.out.nativePath, tool: "Tool X", ts: Date.now() });
        vtHistSel = 0; showVtResult(); VT.rows = [{ label: "hnk-videotool-1.mp4", level: "ok", detail: "saved" }]; renderVt(); };
      document.getElementById("vwizGen").click(); await settle();
      await until(() => !vwiz.busy); await settle();
      out.v2v = { onDot: txt("#vwizIn .wiz-dot.on .l"), saved: ((document.getElementById("vwizSaved") || {}).textContent || ""),
        wantSaved: P.tr(P.L.savedTo).replace("{F}", "Renders/hnk-videotool-1.mp4"), fromWord: ((document.querySelector("#vwizIn .wiz-from .nm") || {}).textContent || ""),
        meta: ((document.querySelector("#vwizIn .wiz-meta") || {}).textContent || ""), folderBtn: !!document.getElementById("vwizOpenFolder"), navBtns: q("#vwizIn .wiz-nav .btn").length,
        note: ((document.getElementById("vwizNoInline") || {}).textContent || ""), tiles: txt("#vwizTakes .hvt"),
        page: { on: /\bon\b/.test(document.getElementById("vtResultBox").className), tiles: txt("#vtHist .hvt"), saved: document.getElementById("vtSavedLine").textContent,
          note: document.getElementById("vtNoInline").style.display !== "none", videoHidden: document.getElementById("vtResultVideo").style.display === "none",
          h2: document.getElementById("vtResultH2").textContent, openWord: document.getElementById("btnVtOpen").textContent.trim(), clear: document.getElementById("vtHistClear").style.display !== "none" } };
      const ux = require("uxp"); ux.shell.openPath = function (p) { window.__folder = p; return Promise.resolve(); };
      document.getElementById("vwizOpenFolder").click(); await settle();
      out.v2v.folderOpened = window.__folder;
      document.querySelector("#vwizIn .wiz-x").click(); await settle();
      out.v2vClosed = { gone: !sheet(), boxShown: document.getElementById("vtResultBox").style.display !== "none", boxOn: /\bon\b/.test(document.getElementById("vtResultBox").className) };
      /* the page's strip: ✕ removes the take, the box goes quiet */
      document.querySelector("#vtHist .hx").click(); await settle();
      out.v2vRemoved = { left: vtHist.length, boxOn: /\bon\b/.test(document.getElementById("vtResultBox").className), tiles: q("#vtHist .hitem").length };
      return out;
    }, { px: PX, clip: "http://127.0.0.1:" + port + "/x.mp4" });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  const PI = pan.i2v, PV = pan.v2v;
  report("C1) panel · no sheet before a tap; the tap renders the wizard INSIDE #pageVideo as its first child, not position:fixed, with the page's own cards hidden and the page still on",
    pan.videoOk === false && pan.beforeOpen && pan.open.inPage && pan.open.first && pan.open.position !== "fixed" && pan.open.sibsHidden && pan.open.sibCount > 2 && pan.open.pageOn, pan.open);
  report("C2) panel · image→video Result with no player: no <video>, the vid_no_inline line for clip 1, one \"MP4 1\" tile marked, the From chip with the photo, the meta line (1080p · 5s), six ways on incl. the direct link and the two Send buttons",
    PI.onDot.join() === "Result" && !PI.video && PI.note === PI.want && PI.tiles.join() === "MP4 1" && PI.sel.join() === "MP4 1" && PI.fromThumb && PI.fromWord === P_TR(D, "from") &&
    /1080p/.test(PI.meta) && /5s/.test(PI.meta) && PI.navBtns === 6 /* 6.165.0 — + the two Send buttons */ && PI.link, PI);
  report("C3) panel · the direct link goes through openUrl (the system browser); Make another keeps the photo; the second take is tile 2 of 2 under the takes heading; tapping tile 2 says clip 2, moves the page's selection to it, and the link follows",
    PI.opened === "http://127.0.0.1:" + port + "/x.mp4?take=2".replace("?take=2", "") && PI.againFilled === 1 && PI.second.tiles.join() === "MP4 1,MP4 2" && PI.second.sel.join() === "MP4 1" &&
    PI.second.header === P_TR(D, "takes") && /720p/.test(PI.second.meta) && PI.tap.note === PI.tap.want && PI.tap.sel.join() === "MP4 2" && PI.tap.pageSel === 1 &&
    /1080p/.test(PI.tap.meta) && PI.tap.opened === "http://127.0.0.1:" + port + "/x.mp4", { opened: PI.opened, again: PI.againFilled, second: PI.second, tap: PI.tap });
  report("C4) panel · Close removes the sheet and puts the page's cards back exactly as they were",
    pan.closed.gone && JSON.stringify(pan.closed.sibsBack) === JSON.stringify(pan.sibsBefore) && pan.closed.pageOn, pan.closed);
  report("C5) panel · video→video Result: the wizard sits in #pageV2V, the take vtRun recorded is named as Renders/hnk-videotool-1.mp4, the From chip names the clip, the tool is on the meta line, seven ways on incl. Open the folder and the two Send buttons (shell.openPath gets the folder's path), and the page's result box is on behind it with its tile, saved line, no-player line, the app's heading and link words, Clear shown",
    pan.v2vOpen.inPage && pan.v2vOpen.boxHidden && PV.onDot.join() === "Result" && PV.saved === PV.wantSaved && PV.fromWord.indexOf(P_TR(D, "fromClip")) === 0 && /clip\.mp4$/.test(PV.fromWord) &&
    /Tool X/.test(PV.meta) && PV.folderBtn && PV.navBtns === 7 /* 6.165.0 */ && PV.note.length > 10 && PV.tiles.join() === "MP4 1" && PV.folderOpened === "/tmp/Renders" &&
    PV.page.on && PV.page.tiles.join() === "MP4 1" && /Renders\/hnk-videotool-1\.mp4/.test(PV.page.saved) && PV.page.note && PV.page.videoHidden &&
    PV.page.h2 === "ရလဒ် (ဗီဒီယို)" && PV.page.openWord === "Direct Link ဖွင့်မယ်" && PV.page.clear, { open: pan.v2vOpen, v2v: PV });
  report("C6) panel · Close shows the page's result box (still on); ✕ on its strip removes the take and the box goes quiet",
    pan.v2vClosed.gone && pan.v2vClosed.boxShown && pan.v2vClosed.boxOn && pan.v2vRemoved.left === 0 && !pan.v2vRemoved.boxOn && pan.v2vRemoved.tiles === 0, { closed: pan.v2vClosed, removed: pan.v2vRemoved });
  report("C7) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — the video wizard's Result step is a real result on both surfaces, and it renders where Photoshop can show it.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });

/* the panel speaks Burmese in this harness (verify_video_wizard D2); the app's block is the source of the word */
function P_TR(D, k) { return D.L[k].my; }
