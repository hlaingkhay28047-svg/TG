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

  /* ================= v4.27.1 — always-visible preview + comfort (#15-#22) ================= */

  // 15) guarantee sweep (§2.2): canvas >=120px AND controls window >=130px at every depth on
  //     320/360/390 portrait, with the slider under the finger hit-testing as itself (not btnStGen).
  //     #14 removed the photo — reload a portrait fixture through the public API first.
  await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 640;
    const x = c.getContext("2d");
    const d = x.createImageData(512, 640);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = () => Math.random() * 60 - 30;
      d.data[i] = 224 + n(); d.data[i + 1] = 172 + n(); d.data[i + 2] = 140 + n(); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    window.__fixture2 = c.toDataURL("image/png");
    await new Promise(res => { ST.loadImage(window.__fixture2, { done: res }); });
    document.getElementById("stReset").click();
    /* stReset's own Undo toast holds 7s; the sweep is a layout guarantee, so
       dismiss it (the toast contract itself is pinned by check #15t below) */
    document.getElementById("toast").className = "toast";
    document.querySelectorAll("#muHost .grp, #evHost .grp").forEach(g => { g.className = "grp open"; });
  });
  const g15 = { ok: true, hits: 0, log: [] };
  for (const vp of [[320, 568], [360, 740], [390, 844]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(320);
    let vpHits = 0;
    for (const f of [0.25, 0.5, 0.75, 0.95]) {
      await page.evaluate(fr => {
        const se = document.scrollingElement;
        se.scrollTop = fr * (se.scrollHeight - window.innerHeight);
      }, f);
      await page.waitForTimeout(260);
      const m = await page.evaluate(() => {
        const nav = document.querySelector(".nav").getBoundingClientRect();
        const cr = document.getElementById("stCanvas").getBoundingClientRect();
        const jb = document.getElementById("stJumpBar").getBoundingClientRect();
        const gb = document.getElementById("stGenBar").getBoundingClientRect();
        const visH = Math.min(cr.bottom, window.innerHeight) - Math.max(cr.top, nav.bottom);
        let rngTried = 0, hitOk = true, hit = "";
        for (const r of document.querySelectorAll("#pgStudio .rng")) {
          const rr = r.getBoundingClientRect();
          if (rr.height < 2) continue;
          if (rr.top >= jb.bottom + 2 && rr.bottom <= gb.top - 2) {
            rngTried = 1;
            const el = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
            hitOk = el === r;
            hit = el ? (el.id || el.className || el.tagName) : "null";
            break;
          }
        }
        return { visH: Math.round(visH * 10) / 10, win: Math.round(gb.top - jb.bottom), rngTried, hitOk, hit: String(hit).slice(0, 24) };
      });
      if (!(m.visH >= 119.5 && m.win >= 130)) { g15.ok = false; g15.log.push(vp.join("x") + "@" + f + " " + JSON.stringify(m)); }
      if (m.rngTried) { vpHits++; if (!m.hitOk) { g15.ok = false; g15.log.push(vp.join("x") + "@" + f + " hit=" + m.hit); } }
    }
    // deterministic hit-test: park a mid-list slider in the middle of the controls window
    // (fractional depths can legitimately land on chips-only groups)
    const t = await page.evaluate(async () => {
      const rngs = Array.from(document.querySelectorAll("#pgStudio .rng")).filter(r => r.getBoundingClientRect().height > 2);
      const r = rngs[Math.floor(rngs.length / 2)];
      const jb = document.getElementById("stJumpBar").getBoundingClientRect();
      const gb = document.getElementById("stGenBar").getBoundingClientRect();
      const rr = r.getBoundingClientRect();
      document.scrollingElement.scrollTop += rr.top + rr.height / 2 - (jb.bottom + gb.top) / 2;
      await new Promise(res => setTimeout(res, 260));
      const rr2 = r.getBoundingClientRect();
      const jb2 = document.getElementById("stJumpBar").getBoundingClientRect();
      const gb2 = document.getElementById("stGenBar").getBoundingClientRect();
      const inside = rr2.top >= jb2.bottom + 2 && rr2.bottom <= gb2.top - 2;
      const el = document.elementFromPoint(rr2.left + rr2.width / 2, rr2.top + rr2.height / 2);
      return { inside, hitOk: el === r, hit: el ? (el.id || el.tagName) : "null", id: r.id };
    });
    if (!(t.inside && t.hitOk)) { g15.ok = false; g15.log.push(vp.join("x") + " targeted " + JSON.stringify(t)); }
    else vpHits++;
    g15.hits += vpHits;
  }
  report("v4.27.1 guarantee: canvas >=120px + controls window >=130px + slider hit-test, 320/360/390 x 4 depths",
    g15.ok, g15.log.length ? g15.log.join(" | ") : g15.hits + " slider hit-tests passed");

  // 15t) the toast band never traps a drag: a routine toast is click-through
  //      (elementFromPoint passes to the control beneath), while the update
  //      banner (.tap) and an action button remain tappable.
  const tt = await page.evaluate(() => {
    const t = document.getElementById("toast");
    toast("hit-test probe", "ok");
    const plain = getComputedStyle(t).pointerEvents;
    const r = t.getBoundingClientRect();
    const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const passesThrough = under !== t;
    toast("with action", "ok", { label: "Undo", fn: function () {} });
    const act = t.querySelector(".toast-act");
    const actPe = act ? getComputedStyle(act).pointerEvents : "missing";
    t.className = "toast on ok tap";                       // the update banner's classes
    const bannerPe = getComputedStyle(t).pointerEvents;
    t.className = "toast";
    return { plain, passesThrough, actPe, bannerPe };
  });
  report("toast band is click-through (plain toast pe:none, under-element wins) while the action button and update banner stay tappable",
    tt.plain === "none" && tt.passesThrough && tt.actPe === "auto" && tt.bannerPe === "auto",
    JSON.stringify(tt));

  // 16) compact transition + scroll compensation (no layout jump) at 390x844
  const trans = await page.evaluate(async () => {
    const stg = document.getElementById("stStage");
    const se = document.scrollingElement;
    se.scrollTop = 0;
    await new Promise(r => setTimeout(r, 300));
    const fullH = document.getElementById("stCanvas").getBoundingClientRect().height;
    const natTop = stg.getBoundingClientRect().top + window.scrollY;
    se.scrollTop = natTop + 30; // just below the +40 enter threshold — still full
    await new Promise(r => setTimeout(r, 260));
    const stillFull = !stg.classList.contains("compact");
    const grp = document.querySelectorAll("#evHost .grp")[3];
    const h1 = grp.getBoundingClientRect().top;
    se.scrollTop += 40; // cross the threshold -> auto compact + compensation
    await new Promise(r => setTimeout(r, 300));
    const compact = stg.classList.contains("compact");
    const drift = grp.getBoundingClientRect().top - (h1 - 40);
    const compactH = document.getElementById("stCanvas").getBoundingClientRect().height;
    se.scrollTop = 0; // back to top -> full again
    await new Promise(r => setTimeout(r, 300));
    return {
      stillFull, compact, drift: Math.round(drift * 10) / 10, compactH,
      backFull: !stg.classList.contains("compact"),
      fullH, fullH2: document.getElementById("stCanvas").getBoundingClientRect().height
    };
  });
  report("compact transition: engages past stageTop+40 (canvas 160±2), no-jump |drift|<=4px, full again at top (253±2)",
    trans.stillFull && trans.compact && Math.abs(trans.drift) <= 4 &&
    Math.abs(trans.compactH - 160) <= 2 && trans.backFull && Math.abs(trans.fullH2 - 253) <= 2,
    JSON.stringify(trans));

  // 17) zoom loupe: CSS-transform only (toDataURL invariant), dblclick = 100% (buffer px : css px), split exclusivity
  await page.setViewportSize({ width: 420, height: 1000 });
  await page.waitForTimeout(320);
  const zoom = await page.evaluate(async () => {
    document.scrollingElement.scrollTop = 0;
    await new Promise(r => setTimeout(r, 250));
    const c = document.getElementById("stCanvas"), wrap = document.getElementById("stZoomWrap");
    const ind = document.getElementById("stZoomInd");
    const pre = c.toDataURL();
    ST.zoomTo(2);
    const t2 = getComputedStyle(c).transform;
    const indVis = ind && ind.style.display !== "none" && ind.classList.contains("on");
    const samePixels = c.toDataURL() === pre;
    ST.zoomReset();
    const tReset = getComputedStyle(c).transform;
    const indHidden = ind.style.display === "none";
    const wr = wrap.getBoundingClientRect();
    wrap.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: wr.left + wr.width / 2, clientY: wr.top + wr.height / 2 }));
    const native = c.width / c.clientWidth;
    const dblS = ST.ui.zoom.s;
    wrap.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: wr.left + 10, clientY: wr.top + 10 }));
    const dblBack = ST.ui.zoom.s;
    ST.zoomTo(2);
    document.getElementById("stSplit").click(); // entering split must reset zoom
    const splitOn = ST.split.on, sAfterSplit = ST.ui.zoom.s;
    document.getElementById("stSplit").click();
    return { t2, indVis, samePixels, tReset, indHidden, native, dblS, dblBack, splitOn, sAfterSplit };
  });
  report("zoom: scale-2 matrix + indicator, toDataURL identical, dblclick toggles fit/100%, split entry resets zoom",
    /^matrix\(2,/.test(zoom.t2) && zoom.indVis && zoom.samePixels && zoom.tReset === "none" && zoom.indHidden &&
    Math.abs(zoom.dblS - zoom.native) <= 0.01 && zoom.dblBack === 1 && zoom.splitOn && zoom.sAfterSplit === 1,
    JSON.stringify({ t2: zoom.t2.slice(0, 22), dblS: zoom.dblS, native: Math.round(zoom.native * 100) / 100, sAfterSplit: zoom.sAfterSplit }));

  // 18) stage preference memory (hnk_st_ui): pin compact -> survives reload; two more taps cycle back to auto
  const pin = await page.evaluate(() => {
    document.getElementById("stStageMin").click(); // auto -> compact (pinned)
    let ls = {};
    try { ls = JSON.parse(localStorage.getItem("hnk_st_ui") || "{}"); } catch (e) {}
    return { mode: ls.mode, compactNow: document.getElementById("stStage").classList.contains("compact") };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const pinBack = await page.evaluate(async () => {
    switchPage("pgStudio");
    const c = document.createElement("canvas"); c.width = 512; c.height = 640;
    const x = c.getContext("2d");
    const d = x.createImageData(512, 640);
    for (let i = 0; i < d.data.length; i += 4) { // noisy skin fixture again — #21's hold-swap needs pixel differences
      const n = () => Math.random() * 60 - 30;
      d.data[i] = 224 + n(); d.data[i + 1] = 172 + n(); d.data[i + 2] = 140 + n(); d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    await new Promise(res => { ST.loadImage(c.toDataURL("image/png"), { done: res }); });
    const restored = document.getElementById("stStage").classList.contains("compact");
    document.getElementById("stStageMin").click(); // compact -> mini
    const mini = document.getElementById("stStage").classList.contains("mini");
    document.getElementById("stStageMin").click(); // mini -> auto
    let ls = {};
    try { ls = JSON.parse(localStorage.getItem("hnk_st_ui") || "{}"); } catch (e) {}
    const stg = document.getElementById("stStage");
    return { restored, mini, mode: ls.mode, autoFull: !stg.classList.contains("compact") && !stg.classList.contains("mini") };
  });
  report("preference memory: compact pin persists in hnk_st_ui across reload; cycle compact->mini->auto",
    pin.mode === "compact" && pin.compactNow && pinBack.restored && pinBack.mini && pinBack.mode === "auto" && pinBack.autoFull,
    JSON.stringify({ pin, pinBack }));

  // 19) landscape PiP: 740x360 -> fixed thumbnail >=96px, --stageH collapses to 0, slim bars keep >=120px window
  await page.setViewportSize({ width: 740, height: 360 });
  await page.waitForTimeout(350);
  const pip = await page.evaluate(async () => {
    document.querySelectorAll("#muHost .grp, #evHost .grp").forEach(g => { g.className = "grp open"; });
    const se = document.scrollingElement;
    se.scrollTop = 0.6 * (se.scrollHeight - window.innerHeight);
    await new Promise(r => setTimeout(r, 300));
    const stg = document.getElementById("stStage");
    const cr = document.getElementById("stCanvas").getBoundingClientRect();
    const jb = document.getElementById("stJumpBar").getBoundingClientRect();
    const gb = document.getElementById("stGenBar").getBoundingClientRect();
    const visH = Math.min(cr.bottom, window.innerHeight) - Math.max(cr.top, 0);
    return {
      pip: stg.classList.contains("pip"),
      fixed: getComputedStyle(stg).position === "fixed",
      visH: Math.round(visH),
      stageH: getComputedStyle(document.getElementById("pgStudio")).getPropertyValue("--stageH").trim(),
      jumpH: Math.round(jb.height),
      win: Math.round(gb.top - jb.bottom)
    };
  });
  await page.setViewportSize({ width: 420, height: 1000 });
  await page.waitForTimeout(350);
  const pipGone = await page.evaluate(() => !document.getElementById("stStage").classList.contains("pip"));
  report("landscape PiP: fixed stage, canvas >=96px, --stageH 0px, jump bar <=50px, window >=120px; released on portrait",
    pip.pip && pip.fixed && pip.visH >= 96 && pip.stageH === "0px" && pip.jumpH <= 50 && pip.win >= 120 && pipGone,
    JSON.stringify(pip));

  // 20) zero horizontal overflow with compact/PiP chrome active
  const g20 = { ok: true, log: [] };
  for (const vp of [[320, 568], [360, 740], [740, 360]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(300);
    const m = await page.evaluate(async () => {
      const se = document.scrollingElement;
      se.scrollTop = 0.5 * (se.scrollHeight - window.innerHeight);
      await new Promise(r => setTimeout(r, 250));
      return { sw: se.scrollWidth, iw: window.innerWidth };
    });
    if (m.sw !== m.iw) { g20.ok = false; g20.log.push(vp.join("x") + ": " + m.sw + "!=" + m.iw); }
  }
  await page.setViewportSize({ width: 420, height: 1000 });
  await page.waitForTimeout(300);
  report("no horizontal overflow at 320/360 compact and 740x360 PiP", g20.ok, g20.log.join(" | "));

  // 21) Before-hold + A|B stay reachable (44px, on-screen) in deep-scrolled compact; hold still swaps pixels
  const hold21 = await page.evaluate(async () => {
    const se = document.scrollingElement;
    se.scrollTop = 0;
    await new Promise(r => setTimeout(r, 250));
    const sm = document.getElementById("mu_smooth");
    sm.value = "70"; sm.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400)); // settle
    se.scrollTop = 2500;
    await new Promise(r => setTimeout(r, 200));
    se.scrollTop = 2501; // second scroll event — the engine flips on scroll, not on a timer
    await new Promise(r => setTimeout(r, 250));
    const stg = document.getElementById("stStage");
    const y25 = window.scrollY, cls25 = stg.className, mode25 = ST.ui.mode, nat25 = ST._natTop;
    const hb = document.getElementById("stHold").getBoundingClientRect();
    const sb = document.getElementById("stSplit").getBoundingClientRect();
    const inVp = r => r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    const c = document.getElementById("stCanvas");
    const edited = c.toDataURL();
    const btn = document.getElementById("stHold");
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 }));
    await new Promise(r => setTimeout(r, 120));
    const held = c.toDataURL();
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
    await new Promise(r => setTimeout(r, 300));
    const released = c.toDataURL();
    se.scrollTop = 0;
    document.getElementById("stReset").click();
    await new Promise(r => setTimeout(r, 250));
    return {
      compact: cls25.indexOf("compact") >= 0, cls: cls25, mode: mode25, natTop: nat25, y: y25,
      holdMin: Math.round(Math.min(hb.width, hb.height)), splitMin: Math.round(Math.min(sb.width, sb.height)),
      holdIn: inVp(hb), splitIn: inVp(sb),
      swapped: held !== edited, restored: released === edited
    };
  });
  report("compact chip rail: Hold + A|B >=44px and fully on-screen deep-scrolled; hold swaps to source and back",
    hold21.compact && hold21.holdMin >= 44 && hold21.splitMin >= 44 && hold21.holdIn && hold21.splitIn &&
    hold21.swapped && hold21.restored, JSON.stringify(hold21));

  // 22) compatibility canary — check #10 verbatim: deep-scrolled canvas still intersects the viewport
  const sticky22 = await page.evaluate(async () => {
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
  report("canary (#10 verbatim): canvas intersects the viewport while scrolled 2500px deep", sticky22.visible, JSON.stringify(sticky22));

  // 23) v4.28 §10.1 — EXIT-direction scroll compensation. Scrolling slowly back
  // UP past natTop-120 re-expands the compact stage; the ~127px it regains used
  // to shove the content below it down, because the old compensation gate
  // required stuck(), which is never true at the exit threshold. Measure a
  // marker element's viewport position across the flip: it must barely move,
  // and the correction must not bounce the scroll back into the enter band.
  // The measurement is scroll-invariant: a marker below the stage in flow must
  // move by exactly the STEP the test itself scrolled, not by step + stage growth.
  const STEP23 = 20;
  const exit23 = await page.evaluate(async (STEP) => {
    const se = document.scrollingElement, stg = document.getElementById("stStage");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    se.scrollTop = 0; await sleep(300);
    const nat = ST._natTop;
    if (nat == null) return { skip: "no natTop" };
    se.scrollTop = Math.round(nat + 260); await sleep(120);
    se.scrollTop = Math.round(nat + 261); await sleep(320);   // enter band -> compact
    if (!stg.classList.contains("compact")) return { skip: "did not enter compact", cls: stg.className };
    // crawl up to just ABOVE the exit threshold (natTop-120) while still compact
    for (let y = Math.round(nat + 261); y > Math.round(nat - 110); y -= 40) { se.scrollTop = y; await sleep(30); }
    se.scrollTop = Math.round(nat - 110); await sleep(300);
    const stillCompact = stg.classList.contains("compact");
    // a plain, non-sticky card below the stage in normal flow
    const marker = document.getElementById("stRecipeCard");
    const before = marker.getBoundingClientRect().top, yBefore = window.scrollY;
    se.scrollTop = Math.round(nat - 110 - STEP);              // ONE step across the exit threshold
    await sleep(360);
    const after = marker.getBoundingClientRect().top, yAfter = window.scrollY;
    se.scrollTop = 0; await sleep(200);
    return {
      natTop: Math.round(nat), yBefore, yAfter, stillCompact,
      shift: Math.round(after - before),
      expanded: !stg.classList.contains("compact"),
      reentered: yAfter > nat + 40
    };
  }, STEP23);
  report("§10.1 exit-flip: crossing natTop-120 upward re-expands the stage while content below stays put (shift == the test's own scroll step)",
    !exit23.skip && exit23.stillCompact && exit23.expanded && !exit23.reentered
    && Math.abs(exit23.shift - STEP23) <= 15,
    JSON.stringify(exit23));
  await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
