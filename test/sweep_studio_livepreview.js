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

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
