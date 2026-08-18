/* v4.71.0 regression sweep — the phone's live preview tells the truth.

   WHAT THE OWNER REPORTED: "live preview ကပြတာမမှန်ဘူး" — what the live
   preview shows is not what comes out.

   THEY WERE RIGHT, AND v4.55 IS WHY. v4.55 made every blur/glow/denoise radius
   scale with the render size so a full-resolution export would stop coming out
   weaker than the preview the studio had approved. It wrote that scale as

       RS = Math.max(1, max(W,H) / 1280)

   and the floor was there to protect the 76x96 grade swatches, whose radii
   would otherwise shrink to a few percent and erase the look they exist to
   show. But stBufMax() is 1280 on desktop and 896 ON A PHONE — so the phone's
   own preview buffer was caught by that same floor. It rendered radii tuned
   for 1280 onto an 896 frame, where they cover 43% more of the picture.

   Measured through the real pipeline on a 3000px source, preview strength
   against delivered strength, before the fix:

       denoise  2.17x      smoothing 1.34x
       sharpen  1.76x      grain     1.33x
       clarity  1.48x

   Desktop measured 1.00x on every one of them, which is exactly why this
   survived: the defect was invisible on the machine it was developed on and
   lived only on the device every one of these studios actually uses.

   DELETING THE FLOOR WAS THE WRONG FIX, and this suite caught that too: it
   took three other suites red, because a sub-1280 render then had its radii
   scaled below a pixel and the effect vanished outright. The floor was never
   the bug. The default is unchanged from v4.55; what changed is that the
   PREVIEW — the one render deliberately not at its delivery size — now says so
   through stPreviewRS, which hands it the delivery's scale reduced by exactly
   how much smaller the buffer is. The swatches pass opts.rs for the opposite
   reason: a swatch exists to SHOW a look, not to predict a file.

   Pinned contracts:
   A) THE PHONE PREVIEW MATCHES THE DELIVERED FILE. For each radius-based
      control, render the same photo at the phone buffer size and at full
      delivery size, normalise both to a common size, and measure each one's
      strength against its own un-graded baseline. The two must agree.
   B) THE DESKTOP PREVIEW DID NOT MOVE. At exactly 1280 the ratio is 1 by
      construction, so this fix must be a no-op there — anything else means
      desktop previews silently changed under a phone fix.
   C) The default keeps v4.55's floor, and both the settle path and the render
      worker carry the preview scale.
   D) The swatch opt-out exists and the grade cards use it, or every grade
      swatch quietly loses two thirds of its strength when it gains pixels.
   E) The grade swatch row scales with devicePixelRatio like the two look
      shelves v4.70 fixed — it was the third row and it was missed.

   Usage: PORT=8931 node test/sweep_v471_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

/* The default keeps v4.55's floor on purpose — deleting it made every
   sub-1280 render lose its effect outright and took three suites red. What
   changed is that the PREVIEW, the one render that is deliberately not its own
   delivery size, now says so. */
report("C) the default still carries v4.55's floor, and an explicit opts.rs can override it",
  /var RS = \(typeof opts\.rs === "number" && opts\.rs > 0\) \? opts\.rs : Math\.max\(1, Math\.max\(W,H\)\/1280\);/.test(src));

