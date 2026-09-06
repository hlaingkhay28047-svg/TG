/* v6.24.0 — Retouch A / B fidelity + precision: the zoomed picture is rendered from the
   retained original (true-detail overlay, 1:1 preset), the makeup passes read the measured
   CONTOURS instead of bounding ellipses, the Dark Circles / Eye Bags / Smile Lines / Brow
   Makeup sliders drive live pixels (and still their AI line), Before / A|B can compare
   against a pinned state, and a wide stage shows before beside after (2-up).
   Usage: PORT=8931 node test/verify_retouch_precision.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 460)));
  if (!ok) failures++;
}

/* ---- A) source pins ---- */
report("A) contour helpers exist, ride into the render worker, and the zones carry the measured polygons + under-eye ellipses",
  /^function stLmPoly\(pts,idx\)/m.test(APP) && /^function stLmBand\(pts,idx,half\)/m.test(APP) && /^function stLmQuad\(a,b,half\)/m.test(APP) &&
  /^function stPolyScale\(poly,sc\)/m.test(APP) && /^function stShapeAlpha\(W,H,shapes,feather\)/m.test(APP) &&
  /stLmEll,stLmRange,stLmPoly,stLmBand,stLmQuad,stPolyScale,stShapeAlpha,stZonesOneFace,/.test(APP) &&
  /R\.poly=\{ lips:stLmPoly\(pts,stLmRange\(48,59\)\), lipInner:stLmPoly\(pts,stLmRange\(60,67\)\),/.test(APP) &&
  /R\.underEyeL=F\.E\(-0\.5,0\.40,0\.36,0\.20\); R\.underEyeR=F\.E\(0\.5,0\.40,0\.36,0\.20\);/.test(APP), null);
report("A2) the passes read the contour alpha and fall back to the ellipse test only when a face carries no polygons",
  /var inLip = lipA \? \(lipA\[i\]>0\.02\) : \(zLips\.length \? stInAny\(xPix,yPix,zLips,1\.0\) : null\);/.test(APP) &&
  /var inMouth=teethA \? \(teethA\[i\]>0\.05\) : \(zMouths\.length \? stInAny\(xPix,yPix,zMouths,1\.15\) : null\);/.test(APP) &&
  /var inEye = eyeA \? \(eyeA\[i\]>0\.02\) : \(zEyes\.length \? stInAny\(xPix,yPix,zEyes,1\.35\) : false\);/.test(APP) &&
  /eyeDefA \? eyeDefA\[i\]>0\.02 : \(zEyes\.length&&stInAny\(xPix,yPix,zEyes,1\.6\)\)/.test(APP), null);
report("A3) hybrid: the four AI sliders resolve into t2 on the main thread, gate the skin pass (both sites), and schedule a settle when moved",
  /o\.ueDark=stClamp\(svGet\("mu_ueDark",0\)\|\|0,0,100\); o\.ueBags=stClamp\(svGet\("mu_ueBags",0\)\|\|0,0,100\);/.test(APP) &&
  /o\.smile=stClamp\(svGet\("mu_smileLines",0\)\|\|0,0,100\); o\.browFill=stClamp\(svGet\("mu_browMkV",0\)\|\|0,0,100\);/.test(APP) &&
  (APP.match(/\|\|t2\.ueDark\|\|t2\.ueBags\|\|t2\.smile\|\|t2\.browFill\);/g) || []).length === 2 &&
  /var ST_LIVE_SV=\{mu_ueDark:1,mu_ueBags:1,mu_smileLines:1,mu_browMkV:1\};/.test(APP) &&
  /if\(ST_LIVE_SV\[id\]&&typeof stT2Changed==="function"\) stT2Changed\(\);/.test(APP) &&
  /blushV:0,eyeDef:0,ueDark:0,ueBags:0,smile:0,browFill:0\}; \}/.test(APP), null);
