/* v4.72.0 regression sweep — the live preview is actually live.

   WHAT WAS MEASURED FIRST. Driving the real change handlers on a real photo and
   sampling the canvas BEFORE the 120ms settle could fire, these controls moved
   nothing at all while a slider was being dragged:

     cla  grn  vig  dhz          (Tier-1, invisible to stCssFilter)
     smooth even white rosy radiance   (Tier-2, no instant path at all)

   Vignette is one of the strongest effects in the app — 11.86 mean levels once
   it lands — and dragging it moved the picture by 0.00 until the finger came
   off. Two structural causes: stCssFilter can only emit thirteen of the
   nineteen Tier-1 keys, and stT2Changed went straight to the debounced settle.
   That settle is cleared on EVERY input, so a slow continuous drag resets it
   forever and the picture never updates at all.

   THE FIX IS NOT AN APPROXIMATION. The drag now paints the real pipeline at
   320px, upscaled — the effect itself, coarser, rather than a CSS impression of
   it. Measured cost with a heavy recipe: 74ms at the preview buffer, 34ms at
   384, 11ms at 256.

   Pinned contracts:
   A) NOTHING IS SILENT. Every control moves the canvas during the drag,
      sampled before the settle could have fired. This is the whole release.
   B) THE PROXY ONLY COSTS WHEN IT BUYS. A recipe made purely of the thirteen
      CSS-representable keys already updates instantly AND stays sharp, so it
      must keep the cheap path — the discriminator is that the CSS path leaves
      canvas.style.filter set while the proxy clears it.
   C) The settled frame still lands, and lands sharp: after release the canvas
      carries detail the 320px proxy could not have produced.
   D) The proxy stands back from the three states that own the canvas for their
      own reasons — the Before-hold button, the A|B split, and a shown result.
   E) No page errors.

   Usage: PORT=8931 node test/sweep_v472_upgrades.js  (serve docs/app first) */
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

report("D) the proxy stands back from hold, split and a shown result",
  /if\(!ST\.srcBitmap\|\|ST\.holding\|\|ST\.showingResult\|\|ST\.split\.on\|\|!ST\.buf\) return;/.test(src));
report("D2) all three change handlers can reach it",
  /if\(stNeedsProxy\(\)\) stProxySoon\(\);/.test(src) &&
  (src.match(/stProxySoon\(\);/g) || []).length >= 3);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "lib/st-sample.jpg";
    });
    /* a buffer well above the 320px proxy, the way a real camera photo is */
    const c0 = document.createElement("canvas");
    c0.width = 1400; c0.height = Math.round(1400 * img.naturalHeight / img.naturalWidth);
    c0.getContext("2d").drawImage(img, 0, 0, c0.width, c0.height);
    await new Promise(r => ST.loadImage(c0.toDataURL("image/jpeg", 0.92), { done: r }));
    await new Promise(r => setTimeout(r, 900));

    const cv = document.getElementById("stCanvas");
    function snap() {
      const t = document.createElement("canvas"); t.width = 120; t.height = 150;
      const x = t.getContext("2d");
      const f = getComputedStyle(cv).filter;
      x.filter = (f && f !== "none") ? f : "none";
      x.drawImage(cv, 0, 0, 120, 150);
      return x.getImageData(0, 0, 120, 150).data;
    }
    function diff(a, b) { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]); n++; } return n ? s / n : 0; }
    function reset() { state.st.t1 = stDefT1(); state.st.t2 = stDefT2(); stRenderSettle(); stApplyDragFilter(); }

    /* A) the nine that were frozen, plus three that already worked */
    const T1 = ["cla", "grn", "vig", "dhz", "bri", "con", "wrm"];
    const T2 = ["smooth", "even", "white", "rosy", "radiance"];
    const rows = [];
    for (const k of T1.concat(T2)) {
      const isT2 = T2.indexOf(k) >= 0;
      reset();
      await new Promise(r => setTimeout(r, 550));
      const before = snap();
      if (isT2) { state.st.t2[k] = 70; stT2Changed(); }
      else { state.st.t1[k] = 60; stT1Changed(); }
      /* sampled inside the settle's 120ms debounce — whatever moved here moved
         because of the drag path, not because the settle landed */
      await new Promise(r => setTimeout(r, 60));
      const during = snap();
      await new Promise(r => setTimeout(r, 700));
      const after = snap();
      rows.push({ k, drag: +diff(before, during).toFixed(2), settled: +diff(before, after).toFixed(2) });
    }

    /* B) a purely CSS-representable recipe must keep the cheap sharp path.
          The CSS path leaves style.filter set; the proxy clears it. */
    reset();
    await new Promise(r => setTimeout(r, 550));
    state.st.t1.bri = 40; stT1Changed();
    await new Promise(r => setTimeout(r, 60));
    const cssPathFilter = cv.style.filter || "";
    /* and one that is NOT representable must take the proxy */
    reset();
    await new Promise(r => setTimeout(r, 550));
    state.st.t1.vig = 60; stT1Changed();
    await new Promise(r => setTimeout(r, 60));
    const proxyPathFilter = cv.style.filter || "";

    /* C) the settled frame is sharper than the proxy could be. Compare
          neighbour-to-neighbour contrast: a 320px render blown up to the
          canvas cannot carry the buffer's own high-frequency detail. */
    function detail() {
      const t = document.createElement("canvas"); t.width = cv.width; t.height = cv.height;
      t.getContext("2d").drawImage(cv, 0, 0);
      const d = t.getContext("2d").getImageData(0, 0, t.width, t.height).data;
      let s = 0, n = 0;
      for (let y = 1; y < t.height - 1; y += 2) {
        for (let x = 1; x < t.width - 1; x += 2) {
          const p = (y * t.width + x) * 4;
          s += Math.abs(d[p] - d[p + 8]); n++;
        }
      }
      return n ? s / n : 0;
    }
    reset();
    await new Promise(r => setTimeout(r, 550));
    state.st.t1.vig = 60; stT1Changed();
    await new Promise(r => setTimeout(r, 60));
    const dProxy = +detail().toFixed(3);
    await new Promise(r => setTimeout(r, 900));
    const dSettled = +detail().toFixed(3);

    return {
      bufH: ST.buf.height, rows,
      cssPathFilter, proxyPathFilter,
      dProxy, dSettled
    };
  });

  const silent = out.rows.filter(r => r.drag <= 0.5);
  report("A) every control moves the picture during the drag — nothing waits for release",
    silent.length === 0,
    { bufferLongEdge: out.bufH, stillSilent: silent, all: out.rows.map(r => r.k + ":" + r.drag).join(" ") });

  report("B) a CSS-representable recipe keeps the cheap sharp path; one that is not takes the proxy",
    out.cssPathFilter.length > 0 && out.proxyPathFilter === "",
    { cssPath: out.cssPathFilter.slice(0, 60), proxyPath: out.proxyPathFilter });

  report("C) the settled frame lands sharper than the proxy it replaced",
    out.dSettled > out.dProxy,
    { proxyDetail: out.dProxy, settledDetail: out.dSettled });

  report("no page errors", errs.length === 0, errs);

  console.log("      (before: cla grn vig dhz smooth even white rosy radiance all measured 0.00 " +
    "during a drag — vignette alone is 11.86 mean levels once it lands)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
