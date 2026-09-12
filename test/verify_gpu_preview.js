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
 * v6.71.0 — STAGE (4c), THE EYE PAIR, AND THE TWO IT LEAVES BEHIND.
 *
 * EYE BRIGHTEN and EYE DEFINITION are measured contours, like teeth, so they
 * ride the same texel: the skin plane's BLUE byte is the eye polygons at 1.35
 * and its ALPHA byte the same polygons at 1.60. No new texture and no new unit,
 * and there is none to be had — 0 through 7 are src, lut, zw, noise, b1/gpA,
 * b8/gpB, skin and gpC, and eight is all WebGL 1 guarantees.
 *
 * Brighten is the ONLY stage in this shader that runs outside the mask gate,
 * and stApplySkin says why in its own comment: pupils and sclera are exactly
 * the pixels the skin mask rejects. Definition is a high-band lift, so it reads
 * stage (4b)'s low band and is spliced in with it — a device that cannot have
 * units 8 and 9 loses Definition along with the two Freq-Sep sliders and keeps
 * Brighten, which C13f asserts as behaviour rather than as a flag.
 *
 * Measured here, on a fabricated face with a dark iris and a bright sclera so
 * both of Brighten's branches fire:
 *
 *     Eye Brighten         0 channels differ   (bit for bit)
 *     Eye Definition       within 1 count on under 1% of channels
 *     both, over white + smoothing + teeth + the high band
 *                          within 1 count on under 5% of channels
 *
 * DARK CIRCLES and EYE BAGS are still the CPU's, and C13f pins that they are
 * refused BY NAME. The reason is arithmetic: the under-eye ellipses are a third
 * plane and there is no third byte, and Eye Bags needs a third full-frame blur
 * on top of that. Both fit if the leftover bytes of two planes are split, which
 * is worth doing with its own measurement rather than folded in here.
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
/* v6.59.0 — AND IT HAS TO SAY IT SOMEWHERE READABLE.
   A red run's reason was in the job log, and the job log's tail is the whole
   PostgreSQL container dump — hundreds of lines of schema — so the one line
   that mattered could not be reached through the API at all. A "::error::"
   line becomes an ANNOTATION on the check run, which is readable without the
   log. Only on a runner; locally it would just be noise. */
