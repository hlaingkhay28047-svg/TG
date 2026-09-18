/* verify_clip_handoff_694.js — 6.94.0 / panel 6.165.0
   ONE TAP TO THE NEXT TOOL, THE SAVE FOLDER ROW, AND THE PUBLISH LEDGER (B6–B8).

     1. THE HAND-OFF. A finished clip used to leave the studio the long way round: Download, find the
        file, open Video Upscale or Video Tools, Pick, find the file again. Every video result box —
        Video · Video Upscale · Video Tools · Talking Photo — and the video wizard's Result step now carry
        "Send to Upscale" and "Send to Video Tools". One tap: the clip's bytes (the saved copy, or the live
        link fetched once) become that page's picked file exactly as the picker would set them (the app's
        state.vuFile / state.vtFile with the same follow-up calls; the panel's VU.video / VT.video in the
        {name, _url} shape vtRun already read and vuRun now reads), and the page opens. The Upscale box
        offers only Video Tools (an upscale of an upscale is not a step); Talking Photo takes a photo and a
        voice, so nothing is sent TO it — its results are sent on. A clip that cannot be fetched leaves
        the target untouched and says so (sendFail). The words are one lifted pack (VWIZ_L) on both surfaces.
     2. SAVE FOLDER. The panel's SELF-TEST asks the host for the data folder, writes a one-line probe file,
        reads it back and deletes it — path · writable · saved takes · ms — or prints the exact refusal.
        A folder with no native path (a browser walk, a shim) is reported as such and NEVER written to.
     3. THE LEDGER. PANEL_RELEASE_SECURITY.md carries one honest line per panel release, written by
        tools/acceptance_record.js from the release manifest; the tool refuses "accepted" without evidence
        and --check refuses a manifest version without its line (run by verify_release_contract).

   Fault-injected while writing: vidSendPaint("vid") removed fails B1 (no chips); the vuFile assignment
   removed fails B2; the panel's vuRun `VU.video._url ||` removed fails A3; the nativePath guard removed
   fails C4 (the stub's settings file is written); the ledger line for the manifest version removed fails D2.
   Usage: PORT=8931 node test/verify_clip_handoff_694.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const PMAIN = read("panel/main.js");
const PHTML = read("panel/index.html");
const PCSS = read("panel/styles.css");
const PVW = read("panel/js/hnk_video_wizard.js");
const PWN = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const SEC = read("PANEL_RELEASE_SECURITY.md");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
/* a 12-byte MP4 head — enough to be a Blob with a type, never decoded */
const CLIP_B64 = "AAAAHGZ0eXBpc29t";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
const keyLine = (src, key) => { const a = src.indexOf("VWIZ_L={"), b = src.indexOf("\n};", a); const blk = a < 0 || b < 0 ? "" : src.slice(a, b); return (blk.match(new RegExp("\\n  " + key + ":\\{[^\\n]*")) || [""])[0]; };
const nineLangs = (line) => !!line && LANGS.every(l => new RegExp("[{,]" + l + ':"').test(line));

