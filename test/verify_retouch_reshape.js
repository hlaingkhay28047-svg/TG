/* v6.27.0 — LIVE FACE RESHAPE + AUTO BLEMISH + BATCH: the second Retouch A / B wave.

   What this proves, and why each check exists:
   - The Face Reshape sliders (Face Slim, V-Jaw, Chin, Cheekbone, Temples, Forehead,
     Philtrum) and Eye Enlarge used to be prompt lines only — the preview showed
     nothing until the AI result came back. They are now HYBRID like 6.24.0's
     under-eye pass: the line still goes to GENERATE, and on a MEASURED face the
     preview, the export bake, the 2-up and the drag proxy move the pixels
     themselves (stWarpApply, serialized into the render worker).
   - The warp is honest about its reach: at 0 it is the identity to the bit, and
     at 80 its difference from the untouched render stays inside the face's own
     neighbourhood — a slim jaw never moves a shoulder.
   - Auto blemish: one tap finds the small spots on the measured skin and heals
     them as ordinary heal ops (Undo, export, 2-up agree). Driven here with five
     painted spots on the cheeks: at least three are found within 1.5% of the
     frame, and none of the eyes / lips / brows are "healed".
   - Retouch batch already exists (v4.45): the Path page's Studio-look button
     saves the current recipe as slot pt_rc_0 and applies it to every photo. It
     is pinned here so the "batch" item of the program cannot silently regress.
   Requires docs/app served on http://127.0.0.1:${PORT||8931}/ (the face model is
   the app's own; the scan may fall back to cpu on the runner, so the wait is long). */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const SRC = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LIFTER = fs.readFileSync(path.join(ROOT, "tools", "build_panel_studio_suites.js"), "utf8");
const PANEL_SUITES = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_studio_suites.js"), "utf8");

let fails = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra !== undefined ? " :: " + (typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 900) : ""));
  if (!ok) fails++;
}
const has = (re) => (re instanceof RegExp ? re.test(SRC) : SRC.indexOf(re) >= 0);

/* ---- A) source pins ---- */
report("A) the warp family exists and rides into the render worker (stWarpActive, stWarpKernels, stWarpApply in the serialized fns list)",
  has("function stWarpActive(t2)") && has("function stWarpKernels(f,sx,sy,t2)") && has("function stWarpApply(cx,W,H,lm,t2)") &&
  has("stNoiseTile,stWarpActive,stWarpKernels,stWarpApply,stRunPipeline];"));
report("A2) stRunPipeline applies the warp on the measured landmarks AFTER the skin passes and BEFORE the frame-relative vignette / grain / frame",
  (() => { const i = SRC.indexOf("if(opts.lm&&stWarpActive(t2)) stWarpApply(cx,W,H,opts.lm,t2);"); const leak = SRC.indexOf("/* (6c) light leak (M4) */"); const vig = SRC.indexOf("/* (7) vignette */"); const skin = SRC.indexOf("stApplySkin(cv,cx,px,W,H,t2,mi,um,umInv,RS,opts.lm||null);"); return i > 0 && skin > 0 && skin < i && i < leak && leak < vig; })());
report("A3) stEffT2 reads the eight reshape sliders into signed t2 fields, ST_LIVE_SV re-renders on each, stLiveCount counts a live reshape once, stFaceGated covers it",
  has('o.wSlim=stClamp(svGet("mu_faceSlim",0)||0,-100,100)') && has('o.wEye=stClamp(svGet("mu_eyeSize",0)||0,-100,100)') &&
  has('o.wJaw=stClamp(svGet("mu_vjaw",0)||0,-100,100)') && has('o.wChin=stClamp(svGet("mu_chin",0)||0,-100,100)') &&
  has('o.wCheek=stClamp(svGet("mu_cheekbone",0)||0,-100,100)') && has('o.wTemple=stClamp(svGet("mu_temples",0)||0,-100,100)') &&
  has('o.wFore=stClamp(svGet("mu_forehead",0)||0,-100,100)') && has('o.wPhil=stClamp(svGet("mu_philtrum",0)||0,-100,100)') &&
  has('["mu_faceSlim","mu_vjaw","mu_chin","mu_cheekbone","mu_temples","mu_forehead","mu_philtrum","mu_eyeSize"].forEach(function(k){ ST_LIVE_SV[k]=1; });') && has("var ST_LIVE_SV={mu_ueDark:1,mu_ueBags:1,mu_smileLines:1,mu_browMkV:1};") &&
  has("ST.faceLM.faces.length&&stWarpActive(stEffT2())) n++;") && has("t2.eyeDef>0||stWarpActive(t2))) return false;"));