report("C2) the settle path and the render worker both carry the preview scale",
  /stRunPipeline\(stGeoSource\(\),W,H,\{maskInfo:ST\.maskCache,rs:stPreviewRS\(W,H\),lm:ST\.faceLM\|\|null\}\)/.test(src) &&
  /rs:stPreviewRS\(W,H\), t1:stEffT1\(\)/.test(src) &&
  /stRunPipeline\(m\.bmp,m\.W,m\.H,\{rs:m\.rs,/.test(src));

report("D) the swatch opt-out exists and the grade cards pass it",
  /stRunPipeline\(ST\.thumbCanvas,GW,GH,\{rs:gdpr\}\)/.test(src));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async () => {
    /* A synthetic "camera original" big enough to be a real delivery. Content
       is irrelevant to how a radius scales; only the pixel dimensions are. */
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "lib/st-sample.jpg";
    });
    function bigSrc(long) {
      const ar = img.naturalWidth / img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = Math.round(long * ar); c.height = long;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c;
    }
    const SRC = bigSrc(3000);
    const NW = 300, NH = Math.round(300 * SRC.height / SRC.width);

    function norm(cv) {
      const c = document.createElement("canvas"); c.width = NW; c.height = NH;
      const x = c.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.drawImage(cv, 0, 0, NW, NH);
      return x.getImageData(0, 0, NW, NH).data;
    }
    function meanAbs(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]); n++; } return n ? s / n : 0; }

    const D1 = stDefT1(), D2 = stDefT2(), pv = stPipeVals();
    function mk(o, d) { const r = {}; for (const k in d) r[k] = d[k]; for (const k in (o || {})) r[k] = o[k]; return r; }

    /* Model the two REAL code paths, not the pipeline in the abstract:
         - a preview buffer goes through stPreviewRS, exactly as stRenderSettle
           and the render worker do;
         - the delivery passes no rs at all, exactly as stBake does.
       Calling stRunPipeline bare for both would test neither. stPreviewRS
       reads the delivery size off stExportSource(), so the harness hands the
       app its 3000px source first — the same thing loading a photo does. */
    ST.srcBitmap = SRC; ST.fullBitmap = null;
    function render(long, t1, t2, isPreview) {
      const ar = SRC.width / SRC.height;
      const W = Math.round(long * ar), H = long;
      const o = { t1: t1, t2: t2, pv: pv, heals: [] };
      if (isPreview) o.rs = stPreviewRS(W, H);
      return norm(stRunPipeline(SRC, W, H, o));
    }

    /* the five controls that actually regressed — the pure-tonal ones never
       depended on resolution and would only slow this suite down */
    const CASES = [
      { k: "denoise", t2: { denoise: 70 } },
      { k: "shp", t1: { shp: 60 } },
      { k: "cla", t1: { cla: 60 } },
      { k: "smooth", t2: { smooth: 70 } },
      { k: "grn", t1: { grn: 60 } }
    ];
    /* phone and desktop are PREVIEW buffers; full is the delivery */
    const SIZES = { phone: [896, true], desktop: [1280, true], full: [3000, false] };
    const base = {};
    for (const tag in SIZES) base[tag] = render(SIZES[tag][0], mk({}, D1), mk({}, D2), SIZES[tag][1]);

    const rows = [];
    for (const c of CASES) {
      const t1 = mk(c.t1, D1), t2 = mk(c.t2, D2);
      const s = {};
      for (const tag in SIZES) s[tag] = meanAbs(render(SIZES[tag][0], t1, t2, SIZES[tag][1]), base[tag]);
      rows.push({
        k: c.k,
        phone: +s.phone.toFixed(3), desktop: +s.desktop.toFixed(3), full: +s.full.toFixed(3),
        phoneVsFull: s.full > 0.02 ? +(s.phone / s.full).toFixed(2) : null,
        deskVsFull: s.full > 0.02 ? +(s.desktop / s.full).toFixed(2) : null
      });
    }

    /* E) the grade swatch row.
       v4.96 split Studio into two real pages, #pgMeitu and #pgEvoto, and the
       grade cards are built by the Evoto host (evHost, inside #stEvCard) — so
       pgEvoto is the page this assertion is actually about. Hand-toggling .on
       the way this used to no longer shows anything: the shared #stCols block
       and the INACTIVE suite card both sit in #stDock, which is class="page"
       so `.page{display:none}` parks them, and only switchPage() runs
       stMountSuite() to move them into the live page. Reach the row the way a
       customer does or every tile in it measures 0x0. */
    switchPage("pgEvoto");
    await new Promise(r => setTimeout(r, 900));
    try { if (window.stRenderGradeCards) stRenderGradeCards(); } catch (e) { }
    await new Promise(r => setTimeout(r, 300));
    const host = document.getElementById("stGradeCards");
    /* The Evoto suite card is a stack of accordion groups and the grade row ships
       collapsed, so a rect taken straight away is 0x0 — the element is real,
       it simply has no layout box yet. Measuring that would repeat the mistake
       an earlier sweep in this repo made when it asserted 116 VISIBLE cards on
       a page that keeps its groups closed. Open the ancestors first, then
       measure what a customer would actually see. */
    let node = host;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("grp")) node.classList.add("open");
      if (node.tagName === "DETAILS") node.open = true;
      if (node.style && node.style.display === "none") node.style.display = "";
      node = node.parentElement;
    }
    await new Promise(r => setTimeout(r, 250));
    const gc = host ? host.querySelector(".pcard canvas") : null;
    const gr = gc ? gc.getBoundingClientRect() : null;
    const grade = {
      cards: host ? host.querySelectorAll(".pcard").length : 0,
      backing: gc ? gc.width + "x" + gc.height : null,
      cssBox: gr ? Math.round(gr.width) + "x" + Math.round(gr.height) : null,
      dpr: devicePixelRatio
    };
    return { bufMax: stBufMax(), rows, grade };
  });

  /* Tolerance. Both sides are resampled to a common 300px frame before being
     compared, and a 896->300 downscale is not the same filter as 3000->300, so
     a few percent of spread is the measurement, not the app. The defect this
     catches ran from 1.33 to 2.17, so 0.25 separates them with room to spare
     and still fails loudly on any real regression. */
  const TOL = 0.25;
  const bad = out.rows.filter(r => r.phoneVsFull === null || Math.abs(r.phoneVsFull - 1) > TOL);
  report("A) the phone preview applies every radius control at delivery strength",
    bad.length === 0,
    { bufMax: out.bufMax, offenders: bad, all: out.rows.map(r => r.k + ":" + r.phoneVsFull) });

  const deskBad = out.rows.filter(r => r.deskVsFull === null || Math.abs(r.deskVsFull - 1) > TOL);
  report("B) the desktop preview did not move — it was already correct",
    deskBad.length === 0,
    out.rows.map(r => r.k + ":" + r.deskVsFull));

  const g = out.grade;
  report("E) the grade swatch row is backed by device pixels, in an unchanged 76x96 box",
    g.cards > 0 && g.backing === (76 * Math.min(3, Math.round(g.dpr))) + "x" + (96 * Math.min(3, Math.round(g.dpr))) &&
    g.cssBox === "76x96",
    g);

  report("no page errors", errs.length === 0, errs);

  console.log("      (before the fix, measured on this same harness: denoise 2.17x, " +
    "sharpen 1.76x, clarity 1.48x, smoothing 1.34x, grain 1.33x — desktop 1.00x throughout)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