/* ================= A) the source ================= */
function sourcePins() {
  const keys = ["sendUp", "sendV2v", "sendBusy", "sentTo", "sendFail"];
  const appLines = keys.map(k => keyLine(APP, k));
  report("A1) VWIZ_L carries sendUp · sendV2v · sendBusy · sentTo ({P}) · sendFail in nine languages, English \"Send to Upscale\" / \"Send to Video Tools\", and the panel's lifted pack (hnk_video_wizard.js) has every line verbatim",
    appLines.every(nineLangs) && /en:"Send to Upscale"/.test(appLines[0]) && /en:"Send to Video Tools"/.test(appLines[1]) && /\{P\}/.test(appLines[3]) &&
    appLines.every(l => PVW.indexOf(l.trim()) > 0), appLines.map(l => l.slice(0, 40)));

  report("A2) the app: VID_SEND_TARGETS (up → pgVideoUp, v2v → pgV2V), four boxes (vid up+v2v · vu v2v only · vt up+v2v · tk up+v2v), vidSendBytes (blob or a fetchWithTimeout of the link, 200MB ceiling, data URL), vidSendTo mirrors the pickers (vuFile + vuFileName + vuPreview + updateVuNeedNote; vtFile + updateVtModelUI + renderVtPicks + vtWfCheckClip + wipSave), switches the page and toasts sentTo / sendFail; painted after every histStripClearSync and in the wizard's Result step with closeWiz",
    /* 6.95.0 — the two frame targets (talk · img1) joined every box; they are pinned in verify_convenience_695 */
    /var VID_SEND_TARGETS=\{ up:\{ page:"pgVideoUp", key:"sendUp", ic:"i-rocket", name:"Video Upscale" \}, v2v:\{ page:"pgV2V", key:"sendV2v", ic:"i-clapper", name:"Video Tools" \},/.test(APP) &&
    /vid:\{ row:"vidSendRow", from:"video", targets:\["up","v2v","talk","img1"\]/.test(APP) && /vu: \{ row:"vuSendRow",  from:"upscale", targets:\["v2v","talk","img1"\]/.test(APP) &&
    /vt: \{ row:"vtSendRow",  from:"videotool", targets:\["up","v2v","talk","img1"\]/.test(APP) && /tk: \{ row:"tkSendRow",  from:"talk", targets:\["up","v2v","talk","img1"\]/.test(APP) &&
    /var VID_SEND_MAX=200\*1024\*1024;/.test(APP) && /async function vidSendBlob\(out\)\{[\s\S]*?fetchWithTimeout\(out\.url, \{\}, MEDIA_DL_TIMEOUT_MS\)[\s\S]*?if\(blob\.size>VID_SEND_MAX\) throw new Error\("too-large"\);/.test(APP) && /async function vidSendBytes\(out\)\{\n\s*var blob=await vidSendBlob\(out\);/.test(APP) &&
    /state\.vuFile=\{mime:"video\/mp4",b64:b\.b64,name:name\};\n\s*\$\("vuFileName"\)\.textContent=name;\n\s*var pv=\$\("vuPreview"\); pv\.src=b\.dataUrl; pv\.style\.display="";\n\s*updateVuNeedNote\(\);/.test(APP) &&
    /state\.vtFile=\{mime:b\.mime,b64:b\.b64,name:name\}; updateVtModelUI\(\); renderVtPicks\(\); vtWfCheckClip\(\); wipSave\(\);/.test(APP) &&
    /if\(closeWiz\)\{ try\{ closeVWiz\(\); \}catch\(eW\)\{\} \}\n\s*switchPage\(T\.page\);\n\s*toast\(vwizL\("sentTo"\)\.replace\("\{P\}", T\.name\), "ok"\);/.test(APP) &&
    /\}catch\(e\)\{ toast\(vwizL\("sendFail"\), "err"\); return false; \}/.test(APP) &&
    ["vid", "vu", "vt", "tk"].every(k => new RegExp('histStripClearSync\\("' + k + 'Hist"\\);\\n\\s*vidSendPaint\\("' + k + '"\\);').test(APP)) &&
    /sendRow\.id="vwizSendRow";\n\s*vidSendChips\(sendRow, function\(\)\{ return cur; \}, vwiz\.kind==="i2v"\?"video":"videotool", \["up","v2v","talk","img1"\], true\);/.test(APP) &&
    ["vidSendRow", "vuSendRow", "vtSendRow", "tkSendRow"].every(id => APP.indexOf('<div class="row vid-send" id="' + id + '"></div>') > 0) &&
    /\.vid-send:empty\{display:none\}/.test(APP), null);

  report("A3) the panel: vidSendTo takes the take's bytes through takesRefP into the {name, _url, _size} clip the pickers leave, VU.video → renderVu / VT.video → renderVt, closes the wizard when asked, switches to vidup / v2v and sets sentTo / sendFail; seven static buttons (Upscale box: Video Tools only) bound once and painted from the lifted pack in vidPaintLabels · vuPaintLabels · tkPaintLabels; vuRun reads VU.video._url before fileToDataUrl; the wizard's Result draws vwizSendUp / vwizSendV2v with closeWiz; styles.css lays the row out with flex + margins (no gap)",
    /const VID_SEND_PAGE = \{ up: "vidup", v2v: "v2v", talk: "talk", img1: "prompt" \};/.test(PMAIN) && /const VID_SEND_NAME = \{ up: "Video Upscale", v2v: "Video Tools", talk: "Talking Photo", img1: "IMAGE 1" \};/.test(PMAIN) &&
    /async function vidSendTo\(target, out, from, closeWiz\) \{[\s\S]*?const ref = await takesRefP\(out\);[\s\S]*?const clip = \{ name: "hnk-" \+ \(from \|\| "clip"\) \+ "-" \+ Date\.now\(\) \+ "\.mp4", _url: ref,/.test(PMAIN) &&
    /if \(target === "up"\) \{ VU\.video = clip; try \{ renderVu\(\); \} catch \(e\) \{ \} \}\n\s*else \{ VT\.video = clip; try \{ renderVt\(\); \} catch \(e\) \{ \} \}\n\s*if \(closeWiz\) \{ try \{ closeVWiz\(\); \} catch \(e\) \{ \} \}\n\s*switchPage\(VID_SEND_PAGE\[target\]\);\n\s*setStatus\(vwizL\("sentTo"\)\.replace\("\{P\}", VID_SEND_NAME\[target\]\), "ok"\);/.test(PMAIN) &&
    /\} catch \(e\) \{ setStatus\(vwizL\("sendFail"\), "err"\); return false; \}/.test(PMAIN) &&
    ["btnVidSendUp", "btnVidSendV2v", "btnVtSendUp", "btnVtSendV2v", "btnTkSendUp", "btnTkSendV2v", "btnVuSendV2v"].every(id => new RegExp('\\["' + id + '", "(up|v2v)", "(video|videotool|talk|upscale)", function').test(PMAIN) && PHTML.indexOf('id="' + id + '"') > 0) &&
    PHTML.indexOf('id="btnVuSendUp"') < 0 && (PMAIN.match(/vidSendBindP\(\);/g) || []).length >= 3 && /let vidSendBound = false;\nfunction vidSendBindP\(\) \{\n  if \(vidSendBound\) return; vidSendBound = true;/.test(PMAIN) &&
    (PMAIN.match(/try \{ vidSendPaintP\(\); \} catch \(e\) \{ \}/g) || []).length === 3 &&
    /setIcnText\(b, VID_SEND_ICON\[row\[1\]\], "cream", vwizL\(VID_SEND_KEY\[row\[1\]\]\)\);/.test(PMAIN) && /const VID_SEND_ICON = \{ up: "i-rocket", v2v: "i-clapper", talk: "i-frame", img1: "i-restore" \};/.test(PMAIN) && /const VID_SEND_KEY = \{ up: "sendUp", v2v: "sendV2v", talk: "grabTalk", img1: "grabImg1" \};/.test(PMAIN) &&
    /const ref = VU\.video\._url \|\| await fileToDataUrl\(VU\.video\);/.test(PMAIN) &&
    /sendRow\.id = "vwizSendRow";\n\s*\[\["vwizSendUp", "up", "i-rocket", "sendUp"\], \["vwizSendV2v", "v2v", "i-clapper", "sendV2v"\], \["vwizSendTalk", "talk", "i-frame", "grabTalk"\], \["vwizSendImg1", "img1", "i-restore", "grabImg1"\]\]/.test(PMAIN) &&
    /ffPressable\(sb, function \(\) \{ vidSendTo\(r\[1\], cur, vwiz\.kind === "i2v" \? "video" : "videotool", true\); \}\);/.test(PMAIN) &&
    ["vidSendRow", "vtSendRow", "tkSendRow", "vuSendRow"].every(id => new RegExp('<div class="arow vid-send" id="' + id + '">').test(PHTML)) &&
    /\.vid-send \{ display: flex; flex-direction: row; flex-wrap: wrap; margin-top: 8px; \}\n\.vid-send > div \{ flex: 1 1 auto; min-height: 38px; font-size: 11\.5px; padding: 8px 12px; margin: 0 6px 6px 0; \}/.test(PCSS) &&
    !/\.vid-send[^\n]*\bgap:/.test(PCSS), null);

  report("A4) the panel's SELF-TEST Save folder row: hnkSaveProbeStart asks HNK.__uxpForTests || require(\"uxp\") for the data folder, counts the takes store, refuses to write when the folder has no nativePath (level host), otherwise writes hnk-selftest-<ts>.txt, reads \"hnk\" back and deletes it (ok · path · writable · takes · ms, err with the refusal); throttled 60 s, forced by Run again, started on Setup open; the row sits right after Layer capture",
    /let saveProbe = \{ state: "idle", at: 0, res: null \};\nfunction hnkSaveProbeStart\(force\) \{/.test(PMAIN) &&
    /if \(!force && saveProbe\.state === "done" && now - saveProbe\.at < 60000\) return;/.test(PMAIN) &&
    /uxp = \(globalThis\.HNK && globalThis\.HNK\.__uxpForTests\) \|\| require\("uxp"\);/.test(PMAIN) &&
    /const folder = await lfs\.getDataFolder\(\);/.test(PMAIN) &&
    /if \(!folder\.nativePath\) return \{ level: "host", detail: \(path \|\| "data folder"\) \+ " \\u00b7 no native path \\u2014 not written to \\u00b7 " \+ takes \+ " saved take" \+ \(takes === 1 \? "" : "s"\) \};/.test(PMAIN) &&
    /const name = "hnk-selftest-" \+ Date\.now\(\) \+ "\.txt";\n\s*const f = await folder\.createFile\(name, \{ overwrite: true \}\);\n\s*await f\.write\("hnk", \{ format: uxp\.storage\.formats\.utf8 \}\);\n\s*const back = await f\.read\(\{ format: uxp\.storage\.formats\.utf8 \}\);\n\s*try \{ if \(typeof f\.delete === "function"\) await f\.delete\(\); \} catch \(e\) \{ \}/.test(PMAIN) &&
    /return \{ level: "ok", detail: path \+ " \\u00b7 writable \\u00b7 " \+ takes \+ " saved take" \+ \(takes === 1 \? "" : "s"\) \+ " \\u00b7 " \+ \(Date\.now\(\) - t0\) \+ "ms" \};/.test(PMAIN) &&
    /function hnkSaveProbeRow\(\) \{\n  if \(saveProbe\.state === "idle"\) return \{ label: "Save folder", detail: "\\u2014", level: "pend" \};/.test(PMAIN) &&
    /rows\.push\(hnkSaveProbeRow\(\)\);/.test(PMAIN) && PMAIN.indexOf("rows.push(hnkSaveProbeRow());") > PMAIN.indexOf("rows.push(hnkLayerProbeRow());") &&
    /hnkLayerProbeStart\(false\); hnkSaveProbeStart\(false\);( hnkPlaceProbeStart\(false\);)? renderSelfTest\(\);/.test(PMAIN)  /* 6.171.0 — the Place row starts here too */ && /try \{ hnkSaveProbeStart\(true\); \} catch \(eSv\) \{ \}/.test(PMAIN), null);
}

/* ================= B) the app, on a phone ================= */
async function appWalk(browser) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) { } });
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.indexOf("127.0.0.1") >= 0) return r.continue();
    if (u.indexOf("clip-live.example") >= 0) return r.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from(CLIP_B64, "base64") });
    if (u.indexOf("clip-dead.example") >= 0) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const o = await page.evaluate(async (B64) => {
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 8000) r(); else setTimeout(w, 40); })(); });
      const out = {}, toasts = [];
      const _toast = window.toast; window.toast = function (m, k) { toasts.push([String(m), k || ""]); return _toast.apply(this, arguments); };
      const bytes = Uint8Array.from(atob(B64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "video/mp4" });
      const chips = id => [...document.querySelectorAll("#" + id + " .vid-send-btn")].map(b => [b.getAttribute("data-send"), b.getAttribute("data-from"), b.textContent.trim()]);
      /* Video box: both chips; up → Upscale's picked file */
      switchPage("pgVideo"); await settle();
      state.vidHist = [{ url: "", blob: blob, id: "t1", prompt: "p", ts: Date.now() }]; state.vidHistSel = 0; showVidResult(false); await settle();
      out.vid = { chips: chips("vidSendRow"), display: getComputedStyle(document.getElementById("vidSendRow")).display, words: [vwizL("sendUp"), vwizL("sendV2v")] };
      state.vuFile = null; document.querySelector('#vidSendRow [data-send="up"]').click(); await until(() => !!state.vuFile); await settle();
      out.up = { file: state.vuFile && { mime: state.vuFile.mime, b64: state.vuFile.b64, name: state.vuFile.name }, page: curPage, fileName: document.getElementById("vuFileName").textContent,
        prevShown: document.getElementById("vuPreview").style.display === "", prevSrc: document.getElementById("vuPreview").src.slice(0, 23), toasts: toasts.slice() };
      toasts.length = 0;
      /* v2v → Video Tools' picked file */
      switchPage("pgVideo"); await settle();
      state.vtFile = null; document.querySelector('#vidSendRow [data-send="v2v"]').click(); await until(() => !!state.vtFile); await settle();
      out.v2v = { file: state.vtFile && { mime: state.vtFile.mime, b64: state.vtFile.b64, name: state.vtFile.name }, page: curPage, prevShown: getComputedStyle(document.getElementById("vtFilePrev")).display !== "none",
        fileName: document.getElementById("vtFileName").textContent, toasts: toasts.slice() };
      toasts.length = 0;
      /* Upscale box: Video Tools only; Talk box: both; Video Tools box: both */
      switchPage("pgVideoUp"); await settle();
      state.vuHist = [{ url: "", blob: blob, id: "u1", ts: Date.now() }]; state.vuHistSel = 0; showVuResult(); await settle();
      out.vuChips = chips("vuSendRow");
      switchPage("pgTalk"); await settle();
      state.tkHist = [{ url: "", blob: blob, id: "k1", ts: Date.now() }]; state.tkHistSel = 0; showTkResult(false); await settle();
      out.tkChips = chips("tkSendRow");
      state.vtFile = null; document.querySelector('#tkSendRow [data-send="v2v"]').click(); await until(() => !!state.vtFile); await settle();
      out.tkV2v = { name: state.vtFile && state.vtFile.name, page: curPage };
      /* a link-only take: fetched once through the app's own fetch (routed) */
      switchPage("pgV2V"); await settle();
      state.vtHist = [{ url: "https://clip-live.example/a.mp4", id: "v1", ts: Date.now() }]; state.vtHistSel = 0; showVtResult(false); await settle();
      out.vtChips = chips("vtSendRow");
      state.vuFile = null; toasts.length = 0; document.querySelector('#vtSendRow [data-send="up"]').click(); await until(() => !!state.vuFile); await settle();
      out.linkOnly = { file: state.vuFile && { mime: state.vuFile.mime, b64: state.vuFile.b64 }, page: curPage, toasts: toasts.slice() };
      /* a dead link: sendFail, nothing changed, the page stays */
      switchPage("pgV2V"); await settle();
      state.vtHist = [{ url: "https://clip-dead.example/a.mp4", id: "v2", ts: Date.now() }]; state.vtHistSel = 0; showVtResult(false); await settle();
      const before = JSON.stringify(state.vuFile); toasts.length = 0;
      document.querySelector('#vtSendRow [data-send="up"]').click(); await until(() => toasts.length >= 2); await settle();
      out.dead = { same: JSON.stringify(state.vuFile) === before, page: curPage, toasts: toasts.slice(), want: vwizL("sendFail") };
      /* the wizard's Result step: chips with closeWiz — the wizard closes and the page opens */
      out.wiz = null;
      try {
        const w = (typeof VID_WF !== "undefined" && VID_WF[0]) || null;
        if (w) {
          openVWiz("i2v", w); vwiz.step = 4; vwiz.result = { url: "", blob: blob, id: "w1", ts: Date.now() }; vwiz.sel = 0;
          state.vidHist = [vwiz.result]; state.vidHistSel = 0; renderVWiz(); await settle();
          const row = document.getElementById("vwizSendRow");
          out.wiz = { chips: row ? [...row.querySelectorAll(".vid-send-btn")].map(b => b.getAttribute("data-send")) : null, from: row && row.querySelector(".vid-send-btn") && row.querySelector(".vid-send-btn").getAttribute("data-from") };
          if (row) { state.vuFile = null; toasts.length = 0; row.querySelector('[data-send="up"]').click(); await until(() => !!state.vuFile); await settle();
            out.wiz.after = { page: curPage, wizOpen: /\bon\b/.test(document.getElementById("wiz").className), file: !!state.vuFile }; }
        }
      } catch (e) { out.wizErr = String(e).slice(0, 200); }
      /* the words follow the language */
      /* a language switch reloads the app; the chips are painted from vwizL(LANG) on every showVidResult */
      const lang0 = LANG; LANG = "en"; switchPage("pgVideo"); state.vidHist = [{ url: "", blob: blob, id: "t9", ts: Date.now() }]; state.vidHistSel = 0; showVidResult(false); await settle();
      out.en = document.querySelector('#vidSendRow [data-send="up"]') ? document.querySelector('#vidSendRow [data-send="up"]').textContent.trim() : null;
      LANG = lang0; showVidResult(false); await settle();
      return out;
    }, CLIP_B64);
    const F = o.up.file;
    report("B1) Video box: the two Send chips (Upscale · Video Tools) lead the strip's row, shown, worded from VWIZ_L, followed by the two 6.95.0 Frame chips; the Upscale box offers Video Tools (+ the two Frame chips); Talk and Video Tools boxes offer all four",
      o.vid.chips.length === 4 && o.vid.chips[0][0] === "up" && o.vid.chips[1][0] === "v2v" && o.vid.chips[2][0] === "talk" && o.vid.chips[3][0] === "img1" && o.vid.chips.every(c => c[1] === "video") && o.vid.chips[0][2] === o.vid.words[0] && o.vid.chips[1][2] === o.vid.words[1] && o.vid.display === "flex" &&
      o.vuChips.length === 3 && o.vuChips[0][0] === "v2v" && o.vuChips.every(c => c[1] === "upscale") && o.tkChips.map(c => c[0]).join() === "up,v2v,talk,img1" && o.tkChips.every(c => c[1] === "talk") && o.vtChips.map(c => c[0]).join() === "up,v2v,talk,img1", o);
    report("B2) Send to Upscale: state.vuFile = the clip's bytes (video/mp4, the same base64), #vuFileName names it, #vuPreview shows a data: URL, the page is pgVideoUp, toasts sendBusy then sentTo (Video Upscale)",
      F && F.mime === "video/mp4" && F.b64 === CLIP_B64 && /^hnk-video-\d+\.mp4$/.test(F.name) && o.up.page === "pgVideoUp" && o.up.fileName === F.name && o.up.prevShown && o.up.prevSrc.indexOf("data:video/mp4;base64,") === 0 &&
      o.up.toasts.length === 2 && o.up.toasts[1][1] === "ok" && /Video Upscale/.test(o.up.toasts[1][0]), o.up);
    report("B3) Send to Video Tools: state.vtFile = the bytes, #vtFilePrev shown with the name, page pgV2V, sentTo (Video Tools); a Talk take sends with a hnk-talk name",
      o.v2v.file && o.v2v.file.mime === "video/mp4" && o.v2v.file.b64 === CLIP_B64 && o.v2v.page === "pgV2V" && o.v2v.prevShown && o.v2v.fileName === o.v2v.file.name && /Video Tools/.test(o.v2v.toasts[1] && o.v2v.toasts[1][0]) &&
      /^hnk-talk-\d+\.mp4$/.test(o.tkV2v.name) && o.tkV2v.page === "pgV2V", { v2v: o.v2v, tk: o.tkV2v });
    report("B4) a link-only take is fetched once and sent (the same bytes); a dead link leaves the target untouched, stays on the page and toasts sendFail",
      o.linkOnly.file && o.linkOnly.file.b64 === CLIP_B64 && o.linkOnly.page === "pgVideoUp" && o.dead.same && o.dead.page === "pgV2V" && o.dead.toasts.length === 2 && o.dead.toasts[1][1] === "err" && o.dead.toasts[1][0] === o.dead.want, { link: o.linkOnly, dead: o.dead });
    report("B5) the video wizard's Result step carries all four chips (from video) and a tap closes the wizard and lands on Upscale with the file set; the words follow the language (English: Send to Upscale)",
      o.wiz && o.wiz.chips && o.wiz.chips.join() === "up,v2v,talk,img1" && o.wiz.from === "video" && o.wiz.after && o.wiz.after.page === "pgVideoUp" && !o.wiz.after.wizOpen && o.wiz.after.file && o.en === "Send to Upscale", { wiz: o.wiz, wizErr: o.wizErr, en: o.en });
    report("B6) nothing threw in the app while all of that ran", errs.length === 0, errs);
  } finally { await page.close(); }
}