report("A4) compare tools: Before and the split read stCompareSource (the pin when one exists); 2-up and the overlay follow every settled frame; a new photo drops hi-res + pin",
  /^function stCompareSource\(\)\{ return \(ST\.pin&&ST\.pin\.cv\) \? ST\.pin\.cv : stGeoSource\(\); \}/m.test(APP) &&
  /cc\.drawImage\(stCompareSource\(\),0,0,c\.width,c\.height\);/.test(APP) && /if\(ST\.split\.on\)\{\n    var src=stCompareSource\(\);/.test(APP) &&
  /if\(ST\._sbsSync&&ST\.sbs&&ST\.sbs\.on\) ST\._sbsSync\(\);\n  if\(ST\._hiSync\) ST\._hiSync\(\);/.test(APP) &&
  /ST\.pin=null; var _pb=\$\("stPin"\); if\(_pb\) _pb\.classList\.remove\("on"\);/.test(APP), null);
report("A5) true-detail zoom: rendered on the worker's EXPORT path from stExportSource, capped 4096 / 2560, keyed by the whole recipe, drawn 1:1 over the loupe; the loupe may pass native once it exists",
  /var ST_HI_CAP = window\.innerWidth<720 \? 2560 : 4096;/.test(APP) && /msg=stExportParams\(info\.W,info\.H\);/.test(APP) && /STW\.exp\[id\]=1;\n    STW\.cb\[id\]=function\(bmp\)\{\n      ST\.hi\.busy=false;/.test(APP) &&
  /function hiKey\(\)\{\n    try\{ return JSON\.stringify\(\[stEffT1\(\),stEffT2\(\),stPipeVals\(\),stCurveVals\(\),ST\.heals\|\|null,svGet\("st_brushMode",null\),state\.st\.geo,ST\.srcW,ST\.srcH/.test(APP) &&
  /var s0=Z\.s\|\|1, s1=stClamp\(s,1,maxS\(\)\);/.test(APP) && /#stHiCanvas\{position:absolute;left:0;top:0;pointer-events:none/.test(APP) &&
  /#stStage\.sbs #stCanvas,#stStage\.sbs #stCanvasB\{width:calc\(50% - 2px\);max-width:calc\(50% - 2px\);height:auto;max-height:none;margin:0\}/.test(APP) && /\.st-cols\.sbs\{grid-template-columns:minmax\(0,1fr\) minmax\(300px,34%\)\}/.test(APP), null);
report("A6) What's New 6.24.0 points at Retouch A; CI runs this test",
  /\{ v:"6\.24\.0", kind:"page", ref:"pgMeitu",/.test(APP) && /node test\/verify_retouch_precision\.js/.test(CI), null);

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

  /* A 3000x2000 skin-toned photo with the features the live passes need to have something to
     work on: darker hollows under the (synthetic) eyes, a dark nasolabial line, all placed in
     the SAME geometry the 68-point face below describes. Retained as the export source too. */
  const loaded = await page.evaluate(async () => {
    switchPage("pgMeitu");
    const PW = 3000, PH = 2000, c = document.createElement("canvas"); c.width = PW; c.height = PH;
    const x = c.getContext("2d");
    x.fillStyle = "rgb(224,172,140)"; x.fillRect(0, 0, PW, PH);
    /* fine texture so the true-detail frame has detail the buffer cannot carry */
    for (let i = 0; i < 4000; i++) { x.fillStyle = i % 2 ? "rgb(214,162,130)" : "rgb(234,182,150)"; x.fillRect(Math.random() * PW, Math.random() * PH, 2, 2); }
    /* under-eye hollows: F.E(±0.5, 0.40, …) with eyes at (0.40/0.60 W, 0.40 H), mouth (0.5 W, 0.62 H): iod 600, e2m 440 */
    x.fillStyle = "rgb(150,110,90)";
    [[1200, 976], [1800, 976]].forEach(([cx, cy]) => { x.beginPath(); x.ellipse(cx, cy, 150, 70, 0, 0, Math.PI * 2); x.fill(); });
    /* nasolabial line: nose wing (0.46 W, 0.53 H) → mouth corner (0.38 W, 0.62 H) */
    x.strokeStyle = "rgb(60,40,30)"; x.lineWidth = 8; x.beginPath(); x.moveTo(1380, 1060); x.lineTo(1140, 1240); x.stroke();
    x.beginPath(); x.moveTo(1620, 1060); x.lineTo(1860, 1240); x.stroke();
    const du = c.toDataURL("image/jpeg", 0.92);
    const b64 = du.slice(du.indexOf(",") + 1);
    state.stFull = { key: stFullKey(b64), du };           /* the retained original, as the picker would keep it */
    await new Promise(res => { ST.loadImage(du, { done: res }); });
    for (let w = 0; w < 150 && !((ST.faceLM && ST.faceLM.scanned) || (window.STFACE && STFACE.off)); w++) await new Promise(r => setTimeout(r, 100));
    for (let w = 0; w < 100 && !ST.fullBitmap; w++) await new Promise(r => setTimeout(r, 100));
    /* the synthetic 68-point face, in BUFFER px */
    const W = ST.buf.width, H = ST.buf.height, pts = [];
    const ell = (n, cx, cy, rx, ry, a0, a1) => { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } };
    const arc = (n, cx, cy, rx, ry, a0, a1) => { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / Math.max(1, n - 1); pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } };
    arc(17, 0.5 * W, 0.50 * H, 0.22 * W, 0.30 * H, Math.PI, 2 * Math.PI);          // 0-16 jaw
    arc(5, 0.40 * W, 0.34 * H, 0.05 * W, 0.005 * H, Math.PI, 2 * Math.PI);          // 17-21 brow L
    arc(5, 0.60 * W, 0.34 * H, 0.05 * W, 0.005 * H, Math.PI, 2 * Math.PI);          // 22-26 brow R
    for (let k = 0; k < 4; k++) pts.push([0.5 * W, (0.40 + 0.04 * k) * H]);        // 27-30 nose bridge
    arc(5, 0.5 * W, 0.53 * H, 0.04 * W, 0.01 * H, 0, Math.PI);                      // 31-35 nose base (31 = left wing at 0.46 W)
    ell(6, 0.40 * W, 0.40 * H, 0.03 * W, 0.015 * H, 0, 2 * Math.PI);                // 36-41 eye L
    ell(6, 0.60 * W, 0.40 * H, 0.03 * W, 0.015 * H, 0, 2 * Math.PI);                // 42-47 eye R
    /* the outer lip is a HEXAGON (not an ellipse) so a contour mask and a bounding ellipse differ measurably */
    ell(12, 0.5 * W, 0.62 * H, 0.12 * W, 0.045 * H, 0, 2 * Math.PI);                // 48-59 outer lip
    ell(8, 0.5 * W, 0.62 * H, 0.06 * W, 0.02 * H, 0, 2 * Math.PI);                  // 60-67 inner lip
    /* turn the 12-point outer lip into a hexagon: keep every other vertex at full radius, pull the others to 0.5 */
    for (let k = 48; k < 60; k++) if ((k - 48) % 2) { pts[k] = [0.5 * W + (pts[k][0] - 0.5 * W) * 0.5, 0.62 * H + (pts[k][1] - 0.62 * H) * 0.5]; }
    ST.faceLM = { w: W, h: H, scanned: true, faces: [{ score: 0.9, area: 0.1, pts }] };
    const z = stZonesFromLM(ST.faceLM, W, H);
    return { W, H, full: !!ST.fullBitmap, fullW: ST.fullBitmap && (ST.fullBitmap.width || ST.fullBitmap.naturalWidth),
             poly: z && z.r && z.r.poly ? { lips: z.r.poly.lips.length, lipInner: z.r.poly.lipInner.length, eyeL: z.r.poly.eyeL.length, browL: z.r.poly.browL.length, smileL: z.r.poly.smileL.length } : null,
             ue: z && z.r && z.r.underEyeL ? { cx: Math.round(z.r.underEyeL.cx), cy: Math.round(z.r.underEyeL.cy), rx: Math.round(z.r.underEyeL.rx), ry: Math.round(z.r.underEyeL.ry) } : null };
  });
  report("B) the photo loads with its retained original (3000 wide); the measured face carries lip / inner-lip / eye / brow-band / smile-band polygons and under-eye ellipses",
    loaded.full && loaded.fullW === 3000 && loaded.poly && loaded.poly.lips === 12 && loaded.poly.lipInner === 8 && loaded.poly.eyeL === 6 && loaded.poly.browL === 10 && loaded.poly.smileL === 4 && loaded.ue && loaded.ue.rx > 20, loaded);

  /* ---- C) contour masks ---- */
  const contour = await page.evaluate(async () => {
    const W = ST.buf.width, H = ST.buf.height;
    /* the primitive: a triangle's alpha is ~1 at its centroid and ~0 at its bounding-box corner */
    const tri = [[100, 100], [300, 110], [180, 300]];
    const A = stShapeAlpha(W, H, [{ poly: tri }], 3);
    const centroid = A[Math.round((100 + 110 + 300) / 3) * W + Math.round((100 + 300 + 180) / 3)];
    const corner = A[300 * W + 300];
    /* end to end: lip tint on the hexagon lip. Centre of the lip: tinted. A point at 0.93 of the
       bounding ellipse's radius at 30° (between two hexagon vertices — inside the ellipse, outside
       the polygon): must stay (nearly) untouched. */
    const c = document.getElementById("stCanvas"), cc = c.getContext("2d");
    const px = (x, y) => { const d = cc.getImageData(Math.round(x), Math.round(y), 1, 1).data; return { r: d[0], g: d[1], b: d[2] }; };
    state.st.t2 = stDefT2(); stRenderSettle(); await new Promise(r => setTimeout(r, 400));
    const cx = 0.5 * W, cy = 0.62 * H, rx = 0.12 * W, ry = 0.045 * H;
    const midOut = [cx + rx * 0.93 * Math.cos(Math.PI / 6), cy + ry * 0.93 * Math.sin(Math.PI / 6)];
    const before = { centre: px(cx, cy), out: px(midOut[0], midOut[1]) };
    state.st.t2.lipV = 100; stRenderSettle(); await new Promise(r => setTimeout(r, 500));
    const after = { centre: px(cx, cy), out: px(midOut[0], midOut[1]) };
    const dCentre = Math.abs(after.centre.r - before.centre.r) + Math.abs(after.centre.g - before.centre.g) + Math.abs(after.centre.b - before.centre.b);
    const dOut = Math.abs(after.out.r - before.out.r) + Math.abs(after.out.g - before.out.g) + Math.abs(after.out.b - before.out.b);
    state.st.t2 = stDefT2(); stRenderSettle(); await new Promise(r => setTimeout(r, 300));
    return { centroid, corner, dCentre, dOut };
  });
  report("C) a shape's alpha plane is ~1 inside and ~0 at its bounding corner; lip tint lands on the lip polygon's centre and (nearly) not between two vertices where only the old ellipse reached",
    contour.centroid > 0.95 && contour.corner < 0.02 && contour.dCentre > 25 && contour.dOut < contour.dCentre * 0.3, contour);

  /* ---- D) live hybrid passes ---- */
  const live = await page.evaluate(async () => {
    const W = ST.buf.width, H = ST.buf.height, k = W / 3000;
    const c = document.getElementById("stCanvas"), cc = c.getContext("2d");
    const lum = (x, y) => { const d = cc.getImageData(Math.round(x), Math.round(y), 1, 1).data; return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]; };
    const meanLum = (x, y, r) => { let s = 0, n = 0; for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) { s += lum(x + dx, y + dy); n++; } return s / n; };
    const ue = [1200 * k, 976 * k];                       // the painted hollow under the left eye (its centre)
    const ueEdge = [(1200 + 138) * k, 976 * k];           // 12 photo-px inside the hollow's edge: where a soften shows
    const brow = [0.40 * W, 0.34 * H];                    // on the brow band
    const smileMid = [(1380 + 1140) / 2 * k, (1060 + 1240) / 2 * k]; // middle of the painted nasolabial line
    ["mu_ueDark", "mu_ueBags", "mu_smileLines", "mu_browMkV"].forEach(id => svSet(id, 0));
    stRenderSettle(); await new Promise(r => setTimeout(r, 400));
    const before = { ue: meanLum(ue[0], ue[1], 6), ueEdge: meanLum(ueEdge[0], ueEdge[1], 1), brow: meanLum(brow[0], brow[1], 3), smile: meanLum(smileMid[0], smileMid[1], 1), t2: stEffT2().ueDark };
    const dark = document.getElementById("mu_ueDark");
    dark.value = "100"; dark.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    const afterDark = { ue: meanLum(ue[0], ue[1], 6), t2: stEffT2().ueDark, pend: state.st.pend.map(p => p.id).join(",") };
    svSet("mu_ueDark", 0); svSet("mu_ueBags", 100); stRenderSettle(); await new Promise(r => setTimeout(r, 500));
    const afterBags = { ueEdge: meanLum(ueEdge[0], ueEdge[1], 1) };
    svSet("mu_ueBags", 0); svSet("mu_smileLines", 100); stRenderSettle(); await new Promise(r => setTimeout(r, 500));
    const afterSmile = { smile: meanLum(smileMid[0], smileMid[1], 1) };
    svSet("mu_smileLines", 0); svSet("mu_browMkV", 100); stRenderSettle(); await new Promise(r => setTimeout(r, 500));
    const afterBrow = { brow: meanLum(brow[0], brow[1], 3) };
    svSet("mu_browMkV", 0); stRenderSettle(); await new Promise(r => setTimeout(r, 300));
    return { before, afterDark, afterBags, afterSmile, afterBrow };
  });
  report("D) Dark Circles lifts the painted hollow toward the cheek (live, and the slider still queues its AI line); Eye Bags softens it; Smile Lines lifts the painted fold; Brow Makeup amount darkens the brow band",
    live.before.t2 === 0 && live.afterDark.t2 === 100 && live.afterDark.ue > live.before.ue + 8 && /mu_underEye/.test(live.afterDark.pend) &&
    live.afterBags.ueEdge > live.before.ueEdge + 6 && live.afterSmile.smile > live.before.smile + 10 && live.afterBrow.brow < live.before.brow - 20, live);

  /* ---- E) pin ---- */
  const pinned = await page.evaluate(async () => {
    const c = document.getElementById("stCanvas"), cc = c.getContext("2d");
    const lumC = () => { const d = cc.getImageData(Math.round(c.width * 0.15), Math.round(c.height * 0.15), 1, 1).data; return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]; };
    if (ST.zoomReset) ST.zoomReset();
    state.st.t1 = stDefT1(); state.st.t1.exp = 70; stRenderSettle(); stApplyDragFilter(); await new Promise(r => setTimeout(r, 450));
    const bright = lumC();
    document.getElementById("stPin").click();
    const pinSet = !!ST.pin && document.getElementById("stPin").classList.contains("on");
    state.st.t1 = stDefT1(); stRenderSettle(); stApplyDragFilter(); await new Promise(r => setTimeout(r, 450));
    const plain = lumC();
    ST.holdDown(); const held = lumC(); ST.holdUp(); await new Promise(r => setTimeout(r, 400));
    document.getElementById("stPin").click();
    const unpinned = !ST.pin;
    ST.holdDown(); const heldSrc = lumC(); ST.holdUp(); await new Promise(r => setTimeout(r, 400));
    return { bright, plain, held, heldSrc, pinSet, unpinned };
  });
  report("E) pin: with a bright state pinned, Before shows the PIN (bright) instead of the original; unpinned, Before shows the original again",
    pinned.pinSet && pinned.bright > pinned.plain + 25 && Math.abs(pinned.held - pinned.bright) < 6 && pinned.unpinned && Math.abs(pinned.heldSrc - pinned.plain) < 6, pinned);

  /* ---- F) 2-up ---- */
  const sbs = await page.evaluate(async () => {
    const c = document.getElementById("stCanvas"), cB = document.getElementById("stCanvasB"), stg = document.getElementById("stStage");
    const chip = document.getElementById("stSbs");
    const shown = chip.style.display !== "none";
    chip.click(); await new Promise(r => setTimeout(r, 300));
    const on = { flag: ST.sbs.on, cls: stg.classList.contains("sbs"), bVisible: cB.style.display !== "none" && cB.getBoundingClientRect().width > 50, bw: cB.width, cw: c.width, side: cB.getBoundingClientRect().right <= c.getBoundingClientRect().left + 1 };
    ST.zoomTo(2); await new Promise(r => setTimeout(r, 100));
    const zoomed = { same: cB.style.transform === c.style.transform && /scale\(2/.test(c.style.transform) };
    ST.zoomReset();
    document.getElementById("stSplit").click(); await new Promise(r => setTimeout(r, 300));
    const split = { sbsOff: !ST.sbs.on, splitOn: ST.split.on, bHidden: cB.style.display === "none" };
    document.getElementById("stSplit").click(); await new Promise(r => setTimeout(r, 200));
    return { shown, on, zoomed, split };
  });
  report("F) 2-up: the compare pane appears beside the picture at the buffer's size, pans with the loupe, and yields to the split",
    sbs.shown && sbs.on.flag && sbs.on.cls && sbs.on.bVisible && sbs.on.bw === sbs.on.cw && sbs.on.side && sbs.zoomed.same && sbs.split.sbsOff && sbs.split.splitOn && sbs.split.bHidden, sbs);

  /* ---- G) true-detail zoom ---- */
  const hi = await page.evaluate(async () => {
    const c = document.getElementById("stCanvas"), hiC = document.getElementById("stHiCanvas"), ind = document.getElementById("stZoomInd");
    if (ST.zoomReset) ST.zoomReset();
    const p11 = document.getElementById("stZp11");
    const chipShown = p11.style.display !== "none";
    const idle = { hidden: hiC.style.display === "none", bmp: !!ST.hi.bmp };
    ST.zoomTo(2.5);
    let waited = 0; while (waited < 12000 && !(ST.hi.on && ST.hi.bmp)) { await new Promise(r => setTimeout(r, 100)); waited += 100; }
    const first = { on: ST.hi.on, w: ST.hi.w, h: ST.hi.h, shown: hiC.style.display !== "none", ind: ind.textContent, waited, oW: hiC.width, cW: Math.round(c.clientWidth * Math.min(2, devicePixelRatio || 1)), stageW: document.getElementById("stStage").clientWidth };
    /* an edit stales the frame at once and a fresh one lands within a few seconds */
    const key0 = ST.hi.key;
    state.st.t1 = stDefT1(); state.st.t1.exp = 40; stRenderSettle(); stApplyDragFilter();
    await new Promise(r => setTimeout(r, 250));
    const stale = { on: ST.hi.on, shown: hiC.style.display !== "none" };
    waited = 0; while (waited < 12000 && !(ST.hi.on && ST.hi.key !== key0)) { await new Promise(r => setTimeout(r, 100)); waited += 100; }
    const fresh = { on: ST.hi.on, keyChanged: ST.hi.key !== key0, waited };
    /* 1:1 goes past the buffer's native scale once the frame exists */
    const nativeS = c.width / c.clientWidth;
    p11.click(); await new Promise(r => setTimeout(r, 300));
    const one = { s: ST.ui.zoom.s, nativeS, expect: ST.hi.w / (c.clientWidth * Math.min(2, devicePixelRatio || 1)) };
    ST.zoomReset(); await new Promise(r => setTimeout(r, 100));
    const reset = { on: ST.hi.on, hidden: hiC.style.display === "none" };
    state.st.t1 = stDefT1(); stRenderSettle(); stApplyDragFilter();
    return { chipShown, idle, first, stale, fresh, one, reset };
  });
  report("G) zoomed in, the picture is re-rendered from the ORIGINAL (3000 wide) and drawn over the loupe with an HD mark; an edit stales it and a fresh frame lands; 1:1 goes past the buffer's native scale; Fit hides it",
    hi.chipShown && hi.idle.hidden && hi.first.on && hi.first.w === 3000 && hi.first.shown && /HD/.test(hi.first.ind) && Math.abs(hi.first.oW - hi.first.cW) <= 1 &&
    hi.stale.on === false && hi.stale.shown === false && hi.fresh.on && hi.fresh.keyChanged &&
    hi.one.s > hi.one.nativeS + 0.5 && Math.abs(hi.one.s - hi.one.expect) < 0.05 && hi.reset.on === false && hi.reset.hidden, hi);

  report("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — the zoom shows the file, the makeup follows the measured contours, four AI sliders are live too, and Before / A|B / 2-up compare against what the retoucher chooses");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
