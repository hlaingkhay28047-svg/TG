/* verify_convenience_695.js — 6.95.0 / panel 6.166.0
   THE SIX CONVENIENCE UPGRADES THE OWNER APPROVED ("1to6 အပြီးလုပ်ပါ"), on both surfaces.

     1. GALLERY TOOLS. A search box (prompt · workflow · date), a kind filter (All · Photos · Videos · ★ Starred)
        and a sort (Newest · Oldest · Largest) above the grid, with an honest "{N} of {M} shown" count and a
        no-match line. The app draws two <select>s; the panel draws the same two selects behind its own .hsl
        picker (a native select never opens in Photoshop — 6.149.0). The words are one table (GAL_W / GAL_L).
     2. "IT'S READY" NOTIFICATIONS (app only). The first long job (Video · Upscale · Video Tools · Talking Photo)
        asks once for the browser's Notification permission; when a job finishes while the tab is in the
        background the service worker shows one, and tapping it brings the page back. UXP has no notification
        of any kind, so the panel does not offer the switch — the parity walk names those lines app-only.
     3. HOME RECENT RESULTS. The newest six results as a strip under Continue; a tap opens the Gallery on
        that result (app: IndexedDB cursor + galPendingId; panel: HNK.homeRecent over the gallery store).
     4. FRAME → TALKING PHOTO / IMAGE 1. Every video result box and the video wizard's Result carry two more
        chips: the clip's half-second frame becomes the Talking Photo face or Freeform's IMAGE 1 (canvas JPEG).
        The panel shows them only where <video> decodes (VIDEO_OK) and reports grabFail otherwise.
     5. DRAG & DROP (panel). A file dropped from the OS onto any picker (Talk photo · Talk voice · V→V clip ·
        V→V photo · Upscale clip · the studio PHOTO card · the Freeform slots) lands as if picked; one reader
        (entryReadBinary) takes a UXP entry or a DOM File; a SELF-TEST row reports targets · last file · refusal.
        Real-Photoshop delivery of drop events is acceptance work — the row exists to report it.
     6. TEXT SIZE. Setup ▸ SETTINGS: Small · Normal · Large on both surfaces, persisted (localStorage / the
        panel's settings file), painted through the app's --fs-* tokens and the panel's body.tsize-* rules.

   Fault-injected while writing: the panel's galToolsPaint `fill` for galSort removed fails C1; `notifyDone("video")`
   removed fails A4; `safe("drops", bindDrops)` moved after bindSetup fails A7 (renderer_safety F1 too); the app's
   `galPendingId` select removed fails B4; PREFS_L "m" changed fails A6.
   Usage: PORT=8931 node test/verify_convenience_695.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const SW = read("docs/app/sw.js");
const PMAIN = read("panel/main.js");
const PHTML = read("panel/index.html");
const PCSS = read("panel/styles.css");
const PVW = read("panel/js/hnk_video_wizard.js");
const PWN = read("panel/js/hnk_whats_new.js");
const PSET = read("panel/src/ui/screens/settings-screen.js");
const PHOME = read("panel/src/ui/screens/home-screen.js");
const PFREE = read("panel/src/ui/screens/free-generate-screen.js");
const PHOST = read("panel/src/photoshop/photoshop-host.js");
const PARITY = read("test/verify_panel_page_parity.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
/* the object literal that follows a marker, brace-matched and evaluated (our own source, string values only) */
function objAfter(src, marker) {
  const at = src.indexOf(marker); if (at < 0) return null;
  const start = src.indexOf("{", at); let depth = 0, i = start, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }     /* a comment may hold an apostrophe */
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) break; }
  }
  return new Function("return (" + src.slice(start, i + 1) + ")")();
}
const keyLine = (src, k) => (src.match(new RegExp("^\\s*" + k + ":\\{.*$", "m")) || [])[0] || "";
const nineLangs = (line) => !!line && LANGS.every(l => new RegExp("[{,]" + l + ':"').test(line));
const sameWords = (a, b, keys) => keys.every(k => a && b && a[k] && b[k] && LANGS.every(l => typeof a[k][l] === "string" && a[k][l].length > 0 && a[k][l] === b[k][l]));

