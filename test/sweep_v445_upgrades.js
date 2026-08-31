/* v4.45.0 regression sweep — Edit-pages Wave 3 (house style, presets,
   hand-off) + the 880-style Retouch A/Retouch B reference pack.

   Pinned contracts:
   A) 880 pack: both suites carry a Style Looks group (17 Retouch A + 17 Retouch B
      groups total), catalog serves 880 records, picking a style sets
      state.st.refX (IMAGE 2) + queues the st_style880 pend edit whose frag
      carries the pack's instruction + identity lock, tap-again clears.
   B) ONE recipe store: stSaveRecipe (named at save time) lands in
      hnk_st_recipes AND registers as a pt_rc_ Path look; btnPtFromStudio
      delegates to the same store; ptBake runs any recipe look through the
      real Studio pipeline.
   C) Pinned house recipe: star on a recipe card pins by stable id;
      stLoadImage auto-applies it to a fresh (clean) photo with an Undo toast.
   D) Shared result hand-off row on Create/Studio/Retouch + Path-sheet
      Retouch button; the Path chip really ingests into PT.photos.
   E) V2 named presets: save prompts for a name, one tap restores all
      10 params, persisted via saveState(v2Presets).
   F) Job presets: starred prompt-history rows carry a name chip + a run
      chip; pushPromptHistory snapshots the generate settings.
   G) Watermark: wmStampDataUrl stamps the stored logo on delivery paths
      only (bottom-right red probe), masters stay clean when off.
   H) Editable IMAGE roles: cycling chip writes the role sentence into
      state.imgRoles; typing in the prompt no longer clears hand-set roles.
   I) Ref source sheet: an empty slot opens Upload/Library/Gallery options.
   J) Repositionable crop: geo.ox/oy move the window (ox=0 keeps the left
      edge, ox=1 the right edge).
   K) Path look strength: 50% halves the t1 grade, the prompt says so, and
      the chips row renders 4 options.

   Usage: PORT=8931 node test/sweep_v445_upgrades.js  (serve docs/app first) */
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

  /* ---- A) 880 style pack ---- */
  const packA = await page.evaluate(async () => {
    const out = {};
    switchPage("pgStudio");
    await new Promise(r => setTimeout(r, 250));
    out.muGroups = document.querySelectorAll("#muHost > .grp").length;
    out.evGroups = document.querySelectorAll("#evHost > .grp").length;
    const g880 = Array.from(document.querySelectorAll("#muHost > .grp")).pop();
    out.badgeLaw = g880.querySelector(".cnt").textContent === String(stCountControls(g880)) + t("unit");
    g880.querySelector(".grp-h").click();
    await new Promise(r => setTimeout(r, 1800));
    out.catalog = !!(ST880.list && ST880.list.length === 880);
    out.cards = g880.querySelectorAll(".st880-grid .pcard").length;
    g880.querySelector(".st880-grid .pcard").click();
    await new Promise(r => setTimeout(r, 1200));
    const sel = svGet("st_style880", null);
    out.refX = !!state.st.refX;
    out.pend = state.st.pend.some(p => p.id === "st_style880");
    out.usesRef = stUsesRefActive();
    const frag = out.pend ? stFragOf(state.st.pend.find(p => p.id === "st_style880")) : "";
    out.frag = /IMAGE 2/.test(frag) && /identity/i.test(frag) && /Style MKL-001/.test(frag);
    g880.querySelector(".st880-grid .pcard").click();
    await new Promise(r => setTimeout(r, 300));
    out.cleared = !svGet("st_style880", null) && !state.st.refX;
    return out;
  });
  report("A) 880 pack: 17+17 groups, badge law, catalog, pick→IMAGE 2 + pend, clear",
    packA.muGroups === 17 && packA.evGroups === 17 && packA.badgeLaw && packA.catalog &&
    packA.cards === 50 && packA.refX && packA.pend && packA.usesRef && packA.frag && packA.cleared, packA);

  /* ---- B) one recipe store ---- */
  const storeB = await page.evaluate(async () => {
    const out = {};
    localStorage.removeItem("hnk_st_recipes");
    window.prompt = () => "Sweep Warm";
    state.st.t1.wrm = 30;
    out.saved = stSaveRecipe() === true;
    const store = JSON.parse(localStorage.getItem("hnk_st_recipes") || "[]");
    out.named = (store[0] || {}).name === "Sweep Warm";
    out.hasId = typeof (store[0] || {}).id === "number";
    ptRegisterRecipeLooks();
    out.railLook = !!(PT_LOOKS.pt_rc_0 && PT_LOOKS.pt_rc_0.recipe && PT_LOOKS.pt_rc_0.recipe.t1.wrm === 30);
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 300));
    ptRenderRail();
    out.railCard = Array.from(document.querySelectorAll("#ptLookRail .pcard span")).some(s => s.textContent === "Sweep Warm");
    /* btnPtFromStudio delegates to the SAME store and selects pt_rc_0 */
    window.prompt = () => "Bridge Two";
    state.st.t2.smooth = 40;
    document.getElementById("btnPtFromStudio").click();
    out.bridgeLook = state.pt.look === "pt_rc_0";
    out.bridgeStore = (JSON.parse(localStorage.getItem("hnk_st_recipes") || "[]")[0] || {}).name === "Bridge Two";
    state.st.t1.wrm = 0; state.st.t2.smooth = 0;
    return out;
  });
  report("B) one recipe store: named save + id, pt_rc_ look, rail card, bridge delegates",
    storeB.saved && storeB.named && storeB.hasId && storeB.railLook && storeB.railCard &&
    storeB.bridgeLook && storeB.bridgeStore, storeB);

  /* ---- C) pinned house recipe auto-applies ---- */
  const pinC = await page.evaluate(async () => {
    const out = {};
    switchPage("pgStudio");
    await new Promise(r => setTimeout(r, 250));
    stPinRecipe(0); /* "Bridge Two" (smooth 40) */
    out.pinned = +(localStorage.getItem("hnk_st_defRecipe") || 0) > 0;
    out.star = !!document.querySelector("#stRecipeRow .pcard .pin");
    /* clean session, then load a fresh photo */
    state.st.t1 = stDefT1(); state.st.t2 = stDefT2(); state.st.preset = null; ST.presetSnap = null;
    const c = document.createElement("canvas"); c.width = 120; c.height = 120;
    c.getContext("2d").fillStyle = "#b09070";
    c.getContext("2d").fillRect(0, 0, 120, 120);
    await new Promise(res => ST.loadImage(c.toDataURL("image/png"), { done: res }));
    await new Promise(r => setTimeout(r, 500));
    out.applied = state.st.t2.smooth === 40;
    localStorage.removeItem("hnk_st_defRecipe");
    localStorage.removeItem("hnk_st_recipes");
    state.st.t2.smooth = 0; state.st.preset = null; ST.presetSnap = null;
    return out;
  });
  report("C) pinned house recipe: star pin + auto-apply on fresh photo",
    pinC.pinned && pinC.star && pinC.applied, pinC);

  /* ---- D) hand-off rows ---- */
  const hoD = await page.evaluate(async () => {
    const out = {};
    const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    state.hist = [{ mime: "image/png", b64: B64 }];
    state.histSel = 0; state.result = state.hist[0];
    showResult();
    out.create = document.querySelectorAll("#handoffCreate .chip").length >= 3;
    switchPage("pgRetouch");
    await new Promise(r => setTimeout(r, 250));
    state.refs[0] = { mime: "image/png", b64: B64, label: "x.png" };
    rsShowResult();
    out.retouch = document.querySelectorAll("#handoffRetouch .chip").length >= 2;
    out.studioHost = !!document.getElementById("handoffStudio");
    out.ptBtn = !!document.getElementById("btnPtRetouchOne");
    /* the Path chip really ingests */
    const pathChip = Array.from(document.querySelectorAll("#handoffRetouch .chip")).find(c => /Path/.test(c.textContent));
    const before = PT.photos.length;
    pathChip.click();
    await new Promise(r => setTimeout(r, 400));
    out.ingested = PT.photos.length === before + 1;
    PT.photos = []; ptSync();
    state.hist = []; state.result = null; state.refs[0] = null;
    return out;
  });
  report("D) hand-off: rows on Create/Retouch, Studio host, Path-sheet Retouch btn, real ingest",
    hoD.create && hoD.retouch && hoD.studioHost && hoD.ptBtn && hoD.ingested, hoD);

  /* ---- E) V2 named presets ---- */
  const v2E = await page.evaluate(async () => {
    const out = {};
    switchPage("pgRetouch");
    await new Promise(r => setTimeout(r, 250));
    window.prompt = () => "Groom 80";
    state.v2.strength = 80; state.v2.blemish = 70;
    v2SavePreset();
    out.saved = state.v2Presets.length === 1 && state.v2Presets[0].name === "Groom 80";
    out.persisted = JSON.parse(localStorage.getItem("hnk_web_studio_v1") || localStorage.getItem("hnk_ws_state") || "{}");
    /* find whichever LS key carries v2Presets */
    out.inLS = Object.keys(localStorage).some(k => {
      try { const o = JSON.parse(localStorage.getItem(k)); return o && Array.isArray(o.v2Presets) && o.v2Presets.length === 1; }
      catch (e) { return false; }
    });
    state.v2.strength = 30;
    Array.from(document.querySelectorAll("#v2PresetRow .chip")).find(c => /Groom 80/.test(c.textContent)).click();
    out.loaded = state.v2.strength === 80 && state.v2.blemish === 70;
    state.v2Presets = []; saveState(); renderV2Hero();
    return out;
  });
  report("E) V2 presets: named save, persisted, one-tap restore of all params",
    v2E.saved && v2E.inLS && v2E.loaded, v2E);

  /* ---- F) job presets on starred history ---- */
  const jobF = await page.evaluate(() => {
    const out = {};
    localStorage.setItem("hnk_ws_prompts", JSON.stringify([{ p: "sweep job preset prompt", star: true, snap: { selRatio: "1:1" } }]));
    renderPromptHist();
    const row = document.querySelector("#promptHist .row");
    out.chips = row ? row.querySelectorAll(".chip").length : 0;
    /* snapshot rides pushPromptHistory */
    document.getElementById("selRatio").value = document.getElementById("selRatio").options[0].value;
    pushPromptHistory("another sweep prompt xyz");
    const list = JSON.parse(localStorage.getItem("hnk_ws_prompts") || "[]");
    const fresh = list.find(it => it.p === "another sweep prompt xyz");
    out.snap = !!(fresh && fresh.snap && typeof fresh.snap.selRatio === "string" && fresh.snap.rt !== undefined);
    localStorage.removeItem("hnk_ws_prompts");
    renderPromptHist();
    return out;
  });
  report("F) job presets: starred row has name+run chips, history snapshots settings",
    jobF.chips >= 4 && jobF.snap, jobF);

  /* ---- G) watermark stamps delivery only ---- */
  const wmG = await page.evaluate(async () => {
    const out = {};
    const mk = (w, h, color) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.fillStyle = color; x.fillRect(0, 0, w, h);
      return c;
    };
    localStorage.setItem("hnk_wm_logo", mk(64, 64, "#ff0000").toDataURL("image/png"));
    state.st.v.st_wm_on = true;
    const src = mk(400, 300, "#202020").toDataURL("image/png");
    const stamped = await new Promise(res => wmStampDataUrl(src, "image/png", 92, res));
    const im = new Image();
    await new Promise(r => { im.onload = r; im.src = stamped; });
    const cc = document.createElement("canvas"); cc.width = im.width; cc.height = im.height;
    cc.getContext("2d").drawImage(im, 0, 0);
    const d = cc.getContext("2d").getImageData(0, 0, cc.width, cc.height).data;
    const px = ((cc.height - 20) * cc.width + (cc.width - 20)) * 4;
    out.stamped = d[px] > 100 && d[px + 1] < 90;
    /* off → passthrough (clean master) */
    state.st.v.st_wm_on = false;
    const clean = await new Promise(res => wmStampDataUrl(src, "image/png", 92, res));
    out.cleanOff = clean === src;
    out.ui = !!document.getElementById("stWmTgl") && !!document.getElementById("stWmPick");
    localStorage.removeItem("hnk_wm_logo");
    return out;
  });
  report("G) watermark: stamped on delivery, passthrough when off, settings UI present",
    wmG.stamped && wmG.cleanOff && wmG.ui, wmG);

  /* ---- H) editable IMAGE roles ---- */
  const roleH = await page.evaluate(async () => {
    const out = {};
    const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    state.refs[1] = { mime: "image/png", b64: B64, label: "x" };
    state.imgRoles = null; renderRefs();
    const rc = document.querySelector("#refs .refrole");
    out.chip = !!rc;
    rc.click();
    out.cycled = !!(state.imgRoles && /SECOND PERSON/.test(state.imgRoles[1]));
    document.getElementById("prompt").dispatchEvent(new Event("input"));
    out.survives = !!(state.imgRoles && /SECOND PERSON/.test(state.imgRoles[1]));
    /* wizard-set roles DO clear on typing */
    state.imgRoles = ["a", "b"]; state.imgRolesFromWiz = true;
    document.getElementById("prompt").dispatchEvent(new Event("input"));
    out.wizCleared = state.imgRoles === null;
    state.refs[1] = null; state.imgRoles = null; renderRefs();
    return out;
  });
  report("H) IMAGE roles: chip cycles, hand-set survives typing, wizard roles still clear",
    roleH.chip && roleH.cycled && roleH.survives && roleH.wizCleared, roleH);

  /* ---- I) ref source sheet ---- */
  const sheetI = await page.evaluate(() => {
    const out = {};
    document.querySelector("#refs .add").click();
    out.open = !!document.getElementById("refSrcSheet");
    out.opts = document.querySelectorAll("#refSrcSheet .btn").length >= 3;
    const sheet = document.getElementById("refSrcSheet");
    if (sheet) sheet.remove();
    return out;
  });
  report("I) ref source sheet opens with Upload/Library/Gallery options", sheetI.open && sheetI.opts, sheetI);

  /* ---- J) repositionable crop ---- */
  const cropJ = await page.evaluate(() => {
    const out = {};
    const grad = document.createElement("canvas"); grad.width = 200; grad.height = 100;
    const gx = grad.getContext("2d");
    gx.fillStyle = "#ff0000"; gx.fillRect(0, 0, 100, 100);
    gx.fillStyle = "#0000ff"; gx.fillRect(100, 0, 100, 100);
    state.st.geo.crop = "1:1"; state.st.geo.ox = 0; state.st.geo.oy = 0.5;
    const left = stApplyGeo(grad).getContext("2d").getImageData(10, 50, 1, 1).data;
    state.st.geo.ox = 1;
    const right = stApplyGeo(grad).getContext("2d").getImageData(90, 50, 1, 1).data;
    out.moves = left[0] > 200 && right[2] > 200;
    out.chips = document.querySelectorAll("#stGeoPosChips .chip").length === 9;
    state.st.geo.crop = null; state.st.geo.ox = 0.5; state.st.geo.oy = 0.5;
    return out;
  });
  report("J) crop window repositions (ox 0/1) + 9-anchor chips", cropJ.moves && cropJ.chips, cropJ);

  /* ---- K) Path look strength ---- */
  const strK = await page.evaluate(async () => {
    const out = {};
    switchPage("pgPath");
    await new Promise(r => setTimeout(r, 250));
    state.pt.strength = 50;
    const f50 = ptScaledT1(PT_LOOKS.pt_golden);
    out.half = Object.keys(PT_LOOKS.pt_golden.t1).every(k => Math.abs(f50[k] - Math.round(PT_LOOKS.pt_golden.t1[k] * 0.5)) <= 1);
    state.pt.look = "pt_golden";
    out.prompt = /Strength 50%/.test(ptBuildPrompt(null));
    ptRenderChips();
    out.chips = document.querySelectorAll("#ptStrengthChips .chip").length === 4;
    state.pt.strength = 100; state.pt.look = PT_DEF.look;
    return out;
  });
  report("K) Path strength: t1 halves at 50%, prompt sentence, 4 chips", strK.half && strK.prompt && strK.chips, strK);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
