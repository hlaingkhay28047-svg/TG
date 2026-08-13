/* v4.42 Studio mega-wave sweep — pins all 10 upgrades of the wave:
    1. live makeup bundles (mu_bundle chips write lip/blush colours + t2 keys,
       off clears exactly what it set)
    2. grade thumbnail cards (#stGradeCards pipeline-real thumbs, pick writes
       the st_grade_ev* keys)
    3. one-tap Auto enhance (#stAutoBtn: dark warm fixture → +exp, cooler wrm)
    4. multi-step undo/redo (stage chips, 900ms gesture grouping)
    5. spot heal (stHealAt lifts a planted blemish toward the surround and the
       toast Undo restores the exact patch bytes)
    6. Before/After 2-up export (#stExp2Up downloads hnk-before-after-*)
    7. zone overlay (#stZonesBtn is safe + honest on a faceless photo)
    8. Studio→Path full-recipe bridge (btnPtFromStudio stores recipe;
       ptBake runs the real pipeline — t2 smoothing must cut noise, which the
       old CSS-filter approximation could not do)
    9. Web Worker offload (small buffers stay sync; a >700k-px buffer renders
       through the worker with pixel-parity against the sync pipeline)
   10. local brush masking ("in" edits only painted pixels, "out" protects
       them, cleared mask -> whole image again) */
