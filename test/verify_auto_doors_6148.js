/* 6.148.0 / panel 6.219.0 — AUTO-RUN ON EVERY DOOR, and SHOW THE CUSTOMER.
 *
 * The studio's rhythm: the camera fires, the shot lands, the look is applied, the customer sees it — without a
 * tap between. 6.146.0 gave Portrait Style that ("Auto-style each new shot"); 6.147.0 put the doors on every
 * photo page. This wave makes every door run by itself and turns the tablet to the customer:
 *  · A switch under each door — Retouch A / B, Retouch Pro, Path, Imagine, on the web and in the Photoshop panel.
 *    On, a shot from the camera or the hot folder presses the page's own button (GENERATE · Start · the batch ·
 *    Apply) with the settings / recipe set now, so every gate and cost line still applies; a shot that arrives
 *    during a run waits in the door's queue and follows — it never replaces the photo under a run.
 *  · Show the customer — one button on every result (the hand-off row's chip, Portrait Style's, Imagine's): the
 *    result full-screen on black, the original under a drag line, a tap for the result alone, a double tap to
 *    zoom, fullscreen and the wake lock asked for, Escape or × to leave.
 *  · The camera sheet on a landscape tablet: the live view left, the controls right.
 *
 * A) the source on both surfaces and the lifts in sync   B) the web app: the switches, Retouch A's local run, Retouch
 * Pro's run and its queue (two shots), Path's batch, Imagine's auto apply and its pending drain, the overlay from
 * three places   C) the panel: the same switch and words, the same pump pressing the page's button   D) What's New
 * E) release pins
 * Usage: PORT=8931 node test/verify_auto_doors_6148.js   (serve docs/app first) */
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
const PANEL_PS = read("panel/js/hnk_pstyle.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.148.0", PVER = "6.219.0";
const WAVE_V = "6.148.0", PREV_V = "6.147.0";   /* the wave before, whose What's New row this wave reworded — on the WAVE_V line so the bump routine leaves both alone */
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
  report("A1) the words: the switch, its hint, Show the customer, the overlay's hint and Close — nine languages in Portrait Style's table; the switch, the hint and the button in Imagine's (the same words; the panel's doors read Imagine's)",
    ["auto_run", "auto_run_hint", "present", "present_tap", "present_close"].every((k) => all9(P.ui[k])) && ["auto_run", "auto_run_hint", "present"].every((k) => all9(I.ui[k])) &&
    I.ui.auto_run.my === P.ui.auto_run.my && I.ui.present.en === P.ui.present.en && P.ui.auto_run.my === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && P.ui.present.my === "ဖောက်သည်ကို ပြမယ်");

  const cam = slice(APP, "/* ---------- 6.147.0 — THE SAME CAMERA ON EVERY PHOTO PAGE ----------", "  camDoors();");
  report("A2) HNK_CAM: each door knows busy · ready · run (the page's own button: GENERATE, Start, the batch), the shot goes through doorShot — straight in with the switch off, queued and pumped with it on — the pump never takes the next shot while the page is busy or cooling, the switch persists (hnk_cam_auto_v1), the door draws the switch, its hint and the queue count, and the API exposes shot · auto · queue",
    has(cam, 'studio:  { onShot:function(it){ stLoadImage(it.dataUrl); }, busy:function(){ return !!stBusy; }, ready:function(){ return !!(ST && ST.srcBitmap); }, run:function(){ var b=$("btnStGen"); if(b) b.click(); } },') &&
    has(cam, 'busy:function(){ return !!rsBusy; }, ready:function(){ return !!state.refs[0]; }, run:function(){ var b=$("btnV2Start"); if(b && !b.disabled) b.click(); } },') &&
    has(cam, 'busy:function(){ return !!(PT.busy || rsBusy); }, ready:function(){ return ptPending().length>0; }, run:function(){ ptRunAll(); } }') &&
    has(cam, 'var AUTO_KEY="hnk_cam_auto_v1", AUTO={}, AUTO_T={};') && has(cam, "function doorShot(key, item){") && has(cam, "if(!AUTO[key]){ cfg.onShot(item); return; }") &&
    has(cam, "d.queue=d.queue||[]; d.queue.push(item); paintDoor(key); pump(key);") && has(cam, "function pump(key){") && has(cam, "if(busy || (d.cool && Date.now()<d.cool)) return;") &&
    has(cam, "if(ok){ d.armed=false; d.cool=Date.now()+1500; try{ cfg.run(); }catch(e){} }") &&
    has(cam, 'live.onclick=function(){ camera(function(item){ if(item) doorShot(key, item); }, {}); }; row.appendChild(live);') && has(cam, "function(item){ d.n++; doorShot(key, item);") &&
    has(cam, 'cb.id="camAuto_"+key; cb.checked=!!AUTO[key];') && has(cam, 'slot.appendChild(el("p","mut cam-hint", L9(U.auto_run_hint)));') && has(cam, 'slot.appendChild(el("div","mut cam-door-q", L9(U.queue_n).replace("{n}", String(d.queue.length))));') &&
    has(cam, "shot:doorShot, auto:function(key, on){") && has(cam, "queue:function(key){ var d=DOORS[key]; return (d && d.queue) ? d.queue.length : 0; } };"));

  const show = slice(APP, "/* ---------- 6.148.0 — SHOW THE CUSTOMER.", "function stHandoffRow(hostId, mime, b64, name, skip){");
  report("A3) HNK_SHOW stands before the hand-off row that offers it: the overlay with the result, the original under a clip-path split, the two tags, × and the hint; a drag moves the split, a tap toggles the result alone, a double tap zooms, Escape closes; fullscreen and the wake lock are asked for and released; the hand-off row's chip hands the original along for Retouch and Studio",
    has(show, "var HNK_SHOW = (function(){") && has(show, 'w.id="hnkShow";') && has(show, 'st.id="hsStage";') && has(show, 'x.id="hsClose";') && has(show, 'b.style.clipPath = mode==="cmp" ? "inset(0 "+(100-split)+"% 0 0)" : "inset(0 100% 0 0)";') &&
    has(show, 'if(now-lastTap<320){ lastTap=0; zoom = zoom>1 ? 1 : 2;') && has(show, 'if(before){ mode = mode==="cmp" ? "after" : "cmp"; paint(); }') && has(show, 'function onKey(ev){ if(ev.key==="Escape") close(); }') &&
    has(show, "document.documentElement.requestFullscreen") && has(show, 'navigator.wakeLock.request("screen")') && has(show, "wake.release()") && has(show, "document.exitFullscreen") &&
    has(show, "window.HNK_SHOW = HNK_SHOW;") &&
    has(APP, 'if(window.HNK_SHOW && window.HNK_PSTYLE) chip("i-compare", L9(window.HNK_PSTYLE.ui.present), function(){') &&
    has(APP, 'var before = (hostId==="handoffRetouch"||hostId==="handoffStudio") && state.refs[0] ? "data:"+state.refs[0].mime+";base64,"+state.refs[0].b64 : null;') &&
    APP.indexOf("var HNK_SHOW = (function(){") < APP.indexOf("function stHandoffRow(hostId, mime, b64, name, skip){"));

  const im = imLift.between(APP, imLift.M0, imLift.M1, "module"), ps = psLift.between(APP, psLift.M0, psLift.M1, "module");
  report("A4) the modules: Imagine keeps the switch (persisted), arrivals go through arrive() → autoApply (every photo without a result, pending while a run is on, drained in finish), the switch sits in the door row, Show the customer beside Share; Portrait Style offers Show the customer through its host; both hosts hand HNK_SHOW; the panel copies are today's lifts",
    has(im, "hot:null, auto:false, autoPending:false };") && has(im, "stageW:S.stageW, auto:S.auto }));") && has(im, 'if(typeof o.auto==="boolean") S.auto=o.auto;') &&
    has(im, "function arrive(item){ if(!item) return; addPhotos([item]); if(S.auto) autoApply(); }") && has(im, "function autoApply(){") && has(im, "if(S.busy){ S.autoPending=true; return; }") &&
    has(im, "if(p && !p.out && p.status!==\"busy\") idxs.push(i);") && has(im, 'else if(S.autoPending){ S.autoPending=false; setTimeout(autoApply, 60); }') && has(im, 'cb.id="imAuto"; cb.checked=!!S.auto;') &&
    has(im, 'if(H.present && cur && cur.out){ var pv = btn("btn im-present", t("present"), "i-compare"); pv.id="imPresent";') && has(im, "removePhoto:removePhoto, autoApply:autoApply,") &&
    has(ps, 'if(H.present){ var pv=btn("btn", t("present"), "i-compare"); pv.id="psPresent";') &&
    has(APP, "    present: function(o){ if(window.HNK_SHOW) HNK_SHOW.open(o); },   /* 6.148.0 */") && has(APP, "    present: function(o){ if(window.HNK_SHOW) HNK_SHOW.open(o); },   /* 6.148.0 — Show the customer */") &&
    has(PANEL_IM, "function autoApply(){") && has(PANEL_PS, 'pv.id="psPresent"') && imLift.build({ dry: true }).changed.length === 0 && psLift.build({ dry: true }).changed.length === 0);

  const ph = slice(MAIN, "const HOT_AUTO_KEY", "function hotDoorWords() {"), door = slice(MAIN, "function panelCamDoor(slot, key) {", "function hotDoorIntake(key, item) {");
  report("A5) the panel: the same switch under its doors (the same key, Imagine's words), HOT_RUN presses GENERATE · Start · the batch once state.busy / PT.busy clears and the slot is filled, the folder's shots go through hotDoorShot (queued with the switch on), the pump mirrors the web's; no host draws Show the customer",
    has(ph, 'const HOT_AUTO_KEY = "hnk_cam_auto_v1";') && has(ph, 'studio:  { busy: function () { return !!state.busy; }, ready: function () { return !!state.refs[0]; }, run: function () { const b = $("btnStGen"); if (b) b.click(); } },') &&
    has(ph, 'retouch: { busy: function () { return !!state.busy; }, ready: function () { return !!state.refs[0]; }, run: function () { const b = $("btnV2Start"); if (b) b.click(); } },') &&
    has(ph, 'path:    { busy: function () { return !!(PT.busy || state.busy); }, ready: function () { return ptPending().length > 0; }, run: function () { ptRunAll(); } }') &&
    has(ph, "function hotDoorShot(key, item) {") && has(ph, "if (!HOT_AUTO[key] || !HOT_RUN[key]) { hotDoorIntake(key, item); return; }") && has(ph, "function hotPump(key) {") && has(ph, "if (busy || (d.cool && Date.now() < d.cool)) return;") &&
    has(door, 'd.n++; try { hotDoorShot(key, item); }') && has(door, 'cb.id = "camAuto_" + key; cb.checked = !!HOT_AUTO[key];') && has(door, "al.appendChild(document.createTextNode(ff9(U.auto_run)));") && has(door, 'hint.className = "mut cam-hint"; hint.textContent = ff9(U.auto_run_hint);') &&
    !has(slice(MAIN, "function imagineHost() {", "function imagineEnter() {"), "present:") && !has(slice(MAIN, "function pstyleHost() {", "function pstyleEnter() {"), "present:"));

  const imCss = imLift.between(APP, imLift.C0, imLift.C1, "css");
  report("A6) the CSS: the switch and the queue line on both surfaces (flex and margins only in the lifted Imagine block and the panel sheet), the overlay app-only, the camera sheet a two-column grid on a landscape tablet",
    has(APP, ".cam-auto{display:flex;align-items:center;gap:8px;min-height:40px;") && has(APP, ".hnk-show{position:fixed;inset:0;z-index:95;") && has(APP, ".hnk-show .hs-stage img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}") &&
    has(APP, "@media (orientation:landscape) and (min-width:760px){\n.ps-camsheet{display:grid;grid-template-columns:1fr 340px;grid-template-rows:1fr auto}") && has(APP, ".ps-camsheet .ps-camview{grid-column:1;grid-row:1/3;height:100%}") &&
    has(imCss, ".im-auto{display:flex;align-items:center;margin:0 6px 6px 0;min-height:40px;font-size:12.5px;cursor:pointer}") && has(imCss, ".im-auto input{width:40px;height:40px;margin:0 8px 0 0;accent-color:var(--gold)}") &&
    /* the switches themselves stand on the 40px reach floor (verify_ux_wave_6114 measures the input, not its label) */
    has(APP, ".cam-auto input{width:40px;height:40px;margin:0;flex:0 0 40px;accent-color:var(--gold)}") && has(read("panel/styles.css"), ".cam-auto input{width:40px;height:40px;margin:0 8px 0 0;accent-color:var(--accent)}") && has(read("panel/styles.css"), ".im-auto input{width:40px;height:40px;margin:0 8px 0 0;accent-color:var(--accent)}") &&
    has(read("panel/styles.css"), ".cam-auto{display:flex;align-items:center;min-height:40px;margin-top:4px;font-size:13px;cursor:pointer}") && has(read("panel/styles.css"), ".im-auto{display:flex;"));
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
        return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200})); }, window.__rhDelay||30); });
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0)
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u }); }
      return new Promise(function(resolve){ setTimeout(function(){ resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200})); }, 30); });
    }
    return realFetch.apply(this, arguments);
  };
  window.__dl = []; HTMLAnchorElement.prototype.click = function(){ window.__dl.push(this.download); };
  window.__fs = 0; window.__fsExit = 0; window.__wake = 0; window.__wakeRel = 0;
  Element.prototype.requestFullscreen = function(){ window.__fs++; return Promise.resolve(); };
  Document.prototype.exitFullscreen = function(){ window.__fsExit++; return Promise.resolve(); };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: function(){ window.__wake++; return Promise.resolve({ release: function(){ window.__wakeRel++; return Promise.resolve(); } }); } } });
  window.__hotFiles = [];
  window.showDirectoryPicker = function(o){ return Promise.resolve({ kind:"directory", name:"Capture One", values: async function*(){ for (var i=0;i<window.__hotFiles.length;i++) yield window.__hotFiles[i]; } }); };
  window.__pngFile = function(name){ return new Promise(function(res){ var c=document.createElement("canvas"); c.width=64; c.height=48; var x=c.getContext("2d"); x.fillStyle="#9c6"; x.fillRect(0,0,64,48); c.toBlob(function(b){ res({ kind:"file", name:name, getFile: async function(){ return new File([b], name, { type:"image/png" }); } }); }, "image/png"); }); };
  window.__shot = function(name){ var c=document.createElement("canvas"); c.width=96; c.height=72; var x=c.getContext("2d"); x.fillStyle="#c96"; x.fillRect(0,0,96,72); x.fillStyle="#345"; x.fillRect(20,16,56,40); return { dataUrl: c.toDataURL("image/jpeg", 0.9), name: name }; };
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

  /* B1 — the switch on every door, off, persisted */
  const b1 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    const out = {};
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 700));
    out.studio = { label: tx(q('#stPicker .cam-auto')), off: !q("#camAuto_studio").checked, hint: (tx(q("#stPicker .cam-hint")) || "").length > 20 };
    q("#camAuto_studio").click(); await new Promise((r) => setTimeout(r, 60)); out.saved = JSON.parse(localStorage.getItem("hnk_cam_auto_v1") || "{}").studio; out.api = HNK_CAM.auto("studio");
    switchPage("pgRetouch"); await new Promise((r) => setTimeout(r, 500)); out.retouch = { label: tx(q('#rsPicker .cam-auto')), off: !q("#camAuto_retouch").checked };
    switchPage("pgPath"); await new Promise((r) => setTimeout(r, 400)); out.path = { label: tx(q('#ptCamDoor .cam-auto')), off: !q("#camAuto_path").checked };
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 400)); IMAGINE.openTool("lighting"); await new Promise((r) => setTimeout(r, 300)); out.imagine = { label: tx(q("#imCamRow .im-auto")), off: !q("#imAuto").checked };
    return out;
  });
  report("B1) every door carries the switch, off by default, with the same words and a hint; a tap persists it (hnk_cam_auto_v1) and the API reads it back",
    b1.studio.label === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && b1.studio.off && b1.studio.hint && b1.saved === true && b1.api === true &&
    b1.retouch.label === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && b1.retouch.off && b1.path.label === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && b1.path.off && b1.imagine.label === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && b1.imagine.off, b1);

  /* B2 — Retouch A: a slider moved, the switch on, a shot through the door → GENERATE runs by itself (the local render), the result row appears */
  const b2 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 600));
    const d1 = stDefT1(); const k = Object.keys(d1)[0]; state.st.t1[k] = (d1[k] || 0) + 25;   /* an adjustment: GENERATE has something to render */
    const out = { dirty: stIsDirty(), auto: HNK_CAM.auto("studio"), hist0: state.hist.length };
    HNK_CAM.shot("studio", window.__shot("IMG_2001.jpg"));
    let t0 = Date.now(); while (Date.now() - t0 < 12000 && !(state.hist.length > out.hist0 && !stBusy)) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 300));
    out.ran = state.hist.length > out.hist0; out.busyAfter = stBusy; out.row = document.querySelectorAll("#handoffStudio .chip").length; out.present = [...document.querySelectorAll("#handoffStudio .chip")].some((c) => tx(c) === "ဖောက်သည်ကို ပြမယ်"); out.queue = HNK_CAM.queue("studio");
    out.status = tx(q("#stStatus"));
    return out;
  });
  report("B2) Retouch A: with the switch on, a shot through the door becomes the photo and GENERATE runs by itself — the local render lands in the history, the hand-off row appears with Show the customer, the queue is empty, nothing is busy",
    b2.dirty && b2.auto && b2.ran && !b2.busyAfter && b2.row >= 3 && b2.present && b2.queue === 0, b2);

  /* B3 — Show the customer from the Studio's result: the original under the split, drag, tap, double tap, Escape */
  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    const chip = [...document.querySelectorAll("#handoffStudio .chip")].find((c) => tx(c) === "ဖောက်သည်ကို ပြမယ်"); chip.click(); await new Promise((r) => setTimeout(r, 150));
    const w = q("#hnkShow"); const out = { open: !!w, mode: w && w.getAttribute("data-mode"), imgs: document.querySelectorAll("#hnkShow img").length, before: !!q("#hnkShow .hs-before"), tags: [...document.querySelectorAll("#hnkShow .hs-tag")].map((t) => tx(t)), fs: window.__fs, wake: window.__wake, hint: tx(q("#hnkShow .hs-hint")) };
    HNK_SHOW.split(30); out.split = w.getAttribute("data-split"); out.clip = q("#hnkShow .hs-before").style.clipPath; out.line = q("#hnkShow .hs-line").style.left;
    const st = q("#hsStage"); const r = st.getBoundingClientRect();
    const pev = (type, x, y) => { st.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })); };
    pev("pointerdown", r.left + 100, r.top + 300); pev("pointermove", r.left + 200, r.top + 300); pev("pointermove", r.left + 260, r.top + 300); pev("pointerup", r.left + 260, r.top + 300);
    out.dragSplit = Number(w.getAttribute("data-split")); out.dragOk = Math.abs(out.dragSplit - Math.round(260 / r.width * 100)) <= 2;
    pev("pointerdown", r.left + 150, r.top + 300); pev("pointerup", r.left + 150, r.top + 300); await new Promise((r2) => setTimeout(r2, 420)); out.tapMode = w.getAttribute("data-mode"); out.tapClip = q("#hnkShow .hs-before").style.clipPath; out.lineHidden = q("#hnkShow .hs-line").style.display === "none";
    pev("pointerdown", r.left + 150, r.top + 300); pev("pointerup", r.left + 150, r.top + 300); await new Promise((r2) => setTimeout(r2, 420)); out.tapBack = w.getAttribute("data-mode");
    pev("pointerdown", r.left + 120, r.top + 200); pev("pointerup", r.left + 120, r.top + 200); await new Promise((r2) => setTimeout(r2, 80)); pev("pointerdown", r.left + 120, r.top + 200); pev("pointerup", r.left + 120, r.top + 200); await new Promise((r2) => setTimeout(r2, 420));
    out.zoom = w.getAttribute("data-zoom"); out.scale = st.style.transform;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((r2) => setTimeout(r2, 100));
    out.closed = !q("#hnkShow"); out.wakeRel = window.__wakeRel; out.state = HNK_SHOW.state().open;
    return out;
  });
  report("B3) Show the customer from the Studio's result: the overlay with the result and the original under the split, both tags, the hint, fullscreen and the wake lock asked for; the split follows the API and the drag; a tap shows the result alone (the line hides) and a tap brings the compare back; a double tap zooms 2×; Escape closes and releases the lock",
    b3.open && b3.mode === "cmp" && b3.imgs === 2 && b3.before && b3.tags.join() === "မူရင်း,ရလဒ်" && b3.fs === 1 && b3.wake === 1 && b3.hint.length > 20 &&
    b3.split === "30" && b3.clip === "inset(0px 70% 0px 0px)" && b3.line === "30%" && b3.dragOk && b3.tapMode === "after" && b3.tapClip === "inset(0px 100% 0px 0px)" && b3.lineHidden && b3.tapBack === "cmp" && b3.zoom === "2" && /scale\(2\)/.test(b3.scale) && b3.closed && b3.wakeRel === 1 && b3.state === false, b3);

  /* B4 — Retouch Pro: two shots in a row with the switch on — the first runs, the second waits in the queue and runs after */
  const b4 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    switchPage("pgRetouch"); await new Promise((r) => setTimeout(r, 500));
    q("#camAuto_retouch").click(); await new Promise((r) => setTimeout(r, 60));
    window.__rhDelay = 900;
    const h0 = state.hist.length, r0 = window.__reqs.length;
    HNK_CAM.shot("retouch", window.__shot("IMG_2002.jpg")); HNK_CAM.shot("retouch", window.__shot("IMG_2003.jpg"));
    const out = { queued0: HNK_CAM.queue("retouch") };
    let t0 = Date.now(); while (Date.now() - t0 < 6000 && !rsBusy) await new Promise((r) => setTimeout(r, 40));
    out.busy = rsBusy; out.queuedWhileBusy = HNK_CAM.queue("retouch"); out.firstLabel = state.refs[0] && state.refs[0].label; out.qLine = ((q('#rsPicker .cam-door-q') || {}).textContent || "").trim();
    t0 = Date.now(); while (Date.now() - t0 < 25000 && !(state.hist.length >= h0 + 2 && !rsBusy && HNK_CAM.queue("retouch") === 0)) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 300));
    out.hist = state.hist.length - h0; out.reqs = window.__reqs.length - r0; out.secondLabel = state.refs[0] && state.refs[0].label; out.queueAfter = HNK_CAM.queue("retouch"); out.busyAfter = rsBusy;
    window.__rhDelay = 30;
    return out;
  });
  report("B4) Retouch Pro: two shots through the door with the switch on — both queue, the first fills slot 0 and Start runs, the second waits (the queue line says so) and never replaces the photo under the run, then runs itself — two results, two calls, the second shot on the slot, nothing left waiting",
    b4.queued0 === 2 && b4.busy && b4.queuedWhileBusy === 1 && b4.firstLabel === "IMG_2002.jpg" && has(b4.qLine, "1") && b4.hist === 2 && b4.reqs === 2 && b4.secondLabel === "IMG_2003.jpg" && b4.queueAfter === 0 && !b4.busyAfter, b4);

  /* B5 — Path: the switch on, a shot from the watched folder → the batch is started (its own guards apply) */
  const b5 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    switchPage("pgPath"); await new Promise((r) => setTimeout(r, 500));
    window.__runs = 0; const real = window.ptRunAll; window.ptRunAll = function () { window.__runs++; return real.apply(this, arguments); };
    q("#camAuto_path").click(); await new Promise((r) => setTimeout(r, 60));
    window.__hotFiles = []; q("#ptCamDoor .cam-hot").click();
    let t0 = Date.now(); while (Date.now() - t0 < 3000 && !q("#ptCamDoor .cam-door-st")) await new Promise((r) => setTimeout(r, 40));
    const n0 = PT.photos.length;
    window.__hotFiles.push(await window.__pngFile("IMG_2004.jpg"));
    t0 = Date.now(); while (Date.now() - t0 < 9000 && !(PT.photos.length > n0 && window.__runs > 0)) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 200));
    const out = { added: PT.photos.length - n0, runs: window.__runs, name: PT.photos[PT.photos.length - 1] && PT.photos[PT.photos.length - 1].name, queue: HNK_CAM.queue("path") };
    q("#ptCamDoor .cam-hot").click(); await new Promise((r) => setTimeout(r, 150)); window.ptRunAll = real;
    return out;
  });
  report("B5) Path: with the switch on, a shot from the watched folder joins the batch and the batch is started by itself (once, through the page's own runner and its guards)",
    b5.added === 1 && b5.runs === 1 && b5.name === "IMG_2004.jpg" && b5.queue === 0, b5);

  /* B6 — Imagine: the switch on with a template chosen; a shot from the camera door applies at once; a second during the run is pending and follows; Show the customer beside Share */
  const b6 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 500));
    const IM = IMAGINE; IM.openTool("lighting"); await new Promise((r) => setTimeout(r, 300));
    if (q(".im-tpl[data-preset]:not(.im-ref)")) q(".im-tpl[data-preset]:not(.im-ref)").click(); await new Promise((r) => setTimeout(r, 150));
    q("#imAuto").click(); await new Promise((r) => setTimeout(r, 80));
    const out = { auto: IM.state.auto, saved: (JSON.parse(localStorage.getItem("hnk_ws_imagine_v1") || "{}")).auto, preset: IM.state.preset.lighting };
    const r0 = window.__reqs.length; window.__rhDelay = 700;
    q("#imCamLive").click();
    let t0 = Date.now(); while (Date.now() - t0 < 6000 && !(q("#psCamSheet video") && q("#psCamSheet video").videoWidth > 0)) await new Promise((r) => setTimeout(r, 50));
    q("#psSnap").click(); t0 = Date.now(); while (Date.now() - t0 < 5000 && q("#psCamSheet")) await new Promise((r) => setTimeout(r, 60));
    t0 = Date.now(); while (Date.now() - t0 < 5000 && !IM.state.busy) await new Promise((r) => setTimeout(r, 40));
    out.busyAfterSnap = IM.state.busy; out.photos1 = IM.state.photos.length;
    IM.addPhotos([window.__shot("IMG_2005.jpg")]); IM.autoApply(); out.pending = IM.state.autoPending;
    t0 = Date.now(); while (Date.now() - t0 < 25000 && !(IM.state.photos.length === 2 && IM.state.photos.every((p) => !!p.out) && !IM.state.busy)) await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => setTimeout(r, 300));
    out.results = IM.state.photos.filter((p) => !!p.out).length; out.reqs = window.__reqs.length - r0; out.pendingAfter = IM.state.autoPending; out.present = tx(q("#imPresent"));
    q("#imPresent").click(); await new Promise((r) => setTimeout(r, 150)); out.overlay = !!q("#hnkShow") && q("#hnkShow").getAttribute("data-mode") === "cmp"; HNK_SHOW.close();
    window.__rhDelay = 30;
    return out;
  });
  report("B6) Imagine: the switch persists; a shot from Camera · Live applies with the chosen template at once; a photo added during the run is pending and follows when the run ends — two results from two calls; Show the customer sits beside Share and opens the compare",
    b6.auto && b6.saved === true && b6.preset && b6.busyAfterSnap && b6.photos1 === 1 && b6.pending && b6.results === 2 && b6.reqs === 2 && !b6.pendingAfter && b6.present === "ဖောက်သည်ကို ပြမယ်" && b6.overlay, b6);

  /* B7 — Portrait Style keeps its own chip */
  const b7 = await page.evaluate(async (b64) => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    switchPage("pgPStyle"); await new Promise((r) => setTimeout(r, 400));
    PSTYLE.setPhoto({ dataUrl: "data:image/jpeg;base64," + b64, name: "kid.jpg" }); await new Promise((r) => setTimeout(r, 200));
    PSTYLE.state.versions = [{ dataUrl: "data:image/png;base64," + window.__outB64, mime: "image/png", b64: window.__outB64, model: "", size: "", ts: Date.now() }]; PSTYLE.state.cur = 0; PSTYLE.setStep(3); await new Promise((r) => setTimeout(r, 200));
    const out = { chip: tx(q("#psPresent")) };
    q("#psPresent").click(); await new Promise((r) => setTimeout(r, 150)); out.overlay = !!q("#hnkShow"); out.mode = q("#hnkShow") && q("#hnkShow").getAttribute("data-mode"); q("#hsClose").click(); await new Promise((r) => setTimeout(r, 80)); out.closed = !q("#hnkShow");
    return out;
  }, PHOTO);
  report("B7) Portrait Style's step 03 offers Show the customer too — the result over the photo — and × closes it",
    b7.chip === "ဖောက်သည်ကို ပြမယ်" && b7.overlay && b7.mode === "cmp" && b7.closed, b7);

  report("B8) no page error through any of it", errs.length === 0, errs);
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
      const out = {};
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 700)); out.studio = tx(q('#stPicker .cam-auto')); out.off = !q("#camAuto_studio").checked; out.hint = (tx(q("#stPicker .cam-hint")) || "").length > 20;
      switchPage("retouch"); await new Promise((r) => setTimeout(r, 600)); out.retouch = tx(q('#rsPicker .cam-auto'));
      switchPage("path"); await new Promise((r) => setTimeout(r, 500)); out.path = tx(q('#ptCamDoor .cam-auto'));
      switchPage("imagine"); await new Promise((r) => setTimeout(r, 400)); globalThis.HNK.imagine.openTool("lighting"); await new Promise((r) => setTimeout(r, 300)); out.imagine = tx(q("#imCamRow .im-auto")); out.noPresent = !q("#imPresent");
      /* the studio door with the switch on: the folder's shot fills the slot and GENERATE is pressed by itself */
      const bin = atob(png), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.__ents = [];
      require("uxp").storage.localFileSystem.getFolder = async () => ({ name: "EOS Utility", getEntries: async () => window.__ents.slice() });
      switchPage("meitu"); await new Promise((r) => setTimeout(r, 600));
      window.__genClicks = 0; $("btnStGen").addEventListener("click", function () { window.__genClicks++; });
      q("#camAuto_studio").click(); await new Promise((r) => setTimeout(r, 60)); out.saved = JSON.parse(localStorage.getItem("hnk_cam_auto_v1") || "{}").studio;
      q("#stPicker .cam-hot").click(); await new Promise((r) => setTimeout(r, 400));
      window.__ents.push({ isFile: true, name: "DSC_0301.JPG", read: async () => bytes.buffer });
      let t0 = Date.now(); while (Date.now() - t0 < 9000 && !(state.refs[0] && state.refs[0].label === "DSC_0301.JPG" && window.__genClicks > 0)) await new Promise((r) => setTimeout(r, 80));
      await new Promise((r) => setTimeout(r, 200));
      out.loaded = state.refs[0] && state.refs[0].label; out.clicks = window.__genClicks;
      q("#stPicker .cam-hot").click(); await new Promise((r) => setTimeout(r, 150)); out.stopped = !q("#stPicker .cam-door-st");
      return out;
    }, PNG_B64);
    report("C1) the panel: the same switch and words under Retouch A / Retouch Pro / Path's doors and in Imagine's row (no Show the customer — Photoshop has no customer screen); with the switch on, the folder's shot fills the PHOTO slot and GENERATE is pressed by itself",
      c1.studio === "ပုံအသစ် ရောက်တိုင်း အလိုအလျောက် လုပ်" && c1.off && c1.hint && c1.retouch === c1.studio && c1.path === c1.studio && c1.imagine === c1.studio && c1.noPresent &&
      c1.saved === true && c1.loaded === "DSC_0301.JPG" && c1.clicks === 1 && c1.stopped, c1);
    report("C2) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgMeitu");
  const prev = WN.find(WN.appRows(), PREV_V, "pgImagine");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages (the panel says the same), and the 6.147.0 row now says the panel draws the Hot folder on every one of those pages",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgMeitu") === WN.panelRow(WAVE_V, "pgMeitu") && WN.appRow(WAVE_V, "pgMeitu").length > 200 &&
    !!prev && has(prev.s.en, "the Photoshop panel draws the same Hot folder on every one of these pages") && has(prev.s.my, "Photoshop panel မှာလည်း ဒီ page တိုင်း Hot folder"),
    { row: !!row, langs: !!row && LANGS.every((c) => row.t[c] && row.s[c]), same: WN.appRow(WAVE_V, "pgMeitu") === WN.panelRow(WAVE_V, "pgMeitu"), len: WN.appRow(WAVE_V, "pgMeitu").length, prev: !!prev, en: !!prev && has(prev.s.en, "the Photoshop panel draws the same Hot folder on every one of these pages"), my: !!prev && has(prev.s.my, "Photoshop panel မှာလည်း ဒီ page တိုင်း Hot folder") });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the studio camera check it follows",
    steps === COUNT && has(CI, "node test/verify_auto_doors_6148.js") && CI.indexOf("verify_auto_doors_6148.js") > CI.indexOf("verify_studio_cam_6147.js"), { steps });
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