function ann(text) {
  if (!process.env.GITHUB_ACTIONS) return;
  const one = String(text).replace(/[\r\n]+/g, " ").slice(0, 900);
  console.log("::error title=GPU preview::" + one);
  /* AND into the step summary, which is the ONE place a red run's reason can be
     read back through the API: it lands in the check run's output. The job log
     cannot be used — its tail is the PostgreSQL container's own dump, hundreds
     of lines of schema, and the line that matters sits before all of it. */
  try {
    if (process.env.GITHUB_STEP_SUMMARY) {
      require("fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, "- " + one + "\n");
    }
  } catch (e) { }
}
process.on("unhandledRejection", (e) => {
  const line = "FAIL — the run threw during: " + PHASE + "  :: " + (e && e.stack || e);
  console.log(line);
  ann(line);
  process.exit(1);
});
function report(name, ok, detail) {
  const line = (ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  console.log(line);
  if (!ok) { failures++; ann(line); }
}

/* v6.59.0 — A TEST THAT DIES WITHOUT SAYING WHY IS A BAD TEST.
   This one went red on CI four seconds in, with nothing in the log to read but
   the container teardown: the async body rejected, node exited non-zero, and
   the reason was thrown away. Everything below now runs inside a reporter that
   prints the exception, the page's own errors and how far the run got. The
   exit code is unchanged — a throw is still a failure — but the next one names
   itself in the first line instead of costing a cycle to find. */
let PHASE = "starting";
(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e)));
  PHASE = "page.goto";
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
    ann("FAIL — no GL context, so the comparison below cannot run :: " + JSON.stringify(gl));
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

  PHASE = "the main page.evaluate (recipes, teeth, stage 4b)";
  const results = await page.evaluate(async (RECIPES) => {
    /* eslint-disable no-undef */
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
    /* the browser side reports its own progress too: an exception here used to
       reach node as a bare rejection with no idea which recipe was in hand */
    window.__hnkPhase = "recipes";
    for (const name in RECIPES) {
      window.__hnkPhase = "recipe: " + name;
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
    window.__hnkPhase = "teeth";
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

    /* v6.71.0 — (4c) THE EYE PAIR. Same bargain as teeth: a measured contour
       riding the skin texel's free bytes. Brighten reads the blue byte and is
       the only stage in the shader that runs OUTSIDE the mask gate on purpose
       (pupils and sclera are exactly what the skin mask rejects); Definition
       reads the alpha byte and lifts against stage (4b)'s low band.
       The plate below is painted so BOTH of Brighten's branches can fire: a
       dark iris under the 95 floor, and a bright, near-neutral sclera over the
       150 ceiling and inside the 45 spread. Without that the check would be
       comparing two renders that agree about doing nothing. */
    window.__hnkPhase = "eye";
    let eyeCheck = null;
    {
      const ec = document.createElement("canvas"); ec.width = W; ec.height = H;
      const ex2 = ec.getContext("2d");
      const ei = ex2.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const q = (y * W + x) * 4;
        ei.data[q] = 208 + ((x >> 4) & 7);
        ei.data[q + 1] = 168 + ((y >> 4) & 7);
        ei.data[q + 2] = 148 + ((x + y) & 7);
        ei.data[q + 3] = 255;
      }
      const cx = 128, eyeY = 96, iod = 56;
      const paintEye = (exc) => {
        for (let y = eyeY - 9; y <= eyeY + 9; y++) for (let x = exc - 16; x <= exc + 16; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const q = (y * W + x) * 4;
          const r2 = (x - exc) * (x - exc) / 169 + (y - eyeY) * (y - eyeY) / 49;
          if (r2 > 1.1) continue;
          if ((x - exc) * (x - exc) + (y - eyeY) * (y - eyeY) < 20) {
            ei.data[q] = 40; ei.data[q + 1] = 42; ei.data[q + 2] = 45;      /* iris, under the floor */
          } else {
            ei.data[q] = 230; ei.data[q + 1] = 228; ei.data[q + 2] = 226;   /* sclera, over the ceiling */
          }
        }
      };
      paintEye(cx - iod / 2); paintEye(cx + iod / 2);
      ex2.putImageData(ei, 0, 0);
      const pts = new Array(68), mouthY = 162;
      for (let i = 0; i <= 16; i++) { const t = (i - 8) / 8; pts[i] = [cx + t * 70, 120 + (1 - t * t) * 80]; }
      for (let i = 17; i <= 21; i++) { const t = (i - 17) / 4; pts[i] = [cx - iod / 2 - 18 + t * 36, eyeY - 18]; }
      for (let i = 22; i <= 26; i++) { const t = (i - 22) / 4; pts[i] = [cx + iod / 2 - 18 + t * 36, eyeY - 18]; }
      for (let i = 27; i <= 30; i++) { const t = (i - 27) / 3; pts[i] = [cx, eyeY + t * 32]; }
      for (let i = 31; i <= 35; i++) { const t = (i - 31) / 4; pts[i] = [cx - 14 + t * 28, eyeY + 40]; }
      const eye = (base, exc) => { for (let i = 0; i < 6; i++) { const a2 = Math.PI * 2 * i / 6;
        pts[base + i] = [exc + Math.cos(a2) * 13, eyeY + Math.sin(a2) * 7]; } };
      eye(36, cx - iod / 2); eye(42, cx + iod / 2);
      for (let i = 48; i <= 59; i++) { const a2 = Math.PI * 2 * (i - 48) / 12;
        pts[i] = [cx + Math.cos(a2) * 42, mouthY + Math.sin(a2) * 22]; }
      for (let i = 60; i <= 67; i++) { const a2 = Math.PI * 2 * (i - 60) / 8;
        pts[i] = [cx + Math.cos(a2) * 30, mouthY + Math.sin(a2) * 11]; }
      const lm = { w: W, h: H, scanned: true, faces: [{ score: 0.9, pts: pts }] };
      const keptLM = ST.faceLM; ST.faceLM = lm;
      ST.maskRev = (ST.maskRev || 0) + 1;
      /* the two contours the shader is handed, measured here the way the plane
         builder measures them, so "the planes were empty" cannot pass as "the
         two paths agree" */
      const emi = stSkinMask(ex2.getImageData(0, 0, W, H), W, H, lm);
      const efs = stFaceSetOf(stFaceZones(ex2.getImageData(0, 0, W, H), W, H, emi, lm));
      const esh = stEyeShapes(efs);
      const p135 = esh.e135.length ? stShapeBytes(W, H, esh.e135, esh.fe) : null;
      const p160 = esh.e160.length ? stShapeBytes(W, H, esh.e160, esh.fe) : null;
      let on135 = 0, on160 = 0;
      if (p135) for (let i = 0; i < p135.length; i++) if (p135[i] > 12) on135++;
      if (p160) for (let i = 0; i < p160.length; i++) if (p160[i] > 12) on160++;
      const grabE = (cv) => { const q = document.createElement("canvas"); q.width = W; q.height = H;
        const qq = q.getContext("2d"); qq.drawImage(cv, 0, 0); return qq.getImageData(0, 0, W, H).data; };
      const runE = (t2) => {
        const pv = basePv(), t1 = zeroT1(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
        const cpu = stRunPipeline(ec, W, H, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm });
        const gpu = stGpuRender(ec, W, H, { t1, t2, pv, curve: cu, rs: 1 });
        return { gate: stGpuCan(t1, t2, pv, null), cpu: grabE(cpu), gpu: gpu ? grabE(gpu) : null };
      };
      const cmpE = (r) => {
        if (!r.gpu) return { error: "stGpuRender returned null", gate: r.gate };
        let maxd = 0, diff = 0, sum = 0, n = 0, worst = null;
        for (let i = 0; i < r.cpu.length; i += 4) for (let c = 0; c < 3; c++) {
          const d = Math.abs(r.cpu[i + c] - r.gpu[i + c]); sum += d; n++;
          if (d) { diff++; if (d > maxd) { maxd = d; worst = { px: i / 4, ch: c, cpu: r.cpu[i + c], gpu: r.gpu[i + c] }; } }
        }
        return { gate: r.gate, maxd, diff, pct: +(100 * diff / n).toFixed(4), mean: +(sum / n).toFixed(5), worst };
      };
      const movedBy = (a2, b2) => { let mv = 0, mx = 0;
        for (let i = 0; i < a2.length; i += 4) for (let c = 0; c < 3; c++) {
          const d = Math.abs(a2[i + c] - b2[i + c]); if (d) { mv++; if (d > mx) mx = d; } }
        return { ch: mv, max: mx }; };
      const offE = runE(zeroT2());
      const t2b = zeroT2(); t2b.eyeb = 70;            const ebR = runE(t2b);
      const t2d = zeroT2(); t2d.eyeDef = 70;          const edR = runE(t2d);
      const t2be = zeroT2(); t2be.eyeb = 70; t2be.eyeDef = 70;
      t2be.white = 30; t2be.smooth = 35; t2be.teeth = 40; t2be.freqHi = 40;
      const bothR = runE(t2be);
      eyeCheck = {
        plane135: on135, plane160: on160,
        cpuMovedEyeb: movedBy(offE.cpu, ebR.cpu),
        cpuMovedEyeDef: movedBy(offE.cpu, edR.cpu),
        baseline: cmpE(offE), eyeb: cmpE(ebR), eyeDef: cmpE(edR), both: cmpE(bothR)
      };
      ST.faceLM = keptLM;
      ST.maskRev = (ST.maskRev || 0) + 1;
    }

    /* v6.60.0 — STAGE (6c-), LIVE FACE RESHAPE. Like teeth it needs a measured
       face, and unlike every other stage it moves the picture GEOMETRICALLY,
       so the frame under it has to have detail worth mis-sampling: a flat
       plate would agree with anything. This one is three sinusoids at
       different frequencies, which puts a steep gradient under most pixels —
       if the shader's sample point were off by even a fraction of a pixel the
       comparison below could not come back at zero. */
    window.__hnkPhase = "reshape";
    let reshapeCheck = null;
    {
      const rw = 256, rh = 256;
      const rc = document.createElement("canvas"); rc.width = rw; rc.height = rh;
      const rx = rc.getContext("2d");
      const ri = rx.createImageData(rw, rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const q = (y * rw + x) * 4;
        ri.data[q] = 200 + 40 * Math.sin(x * 0.7);
        ri.data[q + 1] = 160 + 50 * Math.sin(y * 0.9 + 1.0);
        ri.data[q + 2] = 140 + 60 * Math.sin((x + y) * 0.5);
        ri.data[q + 3] = 255;
      }
      rx.putImageData(ri, 0, 0);
      const rp = new Array(68), rcx = 128, reY = 96, riod = 56, rmY = 162;
      for (let i = 0; i <= 16; i++) { const t = (i - 8) / 8; rp[i] = [rcx + t * 70, 120 + (1 - t * t) * 80]; }
      for (let i = 17; i <= 21; i++) { const t = (i - 17) / 4; rp[i] = [rcx - riod / 2 - 18 + t * 36, reY - 18]; }
      for (let i = 22; i <= 26; i++) { const t = (i - 22) / 4; rp[i] = [rcx + riod / 2 - 18 + t * 36, reY - 18]; }
      for (let i = 27; i <= 30; i++) { const t = (i - 27) / 3; rp[i] = [rcx, reY + t * 32]; }
      for (let i = 31; i <= 35; i++) { const t = (i - 31) / 4; rp[i] = [rcx - 14 + t * 28, reY + 40]; }
      const rEye = (base, ex) => { for (let i = 0; i < 6; i++) { const a = Math.PI * 2 * i / 6;
        rp[base + i] = [ex + Math.cos(a) * 13, reY + Math.sin(a) * 7]; } };
      rEye(36, rcx - riod / 2); rEye(42, rcx + riod / 2);
      for (let i = 48; i <= 59; i++) { const a = Math.PI * 2 * (i - 48) / 12;
        rp[i] = [rcx + Math.cos(a) * 42, rmY + Math.sin(a) * 22]; }
      for (let i = 60; i <= 67; i++) { const a = Math.PI * 2 * (i - 60) / 8;
        rp[i] = [rcx + Math.cos(a) * 30, rmY + Math.sin(a) * 11]; }
      const rlm = { w: rw, h: rh, scanned: true, faces: [{ score: 0.9, pts: rp }] };
      const keptR = ST.faceLM; ST.faceLM = rlm;
      ST.maskRev = (ST.maskRev || 0) + 1;
      const grabR = (cv) => { const q = document.createElement("canvas"); q.width = rw; q.height = rh;
        const qq = q.getContext("2d"); qq.drawImage(cv, 0, 0); return qq.getImageData(0, 0, rw, rh).data; };
      const runR = (t2, t1x) => {
        const pv = basePv(), t1 = Object.assign(zeroT1(), t1x || {}), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
        const cpu = stRunPipeline(rc, rw, rh, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm: rlm });
        const gpu = stGpuRender(rc, rw, rh, { t1, t2, pv, curve: cu, rs: 1, lm: rlm });
        return { gate: stGpuCan(t1, t2, pv, null), cpu: grabR(cpu), gpu: gpu ? grabR(gpu) : null };
      };
      const cmpR = (r) => {
        if (!r.gpu) return { error: "stGpuRender returned null", gate: r.gate };
        let maxd = 0, diff = 0, sum = 0, n = 0;
        for (let i = 0; i < r.cpu.length; i += 4) for (let c = 0; c < 3; c++) {
          const d = Math.abs(r.cpu[i + c] - r.gpu[i + c]); sum += d; n++;
          if (d) { diff++; if (d > maxd) maxd = d; }
        }
        return { gate: r.gate, maxd, diff, pct: +(100 * diff / n).toFixed(4), mean: +(sum / n).toFixed(5) };
      };
      const mkR = (o) => Object.assign(zeroT2(), o);
      const allEight = { wSlim: 60, wJaw: 50, wChin: 40, wCheek: 40, wTemple: 30, wFore: 50, wPhil: 40, wEye: 50 };
      const off = runR(zeroT2());
      const slim = runR(mkR({ wSlim: 70 }));
      /* did the reshape move the frame at all, on the CPU's own two renders? */
      let moved = 0, movedMax = 0;
      for (let i = 0; i < off.cpu.length; i += 4) for (let c = 0; c < 3; c++) {
        const d = Math.abs(off.cpu[i + c] - slim.cpu[i + c]);
        if (d) { moved++; if (d > movedMax) movedMax = d; }
      }
      /* THE MIRROR GUARD. The frame reaches this pass either as an uploaded
         canvas (row 0 at the top) or as a texture the GPU rendered into (row 0
         at the bottom), and reading one as the other is a VERTICALLY FLIPPED
         picture. That is not a hypothetical: it is what the first working
         version of this stage did, and it cost 66% of channels at up to 120
         counts. A frame this asymmetric catches it; the plain comparison does
         too, but this says so by name. */
      let mirror = null;
      {
        const g = slim.gpu;
        let aligned = 0, flipped = 0;
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) for (let c = 0; c < 3; c++) {
          const a = (y * rw + x) * 4 + c, b = ((rh - 1 - y) * rw + x) * 4 + c;
          aligned += Math.abs(off.cpu[a] - g[a]);
          flipped += Math.abs(off.cpu[a] - g[b]);
        }
        /* the frame calibrates its own threshold: against the unwarped CPU
           render, a correct draw is CLOSE when the rows line up and far when
           they are mirrored. A flipped read reverses that, and by a lot. */
        mirror = { aligned, flipped, ratio: +(flipped / Math.max(aligned, 1)).toFixed(2) };
      }
      reshapeCheck = {
        plan: (() => { const pl = stGpuWarpPlan(rw, rh, rlm, mkR({ wSlim: 70 }));
          return pl && pl !== true ? { kernels: pl.K.length, box: [pl.bx0, pl.by0, pl.bx1, pl.by1],
            rect: [pl.rx0, pl.ry0, pl.rw, pl.rh] } : pl; })(),
        cpuMovedChannels: moved, cpuMovedMax: movedMax,
        baseline: cmpR(off),
        slim: cmpR(slim),
        jaw: cmpR(runR(mkR({ wJaw: 60 }))),
        chin: cmpR(runR(mkR({ wChin: 80 }))),
        eyeScale: cmpR(runR(mkR({ wEye: 70 }))),
        negative: cmpR(runR(mkR({ wSlim: -70 }))),
        allEight: cmpR(runR(mkR(allEight))),
        overGlow: cmpR(runR(mkR({ wSlim: 60 }), { glow: 40 })),
        overSkin: cmpR(runR(mkR(Object.assign({ smooth: 45, white: 35, even: 40 }, allEight)),
          { exp: 10, con: 8, wrm: 6, shp: 35 })),
        /* the same recipe with the eight sliders at zero, so the reshape's own
           contribution to the difference is readable rather than assumed */
        skinAlone: cmpR(runR(mkR({ smooth: 45, white: 35, even: 40 }),
          { exp: 10, con: 8, wrm: 6, shp: 35 })),
        mirror: mirror
      };
      /* THE CLAMP. stWarpApply reads from a padded rect and clamps the sample
         into it, and the pad is the WIDEST SINGLE KERNEL — never the sum — so
         several overlapping kernels can push a sample past it. Away from the
         frame edge that is invisible, because the rect has room; against the
         edge the rect is truncated at 0 and the clamp is what the CPU actually
         uses. So the same face is pushed hard into the top-left corner, where
         both clamps are reachable, and the two paths must still agree.
         (Fault injection: with the upper clamp removed the ordinary recipes
         above do not notice — this is the row that does.) */
      {
        const shove = rp.map((q) => [q[0] - 62, q[1] - 68]);
        const elm = { w: rw, h: rh, scanned: true, faces: [{ score: 0.9, pts: shove }] };
        const keptE = ST.faceLM; ST.faceLM = elm;
        const t2e = mkR({ wSlim: 90, wJaw: 80, wCheek: 70, wTemple: 60 });
        const pl = stGpuWarpPlan(rw, rh, elm, t2e);
        const pv = basePv(), t1 = zeroT1(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
        const cpu = stRunPipeline(rc, rw, rh, { t1, t2: t2e, pv, curve: cu, heals: null, rs: 1, lm: elm });
        const gpu = stGpuRender(rc, rw, rh, { t1, t2: t2e, pv, curve: cu, rs: 1, lm: elm });
        reshapeCheck.edgeFace = cmpR({ gate: stGpuCan(t1, t2e, pv, null),
          cpu: grabR(cpu), gpu: gpu ? grabR(gpu) : null });
        reshapeCheck.edgeRect = pl && pl !== true
          ? { box: [pl.bx0, pl.by0, pl.bx1, pl.by1], rect: [pl.rx0, pl.ry0, pl.rw, pl.rh] } : pl;
        ST.faceLM = keptE;
      }
      /* TWO FACES ARE REFUSED, because stWarpApply puts each one back on the
         canvas before it reads the next and one pass cannot do that. */
      {
        const two = { w: rw, h: rh, scanned: true,
          faces: [{ score: 0.9, pts: rp }, { score: 0.9, pts: rp.map(q => [q[0], q[1]]) }] };
        const t1 = zeroT1(), t2 = mkR({ wSlim: 70 }), pv = basePv();
        reshapeCheck.twoFacePlan = stGpuWarpPlan(rw, rh, two, t2);
        reshapeCheck.twoFaceRefused =
          stGpuRender(rc, rw, rh, { t1, t2, pv, curve: { hl: 0, lt: 0, dk: 0, sh: 0 }, rs: 1, lm: two }) === null;
      }
      /* AND THE WITHDRAWAL TAKES THE RESHAPE AND NOTHING ELSE */
      {
        const t1 = zeroT1(), pv = basePv(), keep = ST_GPU.warpOff;
        reshapeCheck.gateOn = stGpuCan(t1, mkR({ wSlim: 70 }), pv, null);
        ST_GPU.warpOff = true;
        reshapeCheck.gateOffRefusesWarp = stGpuCan(t1, mkR({ wSlim: 70 }), pv, null);
        reshapeCheck.renderOffRefuses =
          stGpuRender(rc, rw, rh, { t1, t2: mkR({ wSlim: 70 }), pv, curve: { hl: 0, lt: 0, dk: 0, sh: 0 }, rs: 1, lm: rlm }) === null;
        reshapeCheck.gateOffKeepsSkin = stGpuCan(t1, mkR({ smooth: 40 }), pv, null);
        ST_GPU.warpOff = keep;
      }
      reshapeCheck.built = { warpCap: ST_GPU.warpCap === true, buildErr: ST_GPU.warpBuildErr || null,
        fboErr: ST_GPU.fboErr || null };
      ST.faceLM = keptR;
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
    window.__hnkPhase = "stage 4b radius cache";
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
    window.__hnkPhase = "stage 4b speed";
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
      /* and, when it did NOT win, whether the product's own withdrawal rule
         fires on that number — which is the thing that actually protects a
         student on such a machine */
      fsSpeed = { W: SW, H: SH, cpuMs: +cpuMs.toFixed(1), gpuMs: +gpuMs.toFixed(1),
                  x: +(cpuMs / Math.max(gpuMs, 0.001)).toFixed(2),
                  withdrawnIfSlower: stGpuS5Spent(gpuMs, cpuMs) === true };
      ST.maskRev = (ST.maskRev || 0) + 1;
    }

    /* v6.60.0 — AND THE SAME QUESTION FOR STAGE (6c-), ASKED THE SAME WAY AND
       ANSWERED HONESTLY. A reshape drag on a real preview: the eight sliders,
       a measured face, the tonal half held still. Whether the round trip pays
       is a property of the MACHINE, not of the code — see the note above D3. */
    window.__hnkPhase = "stage 6c- speed";
    let warpSpeed = null;
    {
      const SW = 512, SH = 768;
      const bc = document.createElement("canvas"); bc.width = SW; bc.height = SH;
      const bx = bc.getContext("2d"); const bi = bx.createImageData(SW, SH);
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const q = (y * SW + x) * 4;
        bi.data[q] = 200 + 40 * Math.sin(x * 0.7); bi.data[q + 1] = 160 + 50 * Math.sin(y * 0.9);
        bi.data[q + 2] = 140 + 60 * Math.sin((x + y) * 0.5); bi.data[q + 3] = 255;
      }
      bx.putImageData(bi, 0, 0);
      ST.maskRev = (ST.maskRev || 0) + 1;
      const wp = new Array(68), wcx = SW / 2, weY = SH * 0.375, wiod = SW * 0.22, wmY = SH * 0.633;
      for (let i = 0; i <= 16; i++) { const t = (i - 8) / 8; wp[i] = [wcx + t * SW * 0.27, SH * 0.47 + (1 - t * t) * SH * 0.31]; }
      for (let i = 17; i <= 26; i++) { wp[i] = [wcx + (i - 21.5) * SW * 0.03, weY - SH * 0.07]; }
      for (let i = 27; i <= 30; i++) { const t = (i - 27) / 3; wp[i] = [wcx, weY + t * SH * 0.125]; }
      for (let i = 31; i <= 35; i++) { const t = (i - 31) / 4; wp[i] = [wcx - SW * 0.055 + t * SW * 0.11, weY + SH * 0.156]; }
      const wEye2 = (base, ex) => { for (let i = 0; i < 6; i++) { const a = Math.PI * 2 * i / 6;
        wp[base + i] = [ex + Math.cos(a) * SW * 0.05, weY + Math.sin(a) * SH * 0.027]; } };
      wEye2(36, wcx - wiod / 2); wEye2(42, wcx + wiod / 2);
      for (let i = 48; i <= 59; i++) { const a = Math.PI * 2 * (i - 48) / 12;
        wp[i] = [wcx + Math.cos(a) * SW * 0.16, wmY + Math.sin(a) * SH * 0.086]; }
      for (let i = 60; i <= 67; i++) { const a = Math.PI * 2 * (i - 60) / 8;
        wp[i] = [wcx + Math.cos(a) * SW * 0.12, wmY + Math.sin(a) * SH * 0.043]; }
      const wlm = { w: SW, h: SH, scanned: true, faces: [{ score: 0.9, pts: wp }] };
      const keptW = ST.faceLM; ST.faceLM = wlm;
      const flush = (cv) => { const q = document.createElement("canvas"); q.width = 8; q.height = 8;
        const c = q.getContext("2d"); c.drawImage(cv, 0, 0, 8, 8); return c.getImageData(0, 0, 1, 1).data[0]; };
      const t1 = zeroT1(), pv = basePv(), cu = { hl: 0, lt: 0, dk: 0, sh: 0 };
      t1.exp = 10; t1.con = 8;
      const t2 = zeroT2();
      t2.wSlim = 60; t2.wJaw = 50; t2.wChin = 40; t2.wCheek = 40;
      t2.wTemple = 30; t2.wFore = 50; t2.wPhil = 40; t2.wEye = 50;
      const cpu1 = () => stRunPipeline(bc, SW, SH, { t1, t2, pv, curve: cu, heals: null, rs: 1, lm: wlm });
      const gpu1 = () => stGpuRender(bc, SW, SH, { t1, t2, pv, curve: cu, rs: 1, lm: wlm });
      flush(cpu1()); const w0 = gpu1(); if (w0) flush(w0);
      let c0 = performance.now(); for (let i = 0; i < 3; i++) flush(cpu1());
      const cpuMs = (performance.now() - c0) / 3;
      let g0 = performance.now(); for (let i = 0; i < 3; i++) { const g = gpu1(); if (g) flush(g); }
      const gpuMs = (performance.now() - g0) / 3;
      const wplanSp = stGpuWarpPlan(SW, SH, wlm, t2);
      warpSpeed = { W: SW, H: SH, kernels: (wplanSp && wplanSp.K) ? wplanSp.K.length : 0,
                    cpuMs: +cpuMs.toFixed(1), gpuMs: +gpuMs.toFixed(1),
                    x: +(cpuMs / Math.max(gpuMs, 0.001)).toFixed(2),
                    withdrawnIfSlower: stGpuS5Spent(gpuMs, cpuMs) === true };
      ST.faceLM = keptW;
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
    /* v6.71.0 — the eye pair follows the same two roads. Brighten needs only
       the contour, so a device that gave up on the bands keeps it; Definition
       lifts against one of those bands, so it goes with them. */
    const stillAcceptsEyebWhenFsSpent = stGpuCan(zeroT1(), fsFrom("eyeb", 40), basePv(), null) === true;
    const refusesEyeDefWhenFsSpent = stGpuCan(zeroT1(), fsFrom("eyeDef", 40), basePv(), null) === false;
    ST_GPU.fsOff = false;
    const acceptsEyeb = stGpuCan(zeroT1(), fsFrom("eyeb", 40), basePv(), null) === true;
    const acceptsEyeDef = stGpuCan(zeroT1(), fsFrom("eyeDef", 40), basePv(), null) === true;
    /* and the two of the four that are still the CPU's, refused by name */
    const refusesUeDark = stGpuCan(zeroT1(), fsFrom("ueDark", 40), basePv(), null) === false;
    const refusesUeBags = stGpuCan(zeroT1(), fsFrom("ueBags", 40), basePv(), null) === false;
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
    window.__hnkPhase = "stage 4b build fallback";
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
      teethCheck, eyeCheck, reshapeCheck, warpSpeed, fsRadiusReuse, fsSpeed, fsBuildFallback, fsCapReal, glLimits, acceptsFreqHi, acceptsFreqLo, acceptsTeeth,
      refusesFreqWhenSpent, stillAcceptsNegLowWhenFsSpent, stillAcceptsTeethWhenFsSpent,
      acceptsEyeb, acceptsEyeDef, stillAcceptsEyebWhenFsSpent, refusesEyeDefWhenFsSpent,
      refusesUeDark, refusesUeBags,
      stillAcceptsSmoothWhenFsSpent, noUnits,
      stillAcceptsTonalWhenT4Spent, maskProvenance, planeReuse,
      acceptsGlow, refusesGlowWhenSpent, stillAcceptsTonalWhenGlowSpent, glowCoverage };
  }, RECIPES).catch(async (e) => {
    let where = "?";
    try { where = await page.evaluate(() => window.__hnkPhase || "?"); } catch (e2) { }
    const line = "FAIL — the browser threw inside the comparison, at: " + where +
      "  :: " + (e && e.message || e);
    console.log(line);
    console.log("       page errors so far: " + JSON.stringify(pageErrors.slice(0, 5)));
    ann(line + " | page errors: " + JSON.stringify(pageErrors.slice(0, 3)));
    await browser.close();
    process.exit(1);
  });

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

  report("C13f) the gate accepts the eye pair, sends Definition down the bands' road, and still refuses the other two by name",
    results.acceptsEyeb === true && results.acceptsEyeDef === true &&
    results.stillAcceptsEyebWhenFsSpent === true && results.refusesEyeDefWhenFsSpent === true &&
    results.refusesUeDark === true && results.refusesUeBags === true,
    { eyeb: results.acceptsEyeb, eyeDef: results.acceptsEyeDef,
      eyebSurvivesFsSpent: results.stillAcceptsEyebWhenFsSpent,
      eyeDefGoesWithBands: results.refusesEyeDefWhenFsSpent,
      ueDark: results.refusesUeDark, ueBags: results.refusesUeBags });

  /* ---- C13) stage (4c) the eye pair: two measured contours on the free bytes
     of a texel the shader was already sampling. Eye Brighten is the only stage
     that runs OUTSIDE the mask gate — pupils and sclera are exactly the pixels
     the skin mask rejects — and Eye Definition lifts against stage (4b)'s low
     band, which is why it is spliced with the bands and refused with them. */
  {
    const e = results.eyeCheck;
    report("C13a) both eye contours cover real pixels, and the wider one is wider",
      !!e && e.plane135 > 300 && e.plane160 > e.plane135,
      e && { at135: e.plane135, at160: e.plane160 });
    report("C13b) …and the CPU's own two renders move that frame, so neither comparison is vacuous",
      !!e && e.cpuMovedEyeb.ch > 500 && e.cpuMovedEyeb.max >= 4 &&
      e.cpuMovedEyeDef.ch > 200 && e.cpuMovedEyeDef.max >= 2,
      e && { brighten: e.cpuMovedEyeb, definition: e.cpuMovedEyeDef });
    report("C13c) with no skin control at all the two paths already agree on this frame",
      !!e && e.baseline && e.baseline.maxd === 0 && e.baseline.diff === 0, e && e.baseline);
    report("C13) Eye Brighten draws on the GPU, bit for bit the CPU's picture",
      !!e && e.eyeb && e.eyeb.gate === true && e.eyeb.maxd === 0 && e.eyeb.diff === 0,
      e && e.eyeb);
    report("C13d) Eye Definition draws on the GPU against the same low band the CPU lifts against",
      !!e && e.eyeDef && e.eyeDef.gate === true && e.eyeDef.maxd <= 1 && e.eyeDef.pct <= 1,
      e && e.eyeDef);
    report("C13e) …and both still hold with whitening, smoothing, teeth and the high band on top",
      !!e && e.both && e.both.gate === true && e.both.maxd <= 1 && e.both.pct <= 5,
      e && e.both);
  }

  /* ---- C14) stage (6c-) live face reshape: the first stage that moves the
     picture GEOMETRICALLY rather than per pixel, so it is the first one whose
     fidelity is a question about COORDINATES. See the shader's own note for
     what that costs and what is done about it. */
  {
    const r = results.reshapeCheck;
    const bitFor = (k) => !!r && r[k] && r[k].gate === true && r[k].maxd === 0 && r[k].diff === 0;
    report("C14a) the reshape is planned from the app's own kernels, over a real box",
      !!r && r.built && r.built.warpCap === true && !!r.plan && r.plan.kernels >= 8 &&
      r.plan.box[2] > r.plan.box[0] + 40 && r.plan.rect[2] > r.plan.box[2] - r.plan.box[0],
      r && { built: r.built, plan: r.plan });
    report("C14b) …and the CPU's reshape really moves that frame, so the comparison is not vacuous",
      !!r && r.cpuMovedChannels > 5000 && r.cpuMovedMax >= 20,
      r && { movedChannels: r.cpuMovedChannels, maxCounts: r.cpuMovedMax });
    report("C14c) with no reshape at all the two paths already agree on this frame",
      bitFor("baseline"), r && r.baseline);
    report("C14) Face Slim, V-Jaw, Chin, the eye scale and a NEGATIVE slim each draw bit for bit the CPU's picture",
      bitFor("slim") && bitFor("jaw") && bitFor("chin") && bitFor("eyeScale") && bitFor("negative"),
      r && { slim: r.slim, jaw: r.jaw, chin: r.chin, eyeScale: r.eyeScale, negative: r.negative });
    report("C14d) …and all eight at once — 37 kernels over one pixel — differs on 2 channels of 196,608",
      !!r && r.allEight && r.allEight.gate === true && r.allEight.maxd <= 1 && r.allEight.diff <= 20,
      r && r.allEight);
    report("C14e) …under a full retouch it adds nothing of its own: the same recipe with the sliders at zero differs by the same amount",
      !!r && r.overSkin && r.skinAlone && r.overSkin.gate === true &&
      r.overSkin.maxd <= r.skinAlone.maxd && r.overSkin.diff <= r.skinAlone.diff + 60,
      r && { withReshape: r.overSkin, sameRecipeWithout: r.skinAlone });
    report("C14f) …and over a Vibe Glow, which hands the pass an uploaded canvas instead of a rendered texture",
      bitFor("overGlow"), r && r.overGlow);
    /* THE MIRROR GUARD — see the block's own comment. The frame arrives one way
       up from a canvas and the other way up from the off-screen target, and the
       first working version of this stage read one as the other. */
    report("C14j) …and with the face shoved into the corner, where the read rect is truncated and the CPU's clamp is what answers",
      !!r && r.edgeFace && r.edgeFace.gate === true && r.edgeFace.maxd <= 1 && r.edgeFace.pct <= 0.05,
      r && { cmp: r.edgeFace, rect: r.edgeRect });
    report("C14g) the frame is not upside down — it sits far closer to the source row-for-row than mirrored",
      !!r && r.mirror && r.mirror.ratio >= 3, r && r.mirror);
    report("C14h) two reshaped faces are refused — one pass cannot warp pixels the first face already moved",
      !!r && r.twoFacePlan === false && r.twoFaceRefused === true,
      r && { plan: r.twoFacePlan, renderRefused: r.twoFaceRefused });
    report("C14i) withdrawing stage (6c-) takes the reshape and nothing else",
      !!r && r.gateOn === true && r.gateOffRefusesWarp === false &&
      r.renderOffRefuses === true && r.gateOffKeepsSkin === true,
      r && { on: r.gateOn, offRefusesWarp: r.gateOffRefusesWarp,
             offRenderNull: r.renderOffRefuses, offStillAcceptsSmoothing: r.gateOffKeepsSkin });
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

  /* v6.59.0 — what the two stages this wave added are worth, measured on a
     SwiftShader software rasteriser with the tonal half held still the way a
     slider drag holds it:

                                                        512x768      896x1344
       freq-sep low 70 + high 45                        2.23x          2.54x
       teeth 70                                         1.60x          1.92x
       grade + smooth + even + white + freq + teeth +
         sharpen — a retoucher's actual frame           1.61x          2.09x

     THOSE ARE ONE MACHINE'S NUMBERS. The CI runner measured the first row at
     0.66x — a fast CPU against a slow software rasteriser — and it is just as
     real. That is why D2 below does not assert a speedup. */
  /* v6.59.0 — AND THIS IS WHERE THE FIRST VERSION OF THIS CHECK WAS WRONG.
     It asserted "the GPU is faster", full stop. It is faster on the container
     this was written in (2.23x at 512x768) and SLOWER on the CI runner (0.66x:
     CPU 29ms, GPU 44ms) — because that runner has a fast CPU and a software
     rasteriser, so the JS pipeline wins. Both numbers are true; neither is a
     property of the code. 6.58.0 learned exactly this about Vibe Glow and I
     wrote the lesson down without applying it here: a bare slider with every
     other control at zero is the case where the CPU has almost nothing to do.

     What IS a property of the code, and what a student actually depends on, is
     that a machine where this does not pay TAKES IT BACK. So: win, or the rule
     that withdraws it fires on the frame that lost. Never neither. */
  report("D2) stage (4b) either beats the CPU on this machine, or the rule that withdraws it fires on the frame that did not",
    !!results.fsSpeed && (results.fsSpeed.x > 1 || results.fsSpeed.withdrawnIfSlower === true),
    results.fsSpeed);
  if (results.fsSpeed) {
    console.log("      stage (4b) at " + results.fsSpeed.W + "x" + results.fsSpeed.H +
      " — CPU " + results.fsSpeed.cpuMs + "ms, GPU " + results.fsSpeed.gpuMs +
      "ms (" + results.fsSpeed.x + "x)" +
      (results.fsSpeed.x > 1 ? "" : " — withdrawn: " + results.fsSpeed.withdrawnIfSlower));
  }

  /* v6.60.0 — D3) STAGE (6c-) AND THE MACHINE IT IS MEASURED ON.

     This one is different from every stage before it, and the difference is
     worth writing down rather than hiding behind a pass.

     A reshape is the heaviest thing the CPU pipeline does — up to 37 kernels
     evaluated per pixel of the face box — and on real graphics hardware a
     fragment shader eats that. On a SOFTWARE rasteriser there is no hardware
     to eat it with: SwiftShader runs the same arithmetic on the same CPU, and
     then charges for a second pass on top. Measured here, incremental cost of
     the reshape alone, CPU against GPU:

         512x768   3 sliders    10ms   ->   35ms
         512x768   8 sliders    33ms   ->   60ms
         896x1344  8 sliders    75ms   ->  177ms

     So on this container the stage LOSES, and D3 below takes the withdraw
     branch every time. That is not the check being lenient — it is the check
     recording what the product does about it, which is to time the frame and
     take the stage back after two losses. The off-screen target exists for the
     same reason: it removed the readback, which was the one part of the cost
     that was pure waste on every device.

     What is NOT claimed: that this wins somewhere. Nothing available here has
     a GPU, so nothing here can show it. What IS claimed, and checked: the
     picture is the CPU's picture (C14), and a machine where the round trip
     does not pay stops paying it. */
  report("D3) stage (6c-) either beats the CPU on this machine, or the rule that withdraws it fires on the frame that did not",
    !!results.warpSpeed && (results.warpSpeed.x > 1 || results.warpSpeed.withdrawnIfSlower === true),
    results.warpSpeed);
  if (results.warpSpeed) {
    console.log("      stage (6c-) at " + results.warpSpeed.W + "x" + results.warpSpeed.H +
      ", " + results.warpSpeed.kernels + " kernels — CPU " + results.warpSpeed.cpuMs +
      "ms, GPU " + results.warpSpeed.gpuMs + "ms (" + results.warpSpeed.x + "x)" +
      (results.warpSpeed.x > 1 ? "" : " — withdrawn: " + results.warpSpeed.withdrawnIfSlower));
  }

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