/* ================= C) the panel, in the harness ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.indexOf("127.0.0.1") >= 0) return r.continue();
    if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(UXP_STUB);
  try {
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached its signed-in state"); });
    const o = await page.evaluate(async (B64) => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 8000) r(); else setTimeout(w, 40); })(); });
      const txt = id => (document.getElementById(id) || { textContent: "" }).textContent.trim();
      const onPage = () => { const p = document.querySelector(".page.on"); return p ? p.id : null; };
      const statuses = []; const _ss = setStatus; setStatus = function (m, k) { statuses.push([String(m), k || ""]); return _ss.apply(this, arguments); };
      const REF = "data:video/mp4;base64," + B64;
      /* the settings file the stub hands back from createFile — it must never be written by the probe */
      const ux = require("uxp"); const stubFolder = await ux.storage.localFileSystem.getDataFolder();
      const stubFile = await stubFolder.createFile("x"); let stubWrites = 0; const _w = stubFile.write; stubFile.write = function (d) { if (d === "hnk") stubWrites++; return _w.apply(this, arguments); };   /* the takes index shares this file; count the probe's own payload only */
      /* Talk take → Video Tools */
      switchPage("talk"); await settle();
      tkTakes.record({ url: "", ref: REF, name: "talk-1.mp4", folder: "", folderPath: "", tool: "talk", ts: Date.now() }); await settle();
      out.tkBtns = { up: txt("btnTkSendUp"), v2v: txt("btnTkSendV2v"), words: [vwizL("sendUp"), vwizL("sendV2v")], inBox: !!document.querySelector("#tkResultBox #tkSendRow") };
      VT.video = null; document.getElementById("btnTkSendV2v").click(); await until(() => !!VT.video); await settle();
      out.tkV2v = { clip: VT.video && { name: VT.video.name, url: VT.video._url, from: VT.video._sentFrom, size: VT.video._size }, page: onPage(), thumbSrc: (document.getElementById("vtFileThumb") || {}).src || "", name: txt("vtFileName"), statuses: statuses.slice() };
      statuses.length = 0;
      /* Talk take → Upscale */
      switchPage("talk"); await settle();
      VU.video = null; document.getElementById("btnTkSendUp").click(); await until(() => !!VU.video); await settle();
      out.tkUp = { clip: VU.video && { name: VU.video.name, url: VU.video._url }, page: onPage(), fileName: txt("vuFileName"), statuses: statuses.slice() };
      statuses.length = 0;
      /* the Upscale run reads the sent clip's bytes, never a File */
      let sentRef = null; const V = window.HNK.runninghubVideo; const _up = V.upscale;
      V.upscale = async function (env, ref) { sentRef = ref; return { ok: false, error: "test-stop" }; };   /* vuRun: V.upscale(videoEnv(), ref, res, …) */
      state.rhKey = state.rhKey || "TEST_RH_KEY"; VU.out = VU.out || { name: "Renders", nativePath: "/tmp/Renders" };
      try { document.getElementById("btnVuRun").click(); await until(() => sentRef !== null || !VU.busy); await settle(); } catch (e) { out.vuRunErr = String(e); }
      out.vuRun = { sentRef: typeof sentRef === "string" ? sentRef.slice(0, 22) : sentRef, refIsData: typeof sentRef === "string" && sentRef.indexOf(REF) === 0 };
      V.upscale = _up; statuses.length = 0;
      /* Video page take → Upscale; Upscale box has no Upscale button */
      switchPage("video"); await settle();
      vidHist.unshift({ url: "", ref: REF, name: "vid-1.mp4", ts: Date.now() }); vidHistSel = 0; try { showVidResult(); } catch (e) { out.showVidErr = String(e); } await settle();
      out.vidBtns = { up: txt("btnVidSendUp"), v2v: txt("btnVidSendV2v") };
      VU.video = null; document.getElementById("btnVidSendUp").click(); await until(() => !!VU.video); await settle();
      out.vidUp = { name: VU.video && VU.video.name, page: onPage() };
      out.vuBtns = { upExists: !!document.getElementById("btnVuSendUp"), v2v: txt("btnVuSendV2v") };
      /* a take with neither ref nor gallery copy: sendFail, target untouched */
      switchPage("v2v"); await settle();
      vtHist.unshift({ url: "https://x/y.mp4", name: "vt-1.mp4", ts: Date.now() }); vtHistSel = 0; try { showVtResult(); } catch (e) { out.showVtErr = String(e); } await settle();
      const beforeVu = VU.video && VU.video.name; statuses.length = 0;
      document.getElementById("btnVtSendUp").click(); await until(() => statuses.length >= 2); await settle();
      out.vtFail = { same: (VU.video && VU.video.name) === beforeVu, statuses: statuses.slice(), want: vwizL("sendFail"), page: onPage() };
      /* Save folder: the stub folder has no nativePath → host level, never written */
      switchPage("setup"); await settle();
      await until(() => saveProbe.state === "done"); await settle();
      const rows = selfTestRows();
      out.save = { row: hnkSaveProbeRow(), idx: rows.findIndex(r => r.label === "Save folder"), layerIdx: rows.findIndex(r => r.label === "Layer capture"), stubWrites: stubWrites,
        painted: (document.getElementById("selfTestRows") || document.body).textContent.indexOf("Save folder") >= 0 };
      /* an injected host with a real folder: ok · writable, the probe file gone */
      const store = {};
      window.HNK.__uxpForTests = { storage: { formats: { utf8: "utf8" }, localFileSystem: { getDataFolder: async () => ({ nativePath: "C:\\Users\\hnk\\AppData\\Roaming\\Adobe\\UXP\\PluginsStorage\\hnk",
        createFile: async (n) => ({ write: async (d) => { store[n] = d; }, read: async () => store[n], delete: async () => { delete store[n]; } }) }) } } };
      hnkSaveProbeStart(true); await until(() => saveProbe.state === "done" && /writable|REFUSED/.test(saveProbe.res.detail)); await settle();
      out.saveOk = { row: hnkSaveProbeRow(), left: Object.keys(store) };
      /* a refusing host: err with the reason */
      window.HNK.__uxpForTests = { storage: { formats: { utf8: "utf8" }, localFileSystem: { getDataFolder: async () => ({ nativePath: "/x", createFile: async () => { throw new Error("EACCES: permission denied"); } }) } } };
      hnkSaveProbeStart(true); await until(() => saveProbe.state === "done" && /REFUSED/.test(saveProbe.res.detail)); await settle();
      out.saveErr = hnkSaveProbeRow();
      /* a host that reads back something else: err naming it */
      window.HNK.__uxpForTests = { storage: { formats: { utf8: "utf8" }, localFileSystem: { getDataFolder: async () => ({ nativePath: "/y", createFile: async () => ({ write: async () => { }, read: async () => "", delete: async () => { } }) }) } } };
      hnkSaveProbeStart(true); await until(() => saveProbe.state === "done" && /read back/.test(saveProbe.res.detail)); await settle();
      out.saveBad = hnkSaveProbeRow();
      delete window.HNK.__uxpForTests;
      /* throttle: a second unforced start within 60 s keeps the last result */
      const keep = saveProbe.res.detail; hnkSaveProbeStart(false); out.throttled = saveProbe.state === "done" && saveProbe.res.detail === keep;
      return out;
    }, CLIP_B64);
    report("C1) Talk take → Video Tools: VT.video is {hnk-talk-<ts>.mp4, _url = the take's bytes, _sentFrom talk}, the V→V page opens with the thumb + name painted, status sendBusy then sentTo (Video Tools); the buttons speak the lifted words inside the result box",
      o.tkV2v.clip && /^hnk-talk-\d+\.mp4$/.test(o.tkV2v.clip.name) && o.tkV2v.clip.url === "data:video/mp4;base64," + CLIP_B64 && o.tkV2v.clip.from === "talk" && o.tkV2v.page === "pageV2V" &&
      o.tkV2v.thumbSrc.indexOf("data:video/mp4;base64,") === 0 && o.tkV2v.name === o.tkV2v.clip.name && o.tkV2v.statuses.length === 2 && o.tkV2v.statuses[1][1] === "ok" && /Video Tools/.test(o.tkV2v.statuses[1][0]) &&
      o.tkBtns.up === o.tkBtns.words[0] && o.tkBtns.v2v === o.tkBtns.words[1] && o.tkBtns.inBox, o.tkV2v);
    report("C2) Talk take → Upscale: VU.video set, the Upscale page opens with #vuFileName = the clip's name, and the Upscale run sends the clip's data URL (VU.video._url, never a File read); a Video take sends the same way; the Upscale box has no Upscale button",
      o.tkUp.clip && /^hnk-talk-\d+\.mp4$/.test(o.tkUp.clip.name) && o.tkUp.page === "pageVideoUp" && o.tkUp.fileName === o.tkUp.clip.name && /Video Upscale/.test(o.tkUp.statuses[1] && o.tkUp.statuses[1][0]) &&
      o.vuRun.refIsData && /^hnk-video-\d+\.mp4$/.test(o.vidUp.name) && o.vidUp.page === "pageVideoUp" && !o.vuBtns.upExists && o.vuBtns.v2v === o.tkBtns.words[1] && o.vidBtns.up === o.tkBtns.words[0], { tkUp: o.tkUp, vuRun: o.vuRun, vidUp: o.vidUp, vuBtns: o.vuBtns, err: o.vuRunErr });
    report("C3) a take with neither bytes nor a gallery copy: status sendFail (err), the target untouched, the page stays",
      o.vtFail.same && o.vtFail.statuses.length === 2 && o.vtFail.statuses[1][1] === "err" && o.vtFail.statuses[1][0] === o.vtFail.want && o.vtFail.page === "pageV2V", o.vtFail);
    report("C4) SELF-TEST Save folder: in the harness (a folder with no nativePath) the row is level host, says \"no native path — not written to\" with the takes count, sits right after Layer capture, is painted — and the stub's file was never written",
      o.save.row.label === "Save folder" && o.save.row.level === "host" && /no native path — not written to · \d+ saved take/.test(o.save.row.detail) && o.save.idx === o.save.layerIdx + 1 && o.save.painted && o.save.stubWrites === 0, o.save);
    report("C5) with a real folder the row is ok — path · writable · N saved takes · Nms — and the probe file is deleted; a refusing host is err \"REFUSED — EACCES…\"; a wrong read-back is err naming it; an unforced restart within 60 s keeps the result",
      o.saveOk.row.level === "ok" && /PluginsStorage\\hnk · writable · \d+ saved takes? · \d+ms$/.test(o.saveOk.row.detail) && o.saveOk.left.length === 0 &&
      o.saveErr.level === "err" && /^REFUSED — EACCES: permission denied/.test(o.saveErr.detail) && o.saveBad.level === "err" && /wrote but read back/.test(o.saveBad.detail) && o.throttled, { ok: o.saveOk, err: o.saveErr, bad: o.saveBad, throttled: o.throttled });
    report("C6) nothing threw in the panel while all of that ran", errs.length === 0, errs);
  } finally { await page.close(); server.close(); }
}

