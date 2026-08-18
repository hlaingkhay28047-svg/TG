/* v4.55.0 regression sweep — the delivered file looks like the preview.

   v4.51 made "Full size" export the real original pixels instead of the
   1536px preview buffer. That exposed a latent bug: every blur/glow/denoise
   radius in stRunPipeline, and every probe offset in stFaceZones, is an
   ABSOLUTE PIXEL COUNT tuned against that 1536px preview. The same 8px
   clarity radius covers half as much of a face at 3072px and a quarter at
   6144px, so the photo the studio downloaded was materially weaker than the
   preview they had approved — and the eye/mouth probes, stepping a fixed 6-8
   pixels, degenerated into comparing a pixel with its neighbour.

   Separately, ptBake had five exits and four of them handed the UNTOUCHED
   ORIGINAL back through the same callback as a success, so a ZIP downloaded
   as "graded copies" could quietly contain un-graded originals.

   Pinned contracts:
   A) Pipeline radii scale with the render size — an export at 2x the preview
      asks for 2x the blur radius. This is the mechanism; C would pass
      vacuously without it.
   B) At preview size the scale factor is exactly 1, so preview rendering is
      unchanged from before this release.
   C) End to end: the same look rendered at export size and downsampled back
      matches the preview render closely.
   D) stFaceZones probe offsets scale too.
   E) ptBake reports whether the grade actually landed.
   F) ptBakeAll counts ungraded photos and names their files so the studio can
      see which ones they are.

   Usage: PORT=8931 node test/sweep_v455_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1100);

  const r = await page.evaluate(async () => {
    const out = {};
    function plate(w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = "#caa"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        x.fillStyle = `rgb(${(i * 37) % 255},${(i * 91) % 255},${(i * 53) % 255})`;
        x.fillRect((i * 61) % w, (i * 97) % h, Math.max(2, w / 200), Math.max(2, h / 200));
      }
      return c;
    }
    /* v4.55 note: the reference is the PREVIEW BUFFER (stBufMax() = 1280 on
       desktop), NOT the 1536 intake cap — nothing ever renders at 1536. An
       adversarial review of this very release caught the anchor being wrong. */
    const PREV = 1280, EXP = 2560, HP = Math.round(PREV * 2 / 3), HE = Math.round(EXP * 2 / 3);
    const opts = {
      t1: Object.assign({}, stEffT1(), { cla: 60, glow: 50, bgb: 40, nr: 0 }),
      t2: stEffT2(), pv: stPipeVals(), heals: [], curve: null
    };

    /* A/B) record the radii the pipeline actually asks for at each size */
    const realBlur = window.stBlurData;
    let radii = [];
    window.stBlurData = function (cv, W, H, rad) { radii.push(rad); return realBlur(cv, W, H, rad); };
    radii = [];
    const cvPrev = stRunPipeline(plate(PREV, HP), PREV, HP, opts);
    const prevRadii = radii.slice();
    radii = [];
    const cvExp = stRunPipeline(plate(EXP, HE), EXP, HE, opts);
    const expRadii = radii.slice();

    out.A_prevRadii = prevRadii;
    out.A_expRadii = expRadii;
    out.A_sameCount = prevRadii.length === expRadii.length && prevRadii.length > 0;
    out.A_scaled = out.A_sameCount &&
      prevRadii.every((v, i) => Math.abs(expRadii[i] / v - 2) < 0.05);
    /* B) the preview asks for the historical absolute values — 8px clarity,
       1.5px sharpen — proving RS is exactly 1 there and nothing moved */
    out.B_preview1x = prevRadii.some(v => Math.abs(v - 8) < 1e-6);
    /* B2) THE SCALE FACTOR IS FLOORED AT 1. stRunPipeline also renders the
       76x96 preset swatches and any photo smaller than the 1536 cap. An
       unfloored ratio would shrink a swatch's clarity radius to 0.5px and
       erase the look the swatch exists to demonstrate. Small renders must ask
       for exactly the same radii they always did. */
    radii = [];
    stRunPipeline(plate(76, 96), 76, 96, opts);
    const tinyRadii = radii.slice();
    radii = [];
    stRunPipeline(plate(900, 600), 900, 600, opts);
    const smallRadii = radii.slice();
    out.B2_tiny = tinyRadii.length === prevRadii.length &&
      tinyRadii.every((v, i) => Math.abs(v - prevRadii[i]) < 1e-6);
    out.B2_small = smallRadii.length === prevRadii.length &&
      smallRadii.every((v, i) => Math.abs(v - prevRadii[i]) < 1e-6);
    out.B2_tinyRadii = tinyRadii;

    window.stBlurData = realBlur;

    /* C) export downsampled back matches the preview render */
    function down(cv, w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(cv, 0, 0, w, h);
      return c.getContext("2d").getImageData(0, 0, w, h).data;
    }
    const a = down(cvPrev, PREV, HP), b = down(cvExp, PREV, HP);
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) { sum += Math.abs(a[i] - b[i]); n++; }
    out.C_meanDiff = +(sum / n).toFixed(3);

    /* D) face-zone probes scale */
    const fz = String(stFaceZones);
    out.D_scaled = fz.indexOf("var FS =") >= 0 && fz.indexOf("x-P6") >= 0 &&
      fz.indexOf("x-P8") >= 0 && fz.indexOf("y-P5") >= 0 &&
      fz.indexOf("[[x-8,y]") < 0;

    /* E/F) a failed bake is reported, counted and named */
    out.E_reports = (String(ptBake).match(/cb\(photo\.srcDataUrl,false\)/g) || []).length >= 3;
    /* the CSS-filter path reports the filter actually STUCK, rather than
       hardcoding true — a browser that ignores canvas filters silently
       produced an untouched batch that reported success */
    out.E_success = String(ptBake).indexOf('filterTook') >= 0 &&
      String(ptBake).indexOf('x.filter===wantF') >= 0 &&
      String(ptBake).indexOf('cb(c.toDataURL("image/jpeg",0.92),filterTook)') >= 0;
    const ba = String(ptBakeAll);
    out.F_counts = ba.indexOf("ungraded++") >= 0 && ba.indexOf("pt_bake_ungraded") >= 0;
    out.F_names = ba.indexOf("ORIGINAL-not-graded") >= 0;
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    out.F_i18n = LANGS.every(l => typeof (TR.pt_bake_ungraded || {})[l] === "string" &&
      TR.pt_bake_ungraded[l].indexOf("{N}") >= 0);
    /* G) THE SKIN PATH SCALES TOO. An adversarial review of this release
       caught clarity/sharpen being scaled while the smoothing they are meant
       to balance was not — which would have delivered HARDER pores than
       either the preview or the previous release. Render with skin work on
       and confirm the tier-2 radii move with the render size. */
    const skinOpts = {
      t1: Object.assign({}, stEffT1(), { cla: 0, glow: 0, bgb: 0 }),
      t2: Object.assign({}, stEffT2(), { smooth: 70, denoise: 40, freqLo: 30 }),
      pv: stPipeVals(), heals: [], curve: null
    };
    const realBlur2 = window.stBlurData;
    let sr = [];
    window.stBlurData = function (cv, W, H, rad) { sr.push(rad); return realBlur2(cv, W, H, rad); };
    sr = [];
    stRunPipeline(plate(PREV, HP), PREV, HP, skinOpts);
    const skinPrev = sr.slice();
    sr = [];
    stRunPipeline(plate(EXP, HE), EXP, HE, skinOpts);
    const skinExp = sr.slice();
    window.stBlurData = realBlur2;
    out.G_skinPrev = skinPrev;
    out.G_skinExp = skinExp;
    out.G_skinRan = skinPrev.length >= 3;
    out.G_skinScaled = out.G_skinRan && skinPrev.length === skinExp.length &&
      skinPrev.every((v, i) => Math.abs(skinExp[i] / v - 2) < 0.05);
    /* v5.10 — the pin is on rs being THREADED into stApplySkin (which is what
       makes the skin radii scale), not on rs being the last parameter. The
       landmark set now follows it, so the closing paren moved. Both are pinned
       here rather than loosening the check to just "rs". */
    out.G_signature = String(stApplySkin).indexOf("um,umInv,rs") >= 0 &&
      String(stApplySkin).indexOf("um,umInv,rs,lm)") >= 0;

    /* H) the other absolute-pixel stragglers the same review found */
    out.H_maskFeather = String(stSkinMask).indexOf("mrs") >= 0 &&
      String(stSkinMask).indexOf("2*mrs") >= 0;
    out.H_grain = String(stRunPipeline).indexOf("gpat.setTransform") >= 0;
    out.H_faceGates = String(stFaceZones).indexOf("var GATE=FS*FS") >= 0 &&
      String(stFaceZones).indexOf("6*GATE") >= 0 &&
      String(stFaceZones).indexOf("8*GATE") >= 0;
    out.H_sheet = String(ptContactSheet).indexOf("function take(du, ok)") >= 0 &&
      String(ptContactSheet).indexOf("NOT GRADED") >= 0 &&
      String(ptContactSheet).indexOf("sheetUngradedN") >= 0;
    return out;
  });

  report("A) pipeline radii scale with the render size (2x export asks 2x radius)",
    r.A_scaled, { prev: r.A_prevRadii, exp: r.A_expRadii });
  report("B) at preview size the scale factor is exactly 1 — preview unchanged",
    r.B_preview1x, r.A_prevRadii);
  report("B2) the factor is floored at 1 — 76x96 swatches and sub-1536 photos keep their radii",
    r.B2_tiny && r.B2_small, { tiny: r.B2_tinyRadii, prev: r.A_prevRadii });
  report("C) the export, downsampled back, matches the preview render",
    r.C_meanDiff < 6, { meanDiff: r.C_meanDiff });
  report("D) stFaceZones probe offsets scale too", r.D_scaled, r);
  report("E) ptBake reports whether the grade actually landed",
    r.E_reports && r.E_success, r);
  report("F) ptBakeAll counts ungraded photos, names their files, in every language",
    r.F_counts && r.F_names && r.F_i18n, r);

  report("G) the tier-2 skin radii scale with the render size, in step with clarity",
    r.G_skinScaled && r.G_signature, { prev: r.G_skinPrev, exp: r.G_skinExp, sig: r.G_signature });
  report("H) mask feather, grain tile, face-zone gates and the contact sheet all follow",
    r.H_maskFeather && r.H_grain && r.H_faceGates && r.H_sheet, r);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
