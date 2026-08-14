/* v4.78.0 regression sweep — the export leaves the main thread, and the grain
   stops being random.

   WHAT WAS MEASURED. stBake() is synchronous, and on a heavy recipe it costs:

     3000x2000   render 3344ms   encode  281ms
     6000x4000   render 14155ms  encode 1082ms

   93% of that is the pipeline, and all of it froze the tab — no repaint, no
   spinner, and on iOS a block that long invites the watchdog. The pipeline has
   been worker-ready since v4.42, so the obvious move was to send the export to
   the worker. That was held back for one honest reason: nobody had proved the
   delivered file would be identical.

   IT WAS NOT, AND THE REASON WAS NOT THE WORKER. Rendering one photo both ways
   and bisecting control by control, 23 of the 24 came back bit-identical —
   every Tier-1 key, the whole Tier-2 skin family, the skin mask, the heals.
   Exactly one differed: GRAIN, at 89% of channels and up to 14 levels.
   stNoiseTile built its 256x256 tile with Math.random() and cached it per
   context — ST on the main thread, the function object inside the worker — so
   the two contexts always held different tiles. That was already live: a big
   photo previews on the worker and exported from the main thread, so the grain
   the studio approved was never the grain in the delivered file. Two random
   tiles of one amplitude look alike, which is why it was never reported.

   Seeding the tile (mulberry32, fixed seed) closes it, and with that the whole
   export moves across with a proof rather than a hope.

   Pinned contracts:
   A) The grain tile is deterministic — same bytes on every build, in both
      contexts. This is what makes B possible.
   B) THE DELIVERED FILE IS UNCHANGED. stBakeAsync returns byte-for-byte the
      same data URL as the synchronous stBake, on a recipe carrying every
      Tier-1 key, the Tier-2 skin family, heals and a curve.
   C) THE MAIN THREAD STAYS ALIVE. Frames are painted during the export.
      Measured: 188 animation frames during the worker export, 3 during the
      synchronous one.
   D) It degrades safely: with the worker killed, the export still returns a
      real image.
   E) An export reply does not disturb the live preview's coalescing state.

   Usage: PORT=8931 node test/sweep_v478_upgrades.js  (serve docs/app first) */
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
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");

report("A0) the noise tile is seeded, not Math.random()",
  /function stNoiseTile\(\)/.test(code) &&
  !/stNoiseTile[\s\S]{0,900}?Math\.random\(\)/.test(code) &&
  /seed=0x9E3779B9/.test(code),
  { stillRandom: /stNoiseTile[\s\S]{0,900}?Math\.random\(\)/.test(code) });

report("E0) export replies are separated from preview replies in the worker callback",
  /STW\.exp\[d\.id\]/.test(code) && /if\(!wasExport\)\{/.test(code) &&
  /exp:\{\}/.test(code));

report("A1) the sync export and the worker export share one encode tail",
  (code.match(/stBakeEncode\(/g) || []).length >= 3);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
    function photo(w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#e8c9a8"); g.addColorStop(1, "#3a2a22");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = "#d9a884";
      x.beginPath(); x.ellipse(w * 0.5, h * 0.42, w * 0.26, h * 0.3, 0, 0, Math.PI * 2); x.fill();
      for (let i = 0; i < 3000; i++) {
        x.fillStyle = "hsl(" + (i % 360) + ",45%," + (30 + (i % 45)) + "%)";
        x.fillRect((i * 131) % w, (i * 79) % h, 6, 6);
      }
      return c;
    }

    /* A) the tile is the same every time it is built */
    function tileHash() {
      ST.noise = null;
      const t = stNoiseTile();
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      c.getContext("2d").drawImage(t, 0, 0);
      const d = c.getContext("2d").getImageData(0, 0, 256, 256).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { h ^= d[i]; h = Math.imul(h, 16777619); }
      return h >>> 0;
    }
    const h1 = tileHash(), h2 = tileHash();

    await new Promise(r => ST.loadImage(photo(2200, 1500).toDataURL("image/jpeg", 0.94), { done: r }));
    await new Promise(r => setTimeout(r, 1200));
    state.st.t1 = Object.assign(stDefT1(), {
      bri: 10, con: 16, sat: 12, wrm: 8, shp: 55, cla: 50, grn: 30, vig: 40, bgb: 45, dhz: 35, hlt: -18, shd: 22
    });
    state.st.t2 = Object.assign(stDefT2(), {
      smooth: 65, even: 55, white: 45, rosy: 35, radiance: 50, deshine: 30, gloss: 25, freqLo: 30, finish: 1
    });
    ST.heals = [{ u: 0.44, v: 0.38, ur: 0.03 }, { u: 0.57, v: 0.46, ur: 0.025 }];
    stRenderSettle();
    await new Promise(r => setTimeout(r, 1500));

    /* B) identical bytes */
    const syncDU = stBake();
    const asyncDU = await stBakeAsync();

    /* C) frames painted during each */
    async function framesDuring(fn) {
      let ticks = 0, stop = false;
      (function t() { if (stop) return; ticks++; requestAnimationFrame(t); })();
      const t0 = performance.now();
      await fn();
      const ms = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 0));
      stop = true;
      return { ticks, ms };
    }
    const wk = await framesDuring(() => stBakeAsync());
    const sy = await framesDuring(async () => { stBake(); });

    /* E) an export must not clear a preview's busy/queued bookkeeping */
    STW.busy = true; STW.queued = true;
    await stBakeAsync();
    const preserved = STW.busy === true && STW.queued === true;
    STW.busy = false; STW.queued = false;

    /* D) worker gone → still exports */
    stWorkerKill();
    const fb = await stBakeAsync();

    return {
      tileStable: h1 === h2, tileHash: h1,
      bytesIdentical: syncDU === asyncDU, len: syncDU ? syncDU.length : 0,
      workerFrames: wk.ticks, workerMs: wk.ms,
      syncFrames: sy.ticks, syncMs: sy.ms,
      previewStatePreserved: preserved,
      fallbackOk: typeof fb === "string" && fb.indexOf("data:image/") === 0
    };
  });

  report("A) the grain tile is deterministic — rebuilding it gives the same bytes",
    out.tileStable === true, { hash: out.tileHash });

  report("B) the worker export delivers byte-for-byte the same file as the sync one",
    out.bytesIdentical === true, { bytes: out.len });

  /* The margin is wide on purpose: the point is "the thread breathes", not a
     specific frame count, which is machine-dependent. */
  report("C) the main thread keeps painting during the export",
    out.workerFrames >= 20 && out.workerFrames > out.syncFrames * 5,
    { workerFrames: out.workerFrames, workerMs: out.workerMs,
      syncFrames: out.syncFrames, syncMs: out.syncMs });

  report("E) an export reply leaves the live preview's coalescing state alone",
    out.previewStatePreserved === true);

  report("D) with the worker killed the export still returns a real image",
    out.fallbackOk === true);

  report("no page errors", errs.length === 0, errs);

  console.log("      (before: 6000x4000 heavy recipe = 14155ms render + 1082ms encode, " +
    "all of it a frozen tab; grain differed between preview and export on 89% of channels)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
