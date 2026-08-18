/* v5.11 — two follow-on fixes to the v5.10 real-face model, both found by the
   owner testing the live app rather than by a test suite, which is worth
   stating plainly before the fixes.

   BUG 1: A LEFTOVER GEOMETRIC GUESS STILL PAINTED THE WRONG PLACE. v5.10
   fixed the DEFAULT face reader but left a narrower hole open: on a phone
   with no working WebGL, stFaceBoot refused the cpu backend outright (a
   deliberate choice — a cpu pass is 1.5-3s of blocked UI thread) and the app
   fell back to the pre-v5.10 heuristic reader for every photo, forever. That
   reader is exactly the one v5.10's own contract sweep documents as wrong on
   most photographs. The owner hit this on his own phone and photographed the
   result: lip colour on a cheek, on a photo where nothing about the ART was
   wrong — the WebGL context simply was not available.

   The fix reverses the earlier trade-off on evidence: a wrong retouch is not
   "rougher" than a slow one, it is unusable, and a studio cannot ship it. The
   cpu backend is now a real fallback rather than a refusal, AND — more load-
   bearing than the backend choice — every face-dependent makeup pass (lip
   colour, blush, teeth whitening, eye brightening, eye definition) now checks
   zones.real before painting anything. Only a face the model actually
   measured may drive those passes. A geometric guess, or no face at all,
   makes them no-ops. Silence is a correct answer; painting the wrong place
   is not, and #stFaceNote says so on screen instead of pretending nothing is
   wrong.

   BUG 2: THE RE-ENABLED CPU PASS MUST NOT REPEAT v4.28's Stop-BUTTON FREEZE
   — AND DID, ON THE FIRST ATTEMPT. Bringing cpu back raises the exact risk
   sweep_v428 exists to catch: a multi-second synchronous pass blocking the
   UI thread mid-interaction. The first fix attempted here was deferring only
   WHEN the scan starts (stFaceBusy: wait for an idle moment where nothing the
   operator is watching — ST.busy, the render worker, the .v2-busy overlay —
   is running). That is necessary but was not sufficient: it broke
   sweep_studio_generate's GENERATE-label check, because the scan can start
   during perfectly ordinary slider editing (no explicit busy flag is set
   while dragging brightness), and once a cpu pass STARTS it blocks for
   ~600ms-1s regardless of timing — long enough to delay the same debounce
   timer the label update rides on.

   Deferring the start cannot fix a block that happens once it has started.
   The actual fix moves the model OFF the main thread entirely: face-worker.js
   runs the whole boot-and-detect sequence inside a real Worker (mirroring the
   render pipeline's own stWorker), and the main thread only ever hands over a
   small ImageBitmap and waits on a message. stFaceBusy/the idle defer is kept
   as a lightweight courtesy — the worker still shouldn't compete for CPU with
   an in-flight generate — but it is no longer what keeps the UI thread free.

   Usage: PORT=8931 node test/sweep_v511_facegate.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  /* THE NO-WEBGL PHONE, MADE REPRODUCIBLE. This sweep first tried to be that
     phone by launching with no gpu flags. That is not what a headless Chromium
     is: it ships a working SwiftShader WebGL context, so the model booted on
     webgl and check 1 below — the whole point of the wave — asserted a cpu
     fallback that had never run. It passed only on a machine that happened to
     have no context to offer, and failed on the CI runner, which does. Flags do
     not fix it either: --disable-gpu leaves SwiftShader in place, and
     --disable-3d-apis takes WebGL from the PAGE but not from a worker, which is
     the only context that matters now that the model runs off-thread.

     So the context is taken away where the model actually asks for it: the
     worker script is served with a two-line shim that makes OffscreenCanvas
     hand back no webgl context, and everything below runs on the cpu backend on
     every machine. The route has to live on the CONTEXT — a page route never
     sees a module worker's own script request. */
  const WEBGL_OFF = `/* test shim (sweep_v511): no webgl in this worker */
(() => { const g = OffscreenCanvas.prototype.getContext;
  OffscreenCanvas.prototype.getContext = function (t, ...r) {
    return String(t).indexOf("webgl") >= 0 ? null : g.call(this, t, ...r); }; })();
`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 } });
  let workerShimmed = 0;
  await ctx.route("**/face-worker.js", async route => {
    const res = await route.fetch();
    const body = await res.text();
    workerShimmed++;
    await route.fulfill({ status: 200, headers: { "content-type": "text/javascript" }, body: WEBGL_OFF + body });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    switchPage("pgStudio");
    window.scrollTo = function () {}; Element.prototype.scrollIntoView = function () {};
  });

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  async function loadAndWait(rel) {
    return page.evaluate(async (r) => {
      const res = await fetch("lib/" + r);
      const bl = await res.blob();
      const du = await new Promise(x => { const f = new FileReader(); f.onload = () => x(f.result); f.readAsDataURL(bl); });
      await new Promise(x => { ST.loadImage(du, { done: x }); });
      for (let i = 0; i < 450; i++) {
        if (ST.faceLM && ST.faceLM.scanned) break;
        if (STFACE && STFACE.off) break;
        await new Promise(x => setTimeout(x, 100));
      }
      await new Promise(x => setTimeout(x, 250));
      return { faces: ST.faceLM ? ST.faceLM.faces.length : 0, backend: STFACE.backend || null };
    }, rel);
  }

  // ---------------------------------------------------------------- BUG 1
  // 1) the reversed policy: cpu is a real fallback, not a refusal
  const boot = await loadAndWait("st-sample.jpg");
  report("with no webgl to be had, the model runs on the cpu backend rather than refusing to load",
    workerShimmed > 0 && boot.faces === 1 && boot.backend === "cpu",
    JSON.stringify({ ...boot, workerShimmed }));

  // 2) with a MEASURED face, makeup passes actually change pixels — the
  //    positive control, so a bug that disables makeup entirely cannot hide
  //    behind checks that only look for silence
  const withFace = await page.evaluate(() => {
    const W = ST.buf.width, H = ST.buf.height;
    const mi = stSkinMask(ST.px0, W, H, ST.faceLM);
    const z = stFaceZones(ST.px0, W, H, mi, ST.faceLM);
    const t2 = stDefT2(); t2.lipV = 100; t2.blushV = 100; t2.teeth = 100; t2.eyeb = 100;
    t2.lipC = { r: 210, g: 40, b: 70 }; t2.blushC = { r: 230, g: 120, b: 130 };
    const out = stRunPipeline(stGeoSource(), W, H,
      { t1: stDefT1(), t2: t2, pv: stPipeVals(), curve: stCurveVals(), maskInfo: mi, lm: ST.faceLM, rs: 1 });
    const after = out.getContext("2d").getImageData(0, 0, W, H).data, before = ST.px0.data;
    /* the mouth is a small fraction of the frame — averaging the delta over
       the WHOLE image (as the "no face" checks below correctly do, since
       there NOTHING should change anywhere) dilutes a real, visible local
       edit into noise. Measure where the edit actually lands, the same way
       sweep_v510's two-face check does. */
    const mouthDelta = (() => {
      if (!z || !z.mouth) return -1;
      const e = z.mouth;
      const x0 = Math.max(0, e.cx - e.rx | 0), x1 = Math.min(W - 1, e.cx + e.rx | 0);
      const y0 = Math.max(0, e.cy - e.ry | 0), y1 = Math.min(H - 1, e.cy + e.ry | 0);
      let sum = 0, cnt = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        sum += Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
        cnt++;
      }
      return cnt ? sum / cnt : -1;
    })();
    return { mouthDelta, faces: ST.faceLM.faces.length };
  });
  report("makeup passes DO change pixels (inside the mouth zone) when a face was actually measured",
    withFace.faces === 1 && withFace.mouthDelta > 8, JSON.stringify(withFace));

  // 3) THE FIX ITSELF: with no measured face — lm=null, "never looked" — the
  //    SAME makeup settings must change nothing. Before this release the
  //    geometric fallback still ran and painted a guessed mouth/cheek band;
  //    that guess is what the owner photographed on his own face.
  const noFaceNull = await page.evaluate(() => {
    const W = ST.buf.width, H = ST.buf.height;
    const mi = stSkinMask(ST.px0, W, H, null);
    /* the geometric fallback DOES still read eyes/mouth/head off this photo —
       that reader is not deleted, only disqualified from driving makeup. If
       any of these were false, this check would prove nothing. */
    const z = stFaceZones(ST.px0, W, H, mi, null);
    const t2 = stDefT2(); t2.lipV = 100; t2.blushV = 100; t2.teeth = 100; t2.eyeb = 100;
    t2.lipC = { r: 210, g: 40, b: 70 }; t2.blushC = { r: 230, g: 120, b: 130 };
    const out = stRunPipeline(stGeoSource(), W, H,
      { t1: stDefT1(), t2: t2, pv: stPipeVals(), curve: stCurveVals(), maskInfo: mi, lm: null, rs: 1 });
    const after = out.getContext("2d").getImageData(0, 0, W, H).data, before = ST.px0.data;
    /* the regression that shipped in v5.10: a legacy midpoint-guess fallback
       for blush read zones.eyes/zones.mouth/zones.head directly (bypassing
       the "only a measured face" gate) and painted a small but real cheek
       patch even with lm=null. Track the WORST single pixel, not an average
       diluted across a whole photograph — that is what let 32/765 slip past
       an average-based check the first time. */
    let maxDelta = 0, sumAll = 0;
    for (let i = 0; i < before.length; i += 4) {
      const d = Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
      if (d > maxDelta) maxDelta = d;
      sumAll += d;
    }
    return {
      geometricReaderStillWorks: !!(z && z.eyes && z.mouth && z.head),
      maxDelta, avgAllDelta: sumAll / (W * H)
    };
  });
  report("the geometric reader itself is untouched (still finds eyes/mouth/head without a model)",
    noFaceNull.geometricReaderStillWorks, JSON.stringify(noFaceNull));
  report("with lm=null (\"never looked\") makeup passes change NOT ONE PIXEL, not the old geometric guess",
    noFaceNull.maxDelta === 0,
    "maxDelta=" + noFaceNull.maxDelta + " avgAllDelta=" + noFaceNull.avgAllDelta.toFixed(3) +
    " (v5.10 leaked a legacy midpoint-guess blush band here — maxDelta was 32)");

  // 4) same guarantee for a photo the model definitely scanned and found no
  //    face in — "confirmed nobody here" must be exactly as inert as
  //    "never looked", never a silent regression back to guessing
  const mannequin = await loadAndWait("full/user-ref-120.jpg");
  const noFaceScanned = await page.evaluate(() => {
    const W = ST.buf.width, H = ST.buf.height;
    const mi = stSkinMask(ST.px0, W, H, ST.faceLM);
    const t2 = stDefT2(); t2.lipV = 100; t2.blushV = 100; t2.teeth = 100; t2.eyeb = 100;
    t2.lipC = { r: 210, g: 40, b: 70 }; t2.blushC = { r: 230, g: 120, b: 130 };
    const out = stRunPipeline(stGeoSource(), W, H,
      { t1: stDefT1(), t2: t2, pv: stPipeVals(), curve: stCurveVals(), maskInfo: mi, lm: ST.faceLM, rs: 1 });
    const after = out.getContext("2d").getImageData(0, 0, W, H).data, before = ST.px0.data;
    let maxDelta = 0; for (let i = 0; i < before.length; i += 4) {
      const d = Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
      if (d > maxDelta) maxDelta = d;
    }
    return { maxDelta };
  });
  report("a confirmed-faceless photo changes not one pixel — exactly as inert as an unscanned one",
    mannequin.faces === 0 && noFaceScanned.maxDelta === 0,
    JSON.stringify({ mannequinFaces: mannequin.faces, maxDelta: noFaceScanned.maxDelta }));

  // 5) the on-screen note: a face-dependent slider that is switched on with
  //    no measured face must say so, and must go quiet again once the
  //    control is switched off. Silence-that-looks-like-nothing-happened is
  //    the exact complaint this whole release answers.
  const noteOff = await page.evaluate(() => {
    state.st.t2.lipV = 0;
    stFaceNoteRefresh();
    const el = document.getElementById("stFaceNote");
    return { shown: el.style.display !== "none" };
  });
  report("the note is hidden when no face-dependent control is active", !noteOff.shown, JSON.stringify(noteOff));

  const noteOn = await page.evaluate(() => {
    state.st.t2.lipV = 60;
    stFaceNoteRefresh();
    const el = document.getElementById("stFaceNote");
    return { shown: el.style.display !== "none", text: (el.textContent || "").slice(0, 20) };
  });
  report("the note appears, in the current language, when a face-dependent control has nothing to act on",
    noteOn.shown && noteOn.text.length > 3, JSON.stringify(noteOn));

  const noteClears = await page.evaluate(() => {
    state.st.t2.lipV = 0;
    stFaceNoteRefresh();
    return document.getElementById("stFaceNote").style.display === "none";
  });
  report("the note clears again once the control is switched back off", noteClears);

  // ---------------------------------------------------------------- BUG 2
  // 6) stFaceBusy() reads the three real busy signals in the app
  const busySrc = await page.evaluate(() => String(window.stFaceBusy || ""));
  report("stFaceBusy checks the studio, worker and V2-generate busy flags",
    busySrc.indexOf("ST.busy") >= 0 && busySrc.indexOf("STW.busy") >= 0 && busySrc.indexOf("v2-busy") >= 0,
    busySrc.slice(0, 60));

  // 7) THE RACE ITSELF. Load a fresh photo (queues a scan), immediately mark
  //    the studio busy the instant loadImage returns — before the deferred
  //    scan has had a chance to run — and confirm the scan does NOT proceed
  //    while busy is set. This is the exact shape of sweep_v428's Stop-button
  //    freeze: a long synchronous pass starting while the operator is mid-
  //    interaction.
  const race = await page.evaluate(async () => {
    const res = await fetch("lib/st-sample.jpg");
    const bl = await res.blob();
    const du = await new Promise(x => { const f = new FileReader(); f.onload = () => x(f.result); f.readAsDataURL(bl); });
    ST.faceLM = null;
    await new Promise(x => { ST.loadImage(du, { done: x }); });
    ST.busy = true;                                  // mark busy BEFORE the idle callback fires
    await new Promise(x => setTimeout(x, 600));       // long enough that an unguarded scan would have started
    const scannedWhileBusy = !!(ST.faceLM && ST.faceLM.scanned);
    ST.busy = false;                                  // release — the queued scan should now proceed
    for (let i = 0; i < 450; i++) {
      if (ST.faceLM && ST.faceLM.scanned) break;
      await new Promise(x => setTimeout(x, 100));
    }
    return { scannedWhileBusy, scannedAfterRelease: !!(ST.faceLM && ST.faceLM.scanned) };
  });
  report("the face scan defers while the studio is busy, instead of racing the interaction",
    !race.scannedWhileBusy, JSON.stringify(race));
  report("the deferred scan completes once the studio is no longer busy",
    race.scannedAfterRelease, JSON.stringify(race));

  // 8) sanity: the main thread stays responsive during a cpu scan. A tight
  //    setInterval tick counter that falls silent for a long stretch would
  //    mean the scan (or anything else) blocked the thread synchronously.
  const responsiveness = await page.evaluate(async () => {
    ST.faceLM = null;
    let ticks = 0, maxGapMs = 0, last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      maxGapMs = Math.max(maxGapMs, now - last);
      last = now; ticks++;
    }, 16);
    const res = await fetch("lib/full/user-ref-1301.jpg");
    const bl = await res.blob();
    const du = await new Promise(x => { const f = new FileReader(); f.onload = () => x(f.result); f.readAsDataURL(bl); });
    await new Promise(x => { ST.loadImage(du, { done: x }); });
    for (let i = 0; i < 450; i++) {
      if (ST.faceLM && ST.faceLM.scanned) break;
      await new Promise(x => setTimeout(x, 100));
    }
    clearInterval(iv);
    return { ticks, maxGapMs: Math.round(maxGapMs) };
  });
  // 1200ms of slack: this is a shared CI runner on cpu, not a promise the UI
  // never drops a frame — it is a promise nothing blocks for whole SECONDS,
  // which is the failure this bug actually was.
  report("the UI thread is never blocked for a long synchronous stretch during the scan",
    responsiveness.maxGapMs < 1200, JSON.stringify(responsiveness));

  // 9) shipping hygiene
  report("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(allOk ? "\nALL PASS" : "\nFAILURES ABOVE");
  process.exit(allOk ? 0 : 1);
})();
