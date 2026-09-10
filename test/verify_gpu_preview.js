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
    try { return !!(typeof stGpuBoot === "function" && stGpuBoot()); } catch (e) { return "throw:" + e; }
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
    "skin: smooth + sharpen, which binds over two of the plane units":
      { t1: { shp: 50, cla: 30 }, t2: { smooth: 50 },
        bar: { maxd: 2, pct: 0.1, mean: 0.002 } },
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
      const t2 = Object.assign(zeroT2(), r.t2 || {});
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

    /* the gate must refuse every stage the shader does not implement */
    const refusals = {};
    const mk = () => ({ t1: zeroT1(), t2: zeroT2(), pv: basePv() });
    let a;
    a = mk(); a.t1.bgb = 30; refusals["background blur (6)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.glow = 30; refusals["vibe glow (6b)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.freqHi = 40; refusals["frequency separation (4)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.teeth = 40; refusals["teeth whitening (4)"] = stGpuCan(a.t1, a.t2, a.pv, null);
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
      const handed = ST_GPU.t4lum ? Uint8Array.from(ST_GPU.t4lum) : null;
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

    const wasOff = ST_GPU.s5off;
    ST_GPU.s5off = true;
    a = mk(); a.t2.freqHi = 40; const refusesFreq = stGpuCan(a.t1, a.t2, a.pv, null) === false;
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

    return { out, refusals, accepts, acceptsVig, acceptsGrn, acceptsShp, acceptsCla,
      refusesShpWhenSpent, refusesClaWhenSpent, stillAcceptsTonalWhenSpent, spent,
      maskFrac: +maskFrac.toFixed(4), refusesFreq, acceptsWhite, acceptsEven, acceptsSmooth,
      refusesWhiteWhenT4Spent, refusesEvenWhenT4Spent, refusesSmoothWhenT4Spent,
      stillAcceptsTonalWhenT4Spent, maskProvenance, planeReuse };
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
  report("C5) stage (4) is accepted — Even and Smoothing included — and what it does not implement is still refused",
    results.acceptsWhite === true && results.acceptsEven === true &&
    results.acceptsSmooth === true && results.refusesFreq,
    { white: results.acceptsWhite, even: results.acceptsEven, smooth: results.acceptsSmooth,
      freqSeparationRefused: results.refusesFreq });
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
  report("C4) and the rule that withdraws it compares against what the CPU costs here",
    Object.keys(results.spent).every(k => results.spent[k] === true), results.spent);

  /* ---- D) it is actually faster, which is the whole point ---- */
  const heavy = results.out["everything at once"];
  report("D) the shader is not slower than the CPU on the full recipe",
    !!heavy && heavy.gpuMs <= heavy.cpuMs,
    heavy ? { cpuMs: heavy.cpuMs.toFixed(2), gpuMs: heavy.gpuMs.toFixed(2) } : null);

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
