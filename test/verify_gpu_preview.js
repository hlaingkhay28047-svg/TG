/* v6.50.0 — THE GPU PREVIEW IS THE SAME PICTURE AS THE CPU, OR IT IS NOTHING.
 *
 * WHY THIS FILE EXISTS. A fast path that renders a slightly different photo is
 * the worst defect this studio can ship: the teacher approves a preview and the
 * delivered file does not match it. That is exactly what v4.55 and v4.71 were
 * both about, and both were found by measurement, not by reading code.
 *
 * So this test does not ask whether a GPU flag is set. It renders the SAME
 * source, at the SAME size, through stRunPipeline (the CPU, the one that
 * exports) and through stGpuRender (the shader), and compares the two images
 * pixel by pixel, on recipes chosen to exercise every stage the shader claims:
 * the tonal LUT, the colour pass, HSL bands, split-grading, B&W, the vignette
 * (7) and the grain (8) since v6.51.0, the unsharp mask (5) since v6.52.0, and
 * the mask-only half of the Tier-2 skin stage (4) since v6.54.0.
 *
 * HOW CLOSE THE TWO ACTUALLY ARE, MEASURED. The colour pass comes back BIT FOR
 * BIT identical. The rest do not, and the honest reason is arithmetic width,
 * not a fault in the port: JavaScript computes in float64 and a fragment
 * shader in float32, so a value sitting a hair either side of a rounding
 * boundary lands one count apart. Measured on a 256x256 source covering every
 * tone and hue, out of 196,608 channels:
 *
 *     colour pass          0 channels differ
 *     tonal LUT            3 differ, by 1
 *     HSL bands           18 differ, by 1
 *     black & white      285 differ, by 1
 *     split-grade         71 differ, by at most 2
 *     everything at once  28 differ, by at most 2
 *     grain (v6.51.0)      0 channels differ
 *     sharpen (v6.52.0)    0 channels differ
 *     clarity (v6.52.0)    0 channels differ
 *     both at maximum      0 channels differ
 *     rosy/deshine/gloss   0 channels differ   (stage (4), v6.54.0)
 *     white, deyellow      1 count on under 1% of channels
 *
 * Grain is exact for a reason worth stating: v4.78 made the noise tile a SEEDED
 * mulberry32 bitmap, so the shader can upload the very bytes the CPU is
 * compositing instead of generating its own field. Only the overlay blend had
 * to be ported, and it comes back bit for bit.
 *
 * STAGE (4) IS THE NOISE TILE'S BARGAIN AGAIN. The Tier-2 skin controls are
 * per-pixel functions of the pixel and the skin mask, and the mask depends on
 * the PHOTOGRAPH, never on a slider — which is why ST.maskCache already exists.
 * So the shader is handed the CPU's own mask once per source and size, and
 * reads it free for the rest of the drag.
 *
 * ONLY THE MASK-ONLY HALF IS HERE, and the split is worth stating because it
 * was measured on the 16 shipped presets before any of it was written:
 * this half takes coverage 1/16 -> 3/16, adding "even" reaches 7/16, and adding
 * "smooth" 15/16. "even" needs the mean chroma of the masked region AFTER the
 * tonal stages — a frame-wide reduction of pass 1, so it needs a readback — and
 * "smooth" needs its guided filter re-solved every time the slider moves. The
 * gate refuses both, and check C5 proves it still does.
 *
 * v6.59.0 — THE LAST TWO TIER-2 CONTROLS, AND WHAT EACH OF THEM COSTS.
 *
 * TEETH needs a MEASURED MOUTH. Neither the skin mask nor the pixel alone can
 * say where teeth are, so the alpha stApplySkin reads comes off the same
 * readback the mask does and rides that texture's GREEN byte — no second
 * texture, no second pass. It cannot be tested on the shared source below:
 * with no face, stApplySkin whitens nothing and the two paths would agree
 * about nothing happening. C11 builds a frame with a bright neutral band and
 * a fabricated 68-point face over it, hands the SAME landmarks to both paths,
 * and first proves the CPU's own whitening moves that frame at all.
 *
 * FREQUENCY SEPARATION needs two BLURS of the frame, and a fragment cannot
 * blur. They are Skia's own blurs of the array the readback already holds,
 * uploaded on units 8 and 9 — and WebGL 1 guarantees only eight, so the two
 * samplers and the arithmetic that reads them are spliced into the shader at
 * boot and only on a device that reports the units. C12b asks what a device
 * with eight does: refuse the two sliders, keep everything else, still boot.
 *
 * AND THE ROUNDING FINALLY SHOWED. quant8 rounded an exact .5 up; the CPU
 * writes into a Uint8ClampedArray, whose ToUint8Clamp sends a .5 to the EVEN
 * neighbour. Five waves never saw it — a graded pixel rarely lands on a half —
 * and then teeth did: the lift at full alpha is 70*0.15 = 10.5 exactly. Fixing
 * the tie rule turned four more recipes below bit-identical and moved one
 * (split-grade zones) by a single channel the other way.
 *
 * RADIANCE IS NOT ONLY A SKIN CONTROL, and that cost 12 measured counts before
 * it was caught: stage (5)'s clarity amount is (cla + radiance*0.3 + …), so a
 * recipe carrying radiance and no clarity slider STILL runs an unsharp pass.
 * While the gate refused every non-zero t2 this could not happen; accepting
 * radiance opened it. stGpuRender now decides stage (5) on the AMOUNT the CPU
 * computes rather than on the slider, and the radiance recipe below is what
 * keeps that true.
 *
 * STAGE (5) IS EXACT FOR THE SAME REASON, AND THAT IS THE WHOLE DESIGN. An
 * unsharp mask is v += shpA*(v - blur1.5) + claA*(v - blur8), and those blurs
 * are ctx.filter="blur(Npx)" — Skia's blur, whose kernel is an implementation
 * detail. A GLSL re-derivation would be a guess, and a guess here is visible:
 * it shows up as sharpening halos the delivered file does not have. So the
 * shader is handed the CPU's OWN blurred bytes as textures and does only the
 * arithmetic. The one thing that had to be got right is that the two terms are
 * SEQUENTIAL — clarity acts on the value sharpening already moved. Treating
 * them as independent terms measured 14 counts out with both at maximum, which
 * is what the "both at maximum" recipe below is here to keep catching.
 *
 * The 2 belongs to the grade block alone and has a specific cause worth
 * writing down: stRunPipeline indexes its per-zone weight table with `lum3|0`,
 * a TRUNCATION of a float64 luma. Source 221,63,210 gives 126.99999999999998
 * in float64 and exactly 127.0 in float32, so the two read neighbouring rows
 * of the table, and one index step through two zone tints is two counts out.
 * No shader can avoid that; it is a property of the CPU's own truncation.
 *
 * THE VIGNETTE IS A THIRD CASE, AND ITS BAR IS WIDER ON PURPOSE. Stage (7) is
 * not a per-pixel loop at all: the CPU paints a two-stop radial gradient with
 * the canvas, and Skia DITHERS gradients to hide banding. The dither is a
 * sub-count perturbation that varies with position, so a shader drawing the
 * same clean ramp lands one count away wherever the dither pushed a pixel over
 * a rounding edge. Measured, on a flat grey plate so nothing but the vignette
 * can move a pixel:
 *
 *   - the ramp itself is EXACT: reading out along the radius the two paths give
 *     200,200,…,195,190,184 identically, and the CPU never brightens (0 rises
 *     in 127 steps), so the centre, the two radii and the falloff all match;
 *   - the pixels that do differ cluster in a 4x4 lattice — 2.3% of pixels in
 *     some cells against 31.6%, 27.6%, 23.5% in others. A wrong radius or
 *     falloff cannot do that; it would not care where a pixel sits in a 4x4
 *     grid. An ordered dither is the only thing that does.
 *
 * So the vignette is allowed one count on many more pixels, and check F2 below
 * is what stops that from becoming an excuse: it moves the vignette by a SINGLE
 * step (60 -> 61) and requires the wider bar to fail anyway.
 *
 * WHY THESE NUMBERS ARE A BAR AND NOT AN EXCUSE. A tolerance is only worth
 * something if a real mistake fails it, so this file proves that rather than
 * asserting it: check F renders the same recipe through a DELIBERATELY WRONG
 * shader input — one control off by a single step — and requires the same
 * comparison to fail. A ported formula with a misplaced constant moves whole
 * regions of the picture and cannot hide under 0.2% of channels at 1 count.
 *
 * IT ALSO PROVES THE GATE REFUSES. stGpuCan must return false for every recipe
 * containing a stage the shader does not implement, because those frames have
 * to keep going to the CPU. A gate that said yes too often would put a picture
 * on screen with the skin work silently missing.
 *
 * Usage: PORT=8931 node test/verify_gpu_preview.js */
