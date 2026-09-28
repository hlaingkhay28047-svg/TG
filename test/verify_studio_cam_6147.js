/* 6.147.0 / panel 6.218.0 — THE SAME CAMERA ON EVERY PHOTO PAGE.
 *
 * The owner asked for Portrait Style's tethered camera "on the other pages too". 6.146.0 built the studio camera
 * for Portrait Style: the camera sheet over any video input (a phone's camera, a Canon / Nikon / Sony / Fuji on
 * USB through the maker's webcam utility, an HDMI capture card), the hot folder the tether software saves into,
 * Share through the phone's share sheet in the frame the network wants. This wave hangs those three on
 * window.HNK_CAM (the web app's PSTYLE host) and gives every photo page its door:
 *  · Retouch A / B (the Studio's Before slot), Retouch Pro (the V2 picker) and Path (under Add photos) draw a
 *    cam-slot — Camera · Live + Hot folder (Stop and the watching line while a folder is watched) — and every shot
 *    goes to that page's own intake (stLoadImage · state.refs[0] · ptIngestDataUrls).
 *  · Imagine (the shared module) takes the doors through its host: Camera · Live and Hot folder beside Add photos
 *    and under the strip (the panel gets the hot folder through UXP, the same watch Portrait Style uses), and a
 *    Share button beside Export.
 *  · Share of every result — the hand-off row's chip (Retouch · Studio · Create results), Create's Share, Imagine's
 *    Share — opens one sheet: the frame (original · 9:16 · 4:5 · 1:1), the studio stamp first, then the phone's
 *    share sheet. Portrait Style's own Share carries the stamp now too.
 *
 * A) the source on both surfaces and the lifts in sync   B) the web app: the doors on four pages with a fake
 * directory picker and Chromium's fake camera, Imagine's Share and the hand-off row's Share through the sheet
 * with a stubbed share sheet   C) the panel: Imagine's hot folder through a patched UXP folder   D) What's New
 * E) release pins
 * Usage: PORT=8931 node test/verify_studio_cam_6147.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");
const psLift = require("../tools/build_panel_pstyle.js");
const imLift = require("../tools/build_panel_imagine.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PANEL_IM = read("panel/js/hnk_imagine.js");
const PARITY = read("test/verify_panel_page_parity.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.148.0", PVER = "6.219.0";
const WAVE_V = "6.147.0";
const COUNT = 290;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PHOTO = fs.readFileSync(path.join(ROOT, "tools", "art_ref", "hnk-model.jpg")).toString("base64");

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 900)));
  if (!ok) failures++;
}
const slice = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? "" : s.slice(i, s.indexOf(b, i)); };

/* ---------------- A) the source ---------------- */
function partA() {
  const P = A.readPstyle(), I = A.readImagine();
  const cam = slice(APP, "/* ---------- 6.147.0 — THE SAME CAMERA ON EVERY PHOTO PAGE ----------", "  camDoors();");
  report("A1) HNK_CAM hangs on the PSTYLE host: the camera, the hot folder, the share, the crop, the door, the sheet; three door configs hand a shot to the Studio (stLoadImage), Retouch Pro (state.refs[0]) and Path (ptIngestDataUrls); the sheet stamps first, crops to the frame, then shares",
    has(cam, "window.HNK_CAM={ camera:camera, hotFolder:hotFolder, share:share, crop:PSTYLE.socialCrop, door:camDoor, doors:camDoors, shareSheet:shareSheet") &&   /* 6.148.0 added shot · auto · queue after these */
    has(cam, "studio:  { onShot:function(it){ stLoadImage(it.dataUrl); }") && has(cam, "retouch: { onShot:function(it){") && has(cam, "state.refs[0]={ mime:m[1], b64:m[2], label:it.name||\"camera\" }; state.rsOrig=null; state.imgRoles=null; renderRefs();") &&
    has(cam, "path:    { onShot:function(it){ ptIngestDataUrls([{") && has(cam, "function camDoor(slot){") && has(cam, 'var key=slot.getAttribute("data-cam"), cfg=DOOR_CFG[key]; if(!cfg) return null;') &&
    has(cam, "function shareSheet(mime, b64, name){") && has(cam, "wmStampDataUrl(dataUrl, mime, 92, function(du){") && has(cam, "PSTYLE.socialCrop(v, mode).then(function(out){ close();") &&
    has(APP, "if(!out.stamped){ return new Promise(function(res){ wmStampDataUrl(") && APP.indexOf("window.HNK_CAM={") > APP.indexOf('PSTYLE.init(host, $("psRoot"));'));

  report("A2) the doors on the pages: the Studio's Before slot, Retouch Pro's picker and Path's Add row each carry a cam-slot with its key; the hand-off row's Share and Create's Share open the sheet; the Imagine web host hands the module camera · hotFolder · share lazily through HNK_CAM",
    has(APP, 'var camSlot=el("div","cam-slot"); camSlot.setAttribute("data-cam","studio"); host.appendChild(camSlot); if(window.HNK_CAM) window.HNK_CAM.door(camSlot);') &&
    has(APP, 'var rsCam=el("div","cam-slot"); rsCam.setAttribute("data-cam","retouch"); host.appendChild(rsCam); if(window.HNK_CAM) window.HNK_CAM.door(rsCam);') &&
    has(APP, '<div class="cam-slot" id="ptCamDoor" data-cam="path"></div>') &&
    has(APP, 'if(window.HNK_CAM){ HNK_CAM.shareSheet(mime, b64, name||"hnk-result"); return; }') && has(APP, 'if(window.HNK_CAM){ HNK_CAM.shareSheet(out.mime, out.b64, dlName("create",out.mime,state.histSel+1)); return; }') &&
    has(APP, "camera: function(done, ctx){ if(window.HNK_CAM) HNK_CAM.camera(done, ctx||{}); else done(null); },") &&
    has(APP, "hotFolder: { pick: function(onCtl, onShot){ if(window.HNK_CAM) HNK_CAM.hotFolder.pick(onCtl, onShot); else onCtl(null); } },") &&
    has(APP, "share: function(out, name){ if(window.HNK_CAM) HNK_CAM.shareSheet(out.mime, out.b64, name); },"));

  const mod = imLift.between(APP, imLift.M0, imLift.M1, "module");
  report("A3) the Imagine module: the state carries the watched folder; camRow draws Camera · Live and Hot folder (Stop, the watching line) where the host has them, beside Add photos and under the strip; Share beside Export where the host shares; six door strings in nine languages, the same words as Portrait Style's; the panel's copy is today's lift",
    has(mod, "markMode:false, brush:1, stageW:0, hot:null") && has(mod, "function camRow(parent){") && has(mod, "if(!(H.camera || H.hotFolder)) return;") &&
    has(mod, 'var c=btn("chip", t("cam_live"), "i-camera"); c.id="imCamLive";') && has(mod, 'h.id="imHot";') && has(mod, 'st.id="imHotStatus";') &&
    has(mod, "if(S.photos.length) camRow(card);") && has(mod, "camRow(empty);") && has(mod, 'if(H.share){ var shr = btn("btn im-share", t("share"), "i-external"); shr.id="imShare"; shr.onclick=shareCur; acts.appendChild(shr); }') &&
    has(mod, "function shareCur(){") &&
    ["cam_live", "hot_folder", "hot_stop", "hot_watching", "hot_no", "share"].every((k) => all9(I.ui[k])) && I.ui.cam_live.my === P.ui.connect_cam.my && I.ui.hot_folder.en === P.ui.hot_folder.en && I.ui.share.th === P.ui.share.th &&
    has(PANEL_IM, "function camRow(parent){") && imLift.build({ dry: true }).changed.length === 0 && psLift.build({ dry: true }).changed.length === 0, { im: imLift.build({ dry: true }).changed, ps: psLift.build({ dry: true }).changed });

  const helper = slice(MAIN, "function uxpHotFolder() {", "function pstyleHost() {");
  const ph = slice(MAIN, "function pstyleHost() {", "function pstyleEnter() {"), ih = slice(MAIN, "function imagineHost() {", "function imagineEnter() {");
  const SCREEN = read("panel/src/ui/screens/retouch-studio-screen.js"), PANEL_HTML = read("panel/index.html");
  report("A4) the panel: one UXP folder watch (uxpHotFolder) used by the Portrait Style host, the Imagine host and the Hot folder door alike; the door is drawn into the same cam-slot on Retouch A / B (the screen's PHOTO slot), Retouch Pro (the lifted picker's slot) and Path (its own slot), feeds the shared PHOTO slot or the Path batch, and speaks Imagine's words; no host has a camera or a share",
    has(helper, "const f = await fsp.getFolder();") && has(helper, "}, 2500);") && has(helper, "const buf = await e.read({ format: uxp.storage.formats.binary });") &&
    has(ph, "hotFolder: uxpHotFolder(),") && has(ih, "hotFolder: uxpHotFolder(),") && !has(ih, "camera:") && !has(ih, "share:") && !has(ph, "camera:") && !has(ph, "share:") &&
    has(MAIN, "function panelCamDoor(slot, key) {") && has(MAIN, "function hotDoorIntake(key, item) {") && has(MAIN, "uxpHotFolder().pick(function (ctl) {") &&
    has(MAIN, 'const slot = refSlotById("subject-reference"); if (!slot) return;\n  slot.assign({ b64: m[2], mime: m[1], label: item.name || "camera" });') &&
    has(MAIN, 'PT.photos.push({ id: "p" + (++PT.seq), name: String(item.name || ("photo-" + PT.seq)), srcDataUrl: item.dataUrl,') &&
    has(MAIN, "hotDoor: function (slot, key) { try { panelCamDoor(slot, key); } catch (e) { hwarn(\"hot door\", e); } },") && has(MAIN, 'try { panelCamDoor($("ptCamDoor"), "path"); }') &&
    has(MAIN, "function hotDoorWords() { const im = globalThis.HNK && globalThis.HNK.imagine; return (im && im.data && im.data.ui) || null; }") &&
    has(SCREEN, 'var camSlot = el("div", "cam-slot"); camSlot.setAttribute("data-cam", "studio"); host.appendChild(camSlot);') && has(SCREEN, 'bd.hotDoor(camSlot, "studio")') &&
    has(SCREEN, '$("rsPicker").querySelector(\'.cam-slot[data-cam="retouch"]\')') && has(PANEL_HTML, '<div class="cam-slot" id="ptCamDoor" data-cam="path"></div>') &&
    has(read("panel/js/hnk_studio_suites.js"), 'rsCam.setAttribute("data-cam","retouch")'));

  const imCss = imLift.between(APP, imLift.C0, imLift.C1, "css");
  report("A5) the CSS: the door and the sheet are app-only; the Imagine row's rule sits in the lifted block and draws on UXP; the parity walk names Imagine's Camera · Live as the web host's own",
    has(APP, ".cam-door{margin-top:8px}") && has(APP, ".cam-share .cam-share-sizes{") && has(imCss, ".im-camrow{margin:4px 0 8px 0}") && has(imCss, ".im-hot{font-size:12.5px;color:var(--gold-hi);margin-left:4px}") &&
    has(read("panel/styles.css"), ".im-camrow{") && has(read("panel/styles.css"), ".cam-door{margin-top:8px}") &&
    has(PARITY, 'imagine: ["ကင်မရာ · Live"],') && has(PARITY, 'path: ["ကင်မရာ · Live"],') &&
    has(read("test/verify_panel_studio_sync.js"), 'const APP_ONLY = { meitu: ["ကင်မရာ · Live"], evoto: ["ကင်မရာ · Live"], retouch: ["ကင်မရာ · Live"] };'));
}

