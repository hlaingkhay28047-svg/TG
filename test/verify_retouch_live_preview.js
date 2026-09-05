/* v6.23.0 — Retouch A / Retouch B live preview upgrade: the stage measures its own
   speed and walks a quality ladder; zoom presets frame the face, eyes and lips;
   press-and-hold on the picture peeks at Before; the A|B split swaps sides.
   Usage: PORT=8931 node test/verify_retouch_live_preview.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PANEL = fs.readFileSync(path.join(ROOT, "panel/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 420)));
  if (!ok) failures++;
}

/* ---- A) source pins ---- */
report("A) the ladder: 1280→1600→2048 / 320→448→576 on desktop, 896→1280 / 320→448 on a phone; stBufMax and stProxyLong read the rung",
  /var ST_Q_LADDER = \{ desktop:\{ buf:\[1280,1600,2048\], proxy:\[320,448,576\] \}, phone:\{ buf:\[896,1280\], proxy:\[320,448\] \} \};/.test(APP) &&
  /function stBufMax\(\)\{ stQClampIdx\(\); return stQLadder\(\)\.buf\[ST\.q\.i\]; \}/.test(APP) &&
  /function stProxyLong\(\)\{ stQClampIdx\(\); return stQLadder\(\)\.proxy\[ST\.q\.pi\]; \}/.test(APP) &&
  /var ST_PROXY_LONG = 320;/.test(APP), null);
report("A2) every settle path and the proxy paint report their time to the ladder — once each; the RS baseline stays 1280",
  (APP.match(/stQObserve\("sync", stNow\(\)-_t0\)/g) || []).length === 1 &&
  (APP.match(/stQObserve\("worker", stNow\(\)-_t0\)/g) || []).length === 1 &&
  (APP.match(/stQObserve\("proxy", stNow\(\)-_t0\)/g) || []).length === 1 &&
  /var RS = \(typeof opts\.rs === "number" && opts\.rs > 0\) \? opts\.rs : Math\.max\(1, Math\.max\(W,H\)\/1280\);/.test(APP), null);