"use strict";
const { chromium } = require("playwright");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });

  /* the studio's functions live in the page; everything below runs there */
  const gl = await page.evaluate(() => {
    try {
      const ok = !!(typeof stGpuBoot === "function" && stGpuBoot());
      /* v6.59.0 — say WHY when it is not ok. A boot that fails with no reason
         recorded cost a CI cycle to diagnose. */
      return ok ? true : { booted: false, bootErr: (window.ST_GPU && ST_GPU.bootErr) || null,
                           tried: !!(window.ST_GPU && ST_GPU.tried) };
    } catch (e) { return "throw:" + e; }
  });
  report("A) the page can boot a WebGL context for the fast path", gl === true, { gl });
  if (gl !== true) {
    console.log("\nFAIL — no GL context, so the comparison below cannot run");
    await browser.close();
    process.exit(1);
  }

  /* every recipe the shader claims it can render, one stage at a time and then
     all of them together, so a formula that is wrong only in combination is
     still caught */
  const RECIPES = {
    "tonal LUT only (exp/bri/con/hi/sh/fad/wht/blk/dhz)":
      { t1: { exp: 30, bri: 18, con: 22, hi: -35, sh: 40, fad: 12, wht: 20, blk: -15, dhz: 25 } },
    "colour pass only (wrm/tnt/sat/vib)":
      { t1: { wrm: 45, tnt: -30, sat: 35, vib: 40 } },
    "HSL bands":
      { hsl: { r: { h: 20, s: 30, l: 10 }, g: { h: -15, s: -25, l: -12 }, b: { h: 8, s: 40, l: 5 } } },
    "split-grade zones + grade saturation":
      { grade: { evSh: "#2a4a80", evMid: "#806040", evHi: "#ffd2a0", evAmt: 70, evBal: 20, evSat: 35 } },
    "black & white with channel mixer":
      { bw: { on: true, r: 40, g: -20, b: 30 } },
    /* stage (8): the noise tile is the seeded mulberry32 bitmap v4.78 made
       deterministic, so the shader samples the CPU's own bytes — this one is
       expected to come back bit-identical, and it does */
    "grain only":
      { t1: { grn: 45 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* stage (7): see the dither note at the top of this file */
    "vignette only":
      { t1: { vig: 60 }, bar: { maxd: 1, pct: 0.15, mean: 0.15 } },
    "vignette + grain over a grade":
      { t1: { exp: 15, con: 12, vig: 40, grn: 30 }, bar: { maxd: 2, pct: 0.25, mean: 0.30 } },
    /* stage (4): per-pixel, mask only. rosy, deshine and gloss are pure
       arithmetic on the pixel and come back bit-identical; white and deyellow
       carry the tonal pass's usual single count. */
    "skin: rosy only":
      { t2: { rosy: 40 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: deshine only":
      { t2: { deshine: 55 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: gloss up":
      { t2: { gloss: 45 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: gloss down":
      { t2: { gloss: -45 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: white only":
      { t2: { white: 60 }, bar: { maxd: 1, pct: 0.001, mean: 0.005 } },
    "skin: deyellow only":
      { t2: { deyellow: 50 }, bar: { maxd: 1, pct: 0.004, mean: 0.01 } },
    /* the recipe that proves radiance drives clarity as well as white */
    "skin: radiance, which drives clarity too":
      { t2: { radiance: 70 }, bar: { maxd: 2, pct: 0.001, mean: 0.005 } },
    "skin: every mask-only control at once":
      { t2: { white: 40, rosy: 25, deshine: 35, gloss: 20, deyellow: 30, radiance: 30 },
        bar: { maxd: 2, pct: 0.001, mean: 0.005 } },
    /* v6.55.0 — stage (4) with a frame-wide number. "even" pulls every masked
       pixel's Cb/Cr towards the mean of the masked region, which the shader is
       handed rather than estimating, so these come back exact. */
    "skin: even alone":
      { t2: { even: 60 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: even at maximum":
      { t2: { even: 100 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* THE RECIPE THAT WOULD HAVE CAUGHT 6.54.0. The CPU builds the skin mask
       from the GRADED frame, not the source; 6.54.0 built it from the source,
       and under a grade the two are different regions — measured 3.2% of bytes
       apart and up to 9 counts out. Every recipe above has a flat tonal half,
       which is exactly why none of them saw it. */
    "skin: white under a grade — the mask must be the graded frame's":
      { t1: { exp: 18, con: 22, sat: 14, wrm: 12 }, t2: { white: 60 },
        bar: { maxd: 1, pct: 0.03, mean: 0.001 } },
    "skin: even under that same grade":
      { t1: { exp: 18, con: 22, sat: 14, wrm: 12 }, t2: { even: 55 },
        bar: { maxd: 1, pct: 0.003, mean: 0.0001 } },
    "skin: every stage-(4) control at once, under a grade":
      { t1: { exp: 18, con: 22, sat: 14, wrm: 12 },
        t2: { even: 50, white: 40, rosy: 25, deshine: 35, gloss: 20, deyellow: 30, radiance: 30 },
        bar: { maxd: 1, pct: 0.01, mean: 0.005 } },
    /* v6.56.0 — SMOOTHING. Only the upsample half is the shader's; the planes
       are stGuidedPlanes' own, carried in as 16-bit fixed point. The counts
       below are that packing and the float32 the shader interpolates in, and
       nothing else. */
    "skin: smooth alone":
      { t2: { smooth: 60 }, bar: { maxd: 1, pct: 0.05, mean: 0.001 } },
    "skin: smooth at maximum":
      { t2: { smooth: 100 }, bar: { maxd: 1, pct: 0.35, mean: 0.005 } },
    /* at the bottom of the slider the blend is small enough to round away */
    "skin: smooth at its lowest setting":
      { t2: { smooth: 5 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: smooth under a grade":
      { t2: { smooth: 55 }, t1: { exp: 18, con: 22, sat: 14, wrm: 12 },
        bar: { maxd: 1, pct: 0.08, mean: 0.001 } },
    "skin: smooth + even together":
      { t2: { smooth: 50, even: 50 }, bar: { maxd: 1, pct: 0.07, mean: 0.001 } },
    /* THE ONE THAT PINS THE BORROWED TEXTURE UNITS. The smoothing planes ride
       units 4, 5 and 7, and stage (5)'s two blurs are bound over 4 and 5 for
       the second draw. If the planes were not uploaded again on the next frame
       that smooths, this recipe would read the blurs as planes. */
    /* v6.59.0 — stage (4b). The two bands are Skia blurs of the frame the
       readback already holds, handed over as textures, so the shader does the
       arithmetic and none of the blurring. High alone, low alone, both
       together, and both under everything else. */
    "skin: freq-sep high alone":
      { t2: { freqHi: 60 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: freq-sep high, negative (softer pores)":
      { t2: { freqHi: -60 }, bar: { maxd: 1, pct: 0.001, mean: 0.001 } },
    "skin: freq-sep low alone":
      { t2: { freqLo: 70 }, bar: { maxd: 1, pct: 0.001, mean: 0.001 } },
    "skin: freq-sep low + high together":
      { t2: { freqLo: 70, freqHi: 45 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* a NEGATIVE low is not a band at all: it only raises stage (5)'s clarity,
       so it needs no plane and no mask — and the gate must still accept it */
    "skin: freq-sep low negative, which is clarity and nothing else":
      { t2: { freqLo: -50 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "skin: freq-sep with smoothing, evening and whitening on top":
      { t2: { freqLo: 70, freqHi: 45, smooth: 40, even: 30, white: 25 },
        bar: { maxd: 1, pct: 0.001, mean: 0.001 } },
    "skin: smooth + sharpen, which binds over two of the plane units":
      { t1: { shp: 50, cla: 30 }, t2: { smooth: 50 },
        bar: { maxd: 2, pct: 0.1, mean: 0.002 } },
    /* v6.57.0 — SKIN FINISH. It is not a stage: stEffT2 folds it into controls
       already on this path (matte -> deshine, dewy -> gloss, cream -> smooth
       and white). These recipes are the ONLY ones that go through the real
       stEffT2 rather than an object built here — because the fold is the thing
       under test. If Finish ever grows a pass of its own, the CPU render moves
       and the shader's does not, and these go red. */
    "finish: matte":
      { effT2: { finish: "matte", finishV: 50 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "finish: matte at maximum":
      { effT2: { finish: "matte", finishV: 100 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "finish: dewy":
      { effT2: { finish: "dewy", finishV: 60 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "finish: cream, which spends itself on smoothing and white":
      { effT2: { finish: "cream", finishV: 70 }, bar: { maxd: 1, pct: 0.05, mean: 0.001 } },
    "finish: cream on top of a skin recipe it has to add to":
      { effT2: { finish: "cream", finishV: 50, smooth: 30, white: 20, even: 25, rosy: 15 },
        bar: { maxd: 1, pct: 0.1, mean: 0.002 } },
    /* stage (5): the CPU's own blurs, uploaded — expected bit-identical */
    "sharpen only":
      { t1: { shp: 60 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "clarity only":
      { t1: { cla: 60 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* the one that catches a non-sequential unsharp */
    "sharpen + clarity at maximum":
      { t1: { shp: 100, cla: 100 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* stage (5) stacked on the stages that are not exact: the bar is the
       vignette's, because that is where the counts come from */
    "sharpen + clarity + vignette + grain over a grade":
      { t1: { shp: 45, cla: 35, vig: 40, grn: 30, exp: 10 }, bar: { maxd: 2, pct: 0.25, mean: 0.30 } },
    /* v6.58.0 — stage (6b) Vibe Glow. The stage is TWO SKIA CALLS on the
       round-tripped frame, not shader arithmetic, so these must come back
       bit-identical: anything else means the frame handed to (6b) was not the
       frame stRunPipeline reaches (6b) with. The three that carry a bar carry
       it for the stage that follows the glow, not for the glow. */
    "glow alone":
      { t1: { glow: 40 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "glow at maximum":
      { t1: { glow: 100 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    "glow at its lowest step":
      { t1: { glow: 8 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* the ordering check: (5) runs BEFORE (6b), so the blurred copy has to be
       of the sharpened frame. Blur the unsharpened one and this goes red. */
    "glow after sharpening":
      { t1: { glow: 45, shp: 60, cla: 30 }, bar: { maxd: 0, pct: 0, mean: 0 } },
    /* and (6b) runs BEFORE (7) and (8): the bar here is the vignette's own,
       measured at 20.4% with no glow in the recipe at all */
    "glow before the vignette and the grain":
      { t1: { glow: 50, vig: 40, grn: 30 }, bar: { maxd: 2, pct: 0.25, mean: 0.30 } },
    "glow under a grade":
      { t1: { glow: 45, exp: 15, con: 20, wrm: 25, sat: 20 }, bar: { maxd: 1, pct: 0.0005, mean: 0.01 } },
    "glow over a full skin recipe":
      { t1: { glow: 50, shp: 40 }, t2: { smooth: 45, even: 30, white: 25, deshine: 20 },
        bar: { maxd: 1, pct: 0.0005, mean: 0.01 } },
    "everything at once":
      { t1: { exp: 20, bri: 10, con: 15, hi: -20, sh: 25, wht: 12, blk: -8, dhz: 15, wrm: 25, tnt: -18, sat: 20, vib: 30 },
        hsl: { r: { h: 12, s: 20, l: 6 }, b: { h: -10, s: 25, l: -8 } },
        grade: { evSh: "#1e3a6e", evHi: "#ffcf9a", evAmt: 55, evBal: -10, evSat: 20 } }
  };

  const results = await page.evaluate(async (RECIPES) => {
    const W = 256, H = 256;
    /* a deterministic source with full tonal and hue coverage, so no stage is
       exercised on a flat patch that would hide an error */
    const sc = document.createElement("canvas"); sc.width = W; sc.height = H;
    const sx = sc.getContext("2d");
    const im = sx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      im.data[p] = x;
      im.data[p + 1] = y;
      im.data[p + 2] = (x * 3 + y * 5) & 255;
      im.data[p + 3] = 255;
    }
    sx.putImageData(im, 0, 0);

    function zeroT1() { const t = {}; for (const k in stEffT1()) if (typeof stEffT1()[k] === "number") t[k] = 0; return t; }
    function zeroT2() { const t = {}; const e = stEffT2(); for (const k in e) t[k] = (typeof e[k] === "number") ? 0 : (k === "finish" ? "" : null); return t; }
    function basePv() {
      return {
        hsl: ST_HSL_BANDS.map(b => ({ c: b[1], h: 0, s: 0, l: 0 })), anyHsl: false,
        gradeZones: [], gradeSat: 0, anyGrade: false,
        bwOn: false, bwR: 0, bwG: 0, bwB: 0, anyHGB: false,
        wbOn: false, wbGr: 1, wbGb: 1, bgEnh: 0,
        leak: null, leakV: 0, frame: null, frameW: 0
      };
    }
    const out = {};
    for (const name in RECIPES) {
      const r = RECIPES[name];
      const t1 = Object.assign(zeroT1(), r.t1 || {});
      /* v6.57.0 — an effT2 recipe is set on state.st.t2 and read back through
         stEffT2, so the Skin Finish fold is exercised rather than restated */
      let t2;
      if (r.effT2) {
        state.st.t2 = stDefT2();
        for (const k in r.effT2) state.st.t2[k] = r.effT2[k];
        t2 = stEffT2();
      } else {
        t2 = Object.assign(zeroT2(), r.t2 || {});
      }
      const pv = basePv();
      if (r.hsl) {
        pv.hsl = ST_HSL_BANDS.map(b => {
          const v = r.hsl[b[0]] || {};
          return { c: b[1], h: v.h || 0, s: v.s || 0, l: v.l || 0 };
        });
        pv.anyHsl = pv.hsl.some(b => b.h || b.s || b.l);
      }
      if (r.grade) {
        const z = [];
        const push = (hex, zone) => { const c = stHexRgb(hex); if (c) z.push({ t: c, k: r.grade.evAmt, z: zone, bal: r.grade.evBal || 0 }); };
        push(r.grade.evSh, "sh"); push(r.grade.evMid, "mid"); push(r.grade.evHi, "hi");
        pv.gradeZones = z; pv.gradeSat = r.grade.evSat || 0;
        pv.anyGrade = z.length > 0 || !!pv.gradeSat;
      }
      if (r.bw) { pv.bwOn = !!r.bw.on; pv.bwR = r.bw.r || 0; pv.bwG = r.bw.g || 0; pv.bwB = r.bw.b || 0; }
      pv.anyHGB = pv.anyHsl || pv.anyGrade || pv.bwOn;
      const curve = { hl: 0, lt: 0, dk: 0, sh: 0 };

      const gate = stGpuCan(t1, t2, pv, null);

      const tc0 = performance.now();
      const cpu = stRunPipeline(sc, W, H, { t1: t1, t2: t2, pv: pv, curve: curve, heals: null, rs: 1, lm: null });
      const cpuMs = performance.now() - tc0;

      const tg0 = performance.now();
      const gpu = stGpuRender(sc, W, H, { t1: t1, t2: t2, pv: pv, curve: curve });
      const gpuMs = performance.now() - tg0;
      if (!gpu) { out[name] = { gate, error: "stGpuRender returned null" }; continue; }

      const ca = cpu.getContext("2d").getImageData(0, 0, W, H).data;
      const gc = document.createElement("canvas"); gc.width = W; gc.height = H;
      gc.getContext("2d").drawImage(gpu, 0, 0);
      const ga = gc.getContext("2d").getImageData(0, 0, W, H).data;

      /* A recipe with no grade zones cannot hit the truncation at all, so it
         is held to bit-equality. The graded ones are classified pixel by
         pixel: for these the tone stages are identity or near it, so the
         source luma is the luma that indexes the table, and "on a boundary"
         means it sits within a float32 rounding error of a whole number. */
      const gradeless = !pv.anyGrade;
      let maxd = 0, sum = 0, n = 0, worst = null, diffN = 0, offBoundary = 0, offEx = null;
      const sd = sx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < ca.length; i += 4) {
        let px_differs = false;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(ca[i + c] - ga[i + c]);
          sum += d; n++;
          if (d) { diffN++; px_differs = true; }
          if (d > maxd) { maxd = d; worst = { px: i / 4, ch: c, cpu: ca[i + c], gpu: ga[i + c] }; }
        }
        if (px_differs && !gradeless) {
          const lum = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
          if (Math.abs(lum - Math.round(lum)) > 1e-4) {
            offBoundary++;
            if (!offEx) offEx = { px: i / 4, src: [sd[i], sd[i + 1], sd[i + 2]], lum: lum,
                                  cpu: [ca[i], ca[i + 1], ca[i + 2]], gpu: [ga[i], ga[i + 1], ga[i + 2]] };
          }
        }
      }
      out[name] = { gate, gradeless, maxd, mean: sum / n, diffN, chanN: n,
                    offBoundary, offEx, cpuMs, gpuMs, worst };
    }

    /* the gate must refuse every stage the shader does not implement.
       v6.58.0 — vibe glow (6b) LEFT THIS LIST and joined check C9: the stage is
       now drawn, by handing the frame to Skia between two shader passes. A row
       leaving here has to arrive there, or the gate would be untested in both
       directions at once. */
    const refusals = {};
    const mk = () => ({ t1: zeroT1(), t2: zeroT2(), pv: basePv() });
    let a;
    a = mk(); a.t1.bgb = 30; refusals["background blur (6)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    /* v6.59.0 — "frequency separation (4)" and "teeth whitening (4)" LEFT THIS
       LIST and arrived at C11 and C12. Same rule as vibe glow in 6.58.0: a row
       that leaves here has to land in a check that renders it, or the gate
       would be untested in both directions at once. */
    a = mk(); a.t2.gdn = 40; refusals["denoise (3c)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.bgEnh = 30; refusals["background enhance (6)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.leak = "warm"; a.pv.leakV = 40; refusals["light leak (6c)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.frame = "white"; refusals["frame (9)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); refusals["heal taps (1b)"] = stGpuCan(a.t1, a.t2, a.pv, [{ u: 0.5, v: 0.5, ur: 0.05 }]);
    a = mk(); a.t1.__unknown_future_control = 25; refusals["an unknown control"] = stGpuCan(a.t1, a.t2, a.pv, null);
    /* and it must ACCEPT what the shader really does implement, or the path is
       dead code. v6.51.0 added stages (7) and (8), so those must pass the gate
       now — a refusal here would leave the new shader work unreachable. */
    a = mk(); a.t1.exp = 20; a.t1.sat = 15;
    const accepts = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.vig = 30; const acceptsVig = stGpuCan(a.t1, a.t2, a.pv, null);
    /* v6.57.0 — a Skin Finish reaches the gate through stEffT2, already folded
       into deshine / gloss / smooth / white. Ask it the way the app does. */
    const acceptsFinish = (() => {
      const keep1 = state.st.t1, keep2 = state.st.t2;
      state.st.t1 = stDefT1(); state.st.t2 = stDefT2();
      state.st.t2.finish = "matte"; state.st.t2.finishV = 50;
      const v = stGpuCan(stEffT1(), stEffT2(), basePv(), null);
      state.st.t1 = keep1; state.st.t2 = keep2;
      return v;
    })();
    a = mk(); a.t1.grn = 30; const acceptsGrn = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.shp = 40; const acceptsShp = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.cla = 40; const acceptsCla = stGpuCan(a.t1, a.t2, a.pv, null);
    /* v6.52.0 — stage (5) is the one stage the gate can WITHDRAW, because it
       costs a readback that a weak renderer cannot afford. Once the frame has
       been measured as not worth it, the same recipes must be refused again. */
    /* v6.54.0 — a skin recipe on a source the mask calls entirely non-skin
       would pass every bar while testing nothing. Measure the coverage. */
    const mcv = document.createElement("canvas"); mcv.width = W; mcv.height = H;
    mcv.getContext("2d").drawImage(sc, 0, 0);
    const mpx = mcv.getContext("2d").getImageData(0, 0, W, H);
    const mres = stSkinMask(mpx, W, H, null);
    let mOn = 0;
    if (mres && mres.mask) for (let i = 0; i < mres.mask.length; i++) if (mres.mask[i] > 5) mOn++;
    const maskFrac = mOn / (W * H);

    /* v6.55.0 — WHICH PICTURE IS THE MASK TAKEN FROM? stRunPipeline asks
       stSkinMask about the array it has in hand at stage (4), which is the
       GRADED frame. Render a strong grade on both paths and compare the mask
       the shader was actually handed with the mask of each candidate. It has
       to match the graded one and NOT the source one — and the check reports
       how far apart those two are, so a source where they agree cannot make it
       pass by accident. */
    let maskProvenance = null;
    {
      const gt1 = zeroT1(); gt1.exp = 18; gt1.con = 22; gt1.sat = 14; gt1.wrm = 12;
      const gt2 = zeroT2(); gt2.white = 60;
      const gpv = basePv(), gcurve = stCurveVals();
      const gone = stGpuRender(sc, W, H, { t1: gt1, t2: gt2, pv: gpv, curve: gcurve, rs: 1 });
      /* v6.59.0 — the mask no longer travels as a one-byte LUMINANCE texture:
         it is the RED byte of an RGBA texel whose GREEN byte carries the teeth
         alpha. Read it back out of the array that was uploaded, which is a
         stronger question than the old one — this is the texture itself. */
      const handed = ST_GPU.t4tex
        ? Uint8Array.from({ length: W * H }, (_, i) => ST_GPU.t4tex[i * 4]) : null;
      const tonal = stRunPipeline(sc, W, H, { rs: 1, t1: gt1, t2: zeroT2(), pv: gpv,
        curve: gcurve, um: null, umInv: false, heals: [], maskInfo: null, lm: null });
      const tc = document.createElement("canvas"); tc.width = W; tc.height = H;
      const tx = tc.getContext("2d"); tx.drawImage(tonal, 0, 0);
      const gradedMask = stSkinMask(tx.getImageData(0, 0, W, H), W, H, null).mask;
      const sourceMask = stSkinMask(mpx, W, H, null).mask;
      let vsGraded = 0, vsSource = 0, candidatesDiffer = 0;
      if (handed) for (let i = 0; i < handed.length; i++) {
        if (handed[i] !== gradedMask[i]) vsGraded++;
        if (handed[i] !== sourceMask[i]) vsSource++;
        if (gradedMask[i] !== sourceMask[i]) candidatesDiffer++;
      }
      maskProvenance = { rendered: !!gone, vsGraded, vsSource, candidatesDiffer };
    }

    /* v6.56.0 — THE SECOND FRAME. The smoothing planes ride texture units 4, 5
       and 7; stage (5) binds its two blurs over 4 and 5 for its own draw. On the
       NEXT frame with the same planes the cache would say "already uploaded"
       while those units hold the blurs — so the shader would read a blurred
       picture as a regression plane. One render never sees it, because the
       planes are uploaded on a cache MISS: it takes a second frame with the
       same recipe, which is exactly what a held slider produces. */
    let planeReuse = null;
    {
      const rt1 = zeroT1(); rt1.shp = 50; rt1.cla = 30;
      const rt2 = zeroT2(); rt2.smooth = 50;
      const rpv = basePv(), rcurve = stCurveVals();
      const cpu = stRunPipeline(sc, W, H, { rs: 1, t1: rt1, t2: rt2, pv: rpv, curve: rcurve,
        um: null, umInv: false, heals: [], maskInfo: null, lm: null });
      stGpuRender(sc, W, H, { t1: rt1, t2: rt2, pv: rpv, curve: rcurve, rs: 1 });   /* frame 1 */
      const two = stGpuRender(sc, W, H, { t1: rt1, t2: rt2, pv: rpv, curve: rcurve, rs: 1 }); /* frame 2 */
      const grab = (cv) => { const q = document.createElement("canvas"); q.width = W; q.height = H;
        const qq = q.getContext("2d"); qq.drawImage(cv, 0, 0); return qq.getImageData(0, 0, W, H).data; };
      if (two) {
        const A2 = grab(cpu), B2 = grab(two);
        let d = 0, m = 0;
        for (let i = 0; i < W * H; i++) for (let ch = 0; ch < 3; ch++) {
          const dd = Math.abs(A2[i * 4 + ch] - B2[i * 4 + ch]);
          if (dd) { d++; if (dd > m) m = dd; }
        }
        planeReuse = { differing: d, pct: +(100 * d / (W * H * 3)).toFixed(4), maxd: m };
      }
    }

    /* v6.59.0 — TEETH WHITENING NEEDS A MEASURED MOUTH, so the shared source
       cannot test it: with no face, stApplySkin whitens nothing and the two
       paths would agree about nothing happening. This builds a frame the pass
       can actually act on — skin-toned ground, a bright neutral band where the
       inner lip will sit — and a fabricated 68-point face over it. Both paths
       are handed the same landmarks, so any disagreement is the shader's. */
    let teethCheck = null;
    {
      const tc = document.createElement("canvas"); tc.width = W; tc.height = H;
      const tx = tc.getContext("2d");
      const ti = tx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const q = (y * W + x) * 4;
        ti.data[q] = 208 + ((x >> 4) & 7);
        ti.data[q + 1] = 168 + ((y >> 4) & 7);
        ti.data[q + 2] = 148 + ((x + y) & 7);
        ti.data[q + 3] = 255;
      }
      for (let y = 150; y < 175; y++) for (let x = 96; x < 160; x++) {
        const q = (y * W + x) * 4; ti.data[q] = 232; ti.data[q + 1] = 228; ti.data[q + 2] = 214;
      }
      tx.putImageData(ti, 0, 0);
      const pts = new Array(68), cx = 128, eyeY = 96, iod = 56, mouthY = 162;
      for (let i = 0; i <= 16; i++) { const t = (i - 8) / 8; pts[i] = [cx + t * 70, 120 + (1 - t * t) * 80]; }
      for (let i = 17; i <= 21; i++) { const t = (i - 17) / 4; pts[i] = [cx - iod / 2 - 18 + t * 36, eyeY - 18]; }
      for (let i = 22; i <= 26; i++) { const t = (i - 22) / 4; pts[i] = [cx + iod / 2 - 18 + t * 36, eyeY - 18]; }
      for (let i = 27; i <= 30; i++) { const t = (i - 27) / 3; pts[i] = [cx, eyeY + t * 32]; }
      for (let i = 31; i <= 35; i++) { const t = (i - 31) / 4; pts[i] = [cx - 14 + t * 28, eyeY + 40]; }
      const eye = (base, ex) => { for (let i = 0; i < 6; i++) { const a = Math.PI * 2 * i / 6;
        pts[base + i] = [ex + Math.cos(a) * 13, eyeY + Math.sin(a) * 7]; } };
      eye(36, cx - iod / 2); eye(42, cx + iod / 2);
      for (let i = 48; i <= 59; i++) { const a = Math.PI * 2 * (i - 48) / 12;
        pts[i] = [cx + Math.cos(a) * 42, mouthY + Math.sin(a) * 22]; }
      for (let i = 60; i <= 67; i++) { const a = Math.PI * 2 * (i - 60) / 8;
        pts[i] = [cx + Math.cos(a) * 30, mouthY + Math.sin(a) * 11]; }
      const lm = { w: W, h: H, scanned: true, faces: [{ score: 0.9, pts: pts }] };
      const keptLM = ST.faceLM; ST.faceLM = lm;
      /* THIS BLOCK RENDERS A SECOND SOURCE, and that is how it found the stale
         cache: stGpuRender keys its readback on ST.maskRev, which stBuildBuffer
         bumps whenever the pipeline's input is rebuilt. The app calls that
         function; a test that swaps the canvas underneath has to say so too, or
         the frames below are masked with the first source's skin. Bumping it
         here is the app's own signal, not a reset of the cache. */
      ST.maskRev = (ST.maskRev || 0) + 1;
      const zone = stZonesFromLM(lm, W, H);
      const tmi = stSkinMask(tx.getImageData(0, 0, W, H), W, H, lm);
      const plane = stTeethPlane(W, H, stFaceZones(tx.getImageData(0, 0, W, H), W, H, tmi, lm));
      let planeOn = 0; if (plane) for (let i = 0; i < plane.length; i++) if (plane[i] > 12) planeOn++;
      const grabT = (cv) => { const q = document.createElement("canvas"); q.width = W; q.height = H;
        const qq = q.getContext("2d"); qq.drawImage(cv, 0, 0); return qq.getImageData(0, 0, W, H).data; };
      const run = (t2) => {
        const pv = basePv(), t1 = zeroT1(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
        const cpu = stRunPipeline(tc, W, H, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm });
        const gpu = stGpuRender(tc, W, H, { t1, t2, pv, curve: cu, rs: 1 });
        return { gate: stGpuCan(t1, t2, pv, null), cpu: grabT(cpu), gpu: gpu ? grabT(gpu) : null };
      };
      const off = run(zeroT2());
      const t2t = zeroT2(); t2t.teeth = 70;
      const on = run(t2t);
      const t2c = zeroT2(); t2c.teeth = 70; t2c.white = 30; t2c.smooth = 35; t2c.freqHi = 40; t2c.freqLo = 50;
      const combo = run(t2c);
      const cmpT = (r) => {
        if (!r.gpu) return { error: "stGpuRender returned null", gate: r.gate };
        let maxd = 0, diff = 0, sum = 0, n = 0, worst = null;
        for (let i = 0; i < r.cpu.length; i += 4) for (let c = 0; c < 3; c++) {
          const d = Math.abs(r.cpu[i + c] - r.gpu[i + c]); sum += d; n++;
          if (d) { diff++; if (d > maxd) { maxd = d; worst = { px: i / 4, ch: c, cpu: r.cpu[i + c], gpu: r.gpu[i + c] }; } }
        }
        return { gate: r.gate, maxd, diff, pct: +(100 * diff / n).toFixed(4), mean: +(sum / n).toFixed(5), worst };
      };
      /* did the whitening move anything at all? measured on the CPU's own two
         renders, so a vacuous check cannot pass by agreeing about nothing */
      let moved = 0, movedMax = 0;
      for (let i = 0; i < off.cpu.length; i += 4) for (let c = 0; c < 3; c++) {
        const d = Math.abs(off.cpu[i + c] - on.cpu[i + c]);
        if (d) { moved++; if (d > movedMax) movedMax = d; }
      }
      teethCheck = {
        zonesReal: !!(zone && zone.real),
        planePixels: planeOn,
        cpuMovedChannels: moved, cpuMovedMax: movedMax,
        baseline: cmpT(off), teeth: cmpT(on), combo: cmpT(combo)
      };
      ST.faceLM = keptLM;
      /* and back to the shared source for the checks below */
      ST.maskRev = (ST.maskRev || 0) + 1;
    }

    /* v6.59.0 — stage (4b) lives on two texture units the shader only gets on a
       device that reports them, and it can be withdrawn on measured frames like
       stage (5) and (6b). Both roads to "no" are asked here, and both must take
       the frequency sliders and NOTHING ELSE with them. */
    /* v6.59.0 — THE WIDE BAND'S RADIUS RIDES THE SLIDER, so its cache key must
       too. The narrow band is keyed on the tonal half alone (dragging Freq-Sep
       High must re-blur nothing); the wide one carries the Low value. Drag it:
       render at one Low, then another, with the tonal half untouched. If the
       key were the tonal half alone the second frame would reuse the first
       radius and quietly draw the wrong picture — which is exactly the shape of
       the plane-reuse trap check C8 exists for. */
    let fsRadiusReuse = null;
    {
      const grabF = (cv) => { const q = document.createElement("canvas"); q.width = W; q.height = H;
        const c = q.getContext("2d"); c.drawImage(cv, 0, 0); return c.getImageData(0, 0, W, H).data; };
      const one = (lo) => {
        const t1 = zeroT1(), pv = basePv(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
        const t2 = zeroT2(); t2.freqLo = lo;
        const cpu = stRunPipeline(sc, W, H, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm: null });
        const gpu = stGpuRender(sc, W, H, { t1, t2, pv, curve: cu, rs: 1 });
        if (!gpu) return { error: "null" };
        const A = grabF(cpu), B = grabF(gpu);
        let maxd = 0, diff = 0;
        for (let i = 0; i < A.length; i += 4) for (let c = 0; c < 3; c++) {
          const d = Math.abs(A[i + c] - B[i + c]); if (d) { diff++; if (d > maxd) maxd = d; }
        }
        return { lo, maxd, diff };
      };
      const first = one(20);
      const second = one(90);
      const third = one(20);          /* and back, so a one-way key is caught too */
      fsRadiusReuse = { first, second, third };
    }

    /* v6.59.0 — IS STAGE (4b) ACTUALLY FASTER, measured the way a drag actually
       happens. The recipe table above renders each recipe ONCE at 256x256, and
       a first frame there is all cost and no benefit: it pays the readback, the
       guided-filter solve and both blurs on 65k pixels. What a retoucher does
       is hold a slider on a real preview, where the tonal half is already
       cached. So: a realistic size, both paths warmed, three frames each, and
       the GL frame flushed through a real draw so the timer cannot stop before
       the GPU has finished — the mistake that made the first Vibe Glow
       measurement in 6.58.0 read backwards. */
    let fsSpeed = null;
    {
      const SW = 512, SH = 768;
      const bc = document.createElement("canvas"); bc.width = SW; bc.height = SH;
      const bx = bc.getContext("2d"); const bi = bx.createImageData(SW, SH);
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const q = (y * SW + x) * 4;
        bi.data[q] = 190 + ((x >> 3) & 31); bi.data[q + 1] = 150 + ((y >> 3) & 31);
        bi.data[q + 2] = 130 + ((x + y) & 31); bi.data[q + 3] = 255;
      }
      bx.putImageData(bi, 0, 0);
      ST.maskRev = (ST.maskRev || 0) + 1;
      const flush = (cv) => { const q = document.createElement("canvas"); q.width = 8; q.height = 8;
        const c = q.getContext("2d"); c.drawImage(cv, 0, 0, 8, 8); return c.getImageData(0, 0, 1, 1).data[0]; };
      const t1 = zeroT1(), pv = basePv(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
      const t2 = zeroT2(); t2.freqLo = 70; t2.freqHi = 45;
      const cpu1 = () => stRunPipeline(bc, SW, SH, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm: null });
      const gpu1 = () => stGpuRender(bc, SW, SH, { t1, t2, pv, curve: cu, rs: 1 });
      flush(cpu1()); const w = gpu1(); if (w) flush(w);
      let c0 = performance.now(); for (let i = 0; i < 3; i++) flush(cpu1());
      const cpuMs = (performance.now() - c0) / 3;
      let g0 = performance.now(); for (let i = 0; i < 3; i++) { const g = gpu1(); if (g) flush(g); }
      const gpuMs = (performance.now() - g0) / 3;
      fsSpeed = { W: SW, H: SH, cpuMs: +cpuMs.toFixed(1), gpuMs: +gpuMs.toFixed(1),
                  x: +(cpuMs / Math.max(gpuMs, 0.001)).toFixed(2) };
      ST.maskRev = (ST.maskRev || 0) + 1;
    }

    /* what this runner actually reports, so a red C12a names the reason in one
       run instead of costing a cycle to find out */
    const glLimits = (() => {
      try {
        const g = ST_GPU.gl;
        const d = g.getExtension("WEBGL_debug_renderer_info");
        return { renderer: d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : "?",
                 maxTextureImageUnits: g.getParameter(g.MAX_TEXTURE_IMAGE_UNITS),
                 maxCombined: g.getParameter(g.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
                 fsBuildErr: ST_GPU.fsBuildErr || null };
      } catch (e) { return { error: String(e) }; }
    })();

    const fsCapReal = ST_GPU.fsCap;
    const fsFrom = (t2k, v) => { const t = zeroT2(); t[t2k] = v; return t; };
    const acceptsFreqHi = stGpuCan(zeroT1(), fsFrom("freqHi", 40), basePv(), null) === true;
    const acceptsFreqLo = stGpuCan(zeroT1(), fsFrom("freqLo", 40), basePv(), null) === true;
    const acceptsTeeth = stGpuCan(zeroT1(), fsFrom("teeth", 40), basePv(), null) === true;
    ST_GPU.fsOff = true;
    const refusesFreqWhenSpent = stGpuCan(zeroT1(), fsFrom("freqHi", 40), basePv(), null) === false;
    const stillAcceptsNegLowWhenFsSpent = stGpuCan(zeroT1(), fsFrom("freqLo", -60), basePv(), null) === true;
    const stillAcceptsTeethWhenFsSpent = stGpuCan(zeroT1(), fsFrom("teeth", 40), basePv(), null) === true;
    const stillAcceptsSmoothWhenFsSpent = stGpuCan(zeroT1(), fsFrom("smooth", 40), basePv(), null) === true;
    ST_GPU.fsOff = false;
    /* and the capability road. It is the RENDERER that owns this question, not
       the gate: the gate must never boot GL to answer it (see stGpuFsOn), so on
       a device without the units the frame is refused where GL is in hand and
       the CPU draws it. Asked here as behaviour: a freq recipe comes back null,
       a teeth recipe still renders, and the program still boots. */
    ST_GPU.fsCap = false;
    const noUnits = (() => {
      const t1 = zeroT1(), pv = basePv(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
      ST.maskRev = (ST.maskRev || 0) + 1;
      const freq = stGpuRender(sc, W, H, { t1, t2: fsFrom("freqHi", 40), pv, curve: cu, rs: 1 });
      const teethOnly = stGpuRender(sc, W, H, { t1, t2: fsFrom("teeth", 40), pv, curve: cu, rs: 1 });
      const tonal = stGpuRender(sc, W, H, { t1: Object.assign(zeroT1(), { exp: 20 }), t2: zeroT2(), pv, curve: cu, rs: 1 });
      return { freqIsNull: freq === null, teethStillDraws: !!teethOnly, tonalStillDraws: !!tonal,
               stillBooted: !!ST_GPU.gl };
    })();
    ST_GPU.fsCap = fsCapReal;
    ST.maskRev = (ST.maskRev || 0) + 1;

    /* v6.59.0 — AND IF THE DRIVER SIMPLY WILL NOT TAKE THE PROGRAM.
       The unit count is what a driver REPORTS; whether its compiler accepts the
       spliced source is a different question, and the answer must never be "no
       GPU at all". Break the splice on purpose, boot again, and check that the
       program still links, the fast path still exists, and only stage (4b) is
       gone. This is the check that stands between one new stage and losing the
       whole fast path on a student's machine. */
    let fsBuildFallback = null;
    {
      const keptDecl = window.ST_GPU_FS_DECL;
      const reboot = () => { ST_GPU.tried = false; ST_GPU.gl = null; ST_GPU.prog = null;
        ST_GPU.loc = {}; ST_GPU.tex = {}; ST_GPU.fsCap = null; ST_GPU.noiseUp = false;
        ST_GPU.t4key = ""; ST_GPU.t4tkey = ""; ST_GPU.gpKey = ""; ST_GPU.fsSrcKey = "";
        return !!stGpuBoot(); };
      window.ST_GPU_FS_DECL = "this is not glsl at all;";
      const booted = reboot();
      const capAfter = ST_GPU.fsCap, errAfter = ST_GPU.fsBuildErr || null;
      const t1 = zeroT1(), pv = basePv(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
      ST.maskRev = (ST.maskRev || 0) + 1;
      const tonalStillDraws = !!stGpuRender(sc, W, H,
        { t1: Object.assign(zeroT1(), { exp: 20 }), t2: zeroT2(), pv, curve: cu, rs: 1 });
      const freqIsNull = stGpuRender(sc, W, H, { t1, t2: fsFrom("freqHi", 40), pv, curve: cu, rs: 1 }) === null;
      window.ST_GPU_FS_DECL = keptDecl;
      const bootedClean = reboot();
      ST.maskRev = (ST.maskRev || 0) + 1;
      fsBuildFallback = { booted, capAfter, sawAnError: !!errAfter, tonalStillDraws, freqIsNull,
                          bootedClean, capClean: ST_GPU.fsCap };
    }

    const wasOff = ST_GPU.s5off;
    ST_GPU.s5off = true;
    /* v6.59.0 — WHAT s5off ACTUALLY HAS TO REFUSE. claA is not only the Clarity
       slider: radiance*0.3 feeds it and a NEGATIVE Freq-Sep Low *0.4 feeds it.
       Before this wave the gate refused shp/cla when stage (5) was withdrawn
       but accepted a radiance recipe, whose clarity then silently vanished from
       the frame. Both are asked here, with s5off set. */
    a = mk(); a.t2.radiance = 50; const refusesRadianceWhenS5Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.freqLo = -60; const refusesNegLowWhenS5Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.teeth = 40; const stillAcceptsTeethWhenS5Spent = stGpuCan(a.t1, a.t2, a.pv, null) === true;
    a = mk(); a.t2.white = 40; const acceptsWhite = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.even = 40; const acceptsEven = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.smooth = 40; const acceptsSmooth = stGpuCan(a.t1, a.t2, a.pv, null);
    /* v6.55.0 — stage (4) now costs a readback of its own, so it has a
       withdrawal of its own, and it must bite on every control in the stage */
    const wasT4 = ST_GPU.t4off;
    ST_GPU.t4off = true;
    a = mk(); a.t2.white = 40; const refusesWhiteWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.even = 40; const refusesEvenWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.smooth = 40; const refusesSmoothWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.teeth = 40; const refusesTeethWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t2.freqHi = 40; const refusesFreqWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t1.exp = 20; const stillAcceptsTonalWhenT4Spent = stGpuCan(a.t1, a.t2, a.pv, null);
    ST_GPU.t4off = wasT4;
    a = mk(); a.t1.shp = 40; const refusesShpWhenSpent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t1.cla = 40; const refusesClaWhenSpent = stGpuCan(a.t1, a.t2, a.pv, null) === false;
    a = mk(); a.t1.exp = 20; const stillAcceptsTonalWhenSpent = stGpuCan(a.t1, a.t2, a.pv, null);
    ST_GPU.s5off = wasOff;
    /* and the rule that sets it, checked as a rule */
    const spent = {
      slowerThanTheSettle: stGpuS5Spent(300, 320) === true,
      barelyUnderIsStillSpent: stGpuS5Spent(290, 320) === true,
      comfortablyFasterIsKept: stGpuS5Spent(40, 320) === false,
      noSettleYetButUnderTheCeiling: stGpuS5Spent(80, 0) === false,
      noSettleYetAndOverTheCeiling: stGpuS5Spent(200, 0) === true
    };

    /* v6.58.0 — stage (6b) is accepted, withdrawn on its own flag, and takes
       nothing else with it when it goes */
    const glowT1 = Object.assign(zeroT1(), { glow: 40 });
    const acceptsGlow = stGpuCan(glowT1, zeroT2(), basePv(), null) === true;
    ST_GPU.glowOff = true;
    const refusesGlowWhenSpent = stGpuCan(glowT1, zeroT2(), basePv(), null) === false;
    const stillAcceptsTonalWhenGlowSpent =
      stGpuCan(Object.assign(zeroT1(), { exp: 10, shp: 30 }), zeroT2(), basePv(), null) === true;
    ST_GPU.glowOff = false;

    /* THE NUMBER THIS WAVE IS FOR: every preset the studio ships, asked of the
       real gate the way the app asks it — stEffT1/stEffT2 off state.st, so the
       Skin Finish fold and every other derivation happens first. */
    const savedT1 = state.st.t1, savedT2 = state.st.t2;
    let eligible = 0, presets = 0, blocked = [];
    for (const pr of [].concat(ST_PRESETS_MU || [], ST_PRESETS_EV || [])) {
      state.st.t1 = stDefT1(); state.st.t2 = stDefT2();
      const src = pr.t1 || pr.v || pr;
      for (const k in src) if (k in state.st.t1 && typeof src[k] === "number") state.st.t1[k] = src[k];
      const s2 = pr.t2 || {};
      for (const k in s2) if (k in state.st.t2) state.st.t2[k] = s2[k];
      presets++;
      if (stGpuCan(stEffT1(), stEffT2(), stPipeVals(), null) === true) eligible++;
      else blocked.push(pr.key);
    }
    state.st.t1 = savedT1; state.st.t2 = savedT2;
    const glowCoverage = { eligible, presets, blocked };

    return { out, refusals, accepts, acceptsVig, acceptsGrn, acceptsShp, acceptsCla, acceptsFinish,
      refusesShpWhenSpent, refusesClaWhenSpent, stillAcceptsTonalWhenSpent, spent,
      maskFrac: +maskFrac.toFixed(4), acceptsWhite, acceptsEven, acceptsSmooth,
      refusesWhiteWhenT4Spent, refusesEvenWhenT4Spent, refusesSmoothWhenT4Spent,
      refusesTeethWhenT4Spent, refusesFreqWhenT4Spent,
      refusesRadianceWhenS5Spent, refusesNegLowWhenS5Spent, stillAcceptsTeethWhenS5Spent,
      teethCheck, fsRadiusReuse, fsSpeed, fsBuildFallback, fsCapReal, glLimits, acceptsFreqHi, acceptsFreqLo, acceptsTeeth,
      refusesFreqWhenSpent, stillAcceptsNegLowWhenFsSpent, stillAcceptsTeethWhenFsSpent,
      stillAcceptsSmoothWhenFsSpent, noUnits,
      stillAcceptsTonalWhenT4Spent, maskProvenance, planeReuse,
      acceptsGlow, refusesGlowWhenSpent, stillAcceptsTonalWhenGlowSpent, glowCoverage };
  }, RECIPES);

  /* ---- B) the two paths agree, recipe by recipe ----
     The bar: no channel off by more than the arithmetic width can explain (1,
     or 2 where the grade block's luma truncation is in play), and the handful
     of channels that differ at all stays under a fifth of one percent. Check F
     below shows a real error cannot pass this. */
  for (const name in results.out) {
    const r = results.out[name];
    if (r.error) { report("B) GPU matches the CPU — " + name, false, r); continue; }
    /* a recipe may state its own bar where a canvas stage makes the default
       impossible; everything else is held to float32 arithmetic alone */
    const bar = (RECIPES[name] && RECIPES[name].bar) ||
                { maxd: r.gradeless ? 1 : 2, pct: 0.002, mean: 0.01 };
    const frac = r.diffN / r.chanN;
    report("B) GPU matches the CPU within its stated bar — " + name,
      r.maxd <= bar.maxd && frac <= bar.pct && r.mean <= bar.mean,
      { maxd: r.maxd, allowed: bar.maxd, differing: r.diffN + "/" + r.chanN,
        pct: (frac * 100).toFixed(4) + "%", allowedPct: (bar.pct * 100) + "%",
        mean: r.mean, allowedMean: bar.mean, worst: r.worst });
  }

  /* ---- C) the honesty gate ---- */
  const wrongly = Object.keys(results.refusals).filter(k => results.refusals[k] !== false);
  report("C) the gate refuses every stage the shader does not implement",
    wrongly.length === 0, { accepted_when_it_should_refuse: wrongly });
  report("C2b) a Skin Finish is accepted, because stEffT2 has already spent it on controls the shader draws",
    results.acceptsFinish === true, { matte50: results.acceptsFinish });
  report("C2) and it accepts every stage the shader does implement, so none is dead code",
    results.accepts === true && results.acceptsVig === true && results.acceptsGrn === true &&
    results.acceptsShp === true && results.acceptsCla === true,
    { tonal: results.accepts, vignette: results.acceptsVig, grain: results.acceptsGrn,
      sharpen: results.acceptsShp, clarity: results.acceptsCla });
  report("C3) once the round trip is measured as not worth it, stage (5) is refused again",
    results.refusesShpWhenSpent && results.refusesClaWhenSpent &&
    results.stillAcceptsTonalWhenSpent === true,
    { sharpenRefused: results.refusesShpWhenSpent, clarityRefused: results.refusesClaWhenSpent,
      tonalUnaffected: results.stillAcceptsTonalWhenSpent });
  report("C5) stage (4) is accepted — Even, Smoothing, teeth and both frequency bands included",
    results.acceptsWhite === true && results.acceptsEven === true &&
    results.acceptsSmooth === true && results.acceptsTeeth === true &&
    results.acceptsFreqHi === true && results.acceptsFreqLo === true,
    { white: results.acceptsWhite, even: results.acceptsEven, smooth: results.acceptsSmooth,
      teeth: results.acceptsTeeth, freqHi: results.acceptsFreqHi, freqLo: results.acceptsFreqLo });
  /* v6.59.0 — the defect this wave exposed, asked as a rule */
  report("C5c) with stage (5) withdrawn the gate refuses every recipe whose clarity is non-zero, not only the Clarity slider",
    results.refusesRadianceWhenS5Spent === true && results.refusesNegLowWhenS5Spent === true &&
    results.stillAcceptsTeethWhenS5Spent === true,
    { radiance50: results.refusesRadianceWhenS5Spent, negativeFreqLo: results.refusesNegLowWhenS5Spent,
      teethIsUnaffected: results.stillAcceptsTeethWhenS5Spent });
  report("C5b2) …and teeth and the frequency bands go with it, because both ride that same readback",
    results.refusesTeethWhenT4Spent === true && results.refusesFreqWhenT4Spent === true,
    { teeth: results.refusesTeethWhenT4Spent, freq: results.refusesFreqWhenT4Spent });
  report("C5b) …and once its own readback is measured as not worth it, the whole stage is refused again",
    results.refusesWhiteWhenT4Spent && results.refusesEvenWhenT4Spent &&
    results.refusesSmoothWhenT4Spent && results.stillAcceptsTonalWhenT4Spent === true,
    { whiteRefused: results.refusesWhiteWhenT4Spent, evenRefused: results.refusesEvenWhenT4Spent,
      smoothRefused: results.refusesSmoothWhenT4Spent,
      tonalUnaffected: results.stillAcceptsTonalWhenT4Spent });
  report("C8) a SECOND smoothing frame is still the CPU's picture, after stage (5) bound its blurs over two of the plane units",
    !!results.planeReuse && results.planeReuse.maxd <= 2 && results.planeReuse.pct <= 0.1,
    results.planeReuse && (results.planeReuse.differing + " channels differ (" +
      results.planeReuse.pct + "%), max " + results.planeReuse.maxd + " counts on the second frame"));
  report("C7) the mask the shader is handed is the GRADED frame's, which is the one stRunPipeline asks about",
    !!results.maskProvenance && results.maskProvenance.rendered &&
    results.maskProvenance.vsGraded === 0 &&
    results.maskProvenance.candidatesDiffer > 0 &&
    results.maskProvenance.vsSource === results.maskProvenance.candidatesDiffer,
    results.maskProvenance && (results.maskProvenance.vsGraded + " bytes from the graded mask, " +
      results.maskProvenance.vsSource + " from the source mask, and the two candidates are " +
      results.maskProvenance.candidatesDiffer + " apart — 6.54.0 used the source one"));
  report("C6) the skin mask covers part of this source, so the stage (4) recipes are not vacuous",
    results.maskFrac > 0.02 && results.maskFrac < 0.98,
    { maskedFraction: results.maskFrac });
  report("C9) stage (6b) Vibe Glow is accepted, and withdrawing it takes nothing else with it",
    results.acceptsGlow === true && results.refusesGlowWhenSpent === true &&
    results.stillAcceptsTonalWhenGlowSpent === true,
    { accepted: results.acceptsGlow, refusedWhenSpent: results.refusesGlowWhenSpent,
      tonalAndSharpenUnaffected: results.stillAcceptsTonalWhenGlowSpent });
  /* v6.58.0 — the gate is not a list of keys to a student, it is which of the
     studio's own looks draw while they drag. Every one of them does now, and a
     stage taken back off this path has to say so here rather than quietly. */
  report("C10) every preset the studio ships draws on this path",
    !!results.glowCoverage && results.glowCoverage.presets >= 16 &&
    results.glowCoverage.eligible === results.glowCoverage.presets,
    results.glowCoverage && (results.glowCoverage.eligible + " / " + results.glowCoverage.presets +
      " presets" + (results.glowCoverage.blocked.length
        ? "; still on the CPU: " + results.glowCoverage.blocked.join(", ") : "")));
  /* ---- C11) stage (4) teeth: the one control whose WHERE is a measured mouth */
  {
    const t = results.teethCheck;
    report("C11a) the fabricated face reads as measured and the teeth plane covers real pixels",
      !!t && t.zonesReal === true && t.planePixels > 300,
      t && { zonesReal: t.zonesReal, planePixels: t.planePixels });
    report("C11b) …and the CPU's whitening actually moves that frame, so the comparison is not vacuous",
      !!t && t.cpuMovedChannels > 1000 && t.cpuMovedMax >= 4,
      t && { movedChannels: t.cpuMovedChannels, maxCounts: t.cpuMovedMax });
    report("C11c) with no skin control at all the two paths already agree on this frame",
      !!t && t.baseline && t.baseline.maxd === 0 && t.baseline.diff === 0, t && t.baseline);
    report("C11) teeth whitening draws on the GPU, bit for bit the CPU's picture",
      !!t && t.teeth && t.teeth.gate === true && t.teeth.maxd === 0 && t.teeth.diff === 0,
      t && t.teeth);
    report("C11d) …and still does with whitening, smoothing and both frequency bands on top of it",
      !!t && t.combo && t.combo.gate === true && t.combo.maxd <= 1 && t.combo.pct <= 5,
      t && t.combo);
  }

  /* ---- C12) stage (4b): two roads to "no", and neither may take anything else */
  report("C13) dragging Freq-Sep Low re-blurs the wide band — three frames at 20, 90 and 20 again, each the CPU's picture",
    (() => { const r = results.fsRadiusReuse;
      return !!r && [r.first, r.second, r.third].every(x => x && !x.error && x.maxd <= 1 && x.diff <= 200); })(),
    results.fsRadiusReuse);
  /* v6.59.0 — AND THE APP HAS TO EMIT THE SIGNAL THE TEST USES.
     The block above bumps ST.maskRev because that is what loading a photo does.
     Fault injection showed the obvious hole in that: with the test doing the
     bump, deleting the app's own bump changed nothing here — the check would
     have gone on passing over the very defect it was written for. stBuildBuffer
     is the one place the pipeline's input is rebuilt, so the bump has to be
     inside it, and this reads the shipped file to say so. */
  {
    const src = await (await fetch("http://127.0.0.1:" + PORT + "/index.html")).text();
    const i = src.indexOf("function stBuildBuffer(){");
    const j = i >= 0 ? src.indexOf("\nfunction ", i + 10) : -1;
    const body = (i >= 0 && j > i) ? src.slice(i, j) : "";
    report("C7b) stBuildBuffer bumps ST.maskRev, which is the only thing in the readback key that can tell two photographs apart",
      /ST\.maskRev\s*=\s*\(\s*ST\.maskRev\s*\|\|\s*0\s*\)\s*\+\s*1/.test(body),
      { foundStBuildBuffer: i >= 0, bodyChars: body.length });
  }

  report("C12a) this device reports the texture units stage (4b) needs, so the checks above rendered it",
    results.fsCapReal === true, { fsCap: results.fsCapReal, gl: results.glLimits });
  report("C12) once stage (4b) is measured as not worth it, the two frequency sliders are refused — and nothing else is",
    results.refusesFreqWhenSpent === true && results.stillAcceptsTeethWhenFsSpent === true &&
    results.stillAcceptsSmoothWhenFsSpent === true && results.stillAcceptsNegLowWhenFsSpent === true,
    { freqRefused: results.refusesFreqWhenSpent, teethKept: results.stillAcceptsTeethWhenFsSpent,
      smoothKept: results.stillAcceptsSmoothWhenFsSpent,
      negativeLowKept: results.stillAcceptsNegLowWhenFsSpent });
  report("C12c) a driver that will not compile stage (4b) loses that stage and NOTHING else — the fast path still boots",
    (() => { const r = results.fsBuildFallback;
      return !!r && r.booted === true && r.capAfter === false && r.sawAnError === true &&
             r.tonalStillDraws === true && r.freqIsNull === true &&
             r.bootedClean === true && r.capClean === true; })(),
    results.fsBuildFallback);
  report("C12b) a device with only the eight units WebGL guarantees sends a frequency frame to the CPU and keeps every other stage",
    !!results.noUnits && results.noUnits.freqIsNull === true &&
    results.noUnits.teethStillDraws === true && results.noUnits.tonalStillDraws === true &&
    results.noUnits.stillBooted === true, results.noUnits);

  report("C4) and the rule that withdraws it compares against what the CPU costs here",
    Object.keys(results.spent).every(k => results.spent[k] === true), results.spent);

  /* ---- D) it is actually faster, which is the whole point ---- */
  const heavy = results.out["everything at once"];
  report("D) the shader is not slower than the CPU on the full recipe",
    !!heavy && heavy.gpuMs <= heavy.cpuMs,
    heavy ? { cpuMs: heavy.cpuMs.toFixed(2), gpuMs: heavy.gpuMs.toFixed(2) } : null);

  /* v6.59.0 — and the two stages this wave added carry their own weight.
     Measured separately, on a SwiftShader software rasteriser (there is no GPU
     in this container, so a real device should do better, not worse), with the
     tonal half held still the way a slider drag holds it:

                                                        512x768      896x1344
       freq-sep low 70 + high 45                        2.23x          2.54x
       teeth 70                                         1.60x          1.92x
       grade + smooth + even + white + freq + teeth +
         sharpen — a retoucher's actual frame           1.61x          2.09x   */
  report("D2) stage (4b) beats the CPU on a held slider at a real preview size",
    !!results.fsSpeed && results.fsSpeed.x > 1, results.fsSpeed);

  report("E) nothing threw while rendering either path", pageErrors.length === 0, pageErrors);

  /* ---- F) the bar has teeth ----
     Render the CPU with one recipe and the GPU with a recipe that differs by a
     SINGLE step on one control, then run the same comparison. If check B's
     thresholds could not see that, they could not see a porting error either. */
  const teeth = await page.evaluate(() => {
    const W = 256, H = 256;
    const sc = document.createElement("canvas"); sc.width = W; sc.height = H;
    const sx = sc.getContext("2d");
    const im = sx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      im.data[p] = x; im.data[p + 1] = y; im.data[p + 2] = (x * 3 + y * 5) & 255; im.data[p + 3] = 255;
    }
    sx.putImageData(im, 0, 0);
    const t1 = {}; for (const k in stEffT1()) if (typeof stEffT1()[k] === "number") t1[k] = 0;
    const t2 = {}; { const e = stEffT2(); for (const k in e) t2[k] = (typeof e[k] === "number") ? 0 : (k === "finish" ? "" : null); }
    const pv = { hsl: ST_HSL_BANDS.map(b => ({ c: b[1], h: 0, s: 0, l: 0 })), anyHsl: false,
                 gradeZones: [], gradeSat: 0, anyGrade: false, bwOn: false, bwR: 0, bwG: 0, bwB: 0,
                 anyHGB: false, wbOn: false, wbGr: 1, wbGb: 1, bgEnh: 0, leak: null, leakV: 0, frame: null, frameW: 0 };
    const curve = { hl: 0, lt: 0, dk: 0, sh: 0 };
    t1.sat = 20; t1.con = 15;
    const cpu = stRunPipeline(sc, W, H, { t1: t1, t2: t2, pv: pv, curve: curve, heals: null, rs: 1, lm: null });
    const wrong = Object.assign({}, t1, { sat: 21 });   /* ONE step out */
    const gpu = stGpuRender(sc, W, H, { t1: wrong, t2: t2, pv: pv, curve: curve });
    if (!gpu) return { error: "no gpu canvas" };
    const ca = cpu.getContext("2d").getImageData(0, 0, W, H).data;
    const gc = document.createElement("canvas"); gc.width = W; gc.height = H;
    gc.getContext("2d").drawImage(gpu, 0, 0);
    const ga = gc.getContext("2d").getImageData(0, 0, W, H).data;
    let maxd = 0, sum = 0, n = 0, diffN = 0;
    for (let i = 0; i < ca.length; i += 4) for (let c = 0; c < 3; c++) {
      const d = Math.abs(ca[i + c] - ga[i + c]); sum += d; n++;
      if (d) diffN++; if (d > maxd) maxd = d;
    }
    return { maxd, mean: sum / n, diffN, chanN: n, pct: (diffN / n * 100).toFixed(2) + "%" };
  });
  const caught = !teeth.error && !(teeth.maxd <= 1 && teeth.diffN / teeth.chanN < 0.002 && teeth.mean < 0.01);
  report("F) one step wrong on one control fails the same bar check B applies",
    caught, teeth);

  /* F2) the vignette is allowed a count on many more pixels because Skia
     dithers the gradient. That width is only acceptable if a REAL vignette
     error still fails it, so move the control by one step and require the
     vignette's own bar (maxd 1, 15% of channels) to reject it. */
  const vigTeeth = await page.evaluate(() => {
    const W = 256, H = 256;
    const sc = document.createElement("canvas"); sc.width = W; sc.height = H;
    const sx = sc.getContext("2d");
    sx.fillStyle = "rgb(200,200,200)"; sx.fillRect(0, 0, W, H);
    const t1 = {}; { const e = stEffT1(); for (const k in e) if (typeof e[k] === "number") t1[k] = 0; }
    const t2 = {}; { const e = stEffT2(); for (const k in e) t2[k] = (typeof e[k] === "number") ? 0 : (k === "finish" ? "" : null); }
    const pv = { hsl: ST_HSL_BANDS.map(x => ({ c: x[1], h: 0, s: 0, l: 0 })), anyHsl: false,
      gradeZones: [], gradeSat: 0, anyGrade: false, bwOn: false, bwR: 0, bwG: 0, bwB: 0,
      anyHGB: false, wbOn: false, wbGr: 1, wbGb: 1, bgEnh: 0, leak: null, leakV: 0, frame: null, frameW: 0 };
    const curve = { hl: 0, lt: 0, dk: 0, sh: 0 };
    t1.vig = 60;
    const cpu = stRunPipeline(sc, W, H, { t1, t2, pv, curve, heals: null, rs: 1, lm: null });
    const gpu = stGpuRender(sc, W, H, { t1: Object.assign({}, t1, { vig: 61 }), t2, pv, curve, rs: 1 });
    if (!gpu) return { error: "no gpu canvas" };
    const ca = cpu.getContext("2d").getImageData(0, 0, W, H).data;
    const gc = document.createElement("canvas"); gc.width = W; gc.height = H;
    gc.getContext("2d").drawImage(gpu, 0, 0);
    const ga = gc.getContext("2d").getImageData(0, 0, W, H).data;
    let maxd = 0, diffN = 0, n = 0, sum = 0;
    for (let i = 0; i < ca.length; i += 4) for (let c = 0; c < 3; c++) {
      const d = Math.abs(ca[i + c] - ga[i + c]); n++; sum += d;
      if (d) diffN++; if (d > maxd) maxd = d;
    }
    return { maxd, diffN, chanN: n, mean: sum / n, pct: (diffN / n * 100).toFixed(2) + "%" };
  });
  /* the SAME bar the vignette recipe is held to in check B — maxd 1, 15% of
     channels, mean 0.15 — applied to a vignette that is one step wrong */
  const vigBar = RECIPES["vignette only"].bar;
  const vigWouldPass = !vigTeeth.error && vigTeeth.maxd <= vigBar.maxd &&
    (vigTeeth.diffN / vigTeeth.chanN) <= vigBar.pct && vigTeeth.mean <= vigBar.mean;
  report("F2) the vignette's wider bar still rejects a vignette off by one step",
    !vigTeeth.error && !vigWouldPass,
    Object.assign({ bar: vigBar }, vigTeeth));
  if (!vigTeeth.error) {
    console.log("      vignette 60 rendered against a CPU vignette of 61: max " + vigTeeth.maxd +
      ", " + vigTeeth.pct + " of channels, mean " + vigTeeth.mean.toFixed(3) +
      " — rejected by the same bar that accepts the real one");
  }

  if (heavy) {
    console.log("\n      full recipe at 256x256 — CPU " + heavy.cpuMs.toFixed(2) +
      "ms, GPU " + heavy.gpuMs.toFixed(2) + "ms");
    for (const name in results.out) {
      const r = results.out[name];
      console.log("      " + (r.diffN === 0 ? "bit-identical" :
        (r.diffN + "/" + r.chanN + " channels differ (" +
         (r.diffN / r.chanN * 100).toFixed(4) + "%), max " + r.maxd + " count" +
         (r.maxd === 1 ? "" : "s"))) + "  —  " + name);
    }
  }

  await browser.close();
  console.log(failures
    ? "\nFAIL (" + failures + ")"
    : "\nPASS — the GPU preview is the CPU's picture, and it refuses every stage it cannot draw");
  process.exit(failures ? 1 : 0);
})();
