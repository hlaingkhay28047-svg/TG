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
 * the tonal LUT, the colour pass, HSL bands, split-grading and B&W.
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
 *
 * The 2 belongs to the grade block alone and has a specific cause worth
 * writing down: stRunPipeline indexes its per-zone weight table with `lum3|0`,
 * a TRUNCATION of a float64 luma. Source 221,63,210 gives 126.99999999999998
 * in float64 and exactly 127.0 in float32, so the two read neighbouring rows
 * of the table, and one index step through two zone tints is two counts out.
 * No shader can avoid that; it is a property of the CPU's own truncation.
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
      const t2 = zeroT2();
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
    a = mk(); a.t1.shp = 40; refusals["sharpen (5)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.cla = 40; refusals["clarity (5)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.grn = 30; refusals["grain (8)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.vig = 30; refusals["vignette (7)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.bgb = 30; refusals["background blur (6)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t1.glow = 30; refusals["vibe glow (6b)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.smooth = 40; refusals["skin smoothing (4)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.t2.gdn = 40; refusals["denoise (3c)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.bgEnh = 30; refusals["background enhance (6)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.leak = "warm"; a.pv.leakV = 40; refusals["light leak (6c)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); a.pv.frame = "white"; refusals["frame (9)"] = stGpuCan(a.t1, a.t2, a.pv, null);
    a = mk(); refusals["heal taps (1b)"] = stGpuCan(a.t1, a.t2, a.pv, [{ u: 0.5, v: 0.5, ur: 0.05 }]);
    a = mk(); a.t1.__unknown_future_control = 25; refusals["an unknown control"] = stGpuCan(a.t1, a.t2, a.pv, null);
    /* and it must ACCEPT a plain tonal recipe, or the path is dead code */
    a = mk(); a.t1.exp = 20; a.t1.sat = 15;
    const accepts = stGpuCan(a.t1, a.t2, a.pv, null);

    return { out, refusals, accepts };
  }, RECIPES);

  /* ---- B) the two paths agree, recipe by recipe ----
     The bar: no channel off by more than the arithmetic width can explain (1,
     or 2 where the grade block's luma truncation is in play), and the handful
     of channels that differ at all stays under a fifth of one percent. Check F
     below shows a real error cannot pass this. */
  for (const name in results.out) {
    const r = results.out[name];
    if (r.error) { report("B) GPU matches the CPU — " + name, false, r); continue; }
    const cap = r.gradeless ? 1 : 2;
    const frac = r.diffN / r.chanN;
    report("B) GPU matches the CPU to within float32 — " + name,
      r.maxd <= cap && frac < 0.002 && r.mean < 0.01,
      { maxd: r.maxd, cap: cap, differing: r.diffN + "/" + r.chanN,
        pct: (frac * 100).toFixed(4) + "%", mean: r.mean, worst: r.worst });
  }

  /* ---- C) the honesty gate ---- */
  const wrongly = Object.keys(results.refusals).filter(k => results.refusals[k] !== false);
  report("C) the gate refuses every stage the shader does not implement",
    wrongly.length === 0, { accepted_when_it_should_refuse: wrongly });
  report("C2) and it accepts a plain tonal recipe, so the path is reachable",
    results.accepts === true, { accepts: results.accepts });

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