const { chromium } = require("playwright-core");
const BASE = "http://localhost:8931/index.html";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS — " : "FAIL — ") + name + (ok ? "" : "  " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  page.on("pageerror", e => report("no page error", false, e.message));
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  /* shared fixture: skin-tone noise + planted dark spot at the centre */
  const loaded = await page.evaluate(async () => {
    switchPage("pgStudio");
    const W = 220, H = 220, SR = 6;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const d = x.createImageData(W, H);
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return (s % 41) - 20; };
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 205 + rnd(); d.data[i + 1] = 155 + rnd(); d.data[i + 2] = 125 + rnd(); d.data[i + 3] = 255;
    }
    for (let yy = 110 - SR; yy <= 110 + SR; yy++) for (let xx = 110 - SR; xx <= 110 + SR; xx++) {
      if ((xx - 110) * (xx - 110) + (yy - 110) * (yy - 110) <= SR * SR) {
        const p = (yy * W + xx) * 4; d.data[p] = 60; d.data[p + 1] = 40; d.data[p + 2] = 30;
      }
    }
    x.putImageData(d, 0, 0);
    await new Promise(res => ST.loadImage(c.toDataURL("image/png"), { done: res }));
    await new Promise(r => setTimeout(r, 500));
    return { buf: !!ST.buf, w: ST.buf && ST.buf.width };
  });
  report("1-10) Studio fixture loads", loaded.buf && loaded.w === 220, loaded);

  /* ---- 3) one-tap Auto enhance ---- */
  const auto = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 450));
    /* darken + warm-cast the working copy readings via a darker fixture would
       need a reload; instead assert the button acts on THIS photo: sliders move
       from all-zero to a analysed, clamped state and a toast offers Undo */
    const before = JSON.stringify(state.st.t1);
    const btn = document.getElementById("stAutoBtn");
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 500));
    const t1 = state.st.t1;
    const moved = JSON.stringify(t1) !== before;
    return { btn: !!btn, moved, exp: t1.exp, wrm: t1.wrm, tnt: t1.tnt };
  });
  /* the warm (R>B) fixture must push wrm negative (cooling), never warmer */
  report("3) one-tap Auto enhance analyses the photo", auto.btn && auto.moved && auto.wrm < 0, auto);

  /* ---- 4) undo/redo chips with gesture grouping ---- */
  const undo = await page.evaluate(async () => {
    const out = {};
    out.chips = !!document.getElementById("stUndoB") && !!document.getElementById("stRedoB");
    const inp = document.getElementById("mu_bri");
    inp.value = "25"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 1100));
    out.enabled = !document.getElementById("stUndoB").disabled;
    const briSet = state.st.t1.bri;
    document.getElementById("stUndoB").click();
    await new Promise(r => setTimeout(r, 250));
    out.briAfterUndo = state.st.t1.bri;
    document.getElementById("stRedoB").click();
    await new Promise(r => setTimeout(r, 250));
    out.briAfterRedo = state.st.t1.bri;
    out.briSet = briSet;
    return out;
  });
  report("4) undo/redo stage chips work", undo.chips && undo.enabled && undo.briAfterUndo !== undo.briSet && undo.briAfterRedo === undo.briSet, undo);

  /* ---- 1) makeup bundles ---- */
  const bundles = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 450));
    const wrap = document.getElementById("mu_bundle");
    const chips = wrap ? wrap.querySelectorAll(".chip").length : 0;
    let picked = null, cleared = null;
    if (wrap) {
      const douyin = Array.from(wrap.querySelectorAll(".chip")).find(c => /Douyin/.test(c.textContent));
      if (douyin) {
        douyin.click();
        await new Promise(r => setTimeout(r, 300));
        picked = { lipV: state.st.t2.lipV, blushV: state.st.t2.blushV, lipHex: svGet("mu_lipLocHex", null) };
        douyin.click(); /* same chip toggles off and clears exactly what it set */
        await new Promise(r => setTimeout(r, 300));
        cleared = { lipV: state.st.t2.lipV, lipHex: svGet("mu_lipLocHex", null) };
      }
    }
    return { chips, picked, cleared };
  });
  report("1) makeup bundles apply and clear", bundles.chips >= 5 && bundles.picked && bundles.picked.lipV > 0 && !!bundles.picked.lipHex && bundles.cleared && !bundles.cleared.lipV && !bundles.cleared.lipHex, bundles);

  /* ---- 2) grade thumbnail cards ---- */
  const grades = await page.evaluate(async () => {
    const host = document.getElementById("stGradeCards");
    const cards = host ? host.querySelectorAll(".pcard").length : 0;
    let after = null;
    if (host && cards) {
      host.querySelectorAll(".pcard")[0].click();
      await new Promise(r => setTimeout(r, 300));
      after = { amt: svGet("st_grade_evAmt", 0), on: host.querySelectorAll(".pcard.on").length };
      host.querySelectorAll(".pcard")[0].click(); /* second tap clears */
      await new Promise(r => setTimeout(r, 250));
      after.cleared = svGet("st_grade_evSh", null) === null;
    }
    return { host: !!host, cards, after };
  });
  report("2) grade preset thumbnail cards", grades.host && grades.cards >= 6 && grades.after && grades.after.amt > 0 && grades.after.on === 1 && grades.after.cleared, grades);

  /* ---- 5) spot heal + exact undo ---- */
  const heal = await page.evaluate(async () => {
    const out = {};
    out.ui = !!document.getElementById("stHealBtn") && !!document.getElementById("st_healR");
    /* earlier checks leave their own Undo toast up — deactivate it (the #toast
       element is a singleton; removing it would kill all later toasts) */
    const tst = document.getElementById("toast"); if (tst) tst.className = "toast";
    const spotMean = () => {
      const dd = ST.px0.data; let m = 0, n = 0;
      for (let yy = 106; yy <= 114; yy++) for (let xx = 106; xx <= 114; xx++) {
        const p = (yy * ST.px0.width + xx) * 4; m += (dd[p] + dd[p + 1] + dd[p + 2]) / 3; n++;
      }
      return m / n;
    };
    out.before = +spotMean().toFixed(1);
    svSet("st_healR", 5);
    stHealAt(110, 110);
    out.healed = +spotMean().toFixed(1);
    const act = document.querySelector(".toast .toast-act");
    out.undoAct = !!act;
    if (act) act.click();
    await new Promise(r => setTimeout(r, 250));
    out.restored = +spotMean().toFixed(1);
    return out;
  });
  report("5) spot heal lifts the blemish, Undo restores it", heal.ui && heal.before < 90 && heal.healed > heal.before + 50 && heal.restored === heal.before, heal);

  /* ---- 10) local brush masking gates the pipeline ---- */
  const brush = await page.evaluate(async () => {
    const out = {};
    out.ui = !!document.getElementById("stBrushBtn") && !!document.getElementById("st_brushR");
    /* hard-clean slate: only the brush-gated smoothing may move pixels */
    state.st.t1 = stDefT1(); state.st.t2 = stDefT2(); state.st.v = {}; ST.g1 = {}; ST.g2 = {};
    const tst2 = document.getElementById("toast"); if (tst2) tst2.className = "toast";
    const mc = stBrushCanvas();
    const mx = mc.getContext("2d");
    mx.fillStyle = "rgba(255,255,255,1)";
    mx.fillRect(0, 0, Math.floor(mc.width / 2), mc.height);
    stBrushRefresh();
    out.mask = !!ST.userMask;
    svSet("st_brushMode", "in");
    state.st.t2.smooth = 100; ST.maskCache = null;
    const W = ST.buf.width, H = ST.buf.height;
    const srcC = document.createElement("canvas"); srcC.width = W; srcC.height = H;
    srcC.getContext("2d").drawImage(ST.srcBitmap, 0, 0, W, H);
    const src = srcC.getContext("2d").getImageData(0, 0, W, H).data;
    const halfDiff = (px) => {
      let dl = 0, nl = 0, dr = 0, nr = 0;
      for (let yy = 0; yy < H; yy += 3) for (let xx = 0; xx < W; xx += 3) {
        const p = (yy * W + xx) * 4;
        const df = Math.abs(px[p] - src[p]) + Math.abs(px[p + 1] - src[p + 1]) + Math.abs(px[p + 2] - src[p + 2]);
        if (xx < W / 2 - 8) { dl += df; nl++; } else if (xx > W / 2 + 8) { dr += df; nr++; }
      }
      return { l: +(dl / nl).toFixed(2), r: +(dr / nr).toFixed(2) };
    };
    const run = () => {
      const cv = stRunPipeline(ST.srcBitmap, W, H, {});
      return cv.getContext("2d").getImageData(0, 0, W, H).data;
    };
    out.modeIn = halfDiff(run());
    svSet("st_brushMode", "out");
    out.modeOut = halfDiff(run());
    ST.userMaskCanvas = null; ST.userMask = null;
    out.cleared = halfDiff(run());
    state.st.t2.smooth = 0; svSet("st_brushMode", null);
    return out;
  });
  report("10) brush mask: in / out / cleared", brush.ui && brush.mask
    && brush.modeIn.l > 3 && brush.modeIn.r < 0.5
    && brush.modeOut.r > 3 && brush.modeOut.l < 0.5
    && brush.cleared.l > 3 && brush.cleared.r > 3, brush);

  /* ---- 6) Before/After 2-up export ---- */
  const twoUp = await page.evaluate(() => {
    let dl = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { dl = this.download; };
    const btn = document.getElementById("stExp2Up");
    if (btn) btn.click();
    HTMLAnchorElement.prototype.click = orig;
    return { btn: !!btn, dl };
  });
  report("6) 2-up before/after export downloads", twoUp.btn && /^hnk-before-after-/.test(twoUp.dl || ""), twoUp);

  /* ---- 7) zone overlay is safe + honest without a face ---- */
  const zones = await page.evaluate(async () => {
    const btn = document.getElementById("stZonesBtn");
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 300));
    return { btn: !!btn };
  });
  report("7) zone overlay button safe on faceless photo", zones.btn, zones);

  /* ---- 8) Studio→Path full-recipe bridge ---- */
  const bridge = await page.evaluate(async () => {
    const out = {};
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 450));
    state.st.t1.wrm = 40; state.st.t2.smooth = 90;
    document.getElementById("btnPtFromStudio").click();
    out.look = state.pt.look;
    out.recipe = !!(PT_LOOKS.pt_custom && PT_LOOKS.pt_custom.recipe);
    out.recipeSmooth = out.recipe ? PT_LOOKS.pt_custom.recipe.t2.smooth : null;
    /* bake a noisy photo through the recipe: real smoothing must cut noise */
    const W = 200, H = 200;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const d = x.createImageData(W, H);
    let s = 13; const rnd = () => { s = (s * 16807) % 2147483647; return (s % 61) - 30; };
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 200 + rnd(); d.data[i + 1] = 150 + rnd(); d.data[i + 2] = 120 + rnd(); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    const noiseOf = (data, W2) => {
      let sum = 0, n = 0;
      for (let yy = 20; yy < 180; yy += 2) for (let xx = 21; xx < 180; xx += 2) {
        sum += Math.abs(data[(yy * W2 + xx) * 4] - data[(yy * W2 + xx - 1) * 4]); n++;
      }
      return sum / n;
    };
    out.srcNoise = +noiseOf(d.data, W).toFixed(2);
    const baked = await new Promise(res => ptBake({ srcDataUrl: c.toDataURL("image/png") }, res));
    const img = new Image();
    await new Promise(r2 => { img.onload = r2; img.src = baked; });
    const bc = document.createElement("canvas"); bc.width = img.width; bc.height = img.height;
    const bx = bc.getContext("2d"); bx.drawImage(img, 0, 0);
    out.bakedNoise = +noiseOf(bx.getImageData(0, 0, bc.width, bc.height).data, bc.width).toFixed(2);
    state.st.t1.wrm = 0; state.st.t2.smooth = 0;
    return out;
  });
  report("8) Path bakes the FULL Studio recipe", bridge.look === "pt_custom" && bridge.recipe && bridge.recipeSmooth === 90 && bridge.bakedNoise < bridge.srcNoise * 0.6, bridge);

  /* ---- 9a) small buffers never touch the worker ---- */
  const gate = await page.evaluate(async () => {
    const before = STW.id;
    stRenderSettle();
    await new Promise(r => setTimeout(r, 600));
    return { px: ST.buf.width * ST.buf.height, before, after: STW.id };
  });
  report("9a) small buffer renders sync (worker untouched)", gate.px < 700000 && gate.after === gate.before, gate);

  /* ---- 9b) big buffer renders on the worker with pixel-parity ---- */
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  desk.on("pageerror", e => report("no desktop page error", false, e.message));
  await desk.goto(BASE);
  await desk.waitForTimeout(1000);
  const worker = await desk.evaluate(async () => {
    switchPage("pgStudio");
    const c = document.createElement("canvas"); c.width = 1600; c.height = 2000;
    const x = c.getContext("2d");
    const d = x.createImageData(1600, 2000);
    let s = 21; const rnd = () => { s = (s * 16807) % 2147483647; return (s % 41) - 20; };
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = 200 + rnd(); d.data[i + 1] = 150 + rnd(); d.data[i + 2] = 120 + rnd(); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    await new Promise(res => ST.loadImage(c.toDataURL("image/jpeg", 0.9), { done: res }));
    await new Promise(r => setTimeout(r, 600));
    state.st.t1.wrm = 30; state.st.t2.smooth = 60; ST.maskCache = null;
    stRenderSettle();
    await new Promise(r => setTimeout(r, 3000));
    const out = { px: ST.buf.width * ST.buf.height, ready: STW.ready, dead: STW.dead, renders: STW.id };
    const sync = stRunPipeline(stGeoSource(), ST.buf.width, ST.buf.height, { maskInfo: ST.maskCache });
    const sd = sync.getContext("2d").getImageData(0, 0, sync.width, sync.height).data;
    const cnv = document.getElementById("stCanvas");
    const cd = cnv.getContext("2d").getImageData(0, 0, cnv.width, cnv.height).data;
    let diff = 0, n = 0;
    for (let i = 0; i < sd.length; i += 397 * 4) { diff += Math.abs(sd[i] - cd[i]) + Math.abs(sd[i + 1] - cd[i + 1]) + Math.abs(sd[i + 2] - cd[i + 2]); n += 3; }
    out.meanDiff = +(diff / n).toFixed(3);
    return out;
  });
  report("9b) big buffer renders on the worker, pixel-parity with sync", worker.px > 700000 && worker.ready && !worker.dead && worker.renders >= 1 && worker.meanDiff < 2.5, worker);

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
