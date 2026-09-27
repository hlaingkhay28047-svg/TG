/* 6.146.0 / panel 6.217.0 — PORTRAIT STYLE: THE STUDIO CAMERA, the history's delete, the share sizes.
 *
 * THE OWNER'S ASK. Delete on the results history. Mac / Windows tethering over USB and wireless, every camera
 * model — Nikon, Canon, Sony, Fuji — and every phone. Exposure and looks set from the camera's live view, the
 * wanted style shown IN the live preview, and a share to Facebook and TikTok straight from the result.
 *
 * WHAT SHIPS, on both surfaces from the one lifted module:
 *  · Step 01's TETHER CARD (psTether): Camera · Live (the web host's camera sheet), Hot folder (the folder the
 *    maker's tether software saves into — EOS Utility, NX Tether, Imaging Edge, X Acquire, Lightroom / Capture
 *    One — polled for new shots: the File System Access API on the web, UXP's folder on the panel), "Auto-style
 *    each new shot" (the chosen reference runs on every arrival; shots that arrive while one runs wait in a
 *    queue), and the CONNECTION GUIDE for Canon · Nikon · Sony · Fujifilm · phones (USB Live / USB Tether /
 *    Wi-Fi), nine languages.
 *  · The web host's CAMERA SHEET v2: any video input by name (the maker's free webcam utilities put a DSLR /
 *    mirrorless on USB in the browser's device list; an HDMI capture card too), eight live looks (one matches
 *    the reference's tone from its pixels), exposure · contrast · warmth · soft skin baked into the JPEG, the
 *    reference as a GHOST overlay for pose and framing, a thirds grid, a mirror, a 3 s timer. Snap · Flip ·
 *    Cancel keep their ids.
 *  · Step 03: a × on every version, Clear history with a two-tap confirm, the SHARE SIZES (original · 9:16
 *    TikTok / Reels · 4:5 Facebook / IG · 1:1) cut from the middle for Download / Place and for SHARE (the
 *    phone's own share sheet through the Web Share API; a browser that cannot share files downloads instead).
 *  · The PWA is a SHARE TARGET: the camera's own app (Camera Connect, SnapBridge, Creators' App, XApp) puts
 *    the shot in the phone's gallery; the phone shares it to HNK; the service worker keeps it in a one-slot
 *    inbox and the app opens on Portrait Style with the shot on step 01 — auto-style may run it at once.
 *  · The recent strips carry a × too.
 *
 * A) the source on both surfaces and the lift in sync   B) the web app driven with a mocked RunningHub, a fake
 * camera, a fake directory picker and a stubbed share sheet   C) the panel with a fake UXP folder   D) What's
 * New   E) release pins   F) the service worker's share branch in a sandbox
 * Usage: PORT=8931 node test/verify_pstyle_camera_6146.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http"), vm = require("vm");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");
const lifter = require("../tools/build_panel_pstyle.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const SW = read("docs/app/sw.js");
const MANIFEST = JSON.parse(read("docs/app/manifest.webmanifest"));
const MAIN = read("panel/main.js");
const PANEL_JS = read("panel/js/hnk_pstyle.js");
const PANEL_CSS = read("panel/styles.css");
const PARITY = read("test/verify_panel_page_parity.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.146.0", PVER = "6.217.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.146.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 288;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PHOTO = fs.readFileSync(path.join(ROOT, "tools", "art_ref", "hnk-model.jpg")).toString("base64");
const UI_KEYS = ["tether_h3", "tether_intro", "connect_cam", "hot_folder", "hot_pick", "hot_hint", "hot_watching", "hot_stop", "hot_no", "auto_style", "auto_style_hint", "queue_n",
  "cam_guide", "guide_usb", "guide_tether", "guide_wireless", "guide_note", "guide_phone_h", "cam_device", "cam_look", "cam_exposure", "cam_contrast", "cam_warmth", "cam_soft", "cam_ghost",
  "cam_grid", "cam_mirror", "cam_timer", "cam_no_devices", "share", "share_hint", "social_full", "social_916", "social_45", "social_11", "shared_ok", "share_dl", "clear_hist", "clear_sure",
  "ver_remove", "recent_remove", "shared_in", "cam_auto"];

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 900)));
  if (!ok) failures++;
}
const hostSlice = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? "" : s.slice(i, s.indexOf(b, i)); };
const tx = (n) => ((n && n.textContent) || "").trim();

/* ---------------- A) the source ---------------- */
function partA() {
  const D = A.readPstyle();
  const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
  const css = lifter.between(APP, lifter.C0, lifter.C1, "css");
  report("A1) the words: " + UI_KEYS.length + " new ui strings in nine languages; five cameras (Canon · Nikon · Sony · Fujifilm · phone) each with a USB Live, a USB Tether and a wireless line; eight live looks with a CSS filter each and one that matches the reference",
    UI_KEYS.every((k) => all9(D.ui[k])) && has(D.ui.hot_watching.en, "{f}") && has(D.ui.hot_watching.en, "{n}") && has(D.ui.clear_sure.en, "{n}") && has(D.ui.queue_n.en, "{n}") &&
    Array.isArray(D.cams) && D.cams.map((c) => c.id).join() === "canon,nikon,sony,fuji,phone" && D.cams.every((c) => c.name && all9(c.usb) && all9(c.tether) && all9(c.wireless)) &&
    has(D.cams[0].usb.en, "EOS Webcam Utility") && has(D.cams[1].usb.en, "Nikon Webcam Utility") && has(D.cams[2].usb.en, "Imaging Edge Webcam") && has(D.cams[3].usb.en, "X Webcam") &&
    Array.isArray(D.looks) && D.looks.map((l) => l.id).join() === "natural,warm,film,clean,cool,moody,bw,match" && D.looks.every((l) => all9(l.name) && typeof l.f === "string" && typeof l.soft === "number") &&
    D.looks[7].f === "match" && D.looks.slice(1, 7).every((l) => /\b(sepia|saturate|contrast|brightness|grayscale|hue-rotate)\(/.test(l.f)),
    { missing: UI_KEYS.filter((k) => !all9(D.ui[k])), cams: (D.cams || []).map((c) => c.id) });

  report("A2) the module: the state carries the hot folder, the queue, auto-style, the guide, the share size and the Clear arm (auto-style and the size persist); the tether card, the shot door, the queue drain, the social crop, the version delete and Clear history exist and are exported; the recent strips take a remover; the panel's copy is today's lift",
    has(mod, 'hot:null, queue:[], autoStyle:false, guide:false, social:"full", clearArm:0 };') &&
    has(mod, 'if(typeof o.autoStyle==="boolean") S.autoStyle=o.autoStyle;') && has(mod, 'if(["full","916","45","11"].indexOf(o.social)>=0) S.social=o.social;') &&
    has(mod, "cmp:S.cmp, autoStyle:S.autoStyle, social:S.social }));") &&
    has(mod, "function tetherCard(){") && has(mod, "function hotPick(){") && has(mod, "function hotStop(){") && has(mod, "function onShot(item){") && has(mod, "function canAuto(){") &&
    has(mod, "if(S.busy){ S.queue.push(item); render(); return; }") && has(mod, "if(!stopped && S.autoStyle && S.queue.length && S.ref){ var nx=S.queue.shift(); setPhoto(nx); setTimeout(run, 50); }") &&
    has(mod, "function socialCrop(v, mode){") && has(mod, 'var SOCIAL={ "916":9/16, "45":4/5, "11":1 };') && has(mod, "function removeVersion(i){") && has(mod, "function clearHistory(){") &&
    has(mod, "function thumbStrip(title, list, onPick, kind, onRemove){") && has(mod, "function dropRecent(list, it, hostFn){") && has(mod, 'w.appendChild(tetherCard());') &&
    has(mod, "onShot:onShot, hotPick:hotPick, hotStop:hotStop, socialCrop:socialCrop, removeVersion:removeVersion, clearHistory:clearHistory") &&
    has(mod, "H.camera(function(item){ S.camOn=false; if(item){ setPhoto(item); if(canAuto()) run(); } else render(); }, ctx);") &&
    has(PANEL_JS, "function tetherCard(){") && has(PANEL_JS, "function socialCrop(v, mode){") && lifter.build({ dry: true }).changed.length === 0, { drift: lifter.build({ dry: true }).changed });

  const host = hostSlice(APP, 'var CAM_KEY="hnk_ps_cam_v1";', 'PSTYLE.init(host, $("psRoot"));');
  report("A3) the web host: the camera sheet v2 takes the reference as context, lists every video input by name and opens a chosen one by exact deviceId (falling back to the facing camera), draws the looks, the sliders, the ghost, the grid, the mirror and the timer, bakes the filter and the soft layer into the JPEG; the hot folder is the directory picker in read mode polled every 2 s; Share goes through the Web Share API with a file and downloads otherwise; both hang on the host",
    has(host, "function camera(done, ctx){") && has(host, "navigator.mediaDevices.enumerateDevices()") && has(host, "deviceId:{ exact:deviceId }") && has(host, "navigator.mediaDevices.getUserMedia({ video:vc, audio:false })") &&
    has(host, 'if(deviceId){ deviceId=""; start(); return; }') &&
    ["psCamDev", "psCamLooks", "psGhost", "psGridOv", "psCount", "psCamExp", "psCamCon", "psCamWarm", "psCamSoft", "psGhostOp", "psGrid", "psMirror", "psTimer", "psSnap", "psFlip", "psCamCancel"].every((id) => has(host, '"' + id + '"')) &&
    has(host, "function toneOf(dataUrl){") && has(host, 'if(lk && lk.f==="match" && matchTone)') && has(host, "cx.filter=filterStr();") && has(host, 'cx.globalCompositeOperation="soft-light"') &&
    has(host, 'close({ dataUrl:du, name:"camera-"+Date.now()+".jpg", w:w, h:h, look:look });') && has(host, 'var CAM_KEY="hnk_ps_cam_v1";') &&
    has(host, 'window.showDirectoryPicker({ mode:"read" })') && has(host, "timer=setInterval(function(){ scan(false); }, 2000);") && has(host, "if(first) continue;") &&
    has(host, "function share(out, name){") && has(host, "navigator.canShare({ files:[file] })") && has(host, 'navigator.share({ files:[file], title:"HNK Portrait Style" })') && has(host, "host.exportOut(out, name); toast(L9(PSTYLE_DATA.ui.share_dl)") &&
    has(APP, "    hotFolder: hotFolder,   /* 6.146.0 */") && has(APP, "    share: (navigator.share ? share : null),"));

  const boot = hostSlice(APP, "var _qp = stNormalizePage(", "} catch(e){}");
  const swPost = SW.indexOf('if (e.request.method === "POST" && url.origin === location.origin && /\\/share$/.test(url.pathname)) {');
  report("A4) the share target: the manifest names ./share (POST, multipart, one image file called photo); the worker's POST branch stands before its GET early-return, keeps the file in the share inbox and redirects to Portrait Style with ?shared=1; the app's boot takes the shot out of the inbox, opens the page, hands it to the shot door and strips the flag",
    MANIFEST.share_target && MANIFEST.share_target.action === "./share" && MANIFEST.share_target.method === "POST" && MANIFEST.share_target.enctype === "multipart/form-data" &&
    MANIFEST.share_target.params && MANIFEST.share_target.params.files && MANIFEST.share_target.params.files[0].name === "photo" && MANIFEST.share_target.params.files[0].accept.join() === "image/*" &&
    swPost > 0 && swPost < SW.indexOf('if (e.request.method !== "GET" || url.origin !== location.origin) return;') &&
    has(SW, 'caches.open("hnk-share-inbox")') && has(SW, 'c.put("./__share_inbox"') && has(SW, 'Response.redirect("./?page=pgPStyle&shared=1", 303)') &&
    has(boot, 'new URLSearchParams(location.search).get("shared") === "1"') && has(boot, 'caches.open("hnk-share-inbox")') && has(boot, 'c.match("./__share_inbox")') && has(boot, 'c.delete("./__share_inbox")') &&
    has(boot, 'switchPage("pgPStyle"); window.HNK.pstyle.onShot({ dataUrl: du, name: "shared-" + Date.now() + ".jpg" });') && has(boot, 'history.replaceState(null, "", location.pathname + "?page=pgPStyle");'));

  const ph = hostSlice(MAIN, "function pstyleHost() {", "function pstyleEnter() {");
  report("A5) the panel host: the hot folder is UXP's folder (getFolder, getEntries every 2.5 s, the existing files left alone, a binary read to a data URL); still no camera, no print, no share — the module draws no Live button and no Share where the host has none",
    has(ph, "hotFolder: {") && has(ph, "const f = await fsp.getFolder();") && has(ph, "(await f.getEntries()).forEach(function (e) { if (e.isFile) seen[e.name] = 1; });") &&
    has(ph, "}, 2500);") && has(ph, "const buf = await e.read({ format: uxp.storage.formats.binary });") && has(ph, 'onShot({ dataUrl: "data:" + extToMime(e.name) + ";base64," + bufToB64(buf), name: e.name });') &&
    has(ph, 'onCtl({ name: f.name || "", stop: function () { clearInterval(timer); } });') &&
    !has(ph, "camera:") && !has(ph, "printOut:") && !has(ph, "share:") &&
    has(mod, "if(H.camera){ var cam=btn(\"chip\", t(\"connect_cam\"), \"i-camera\");") && has(mod, 'if(H.share){ var sh=btn("btn btn-gold", t("share"), "i-external");'));

  report("A6) the CSS: the tether card, the guide, the version ×, the strip × and the share row live in the lifted block and draw on UXP (no grid, no gap, no pointer-events, no object-fit, no inset); the camera sheet's own CSS stays app-only after the block; the panel's stylesheet carries the card; the parity walk names Camera · Live as the web host's own",
    [".ps-tether{", ".ps-guide{", ".ps-guide-cam{", ".ps-ver-x{", ".ps-thw{", ".ps-th-x{", ".ps-share{", ".ps-verhead{", ".ps-hot{"].every((c) => has(css, c)) &&
    !/display:\s*grid/.test(css) && !/\bgap:/.test(css) && !/pointer-events/.test(css) && !/object-fit/.test(css) && !/\binset:/.test(css) &&
    APP.indexOf(".ps-camsheet .ps-camview{") > APP.indexOf(lifter.C1) && has(APP, ".ps-camsheet video.ps-soft{filter:blur(10px);mix-blend-mode:soft-light") && has(APP, ".ps-camsheet .ps-ghost{") && has(APP, ".ps-camsheet .ps-gridov{") &&
    has(PANEL_CSS, "#pagePStyle .ps-tether{") && has(PANEL_CSS, "#pagePStyle .ps-ver-x{") &&
    has(PARITY, 'pstyle: ["ကင်မရာနဲ့ ရိုက်မယ်", "ပြခန်းက ယူမယ်", "ကင်မရာ · Live"],'));
}

/* ---------------- B) the web app ---------------- */
const MOCK = `(function(){
  window.__reqs = []; window.__hang = false; window.__outB64 = "${PNG_B64}";
  var realFetch = window.fetch;
  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf("mock.runninghub.test") >= 0) {
      var bin = atob(window.__outB64), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
    }
    if (u.indexOf("www.runninghub.ai") >= 0) {
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/in.png",fileName:"openapi/in.png",size:"100"}}), {status:200}));
      if (u.indexOf("/openapi/v2/query") >= 0)
        return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u, parseError: String(e) }); }
      if (window.__hang) return new Promise(function(resolve, reject){ if (opts && opts.signal) opts.signal.addEventListener("abort", function(){ var e=new Error("aborted"); e.name="AbortError"; reject(e); }); });
      return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200})); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  window.__dl = []; HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
  /* the phone's share sheet, stubbed: the host sees navigator.share at init and draws the Share button */
  window.__shared = []; window.__canShare = true;
  Object.defineProperty(navigator, "share", { configurable: true, value: function(d){ var f = d && d.files && d.files[0]; window.__shared.push({ name: f && f.name, type: f && f.type, size: f && f.size, title: d && d.title }); return Promise.resolve(); } });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: function(){ return !!window.__canShare; } });
  /* the camera: the fake device is Chromium's; the device LIST is ours, and every getUserMedia constraint is recorded */
  window.__gum = [];
  var md = navigator.mediaDevices, realGum = md.getUserMedia.bind(md);
  md.getUserMedia = function(c){ window.__gum.push(c); return realGum(c); };
  md.enumerateDevices = function(){ return Promise.resolve([{ kind:"videoinput", deviceId:"eos1", label:"EOS Webcam Utility", groupId:"g1" }, { kind:"videoinput", deviceId:"int1", label:"Integrated Camera", groupId:"g2" }, { kind:"audioinput", deviceId:"mic", label:"Mic", groupId:"g3" }]); };
  /* the hot folder: a directory handle whose entries the test adds to */
  window.__hotFiles = []; window.__dirPicks = 0;
  window.showDirectoryPicker = function(o){ window.__dirPicks++; window.__dirOpts = o; return Promise.resolve({ kind:"directory", name:"EOS Utility", values: async function*(){ for (var i=0;i<window.__hotFiles.length;i++) yield window.__hotFiles[i]; } }); };
})();`;

async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: ["camera"] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.addInitScript(MOCK);
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; switchPage("pgPStyle"); });
  await page.waitForTimeout(500);

  const b1 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)], tx = (n) => ((n && n.textContent) || "").trim();
    const out = { tether: !!q("#psTether"), h3: (q("#psTether .ps-h3") || {}).textContent, cam: tx(q("#psTetherCam")), hot: tx(q("#psHot")), auto: q("#psAutoStyle") && q("#psAutoStyle").checked, guideTgl: !!q("#psGuideTgl"), expanded0: q("#psGuideTgl") && q("#psGuideTgl").getAttribute("aria-expanded"), guide0: !!q("#psGuide"), hint: (q("#psTether .ps-hot-hint") || {}).textContent };
    q("#psGuideTgl").click(); await new Promise((r) => setTimeout(r, 120));
    out.expanded1 = q("#psGuideTgl").getAttribute("aria-expanded"); out.cams = qa("#psGuide .ps-guide-cam").map((c) => c.getAttribute("data-cam") + ":" + c.querySelector("b").textContent);
    out.lines = qa('#psGuide .ps-guide-cam[data-cam="canon"] .ps-guide-line').map((l) => l.textContent); out.note = !!q("#psGuide .ps-hint");
    q("#psGuideTgl").click(); await new Promise((r) => setTimeout(r, 120)); out.guide2 = !!q("#psGuide");
    return out;
  });
  report("B1) step 01 carries the tether card: Camera · Live, Hot folder, Auto-style (off), the folder hint, and the connection guide that opens on its chip (aria-expanded) with Canon · Nikon · Sony · Fujifilm · phones, three lines each (USB Live, USB Tether, Wi-Fi), and closes again",
    b1.tether && b1.h3 === "ကင်မရာ ချိတ်ဆက်မယ်" && b1.cam === "ကင်မရာ · Live" && b1.hot === "Hot folder ကြည့်မယ်" && b1.auto === false && b1.guideTgl && b1.expanded0 === "false" && !b1.guide0 && (b1.hint || "").length > 20 &&
    b1.expanded1 === "true" && b1.cams.join("|") === "canon:Canon|nikon:Nikon|sony:Sony|fuji:Fujifilm|phone:ဖုန်းတိုင်း" && b1.lines.length === 3 && has(b1.lines[0], "EOS Webcam Utility") && has(b1.lines[1], "EOS Utility") && has(b1.lines[2], "Camera Connect") && b1.note && !b1.guide2, b1);

  const b2 = await page.evaluate(async (b64) => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    PSTYLE.setPhoto({ dataUrl: "data:image/jpeg;base64," + b64, name: "one.jpg" }); await new Promise((r) => setTimeout(r, 150));
    PSTYLE.setPhoto({ dataUrl: "data:image/png;base64," + window.__outB64, name: "two.png" }); await new Promise((r) => setTimeout(r, 150));
    const out = { hiddenWithPhoto: !q("#psRecent") };
    PSTYLE.state.photo = null; PSTYLE.render(); await new Promise((r) => setTimeout(r, 120));
    out.recent = qa("#psRecent .ps-th").length; out.xs = qa("#psRecent .ps-th-x").length; out.aria = (q("#psRecent .ps-th-x") || { getAttribute: () => null }).getAttribute("aria-label"); out.wrapped = qa("#psRecent .ps-thw .ps-th").length;
    qa("#psRecent .ps-th-x")[0].click(); await new Promise((r) => setTimeout(r, 200));
    out.recentAfter = qa("#psRecent .ps-th").length; out.state = PSTYLE.state.recent.length; out.kv = ((await kvGet("hnk_ps_recent_v1")) || []).length; out.left = PSTYLE.state.recent[0] && PSTYLE.state.recent[0].name;
    return out;
  }, PHOTO);
  report("B2) the recent photos strip (shown on an empty step 01): every thumbnail carries a named × that removes that one — the newest first — from the strip, the state and IndexedDB",
    b2.hiddenWithPhoto && b2.recent === 2 && b2.xs === 2 && b2.wrapped === 2 && b2.aria === "ဒီပုံ စာရင်းက ဖျက်မယ်" && b2.recentAfter === 1 && b2.state === 1 && b2.kv === 1 && b2.left === "one.jpg", b2);

  /* the hot folder: a folder with one old shot; a new shot lands two seconds later */
  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    function pngFile(name) { return new Promise((res) => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d"); x.fillStyle = "#c96"; x.fillRect(0, 0, 64, 48); c.toBlob((b) => res({ kind: "file", name: name, getFile: async () => new File([b], name, { type: "image/png" }) }), "image/png"); }); }
    window.__hotFiles = [await pngFile("old_IMG_0001.jpg")];
    PSTYLE.setStep(1); await new Promise((r) => setTimeout(r, 100));
    q("#psHot").click();
    let t0 = Date.now(); while (Date.now() - t0 < 3000 && !PSTYLE.state.hot) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 120));
    const out = { picks: window.__dirPicks, mode: window.__dirOpts && window.__dirOpts.mode, hot: !!PSTYLE.state.hot, name: PSTYLE.state.hot && PSTYLE.state.hot.name, status0: (q("#psHotStatus") || {}).textContent, chip: tx(q("#psHot")), chipOn: q("#psHot") && q("#psHot").classList.contains("on"), photoBefore: PSTYLE.state.photo && PSTYLE.state.photo.name };
    window.__hotFiles.push(await pngFile("IMG_0002.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 6000 && !(PSTYLE.state.photo && PSTYLE.state.photo.name === "IMG_0002.jpg")) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 150));
    out.arrived = PSTYLE.state.photo && PSTYLE.state.photo.name; out.n = PSTYLE.state.hot && PSTYLE.state.hot.n; out.status1 = (q("#psHotStatus") || {}).textContent; out.step = PSTYLE.state.step; out.oldIgnored = PSTYLE.state.recent.every((r) => r.name !== "old_IMG_0001.jpg");
    q("#psHot").click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !PSTYLE.state.hot; out.chipAfter = tx(q("#psHot"));
    return out;
  });
  report("B3) Hot folder opens the directory picker in read mode, watches the folder (the chip lights and says Stop, the status names the folder), leaves the shot already there alone, and puts the new shot on step 01 within a poll; Stop lets go",
    b3.picks === 1 && b3.mode === "read" && b3.hot && b3.name === "EOS Utility" && has(b3.status0 || "", "EOS Utility") && b3.chip === "ရပ်မယ်" && b3.chipOn &&
    b3.photoBefore === null && b3.arrived === "IMG_0002.jpg" && b3.n === 1 && has(b3.status1 || "", "1") && b3.step === 1 && b3.oldIgnored && b3.stopped && b3.chipAfter === "Hot folder ကြည့်မယ်", b3);

  /* auto-style: a reference chosen, the switch on, two shots in a row — the first runs, the second waits, then runs */
  const b4 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    PSTYLE.setStep(2); await new Promise((r) => setTimeout(r, 120));
    q("#psGrid .ps-card").click(); await new Promise((r) => setTimeout(r, 120));
    PSTYLE.setStep(1); await new Promise((r) => setTimeout(r, 120));
    q("#psAutoStyle").click(); await new Promise((r) => setTimeout(r, 120));
    const out = { ref: PSTYLE.state.ref && PSTYLE.state.ref.kind, auto: PSTYLE.state.autoStyle, saved: (JSON.parse(localStorage.getItem("hnk_ps_v1") || "{}")).autoStyle, reqs0: window.__reqs.length };
    const du = "data:image/png;base64," + window.__outB64;
    PSTYLE.onShot({ dataUrl: du, name: "IMG_0003.jpg" });
    out.busyAtOnce = PSTYLE.state.busy; out.stepAtOnce = PSTYLE.state.step;
    PSTYLE.onShot({ dataUrl: du, name: "IMG_0004.jpg" });
    out.queued = PSTYLE.state.queue.length; out.queueText = (q("#psHotStatus") || {}).textContent;
    const t0 = Date.now(); while (Date.now() - t0 < 15000 && (PSTYLE.state.busy || PSTYLE.state.queue.length || window.__reqs.length < out.reqs0 + 2 || (PSTYLE.state.photo && PSTYLE.state.photo.name !== "IMG_0004.jpg"))) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    out.photo = PSTYLE.state.photo && PSTYLE.state.photo.name; out.versions = PSTYLE.state.versions.length; out.step = PSTYLE.state.step; out.reqs = window.__reqs.length - out.reqs0; out.queueAfter = PSTYLE.state.queue.length; out.busyAfter = PSTYLE.state.busy;
    return out;
  });
  report("B4) Auto-style each new shot: with a reference chosen the switch is remembered; a shot through the door starts the run at once (step 03); a second shot while it runs waits in the queue; when the first is done the second runs by itself — two calls, the last shot on the stage with its version",
    b4.ref === "set" && b4.auto === true && b4.saved === true && b4.busyAtOnce && b4.stepAtOnce === 3 && b4.queued === 1 && b4.photo === "IMG_0004.jpg" && b4.versions === 1 && b4.step === 3 && b4.reqs === 2 && b4.queueAfter === 0 && !b4.busyAfter, b4);

  /* the history: × on a version, Clear history in two taps, both asleep while a run is on */
  const b5 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)], tx = (n) => ((n && n.textContent) || "").trim();
    q("#psRegen").click();
    let t0 = Date.now(); while (Date.now() - t0 < 12000 && (PSTYLE.state.busy || PSTYLE.state.versions.length < 2)) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
    const out = { versions: PSTYLE.state.versions.length, xs: qa("#psVersions .ps-ver-x").length, xAria: (q("#psVersions .ps-ver-x") || {}).getAttribute("aria-label"), clear: tx(q("#psClearHist")), head: !!q("#psRoot .ps-verhead .ps-h3") };
    window.__hang = true; q("#psRegen").click(); await new Promise((r) => setTimeout(r, 300));
    out.busy = PSTYLE.state.busy; out.xOff = qa("#psVersions .ps-ver-x").every((x) => x.getAttribute("aria-disabled") === "true" && x.classList.contains("is-off")); out.clearOff = q("#psClearHist").getAttribute("aria-disabled") === "true";
    q("#psClearHist").click(); await new Promise((r) => setTimeout(r, 100)); out.stillTwo = PSTYLE.state.versions.length;
    q("#psStop").click(); await new Promise((r) => setTimeout(r, 300)); window.__hang = false; out.stopped = !PSTYLE.state.busy;
    PSTYLE.state.cur = 1; PSTYLE.render(); await new Promise((r) => setTimeout(r, 80));
    qa("#psVersions .ps-ver-x")[1].click(); await new Promise((r) => setTimeout(r, 150));
    out.afterX = PSTYLE.state.versions.length; out.curAfterX = PSTYLE.state.cur; out.rows = qa("#psVersions .ps-ver").length;
    q("#psRegen").click(); t0 = Date.now(); while (Date.now() - t0 < 12000 && (PSTYLE.state.busy || PSTYLE.state.versions.length < 2)) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
    q("#psClearHist").click(); await new Promise((r) => setTimeout(r, 120));
    out.armed = tx(q("#psClearHist")); out.armedOn = q("#psClearHist") && q("#psClearHist").classList.contains("on"); out.stillThere = PSTYLE.state.versions.length;
    q("#psClearHist").click(); await new Promise((r) => setTimeout(r, 150));
    out.cleared = PSTYLE.state.versions.length; out.cur = PSTYLE.state.cur; out.list = !!q("#psVersions"); out.clearGone = !q("#psClearHist"); out.step = PSTYLE.state.step; out.photo = !!PSTYLE.state.photo;
    return out;
  });
  report("B5) every version row carries a named ×; Clear history sits by the heading; both are asleep while a run is on (a tap does nothing); × on the shown row removes it and shows the newer one; Clear history asks once (the chip lights and counts) and the second tap empties the list and returns to step 02, where Create is — the photo stays",
    b5.versions === 2 && b5.xs === 2 && b5.xAria === "ဒီ version ဖျက်မယ်" && b5.clear === "မှတ်တမ်း ရှင်းမယ်" && b5.head && b5.busy && b5.xOff && b5.clearOff && b5.stillTwo === 2 && b5.stopped &&
    b5.afterX === 1 && b5.curAfterX === 0 && b5.rows === 1 && b5.armed === "သေချာလား? 2 ပုံ ရှင်းမယ်" && b5.armedOn && b5.stillThere === 2 && b5.cleared === 0 && b5.cur === -1 && !b5.list && b5.clearGone && b5.step === 2 && b5.photo, b5);

  /* the share sizes and Share */
  const b6 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    q("#psGen").click();
    const t0 = Date.now(); while (Date.now() - t0 < 12000 && (PSTYLE.state.busy || PSTYLE.state.versions.length < 1)) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
    const out = { chips: qa("#psRoot .ps-share .chip").map((c) => c.getAttribute("data-social") + ":" + c.textContent + ":" + c.getAttribute("aria-pressed")), share: ((q("#psShare") || {}).textContent || "").trim(), hint: !!q("#psRoot .ps-share-hint") };
    const c = document.createElement("canvas"); c.width = 400; c.height = 300; c.getContext("2d").fillRect(0, 0, 400, 300); const du = c.toDataURL("image/png"); const v = { dataUrl: du, mime: "image/png", b64: du.split(",")[1], model: "m", size: "1k", ts: Date.now() };
    const c916 = await PSTYLE.socialCrop(v, "916"), c45 = await PSTYLE.socialCrop(v, "45"), c11 = await PSTYLE.socialCrop(v, "11"), cf = await PSTYLE.socialCrop(v, "full");
    out.crop = [c916.w + "x" + c916.h + ":" + c916.mime, c45.w + "x" + c45.h, c11.w + "x" + c11.h, cf === v];
    const big = document.createElement("canvas"); big.width = 3000; big.height = 4000; big.getContext("2d").fillRect(0, 0, 3000, 4000); const bdu = big.toDataURL("image/jpeg", 0.5);
    const cb = await PSTYLE.socialCrop({ dataUrl: bdu, mime: "image/jpeg", b64: bdu.split(",")[1] }, "916"); out.bigCrop = cb.w + "x" + cb.h;
    q('#psRoot .ps-share .chip[data-social="916"]').click(); await new Promise((r) => setTimeout(r, 120));
    out.social = PSTYLE.state.social; out.saved = (JSON.parse(localStorage.getItem("hnk_ps_v1") || "{}")).social; out.pressed = qa("#psRoot .ps-share .chip").map((x) => x.getAttribute("aria-pressed")).join();
    const dl0 = window.__dl.length; q("#psDl").click(); await new Promise((r) => setTimeout(r, 500)); out.dlName = window.__dl[dl0];
    q("#psShare").click(); await new Promise((r) => setTimeout(r, 600)); out.shared = window.__shared[0];
    window.__canShare = false; const dl1 = window.__dl.length; q("#psShare").click(); await new Promise((r) => setTimeout(r, 600)); out.fallback = window.__dl[dl1]; out.sharedCount = window.__shared.length; window.__canShare = true;
    q('#psRoot .ps-share .chip[data-social="full"]').click(); await new Promise((r) => setTimeout(r, 120)); const dl2 = window.__dl.length; q("#psDl").click(); out.dlFull = window.__dl[dl2];
    return out;
  });
  report("B6) step 03 offers four share sizes (original · 9:16 · 4:5 · 1:1, remembered); the crop is cut from the middle at the frame's ratio and never taller than 1920; with 9:16 chosen Download and Share carry the -916 name; Share hands a JPEG file to the phone's share sheet, and when the browser cannot share a file it downloads instead; the original size downloads at once under the plain name",
    b6.chips.join("|") === "full:မူရင်း:true|916:9:16 TikTok / Reels အတွက်:false|45:4:5 Facebook / IG အတွက်:false|11:1:1 Square:false" && b6.share === "ရှယ်မယ်" && b6.hint &&
    b6.crop[0] === "169x300:image/jpeg" && b6.crop[1] === "240x300" && b6.crop[2] === "300x300" && b6.crop[3] === true && b6.bigCrop === "1080x1920" &&
    b6.social === "916" && b6.saved === "916" && b6.pressed === "false,true,false,false" && /^hnk-portrait-style-\d{8}-\d{6}-916\.jpg$/.test(b6.dlName || "") &&
    b6.shared && /^hnk-portrait-style-\d{8}-\d{6}-916\.jpg$/.test(b6.shared.name || "") && b6.shared.type === "image/jpeg" && b6.shared.size > 100 && b6.shared.title === "HNK Portrait Style" &&
    /-916\.jpg$/.test(b6.fallback || "") && b6.sharedCount === 1 && /^hnk-portrait-style-\d{8}-\d{6}\.png$/.test(b6.dlFull || ""), b6);

  /* the camera sheet v2 with a reference chosen: the device list, the looks, the sliders, the ghost, the timer */
  const b7 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
    q("#psNew").click(); await new Promise((r) => setTimeout(r, 150));
    q("#psAutoStyle").click(); await new Promise((r) => setTimeout(r, 100));   /* off again — this shot must not run */
    const gum0 = window.__gum.length;
    q("#psTetherCam").click();
    let t0 = Date.now(); while (Date.now() - t0 < 6000 && !(q("#psCamSheet video") && q("#psCamSheet video").videoWidth > 0 && q("#psCamDev") && q("#psCamDev").options.length >= 3)) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 200));
    const v = q("#psCamSheet video");
    const out = { sheet: !!q("#psCamSheet"), vw: v ? v.videoWidth : 0, devs: qa("#psCamDev option").map((o) => o.value + ":" + o.textContent), looks: qa("#psCamLooks .chip").map((c) => c.getAttribute("data-look")), lookOn: (q("#psCamLooks .chip.on") || {}).getAttribute("data-look"),
      ghost: !!q("#psGhost"), ghostSrc: (q("#psGhost") || {}).getAttribute("src"), sliders: ["psCamExp", "psCamCon", "psCamWarm", "psCamSoft", "psGhostOp"].map((id) => !!q("#" + id)), toggles: ["psGrid", "psMirror", "psTimer"].map((id) => q("#" + id) && q("#" + id).checked), grid0: q("#psGridOv").style.display, soft: !!q("#psCamSheet video.ps-soft"), gum: window.__gum[gum0] };
    q('#psCamLooks .chip[data-look="warm"]').click(); await new Promise((r) => setTimeout(r, 60)); out.warm = v.style.filter;
    const exp = q("#psCamExp"); exp.value = "1.2"; exp.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 60)); out.exp = v.style.filter;
    q("#psGrid").click(); await new Promise((r) => setTimeout(r, 60)); out.grid1 = q("#psGridOv").style.display;
    const gh = q("#psGhostOp"); gh.value = "0.6"; gh.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 60)); out.ghostOp = q("#psGhost").style.opacity;
    q('#psCamLooks .chip[data-look="match"]').click(); await new Promise((r) => setTimeout(r, 400)); out.match = v.style.filter;
    q('#psCamLooks .chip[data-look="warm"]').click(); await new Promise((r) => setTimeout(r, 60));
    const gum1 = window.__gum.length; const dev = q("#psCamDev"); dev.value = "eos1"; dev.dispatchEvent(new Event("change", { bubbles: true }));
    t0 = Date.now(); while (Date.now() - t0 < 6000 && !(window.__gum.length >= gum1 + 2 && v.videoWidth > 0)) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    out.gumExact = window.__gum[gum1] && window.__gum[gum1].video && window.__gum[gum1].video.deviceId && window.__gum[gum1].video.deviceId.exact; out.gumBack = window.__gum[gum1 + 1] && window.__gum[gum1 + 1].video && window.__gum[gum1 + 1].video.facingMode; out.stillLive = v.videoWidth > 0 && !!q("#psCamSheet");
    out.prefs = JSON.parse(localStorage.getItem("hnk_ps_cam_v1") || "{}");
    q("#psTimer").click(); await new Promise((r) => setTimeout(r, 60));
    q("#psSnap").click(); await new Promise((r) => setTimeout(r, 150)); out.count = q("#psCount").textContent; out.stillOpen = !!q("#psCamSheet");
    t0 = Date.now(); while (Date.now() - t0 < 6000 && q("#psCamSheet")) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 300));
    out.gone = !q("#psCamSheet"); out.photo = PSTYLE.state.photo && PSTYLE.state.photo.name; out.jpeg = !!(PSTYLE.state.photo && /^data:image\/jpeg;base64,/.test(PSTYLE.state.photo.dataUrl)); out.notRun = !PSTYLE.state.busy && PSTYLE.state.step === 1 && PSTYLE.state.versions.length === 0; out.tracks = window.__gum.length;
    return out;
  });
  report("B7) Camera · Live with a reference chosen: the live view, the device list by name (any camera + EOS Webcam Utility + Integrated Camera), eight looks with Natural on, the ghost of the reference with its opacity, exposure · contrast · warmth · soft skin, grid · mirror · timer; a look and a slider change the view's filter at once (Warm adds sepia, exposure 1.2 shows), the grid shows, Match reads the reference's tone; a chosen device is asked for by exact id and, when it cannot open, the facing camera comes back; the choices are remembered; the timer counts 3 and Snap then puts camera-….jpg on step 01 without running",
    b7.sheet && b7.vw > 0 && b7.devs.length === 3 && b7.devs[0] === ":အလိုအလျောက် (ရှေ့ / နောက် ကင်မရာ)" && b7.devs[1] === "eos1:EOS Webcam Utility" && b7.devs[2] === "int1:Integrated Camera" && b7.looks.join() === "natural,warm,film,clean,cool,moody,bw,match" && b7.lookOn === "natural" &&
    b7.ghost && /lib\/wf\/pstyle\/th\//.test(b7.ghostSrc || "") && b7.sliders.every(Boolean) && b7.toggles.join() === "false,true,false" && b7.grid0 === "none" && b7.soft && b7.gum && b7.gum.video && b7.gum.video.facingMode === "user" &&
    /sepia\(/.test(b7.warm) && /brightness\(1\.2\)/.test(b7.exp) && b7.grid1 === "" && b7.ghostOp === "0.6" && /brightness\(/.test(b7.match) && /saturate\(/.test(b7.match) &&
    b7.gumExact === "eos1" && b7.gumBack === "user" && b7.stillLive && b7.prefs.look === "warm" && b7.prefs.exp === 1.2 && b7.prefs.grid === true &&
    b7.count === "3" && b7.stillOpen && b7.gone && /^camera-\d+\.jpg$/.test(b7.photo || "") && b7.jpeg && b7.notRun, Object.assign({}, b7, { gum: undefined, devs: undefined, looks: undefined, warm: undefined, exp: undefined, match: undefined, sliders: undefined }));

  /* the share target's inbox: a picture the phone shared arrives at boot */
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 80; c.height = 60; c.getContext("2d").fillRect(0, 0, 80, 60);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const cache = await caches.open("hnk-share-inbox"); await cache.put("./__share_inbox", new Response(blob, { headers: { "Content-Type": "image/png" } }));
  });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?page=pgPStyle&shared=1", { waitUntil: "domcontentloaded" });
  const t0 = Date.now(); while (Date.now() - t0 < 8000 && !(await page.evaluate(() => !!(window.PSTYLE && PSTYLE.state.photo)).catch(() => false))) await page.waitForTimeout(100);
  await page.waitForTimeout(400);
  const b8 = await page.evaluate(async () => ({ page: curPage, photo: PSTYLE.state.photo && PSTYLE.state.photo.name, w: PSTYLE.state.photo && PSTYLE.state.photo.w, search: location.search, inbox: !!(await (await caches.open("hnk-share-inbox")).match("./__share_inbox")), step: PSTYLE.state.step, next: !!document.getElementById("psNext1") }));
  report("B8) a picture in the share inbox at boot with ?shared=1 opens Portrait Style, lands on step 01 as shared-….jpg with Next, leaves the inbox empty and the address without the flag",
    b8.page === "pgPStyle" && /^shared-\d+\.jpg$/.test(b8.photo || "") && b8.w === 80 && b8.search === "?page=pgPStyle" && !b8.inbox && b8.step === 1 && b8.next, b8);

  report("B9) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) the panel ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
async function partC(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const pp = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = []; pp.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pp.route("**/*", (r) => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await pp.addInitScript(UXP_STUB);
    await pp.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await pp.waitForTimeout(2500);
    const c1 = await pp.evaluate(async () => {
      switchPage("pstyle"); await new Promise((r) => setTimeout(r, 300));
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      const out = { page: state.page, tether: !!q("#pagePStyle #psTether"), cam: !!q("#psTetherCam"), hot: ((q("#psHot") || {}).textContent || "").trim(), auto: !!q("#psAutoStyle"), guide: !!q("#psGuideTgl") };
      q("#psGuideTgl").click(); await new Promise((r) => setTimeout(r, 120));
      out.cams = qa("#psGuide .ps-guide-cam").map((c) => c.getAttribute("data-cam")); out.canon = (q('#psGuide .ps-guide-cam[data-cam="canon"]') || {}).textContent;
      q("#psGuideTgl").click(); await new Promise((r) => setTimeout(r, 80));
      return out;
    });
    report("C1) the panel boots the same card on Edit ▸ Style: no Camera · Live (Photoshop has no camera), Hot folder, Auto-style, the same five-camera guide",
      c1.page === "pstyle" && c1.tether && !c1.cam && c1.hot === "Hot folder ကြည့်မယ်" && c1.auto && c1.guide && c1.cams.join() === "canon,nikon,sony,fuji,phone" && has(c1.canon || "", "EOS Webcam Utility"), c1);

    const c2 = await pp.evaluate(async (png) => {
      const q = (s) => document.querySelector(s);
      const bin = atob(png), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.__ents = [{ isFile: true, name: "DSC_0001.JPG", read: async () => bytes.buffer }];
      let folderAsks = 0;
      require("uxp").storage.localFileSystem.getFolder = async () => { folderAsks++; return { name: "NX Tether", getEntries: async () => window.__ents.slice() }; };
      const ps = globalThis.HNK.pstyle;
      q("#psHot").click();
      let t0 = Date.now(); while (Date.now() - t0 < 3000 && !ps.state.hot) await new Promise((r) => setTimeout(r, 40));
      await new Promise((r) => setTimeout(r, 120));
      const out = { asks: folderAsks, hot: !!ps.state.hot, name: ps.state.hot && ps.state.hot.name, status: (q("#psHotStatus") || {}).textContent, chip: ((q("#psHot") || {}).textContent || "").trim(), photo0: ps.state.photo && ps.state.photo.name };
      window.__ents.push({ isFile: true, name: "DSC_0002.JPG", read: async ({ format }) => { window.__fmt = format; return bytes.buffer; } });
      t0 = Date.now(); while (Date.now() - t0 < 7000 && !(ps.state.photo && ps.state.photo.name === "DSC_0002.JPG")) await new Promise((r) => setTimeout(r, 80));
      await new Promise((r) => setTimeout(r, 120));
      out.arrived = ps.state.photo && ps.state.photo.name; out.du = ps.state.photo && ps.state.photo.dataUrl.slice(0, 40); out.fmt = window.__fmt; out.n = ps.state.hot && ps.state.hot.n; out.oldIgnored = ps.state.recent.every((r) => r.name !== "DSC_0001.JPG");
      q("#psHot").click(); await new Promise((r) => setTimeout(r, 120)); out.stopped = !ps.state.hot;
      return out;
    }, PNG_B64);
    report("C2) the panel's Hot folder asks UXP for a folder, names it, leaves the shot already there alone, reads the new one as binary into a data URL of its extension's type and puts it on step 01 within a poll; Stop lets go",
      c2.asks === 1 && c2.hot && c2.name === "NX Tether" && has(c2.status || "", "NX Tether") && c2.chip === "ရပ်မယ်" && !c2.photo0 && c2.arrived === "DSC_0002.JPG" && c2.du === "data:image/jpeg;base64,iVBORw0KGgoAAAANS" && c2.fmt === "binary" && c2.n === 1 && c2.oldIgnored && c2.stopped, c2);

    const c3 = await pp.evaluate(async (png) => {
      const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
      const ps = globalThis.HNK.pstyle; const du = "data:image/png;base64," + png;
      ps.state.versions = [{ dataUrl: du, mime: "image/png", b64: png, model: "", size: "", ts: Date.now() }, { dataUrl: du, mime: "image/png", b64: png, model: "", size: "", ts: Date.now() }]; ps.state.cur = 0; ps.state.step = 3; ps.render();
      await new Promise((r) => setTimeout(r, 150));
      const out = { xs: qa("#psVersions .ps-ver-x").length, clear: ((q("#psClearHist") || {}).textContent || "").trim(), chips: qa("#pagePStyle .ps-share .chip").map((c) => c.getAttribute("data-social")), share: !!q("#psShare"), dl: (q("#psDl") || {}).textContent };
      qa("#psVersions .ps-ver-x")[0].click(); await new Promise((r) => setTimeout(r, 120)); out.afterX = ps.state.versions.length;
      q("#psClearHist").click(); await new Promise((r) => setTimeout(r, 100)); out.armed = ((q("#psClearHist") || {}).textContent || "").trim();
      q("#psClearHist").click(); await new Promise((r) => setTimeout(r, 120)); out.cleared = ps.state.versions.length; out.list = !!q("#psVersions"); out.step = ps.state.step;
      return out;
    }, PNG_B64);
    report("C3) the panel's step 03 has the same × per version, the same two-tap Clear history and the same four share sizes, but no Share button (no share sheet in Photoshop) — the size goes into Place into Photoshop instead",
      c3.xs === 2 && c3.clear === "မှတ်တမ်း ရှင်းမယ်" && c3.chips.join() === "full,916,45,11" && !c3.share && (c3.dl || "").length > 0 && c3.afterX === 1 && c3.armed === "သေချာလား? 1 ပုံ ရှင်းမယ်" && c3.cleared === 0 && !c3.list && c3.step === 2, c3);
    report("C4) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins · F) the worker ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgPStyle");
  report("D1) What's New carries the " + WAVE_V + " row for Portrait Style's camera in nine languages, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgPStyle") === WN.panelRow(WAVE_V, "pgPStyle") && WN.appRow(WAVE_V, "pgPStyle").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the last-English check it follows",
    steps === COUNT && has(CI, "node test/verify_pstyle_camera_6146.js") && CI.indexOf("verify_pstyle_camera_6146.js") > CI.indexOf("verify_last_english_6145.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(SW, "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}
async function partF() {
  const handlers = {}; const puts = [];
  const R = class extends Response {}; R.redirect = (u, s) => new Response(null, { status: s, headers: { Location: u } });
  const cache = { keys: async () => [], match: async () => null, put: async (k, r) => { puts.push({ key: k, type: r.headers.get("Content-Type"), size: (await r.arrayBuffer()).byteLength }); }, delete: async () => true };
  const sb = { self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {}, matchAll: async () => [] }, registration: {} },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => null },
    location: { origin: "http://127.0.0.1:" + PORT, href: "http://127.0.0.1:" + PORT + "/sw.js", pathname: "/sw.js" }, Response: R, Request, Headers, URL, fetch: async () => new Response("x"), console, setTimeout, clearTimeout, FormData, File, Blob };
  sb.self.location = sb.location; vm.createContext(sb); vm.runInContext(SW, sb);
  const fd = new FormData(); fd.append("title", "IMG_0009"); fd.append("photo", new File([Buffer.from(PNG_B64, "base64")], "IMG_0009.jpg", { type: "image/jpeg" }));
  let answered = null;
  const ev = { request: { method: "POST", url: "http://127.0.0.1:" + PORT + "/share", formData: async () => fd }, respondWith: (p) => { answered = p; } };
  handlers.fetch(ev);
  const res = answered ? await answered : null;
  let getAnswered = false;
  const ev2 = { request: { method: "POST", url: "http://127.0.0.1:" + PORT + "/app/index.html", formData: async () => new FormData() }, respondWith: () => { getAnswered = true; } };
  handlers.fetch(ev2);
  report("F1) the worker answers a POST to ./share by keeping the photo in the share inbox (its type kept) and redirecting 303 to Portrait Style with ?shared=1; another POST is left alone",
    !!res && res.status === 303 && res.headers.get("Location") === "./?page=pgPStyle&shared=1" && puts.length === 1 && puts[0].key === "./__share_inbox" && puts[0].type === "image/jpeg" && puts[0].size === Buffer.from(PNG_B64, "base64").length && !getAnswered,
    { status: res && res.status, loc: res && res.headers.get("Location"), puts, getAnswered });
}

(async function main() {
  partA();
  partD();
  await partF();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    withPremium(browser);
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
