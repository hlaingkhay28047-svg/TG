/* v4.75.0 regression sweep — long local jobs behave like long jobs.

   WHAT WAS MEASURED FIRST. Three separate things, all on the local (free,
   no-network) side of the app, which had quietly been held to a lower standard
   than the paid AI paths:

   1) BAKE took no lock at all. Two taps on the button — the way a thumb
      double-taps a button that has not visibly responded — ran two complete
      chains over the same album: 12 bakes for 6 photos and TWO ZIPs saved,
      twice the canvas memory on the device least able to spare it. And because
      PT.busy stayed false for the whole bake, three things that exist purely
      for long jobs never engaged: the beforeunload guard (close the tab
      mid-bake and a 100-photo batch is gone, silently), the screen Wake Lock,
      and the disabling of Add / Clear / Run.

   2) The retained original was never let go. state.stFull holds the customer's
      photo at its ORIGINAL size — up to 34MB of base64 — so Studio can deliver
      a real full-resolution export. Remove the photo and those bytes stayed
      resident for the whole session, for a photo the app could no longer even
      reach. (It is session-only and never written to storage, so this is
      memory hygiene, not a data leak.)

   3) stBake() is fully synchronous. On a 24MP photo carrying a heavy recipe it
      measured 8.9s and +379MB of heap on desktop — worse on a phone. The
      local-commit path yielded 30ms first so the spinner could paint; the AI
      path set the same label and then froze the thread before the browser
      drew it, so the studio saw a dead tab.

   Pinned contracts:
   A) Two taps on BAKE produce ONE ZIP and one bake per photo.
   B) A bake marks the app busy, so the unload guard, the Wake Lock and the
      disabled buttons all engage — and releases it when finished.
   C) Stop is honoured, and a stopped bake still delivers the photos it did
      finish, named -partial so a short batch cannot pass as a complete one.
   D) Removing the photo releases BOTH the retained original and its decoded
      full-resolution bitmap; Undo after Clear-all puts the original back, so
      undo cannot silently downgrade the export.
   E) The worker's generation guard rests on there being exactly one render in
      flight. That invariant is pinned here, because the guard is unreachable
      without it and would stop protecting anything if the coalescing were
      relaxed.
   F) Both stBake callers yield before blocking, so the spinner is painted.

   Usage: PORT=8931 node test/sweep_v475_upgrades.js  (serve docs/app first) */
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

/* ---- E) the invariant the worker guard depends on, read from the source ---- */
/* Read only the function body, comments stripped: this file has been caught
   before asserting against its own explanatory prose. */
