/* Regression sweep for pgStudio v5's tiered live-preview engine (v4.23.0):
   - Tier 1: a slider's input event recomposes the photo's CSS filter in the
     SAME tick (no pixel work in the drag loop)
   - Preset cards: tapping one applies its t1/t2 instantly, queues its Tier-3
     list as pending chips, reflects t2 values in the sliders and highlights
     the card; tapping again restores the exact prior state
   - Tier 2: after the 120ms settle debounce, the canvas pixels actually
     change and skin-smoothing measurably reduces local luma variance
   Usage: PORT=8931 node test/sweep_studio_livepreview.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  // 0) load a synthetic skin-toned noisy fixture through the public ST.loadImage API
  const loaded = await page.evaluate(async () => {
    switchPage("pgStudio");
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const x = c.getContext("2d");
    const d = x.createImageData(64, 64);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = () => Math.random() * 60 - 30; // noise so smoothing has variance to kill
      d.data[i] = 224 + n(); d.data[i + 1] = 172 + n(); d.data[i + 2] = 140 + n(); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    window.__fixture = c.toDataURL("image/png");
    await new Promise(res => { ST.loadImage(window.__fixture, { done: res }); });
    return {
      hasBitmap: !!ST.srcBitmap,
      stageShown: document.getElementById("stStage").style.display !== "none",
      refSet: !!(state.refs[0] && state.refs[0].label === "studio")
    };
  });
  report("ST.loadImage loads a photo into the stage and slot 0", loaded.hasBitmap && loaded.stageShown && loaded.refSet, JSON.stringify(loaded));

  // 1) Tier-1 synchronous drag loop: setting exposure recomposes style.filter in the SAME tick
  const t1 = await page.evaluate(() => {
    const inp = document.getElementById("mu_exp");
    inp.value = "20";
    inp.dispatchEvent(new Event("input", { bubbles: true })); // fires oninput synchronously
    return { filter: document.getElementById("stCanvas").style.filter };
  });
  report("Tier-1 slider recomposes CSS filter synchronously (2^0.2 ≈ 1.1487)",
    /brightness\(1\.14[0-9]*/.test(t1.filter), t1.filter.slice(0, 90));

  // reset before the preset check
  await page.evaluate(() => { document.getElementById("stReset").click(); });
  await page.waitForTimeout(250);

  // 2) preset card (Goddess, index 2): 3 pending AI chips + t2 reflected in sliders + card .on
  const preset = await page.evaluate(() => {
    document.querySelectorAll("#muPresetRow .pcard")[2].click(); // muGoddess
    return {
      pendChips: document.querySelectorAll("#stPendChips .chip").length,
      pendIds: state.st.pend.map(p => p.id).sort().join(","),
      cardOn: document.querySelectorAll("#muPresetRow .pcard")[2].classList.contains("on"),
      smoothSlider: document.getElementById("mu_smooth").value,
      whiteSlider: document.getElementById("mu_white").value,
      t2smooth: state.st.t2.smooth,
      filterNow: document.getElementById("stCanvas").style.filter.length > 0
    };
  });
  report("Goddess preset queues 3 AI chips, reflects t2 in sliders, highlights card and filters instantly",
    preset.pendChips === 3 && preset.pendIds === "mu_eye,mu_faceSlim,mu_makeup" &&
    preset.cardOn && preset.smoothSlider === "50" && preset.whiteSlider === "30" &&
    preset.t2smooth === 50 && preset.filterNow, JSON.stringify(preset));

  // 3) tapping the same card again restores the snapshot (chips gone, params back to defaults)
  const undo = await page.evaluate(() => {
    document.querySelectorAll("#muPresetRow .pcard")[2].click();
    return {
      pendChips: document.querySelectorAll("#stPendChips .chip").length,
      cardOn: document.querySelectorAll("#muPresetRow .pcard")[2].classList.contains("on"),
      t2smooth: state.st.t2.smooth,
      smoothSlider: document.getElementById("mu_smooth").value
    };
  });
  report("tapping the active preset again restores the pre-preset state",
    undo.pendChips === 0 && !undo.cardOn && undo.t2smooth === 0 && undo.smoothSlider === "0", JSON.stringify(undo));

  // 4) Tier-2 settle: smoothing changes pixels within the budget and reduces local variance
  const t2 = await page.evaluate(async () => {
    function snap() {
      const c = document.getElementById("stCanvas");
      const x = c.getContext("2d");
      const d = x.getImageData(0, 0, Math.min(8, c.width), Math.min(8, c.height)).data;
      let lums = [];
      for (let i = 0; i < d.length; i += 4) lums.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const varc = lums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lums.length;
      return { url: c.toDataURL().length + ":" + c.toDataURL().slice(100, 140), varc };
    }
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    const before = snap();
    const inp = document.getElementById("mu_smooth");
    inp.value = "80";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400)); // > 120ms debounce + render budget
    const after = snap();
    return { changed: before.url !== after.url, varBefore: before.varc, varAfter: after.varc };
  });
  report("Tier-2 settle re-renders pixels and smoothing reduces luma variance",
    t2.changed && t2.varAfter < t2.varBefore,
    `var ${t2.varBefore.toFixed(1)} -> ${t2.varAfter.toFixed(1)}`);

  // 5) pending chip's ✕ clears the feature and its control
  const chipX = await page.evaluate(() => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("mu_faceSlim");
    inp.value = "40";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const chipsAfterSet = document.querySelectorAll("#stPendChips .chip").length;
    document.querySelector("#stPendChips .chip .st-x").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return {
      chipsAfterSet,
      chipsAfterX: document.querySelectorAll("#stPendChips .chip").length,
      sliderAfterX: document.getElementById("mu_faceSlim").value
    };
  });
  report("a pending chip's remove control clears the queue entry and resets its slider",
    chipX.chipsAfterSet === 1 && chipX.chipsAfterX === 0 && chipX.sliderAfterX === "0", JSON.stringify(chipX));

  // 6) cross-suite shared-key sync: ev_exp drives t1.exp + same-tick filter; mu_exp mirrors after stRefreshUI
  const shared = await page.evaluate(() => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("ev_exp");
    inp.value = "20";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const filter = document.getElementById("stCanvas").style.filter;
    const t1exp = state.st.t1.exp;
    stRefreshUI();
    const mirror = document.getElementById("mu_exp").value;
    document.getElementById("stReset").click();
    return { filter: filter.slice(0, 40), t1exp, mirror };
  });
  report("EV Tone Pro ev_exp syncs t1.exp, recomposes the filter same-tick and mirrors into mu_exp",
    /brightness\(1\.14[0-9]*/.test(shared.filter) && shared.t1exp === 20 && shared.mirror === "20",
    JSON.stringify(shared));

  // 7) HSL settle pass: red-band hue +60 shifts pixels & mean hue; all-zero HSL skips the pass entirely
  const hsl = await page.evaluate(async () => {
    function snap() { return document.getElementById("stCanvas").toDataURL(); }
    function meanHue() { // circular mean (unit-vector average) — plain averaging breaks at the 0°/360° wrap
      const c = document.getElementById("stCanvas");
      const d = c.getContext("2d").getImageData(0, 0, 8, 8).data;
      let sx = 0, sy = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
        let h = 0;
        if (dl) { if (mx === r) h = 60 * (((g - b) / dl) % 6); else if (mx === g) h = 60 * ((b - r) / dl + 2); else h = 60 * ((r - g) / dl + 4); if (h < 0) h += 360; }
        sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180);
      }
      let a = Math.atan2(sy, sx) * 180 / Math.PI;
      return a < 0 ? a + 360 : a;
    }
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    const before = snap(), hueBefore = meanHue();
    const inp = document.getElementById("ev_hslH"); // red band selected by default
    inp.value = "60"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const after = snap(), hueAfter = meanHue();
    inp.value = "0"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const zeroed = snap();
    const shift = ((hueAfter - hueBefore + 540) % 360) - 180; // signed circular delta
    return { changed: before !== after, hueShift: shift, skipEqual: zeroed === before };
  });
  report("HSL settle pass: red hue +60 changes pixels and shifts mean hue; all-zero skips the pass",
    hsl.changed && hsl.hueShift > 2 && hsl.skipEqual,
    `hueShift ${hsl.hueShift.toFixed(1)} skipEqual ${hsl.skipEqual}`);

  // 8) whites/blacks + parametric curve extend ST.lutKey (cache invalidation carries the new params)
  const lutKey = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    const w = document.getElementById("ev_wht");
    w.value = "30"; w.dispatchEvent(new Event("input", { bubbles: true }));
    const cv = document.getElementById("st_curve_hl");
    cv.value = "20"; cv.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const key = ST.lutKey;
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    return { key, parts: key.split(",").length, hasWht: key.split(",")[6] === "30", hasCurve: key.split(",").indexOf("20") >= 9 };
  });
  report("LUT key extends with whites/blacks + parametric-curve params (cache invalidates)",
    lutKey.parts >= 13 && lutKey.hasWht && lutKey.hasCurve, lutKey.key);

  // 9) geometry: crop swaps canvas dims + invalidates the mask cache; rotate 90 swaps buffer dims; bake matches
  const geo = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 250));
    const chips = document.querySelectorAll("#stGeoCropChips .chip");
    chips[1].click(); // 4:5 on the 64x64 fixture -> 51x64
    const c = document.getElementById("stCanvas");
    const crop45 = { w: c.width, h: c.height, maskNull: ST.maskCache === null };
    document.getElementById("stGeoRot").click(); // -> 64x51
    const rot = { w: c.width, h: c.height };
    const baked = stBake();
    const dims = await new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.src = baked; });
    chips[0].click(); // 1:1 -> square
    const sq = { w: c.width, h: c.height };
    return { crop45, rot, dims, square: sq.w === sq.h };
  });
  report("geometry: 4:5 crop resizes buffer + nulls maskCache, rotate 90 swaps dims, stBake() dims match, 1:1 is square",
    geo.crop45.w < geo.crop45.h && geo.crop45.maskNull &&
    geo.rot.w === geo.crop45.h && geo.rot.h === geo.crop45.w &&
    geo.dims.w === geo.rot.w && geo.dims.h === geo.rot.h && geo.square,
    JSON.stringify(geo));

  // 10) sticky live stage (MUST #1 regression): deep-scrolled with a group open, the canvas stays in the viewport
  const sticky = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    document.querySelectorAll("#muHost .grp")[4].className = "grp open";
    document.querySelectorAll("#evHost .grp")[4].className = "grp open";
    document.scrollingElement.scrollTop = 2500;
    await new Promise(r => setTimeout(r, 300));
    const r2 = document.getElementById("stCanvas").getBoundingClientRect();
    const visible = r2.height > 0 && r2.bottom > 0 && r2.top < window.innerHeight;
    document.scrollingElement.scrollTop = 0;
    return { visible, top: r2.top, scrollY: 2500 };
  });
  report("sticky stage: canvas intersects the viewport while scrolled 2500px deep", sticky.visible, JSON.stringify(sticky));

  // 11) feature search: "teeth" hides non-matching groups, keeps teeth groups; clearing restores all
  const search = await page.evaluate(async () => {
    const inp = document.getElementById("stSearch");
    inp.value = "teeth"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const hidden = document.querySelectorAll("#muHost .grp.hide, #evHost .grp.hide").length;
    const teethVisible = !ST.grpOf["mu_teethFix"].classList.contains("hide") && !ST.grpOf["ev_teethR"].classList.contains("hide");
    const noseHidden = ST.grpOf["mu_nose"].classList.contains("hide");
    inp.value = ""; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const restored = document.querySelectorAll("#muHost .grp:not(.hide), #evHost .grp:not(.hide)").length;
    return { hidden, teethVisible, noseHidden, restored };
  });
  report("search: 'teeth' filters to teeth groups only and clearing restores 23+ groups",
    search.hidden > 0 && search.teethVisible && search.noseHidden && search.restored >= 23,
    JSON.stringify(search));

  // 12) value-readout tap resets that one slider
  const valTap = await page.evaluate(() => {
    const sm = document.getElementById("mu_smooth");
    sm.value = "80"; sm.dispatchEvent(new Event("input", { bubbles: true }));
    sm.parentElement.querySelector(".st-val").click();
    return { after: sm.value, t2: state.st.t2.smooth };
  });
  report("tapping the .st-val readout resets mu_smooth 80 -> 0", valTap.after === "0" && valTap.t2 === 0, JSON.stringify(valTap));

  // 13) dirty badges + full reset covers the new t1 keys and geometry
  const dirty = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("mu_faceSlim");
    inp.value = "30"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    const dot = ST.grpOf["mu_faceSlim"].querySelector(".grp-h .dot");
    const dotOn = dot.classList.contains("on") && dot.textContent === "1";
    const w = document.getElementById("ev_wht"); w.value = "25"; w.dispatchEvent(new Event("input", { bubbles: true }));
    const g = document.getElementById("mu_glow"); g.value = "40"; g.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelectorAll("#stGeoCropChips .chip")[0].click();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 300));
    const t1 = state.st.t1;
    return {
      dotOn,
      dotsAfterReset: document.querySelectorAll("#pgStudio .grp-h .dot.on").length,
      newKeysZero: t1.wht === 0 && t1.blk === 0 && t1.dhz === 0 && t1.glow === 0,
      geoDefault: !state.st.geo.crop && !state.st.geo.rot && !state.st.geo.flipH && !state.st.geo.straighten
    };
  });
  report("dirty badge shows '1' for mu_faceSlim; stReset clears all dots + new t1 keys + geometry",
    dirty.dotOn && dirty.dotsAfterReset === 0 && dirty.newKeysZero && dirty.geoDefault, JSON.stringify(dirty));

  // 14) empty-state nudge: with no photo, a slider move toasts the need-photo hint (and throws nothing)
  let pageErrors = 0;
  page.on("pageerror", () => pageErrors++);
  const nudge = await page.evaluate(async () => {
    state.refs[0] = null; renderRefs();
    await new Promise(r => setTimeout(r, 100));
    const stageHidden = document.getElementById("stStage").style.display === "none";
    const dropzone = !!document.querySelector("#stPicker .ref.stbig");
    const inp = document.getElementById("mu_bri");
    inp.value = "30"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    const toastEl = document.getElementById("toast");
    return { stageHidden, dropzone, toastOn: toastEl.className.indexOf("on") >= 0 };
  });
  report("empty-state: stage hidden, dropzone shown, slider input toasts the need-photo nudge with no pageerror",
    nudge.stageHidden && nudge.dropzone && nudge.toastOn && pageErrors === 0, JSON.stringify(nudge));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