/* ---------------- B) the web app ---------------- */
const MOCK = `(function(){
  window.__reqs = []; window.__outB64 = "${PNG_B64}";
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
      try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u }); }
      return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200})); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  window.__dl = []; HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
  window.__shared = [];
  Object.defineProperty(navigator, "share", { configurable: true, value: function(d){ var f = d && d.files && d.files[0]; window.__shared.push({ name: f && f.name, type: f && f.type, size: f && f.size }); return Promise.resolve(); } });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: function(){ return true; } });
  window.__hotFiles = []; window.__dirPicks = 0;
  window.showDirectoryPicker = function(o){ window.__dirPicks++; return Promise.resolve({ kind:"directory", name:"Capture One", values: async function*(){ for (var i=0;i<window.__hotFiles.length;i++) yield window.__hotFiles[i]; } }); };
  window.__pngFile = function(name){ return new Promise(function(res){ var c=document.createElement("canvas"); c.width=64; c.height=48; var x=c.getContext("2d"); x.fillStyle="#c96"; x.fillRect(0,0,64,48); c.toBlob(function(b){ res({ kind:"file", name:name, getFile: async function(){ return new File([b], name, { type:"image/png" }); } }); }, "image/png"); }); };
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
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; });

  /* B1 — Retouch A (the Studio's Before slot): the door, a shot from the hot folder lands as the photo */
  const b1 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 700));
    const slot = q('#stPicker .cam-slot[data-cam="studio"]');
    const out = { cam: !!window.HNK_CAM, slot: !!slot, live: tx(slot && slot.querySelector(".cam-live")), hot: tx(slot && slot.querySelector(".cam-hot")), empty: !state.refs[0] };
    window.__hotFiles = [await window.__pngFile("old.jpg")];
    slot.querySelector(".cam-hot").click();
    let t0 = Date.now(); while (Date.now() - t0 < 3000 && !q('#stPicker .cam-door-st')) await new Promise((r) => setTimeout(r, 40));
    out.watching = tx(q("#stPicker .cam-door-st")); out.stop = tx(q('#stPicker .cam-hot'));
    window.__hotFiles.push(await window.__pngFile("IMG_1001.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 6000 && !(state.refs[0] && state.st && state.st.img)) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 300));
    out.loaded = !!(state.refs[0] && state.st && state.st.img); out.before = !!q("#stPicker .ref.filled img"); out.watching2 = tx(q("#stPicker .cam-door-st")); out.stillDoor = !!q('#stPicker .cam-slot[data-cam="studio"] .cam-hot');
    q('#stPicker .cam-hot').click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !q("#stPicker .cam-door-st"); out.hotAgain = tx(q('#stPicker .cam-hot'));
    return out;
  });
  report("B1) Retouch A: the Studio's Before slot carries Camera · Live and Hot folder; the watched folder's new shot becomes the photo (Before filled, the studio's picture set), the old one is left alone, the door stays for the next shot, Stop lets go",
    b1.cam && b1.slot && b1.live === "ကင်မရာ · Live" && b1.hot === "Hot folder ကြည့်မယ်" && b1.empty && has(b1.watching || "", "Capture One") && b1.stop === "ရပ်မယ်" && b1.loaded && b1.before && has(b1.watching2 || "", "1") && b1.stillDoor && b1.stopped && b1.hotAgain === "Hot folder ကြည့်မယ်", b1);

  /* B2 — Retouch Pro: the same door in the V2 picker; the shot goes to slot 0 with its name */
  const b2 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    state.refs[0] = null; state.imgRoles = null; renderRefs();
    switchPage("pgRetouch"); await new Promise((r) => setTimeout(r, 500));
    const slot = q('#rsPicker .cam-slot[data-cam="retouch"]');
    const out = { slot: !!slot, live: !!(slot && slot.querySelector(".cam-live")), hot: tx(slot && slot.querySelector(".cam-hot")) };
    window.__hotFiles = [];
    slot.querySelector(".cam-hot").click();
    let t0 = Date.now(); while (Date.now() - t0 < 3000 && !q('#rsPicker .cam-door-st')) await new Promise((r) => setTimeout(r, 40));
    window.__hotFiles.push(await window.__pngFile("IMG_1002.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 6000 && !state.refs[0]) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 300));
    out.label = state.refs[0] && state.refs[0].label; out.mime = state.refs[0] && state.refs[0].mime; out.filled = !!q("#rsPicker .ref.filled img");
    q('#rsPicker .cam-hot').click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !q("#rsPicker .cam-door-st");
    return out;
  });
  report("B2) Retouch Pro: the V2 picker carries the same door; the watched folder's shot fills slot 0 under its own name and the picker shows it",
    b2.slot && b2.live && b2.hot === "Hot folder ကြည့်မယ်" && b2.label === "IMG_1002.jpg" && b2.mime === "image/png" && b2.filled && b2.stopped, b2);

  /* B3 — Path: the door under Add photos; the shot joins the batch */
  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgPath"); await new Promise((r) => setTimeout(r, 500));
    const slot = q('#ptCamDoor');
    const out = { slot: !!(slot && slot.querySelector(".cam-hot")), live: !!(slot && slot.querySelector(".cam-live")), n0: PT.photos.length };
    window.__hotFiles = [];
    slot.querySelector(".cam-hot").click();
    let t0 = Date.now(); while (Date.now() - t0 < 3000 && !q('#ptCamDoor .cam-door-st')) await new Promise((r) => setTimeout(r, 40));
    window.__hotFiles.push(await window.__pngFile("IMG_1003.jpg")); window.__hotFiles.push(await window.__pngFile("IMG_1004.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 7000 && PT.photos.length < out.n0 + 2) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200));
    out.n1 = PT.photos.length; out.names = PT.photos.map((p) => p.name).join(); out.watching = tx(q("#ptCamDoor .cam-door-st"));
    q('#ptCamDoor .cam-hot').click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !q("#ptCamDoor .cam-door-st");
    return out;
  });
  report("B3) Path: the door sits under Add photos; two shots from the watched folder join the batch under their names within a poll",
    b3.slot && b3.live && b3.n0 === 0 && b3.n1 === 2 && b3.names === "IMG_1003.jpg,IMG_1004.jpg" && has(b3.watching || "", "2") && b3.stopped, b3);

  /* B4 — Imagine: the doors through the host, the camera sheet, the hot folder, Share through the sheet */
  const b4 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)], tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 500));
    const IM = IMAGINE; IM.openTool("lighting"); await new Promise((r) => setTimeout(r, 300));
    const out = { row: !!q("#imCamRow"), live: tx(q("#imCamLive")), hot: tx(q("#imHot")), inEmpty: !!q(".im-empty #imCamRow") };
    q("#imCamLive").click();
    let t0 = Date.now(); while (Date.now() - t0 < 6000 && !(q("#psCamSheet video") && q("#psCamSheet video").videoWidth > 0)) await new Promise((r) => setTimeout(r, 50));
    out.sheet = !!q("#psCamSheet"); out.noGhost = !q("#psGhost"); out.toastAfterCam = tx(q("#toast"));
    if (q("#psSnap")) q("#psSnap").click(); else out.noSnap = true;
    t0 = Date.now(); while (Date.now() - t0 < 5000 && q("#psCamSheet")) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 300));
    out.photos1 = IM.state.photos.length; out.name1 = IM.state.photos[0] && IM.state.photos[0].name; out.rowUnderStrip = !!q("#imStrip") && !!q("#imCamRow") && !q(".im-empty");
    window.__hotFiles = []; q("#imHot").click();
    t0 = Date.now(); while (Date.now() - t0 < 3000 && !IM.state.hot) await new Promise((r) => setTimeout(r, 40));
    await new Promise((r) => setTimeout(r, 150));
    out.hotOn = !!IM.state.hot && q("#imHot").classList.contains("on") && tx(q("#imHot")) === "ရပ်မယ်"; out.status0 = tx(q("#imHotStatus"));
    window.__hotFiles.push(await window.__pngFile("IMG_1005.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 6000 && IM.state.photos.length < 2) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200));
    out.photos2 = IM.state.photos.length; out.name2 = IM.state.photos[1] && IM.state.photos[1].name; out.status1 = tx(q("#imHotStatus"));
    q("#imHot").click(); await new Promise((r) => setTimeout(r, 150)); out.hotOff = !IM.state.hot && !q("#imHotStatus");
    /* a result, then Share through the sheet */
    if (q(".im-tpl[data-preset]:not(.im-ref)")) q(".im-tpl[data-preset]:not(.im-ref)").click(); else out.noTpl = true; await new Promise((r) => setTimeout(r, 120));   /* the first template of the tool (the Reference Card comes first in the grid) */
    if (q("#imApply")) q("#imApply").click(); else out.noApply = true;
    t0 = Date.now(); while (Date.now() - t0 < 15000 && (IM.state.busy || !(IM.state.photos[IM.state.cur] && IM.state.photos[IM.state.cur].out))) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200));
    out.result = !!(IM.state.photos[IM.state.cur] && IM.state.photos[IM.state.cur].out); out.share = tx(q("#imShare")); out.status = IM.state.status; out.perr = IM.state.photos[IM.state.cur] && IM.state.photos[IM.state.cur].err; out.preset = IM.state.preset.lighting; out.toast = tx(q("#toast"));
    if (q("#imShare")) q("#imShare").click(); await new Promise((r) => setTimeout(r, 200));
    out.sheetOpen = !!q("#camShareSheet"); out.sizes = qa("#camShareSheet .chip[data-social]").map((c) => c.getAttribute("data-social")).join();
    if (!out.sheetOpen) return out;
    q('#camShareSheet .chip[data-social="916"]').click(); q("#camShareGo").click();
    t0 = Date.now(); while (Date.now() - t0 < 6000 && !window.__shared.length) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200));
    out.shared = window.__shared[0]; out.sheetGone = !q("#camShareSheet");
    return out;
  });
  report("B4) Imagine: Camera · Live and Hot folder beside Add photos, then under the strip; the camera sheet opens (no ghost — no reference here) and Snap adds the shot; the watched folder's shot joins too (Stop lets go); a result gets Share beside Export, which opens the sheet with the four frames, and 9:16 shares a JPEG under the -916 name",
    b4.row && b4.live === "ကင်မရာ · Live" && b4.hot === "Hot folder ကြည့်မယ်" && b4.inEmpty && b4.sheet && b4.noGhost && b4.photos1 === 1 && /^camera-\d+\.jpg$/.test(b4.name1 || "") && b4.rowUnderStrip &&
    b4.hotOn && has(b4.status0 || "", "Capture One") && b4.photos2 === 2 && b4.name2 === "IMG_1005.jpg" && has(b4.status1 || "", "1") && b4.hotOff &&
    b4.result && b4.share === "ရှယ်မယ်" && b4.sheetOpen && b4.sizes === "full,916,45,11" && b4.shared && /^hnk-imagine-lighting.*-916\.jpg$/.test(b4.shared.name || "") && b4.shared.type === "image/jpeg" && b4.sheetGone, b4);

  /* B5 — the hand-off row's Share and Create's Share open the same sheet; the plain frame keeps the name */
  const b5 = await page.evaluate(async (b64) => {
    const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)], tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgCreate"); await new Promise((r) => setTimeout(r, 400));
    stHandoffRow("handoffCreate", "image/png", b64, "hnk-test");
    const chips = qa("#handoffCreate .chip"); const share = chips[chips.length - 1];
    const out = { chips: chips.length, shareChip: tx(share) };
    const n0 = window.__shared.length;
    share.click(); await new Promise((r) => setTimeout(r, 150));
    out.sheet = !!q("#camShareSheet"); out.pressed = qa("#camShareSheet .chip[data-social]").map((c) => c.getAttribute("aria-pressed")).join();
    q("#camShareGo").click();
    let t0 = Date.now(); while (Date.now() - t0 < 6000 && window.__shared.length <= n0) await new Promise((r) => setTimeout(r, 60));
    out.name = window.__shared[n0] && window.__shared[n0].name; out.type = window.__shared[n0] && window.__shared[n0].type;
    /* cancel closes without a share */
    share.click(); await new Promise((r) => setTimeout(r, 100)); q("#camShareCancel").click(); await new Promise((r) => setTimeout(r, 100)); out.cancelled = !q("#camShareSheet") && window.__shared.length === n0 + 1;
    /* Create's own Share button */
    state.result = { mime: "image/png", b64: b64 }; state.hist = [state.result]; state.histSel = 0;
    const sb = q("#btnShareRes"); out.createBtn = !!sb; if (sb) { sb.onclick(); await new Promise((r) => setTimeout(r, 150)); out.createSheet = !!q("#camShareSheet"); q("#camShareCancel").click(); }
    return out;
  }, PNG_B64);
  report("B5) every result's Share is the sheet: the hand-off row's chip opens it with the original frame chosen, Share sends the PNG under its name, Cancel closes it without a share; Create's Share button opens the same sheet",
    b5.chips >= 3 && b5.shareChip === "Share" && b5.sheet && b5.pressed === "true,false,false,false" && b5.name === "hnk-test.png" && b5.type === "image/png" && b5.cancelled && b5.createBtn && b5.createSheet, b5);

  report("B6) no page error through any of it", errs.length === 0, errs);
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
    const c1 = await pp.evaluate(async (png) => {
      const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
      switchPage("imagine"); await new Promise((r) => setTimeout(r, 400));
      const IM = globalThis.HNK.imagine; IM.openTool("portrait"); await new Promise((r) => setTimeout(r, 300));
      const out = { row: !!q("#imCamRow"), live: !!q("#imCamLive"), hot: tx(q("#imHot")), share: !!q("#imShare") };
      const bin = atob(png), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.__ents = [{ isFile: true, name: "DSC_0100.JPG", read: async () => bytes.buffer }];
      require("uxp").storage.localFileSystem.getFolder = async () => ({ name: "X Acquire", getEntries: async () => window.__ents.slice() });
      q("#imHot").click();
      let t0 = Date.now(); while (Date.now() - t0 < 3000 && !IM.state.hot) await new Promise((r) => setTimeout(r, 40));
      await new Promise((r) => setTimeout(r, 150));
      out.hotOn = !!IM.state.hot; out.name = IM.state.hot && IM.state.hot.name; out.status = tx(q("#imHotStatus"));
      window.__ents.push({ isFile: true, name: "DSC_0101.JPG", read: async () => bytes.buffer });
      t0 = Date.now(); while (Date.now() - t0 < 7000 && IM.state.photos.length < 1) await new Promise((r) => setTimeout(r, 80));
      await new Promise((r) => setTimeout(r, 150));
      out.photos = IM.state.photos.length; out.pname = IM.state.photos[0] && IM.state.photos[0].name; out.oldIgnored = IM.state.photos.every((p) => p.name !== "DSC_0100.JPG");
      q("#imHot").click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !IM.state.hot;
      switchPage("pstyle"); await new Promise((r) => setTimeout(r, 300)); out.psHot = !!q("#psHot");
      return out;
    }, PNG_B64);
    report("C1) the panel's Imagine gets the hot folder (no Camera · Live, no Share — Photoshop has neither): UXP's folder is watched, the shot already there is left alone, the new one joins the photos within a poll, Stop lets go; Portrait Style's door still stands",
      c1.row && !c1.live && c1.hot === "Hot folder ကြည့်မယ်" && !c1.share && c1.hotOn && c1.name === "X Acquire" && has(c1.status || "", "X Acquire") && c1.photos === 1 && c1.pname === "DSC_0101.JPG" && c1.oldIgnored && c1.stopped && c1.psHot, c1);
    const c2 = await pp.evaluate(async (png) => {
      const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
      const bin = atob(png), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const out = {};
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 700)); out.studio = tx(q('#stPicker .cam-slot[data-cam="studio"] .cam-hot')); out.noLive = !q('#stPicker .cam-live');
      switchPage("retouch"); await new Promise((r) => setTimeout(r, 600)); out.retouch = tx(q('#rsPicker .cam-slot[data-cam="retouch"] .cam-hot'));
      switchPage("path"); await new Promise((r) => setTimeout(r, 500)); out.path = tx(q("#ptCamDoor .cam-hot"));
      window.__ents = [{ isFile: true, name: "DSC_0200.JPG", read: async () => bytes.buffer }];
      require("uxp").storage.localFileSystem.getFolder = async () => ({ name: "EOS Utility", getEntries: async () => window.__ents.slice() });
      q("#ptCamDoor .cam-hot").click(); await new Promise((r) => setTimeout(r, 400)); out.pathWatch = tx(q("#ptCamDoor .cam-door-st"));
      window.__ents.push({ isFile: true, name: "DSC_0201.JPG", read: async () => bytes.buffer });
      let t0 = Date.now(); while (Date.now() - t0 < 7000 && !PT.photos.length) await new Promise((r) => setTimeout(r, 80));
      out.pathPhotos = PT.photos.map((p) => p.name).join(); q("#ptCamDoor .cam-hot").click(); await new Promise((r) => setTimeout(r, 200)); out.pathStopped = !q("#ptCamDoor .cam-door-st");
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 600));
      q("#stPicker .cam-hot").click(); await new Promise((r) => setTimeout(r, 400)); out.studioWatch = tx(q("#stPicker .cam-door-st")); out.studioStop = tx(q("#stPicker .cam-hot"));
      window.__ents.push({ isFile: true, name: "DSC_0202.JPG", read: async () => bytes.buffer });
      t0 = Date.now(); while (Date.now() - t0 < 7000 && !(state.refs[0] && state.refs[0].label === "DSC_0202.JPG")) await new Promise((r) => setTimeout(r, 80));
      out.studioLoaded = state.refs[0] && state.refs[0].label; out.filled = !!q("#stPicker .ref.filled img"); out.doorStays = !!q("#stPicker .cam-hot");
      switchPage("retouch"); await new Promise((r) => setTimeout(r, 600)); out.rsFilled = !!q("#rsPicker .ref.filled img"); out.rsDoor = tx(q('#rsPicker .cam-hot'));
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 500)); q("#stPicker .cam-hot").click(); await new Promise((r) => setTimeout(r, 200)); out.studioStopped = !q("#stPicker .cam-door-st");
      return out;
    }, PNG_B64);
    report("C2) the panel's Retouch A, Retouch Pro and Path carry the same Hot folder door in the same slot (no Camera · Live — Photoshop has none); Path's watched folder adds the new shot to the batch, the studio's fills the shared PHOTO slot (Retouch Pro shows the photo, with its own door at rest), the shot already there is left alone, the door stays for the next one, Stop lets go",
      c2.studio === "Hot folder ကြည့်မယ်" && c2.noLive && c2.retouch === "Hot folder ကြည့်မယ်" && c2.path === "Hot folder ကြည့်မယ်" && has(c2.pathWatch || "", "EOS Utility") && c2.pathPhotos === "DSC_0201.JPG" && c2.pathStopped &&
      has(c2.studioWatch || "", "EOS Utility") && c2.studioStop === "ရပ်မယ်" && c2.studioLoaded === "DSC_0202.JPG" && c2.filled && c2.doorStays && c2.rsFilled && c2.rsDoor === "Hot folder ကြည့်မယ်" && c2.studioStopped, c2);   /* Retouch Pro shares the photo, not the watch: its own door is at rest */
    report("C3) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgImagine");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgImagine") === WN.panelRow(WAVE_V, "pgImagine") && WN.appRow(WAVE_V, "pgImagine").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the Portrait Style camera check it follows",
    steps === COUNT && has(CI, "node test/verify_studio_cam_6147.js") && CI.indexOf("verify_studio_cam_6147.js") > CI.indexOf("verify_pstyle_camera_6146.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

(async function main() {
  partA();
  partD();
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
