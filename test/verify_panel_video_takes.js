/* verify_panel_video_takes.js — 6.86.0 / panel 6.157.0
   TALKING PHOTO AND VIDEO UPSCALE GET THEIR RESULT BOXES; THE GUIDE BOX
   JOINS THE PAGE; SELF-TEST SAYS WHETHER VIDEO PLAYS.

   The 6.85.0 review of the panel's own code found three more things a
   student in Photoshop would hit:

     1. tkRun (Talking Photo) and vuRun (Video Upscale) ended exactly where
        V→V did before 6.85.0 — one status row, "hnk-….mp4 · saved", and no
        result box, no strip, no way to open or re-save the clip, while the
        web app has both boxes. mkTakes(pre) now gives each page the app's
        box from its ids alone: player where <video> decodes, the numbered
        tile and vid_no_inline where it does not, the saved-file line,
        Download again, the direct link where the app has one, Open the
        folder, a strip with ✕ per take, Clear. V→V's box gains Open the
        folder for the same reason.
     2. #guideBox (Learn Mode's yellow guide) was the panel's LAST
        position:fixed element — Photoshop lays a fixed box out as an
        ordinary block at the end of the document, so the guide appeared a
        screen below the tapped button, if at all. A dialog is the wrong
        shape (the three-tap cycle needs the same button tappable again), so
        guidePlace moves it into the flow right above the tapped button's
        card; disarm() hides it.
     3. SELF-TEST gets a "Video player" row: ok where <video> decodes, the
        host level where it does not, naming what plays the clip instead.

   Fault-injected while writing: tkTakes.record removed fails A1/B1; the
   .gbox fixed rule restored fails A3/B3; the SELF-TEST row removed fails
   A4/B4. Usage: PORT=8931 node test/verify_panel_video_takes.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");

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
const dictLine = (src, dict, key) => {
  const blk = (src.match(new RegExp("const " + dict + " = \\{[\\s\\S]*?\\n\\};")) || [""])[0];
  return (blk.match(new RegExp("\\n  " + key + ": \\{[^\\n]*")) || [""])[0];
};
const nineLangs = (line) => !!line && LANGS.every(l => new RegExp("[{,]" + l + ':"').test(line));

(async () => {
  /* ---------------- A. source pins ---------------- */
  report("A1) mkTakes(pre, L, page) builds a page's result box from its ids (player where VIDEO_OK, the tile + vid_no_inline where not, the saved line, Download again, the direct link, Open the folder, ✕ per take, Clear), keeps twelve takes and hands every one to the takes store; tkRun and vuRun record every take; both boxes and controls are in the page and bound; V→V gains Open the folder",
    /function mkTakes\(pre, L, page\)/.test(MAIN) && /const tkTakes = mkTakes\("tk", TK_L, "talk"\);/.test(MAIN) && /const vuTakes = mkTakes\("vu", VU_L, "upscale"\);/.test(MAIN) &&
    /T\.record = function \(e\) \{ T\.list\.unshift\(e\); while \(T\.list\.length > 12\) T\.list\.pop\(\); T\.sel = 0; try \{ T\.show\(\); \} catch \(x\) \{ \} takesRecordP\(page, e\); \};/.test(MAIN) &&
    /if \(VIDEO_OK && out\.url\) \{ vid\.style\.display = ""; vid\.src = out\.url; \} else \{ vid\.style\.display = "none"; clearSrc\(vid\); \}/.test(MAIN) &&
    /note\.textContent = t\("vid_no_inline"\)\.replace\("\{n\}", String\(T\.sel \+ 1\)\)/.test(MAIN) &&
    /tkTakes\.record\(\{ url: res\.results\[0\]\.url \|\| "", ref: res\.results\[0\]\.ref, name: name, folder: TK\.out\.name \|\| "", folderPath: TK\.out\.nativePath \|\| "",/.test(MAIN) &&
    /vuTakes\.record\(\{ url: res\.results\[0\]\.url \|\| "", ref: res\.results\[0\]\.ref, name: name, folder: VU\.out\.name \|\| "", folderPath: VU\.out\.nativePath \|\| "",/.test(MAIN) &&
    /tkTakes\.bind\(\);/.test(MAIN) && /vuTakes\.bind\(\);/.test(MAIN) && /try \{ tkTakes\.labels\(\); vuTakes\.labels\(\); \} catch \(e\) \{ \}/.test(MAIN) &&
    ["tkResultBox", "tkResultVideo", "tkNoInline", "tkSavedLine", "btnTkDl", "btnTkFolder", "tkHistH", "tkHist", "tkHistClear",
     "vuResultBox", "vuResultVideo", "vuNoInline", "vuSavedLine", "btnVuDl", "btnVuOpen", "btnVuFolder", "vuHistH", "vuHist", "vuHistClear", "btnVtFolder"].every(id => PHTML.indexOf('id="' + id + '"') >= 0) &&
    PHTML.indexOf('id="btnTkOpen"') < 0 /* the app's Talk box has no direct link — nothing extra */ &&
    /const vtf = \$\("btnVtFolder"\); if \(vtf\) vtf\.addEventListener\("click"/.test(MAIN), null);

  report("A2) the boxes speak the app's own words in nine languages — Talk: Result · Earlier takes; Upscale: Result (video) · Recently upscaled videos · Open direct link; and Open the folder on VT_L",
    nineLangs(dictLine(MAIN, "TK_L", "resultH2")) && nineLangs(dictLine(MAIN, "TK_L", "histH")) &&
    nineLangs(dictLine(MAIN, "VU_L", "resultH2")) && nineLangs(dictLine(MAIN, "VU_L", "histH")) && nineLangs(dictLine(MAIN, "VU_L", "openLink")) &&
    nineLangs(dictLine(MAIN, "VT_L", "openFolder")) &&
    /en:"Result"/.test(dictLine(MAIN, "TK_L", "resultH2")) && /en:"Earlier takes"/.test(dictLine(MAIN, "TK_L", "histH")) &&
    /en:"Recently upscaled videos \(this session only\)"/.test(dictLine(MAIN, "VU_L", "histH")) && /en:"Open direct link"/.test(dictLine(MAIN, "VU_L", "openLink")) &&
    APP.indexOf('en:"Earlier takes"') > 0 && APP.indexOf('en:"Recently upscaled videos (this session only)"') > 0, null);

  const CSS_RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");   /* the rules only — the comments explain what was removed */
  report("A3) no position:fixed rule survives anywhere in styles.css — and (6.170.0) the Learn-Mode guide box that was the last one is gone with the three-tap cycle: no .gbox rule, no #guideBox in the markup, and no guidePlace / showGuide / showPromptStage / disarm / armGate in main.js",
    !/position:\s*fixed/.test(CSS_RULES) && !/\.gbox/.test(CSS_RULES) && read("panel/index.html").indexOf("guideBox") < 0 &&
    !/function guidePlace|function showGuide|function showPromptStage|function disarm|function armGate/.test(MAIN) &&
    /v6\.170\.0 — the Learn-Mode guide box \(\.gbox\)/.test(CSS), { gbox: (CSS.match(/\.gbox[^\n]*/) || [""])[0] });

  report("A4) SELF-TEST carries a \"Video player\" row — ok where <video> decodes, the host level where it does not, naming Download / Open Direct Link / Open the folder as what plays the clip",
    /rows\.push\(\{ label: "Video player",\n\s*detail: VIDEO_OK \? "plays MP4 inline" : "no inline player \\u2014 Download \/ Open Direct Link \/ Open the folder play the clip",\n\s*level: VIDEO_OK \? "ok" : "host" \}\);/.test(MAIN), null);

  const wn = WN.appRow("6.86.0", "pgTalk");
  const wnP = WN.panelRow("6.86.0", "pgTalk");
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A5) CI runs this test right after verify_panel_video_wizard_result; the landing counts at least 221 tests; What's New carries the 6.86.0 Talk row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_panel_video_takes.js") > CI.indexOf("node test/verify_panel_video_wizard_result.js") && tests >= 221 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  /* ---------------- B. the panel, on a renderer that cannot play video (Photoshop) ---------------- */
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
      const shown = id => { const e = document.getElementById(id); return !!e && e.style.display !== "none"; };
      const on = id => /\bon\b/.test((document.getElementById(id) || {}).className || "");
      out.videoOk = VIDEO_OK;
      state.rhKey = state.rhKey || "TEST_RH_KEY";
      const V = window.HNK.runninghubVideo;
      saveResultFile = async function (folder, name) { window.__saved = (window.__saved || []).concat([name]); return name; };
      const ux = require("uxp"); ux.shell.openPath = function (p) { window.__folder = p; return Promise.resolve(); };
      openUrl = async function (u) { window.__opened = u; };

      /* -- Talking Photo -- */
      switchPage("talk"); await settle();
      TK.img = { name: "face.png", _url: "data:image/png;base64," + arg.px };
      TK.aud = { name: "voice.mp3", _url: "data:audio/mpeg;base64,AAAA" };
      TK.out = { name: "Renders", nativePath: "/tmp/Renders" };
      renderTk(); await settle();
      V.runTalk = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", url: arg.clip }], usage: {} }; };
      document.getElementById("btnTkGen").click(); await settle();
      await until(() => !TK.busy); await settle();
      out.tk = { boxOn: on("tkResultBox"), tiles: txt("#tkHist .hvt"), sel: txt("#tkHist .hvt.sel"), saved: document.getElementById("tkSavedLine").textContent,
        note: document.getElementById("tkNoInline").textContent, want: t("vid_no_inline").replace("{n}", "1"), noteShown: shown("tkNoInline"),
        videoHidden: document.getElementById("tkResultVideo").style.display === "none", folderBtn: shown("btnTkFolder"), folderWord: document.getElementById("btnTkFolder").textContent.trim(),
        openBtn: !!document.getElementById("btnTkOpen"), h2: document.getElementById("tkResultH2").textContent, histH: document.getElementById("tkHistH").textContent,
        dlWord: document.getElementById("btnTkDl").textContent.trim(), row: TK.rows[0] && TK.rows[0].detail, clear: shown("tkHistClear"), written: window.__saved };
      document.getElementById("btnTkFolder").click(); await settle();
      out.tk.folderOpened = window.__folder;
      /* a second take, the older one tapped, ✕, Clear */
      document.getElementById("btnTkGen").click(); await settle();
      await until(() => !TK.busy); await settle();
      out.tk.second = { tiles: txt("#tkHist .hvt"), sel: txt("#tkHist .hvt.sel"), n: tkTakes.list.length };
      q("#tkHist .hvt")[1].click(); await settle();
      out.tk.tap = { sel: txt("#tkHist .hvt.sel"), note: document.getElementById("tkNoInline").textContent, want: t("vid_no_inline").replace("{n}", "2") };
      document.querySelector("#tkHist .hx").click(); await settle();
      out.tk.removed = { n: tkTakes.list.length, tiles: txt("#tkHist .hvt"), boxOn: on("tkResultBox") };
      document.getElementById("tkHistClear").click(); await settle();
      out.tk.cleared = { n: tkTakes.list.length, boxOn: on("tkResultBox"), clear: shown("tkHistClear") };

      /* -- Video Upscale -- */
      switchPage("vidup"); await settle();
      VU.video = { name: "clip.mp4" };
      VU.out = { name: "Renders", nativePath: "/tmp/Renders" };
      fileToDataUrl = async function () { return "data:video/mp4;base64,AAAAHGZ0eXBpc29t"; };
      renderVu(); await settle();
      V.upscale = async function () { await new Promise(r => setTimeout(r, 120)); return { ok: true, results: [{ ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", url: arg.clip + "?up" }], usage: {} }; };
      document.getElementById("btnVuRun").click(); await settle();
      await until(() => !VU.busy); await settle();
      out.vu = { boxOn: on("vuResultBox"), tiles: txt("#vuHist .hvt"), saved: document.getElementById("vuSavedLine").textContent, noteShown: shown("vuNoInline"),
        openBtn: shown("btnVuOpen"), openWord: document.getElementById("btnVuOpen").textContent.trim(), folderBtn: shown("btnVuFolder"),
        h2: document.getElementById("vuResultH2").textContent, histH: document.getElementById("vuHistH").textContent, row: VU.rows[0] && VU.rows[0].detail,
        entry: vuTakes.list[0] && { url: vuTakes.list[0].url, tool: vuTakes.list[0].tool, name: vuTakes.list[0].name } };
      window.__opened = null; document.getElementById("btnVuOpen").click(); await settle();
      out.vu.opened = window.__opened;
      window.__folder = null; document.getElementById("btnVuFolder").click(); await settle();
      out.vu.folderOpened = window.__folder;

      /* -- v6.170.0: no guide box, and a run button is not gated -- */
      switchPage("prompt"); await settle();
      out.guide = { box: !!document.getElementById("guideBox"), armGate: typeof armGate, learnMode: typeof state.learnMode };
      const g0 = document.getElementById("btnGenerate");
      let ranFF = 0; const keepRG = runGenerate;
      runGenerate = function () { ranFF++; return Promise.resolve(); };
      if (g0) { g0.click(); await settle(); }
      runGenerate = keepRG;
      out.guide.ranOnFirstTap = ranFF;

      /* -- SELF-TEST: the Video player row -- */
      switchPage("setup"); await settle();
      document.getElementById("btnSelfTest").click(); await settle();
      await until(() => txt("#selfTestRows .diag-nm").indexOf("Video player") >= 0); await settle();
      const rows = [...q("#selfTestRows .diagrow")];
      const vr = rows.find(r => (r.querySelector(".diag-nm") || {}).textContent === "Video player");
      out.selftest = { present: !!vr, level: vr ? vr.querySelector(".diag-ic").className : "", detail: vr ? vr.querySelector(".diag-st").textContent : "" };
      return out;
    }, { px: PX, clip: "http://127.0.0.1:" + port + "/x.mp4" });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  const TKR = pan.tk, VUR = pan.vu, G = pan.guide;
  report("B1) panel · Talking Photo: the run records the take and the result box comes on — \"MP4 1\" tile marked, the clip-1 line (no player, video hidden), the saved line naming Renders/hnk-talking-photo-….mp4, Open the folder (no direct link — the app's Talk box has none), the app's heading and strip words, Clear shown, the status row still says saved, Open the folder → shell.openPath(/tmp/Renders)",
    pan.videoOk === false && TKR.boxOn && TKR.tiles.join() === "MP4 1" && TKR.sel.join() === "MP4 1" && /Renders\/hnk-talking-photo-\d+\.mp4/.test(TKR.saved) && TKR.note === TKR.want && TKR.noteShown &&
    TKR.videoHidden && TKR.folderBtn && TKR.folderWord === "Folder ဖွင့်မယ်" && !TKR.openBtn && TKR.h2 === "ရလဒ်" && TKR.histH === "အရင် လုပ်ထားတာတွေ" && TKR.dlWord.length > 0 &&
    TKR.row === "saved" && TKR.clear && Array.isArray(TKR.written) && TKR.written.length === 1 && TKR.folderOpened === "/tmp/Renders", TKR);
  report("B2) panel · Talking Photo: a second take is tile 1 of 2, tapping tile 2 says clip 2, ✕ removes it, Clear empties the box",
    TKR.second.tiles.join() === "MP4 1,MP4 2" && TKR.second.sel.join() === "MP4 1" && TKR.second.n === 2 && TKR.tap.sel.join() === "MP4 2" && TKR.tap.note === TKR.tap.want &&
    TKR.removed.n === 1 && TKR.removed.tiles.join() === "MP4 1" && TKR.removed.boxOn && TKR.cleared.n === 0 && !TKR.cleared.boxOn && !TKR.cleared.clear, { second: TKR.second, tap: TKR.tap, removed: TKR.removed, cleared: TKR.cleared });
  report("B3) panel · Video Upscale: the run records the take (url · Video Upscale · hnk-upscaled-…), the box comes on with its tile, saved line, no-player line, the app's heading and strip words, Open direct link → openUrl, Open the folder → shell.openPath",
    VUR.boxOn && VUR.tiles.join() === "MP4 1" && /Renders\/hnk-upscaled-\d+\.mp4/.test(VUR.saved) && VUR.noteShown && VUR.openBtn && VUR.openWord === "Direct Link ဖွင့်" && VUR.folderBtn &&
    VUR.h2 === "ရလဒ် (ဗီဒီယို)" && VUR.histH.length > 5 && VUR.row === "saved" && VUR.entry && /\?up$/.test(VUR.entry.url) && VUR.entry.tool === "Video Upscale" && /^hnk-upscaled-/.test(VUR.entry.name) &&
    /\?up$/.test(String(VUR.opened)) && VUR.folderOpened === "/tmp/Renders", VUR);
  report("B4) panel · the three-tap gate is gone: no #guideBox in the document, no armGate and no state.learnMode, and Freeform's GENERATE runs on the FIRST tap",
    G.box === false && G.armGate === "undefined" && G.learnMode === "undefined" && G.ranOnFirstTap === 1, G);
  report("B5) panel · SELF-TEST shows the \"Video player\" row at the host level here (no player), naming Download / Open Direct Link / Open the folder",
    pan.selftest.present && /\bhost\b/.test(pan.selftest.level) && /no inline player/.test(pan.selftest.detail) && /Open the folder/.test(pan.selftest.detail), pan.selftest);
  report("B6) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — every page that writes a clip now shows it, the three-tap gate is gone, and SELF-TEST says whether video plays.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