/* ================= D) the ledger + the release ================= */
function ledgerPins() {
  const tool = require("../tools/acceptance_record.js");
  const rm = JSON.parse(read("panel/release-manifest.json"));
  const i = SEC.indexOf(tool.START), j = SEC.indexOf(tool.END);
  const lines = SEC.slice(i + tool.START.length, j).split("\n").filter(l => l.trim());
  const versions = lines.map(l => (l.match(/^- v(\d+\.\d+\.\d+) · /) || [])[1]);
  const semver = v => v.split(".").map(Number);
  const desc = versions.every((v, k) => k === 0 || (function (a, b) { for (let q = 0; q < 3; q++) if (a[q] !== b[q]) return a[q] < b[q]; return false; })(semver(v), semver(versions[k - 1])));
  report("D1) PANEL_RELEASE_SECURITY.md carries the Publish ledger between its markers under \"## Acceptance record\": one `- vX.Y.Z · date · SHA-256 · bytes · adobe_acceptance **status** — …` line per release, newest first, every version unique, back to v6.102.0 (the record's first entry), and the ledger's own words say pending means the checklist did not run",
    i > 0 && j > i && SEC.indexOf("## Acceptance record") < i && SEC.indexOf("### Publish ledger") < i && lines.length >= 70 && versions.every(Boolean) && new Set(versions).size === versions.length && desc &&
    versions[versions.length - 1] === "6.102.0" && lines.every(l => /^- v\d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2} · SHA-256 `[0-9a-f]{12}…` · [\d,]+ bytes · adobe_acceptance \*\*(pending|accepted)\*\* — /.test(l)) &&
    /\*\*pending\*\* says in words that the in-Photoshop checklist\nwas not run on that build/.test(SEC) && /`test\/verify_release_contract\.js` runs the tool's `--check`/.test(SEC), { n: lines.length, first: versions[0], last: versions[versions.length - 1] });
  const mine = lines.find(l => l.indexOf("- v" + rm.version + " · ") === 0) || "";
  report("D2) the manifest's version (" + rm.version + ") has its line, and the line's facts are the manifest's (date, SHA-256 prefix, size, status); versions with their own paragraph below are marked \"recorded below\" (v6.144.0 among them, the latest photographed build)",
    !!mine && mine === tool.ledgerLine(rm, tool.hasParagraph(SEC, rm.version)) && mine.indexOf(rm.released) > 0 && mine.indexOf("`" + String(rm.sha256).slice(0, 12) + "…`") > 0 && mine.indexOf(String(rm.bytes).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " bytes") > 0 &&
    mine.indexOf("**" + rm.adobe_acceptance + "**") > 0 && /recorded below \(see the \*\*v6\.144\.0\*\* paragraph\)/.test(lines.find(l => l.indexOf("- v6.144.0 · ") === 0) || "") && SEC.indexOf("\n- **v6.144.0**") > j, { mine: mine.slice(0, 120) });
  /* the tool itself: --check passes on the tree; a copy with the line removed fails; "accepted" without evidence is refused; a second run is a no-op */
  const chk = (() => { try { return execFileSync("node", ["tools/acceptance_record.js", "--check"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch (e) { return "FAILED " + String(e.stderr || e.stdout).trim(); } })();
  let refused = "", noEvidence = "", idem = false;
  try { tool.readManifest(JSON.stringify(Object.assign({}, rm, { adobe_acceptance: "accepted" })), "x"); } catch (e) { noEvidence = String(e.message); }
  try { tool.readManifest(JSON.stringify(Object.assign({}, rm, { adobe_acceptance: "yes" })), "x"); } catch (e) { refused = String(e.message); }
  const okLine = tool.ledgerLine(Object.assign({}, rm, { adobe_acceptance: "accepted", acceptance_evidence: { date: "2026-09-20", tester: "the owner", host: "Photoshop 27.10.0 · win32" } }), false);
  /* a scratch copy of the repo's two files: the tool over it must be a no-op, and must refuse a missing line */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-ledger-"));
  try {
    fs.mkdirSync(path.join(tmp, "panel")); fs.mkdirSync(path.join(tmp, "tools"));
    fs.copyFileSync(path.join(ROOT, "PANEL_RELEASE_SECURITY.md"), path.join(tmp, "PANEL_RELEASE_SECURITY.md"));
    fs.copyFileSync(path.join(ROOT, "panel/release-manifest.json"), path.join(tmp, "panel/release-manifest.json"));
    fs.copyFileSync(path.join(ROOT, "tools/acceptance_record.js"), path.join(tmp, "tools/acceptance_record.js"));
    const before = fs.readFileSync(path.join(tmp, "PANEL_RELEASE_SECURITY.md"), "utf8");
    execFileSync("node", ["tools/acceptance_record.js"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    idem = fs.readFileSync(path.join(tmp, "PANEL_RELEASE_SECURITY.md"), "utf8") === before;
    fs.writeFileSync(path.join(tmp, "PANEL_RELEASE_SECURITY.md"), before.replace(mine + "\n", ""));
    let missing = "";
    try { execFileSync("node", ["tools/acceptance_record.js", "--check"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { missing = String(e.stderr); }
    execFileSync("node", ["tools/acceptance_record.js"], { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const restored = fs.readFileSync(path.join(tmp, "PANEL_RELEASE_SECURITY.md"), "utf8") === before;
    report("D3) tools/acceptance_record.js: --check passes on the tree and names the version + status; a copy with the line removed fails --check (\"LEDGER MISSING\") and one plain run restores it byte for byte; a second run is a no-op; \"accepted\" without acceptance_evidence is refused, an unknown status is refused, and an accepted line names date · tester · host",
      /^publish ledger ok: v/.test(chk) && chk.indexOf("v" + rm.version + " · " + rm.adobe_acceptance) > 0 && /LEDGER MISSING: no line for v/.test(missing) && restored && idem &&
      /needs acceptance_evidence/.test(noEvidence) && /adobe_acceptance must be one of pending \| accepted/.test(refused) && /\*\*accepted\*\* — in-Photoshop checklist passed 2026-09-20 by the owner on Photoshop 27\.10\.0 · win32/.test(okLine), { chk, missing: missing.slice(0, 80), idem, restored, noEvidence: noEvidence.slice(0, 60), refused: refused.slice(0, 60) });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  report("D4) verify_release_contract.js runs the tool's --check as a release-contract check",
    /execFileSync\("node", \["tools\/acceptance_record\.js", "--check"\]/.test(read("test/verify_release_contract.js")) && /the publish ledger carries the release manifest's version with matching facts/.test(read("test/verify_release_contract.js")), null);
}
function releasePins() {
  const ver = JSON.parse(read("docs/app/version.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json")), rm = JSON.parse(read("panel/release-manifest.json"));
  const appVer = ver.v, panVer = rm.version;
  report("E1) the release: app " + appVer + " / panel " + panVer + " agree across version.json, APP_VER, docs/download/panel-version.json (v + latest_version) and the release manifest; CI runs this test right after verify_ui_wave_693; the landing counts at least 230 tests; What's New carries the " + appVer + " row on the app and the panel",
    /^6\.9[4-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) && APP.indexOf('APP_VER="' + appVer + '"') > 0 && pv.v === panVer && pv.latest_version === panVer && /^6\.16[5-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    CI.indexOf("node test/verify_clip_handoff_694.js") > CI.indexOf("node test/verify_ui_wave_693.js") && (parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10) >= 230) &&
    /* 6.107.0 — the table left index.html for data/whatsnew.js and the panel's
       copy is that JSON dropped in whole, so neither file spells a row `{ v:"…"`
       any more. test/lib/whats-new.js renders a PARSED row back into that
       spelling; an empty string means the release has no row, which is exactly
       what this pinned before. */
    WN.appRow(appVer).length > 0 && WN.panelRow(appVer).length > 0, { appVer, panVer, pv: pv.v });
}

(async () => {
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try {
    await appWalk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  ledgerPins();
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — every clip goes on to the next tool in one tap on both surfaces, the Save folder row tells the truth, and every release has its honest line");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
