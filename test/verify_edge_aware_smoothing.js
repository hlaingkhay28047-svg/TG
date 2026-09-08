/* v6.36.0 / panel 6.105.0 — THE SKIN SMOOTHING FOLLOWS THE EDGES.

   THE DEFECT, found by reading stApplySkin: Smoothing blended a Gaussian in only where
   |luma - luma(gaussian)| <= 30. That test is a cliff — 29 takes the full smoothing, 31
   takes none, so every soft edge in a portrait grew a band where the two answers meet —
   and it asks the wrong question, because a blemish IS a patch that differs from its
   surroundings. The gate read every blemish as an edge and protected it, while the flat
   skin that needed nothing got smoothed.

   This file EXECUTES the replacement in the browser, on images whose right answer is known
   by construction, rather than reading the source and hoping.

   The other half of the original item — face parsing (skin / hair / background) — is
   deliberately absent, and the owner agreed to leave it out (2026-09-08). Measuring it is
   what settled it: hair cannot be separated from skin by colour (a blonde head sits inside
   the skin chroma window), and geometry cannot stand in, because stSkinMask claims
   dark-brown hair as skin while rejecting grey — so the head box is the whole head for one
   student and only the face for the next. That is the case the plan reserved for "a face
   parsing model, if one can be obtained". Hair Gloss and Hair Depth keep the rule they
   have, rather than gaining one that works for two hair colours and silently does nothing
   for a third.

   A) the guided filter is present and answers with the right shape
   B) it keeps a hard edge that a Gaussian of the same radius destroys — measured, both printed
   C) it removes the noise a Gaussian removes (it is a smoother, not a no-op)
   D) it is well-formed everywhere: bounded, no NaN, and it converges to the input as eps -> 0
   E) the same photograph smoothed by the same amount at two frame sizes — the isolated form
      of what sweep_v471 caught end to end, where a fixed 4-pixel decimation made a phone's
      preview 1.38x stronger than the file the student would receive
   F) the sources say the same thing, including the worker's function list, which is the one
      that fails silently: a missing name there throws inside the worker and quietly drops
      every render onto the synchronous path
   G) CI runs this test

   THE THRESHOLDS BELOW ARE MEASURED, NOT GUESSED. The same implementation was run
   standalone before this file was written, on the same 128x128 step at radius 6:

       Smoothing   eps        edge kept: guided / gaussian    flat grain removed
          25       0.00202          98.2%  /  51.0%                  90.2%
          50       0.00490          96.0%  /  51.0%                  97.2%
         100       0.01440          89.9%  /  51.0%                  99.2%

   and with eps at zero the filter returns the photograph exactly (max per-pixel
   delta 0). The bars here sit below the worst of those with room for the browser's
   own blur to differ from the reference. Timing at a real 1280x854 preview buffer:
   75-86 ms on the decimated guide against 327-426 ms without it, which is why the
   fast variant is the one that ships — a live drag cannot afford the textbook one.

   (Those figures were re-measured after the frame-relative fix below. The first
   cut decimated by a fixed four pixels and read 97.6 / 94.6 / 86.4 on the same
   step: it kept LESS of the edge, because on a 128px frame four pixels is a
   large part of the picture and its guide could no longer see the edge.) */