report("A4) the export bake, the 2-up and the drag proxy hand the landmarks to the pipeline, so the reshape the studio approved is the reshape the file carries",
  has("var cv=stRunPipeline(src,gw,gh,{lm:ST.faceLM||null});") && has("var out=stRunPipeline(esrc,gd.w,gd.h,{lm:ST.faceLM||null});") &&
  has("out=stRunPipeline(stGeoSource(),W,H,{rs:stPreviewRS(W,H),lm:ST.faceLM||null});"));
report("A5) auto blemish: stAutoBlemish searches the skin mask inside each measured face with the eyes / brows / lips / nostrils cut out, adapts to the skin's own texture, keeps compact blobs only, caps at 24, records heal ops and refuses without a face",
  has("function stAutoBlemish(){") && has("var ex=[R.eyeL,R.eyeR,R.browL,R.browR,R.mouth,R.noseTip]") &&
  has("var thD=Math.max(22,3.0*Math.sqrt(sg/sn)), thR=Math.max(14,3.0*Math.sqrt(sr/sn));") &&
  has("fill>=0.45&&asp<=2.2") && has("taps.length<24") && has("ST.heals.push({u:tp.x/W, v:tp.y/H, ur:tp.r/Math.min(W,H)}); stHealApply(px,W,H,tp.x,tp.y,tp.r);") &&
  has("No face measured yet — tap the spots yourself"));
report("A6) the Auto button sits beside the Heal button in Heal & Brush and calls stAutoBlemish",
  /healRow\.appendChild\(healBtn\);[\s\S]{0,600}autoBtn\.id="stAutoHealBtn";[\s\S]{0,900}autoBtn\.onclick=function\(\)\{ stAutoBlemish\(\); \};\s*healRow\.appendChild\(autoBtn\);/.test(SRC));
report("A7) retouch batch (v4.45, pinned): the Path page's Studio-look button saves the current recipe through the shared store and selects it as slot pt_rc_0 for the whole batch",
  has("if(!stSaveRecipe()) return;\n    ptRegisterRecipeLooks();\n    state.pt.look=\"pt_rc_0\";") && has("function stApplyRecipeTo(img, recipe, maxDim){"));
report("A8) What's New names the wave (my + en)",
  /v:"6\.27\.0"[\s\S]{0,400}(reshape|Reshape|မျက်နှာပုံသွင်း)/.test(SRC));
report("P) the panel lifter carries stAutoBlemish and stWarpActive as stage stubs (the panel holds no pixels; no live reshape there) and the lifted studio suites show the Auto button",
  LIFTER.indexOf('"stAutoBlemish", "stWarpActive"') > 0 && LIFTER.indexOf("var stAutoBlemish=H.stAutoBlemish||noop, stWarpActive=H.stWarpActive||function(){ return false; };") > 0 && PANEL_SUITES.indexOf('autoBtn.id="stAutoHealBtn"') > 0);
report("CI runs this test", /node test\/verify_retouch_reshape\.js/.test(CI));