/* ================= A) the source ================= */
function sourcePins() {
  const GW = objAfter(APP, "var GAL_W="), GL = objAfter(PMAIN, "const GAL_L = {");
  const galKeys = ["search", "kAll", "kImg", "kVid", "kKeep", "sNew", "sOld", "sBig", "count", "none", "recent"];
  report("A1) GALLERY WORDS: GAL_W (app) and GAL_L (panel) carry search · kAll · kImg · kVid · kKeep · sNew · sOld · sBig · count ({N} / {M}) · none · recent in nine languages, string for string, the star U+2605 on both",
    sameWords(GW, GL, galKeys) && /\{N\}/.test(GW.count.my) && /\{M\}/.test(GW.count.en) && LANGS.every(l => GW.kKeep[l].charCodeAt(0) === 0x2605), { app: GW && Object.keys(GW), panel: GL && galKeys.filter(k => !GL[k]) });

  const grab = ["grabTalk", "grabImg1", "grabFail"].map(k => keyLine(APP, k));
  report("A2) FRAME WORDS: VWIZ_L grabTalk · grabImg1 · grabFail in nine languages (English \"Frame → Talking Photo\" / \"Frame → IMAGE 1\"), and the panel's lifted pack has every line verbatim",
    grab.every(nineLangs) && /en:"Frame → Talking Photo"/.test(grab[0]) && /en:"Frame → IMAGE 1"/.test(grab[1]) && grab.every(l => PVW.indexOf(l.trim()) > 0), grab.map(l => l.slice(0, 40)));

  report("A3) THE APP'S FRAME HAND-OFF: VID_SEND_TARGETS talk (pgTalk · grabTalk · i-frame · frame) and img1 (pgCreate · grabImg1 · i-restore · frame); every box lists them (vid/vt/tk up+v2v+talk+img1, vu v2v+talk+img1); the wizard's Result too; vidGrabFrame = the bytes through vidSendBlob → object URL → <video> seeked to ≤0.5 s → canvas JPEG 0.92, 15 s ceiling, URL revoked; the frame branch sets state.tkImg (+ renderTkPicks + wipSave) or IMAGE 1 (refsClobberGuard + renderRefs), toasts grabFail on a clip that will not decode",
    /talk:\{ page:"pgTalk", key:"grabTalk", ic:"i-frame", name:"Talking Photo", frame:true \}, img1:\{ page:"pgCreate", key:"grabImg1", ic:"i-restore", name:"IMAGE 1", frame:true \} \};/.test(APP) &&
    /vid:\{ row:"vidSendRow", from:"video", targets:\["up","v2v","talk","img1"\]/.test(APP) && /vu: \{ row:"vuSendRow",  from:"upscale", targets:\["v2v","talk","img1"\]/.test(APP) &&
    /vt: \{ row:"vtSendRow",  from:"videotool", targets:\["up","v2v","talk","img1"\]/.test(APP) && /tk: \{ row:"tkSendRow",  from:"talk", targets:\["up","v2v","talk","img1"\]/.test(APP) &&
    /vidSendChips\(sendRow, function\(\)\{ return cur; \}, vwiz\.kind==="i2v"\?"video":"videotool", \["up","v2v","talk","img1"\], true\);/.test(APP) &&
    /function vidGrabFrame\(out\)\{\n\s*return vidSendBlob\(out\)\.then\(function\(blob\)\{[\s\S]*?URL\.createObjectURL\(blob\)[\s\S]*?setTimeout\(function\(\)\{ fin\(new Error\("frame-timeout"\)\); \}, 15000\)[\s\S]*?v\.currentTime=Math\.min\(0\.5, Math\.max\(0, \(v\.duration\|\|1\)\/2\)\)[\s\S]*?toDataURL\("image\/jpeg",0\.92\)[\s\S]*?v\.src=url;/.test(APP) &&
    /URL\.revokeObjectURL\(url\)/.test(APP) && /window\.vidGrabFrame=vidGrabFrame;/.test(APP) &&
    /if\(T\.frame\)\{\n\s*var fr;\n\s*try\{ fr=await vidGrabFrame\(out\); \}catch\(eF\)\{ toast\(vwizL\("grabFail"\), "err"\); return false; \}/.test(APP) &&
    /if\(target==="talk"\)\{ state\.tkImg=\{mime:fr\.mime,b64:fr\.b64,name:pname\}; renderTkPicks\(\); wipSave\(\); \}/.test(APP) &&
    /else \{ refsClobberGuard\(0\); state\.cmpBase=null; state\.rsOrig=null; state\.refs\[0\]=\{mime:fr\.mime,b64:fr\.b64,label:pname\}; state\.imgRoles=null; renderRefs\(\); \}/.test(APP), null);

  const PW = objAfter(APP, "var PREFS_W=");
  report("A4) THE APP'S NOTIFICATIONS: notifyAsk() opens the four long-job handlers (+ the Settings chip) and notifyDone(\"video\"|\"upscale\"|\"videotool\"|\"talk\") follows each finished take; notifyDone fires only with permission granted AND the tab hidden or unfocused, through the service worker's showNotification with data.page (a plain Notification as the fallback), tag hnk-done-<kind>; sw.js notificationclick focuses the tab and posts {type:\"hnk-open\", page} which the page turns into switchPage; NOTIFY_W title + four bodies and PREFS_W nOn/nOff/nNote/nBlocked/nNo in nine languages",
    (APP.match(/^\s*notifyAsk\(\);/gm) || []).length >= 4 && /renderPrefs\(\); if\(next\) notifyAsk\(\);/.test(APP) &&
    ["video", "upscale", "videotool", "talk"].every(k => (APP.match(new RegExp('notifyDone\\("' + k + '"\\);', "g")) || []).length === 1) &&
    /function notifyDone\(kind\)\{\n\s*try\{\n\s*if\(!notifyWanted\(\) \|\| !\("Notification" in window\) \|\| Notification\.permission!=="granted"\) return false;\n\s*if\(!document\.hidden && document\.hasFocus\(\)\) return false;/.test(APP) &&
    /tag:"hnk-done-"\+kind, renotify:true, data:\{ page:page \}/.test(APP) && /navigator\.serviceWorker\.ready\.then\(function\(r\)\{ return r\.showNotification\(title, opts\); \}\)/.test(APP) &&
    /var NOTIFY_PAGE=\{ video:"pgVideo", upscale:"pgVideoUp", videotool:"pgV2V", talk:"pgTalk" \};/.test(APP) &&
    /self\.addEventListener\("notificationclick", function \(e\) \{[\s\S]*?c\.postMessage\(\{ type: "hnk-open", page: page \}\)[\s\S]*?self\.clients\.openWindow\("\.\/index\.html"\)/.test(SW) &&
    /d\.type==="hnk-open" && d\.page && \$\(d\.page\)\) switchPage\(d\.page\);/.test(APP) &&
    ["title", "video", "upscale", "videotool", "talk"].every(k => nineLangs(keyLine(APP, k) && (APP.slice(APP.indexOf("var NOTIFY_W="), APP.indexOf("var NOTIFY_PAGE=")).match(new RegExp("^\\s*" + k + ":\\{.*$", "m")) || [])[0])) &&
    PW && ["h2", "tsize", "s", "m", "l", "nOn", "nOff", "nNote", "nBlocked", "nNo"].every(k => PW[k] && LANGS.every(l => typeof PW[k][l] === "string" && PW[k][l].length)), null);

  report("A5) THE APP'S SETTINGS CARD, TEXT SIZE AND HOME STRIP: #cardPrefs (h2 · Small/Normal/Large chips · notify chip + note) right after #cardData; html.tsize-l / html.tsize-s re-tune the five --fs-* tokens and the body size (17px / 13.5px against 15px); the boot script applies the stored class before first paint; tsizeSet keeps the class on <html> and the choice in hnk_ws_tsize; renderDashRecent reads the newest six gallery records (a reverse cursor) into #dashRecent under Continue, a tap sets galPendingId and opens the Gallery, which selects it after the grid paints",
    APP.indexOf('<section class="card" id="cardPrefs">') > APP.indexOf('<section class="card" id="cardData">') && APP.indexOf('<section class="card" id="cardPrefs">') - APP.indexOf('<section class="card" id="cardData">') < 1200 &&
    /<button class="chip" id="prefsTsizeS" data-tsize="s"><\/button>\s*<button class="chip" id="prefsTsizeM" data-tsize="m"><\/button>\s*<button class="chip" id="prefsTsizeL2" data-tsize="l"><\/button>/.test(APP) &&
    /<button class="chip" id="prefsNotify"><\/button>\s*<span class="mut" id="prefsNotifyNote"/.test(APP) &&
    /html\.tsize-l\{--fs-2xs:11px;--fs-xs:12\.5px;--fs-sm:13\.5px;--fs-base:14\.5px;--fs-md:16px\}\s*html\.tsize-l body\{font-size:17px\}/.test(APP) && /html\.tsize-s\{--fs-2xs:[\d.]+px;[^}]*\}\s*html\.tsize-s body\{font-size:13\.5px\}/.test(APP) &&
    /var _ts0 = localStorage\.getItem\("hnk_ws_tsize"\); if \(_ts0 === "s" \|\| _ts0 === "l"\) document\.documentElement\.classList\.add\("tsize-" \+ _ts0\);/.test(APP) &&
    /function tsizeSet\(v\)\{\n\s*v = v==="s"\|\|v==="l" \? v : "m";\n\s*var root=document\.documentElement; root\.classList\.remove\("tsize-s","tsize-l"\); if\(v!=="m"\) root\.classList\.add\("tsize-"\+v\);\n\s*try\{ localStorage\.setItem\(TSIZE_KEY, v\); \}catch\(e\)\{\}/.test(APP) &&
    /var TSIZE_KEY="hnk_ws_tsize", NOTIFY_KEY="hnk_ws_notify";/.test(APP) &&
    /function renderDashRecent\(\)\{[\s\S]*?openCursor\(null,"prev"\)[\s\S]*?got\.length<6[\s\S]*?makePickable\(im, function\(\)\{ galPendingId=it\.id; switchPage\("pgGallery"\); \}\);/.test(APP) &&
    /var galView=\{ q:"", kind:"all", sort:"new" \}, galPendingId=null/.test(APP) && /function galApplyView\(all\)\{/.test(APP) && /function galToolsPaint\(\)\{/.test(APP) && /function galToolsBind\(\)\{/.test(APP) &&
    /window\._galItems=all;\s*galToolsBind\(\); galToolsPaint\(\);\s*var items=galApplyView\(all\); window\._galShown=items;/.test(APP), null);

  const PL = objAfter(PMAIN, "const PREFS_L = {");
  report("A6) THE PANEL'S GALLERY TOOLS AND SETTINGS CARD: #galKind + #galSort are <select class=inp> inside .hsl wrappers (button + hsl-val + parked select) beside #galSearch; galToolsPaint fills both and writes the chosen label; bindGalleryTools listens on input/change; galApplyView(files) is the app's filter + sort; #cardPrefs sits after #cardData and before #cardPlat with the three chips; PREFS_L equals PREFS_W word for word (h2 · tsize · s · m · l); tsizeSetP applies + saves + repaints, renderPrefsP marks the chosen chip \"chip on\", applyTextSize rebuilds body.className as a string; saveSettings/loadSettings carry tsize; HNK.textSize.set → tsizeSetP; bound in bindSetup as setup:prefs, painted from setupApplyStatics; body.tsize-l / body.tsize-s in styles.css; the AI Tools settings screen carries no second control",
    /<div class="hsl hsl-for-galKind" id="galKindHsl">\s*<div role="button" tabindex="0" class="hsl-btn" id="galKindBtn"><span class="hsl-lab"><span class="hsl-val" id="galKindVal"><\/span><\/span><img class="hsl-caret" src="icons\/ui\/hsl-caret-gold\.png" alt=""><\/div>\s*<select class="inp" id="galKind"><\/select>\s*<\/div>/.test(PHTML) &&
    /<div class="hsl hsl-for-galSort" id="galSortHsl">[\s\S]*?<span class="hsl-val" id="galSortVal">[\s\S]*?<select class="inp" id="galSort"><\/select>/.test(PHTML) && /<input type="text" class="hnk-input" id="galSearch">/.test(PHTML) &&
    /fill\("galKind", "galKindVal", \[\["all", GAL_L\.kAll\], \["image", GAL_L\.kImg\], \["video", GAL_L\.kVid\], \["keep", GAL_L\.kKeep\]\], GAL\.kind\);\n\s*fill\("galSort", "galSortVal", \[\["new", GAL_L\.sNew\], \["old", GAL_L\.sOld\], \["big", GAL_L\.sBig\]\], GAL\.sort\);/.test(PMAIN) &&
    /const k = \$\("galKind"\); if \(k\) k\.addEventListener\("change", function \(\) \{ GAL\.kind = k\.value; renderGal\(\); \}\);/.test(PMAIN) && /function galApplyView\(files\)/.test(PMAIN) &&
    PHTML.indexOf('<div class="card" id="cardPrefs">') > PHTML.indexOf('<div class="card" id="cardData">') && PHTML.indexOf('<div class="card" id="cardPrefs">') < PHTML.indexOf('<div class="card" id="cardPlat">') &&
    /<h2 id="prefsH2"><img class="ic-h2" src="icons\/ui\/i-gear-gold\.png" alt=""><\/h2>/.test(PHTML) && fs.existsSync(path.join(PANEL, "icons/ui/i-gear-gold.png")) &&
    ["prefsTsizeS", "prefsTsizeM", "prefsTsizeL2"].every(id => PHTML.indexOf('<div role="button" tabindex="0" class="chip" id="' + id + '"></div>') > 0) &&
    sameWords(PL, PW, ["h2", "tsize", "s", "m", "l"]) &&
    /function tsizeSetP\(v\) \{\n\s*state\.tsize = \(v === "s" \|\| v === "l"\) \? v : "m";\n\s*applyTextSize\(\);\n\s*try \{ saveSettings\(\); \} catch \(e\) \{ \}\n\s*try \{ renderPrefsP\(\); \} catch \(e\) \{ \}/.test(PMAIN) &&
    /b\.textContent = ff9\(PREFS_L\[r\[1\]\]\); b\.className = "chip" \+ \(cur === r\[1\] \? " on" : ""\);/.test(PMAIN) &&
    /const rest = String\(b\.className \|\| ""\)\.split\(\/\\s\+\/\)\.filter\(function \(c\) \{ return c && !\/\^tsize-\/\.test\(c\); \}\);\n\s*if \(v !== "m"\) rest\.push\("tsize-" \+ v\);\n\s*b\.className = rest\.join\(" "\);/.test(PMAIN) &&
    /tsize: state\.tsize \|\| "m",/.test(PMAIN) && /if \(o\.tsize === "s" \|\| o\.tsize === "l"\) \{ state\.tsize = o\.tsize; try \{ applyTextSize\(\); \} catch \(eT\) \{ \} \}/.test(PMAIN) &&
    /set: function \(v\) \{ return tsizeSetP\(v\); \}/.test(PMAIN) && /safe\("setup:prefs", function \(\) \{/.test(PMAIN) && /function setupApplyStatics\(\) \{\n\s*try \{ renderPrefsP\(\); \} catch \(e\) \{ \}/.test(PMAIN) &&
    /^body\.tsize-l \{ font-size: 14px; \}$/m.test(PCSS) && /^body\.tsize-s \{ font-size: 11px; \}$/m.test(PCSS) && /\.prefs-row \{ display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; margin-top: 8px; \}/.test(PCSS) && !/\.prefs-row[^\n]*\bgap:/.test(PCSS) &&
    PSET.indexOf("hnkSetTsize") < 0, null);

  report("A7) THE PANEL'S DRAG & DROP: DROP {bound,last,err}; dropBind marks drop-on on dragover and hands the dropped File on; bindDrops binds the six static targets (Talk photo · Talk voice · V→V clip · V→V photo · Upscale clip · the studio PHOTO card → subject-reference slot) and runs as its own guard BEFORE the five page binds; entryReadBinary reads a UXP entry (read) or a DOM File (arrayBuffer / FileReader) and fileToDataUrl + refCaptureEntry go through it; the Freeform slots take a drop into imageImport.fromFile → applySlot; photoshop-host.readImageFile accepts a DOM File; hnkDropRow reports err (no targets / REFUSED) · ok (N targets · last file · KB) · pend, pushed right after the Save folder row; .drop-on is the gold frame",
    /^const DROP = \{ bound: 0, dyn: \[\], last: null, err: null \};$/m.test(PMAIN) && /g\.HNK\.dropTarget = dropTargetBridge\(\);/.test(PMAIN) && /if \(dropNote\) dropNote\.bound\("free-slots"\);/.test(PFREE) && /if \(dropNote\) dropNote\.got\(file\);/.test(PFREE) && /^function dropFileOf\(e\) \{/m.test(PMAIN) && /^function dropBind\(el, onFile\) \{/m.test(PMAIN) &&
    ["btnTkImgPick", "btnTkAudPick", "btnVtPick", "btnVtImgPick", "btnVuPickP", "stPicker"].every(id => new RegExp('dropBind\\(\\$\\("' + id + '"\\), async function \\(f\\)').test(PMAIN)) &&
    /const slot = refSlotById\("subject-reference"\); if \(!slot\) return;\n\s*const cap = await refCaptureEntry\(f\); if \(!cap \|\| !imgMagicOk\(cap\.b64\)\) throw new Error\("HNKERR:err_img:unreadable"\);\n\s*slot\.assign\(cap\);/.test(PMAIN) &&
    /function bindDiag\(\) \{[\s\S]*?safe\("drops", bindDrops\);[\s\S]{0,120}?\n\s*safe\("setup", bindSetup\);/.test(PMAIN) &&
    /async function entryReadBinary\(f\) \{\n\s*const uxp = require\("uxp"\);\n\s*if \(f && typeof f\.read === "function"\) return f\.read\(\{ format: uxp\.storage\.formats\.binary \}\);\n\s*if \(f && typeof f\.arrayBuffer === "function"\) return f\.arrayBuffer\(\);/.test(PMAIN) &&
    (PMAIN.match(/await entryReadBinary\(f\)/g) || []).length >= 2 &&
    /dom\.on\(target, "drop", function \(e\) \{[\s\S]*?imageImport\.fromFile\(deps\.host, file\)/.test(PFREE) && /6\.166\.0 — a file dropped onto a slot may be a DOM File \(arrayBuffer\)/.test(PHOST) && /typeof file\.arrayBuffer === "function"/.test(PHOST) &&
    /function hnkDropRow\(\) \{[\s\S]*?const n = DROP\.bound \+ DROP\.dyn\.length;\n\s*if \(!DROP\.bound\) return \{ label: "Drag & drop", detail: "no targets bound", level: "err" \};\n\s*if \(DROP\.err\) return \{ label: "Drag & drop", detail: "REFUSED \\u2014 " \+ DROP\.err, level: "err" \};\n\s*if \(DROP\.last\) return \{ label: "Drag & drop", detail: n \+ " targets \\u00b7 last file " \+ DROP\.last\.name \+ " \\u00b7 " \+ kb \+ " KB", level: "ok" \};\n\s*return \{ label: "Drag & drop", detail: n \+ " targets bound \\u00b7 no file dropped yet", level: "pend" \};/.test(PMAIN) &&
    PMAIN.indexOf("rows.push(hnkDropRow());") > PMAIN.indexOf("rows.push(hnkSaveProbeRow());") && PMAIN.indexOf("rows.push(hnkDropRow());") - PMAIN.indexOf("rows.push(hnkSaveProbeRow());") < 200 &&
    /\.drop-on \{ border-color: var\(--gold\) ?!important; \}/.test(PCSS), null);

  report("A8) THE PANEL'S FRAME HAND-OFF AND HOME STRIP: VID_SEND_PAGE/NAME/ICON/KEY carry talk (→ talk · Talking Photo · i-frame · grabTalk) and img1 (→ prompt · IMAGE 1 · i-restore · grabImg1), VID_SEND_FRAME names both; vidGrabFrameP refuses without VIDEO_OK, seeks ≤0.5 s, JPEG 0.92, 15 s ceiling, and clears the src through clearSrc; the frame branch makes TK.img through layerPhotoEntry (base label — it adds .jpg) or IMAGE 1 {b64,mime,label .jpg}, grabFail on refusal; eight static buttons (btnVid/Vt/Tk/VuSend Talk/Img1) exist in the four rows and vidSendPaintP shows them only with VIDEO_OK; the wizard's Result skips the two rows without a player; home-screen draws #hnkDashRecent from HNK.homeRecent.list(6) and a tap runs homeRecentOpen (GAL.pick + the Gallery page); the parity walk names the five notify lines app-only and drops them from the selection list too",
    /const VID_SEND_PAGE = \{ up: "vidup", v2v: "v2v", talk: "talk", img1: "prompt" \};/.test(PMAIN) && /const VID_SEND_NAME = \{ up: "Video Upscale", v2v: "Video Tools", talk: "Talking Photo", img1: "IMAGE 1" \};/.test(PMAIN) &&
    /const VID_SEND_FRAME = \{ talk: true, img1: true \};/.test(PMAIN) && /const VID_SEND_ICON = \{ up: "i-rocket", v2v: "i-clapper", talk: "i-frame", img1: "i-restore" \};/.test(PMAIN) && /const VID_SEND_KEY = \{ up: "sendUp", v2v: "sendV2v", talk: "grabTalk", img1: "grabImg1" \};/.test(PMAIN) &&
    /function vidGrabFrameP\(ref\) \{\n\s*return new Promise\(function \(res, rej\) \{\n\s*if \(!VIDEO_OK\) \{ rej\(new Error\("no-player"\)\); return; \}[\s\S]*?try \{ v\.pause\(\); clearSrc\(v\); v\.load\(\); \} catch \(e\) \{ \}[\s\S]*?fin\(new Error\("frame-timeout"\)\); \}, 15000\)[\s\S]*?v\.currentTime = Math\.min\(0\.5, Math\.max\(0, \(v\.duration \|\| 1\) \/ 2\)\)[\s\S]*?toDataURL\("image\/jpeg", 0\.92\)/.test(PMAIN) &&
    /if \(VID_SEND_FRAME\[target\]\) \{\n\s*let fr;\n\s*try \{ fr = await vidGrabFrameP\(ref\); \} catch \(eF\) \{ setStatus\(vwizL\("grabFail"\), "err"\); return false; \}\n\s*const pbase = "hnk-" \+ \(from \|\| "clip"\) \+ "-" \+ Date\.now\(\);/.test(PMAIN) &&
    /if \(target === "talk"\) \{ TK\.img = layerPhotoEntry\(\{ b64: fr\.b64, mime: fr\.mime, label: pbase \}\); try \{ renderTk\(\); \} catch \(e\) \{ \} \}\n\s*else \{ state\.refs\[0\] = \{ b64: fr\.b64, mime: fr\.mime, label: pbase \+ "\.jpg" \}; try \{ renderRefs\(\); \} catch \(e\) \{ \} \}/.test(PMAIN) &&
    ["btnVidSendTalk", "btnVidSendImg1", "btnVtSendTalk", "btnVtSendImg1", "btnTkSendTalk", "btnTkSendImg1", "btnVuSendTalk", "btnVuSendImg1"].every(id => PHTML.indexOf('id="' + id + '"') > 0 && new RegExp('\\["' + id + '", "(talk|img1)", "(video|videotool|talk|upscale)", function').test(PMAIN)) &&
    /if \(VID_SEND_FRAME\[row\[1\]\]\) b\.style\.display = VIDEO_OK \? "" : "none";/.test(PMAIN) && /if \(VID_SEND_FRAME\[r\[1\]\] && !VIDEO_OK\) return;/.test(PMAIN) &&
    /g\.HNK\.homeRecent = \{ list: homeRecentListP, open: homeRecentOpen, title: function \(\) \{ return ff9\(GAL_L\.recent\); \} \};/.test(PMAIN) && /function homeRecentOpen\(name\) \{ GAL\.pick = name; switchPage\("gallery"\);/.test(PMAIN) &&
    /id: "hnkDashRecent"/.test(PHOME) && /hr\.list\(6\)/.test(PHOME) && /hr\.open\(/.test(PHOME) &&
    ["ဗီဒီယို ပြီးရင် အသိပေးမယ် — ဖွင့်ထား", "ဗီဒီယို ပြီးရင် အသိပေးမယ် — ပိတ်ထား", "ဒီ browser မှာ notification မရပါ"].every(s => PARITY.indexOf(s) > 0) && /sel: dropOnce\(aState\.sel, APP_ONLY\[p\.key\] \|\| \[\]\)/.test(PARITY), null);
}

/* ================= B) the app, on a phone ================= */
async function appWalk(browser) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) { } });
  await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  try {
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const o = await page.evaluate(async (PX) => {
      const settle = () => new Promise(r => setTimeout(r, 250));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 8000) r(); else setTimeout(w, 40); })(); });
      const txt = id => (document.getElementById(id) || { textContent: "" }).textContent.trim();
      const shown = () => (window._galShown || []).length;
      const out = {}, toasts = [];
      const _toast = window.toast; window.toast = function (m, k) { toasts.push([String(m), k || ""]); return _toast.apply(this, arguments); };
      /* two photos in the gallery */
      galleryAdd({ mime: "image/png", b64: PX }, "golden veil portrait"); await settle();
      galleryAdd({ mime: "image/png", b64: PX }, "night market street"); await settle();
      switchPage("pgGallery"); await until(() => (window._galItems || []).length >= 2); await settle();
      const sIn = document.getElementById("galSearch"), kSel = document.getElementById("galKind"), sSel = document.getElementById("galSort");
      out.tools = { ph: sIn.placeholder, kinds: [...kSel.options].map(x => x.value), kindWords: [...kSel.options].map(x => x.textContent), sorts: [...sSel.options].map(x => x.value), sortWords: [...sSel.options].map(x => x.textContent), kind: kSel.value, sort: sSel.value, count: txt("galCount"), tiles: document.querySelectorAll("#galGrid img").length, words: { search: L9(GAL_W.search), kAll: L9(GAL_W.kAll), kKeep: L9(GAL_W.kKeep), sNew: L9(GAL_W.sNew), none: L9(GAL_W.none) } };
      sIn.value = "night"; sIn.oninput(); await until(() => shown() === 1); await settle();
      out.search = { shown: shown(), tiles: document.querySelectorAll("#galGrid img").length, count: txt("galCount"), prompt: window._galShown[0] && window._galShown[0].prompt };
      sIn.value = "zzz"; sIn.oninput(); await until(() => shown() === 0); await settle();
      out.nomatch = { shown: shown(), count: txt("galCount"), emptyOn: document.getElementById("galEmpty").classList.contains("on") };
      sIn.value = ""; sIn.oninput(); await until(() => shown() === 2); await settle();
      kSel.value = "video"; kSel.onchange(); await until(() => shown() === 0); await settle(); out.kindVideo = shown();
      kSel.value = "keep"; kSel.onchange(); await until(() => shown() === 0); await settle(); out.kindKeep = shown();
      kSel.value = "all"; kSel.onchange(); await until(() => shown() === 2); await settle();
      out.sortNew = window._galShown.map(i => i.prompt);
      sSel.value = "old"; sSel.onchange(); await settle(); await settle(); out.sortOld = window._galShown.map(i => i.prompt);
      sSel.value = "new"; sSel.onchange(); await settle();
      /* Home: the strip, then a tap */
      switchPage("pgDash"); await until(() => !!document.getElementById("dashRecent") && document.getElementById("dashRecent").querySelectorAll("img").length >= 2); await settle();
      const strip = document.getElementById("dashRecent");
      out.home = { strip: !!strip, n: strip ? strip.querySelectorAll("img").length : 0, h: txt("dashRecentH"), word: L9(GAL_W.recent), shown: document.getElementById("dashCont").style.display, gids: strip ? [...strip.querySelectorAll("img")].map(i => i.dataset.gid) : [] };
      if (strip) { strip.querySelectorAll("img")[1].onclick(); await until(() => curPage === "pgGallery" && !!galSel); await settle(); out.homeTap = { page: curPage, picked: galSel && galSel.prompt, pickedId: galSel && String(galSel.id), pickOn: document.getElementById("galPick").className }; }
      /* Settings card */
      switchPage("pgHome"); await settle();
      out.prefs = { h2: txt("prefsH2"), h2Word: L9(PREFS_W.h2), lbl: txt("prefsTsizeL"), chips: [...document.querySelectorAll("#prefsTsizeRow .chip")].map(b => b.textContent + (b.classList.contains("on") ? "*" : "")), words: [L9(PREFS_W.s), L9(PREFS_W.m) + "*", L9(PREFS_W.l)], notify: txt("prefsNotify"), notifyOn: document.getElementById("prefsNotify").classList.contains("on"), nOn: L9(PREFS_W.nOn), note: txt("prefsNotifyNote"), notes: [L9(PREFS_W.nNote), L9(PREFS_W.nBlocked), L9(PREFS_W.nNo)], state: notifyState(), wanted: notifyWanted() };
      const fs0 = getComputedStyle(document.body).fontSize, mut0 = getComputedStyle(document.getElementById("prefsNotifyNote")).fontSize;   /* a .mut on the token, no inline size */
      document.getElementById("prefsTsizeL2").onclick(); await settle();
      out.tsize = { cls: document.documentElement.className, fs0, fs: getComputedStyle(document.body).fontSize, mut0, mut: getComputedStyle(document.getElementById("prefsNotifyNote")).fontSize, stored: localStorage.getItem("hnk_ws_tsize"), on: [...document.querySelectorAll("#prefsTsizeRow .chip.on")].map(b => b.id) };
      document.getElementById("prefsTsizeS").onclick(); await settle();
      out.tsizeS = { cls: document.documentElement.className, fs: getComputedStyle(document.body).fontSize, stored: localStorage.getItem("hnk_ws_tsize") };
      document.getElementById("prefsTsizeM").onclick(); await settle();
      out.tsizeBack = { cls: document.documentElement.className, fs: getComputedStyle(document.body).fontSize, stored: localStorage.getItem("hnk_ws_tsize"), on: [...document.querySelectorAll("#prefsTsizeRow .chip.on")].map(b => b.id) };
      /* the notify switch: off → on, and the fire rule with a stubbed permission */
      document.getElementById("prefsNotify").onclick(); await settle();
      out.notifyOff = { wanted: notifyWanted(), stored: localStorage.getItem("hnk_ws_notify"), word: txt("prefsNotify"), nOff: L9(PREFS_W.nOff), on: document.getElementById("prefsNotify").classList.contains("on") };
      document.getElementById("prefsNotify").onclick(); await settle();
      out.notifyOn = { wanted: notifyWanted(), stored: localStorage.getItem("hnk_ws_notify"), word: txt("prefsNotify") };
      const fired = []; const RealN = window.Notification;
      const grab = function (t, opts) { fired.push({ title: t, body: opts && opts.body, page: opts && opts.data && opts.data.page, tag: opts && opts.tag }); };
      window.Notification = function (t, opts) { grab(t, opts); this.close = function () { }; };
      window.Notification.permission = "granted";
      /* both roads: the service worker's showNotification (when the worker controls the page) and the plain Notification */
      try { Object.defineProperty(navigator.serviceWorker, "ready", { configurable: true, value: Promise.resolve({ showNotification: function (t, opts) { grab(t, opts); return Promise.resolve(); } }) }); } catch (e) { }
      const _hf = document.hasFocus;
      out.notifyFocused = notifyDone("video");                       /* the tab is in front: nothing fires */
      document.hasFocus = function () { return false; };
      out.notifyAway = notifyDone("talk");                           /* the student is elsewhere: one notification, to the Talk page */
      await settle();
      document.hasFocus = _hf; window.Notification = RealN; try { delete navigator.serviceWorker.ready; } catch (e) { }
      out.fired = fired; out.want = { title: L9(NOTIFY_W.title), talk: L9(NOTIFY_W.talk) };
      /* the frame hand-off from a real, decodable clip */
      const c = document.createElement("canvas"); c.width = 64; c.height = 48; const g = c.getContext("2d");
      const rec = new MediaRecorder(c.captureStream(20), { mimeType: "video/webm" }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data); rec.start(100);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#c9a24a" : "#203040"; g.fillRect(0, 0, 64, 48); await new Promise(r => setTimeout(r, 50)); }
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      const blob = new Blob(chunks, { type: "video/webm" });
      switchPage("pgVideo"); state.vidHist = [{ url: "", blob, id: "w1", ts: Date.now() }]; state.vidHistSel = 0; showVidResult(false); await settle();
      out.chips = [...document.querySelectorAll("#vidSendRow .vid-send-btn")].map(b => [b.getAttribute("data-send"), b.textContent.trim()]);
      out.chipWords = [vwizL("grabTalk"), vwizL("grabImg1")];
      toasts.length = 0; state.tkImg = null; document.querySelector('#vidSendRow [data-send="talk"]').click(); await until(() => !!state.tkImg); await settle();
      out.grabTalk = { img: state.tkImg && { mime: state.tkImg.mime, len: state.tkImg.b64.length, name: state.tkImg.name }, page: curPage, toasts: toasts.slice() };
      toasts.length = 0; switchPage("pgVideo"); await settle(); state.refs[0] = null; document.querySelector('#vidSendRow [data-send="img1"]').click(); await until(() => !!state.refs[0]); await settle();
      out.grabImg1 = { ref: state.refs[0] && { mime: state.refs[0].mime, label: state.refs[0].label, len: state.refs[0].b64.length }, page: curPage, toasts: toasts.slice() };
      /* a clip that will not decode: grabFail, nothing set */
      toasts.length = 0; switchPage("pgVideo"); state.vidHist = [{ url: "", blob: new Blob([Uint8Array.from(atob("AAAAHGZ0eXBpc29t"), ch => ch.charCodeAt(0))], { type: "video/mp4" }), id: "bad", ts: Date.now() }]; state.vidHistSel = 0; showVidResult(false); await settle();
      state.tkImg = null; const okBad = await vidSendTo("talk", state.vidHist[0], "video", false);
      out.grabBad = { ok: okBad, img: state.tkImg, page: curPage, toasts: toasts.slice(), want: vwizL("grabFail") };
      return out;
    }, PX);
    report("B1) Gallery tools: the search box wears GAL_W.search, #galKind lists all · image · video · keep and #galSort new · old · big in the language's words, opened on All · Newest, the count reads 2 of 2 and both tiles show",
      o.tools.ph === o.tools.words.search && o.tools.kinds.join() === "all,image,video,keep" && o.tools.sorts.join() === "new,old,big" && o.tools.kindWords[0] === o.tools.words.kAll && o.tools.kindWords[3] === o.tools.words.kKeep && o.tools.sortWords[0] === o.tools.words.sNew &&
      o.tools.kind === "all" && o.tools.sort === "new" && /^2 \/ 2/.test(o.tools.count) && o.tools.tiles === 2, o.tools);
    report("B2) search \"night\" leaves one result (the night market) and one tile, count 1 of 2; \"zzz\" leaves none and the count adds the no-match line while the grid stays (galEmpty off — the gallery is not empty); clearing restores both",
      o.search.shown === 1 && o.search.tiles === 1 && /^1 \/ 2/.test(o.search.count) && o.search.prompt === "night market street" &&
      o.nomatch.shown === 0 && /^0 \/ 2/.test(o.nomatch.count) && o.nomatch.count.indexOf(o.tools.words.none) > 0 && o.nomatch.emptyOn === false, { search: o.search, nomatch: o.nomatch });
    report("B3) kind Videos → 0, ★ Starred → 0 (nothing kept), All → 2; sort Oldest reverses Newest",
      o.kindVideo === 0 && o.kindKeep === 0 && o.sortNew.join("|") === "night market street|golden veil portrait" && o.sortOld.join("|") === "golden veil portrait|night market street", { kv: o.kindVideo, kk: o.kindKeep, n: o.sortNew, old: o.sortOld });
    report("B4) Home: the recent-results strip under Continue shows both tiles (newest first, each carrying its record id) under GAL_W.recent; a tap on the second opens the Gallery with that record selected",
      o.home.strip && o.home.n === 2 && o.home.h === o.home.word && o.home.shown === "" && o.home.gids.length === 2 && o.homeTap && o.homeTap.page === "pgGallery" && o.homeTap.picked === "golden veil portrait" && o.homeTap.pickedId === o.home.gids[1] && /\bon\b/.test(o.homeTap.pickOn), { home: o.home, tap: o.homeTap });
    report("B5) Setup ▸ SETTINGS: the card wears PREFS_W.h2, the Text size row Small · Normal* · Large, the notify chip ON with PREFS_W.nOn and a note that names the browser's permission state",
      o.prefs.h2 === o.prefs.h2Word && o.prefs.chips.join("|") === o.prefs.words.join("|") && o.prefs.notify === o.prefs.nOn && o.prefs.notifyOn && o.prefs.wanted && o.prefs.notes.indexOf(o.prefs.note) >= 0 && o.prefs.lbl.length > 0, o.prefs);
    report("B6) Text size: Large puts tsize-l on <html>, the body grows 15 → 17px and a .mut label with it, hnk_ws_tsize = l and the Large chip is the one on; Small → 13.5px / s; Normal clears the class and stores m",
      o.tsize.cls === "tsize-l" && o.tsize.fs0 === "15px" && o.tsize.fs === "17px" && parseFloat(o.tsize.mut) > parseFloat(o.tsize.mut0) && o.tsize.stored === "l" && o.tsize.on.join() === "prefsTsizeL2" &&
      o.tsizeS.cls === "tsize-s" && o.tsizeS.fs === "13.5px" && o.tsizeS.stored === "s" && o.tsizeBack.cls === "" && o.tsizeBack.fs === "15px" && o.tsizeBack.stored === "m" && o.tsizeBack.on.join() === "prefsTsizeM", { l: o.tsize, s: o.tsizeS, m: o.tsizeBack });
    report("B7) Notifications: the chip toggles hnk_ws_notify 0 ↔ 1 with nOff / nOn; notifyDone fires nothing while the tab has the focus, and once — title NOTIFY_W.title, body the Talk line, data.page pgTalk, tag hnk-done-talk — when the student is elsewhere with permission granted",
      !o.notifyOff.wanted && o.notifyOff.stored === "0" && o.notifyOff.word === o.notifyOff.nOff && !o.notifyOff.on && o.notifyOn.wanted && o.notifyOn.stored === "1" && o.notifyOn.word === o.prefs.nOn &&
      o.notifyFocused === false && o.notifyAway === true && o.fired.length === 1 && o.fired[0].title === o.want.title && o.fired[0].body === o.want.talk && o.fired[0].page === "pgTalk" && o.fired[0].tag === "hnk-done-talk", { off: o.notifyOff, on: o.notifyOn, focused: o.notifyFocused, away: o.notifyAway, fired: o.fired });
    report("B8) Frame hand-off: the Video box carries up · v2v · talk · img1, the two frame chips worded grabTalk / grabImg1; Frame → Talking Photo sets state.tkImg to a JPEG named hnk-video-<ts>.jpg and opens Talk; Frame → IMAGE 1 sets state.refs[0] (JPEG, .jpg label) and opens Freeform; a clip that will not decode toasts grabFail, sets nothing and stays",
      o.chips.map(c => c[0]).join() === "up,v2v,talk,img1" && o.chips[2][1] === o.chipWords[0] && o.chips[3][1] === o.chipWords[1] &&
      o.grabTalk.img && o.grabTalk.img.mime === "image/jpeg" && o.grabTalk.img.len > 200 && /^hnk-video-\d+\.jpg$/.test(o.grabTalk.img.name) && o.grabTalk.page === "pgTalk" && o.grabTalk.toasts.some(t => t[1] === "ok") &&
      o.grabImg1.ref && o.grabImg1.ref.mime === "image/jpeg" && /^hnk-video-\d+\.jpg$/.test(o.grabImg1.ref.label) && o.grabImg1.ref.len > 200 && o.grabImg1.page === "pgCreate" &&
      o.grabBad.ok === false && o.grabBad.img === null && o.grabBad.page === "pgVideo" && o.grabBad.toasts.some(t => t[0] === o.grabBad.want && t[1] === "err"), { chips: o.chips, talk: o.grabTalk, img1: o.grabImg1, bad: o.grabBad });
    report("B9) nothing threw in the app while all of that ran", errs.length === 0, errs);
  } finally { await page.close(); }
}

/* ================= C) the panel, in the harness ================= */
function panelServer() {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
}
async function panelPage(browser, port, errs, noPlayer) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.route("**/*", r => {
    const u = r.request().url();
    if (u.indexOf("127.0.0.1") >= 0) return r.continue();
    if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(UXP_STUB);
  /* the in-memory data folder — the harness stub's createFile hands back the settings file, so the gallery would hold nothing */
  await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
  if (noPlayer) await page.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = function () { return ""; }; });
  await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 20000 })
    .catch(() => { throw new Error("the panel never reached its signed-in state"); });
  return page;
}
async function panelWalk(browser) {
  const server = panelServer();
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const errs = [];
  const page = await panelPage(browser, port, errs, false);
  try {
    const o = await page.evaluate(async (PX) => {
      const out = {};
      const settle = () => new Promise(r => setTimeout(r, 250));
      const until = f => new Promise(r => { const t0 = Date.now(); (function w() { if (f() || Date.now() - t0 > 8000) r(); else setTimeout(w, 40); })(); });
      const txt = id => (document.getElementById(id) || { textContent: "" }).textContent.trim();
      const tiles = () => document.querySelectorAll("#galGrid img, #galGrid .gal-vid").length;
      const gs = window.HNK.galleryStore;
      out.videoOk = VIDEO_OK;
      /* two pictures + one video take in the store */
      await gs.save(PX, "png", "imagine"); await new Promise(r => setTimeout(r, 30)); await gs.save(PX, "png", "path");
      switchPage("talk"); await settle();
      tkTakes.record({ url: "", ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", name: "talk-1.mp4", folder: "", folderPath: "", tool: "talk", ts: Date.now() }); await settle();
      /* gallery tools */
      switchPage("gallery"); await until(() => GAL.files.length >= 3); await settle();
      const kSel = document.getElementById("galKind"), sSel = document.getElementById("galSort");
      out.gal = { n: GAL.files.length, ph: document.getElementById("galSearch").placeholder, kinds: [...kSel.options].map(x => x.value), kindWords: [...kSel.options].map(x => x.textContent), kindVal: txt("galKindVal"), sorts: [...sSel.options].map(x => x.value), sortVal: txt("galSortVal"), count: txt("galCount"), tiles: tiles(), words: { search: ff9(GAL_L.search), kAll: ff9(GAL_L.kAll), kVid: ff9(GAL_L.kVid), kKeep: ff9(GAL_L.kKeep), sNew: ff9(GAL_L.sNew), sOld: ff9(GAL_L.sOld), none: ff9(GAL_L.none) }, hslBtn: !!document.querySelector("#galKindHsl .hsl-btn"), parked: getComputedStyle(kSel).position };
      kSel.value = "video"; kSel.dispatchEvent(new Event("change", { bubbles: true })); await until(() => GAL.shown.length === 1); await settle();
      out.kindVid = { shown: GAL.shown.length, tiles: tiles(), count: txt("galCount"), val: txt("galKindVal"), name: GAL.shown[0] && GAL.shown[0].name };
      kSel.value = "image"; kSel.dispatchEvent(new Event("change", { bubbles: true })); await until(() => GAL.shown.length === 2); await settle(); out.kindImg = GAL.shown.length;
      kSel.value = "keep"; kSel.dispatchEvent(new Event("change", { bubbles: true })); await until(() => GAL.shown.length === 0); await settle(); out.kindKeep = GAL.shown.length;
      kSel.value = "all"; kSel.dispatchEvent(new Event("change", { bubbles: true })); await until(() => GAL.shown.length === 3); await settle();
      const sIn = document.getElementById("galSearch"); sIn.value = "zzzz"; sIn.dispatchEvent(new Event("input")); await until(() => GAL.shown.length === 0); await settle();
      out.search = { shown: GAL.shown.length, count: txt("galCount"), tiles: tiles() };
      sIn.value = "talk"; sIn.dispatchEvent(new Event("input")); await until(() => GAL.shown.length === 1); await settle(); out.searchTalk = { shown: GAL.shown.length, name: GAL.shown[0] && GAL.shown[0].name };
      sIn.value = ""; sIn.dispatchEvent(new Event("input")); await until(() => GAL.shown.length === 3); await settle();
      out.sortNew = { sort: GAL.sort, names: GAL.shown.map(f => f.name) };
      sSel.value = "old"; sSel.dispatchEvent(new Event("change", { bubbles: true })); await settle(); await settle();
      out.sortOld = { sort: GAL.sort, names: GAL.shown.map(f => f.name), val: txt("galSortVal") };
      sSel.value = "new"; sSel.dispatchEvent(new Event("change", { bubbles: true })); await settle();
      /* the picker dialog behind the .hsl button */
      document.getElementById("galSortBtn").click(); await until(() => !!document.getElementById("hnkPick")); await settle();
      const dlg = document.getElementById("hnkPick");
      out.pick = { open: !!dlg, rows: dlg ? [...dlg.querySelectorAll(".hnk-pick-row, [data-value]")].length : 0 };
      if (window.HNK.hslPicker && window.HNK.hslPicker.close) window.HNK.hslPicker.close(); await settle();
      /* Home: the strip, then a tap */
      switchPage("aitools"); await settle(); const aiApp = window.HNK.aiToolsApp; aiApp.navigate("home"); await until(() => !!document.getElementById("dashRecent") && document.getElementById("dashRecent").children.length >= 3); await settle();
      const strip = document.getElementById("dashRecent");
      out.home = { strip: !!strip, card: !!document.getElementById("hnkDashRecent"), n: strip ? strip.children.length : 0, h: strip && strip.previousSibling ? strip.previousSibling.textContent : "", word: ff9(GAL_L.recent), names: strip ? [...strip.children].map(c => c.getAttribute("data-name")) : [] };
      if (strip) { strip.children[0].click(); await until(() => state.page === "gallery" && !!GAL.pick); await settle(); out.homeTap = { page: state.page, pick: GAL.pick, pickShown: document.getElementById("galPick").style.display }; }
      /* Setup ▸ SETTINGS: text size */
      switchPage("setup"); await settle();
      out.prefs = { h2: txt("prefsH2"), h2Word: ff9(PREFS_L.h2), lbl: txt("prefsTsizeL"), lblWord: ff9(PREFS_L.tsize), chips: [...document.querySelectorAll("#prefsTsizeRow .chip")].map(b => b.textContent + (/\bon\b/.test(b.className) ? "*" : "")), words: [ff9(PREFS_L.s), ff9(PREFS_L.m) + "*", ff9(PREFS_L.l)], afterData: document.getElementById("cardPrefs").previousElementSibling.id, beforePlat: document.getElementById("cardPrefs").nextElementSibling.id };
      const fs0 = getComputedStyle(document.body).fontSize, btn0 = getComputedStyle(document.querySelector("#pageSetup .btn")).fontSize;
      document.getElementById("prefsTsizeL2").click(); await settle();
      out.tsize = { cls: document.body.className, fs0, fs: getComputedStyle(document.body).fontSize, btn0, btn: getComputedStyle(document.querySelector("#pageSetup .btn")).fontSize, state: state.tsize, get: window.HNK.textSize.get(), on: [...document.querySelectorAll("#prefsTsizeRow .chip")].filter(b => /\bon\b/.test(b.className)).map(b => b.id) };
      document.getElementById("prefsTsizeS").click(); await settle();
      out.tsizeS = { cls: document.body.className, fs: getComputedStyle(document.body).fontSize, state: state.tsize };
      window.HNK.textSize.set("m"); await settle();
      out.tsizeBack = { cls: document.body.className, fs: getComputedStyle(document.body).fontSize, on: [...document.querySelectorAll("#prefsTsizeRow .chip")].filter(b => /\bon\b/.test(b.className)).map(b => b.id) };
      /* drag & drop: a PNG onto the Talk photo pick, the studio PHOTO card and the Freeform slots */
      const bytes = Uint8Array.from(atob(PX), ch => ch.charCodeAt(0));
      const mkDrop = (name) => { const dt = new DataTransfer(); dt.items.add(new File([bytes], name, { type: "image/png" })); return new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }); };
      out.dropRow0 = hnkDropRow();
      switchPage("talk"); await settle(); TK.img = null;
      const tkBtn = document.getElementById("btnTkImgPick");
      tkBtn.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })); out.dropOver = /\bdrop-on\b/.test(tkBtn.className);
      tkBtn.dispatchEvent(mkDrop("face.png")); await until(() => !!TK.img); await settle();
      out.dropTalk = { img: TK.img && { name: TK.img.name, isFile: typeof TK.img.arrayBuffer === "function" }, cls: /\bdrop-on\b/.test(tkBtn.className), row: hnkDropRow() };
      let dataUrl = null; try { dataUrl = await fileToDataUrl(TK.img); } catch (e) { out.dropTalkReadErr = String(e); }
      out.dropTalkRead = dataUrl ? dataUrl.slice(0, 22) : null;
      state.refs[0] = null; document.getElementById("stPicker").dispatchEvent(mkDrop("photo.png")); await until(() => !!state.refs[0]); await settle();
      out.dropStudio = { ref: state.refs[0] && { mime: state.refs[0].mime, label: state.refs[0].label, b64len: state.refs[0].b64.length }, row: hnkDropRow() };
      switchPage("aitools"); await settle(); aiApp.navigate("free-generate"); await until(() => !!document.querySelector(".hnk-slots")); await new Promise(r => setTimeout(r, 400));
      const slots = document.querySelector(".hnk-slots"); const before = slots ? slots.querySelectorAll(".hnk-slot").length : -1;
      if (slots) { slots.dispatchEvent(mkDrop("ref.png")); await until(() => slots.querySelectorAll(".hnk-slot").length > before); await settle(); }
      out.dropFree = { slots: !!slots, before, after: slots ? slots.querySelectorAll(".hnk-slot").length : -1, row: hnkDropRow() };
      switchPage("setup"); await settle(); out.stRow = selfTestRows().filter(r => r.label === "Drag & drop")[0];
      /* the frame hand-off from a real, decodable clip */
      const c = document.createElement("canvas"); c.width = 64; c.height = 48; const g = c.getContext("2d");
      const rec = new MediaRecorder(c.captureStream(20), { mimeType: "video/webm" }); const chunks = []; rec.ondataavailable = e => chunks.push(e.data); rec.start(100);
      for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? "#c9a24a" : "#203040"; g.fillRect(0, 0, 64, 48); await new Promise(r => setTimeout(r, 50)); }
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      const blob = new Blob(chunks, { type: "video/webm" });
      const webmUrl = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
      const statuses = []; const _ss = setStatus; setStatus = function (m, k) { statuses.push([String(m), k || ""]); return _ss.apply(this, arguments); };
      switchPage("video"); await settle(); vidHist.unshift({ url: "", ref: webmUrl, name: "vid-9.mp4", ts: Date.now() }); vidHistSel = 0; showVidResult(); await settle();
      out.frameBtns = { talk: document.getElementById("btnVidSendTalk").style.display, img1: document.getElementById("btnVidSendImg1").style.display, words: [txt("btnVidSendTalk"), txt("btnVidSendImg1")], want: [vwizL("grabTalk"), vwizL("grabImg1")], vu: document.getElementById("btnVuSendTalk").style.display };
      statuses.length = 0; TK.img = null; document.getElementById("btnVidSendTalk").click(); await until(() => !!TK.img); await settle();
      out.grabTalk = { img: TK.img && { name: TK.img.name, mime: TK.img.mime, hasB64: !!(TK.img.b64 && TK.img.b64.length > 200) }, page: state.page, statuses: statuses.slice() };
      statuses.length = 0; switchPage("video"); await settle(); state.refs[0] = null; document.getElementById("btnVidSendImg1").click(); await until(() => !!state.refs[0]); await settle();
      out.grabImg1 = { ref: state.refs[0] && { mime: state.refs[0].mime, label: state.refs[0].label, hasB64: !!(state.refs[0].b64 && state.refs[0].b64.length > 200) }, page: state.page };
      /* a take that will not decode */
      statuses.length = 0; switchPage("video"); await settle(); vidHist.unshift({ url: "", ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", name: "vid-bad.mp4", ts: Date.now() }); vidHistSel = 0; showVidResult(); await settle();
      TK.img = null; const okBad = await vidSendTo("talk", vidHist[0], "video", false);
      out.grabBad = { ok: okBad, img: TK.img, page: state.page, statuses: statuses.slice(), want: vwizL("grabFail") };
      return out;
    }, PX);
    report("C1) Gallery tools: three files (two pictures + the Talk take), the search placeholder GAL_L.search, #galKind all · image · video · keep behind an .hsl button showing GAL_L.kAll, #galSort new · old · big showing GAL_L.sNew, the native selects parked (position absolute), count 3 of 3, three tiles",
      o.gal.n === 3 && o.gal.ph === o.gal.words.search && o.gal.kinds.join() === "all,image,video,keep" && o.gal.kindWords[0] === o.gal.words.kAll && o.gal.kindWords[3] === o.gal.words.kKeep && o.gal.kindVal === o.gal.words.kAll &&
      o.gal.sorts.join() === "new,old,big" && o.gal.sortVal === o.gal.words.sNew && o.gal.hslBtn && o.gal.parked === "absolute" && /^3 \/ 3/.test(o.gal.count) && o.gal.tiles === 3, o.gal);
    report("C2) kind Videos → the one take (1 tile, count 1 of 3, the button reads GAL_L.kVid); Photos → 2; ★ Starred → 0; All → 3; search \"zzzz\" → 0 with the no-match line; \"talk\" finds the take; Oldest reverses Newest and the sort button follows",
      o.kindVid.shown === 1 && o.kindVid.tiles === 1 && /^1 \/ 3/.test(o.kindVid.count) && o.kindVid.val === o.gal.words.kVid && /\.mp4$/.test(o.kindVid.name) && o.kindImg === 2 && o.kindKeep === 0 &&
      o.search.shown === 0 && o.search.tiles === 0 && /^0 \/ 3/.test(o.search.count) && o.search.count.indexOf(o.gal.words.none) > 0 && o.searchTalk.shown === 1 && /^talk-/.test(o.searchTalk.name) &&
      o.sortNew.sort === "new" && o.sortOld.sort === "old" && o.sortOld.names.join("|") === o.sortNew.names.slice().reverse().join("|") && o.sortOld.val === o.gal.words.sOld, { vid: o.kindVid, img: o.kindImg, keep: o.kindKeep, search: o.search, talk: o.searchTalk, n: o.sortNew, old: o.sortOld });
    report("C3) the sort button opens the panel's own <dialog id=hnkPick> (a native select never opens in Photoshop)", o.pick.open, o.pick);
    report("C4) Home: #hnkDashRecent under the AI Tools home carries the three newest results (data-name each) under GAL_L.recent; a tap on the first opens the Gallery with that file picked",
      o.home.strip && o.home.card && o.home.n === 3 && o.home.h === o.home.word && o.home.names.every(n => !!n) && o.homeTap && o.homeTap.page === "gallery" && o.homeTap.pick === o.home.names[0] && o.homeTap.pickShown === "", { home: o.home, tap: o.homeTap });
    report("C5) Setup ▸ SETTINGS: the card sits between DATA and the platform card, wears PREFS_L.h2 and the Text size label, chips Small · Normal* · Large",
      o.prefs.afterData === "cardData" && o.prefs.beforePlat === "cardPlat" && o.prefs.h2 === o.prefs.h2Word && o.prefs.lbl === o.prefs.lblWord && o.prefs.chips.join("|") === o.prefs.words.join("|"), o.prefs);
    report("C6) Text size: Large puts tsize-l on <body>, the body 12 → 14px and a .btn 13 → 14.5px, state.tsize = HNK.textSize.get() = l, the Large chip on; Small → 11px / s; set(m) clears the class and the Normal chip is on",
      o.tsize.cls.split(/\s+/).indexOf("tsize-l") >= 0 && o.tsize.fs0 === "12px" && o.tsize.fs === "14px" && o.tsize.btn === "14.5px" && parseFloat(o.tsize.btn) > parseFloat(o.tsize.btn0) && o.tsize.state === "l" && o.tsize.get === "l" && o.tsize.on.join() === "prefsTsizeL2" &&
      o.tsizeS.cls.split(/\s+/).indexOf("tsize-s") >= 0 && o.tsizeS.fs === "11px" && o.tsizeS.state === "s" && !/tsize-/.test(o.tsizeBack.cls) && o.tsizeBack.fs === "12px" && o.tsizeBack.on.join() === "prefsTsizeM", { l: o.tsize, s: o.tsizeS, m: o.tsizeBack });
    report("C7) Drag & drop: before any drop the row is pend (6 targets bound · no file dropped yet); dragover frames the Talk pick gold; a PNG dropped there becomes TK.img (a DOM File) that fileToDataUrl reads as data:image/png, the frame gone, the row ok naming face.png; one dropped on the studio PHOTO card lands in subject-reference (IMAGE 1 = photo.png); one dropped on the Freeform slots adds a slot and the row counts that seventh target (7 targets · last file ref.png)",
      o.dropRow0 && o.dropRow0.level === "pend" && /^6 targets bound/.test(o.dropRow0.detail) && o.dropOver === true &&
      o.dropTalk.img && o.dropTalk.img.name === "face.png" && o.dropTalk.img.isFile && o.dropTalk.cls === false && o.dropTalk.row.level === "ok" && /^6 targets · last file face\.png · 0 KB$/.test(o.dropTalk.row.detail) && o.dropTalkRead === "data:image/png;base64," &&
      o.dropStudio.ref && o.dropStudio.ref.mime === "image/png" && o.dropStudio.ref.label === "photo.png" && o.dropStudio.ref.b64len === PX.length && /photo\.png/.test(o.dropStudio.row.detail) &&
      o.dropFree.slots && o.dropFree.after === o.dropFree.before + 1 && o.dropFree.row.level === "ok" && /^7 targets · last file ref\.png · 0 KB$/.test(o.dropFree.row.detail), { row0: o.dropRow0, over: o.dropOver, talk: o.dropTalk, read: o.dropTalkRead, err: o.dropTalkReadErr, studio: o.dropStudio, free: o.dropFree });
    report("C8) SELF-TEST carries the Drag & drop row, ok, naming the last file (ref.png)", o.stRow && o.stRow.level === "ok" && /last file ref\.png/.test(o.stRow.detail), o.stRow);
    report("C9) Frame hand-off (this Chromium decodes, VIDEO_OK): the Video box shows Frame → Talking Photo · Frame → IMAGE 1 (the Upscale box's too) worded from the lifted pack; Frame → Talking Photo sets TK.img to a JPEG named hnk-video-<ts>.jpg and opens Talk with sentTo; Frame → IMAGE 1 sets state.refs[0] and opens Freeform; a take that will not decode sets nothing, stays, and says grabFail",
      o.videoOk === true && o.frameBtns.talk === "" && o.frameBtns.img1 === "" && o.frameBtns.vu === "" && o.frameBtns.words.join("|") === o.frameBtns.want.join("|") &&
      o.grabTalk.img && /^hnk-video-\d+\.jpg$/.test(o.grabTalk.img.name) && o.grabTalk.img.mime === "image/jpeg" && o.grabTalk.img.hasB64 && o.grabTalk.page === "talk" && o.grabTalk.statuses.some(s => s[1] === "ok") &&
      o.grabImg1.ref && o.grabImg1.ref.mime === "image/jpeg" && /^hnk-video-\d+\.jpg$/.test(o.grabImg1.ref.label) && o.grabImg1.ref.hasB64 && o.grabImg1.page === "prompt" &&
      o.grabBad.ok === false && o.grabBad.img === null && o.grabBad.page === "video" && o.grabBad.statuses.some(s => s[0] === o.grabBad.want && s[1] === "err"), { btns: o.frameBtns, talk: o.grabTalk, img1: o.grabImg1, bad: o.grabBad });
    report("C10) nothing threw in the panel while all of that ran", errs.length === 0, errs);
  } finally { await page.close(); }
  /* the same panel where <video> does not decode: the frame chips are not offered */
  const errs2 = [];
  const page2 = await panelPage(browser, port, errs2, true);
  try {
    const q = await page2.evaluate(async () => {
      const settle = () => new Promise(r => setTimeout(r, 250));
      switchPage("video"); await settle(); vidHist.unshift({ url: "", ref: "data:video/mp4;base64,AAAAHGZ0eXBpc29t", name: "vid-1.mp4", ts: Date.now() }); vidHistSel = 0; showVidResult(); await settle();
      let err = null; try { await vidGrabFrameP("data:video/mp4;base64,AAAAHGZ0eXBpc29t"); } catch (e) { err = String(e && e.message); }
      return { videoOk: VIDEO_OK, talk: document.getElementById("btnVidSendTalk").style.display, img1: document.getElementById("btnVidSendImg1").style.display, up: document.getElementById("btnVidSendUp").style.display, err };
    });
    report("C11) without a player (canPlayType empty → VIDEO_OK false) the two frame buttons stay hidden while Send to Upscale shows, and vidGrabFrameP refuses with no-player before touching a <video>",
      q.videoOk === false && q.talk === "none" && q.img1 === "none" && q.up !== "none" && q.err === "no-player" && errs2.length === 0, { q, errs: errs2 });
  } finally { await page2.close(); server.close(); }
}

/* ================= D) the release ================= */
function releasePins() {
  const ver = JSON.parse(read("docs/app/version.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json")), rm = JSON.parse(read("panel/release-manifest.json"));
  const appVer = ver.v, panVer = rm.version;
  report("D1) the release: app " + appVer + " / panel " + panVer + " agree across version.json, APP_VER, docs/download/panel-version.json and the release manifest; CI runs this test right after verify_clip_handoff_694; the landing counts at least 231 tests; What's New carries the " + appVer + " row on both surfaces",
    /^6\.9[5-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) && APP.indexOf('APP_VER="' + appVer + '"') > 0 && pv.v === panVer && pv.latest_version === panVer && /^6\.16[6-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    CI.indexOf("node test/verify_convenience_695.js") > CI.indexOf("node test/verify_clip_handoff_694.js") && (parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10) >= 231) &&
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
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — the six conveniences are on both surfaces: gallery search · filter · sort, ready notifications, the Home recent strip, frame → Talking Photo / IMAGE 1, drag & drop into every panel slot, and the text size");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