"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8931;
const APP = "http://127.0.0.1:" + PORT + "/index.html";
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    } catch (e) {}
  });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);

  const R = await page.evaluate(() => {
    const out = {};
    out.have = {
      guided: typeof stGuidedRGB === "function",
      box: typeof stBoxF32 === "function",
    };
    if (!out.have.guided || !out.have.box) return out;

    /* deterministic noise so a re-run cannot flip a threshold */
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    function mk(W, H, fn) {
      const d = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4, c = fn(x, y);
        d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
      }
      return d;
    }
    /* the same Gaussian the control used before, so B compares like with like */
    function gauss(data, W, H, r) {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true });
      const im = new ImageData(new Uint8ClampedArray(data), W, H);
      x.putImageData(im, 0, 0);
      const c2 = document.createElement("canvas"); c2.width = W; c2.height = H;
      const x2 = c2.getContext("2d", { willReadFrequently: true });
      x2.filter = "blur(" + r + "px)"; x2.drawImage(c, 0, 0);
      return x2.getImageData(0, 0, W, H).data;
    }
    const lum = (d, p) => 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    function bandMean(d, W, x0, x1, y0, y1) {
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum(d, (y * W + x) * 4); n++; }
      return s / n;
    }
    function bandVar(d, W, x0, x1, y0, y1) {
      const m = bandMean(d, W, x0, x1, y0, y1);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const v = lum(d, (y * W + x) * 4) - m; s += v * v; n++; }
      return s / n;
    }

    /* ---- B) a hard vertical step with fine grain on both sides ---- */
    const W = 128, H = 128, RAD = 6, EPS = Math.pow(0.02 + 1.0 * 0.10, 2);   /* the slider at 100 */
    const step = mk(W, H, (x) => {
      const base = x < 64 ? 70 : 200;
      const n = (rnd() - 0.5) * 10;
      return [base + n, base + n, base + n];
    });
    const gStep = stGuidedRGB(step, W, H, RAD, EPS);
    const bStep = gauss(step, W, H, RAD);
    const inStep = bandMean(step, W, 72, 120, 8, 120) - bandMean(step, W, 8, 56, 8, 120);
    const gd = bandMean(gStep, W, 72, 120, 8, 120) - bandMean(gStep, W, 8, 56, 8, 120);
    const bd = bandMean(bStep, W, 72, 120, 8, 120) - bandMean(bStep, W, 8, 56, 8, 120);
    /* the edge itself: how much of the step survives right at the boundary */
    const inEdge = bandMean(step, W, 66, 70, 8, 120) - bandMean(step, W, 58, 62, 8, 120);
    const gEdge = bandMean(gStep, W, 66, 70, 8, 120) - bandMean(gStep, W, 58, 62, 8, 120);
    const bEdge = bandMean(bStep, W, 66, 70, 8, 120) - bandMean(bStep, W, 58, 62, 8, 120);
    out.edge = {
      plateau: { input: +inStep.toFixed(1), guided: +gd.toFixed(1), gaussian: +bd.toFixed(1) },
      atEdge: { input: +inEdge.toFixed(1), guided: +gEdge.toFixed(1), gaussian: +bEdge.toFixed(1) },
      guidedKeptPct: +(100 * gEdge / inEdge).toFixed(1),
      gaussianKeptPct: +(100 * bEdge / inEdge).toFixed(1),
    };

    /* ---- C) a flat patch of grain: it must actually smooth ---- */
    const flat = mk(W, H, () => { const n = (rnd() - 0.5) * 26; return [140 + n, 132 + n, 126 + n]; });
    const gFlat = stGuidedRGB(flat, W, H, RAD, EPS);
    out.flat = {
      inVar: +bandVar(flat, W, 8, 120, 8, 120).toFixed(2),
      outVar: +bandVar(gFlat, W, 8, 120, 8, 120).toFixed(2),
    };
    out.flat.dropPct = +(100 * (1 - out.flat.outVar / out.flat.inVar)).toFixed(1);

    /* ---- D) well-formed, and eps -> 0 returns the picture ---- */
    let bad = 0, maxDelta = 0;
    for (let i = 0; i < gStep.length; i++) {
      const v = gStep[i];
      if (!(v >= 0 && v <= 255)) bad++;
    }
    const gTiny = stGuidedRGB(step, W, H, RAD, 1e-8);
    for (let i = 0; i < step.length; i += 4) {
      const d0 = Math.abs(gTiny[i] - step[i]);
      if (d0 > maxDelta) maxDelta = d0;
    }
    out.form = { outOfRange: bad, epsZeroMaxDelta: maxDelta, alpha: gStep[3] };

    /* ---- E) the filter is defined in FRAMES, not in pixels ----
       The first cut of this decimated its guide by a fixed 4 pixels, and
       sweep_v471 caught what that does end to end: a phone's 896px preview
       came out 1.38x more smoothed than the file the student receives, because
       4 pixels of a small buffer swallow far more of the picture than 4 pixels
       of a delivery. Here the same defect is isolated from the pipeline. The
       picture is a ripple whose PERIOD IS A FRACTION OF THE FRAME (W/16) — so
       the small frame and the large frame show the same photograph, one just
       sampled more finely — and the radius is the same fraction of each frame,
       which is exactly what rs does in the app. Nothing is resampled, so the
       only thing that can move the answer is the filter itself. */
    const amp = (Wp) => {
      const img = mk(Wp, Wp, (x) => { const v = 128 + 40 * Math.sin(2 * Math.PI * x / (Wp / 16)); return [v, v, v]; });
      const g = stGuidedRGB(img, Wp, Wp, Wp / 40, EPS);
      const q = Math.round(Wp / 8);
      return Math.sqrt(bandVar(g, Wp, q, Wp - q, q, Wp - q) / bandVar(img, Wp, q, Wp - q, q, Wp - q));
    };
    const small = amp(192), large = amp(768);
    out.scale = {
      keptSmall: +(100 * small).toFixed(1), keptLarge: +(100 * large).toFixed(1),
      ratio: +(small / large).toFixed(3)
    };

    return out;
  });

  report("A) the guided filter and its Float32 box blur exist in the app",
    !!(R.have && R.have.guided && R.have.box), R.have);

  if (R.have && R.have.guided) {
    /* A Gaussian cannot tell an edge from a blemish; that is the whole reason the old
       code needed a threshold in front of it. The guided filter needs none. */
    report("B) a hard edge survives the guided filter and does NOT survive the Gaussian it replaces"
      + "  [kept at the edge: guided " + R.edge.guidedKeptPct + "%, gaussian " + R.edge.gaussianKeptPct + "%]",
      R.edge.guidedKeptPct >= 80 && R.edge.gaussianKeptPct <= 60 &&
      R.edge.guidedKeptPct - R.edge.gaussianKeptPct >= 20, R.edge);
    report("B2) the flat sides of that edge keep their own levels — the filter moved the grain, not the picture",
      Math.abs(R.edge.plateau.guided - R.edge.plateau.input) <= 6, R.edge.plateau);
    report("C) on flat skin it really is a smoother: the grain drops by "
      + R.flat.dropPct + "%", R.flat.dropPct >= 45, R.flat);
    report("D) every output byte is in range, the alpha is opaque, and with eps at zero the filter returns the photograph",
      R.form.outOfRange === 0 && R.form.alpha === 255 && R.form.epsZeroMaxDelta <= 2, R.form);
    report("E) the same photograph at 192px and at 768px is smoothed by the same amount"
      + "  [kept: " + R.scale.keptSmall + "% at 192, " + R.scale.keptLarge + "% at 768]",
      Math.abs(R.scale.ratio - 1) <= 0.08, R.scale);
  } else {
    report("B) a hard edge survives the guided filter", false, "stGuidedRGB missing");
  }

  report("F0) the page raised no errors while all of that ran", errs.length === 0, errs.slice(0, 3));

  /* ---- F) the sources ---- */
  const APPSRC = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
  report("F) the Smoothing control calls the guided filter with an eps the slider moves, and the old Gaussian call is gone",
    /var blurS = t2\.smooth>0\n\s*\? stGuidedRGB\(d,W,H,Math\.max\(2,\(2\+t2\.smooth\/100\*4\)\*rs\),\n\s*Math\.pow\(0\.02\+t2\.smooth\/100\*0\.10,2\)\)\n\s*: null;/.test(APPSRC) &&
    !/blurS = t2\.smooth>0 \? stBlurData/.test(APPSRC), null);
  /* F1 and F1b are the source half of E — they name the two things that made the
     phone preview smooth 1.38x harder than the delivery, so neither can come back
     as a tidy-up. The radius reaches the filter unrounded because it is spent in
     decimated cells, where it is close to 1 and a whole-pixel rounding is a fifth
     of the effect. */
  report("F1) the guided filter's grid is a fraction of the frame, never a fixed count of pixels",
    /var S=Math\.max\(1,Math\.max\(W,H\)\/320\);/.test(APPSRC) &&
    /var sr=Math\.max\(0\.5,r\/S\);/.test(APPSRC) &&
    !/\bvar S=4;/.test(APPSRC), null);
  report("F1b) the box mean carries a fractional radius, so that grid radius is not rounded either",
    /var k=Math\.floor\(r\), f=r-k, span=2\*k\+1\+2\*f;/.test(APPSRC), null);
  report("F2) the luma cliff is gone from the blend — no |pixel - result| <= 30 gate in front of the smoothing",
    !/var dl=Math\.abs\(lum-\(0\.299\*blurS\[p\]/.test(APPSRC) &&
    !/dl<=30/.test(APPSRC), null);
  /* The worker IS this array — a name missing here is a ReferenceError inside the
     worker, which kills it and drops every render silently onto the sync path. */
  report("F4) the worker is built with the two new functions in its source list",
    /var fns=\[stClamp,stComputeLut,stBoxBlurMask,stBoxF32,stGuidedRGB,stSkinWindow,stSkinMask,stBlurData,/.test(APPSRC), null);
  report("F5) the guided filter touches no canvas, so the worker keeps it on a browser without ctx.filter",
    (() => {
      const i = APPSRC.indexOf("function stGuidedRGB(");
      const j = APPSRC.indexOf("function stBlurData(", i);
      const body = APPSRC.slice(i, j);
      return i > 0 && j > i && !/document\.|createElement|getContext/.test(body);
    })(), null);

  const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("G) CI runs this test", CI.includes("node test/verify_edge_aware_smoothing.js"), null);

  await browser.close();
  console.log(failures ? "\nFAIL (" + failures + ")"
    : "\nPASS — the smoothing is edge-aware, proven by running it against the Gaussian it replaces");
  process.exit(failures ? 1 : 0);
})();
