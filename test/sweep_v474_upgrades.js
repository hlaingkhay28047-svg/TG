/* v4.74.0 regression sweep — a generated result keeps its own proportions.

   WHAT THE OWNER REPORTED: the original subject frame / composition ratio was
   not being kept.

   WHAT IT WAS NOT. The local render was measured first, with colour markers in
   all four corners of the source: 3000x2000, 2000x3000 and 2400x2400 all came
   back through stBake at the identical size with every marker intact. APPLY
   never touched the framing, so the obvious suspect was innocent.

   WHAT IT WAS. stStageDrawResult drew the returned result with
   drawImage(img, 0, 0, c.width, c.height) — stretched to fill a canvas sized
   for the SOURCE photo's aspect. Every generator returns its own shape, and
   1024x1536 is what ChatGPT and most edit models emit, so a 3:2 original came
   back as a 2:3 result and was squashed to fit. Measured by rendering a PERFECT
   CIRCLE into a 1024x1536 result on an 1800x1200 source: it arrived on the
   stage as a 2.27:1 ELLIPSE. Faces came out stretched.

   The downloaded file was always correct — only the stage lied, which is worse
   than it sounds: the studio approves what it sees.

   Pinned contracts:
   A) A circle stays a circle. Any non-uniform scale turns it into an ellipse,
      so this measures distortion directly rather than reading the draw call.
   B) It holds both ways round — a portrait result on a landscape source and a
      landscape result on a portrait source.
   C) The result is contain-fitted, so nothing is cropped away either: the whole
      circle is still on the canvas.
   D) The local render still preserves the source frame exactly — the thing that
      was already right must not have moved.

   Usage: PORT=8931 node test/sweep_v474_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

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
    function solid(w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.fillStyle = "#777"; x.fillRect(0, 0, w, h);
      return c;
    }
    /* A circle is the honest probe: any non-uniform scale makes it an ellipse. */
    function circleResult(w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = "#222"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#fff";
      x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) * 0.39, 0, Math.PI * 2); x.fill();
      const du = c.toDataURL("image/jpeg", 0.95);
      const m = /^data:([^;]+);base64,(.*)$/.exec(du);
      return { mime: m[1], b64: m[2] };
    }
    async function measure(srcW, srcH, resW, resH) {
      await new Promise(r => ST.loadImage(solid(srcW, srcH).toDataURL("image/jpeg", 0.9), { done: r }));
      await new Promise(r => setTimeout(r, 700));
      const cv = document.getElementById("stCanvas");
      ST.stageResult = circleResult(resW, resH);
      ST._resImg = null;
      stStageDrawResult();
      /* v5.53.2 — the draw lands asynchronously, and a fixed 900ms was only
         ever "usually enough": under full-suite load (now with the hero
         banners animating) the capture sometimes sampled the stage BEFORE
         the circle was painted and measured an empty canvas (-1e9 extents).
         Poll for the painted circle instead — same assertions, no arbitrary
         sleep. The 8s ceiling still fails honestly if nothing ever draws. */
      const t = document.createElement("canvas"); t.width = cv.width; t.height = cv.height;
      let d = null, minX, maxX, minY, maxY;
      function white(x, y) { const q = (y * t.width + x) * 4; return d[q] > 200 && d[q + 1] > 200 && d[q + 2] > 200; }
      const deadline = Date.now() + 8000;
      do {
        await new Promise(r => setTimeout(r, 300));
        t.getContext("2d").drawImage(cv, 0, 0);
        d = t.getContext("2d").getImageData(0, 0, t.width, t.height).data;
        minX = 1e9; maxX = -1; minY = 1e9; maxY = -1;
        for (let y = 0; y < t.height; y += 2) for (let x = 0; x < t.width; x += 2) if (white(x, y)) {
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      } while (maxX < 0 && Date.now() < deadline);
      const w = maxX - minX, h = maxY - minY;
      return {
        src: srcW + "x" + srcH, res: resW + "x" + resH,
        w, h, ratio: h > 0 ? +(w / h).toFixed(3) : null,
        /* C) contain-fit means the whole circle is inside, never clipped */
        clipped: minX <= 0 || minY <= 0 || maxX >= t.width - 2 || maxY >= t.height - 2
      };
    }
    const portraitOnLandscape = await measure(1800, 1200, 1024, 1536);
    const landscapeOnPortrait = await measure(1200, 1800, 1536, 1024);

    /* D) the local render still keeps the source frame exactly */
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const x = c.getContext("2d");
    x.fillStyle = "#888"; x.fillRect(0, 0, 3000, 2000);
    x.fillStyle = "#f00"; x.fillRect(0, 0, 40, 40);
    x.fillStyle = "#ff0"; x.fillRect(2960, 1960, 40, 40);
    await new Promise(r => ST.loadImage(c.toDataURL("image/jpeg", 0.92), { done: r }));
    await new Promise(r => setTimeout(r, 700));
    state.st.t1 = Object.assign(stDefT1(), { bri: 8 }); stT1Changed();
    await new Promise(r => setTimeout(r, 900));
    const du = stBake();
    const im = await new Promise(rr => { const i = new Image(); i.onload = () => rr(i); i.src = du; });
    const bt = document.createElement("canvas"); bt.width = im.naturalWidth; bt.height = im.naturalHeight;
    bt.getContext("2d").drawImage(im, 0, 0);
    const bd = bt.getContext("2d").getImageData(0, 0, bt.width, bt.height).data;
    function at(X, Y) { const q = (Y * bt.width + X) * 4; return [bd[q], bd[q + 1], bd[q + 2]]; }
    const tl = at(6, 6), br = at(bt.width - 7, bt.height - 7);
    return {
      portraitOnLandscape, landscapeOnPortrait,
      bake: {
        size: bt.width + "x" + bt.height,
        arKept: Math.abs(3000 / 2000 - bt.width / bt.height) < 0.01,
        cornersKept: tl[0] > 150 && tl[1] < 110 && br[0] > 150 && br[1] > 150 && br[2] < 120
      }
    };
  });

  const a = out.portraitOnLandscape, b = out.landscapeOnPortrait;
  report("A) a portrait result on a landscape source stays round, not stretched",
    a.ratio !== null && Math.abs(a.ratio - 1) < 0.06, a);
  report("B) and a landscape result on a portrait source, the other way round",
    b.ratio !== null && Math.abs(b.ratio - 1) < 0.06, b);
  report("C) contain-fit, so the result is letterboxed rather than cropped",
    a.clipped === false && b.clipped === false,
    { portraitOnLandscape: a.clipped, landscapeOnPortrait: b.clipped });
  report("D) the local render still returns the source frame exactly, markers intact",
    out.bake.arKept === true && out.bake.cornersKept === true, out.bake);
  report("no page errors", errs.length === 0, errs);

  console.log("      (before: a perfect circle in a 1024x1536 result on an 1800x1200 source " +
    "arrived on the stage as a 2.27:1 ellipse)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
