/* v4.41 upgrade-wave sweep — pins the wave's contracts:
   1. visual ratio chip rails (shape = aspect, tap writes the native select,
      model narrowing re-renders, upscale-kind hiding mirrors)
   2. Home: greeting header, 6-card grid art, gallery-backed Continue fallback
   3. Setup: readiness strip, About/updates card, backup export, key removal
   4. Workflow page: category jump rail, photo-count pills, alias search with
      live count, wedding sub-group chips, favorites hint
   5. Library: token-AND + Burmese alias search, favorites filter, full-screen
      viewer; Gallery: provenance line, n/60 meter, IMAGE 2, select-all
   6. Generate: engine-honest UI (Gemini model picker hidden on other
      providers), provider-aware button, ETA line, settings persistence,
      result provenance
   7. i18n: 30-language picker with my/en fallback resolution */
const { chromium } = require("playwright-core");
const BASE = "http://localhost:8931/index.html";
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS — " : "FAIL — ") + name + (ok ? "" : "  " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_web_studio_key", "AIzaTestKeyValue");
  });
  page.on("pageerror", e => report("no page error", false, e.message));
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  /* ---- 1) ratio chip rails ---- */
  const rail = await page.evaluate(async () => {
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    const rl = document.getElementById("selRatioRail");
    const chips = rl ? Array.from(rl.querySelectorAll(".rchip")) : [];
    const dims = {};
    chips.forEach(c => {
      const i = c.querySelector("i");
      dims[c.textContent] = i.style.width + "x" + i.style.height;
    });
    const tall = dims["9:16"] === "11pxx20px" || (parseInt(dims["9:16"]) < 20);
    const wide = dims["16:9"] && parseInt(dims["16:9"]) === 20;
    const target = chips.find(c => c.textContent === "3:4");
    target.click();
    const valAfterTap = document.getElementById("selRatio").value;
    // narrowing rebuild -> observer re-renders
    const sel = document.getElementById("selRatio");
    const keep = sel.innerHTML;
    sel.innerHTML = ""; ["3:2", "1:1"].forEach(v => { const o = document.createElement("option"); o.textContent = v; sel.appendChild(o); });
    await new Promise(r => setTimeout(r, 60));
    const narrowed = rl.querySelectorAll(".rchip").length === 2;
    sel.innerHTML = keep; sel.value = "";
    await new Promise(r => setTimeout(r, 60));
    // hiding mirrors
    sel.style.display = "none";
    await new Promise(r => setTimeout(r, 60));
    const hidden = rl.style.display === "none";
    sel.style.display = "";
    await new Promise(r => setTimeout(r, 60));
    return { chips: chips.length, tall, wide, valAfterTap, narrowed, hidden,
      t2i: !!document.getElementById("selT2IRatioRail"), vid: !!document.getElementById("selVidAspectRail"),
      nativeHidden: getComputedStyle(document.getElementById("selRatio")).display === "none" };
  });
  report("ratio rails: shape chips on all three pickers, tap writes the select, narrowing + hiding mirror",
    rail.chips >= 8 && rail.tall && rail.wide && rail.valAfterTap === "3:4" && rail.narrowed && rail.hidden && rail.t2i && rail.vid && rail.nativeHidden,
    rail);

  /* ---- 2) Home greeting + cards + statline intact ---- */
  const home = await page.evaluate(async () => {
    switchPage("pgDash");
    await new Promise(r => setTimeout(r, 250));
    const g = document.getElementById("dashGreet");
    return {
      greet: g && g.querySelector(".hi") && g.querySelector(".hi").textContent.length > 3,
      sub: g && !!g.querySelector(".sub"),
      cards: document.querySelectorAll("#dashGrid .dash-card").length,
      pathArt: !!document.querySelector('#dashGrid .dash-card img[src="lib/dash/path.jpg"]'),
      galArt: !!document.querySelector('#dashGrid .dash-card img[src="lib/dash/gallery.jpg"]')
    };
  });
  report("Home: greeting header renders, 6 cards incl. Path + Gallery art",
    home.greet && home.sub && home.cards === 6 && home.pathArt && home.galArt, home);

  /* ---- 3) Setup: readiness strip + about + backup + key remove ---- */
  const setup = await page.evaluate(async () => {
    switchPage("pgHome");
    await new Promise(r => setTimeout(r, 350));
    const rows = Array.from(document.querySelectorAll("#setupStatusRows .acc-kv"));
    const gemReady = rows.length === 4 && /✓/.test(rows[0].textContent);
    document.getElementById("btnCheckUpdate").click();
    await new Promise(r => setTimeout(r, 900));
    const upToDate = /✓/.test(document.getElementById("stAbout").textContent);
    const ver = document.getElementById("aboutVer").textContent;
    let exported = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { exported = this.download; };
    document.getElementById("btnExportData").click();
    HTMLAnchorElement.prototype.click = orig;
    const del = document.getElementById("stKeyDel");
    const delVisible = del && del.style.display !== "none";
    window.confirm = () => true;
    del.click();
    const keyGone = !localStorage.getItem("hnk_web_studio_key");
    // restore for later checks
    localStorage.setItem("hnk_web_studio_key", "AIzaTestKeyValue"); state.key = "AIzaTestKeyValue";
    const payHint = document.getElementById("stPay").textContent.length > 5;
    return { gemReady, upToDate, ver, exported, delVisible, keyGone, payHint,
      dataLine: document.getElementById("dataStore").textContent.indexOf("KB") >= 0 || document.getElementById("dataStore").textContent.indexOf("MB") >= 0 };
  });
  report("Setup: readiness strip live, manual update check reports current, backup exports a file, key removal works, logged-out pay hint",
    setup.gemReady && setup.upToDate && /^v4\./.test(setup.ver) && /hnk-backup-/.test(setup.exported || "") && setup.delVisible && setup.keyGone && setup.payHint && setup.dataLine,
    setup);

  /* ---- 4) Workflow page ---- */
  const wf = await page.evaluate(async () => {
    switchPage("pgWf");
    await new Promise(r => setTimeout(r, 250));
    const out = {};
    out.jump = document.querySelectorAll("#wfJump .chip").length;
    out.pills = document.querySelectorAll("#wfHost .wf-need").length;
    const s = document.getElementById("wfSearch");
    s.value = "ဆံပင်"; s.oninput.call(s);
    await new Promise(r => setTimeout(r, 250));
    out.aliasHits = Array.from(document.querySelectorAll("#wfHost .wfmini")).filter(m => m.style.display !== "none").length;
    out.count = document.getElementById("wfCount").textContent.length > 0;
    s.value = ""; s.oninput.call(s);
    await new Promise(r => setTimeout(r, 250));
    const wgRow = Array.from(document.querySelectorAll("#wfHost .grp .chips")).find(x => /Veil/.test(x.textContent));
    out.wgChips = wgRow ? wgRow.querySelectorAll(".chip").length : 0;
    return out;
  });
  report("Workflow: jump rail (9 cats), 116 photo-count pills, Burmese alias search with count, wedding sub-chips",
    wf.jump >= 8 && wf.pills >= 100 && wf.aliasHits > 0 && wf.count && wf.wgChips >= 5, wf);

  /* ---- 5) Library + Gallery ---- */
  const lg = await page.evaluate(async (PNG1) => {
    const out = {};
    switchPage("pgLib");
    await new Promise(r => setTimeout(r, 250));
    lib.search = "ဆံပင်"; lib.filter = "all"; lib.group = "";
    renderLibFilters(); renderLibGroups(); renderLibGrid(true);
    out.aliasHits = lib.list.length;
    lib.search = "snoot beam"; renderLibGrid(true); const a = lib.list.length;
    lib.search = "beam snoot"; renderLibGrid(true); out.orderInd = a === lib.list.length && a > 0;
    lib.search = ""; lib.filter = "featured"; renderLibFilters(); renderLibGroups(); renderLibGrid(true);
    out.nowrap = getComputedStyle(document.getElementById("libFilters")).flexWrap === "nowrap";
    libSelect(LW.items[0], null);
    document.getElementById("libFav").click();
    out.favChip = Array.from(document.querySelectorAll("#libFilters .chip")).some(c => /ကြိုက်တာများ/.test(c.textContent));
    document.getElementById("libPickImg").click();
    out.zoom = document.getElementById("lookZoom").className === "on";
    document.getElementById("lzX").click();
    document.getElementById("libFav").click(); // unstar
    // gallery seed
    await new Promise(res => {
      const rq = indexedDB.open("hnk_web_studio", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("gal", { keyPath: "id", autoIncrement: true });
      rq.onsuccess = () => {
        const tx = rq.result.transaction("gal", "readwrite");
        tx.objectStore("gal").add({ mime: "image/png", b64: PNG1, prompt: "p1", ts: Date.now() - 9e7, prov: "Gemini · flash" });
        tx.objectStore("gal").add({ mime: "image/png", b64: PNG1, prompt: "p2", ts: Date.now(), prov: "RunningHub · NB2" });
        tx.oncomplete = () => res();
      };
    });
    switchPage("pgGallery");
    await new Promise(r => setTimeout(r, 600));
    out.meter = /\d+ \/ 60/.test(document.getElementById("galNote").textContent);
    document.querySelectorAll("#galGrid img")[0].click();
    out.prov = document.getElementById("galPickInfo").textContent.indexOf("RunningHub · NB2") >= 0;
    out.dlName = /^hnk-\d{8}-\d{4}-/.test(document.getElementById("galDl").getAttribute("download"));
    document.getElementById("galToImg2").click();
    out.img2 = !!state.refs[1];
    document.getElementById("galSelMode").click();
    await new Promise(r => setTimeout(r, 500));
    const sa = document.getElementById("galSelAll");
    sa.click();
    await new Promise(r => setTimeout(r, 500));
    out.selAll = Object.keys(galMulti.ids).length === 2;
    document.getElementById("galSelMode").click();
    await new Promise(r => setTimeout(r, 400));
    return out;
  }, PNG1);
  report("Library: alias + token-AND search, chip rails, ★ filter, full-screen viewer; Gallery: prov line, n/60 meter, dated filename, IMAGE 2, select-all",
    lg.aliasHits > 0 && lg.orderInd && lg.nowrap && lg.favChip && lg.zoom && lg.meter && lg.prov && lg.dlName && lg.img2 && lg.selAll, lg);

  /* ---- 6) Generate honesty + persistence + provenance ---- */
  const gen = await page.evaluate(async () => {
    switchPage("pgCreate");
    await new Promise(r => setTimeout(r, 250));
    const out = {};
    out.btnGemini = document.getElementById("btnGen").textContent.indexOf("Gemini") >= 0;
    out.eta = document.getElementById("genEta").textContent.indexOf("≈") >= 0;
    out.modelShownForGemini = document.getElementById("selModel").style.display !== "none";
    document.getElementById("selRatio").value = "4:5";
    document.getElementById("selRatio").dispatchEvent(new Event("change"));
    out.persisted = (JSON.parse(localStorage.getItem("hnk_ws_create") || "{}").selRatio) === "4:5";
    state.hist.unshift({ mime: "image/png", b64: "AAAA", _prov: "Gemini · test-model" });
    state.histSel = 0; showResult();
    out.provLine = document.getElementById("resProv").textContent === "Gemini · test-model";
    state.hist.shift();
    out.share = !!document.getElementById("btnShareRes");
    return out;
  });
  report("Generate: provider-named button, ETA line, model select visible for Gemini, settings persist, result provenance line, share button present",
    gen.btnGemini && gen.eta && gen.modelShownForGemini && gen.persisted && gen.provLine && gen.share, gen);

  /* ---- 7) grouped language picker + fallback resolution ----
     v4.43 grew the picker to 35 (Asia set: ne/lo/km/ja/ko) in 3 optgroups */
  const lang = await page.evaluate(() => {
    const sel = document.getElementById("selLang");
    const values = Array.from(sel.querySelectorAll("option")).map(o => o.value);
    const need = ["my", "en", "shn", "mnw", "rki", "ksw", "kyu", "cnh", "blk", "pll", "khb", "ahk", "lhu", "lis",
      "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ne", "lo", "km", "ja", "ko"];
    const missing = need.filter(v => values.indexOf(v) < 0);
    // fallback resolution without a reload: swap LANG in-place
    const keep = LANG;
    const probe = { my: "burmese-text", en: "english-text", shn: "shan-text" };
    LANG = "mnw"; const mn = L9(probe);          // ethnic -> Burmese
    LANG = "hi"; const hin = L9(probe);          // Indic -> English
    LANG = "khb"; const tl = L9(probe);          // Tai Lue -> Shan
    LANG = keep;
    return { total: values.length, missing, mn, hin, tl, grouped: sel.querySelectorAll("optgroup").length === 3 };
  });
  report("languages: 35 codes in a grouped picker; Mon falls back to Burmese, Hindi to English, Tai Lue to Shan",
    lang.total === 35 && lang.missing.length === 0 && lang.mn === "burmese-text" && lang.hin === "english-text" && lang.tl === "shan-text" && lang.grouped,
    lang);

  await page.close();
  await browser.close();
  console.log("\n" + (failures ? "FAIL (" + failures + " failure(s))" : "PASS"));
  process.exit(failures ? 1 : 0);
})();