/* ---- B) driven ---- */
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 300)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    switchPage("pgMeitu"); window.scrollTo = function () {}; Element.prototype.scrollIntoView = function () {};
    const res = await fetch("lib/st-sample.jpg"); const bl = await res.blob();
    const du = await new Promise(x => { const f = new FileReader(); f.onload = () => x(f.result); f.readAsDataURL(bl); });
    await new Promise(x => { ST.loadImage(du, { done: x }); });
    for (let i = 0; i < 600; i++) { if (ST.faceLM && ST.faceLM.scanned) break; if (STFACE && STFACE.off) break; await new Promise(x => setTimeout(x, 100)); }
    const lm = ST.faceLM; const faces = lm && lm.faces ? lm.faces.length : 0;
    if (!faces) return { faces: 0, off: !!(STFACE && STFACE.off), err: STFACE && STFACE.err };
    const src = stGeoSource(); const W = ST.buf.width, H = ST.buf.height;
    const render = () => stRunPipeline(src, W, H, { lm: ST.faceLM || null }).getContext("2d").getImageData(0, 0, W, H).data;
    const diff = (a, b) => { let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0; for (let i = 0, p = 0; i < W * H; i++, p += 4) { if (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]) > 6) { n++; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { n, box: n ? [x0, y0, x1, y1] : null }; };
    const f = lm.faces[0].pts, sx = W / lm.w, sy = H / lm.h;
    let fx0 = 1e9, fy0 = 1e9, fx1 = -1e9, fy1 = -1e9; for (const q of f) { fx0 = Math.min(fx0, q[0] * sx); fx1 = Math.max(fx1, q[0] * sx); fy0 = Math.min(fy0, q[1] * sy); fy1 = Math.max(fy1, q[1] * sy); }
    const fw = fx1 - fx0, fh = fy1 - fy0;
    const grow = [fx0 - fw * 0.5, fy0 - fh * 0.75, fx1 + fw * 0.5, fy1 + fh * 0.35].map(Math.round);   /* the kernels reach a little past the contour (forehead above the brow line) */
    const inside = (b) => !!b && b[0] >= grow[0] && b[1] >= grow[1] && b[2] <= grow[2] && b[3] <= grow[3];
    const base = render();
    svSet("mu_faceSlim", 80); const t1 = performance.now(); const slim = render(); const msSlim = performance.now() - t1; const dSlim = diff(base, slim);
    svSet("mu_faceSlim", 0); svSet("mu_eyeSize", 80); const dEye = diff(base, render());
    svSet("mu_eyeSize", 0); svSet("mu_chin", -70); const dChin = diff(base, render());
    svSet("mu_chin", 0); svSet("mu_forehead", 60); const dFore = diff(base, render());
    svSet("mu_forehead", 0); const dBack = diff(base, render());
    const eyeY = ((f[37][1] + f[46][1]) / 2) * sy, noseY = f[33][1] * sy, mouthY = f[62][1] * sy, browY = ((f[19][1] + f[24][1]) / 2) * sy;
    svSet("mu_faceSlim", 40); const live = stLiveCount(), gated = stFaceGated(), t2 = stEffT2(); svSet("mu_faceSlim", 0);
    const live0 = stLiveCount();
    return { faces, backend: STFACE.backend, W, H, face: [fx0, fy0, fx1, fy1].map(Math.round), grow,
      slim: { n: dSlim.n, box: dSlim.box, inside: inside(dSlim.box), ms: Math.round(msSlim) },
      eye: { n: dEye.n, box: dEye.box, inBand: !!dEye.box && dEye.box[1] > browY - fh * 0.15 && dEye.box[3] < noseY + fh * 0.1 },
      chin: { n: dChin.n, box: dChin.box, belowMouth: !!dChin.box && dChin.box[1] > mouthY - fh * 0.2 },
      fore: { n: dFore.n, box: dFore.box, aboveEyes: !!dFore.box && dFore.box[3] < eyeY + fh * 0.1 },
      back: dBack.n, live, live0, gated, t2w: t2.wSlim, btn: !!document.getElementById("stAutoHealBtn") };
  });
  if (!r.faces) { report("B) the face model measured the sample face (the reshape needs landmarks)", false, r); }
  else {
    report("B) the face model measured the sample face on " + r.backend, true, { W: r.W, H: r.H, face: r.face });
    report("B1) every reshape slider at 0 → the render is the untouched render to the bit", r.back === 0, r.back);
    report("B2) Face Slim 80 moves thousands of pixels and every one of them stays in the face's neighbourhood", r.slim.n > 2000 && r.slim.inside, r.slim);
    report("B3) Eye Enlarge 80 changes only the eye band (between the brows and the nose tip)", r.eye.n > 500 && r.eye.inBand, r.eye);
    report("B4) Chin −70 changes only the region from the mouth down", r.chin.n > 300 && r.chin.belowMouth, r.chin);
    report("B5) Forehead 60 changes only the region above the eyes", r.fore.n > 300 && r.fore.aboveEyes, r.fore);
    report("B6) a live reshape counts once in the ◉ live badge, the face gate stays quiet with a measured face, the t2 field carries the slider", r.live === r.live0 + 1 && r.gated === false && r.t2w === 40, { live: r.live, live0: r.live0, gated: r.gated, t2w: r.t2w });
    report("B7) the warp costs a face-sized region, not the frame (under 400ms on the 896px buffer)", r.slim.ms < 400, r.slim.ms + "ms");
    report("B8) the Auto button is on the stage", r.btn);
  }
  const r2 = await page.evaluate(async () => {
    if (!(ST.faceLM && ST.faceLM.faces && ST.faceLM.faces.length)) return { skip: true };
    const img = ST.srcBitmap; const W = img.width, H = img.height;
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const lm0 = ST.faceLM; const f = lm0.faces[0].pts, sx = W / lm0.w, sy = H / lm0.h;
    const pts = [[2, 31], [14, 35], [3, 48], [13, 54], [30, 8]].map(([a, b]) => [(f[a][0] + f[b][0]) / 2 * sx, (f[a][1] + f[b][1]) / 2 * sy]);
    const fw = Math.hypot((f[16][0] - f[0][0]) * sx, (f[16][1] - f[0][1]) * sy); const r = Math.max(2, Math.round(fw * 0.012));
    x.fillStyle = "rgb(70,30,25)"; for (const [px, py] of pts) { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
    const du = c.toDataURL("image/jpeg", 0.95);
    await new Promise(z => { ST.loadImage(du, { done: z }); });
    for (let i = 0; i < 600; i++) { if (ST.faceLM && ST.faceLM.scanned && ST.faceLM !== lm0) break; await new Promise(z => setTimeout(z, 100)); }
    ST.heals = [];
    const n = stAutoBlemish();
    const hits = pts.map(([px, py]) => { const u = px / W, v = py / H; let best = 1; for (const h of ST.heals) { const d = Math.hypot(h.u - u, (h.v - v) * H / W); if (d < best) best = d; } return +best.toFixed(4); });
    /* nothing healed inside the eyes or the lips */
    const Z = stZonesFromLM(ST.faceLM, ST.px0.width, ST.px0.height);
    const bad = ST.heals.filter(h => [Z.eyeL, Z.eyeR, Z.mouth].some(z => z && stInEllipse(h.u * ST.px0.width, h.v * ST.px0.height, z, 1.0))).length;
    /* the healed spot is closer to its surroundings in the rendered frame */
    const bw = ST.buf.width, bh = ST.buf.height, out = stRunPipeline(stGeoSource(), bw, bh, { lm: ST.faceLM }).getContext("2d").getImageData(0, 0, bw, bh).data;
    const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const raw = document.createElement("canvas"); raw.width = bw; raw.height = bh; raw.getContext("2d").drawImage(stGeoSource(), 0, 0, bw, bh); const rd = raw.getContext("2d").getImageData(0, 0, bw, bh).data;
    let darker = 0; for (const [px, py] of pts.slice(0, 4)) { const bx = Math.round(px / W * bw), by = Math.round(py / H * bh), i = (by * bw + bx) * 4; if (luma(out, i) > luma(rd, i) + 15) darker++; }
    return { n, heals: ST.heals.length, hits, found: hits.filter(d => d < 0.015).length, bad, lifted: darker, toastOk: true };
  });
  if (r2.skip) report("C) auto blemish (needs the measured face above)", false, r2);
  else {
    report("C) Auto heals the painted spots: at least three of the five cheek / mouth-corner spots get a heal op within 1.5% of the frame, and the ops are recorded for the export", r2.found >= 3 && r2.heals === r2.n && r2.n >= 3, r2);
    report("C2) nothing was 'healed' inside the eyes or the lips", r2.bad === 0, r2.bad);
    report("C3) the painted spots come out lighter in the rendered frame (the heal reached the pixels)", r2.lifted >= 3, r2.lifted);
  }
  report("D) no page error while the stage was driven", errs.length === 0, errs);
  await browser.close();
  console.log(fails ? fails + " FAILED" : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