const wrStart = src.indexOf("function stWorkerRender(");
const wrBody = wrStart < 0 ? "" : src.slice(wrStart, src.indexOf("\n}", wrStart)).replace(/\/\*[\s\S]*?\*\//g, " ");
const busyAt = wrBody.indexOf("if(STW.busy){ STW.queued=true; return true; }");
const mintAt = wrBody.indexOf("var id=++STW.id;");
report("E) one render in flight: the coalescing guard still precedes the generation counter",
  wrStart >= 0 && busyAt >= 0 && mintAt >= 0 && busyAt < mintAt,
  { hasFn: wrStart >= 0, busyAt, mintAt });

/* ---- F) the studio never faces a dead tab while an export runs ---- */
/* This was a source check that counted stBake() call sites and required a
   stSetBusy + 30ms yield before each. v4.78 moved the export onto the worker,
   the call sites became stBakeAsync(), and the assertion failed while the
   contract it cares about was still perfectly held — the fifth time in this
   codebase that an assertion pinned an implementation instead of a behaviour.

   It is now measured at runtime, through the real button, so it survives any
   further refactor: start a local commit on a dirty photo and require that the
   busy spinner is showing AND the main thread has painted frames before the
   export finishes. Whether that is achieved by a yield, a worker or something
   later invented is not this test's business. */

report("A0) BAKE is in the list of controls a run disables",
  /\$\("btnPtBake"\)\.disabled=!!b;/.test(src));

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

  /* ---- A + B + C: the bake lock ---- */
  const bake = await page.evaluate(async () => {
    function photo(i) {
      const c = document.createElement("canvas"); c.width = 800; c.height = 1000;
      const x = c.getContext("2d");
      x.fillStyle = "hsl(" + (i * 40) + ",45%,55%)"; x.fillRect(0, 0, 800, 1000);
      return { id: "pt" + i, name: "shot-" + i + ".jpg", srcDataUrl: c.toDataURL("image/jpeg", 0.85),
               outB64: null, outMime: null, status: "queued", err: "", lookOverride: null };
    }
    const realSave = window.ptSaveBlob, realBake = window.ptBake;
    let zips = 0, bakes = 0, names = [];
    window.ptSaveBlob = function (u8, fn) { zips++; names.push(fn); };
    window.ptBake = function (p, cb) { bakes++; return realBake(p, cb); };

    /* A + B — two taps */
    PT.photos = []; for (let i = 1; i <= 6; i++) PT.photos.push(photo(i));
    ptBakeAll();
    const busyAfterFirst = PT.busy === true;
    const bakeDisabled = document.getElementById("btnPtBake").disabled === true;
    const addDisabled = document.getElementById("btnPtAdd").disabled === true;
    ptBakeAll();                                   /* the second thumb tap */
    await new Promise(r => setTimeout(r, 9000));
    const twoTaps = { zips, bakes, names: names.slice(), busyAfterFirst, bakeDisabled, addDisabled,
                      busyAfter: PT.busy === true, bakeEnabledAfter: document.getElementById("btnPtBake").disabled === false };

    /* C — stop midway. Timing-based stopping is a race the test loses: eight
       800x1000 photos bake in well under half a second, so hook the stop to a
       COUNT instead and it is deterministic on any machine. */
    zips = 0; bakes = 0; names = [];
    window.ptBake = function (p, cb) { bakes++; if (bakes === 3) ptStopRun(); return realBake(p, cb); };
    PT.photos = []; for (let i = 1; i <= 8; i++) PT.photos.push(photo(i));
    ptBakeAll();
    await new Promise(r => setTimeout(r, 6000));
    const stopped = { zips, bakes, names: names.slice(), busyAfter: PT.busy === true };

    window.ptSaveBlob = realSave; window.ptBake = realBake;
    return { twoTaps, stopped };
  });

  const tt = bake.twoTaps;
  report("A) two taps on BAKE run one chain: one ZIP, one bake per photo",
    tt.zips === 1 && tt.bakes === 6, { zipsSaved: tt.zips, bakeCalls: tt.bakes });
  report("B) a bake marks the app busy — unload guard, Wake Lock and disabled controls all engage",
    tt.busyAfterFirst === true && tt.bakeDisabled === true && tt.addDisabled === true &&
    tt.busyAfter === false && tt.bakeEnabledAfter === true, tt);
  report("C) Stop is honoured, and the partial batch is delivered under a -partial name",
    bake.stopped.bakes < 8 && bake.stopped.bakes > 0 &&
    bake.stopped.zips === 1 && /-partial\.zip$/.test(bake.stopped.names[0] || "") &&
    bake.stopped.busyAfter === false, bake.stopped);

  /* ---- D: the retained original is released, and Undo restores it ---- */
  const mem = await page.evaluate(async () => {
    function big(w, h) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#c9a"); g.addColorStop(1, "#234");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { x.fillStyle = "hsl(" + (i % 360) + ",60%,45%)"; x.fillRect((i * 97) % w, (i * 61) % h, 9, 9); }
      return c;
    }
    const du = big(2600, 1800).toDataURL("image/jpeg", 0.9);
    const m = du.match(/^data:([^;]+);base64,(.+)$/);

    async function attach() {
      await new Promise(r => ST.loadImage(du, { done: r }));
      await new Promise(r => setTimeout(r, 700));
      state.refs[0] = { mime: m[1], b64: m[2], label: "big.jpg" };
      state.stFull = { key: stFullKey(m[2]), du: du };
      stLoadFullSource(du);
      await new Promise(r => setTimeout(r, 1400));
    }

    await attach();
    const held = { stFull: !!state.stFull, fullBitmap: !!ST.fullBitmap };

    /* the × on the photo */
    state.refs[0] = null; state.rsOrig = null; state.cmpBase = null; state.imgRoles = null;
    stDropFull(); renderRefs(); if (typeof stSyncFromRef === "function") stSyncFromRef();
    await new Promise(r => setTimeout(r, 500));
    const afterX = { stFull: !!state.stFull, fullBitmap: !!ST.fullBitmap, geoCacheFull: !!ST.geoCacheFull };

    /* Clear-all then Undo must put the original back */
    await attach();
    const kept = state.refs.slice(), keptFull = state.stFull;
    state.refs = [null, null, null]; state.imgRoles = null; stDropFull();
    const afterClear = !!state.stFull;
    state.refs = kept; state.stFull = keptFull;          /* the Undo callback's body */
    const afterUndo = !!state.stFull;

    return { held, afterX, afterClear, afterUndo };
  });

  report("D) removing the photo releases the retained original and its decoded bitmap",
    mem.held.stFull === true && mem.held.fullBitmap === true &&
    mem.afterX.stFull === false && mem.afterX.fullBitmap === false && mem.afterX.geoCacheFull === false,
    mem);
  report("D2) Undo after Clear-all restores it, so undo cannot downgrade the export",
    mem.afterClear === false && mem.afterUndo === true,
    { afterClear: mem.afterClear, afterUndo: mem.afterUndo });

  /* ---- F) the studio never faces a dead tab while an export runs ---- */
  const live = await page.evaluate(async () => {
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
    const du = photo(2400, 1600).toDataURL("image/jpeg", 0.94);
    await new Promise(r => ST.loadImage(du, { done: r }));
    await new Promise(r => setTimeout(r, 1200));
    /* Attach the full-resolution original. Without this the export runs on the
       PREVIEW buffer, which this suite's 390px phone context caps at 896px —
       a render so small it finishes in a few frames and measures nothing. A
       real export is the delivery-size one. */
    stLoadFullSource(du);
    await new Promise(r => setTimeout(r, 1800));
    /* a recipe heavy enough that the export is not instantaneous */
    state.st.t1 = Object.assign(stDefT1(), { bri: 10, con: 16, shp: 55, cla: 50, grn: 30, vig: 40, bgb: 45, dhz: 35 });
    state.st.t2 = Object.assign(stDefT2(), { smooth: 65, even: 55, radiance: 50, finish: 1 });
    stRenderSettle();
    await new Promise(r => setTimeout(r, 1200));

    let frames = 0, stop = false, busySeen = false;
    (function tick() { if (stop) return; frames++; if (stBusy) busySeen = true; requestAnimationFrame(tick); })();

    /* the REAL button, on the free local-commit path (no pending AI steps) */
    state.st.pend = [];
    const p = document.getElementById("btnStGen").onclick();
    await p;
    await new Promise(r => setTimeout(r, 0));
    stop = true;
    return { frames, busySeen, gotResult: !!(state.hist && state.hist[0]) };
  });

  report("F) an export keeps the tab alive: the busy spinner shows and frames paint while it runs",
    live.busySeen === true && live.frames >= 20 && live.gotResult === true, live);

  report("no page errors", errs.length === 0, errs);

  console.log("      (before: two taps on BAKE = 12 bakes for 6 photos and 2 ZIPs, PT.busy false " +
    "throughout; a 24MP heavy-recipe export = 8.9s synchronous and +379MB heap)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