report("A3) the rung persists in hnk_st_ui per device class, and the stage's own pref save keeps it",
  /u\.q\[stQClass\(\)\]=\{i:ST\.q\.i,pi:ST\.q\.pi\}/.test(APP) &&
  /function stUiSave\(\)\{ try\{ var u=\{\}; try\{ u=JSON\.parse\(localStorage\.getItem\(ST_UI_LS\)\|\|"\{\}"\)\|\|\{\}; \}catch\(e0\)\{\} u\.mode=ST\.ui\.mode; u\.pipCorner=ST\.ui\.pipCorner;/.test(APP) &&
  /var qc=window\.innerWidth<720\?"phone":"desktop", qq=u\.q&&u\.q\[qc\]; if\(qq\)\{ ST\.q\.i=qq\.i\|0; ST\.q\.pi=qq\.pi\|0; \}/.test(APP), null);
report("A4) a changed buffer rung is never a mid-session rebuild: the ladder only marks it pending and saves; stBuildBuffer (the next photo load) is what reads the rung and clears the flag",
  /if\(q\.slow>=2&&q\.i>0\)\{ q\.i--; q\.slow=0; q\.pendingBuf=true; stQSave\(\); \}/.test(APP) &&
  /if\(q\.fast>=3&&q\.i<L\.buf\.length-1\)\{ q\.i\+\+; q\.fast=0; q\.pendingBuf=true; stQSave\(\); \}/.test(APP) &&
  /ST\.q\.pendingBuf=false;\s+\/\* v6\.23\.0 — this build is at the current rung \*\//.test(APP) &&
  !/stQApply/.test(APP) && !/stBuildBuffer\(\)[^\n]*\n[^\n]*stQObserve/.test(APP), null);
report("A5) stage chrome: swap chip beside A|B, zoom presets row, the picture owns the long press (no callout / selection); the panel still has no live stage by design",
  /#stSplitSwap\{top:10px;left:62px/.test(APP) && /\.st-zoom-presets\{position:absolute;top:52px;left:6px;right:6px/.test(APP) &&
  /#stZoomWrap\{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none\}/.test(APP) &&
  /var sx0=ST\.split\.swap\?cwp:0, sw0=ST\.split\.swap\?c\.width-cwp:cwp;/.test(APP) &&
  !/id="stStage"/.test(PANEL), null);
report("A6) What's New 6.23.0 points at Retouch A; CI runs this test",
  /\{ v:"6\.23\.0", kind:"page", ref:"pgMeitu",/.test(APP) && /node test\/verify_retouch_live_preview\.js/.test(CI), null);

/* ---- B) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  /* a 3000x2000 photo: flat mid-gray with a soft gradient — the ladder needs a photo bigger than
     every rung, the pixel checks need a flat field an exposure move brightens everywhere.
     The ladder's real measurements are silenced for the run (headless Chromium settles a 1280
     buffer in well under the budget and would walk the rung by itself); the checks step it by
     hand through the same function. */
  const loaded = await page.evaluate(async () => {
    switchPage("pgMeitu");
    window.__realObserve = stQObserve; window.__manual = false;
    stQObserve = function (k, ms) { if (window.__manual) return window.__realObserve(k, ms); };
    window.obs = (k, ms) => { window.__manual = true; try { window.__realObserve(k, ms); } finally { window.__manual = false; } };
    window.loadGray = async () => {
      const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 3000, 0); g.addColorStop(0, "rgb(112,112,112)"); g.addColorStop(1, "rgb(128,128,128)");
      x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
      await new Promise(res => { ST.loadImage(c.toDataURL("image/jpeg", 0.8), { done: res }); });
      /* the face scan of this photo lands asynchronously and re-renders; wait for it so nothing below races it */
      for (let w = 0; w < 150 && !((ST.faceLM && ST.faceLM.scanned) || (window.STFACE && STFACE.off)); w++) await new Promise(r => setTimeout(r, 100));
    };
    await window.loadGray();
    return { cls: stQClass(), i: ST.q.i, bufW: ST.buf.width, bufMax: stBufMax(), proxy: stProxyLong(), scanned: !!(ST.faceLM && ST.faceLM.scanned), off: !!(window.STFACE && STFACE.off) };
  });
  report("B) desktop, fresh: rung 0 — buffer 1280 wide, proxy 320, stage class desktop", loaded.cls === "desktop" && loaded.i === 0 && loaded.bufW === 1280 && loaded.bufMax === 1280 && loaded.proxy === 320, loaded);

  const up = await page.evaluate(async () => {
    ST.q.fast = 0; ST.q.slow = 0;
    obs("sync", 30); obs("sync", 30);
    const two = { i: ST.q.i, pending: ST.q.pendingBuf };
    obs("sync", 30);
    const three = { i: ST.q.i, pending: ST.q.pendingBuf, bufW: ST.buf.width, bufMax: stBufMax() };
    let ls = {}; try { ls = JSON.parse(localStorage.getItem("hnk_st_ui") || "{}"); } catch (e) {}
    await window.loadGray();
    return { two, three, ls: ls.q && ls.q.desktop, next: { bufW: ST.buf.width, bufH: ST.buf.height, pending: ST.q.pendingBuf } };
  });
  report("B2) three fast settles step the rung up (two do not) and persist it; the open photo keeps its buffer; the NEXT photo opens at 1600",
    up.two.i === 0 && up.two.pending === false && up.three.i === 1 && up.three.pending === true && up.three.bufW === 1280 && up.three.bufMax === 1600 &&
    up.ls && up.ls.i === 1 && up.next.bufW === 1600 && up.next.bufH === 1067 && up.next.pending === false, up);

  const down = await page.evaluate(async () => {
    obs("sync", 400); const one = { i: ST.q.i, bufW: ST.buf.width };
    obs("sync", 400); const two = { i: ST.q.i, bufW: ST.buf.width, pending: ST.q.pendingBuf };
    await window.loadGray();
    return { one, two, next: ST.buf.width };
  });
  report("B3) two slow settles step it back down (one does not); the next photo opens at 1280 again", down.one.i === 1 && down.one.bufW === 1600 && down.two.i === 0 && down.two.bufW === 1600 && down.two.pending === true && down.next === 1280, down);

  const px = await page.evaluate(() => {
    ST.q.pfast = 0; ST.q.pslow = 0;
    obs("proxy", 3); obs("proxy", 3); const two = stProxyLong(); obs("proxy", 3);
    const upP = stProxyLong();
    obs("proxy", 40); obs("proxy", 40);
    return { two, upP, downP: stProxyLong(), pi: ST.q.pi };
  });
  report("B4) the drag proxy has its own rung: three fast paints → 448, two slow → 320", px.two === 320 && px.upP === 448 && px.downP === 320 && px.pi === 0, px);

  const quiet = await page.evaluate(async () => {
    const sm = document.getElementById("mu_exp") || document.getElementById("ev_exp");
    for (let k = 0; k < 4; k++) { sm.value = String(20 + k * 10); sm.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 250)); }
    return { i: ST.q.i, pending: ST.q.pendingBuf, bufW: ST.buf.width };
  });
  report("B5) with the real measurements silenced for this run, four edits leave the rung where the hand-steps put it", quiet.i === 0 && quiet.pending === false && quiet.bufW === 1280, quiet);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const phone = await page.evaluate(() => ({ cls: stQClass(), bufMax: stBufMax(), ladder: stQLadder().buf.join(","), i: ST.q.i }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  report("B6) on a phone the ladder starts at 896 and tops out at 1280", phone.cls === "phone" && phone.bufMax === 896 && phone.ladder === "896,1280" && phone.i === 0, phone);

  const keep = await page.evaluate(() => {
    stQSave(); stUiSave();
    let ls = {}; try { ls = JSON.parse(localStorage.getItem("hnk_st_ui") || "{}"); } catch (e) {}
    return { hasMode: typeof ls.mode === "string", q: ls.q && ls.q.desktop };
  });
  report("B7) stUiSave (mode / pip corner) no longer wipes the measured rung", keep.hasMode && keep.q && typeof keep.q.i === "number", keep);

  /* ---- C) zoom presets on a synthetic 68-point face ---- */
  const zoom = await page.evaluate(async () => {
    if (ST.zoomReset) ST.zoomReset();
    const W = ST.buf.width, H = ST.buf.height;
    const pts = [];
    const arc = (n, cx, cy, rx, ry, a0, a1) => { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / Math.max(1, n - 1); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } };
    const ring = (n, cx, cy, rx, ry) => { for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } }; /* closed, symmetric */
    arc(17, 0.5 * W, 0.50 * H, 0.22 * W, 0.30 * H, Math.PI, 2 * Math.PI);        // 0-16 jaw (lower arc)
    arc(5, 0.40 * W, 0.34 * H, 0.05 * W, 0.005 * H, Math.PI, 2 * Math.PI);        // 17-21 brow L
    arc(5, 0.60 * W, 0.34 * H, 0.05 * W, 0.005 * H, Math.PI, 2 * Math.PI);        // 22-26 brow R
    for (let k = 0; k < 4; k++) pts.push([0.5 * W, (0.40 + 0.04 * k) * H]);      // 27-30 nose bridge
    arc(5, 0.5 * W, 0.53 * H, 0.04 * W, 0.01 * H, 0, Math.PI);                    // 31-35 nose base
    ring(6, 0.40 * W, 0.40 * H, 0.03 * W, 0.015 * H);                             // 36-41 eye L
    ring(6, 0.60 * W, 0.40 * H, 0.03 * W, 0.015 * H);                             // 42-47 eye R
    ring(12, 0.5 * W, 0.62 * H, 0.08 * W, 0.025 * H);                             // 48-59 outer lip
    ring(8, 0.5 * W, 0.62 * H, 0.05 * W, 0.012 * H);                              // 60-67 inner lip
    ST.faceLM = { w: W, h: H, scanned: true, faces: [{ score: 0.9, area: 0.1, pts }] };
    ST.refreshFns.forEach(f => { try { f(); } catch (e) {} });
    const c = document.getElementById("stCanvas"), Z = ST.ui.zoom;
    const vis = id => document.getElementById(id) && document.getElementById(id).style.display !== "none";
    const shown = { face: vis("stZpFace"), eyes: vis("stZpEyes"), lips: vis("stZpLips"), fit: vis("stZpFit"), p100: vis("stZp100") };
    const k = c.clientWidth / c.width;
    const rE = ST.faceRegion("eyes"), rL = ST.faceRegion("lips");   /* the app's own regions, in buffer px */
    document.getElementById("stZpEyes").click();
    const eyes = { s: Z.s, cx: rE.cx * k * Z.s + Z.x, cy: rE.cy * k * Z.s + Z.y, midX: c.clientWidth / 2, midY: c.clientHeight / 2, regDx: Math.abs(rE.cx - 0.5 * W), regDy: Math.abs(rE.cy - 0.40 * H) };
    document.getElementById("stZpLips").click();
    const lips = { s: Z.s, cx: rL.cx * k * Z.s + Z.x, cy: rL.cy * k * Z.s + Z.y };
    document.getElementById("stZpFace").click();
    const face = { s: Z.s };
    document.getElementById("stZp100").click();
    const p100 = { s: Z.s, native: c.width / c.clientWidth };
    document.getElementById("stZpFit").click();
    const fit = { s: Z.s, x: Z.x, y: Z.y };
    ST.faceLM = { w: W, h: H, scanned: true, faces: [] };
    ST.refreshFns.forEach(f => { try { f(); } catch (e) {} });
    const hidden = { face: vis("stZpFace"), eyes: vis("stZpEyes"), lips: vis("stZpLips"), fit: vis("stZpFit") };
    return { shown, eyes, lips, face, p100, fit, hidden, ind: (document.getElementById("stZoomInd") || {}).textContent };
  });
  report("C) with a face the Face / Eyes / Lips chips appear beside Fit / 100%; without one they hide and Fit / 100% stay",
    zoom.shown.face && zoom.shown.eyes && zoom.shown.lips && zoom.shown.fit && zoom.shown.p100 && !zoom.hidden.face && !zoom.hidden.eyes && !zoom.hidden.lips && zoom.hidden.fit, { shown: zoom.shown, hidden: zoom.hidden });
  report("C2) Eyes zooms in and puts the eye-pair region (the app's own, on the synthetic eyes ±2 buffer px) at the centre of the stage (±1px); Lips zooms tighter than Face; 100% is one buffer pixel per CSS pixel; Fit resets",
    zoom.eyes.s > 1.5 && Math.abs(zoom.eyes.cx - zoom.eyes.midX) <= 1 && Math.abs(zoom.eyes.cy - zoom.eyes.midY) <= 1 && zoom.eyes.regDx <= 2 && zoom.eyes.regDy <= 2 &&
    zoom.lips.s > zoom.face.s && Math.abs(zoom.lips.cx - zoom.eyes.midX) <= 1 && Math.abs(zoom.lips.cy - zoom.eyes.midY) <= 1 &&
    Math.abs(zoom.p100.s - zoom.p100.native) < 0.02 && zoom.fit.s === 1 && zoom.fit.x === 0 && zoom.fit.y === 0, { eyes: zoom.eyes, lips: zoom.lips, face: zoom.face, p100: zoom.p100, fit: zoom.fit });

  /* ---- D) press-and-hold on the picture = Before peek ---- */
  const hold = await page.evaluate(async () => {
    if (ST.zoomReset) ST.zoomReset();
    const sm = document.getElementById("mu_exp") || document.getElementById("ev_exp");
    sm.value = "60"; sm.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 450));
    const c = document.getElementById("stCanvas"), wrap = document.getElementById("stZoomWrap");
    const r = wrap.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const edited = c.toDataURL();
    wrap.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, clientX: cx, clientY: cy, isPrimary: true }));
    await new Promise(r2 => setTimeout(r2, 150));
    const early = ST.holding;
    await new Promise(r2 => setTimeout(r2, 350));
    const held = { holding: ST.holding, differs: c.toDataURL() !== edited };
    wrap.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientX: cx, clientY: cy, isPrimary: true }));
    await new Promise(r2 => setTimeout(r2, 450));
    const released = { holding: ST.holding, same: c.toDataURL() === edited };
    /* a finger that drifts is a pan/scroll, not a press */
    wrap.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 4, clientX: cx, clientY: cy, isPrimary: true }));
    await new Promise(r2 => setTimeout(r2, 100));
    wrap.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 4, clientX: cx + 30, clientY: cy, isPrimary: true }));
    await new Promise(r2 => setTimeout(r2, 450));
    const drifted = ST.holding;
    wrap.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 4, clientX: cx + 30, clientY: cy, isPrimary: true }));
    await new Promise(r2 => setTimeout(r2, 200));
    return { early, held, released, drifted, after: ST.holding };
  });
  report("D) a 350ms press on the picture shows Before (not at 150ms); release restores the edit; a drifting finger never peeks",
    hold.early === false && hold.held.holding === true && hold.held.differs && hold.released.holding === false && hold.released.same && hold.drifted === false && hold.after === false, hold);

  /* ---- E) A|B swap ---- */
  const swap = await page.evaluate(async () => {
    const c = document.getElementById("stCanvas"), cc = c.getContext("2d");
    const lum = x => { const d = cc.getImageData(Math.round(x * c.width), Math.round(c.height / 2), 1, 1).data; return d[0]; };
    const sw = document.getElementById("stSplitSwap");
    const hiddenOff = sw.style.display === "none";
    document.getElementById("stSplit").click();
    await new Promise(r => setTimeout(r, 450));
    const on = { shown: sw.style.display !== "none", left: lum(0.1), right: lum(0.9), pct: ST.split.pct, swap: ST.split.swap };
    sw.click();
    await new Promise(r => setTimeout(r, 450));
    const swapped = { left: lum(0.1), right: lum(0.9), swap: ST.split.swap, chipOn: sw.classList.contains("on") };
    sw.click();
    await new Promise(r => setTimeout(r, 450));
    const back = { left: lum(0.1), right: lum(0.9), swap: ST.split.swap };
    document.getElementById("stSplit").click();
    await new Promise(r => setTimeout(r, 300));
    const off = { shown: sw.style.display !== "none", splitOn: ST.split.on };
    return { hiddenOff, on, swapped, back, off };
  });
  report("E) the swap chip lives only while A|B is on; source left / edited right by default, swapped puts the edit left and the source right, and back again",
    swap.hiddenOff && swap.on.shown && swap.on.swap === false && swap.on.left < swap.on.right - 12 &&
    swap.swapped.swap === true && swap.swapped.chipOn && swap.swapped.left > swap.swapped.right + 12 &&
    swap.back.swap === false && swap.back.left < swap.back.right - 12 && !swap.off.shown && swap.off.splitOn === false, swap);

  report("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — the live preview measures itself, frames the face, peeks at Before under a thumb, and compares from either side");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
