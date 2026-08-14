/* v4.49.0 regression sweep — RunningHub model routing honesty.

   The owner asked: "when I change the model in Setup, does Generate REALLY
   switch too?" The dispatcher always resolved rhActiveModelCfg() at dispatch
   time (honest), but the Generate card hid the choice entirely — the Model
   dropdown was Gemini-only and RH runs named their model nowhere.

   Pinned contracts:
   A) With RunningHub selected, #selModel lists the CONFIGURED RH models
      (registry defaults included) and shows the current activeModel.
   B) Picking a model in the dropdown writes rhCfg().activeModel — the same
      field Setup's chips write — and rhActiveModelCfg() resolves to it
      (the dispatcher hands that .apiPath to rhGenerateOne).
   C) rhEngineLabel() names the resolved engine; V2 hero and Path tier card
      render it when provider is runninghub, hidden otherwise.
   D) Switching back to Gemini restores the exact 3-option Gemini dropdown.
   E) The #genEngine link becomes a manage-models Setup jump under RH.

   Usage: PORT=8931 node test/sweep_v449_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const out = {};
    state.rhKey = "TESTKEY";
    const cc = rhCfg();
    cc.models = { "nano-banana-2": { apiPath: "rhart-image-n-g31-flash/image-to-image" },
                  "seedream-v4-5": { apiPath: "seedream-v4.5/image-to-image" } };
    cc.activeModel = "nano-banana-2";
    rhSaveCfg(cc);
    renderRhProviderOption();
    switchPage("pgCreate");
    await new Promise(r2 => setTimeout(r2, 250));

    const sp = document.getElementById("selProvider");
    sp.value = "runninghub"; sp.dispatchEvent(new Event("change"));
    const sm = document.getElementById("selModel");
    const opts = Array.from(sm.options).map(o => o.value);
    out.A_visible = sm.style.display !== "none";
    out.A_filled = opts.length >= 10 && opts.indexOf("nano-banana-2") >= 0 && opts.indexOf("seedream-v4-5") >= 0;
    out.A_active = sm.value === "nano-banana-2";

    sm.value = "seedream-v4-5"; sm.dispatchEvent(new Event("change"));
    await new Promise(r2 => setTimeout(r2, 100));
    out.B_written = rhCfg().activeModel === "seedream-v4-5";
    out.B_resolves = rhActiveModelCfg().id === "seedream-v4-5" &&
      rhActiveModelCfg().apiPath === "seedream-v4.5/image-to-image";

    out.C_label = rhEngineLabel() === "RunningHub · Seedream v4.5";
    switchPage("pgRetouch"); await new Promise(r2 => setTimeout(r2, 250));
    renderV2Hero();
    const ven = document.getElementById("v2EngineNote");
    out.C_v2 = !!ven && ven.style.display !== "none" && ven.textContent.indexOf("Seedream v4.5") >= 0;
    switchPage("pgPath"); await new Promise(r2 => setTimeout(r2, 250));
    ptRenderChips();
    const pen = document.getElementById("ptEngineNote");
    out.C_pt = !!pen && pen.style.display !== "none" && pen.textContent.indexOf("Seedream v4.5") >= 0;

    switchPage("pgCreate"); await new Promise(r2 => setTimeout(r2, 200));
    out.E_manage = (document.getElementById("genEngine") || {}).style.display !== "none";
    sp.value = "gemini"; sp.dispatchEvent(new Event("change"));
    out.D_restored = Array.from(sm.options).map(o => o.value).join(",") ===
      "auto,gemini-2.5-flash-image,gemini-3-pro-image-preview";
    renderV2Hero();
    out.D_notesHidden = document.getElementById("v2EngineNote").style.display === "none";

    /* F) v4.49 fixes verified by the 880 adversarial review */
    await new Promise(res => st880Load(res));
    const lip = ST880.list.find(x => x.cat === "lipstick");
    const brow = ST880.list.find(x => x.cat === "eyebrow");
    st880Pick(lip); st880Pick(brow);                 /* second tap before the first commits */
    await new Promise(r2 => setTimeout(r2, 1500));
    out.F_raceCombines = st880Count() === 2;
    st880Clear();
    const blush = ST880.list.find(x => x.cat === "blush");
    st880Pick(blush); st880Clear();                  /* clear during an in-flight apply */
    await new Promise(r2 => setTimeout(r2, 1500));
    out.F_clearSticks = st880Count() === 0 && !state.st.refX;
    const hair = ST880.list.find(x => x.cat === "hairstyle");
    st880Pick(hair);
    await new Promise(r2 => setTimeout(r2, 900));
    out.F_evChk = ST.groups.filter(g => g.host === "ev").pop().chk[0]() === true;
    st880Clear();

    /* G) the Gemini model survives while the RH list occupies the dropdown */
    sp.value = "gemini"; sp.dispatchEvent(new Event("change"));
    sm.value = "gemini-3-pro-image-preview"; sm.dispatchEvent(new Event("change"));
    sp.value = "runninghub"; sp.dispatchEvent(new Event("change"));
    out.G_shadowKept = genGeminiModel() === "gemini-3-pro-image-preview";
    genSetGeminiModel("gemini-2.5-flash-image");     /* what a V2 tier run does */
    out.G_shadowWrite = genGeminiModel() === "gemini-2.5-flash-image";
    out.G_rhUntouched = sm.value === "seedream-v4-5";
    state.rhKey = "";
    return out;
  });

  report("A) RH provider fills #selModel with configured models, active selected",
    r.A_visible && r.A_filled && r.A_active, r);
  report("B) dropdown pick writes the shared activeModel; resolver follows",
    r.B_written && r.B_resolves, r);
  report("C) engine label renders on V2 + Path when RH is active",
    r.C_label && r.C_v2 && r.C_pt, r);
  report("D) Gemini restore brings back the exact 3-option dropdown, notes hide",
    r.D_restored && r.D_notesHidden, r);
  report("E) manage-models Setup link shows under RH", r.E_manage, r);
  report("F) 880 apply race: fast second tap combines, Clear all sticks, Evoto chk true",
    r.F_raceCombines && r.F_clearSticks && r.F_evChk, r);
  report("G) Gemini model shadow survives the RH dropdown takeover",
    r.G_shadowKept && r.G_shadowWrite && r.G_rhUntouched, r);
  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
