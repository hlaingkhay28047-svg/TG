/* v4.41 upgrade-wave sweep — pins the wave's contracts:
   1. visual ratio chip rails (shape = aspect, tap writes the native select,
      model narrowing re-renders, upscale-kind hiding mirrors)
   2. Home: greeting header, 6-card grid art, gallery-backed Continue fallback
   3. Setup: readiness strip, About/updates card, backup export, one-engine
      key card (v5.50.0: RunningHub only — the Gemini key card and its
      removal control are gone)
   4. Workflow page: category jump rail, photo-count pills, alias search with
      live count, wedding sub-group chips, favorites hint
   5. Library: token-AND + Burmese alias search, favorites filter, full-screen
      viewer; Gallery: provenance line, n/60 meter, IMAGE 2, select-all
   6. Generate: engine-honest UI, RunningHub-named button, ETA line, settings
      persistence, result provenance
   7. i18n: 30-language picker with my/en fallback resolution */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const BASE = "http://localhost:8931/index.html";
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS — " : "FAIL — ") + name + (ok ? "" : "  " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  /* v5.30: the app is account + Premium only, and the wall now REDIRECTS —
     switchPage refuses to leave pgHome while it is up, so a suite page never
     mounts and the controls below do not exist. Sign in first. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    /* v5.50.0 — the app is RunningHub-only; its key is the one boot restores */
    localStorage.setItem("hnk_rh_apikey", "TEST_RH_KEY");
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
    /* v5.50.0 — ONE engine: 2 ready/not-ready rows (RunningHub, Account) + 3
       pure navigation shortcuts (Money, Data, About) = 5. The Gemini and
       OpenAI rows left with their providers. */
    const rhReady = rows.length === 5 && /RunningHub/.test(rows[0].textContent) && /✓/.test(rows[0].textContent);
    document.getElementById("btnCheckUpdate").click();
    await new Promise(r => setTimeout(r, 900));
    const upToDate = /✓/.test(document.getElementById("stAbout").textContent);
    const ver = document.getElementById("aboutVer").textContent;
    let exported = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { exported = this.download; };
    document.getElementById("btnExportData").click();
    HTMLAnchorElement.prototype.click = orig;
    /* v5.50.0 — the Gemini key card (and its #stKeyDel removal control) is
       GONE; the one engine card is #cardRh with its Save & Verify flow. */
    const rhCard = !!document.getElementById("rhKey") && !!document.getElementById("btnSaveRhKey");
    const gemCardGone = !document.getElementById("apiKey") && !document.getElementById("btnSaveKey")
      && !document.getElementById("stKeyDel");
    return { rhReady, upToDate, ver, appVer: APP_VER, exported, rhCard, gemCardGone,
      dataLine: document.getElementById("dataStore").textContent.indexOf("KB") >= 0 || document.getElementById("dataStore").textContent.indexOf("MB") >= 0 };
  });
  /* The pay hint is a SIGNED-OUT string — "sign in before you can buy" — so from
     v5.30.0 it cannot be read off the same page as everything else here, which
     has to be signed in for the wall to let it reach a suite page at all. It is
     measured on its own page rather than dropped: it is the line that tells a
     visitor why the buy panel is not doing anything, and nothing else pins it.
     The fixture seeds the session in an init script, so clearing the two keys in
     a later init script on this page alone is enough to sign it back out. */
  const outPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await outPage.addInitScript(() => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.removeItem("hnk_acc_sess_v1");
      localStorage.removeItem("hnk_acc_profile_v1");
    } catch (e) {}
  });
  await outPage.goto(BASE, { waitUntil: "networkidle" });
  await outPage.waitForTimeout(1200);
  /* v5.44.0 — #stPay lived in the purchase panel and went with it. A signed-
     out visitor has nothing to pay for; what must not happen is an account
     card that says nothing at all, so the login form is the thing to find. */
  setup.authPrompt = await outPage.evaluate(() => {
    const g = document.getElementById("accGrpAuth");
    const f = document.getElementById("accFormLogin");
    return !!g && g.className.indexOf("open") >= 0 &&
           !!f && f.getClientRects().length > 0;
  });
  await outPage.close();

  report("Setup: 5-row readiness strip with RunningHub ✓ first, manual update check reports current, backup exports a file, one-engine key card only (Gemini card gone), logged-out sign-in prompt",
    /* the version LINE must name the build, whatever the build is — pinning
       this to /^v4\./ made a major bump look like a Setup regression */
    setup.rhReady && setup.upToDate && setup.ver === "v" + setup.appVer && /^\d+\.\d+\.\d+$/.test(setup.appVer) && /hnk-backup-/.test(setup.exported || "") && setup.rhCard && setup.gemCardGone && setup.authPrompt && setup.dataLine,
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
      /* no version pin — v5.49.0 moved the shared database to version 2 (the
         kv store joined the gallery), and a version-1 open against it fires
         VersionError, never onsuccess, which left this promise to be garbage
         collected. Opening without a version attaches at whatever the app
         created, and the store guard covers a truly fresh profile. */
      const rq = indexedDB.open("hnk_web_studio");
      rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains("gal")) rq.result.createObjectStore("gal", { keyPath: "id", autoIncrement: true }); };
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
    /* v4.53: the tile holds a thumb, so IMAGE 2 reads the real plate back from
       IndexedDB before filling the slot — the fill is a tick later than it used
       to be, and that read is exactly what the pin is now proving. */
    document.getElementById("galToImg2").click();
    await new Promise(r => setTimeout(r, 400));
    out.img2 = !!(state.refs[1] && state.refs[1].b64);
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
    /* v5.50.0 — the button names the ONE engine, and the model select is the
       RunningHub model picker (visible for every non-hidden state) */
    out.btnRh = document.getElementById("btnGen").textContent.indexOf("RunningHub") >= 0;
    out.noGeminiBtn = document.getElementById("btnGen").textContent.indexOf("Gemini") < 0;
    out.eta = document.getElementById("genEta").textContent.indexOf("≈") >= 0;
    out.modelShown = document.getElementById("selModel").style.display !== "none"
      && document.getElementById("selModel").options.length > 0;
    document.getElementById("selRatio").value = "4:5";
    document.getElementById("selRatio").dispatchEvent(new Event("change"));
    out.persisted = (JSON.parse(localStorage.getItem("hnk_ws_create") || "{}").selRatio) === "4:5";
    state.hist.unshift({ mime: "image/png", b64: "AAAA", _prov: "RunningHub · test-model" });
    state.histSel = 0; showResult();
    out.provLine = document.getElementById("resProv").textContent === "RunningHub · test-model";
    state.hist.shift();
    out.share = !!document.getElementById("btnShareRes");
    return out;
  });
  report("Generate: RunningHub-named button (no Gemini text), ETA line, RH model picker populated, settings persist, result provenance line, share button present",
    gen.btnRh && gen.noGeminiBtn && gen.eta && gen.modelShown && gen.persisted && gen.provLine && gen.share, gen);

  /* ---- 7) grouped language picker + fallback resolution ----
     v4.43 grew the picker to 35, v5.7 to 37; v5.56.0 cut it back to 27 —
     the owner's real-things-only rule: the ten codes with ZERO native
     strings (mnw rki ksw kyu cnh blk pll ahk lhu lis — measured pure
     Burmese-fallback shells) left the picker until native packs exist.
     Every remaining code renders real text (9 full sets + 18 packs). */
  const lang = await page.evaluate(() => {
    const sel = document.getElementById("selLang");
    const values = Array.from(sel.querySelectorAll("option")).map(o => o.value);
    const need = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms", "khb", "tdd", "kht",
      "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ne", "lo", "km", "ja", "ko"];
    const missing = need.filter(v => values.indexOf(v) < 0);
    const retired = ["mnw", "rki", "ksw", "kyu", "cnh", "blk", "pll", "ahk", "lhu", "lis"];
    const shellLeak = retired.filter(v => values.indexOf(v) >= 0);
    // fallback resolution without a reload: swap LANG in-place
    const keep = LANG;
    const probe = { my: "burmese-text", en: "english-text", shn: "shan-text" };
    LANG = "hi"; const hin = L9(probe);          // Indic -> English
    LANG = "khb"; const tl = L9(probe);          // Tai Lue -> Shan
    LANG = keep;
    // a browser still storing a shell code is moved to its real fallback at boot
    const migrated = typeof LANG_RETIRED === "object" && retired.every(c => LANG_RETIRED[c] === 1);
    return { total: values.length, missing, shellLeak, hin, tl, migrated,
      grouped: sel.querySelectorAll("optgroup").length === 3 };
  });
  report("languages: 27 real codes in a grouped picker; the ten zero-text shells stay retired and migrate at boot; Hindi falls back to English, Tai Lue to Shan",
    lang.total === 27 && lang.missing.length === 0 && lang.shellLeak.length === 0 && lang.migrated && lang.hin === "english-text" && lang.tl === "shan-text" && lang.grouped,
    lang);

  /* ---- 8) v5.56.0 — the rail speaks shapes, the picker speaks capacity ----
     Auto is a dashed box carrying its own "A"; rhModelMaxIn reads what each
     builder REALLY sends (single-image kinds 1, node graphs their declared
     slots, documented arrays the 3-slot app ceiling); a workflow needing two
     images hides every model whose request cannot carry two, restores the
     catalog when cleared, and never strands the selection on a hidden row. */
  const v56 = await page.evaluate(() => {
    const out = {};
    const auto = document.querySelector("#selRatioRail .rchip.auto i");
    out.autoA = auto ? auto.textContent : "";
    out.one = rhModelMaxIn("rh-image-x-off") === 1 && rhModelMaxIn("flux-2-dev") === 1 && rhModelMaxIn("upscale-pro") === 1;
    out.many = rhModelMaxIn("nano-banana-2") === 3 && rhModelMaxIn("qwen-edit-2511") >= 2;
    const list = window._wfBatchList ? window._wfBatchList() : [];
    const two = list.find(w => w.reqN >= 2);
    out.haveTwo = !!two;
    if (two) {
      wfModelFilter(two.reqN);
      const sel = document.getElementById("selModel");
      const opts = Array.from(sel.options);
      out.disabledSingles = opts.filter(o => o.disabled).every(o => rhModelMaxIn(o.value) < two.reqN)
        && opts.some(o => o.disabled);
      out.curCapable = rhModelMaxIn(sel.value) >= two.reqN;
      wfModelFilter(0);
      out.cleared = !Array.from(sel.options).some(o => o.disabled);
    }
    return out;
  });
  report("v5.56.0: Auto rail box carries \"A\"; capacity is builder-true; a 2-image workflow filters the model picker and hands it back untouched",
    v56.autoA === "A" && v56.one && v56.many && v56.haveTwo && v56.disabledSingles && v56.curCapable && v56.cleared, v56);

  /* and the wizard's own wiring, pinned at the source: the cloned generate
     row attaches the rail, and an untouched ratio is still blanked while a
     deliberately picked one now survives the run */
  const srcApp = require("fs").readFileSync(require("path").join(__dirname, "..", "docs", "app", "index.html"), "utf8");
  report("v5.56.0: the wizard generate step hosts the ratio rail, honors a deliberate ratio pick, and the capacity switch fires at RUN time only (never on open — opening a guide must not rewrite the active model)",
    srcApp.includes('ratioRailAttach("wiz_selRatio")') &&
    srcApp.includes("if(!wiz.ratioPicked) wzR.value=\"\";") &&
    srcApp.includes('if(pair[0]==="selRatio") wiz.ratioPicked=true;') &&
    srcApp.includes("wfModelFilter((w.req||[]).length)") &&
    srcApp.includes("wfEnsureCapableModel((w.req||[]).length)") &&
    !/wfApplyModelFilter\(\)[\s\S]{0,400}sel\.onchange\(\)/.test(srcApp.slice(srcApp.indexOf("function wfApplyModelFilter"), srcApp.indexOf("function wfEnsureCapableModel"))),
    "wizard rail/ratio-honesty/run-time-switch wiring missing");

  /* ---- 9) v5.57.0 — video hero banners: the layer is armed, honest and
     cheap. One <video class="ph-motion"> rides behind every page-hero still,
     lazily loaded only on screen, paused off screen, format picked by what
     the browser can decode (mp4/webm pair), silently removed when no clip
     exists — and the clips are excluded from the SW's LIB_CACHE so eleven
     streams can never evict the thumbnails. (Playback itself is proven
     manually with a real clip; this Chromium build has no H.264, which is
     exactly why the canPlayType pick exists.) */
  const v57 = await page.evaluate(() => {
    const vids = document.querySelectorAll(".page-hero video.ph-motion, .page-hero>img");
    const heroes = document.querySelectorAll(".page-hero>img").length;
    // with no clips shipped, every probe must have fallen back silently:
    // no .live videos, no has-motion heroes, zero page errors (checked by
    // this sweep's pageerror hook)
    const live = document.querySelectorAll(".page-hero video.ph-motion.live").length;
    const hm = document.querySelectorAll(".page-hero.has-motion").length;
    return { heroes, live, hm };
  });
  const swSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "docs", "app", "sw.js"), "utf8");
  report("v5.57.0: video-hero layer wired (lazy IO arm, off-screen pause, codec-picked mp4/webm, silent fallback) and motion clips excluded from LIB_CACHE",
    v57.heroes >= 11 && v57.live === 0 && v57.hm === 0 &&
    srcApp.includes('v.className="ph-motion"') &&
    srcApp.includes('canPlayType(\'video/mp4; codecs="avc1.42E01E"\')') &&
    srcApp.includes('"lib/banners/motion/"+m[1]+phExt') &&
    srcApp.includes('v.addEventListener("error"') &&
    /else if\(!v\.paused\)\{ v\.pause\(\); \}/.test(srcApp) &&
    /* NO_CARD_JPG's rule for video: a clip is probed only when its files
       really shipped, so a console never eats a certain 404 */
    srcApp.includes("var PH_MOTION_CLIPS=") &&
    srcApp.includes("PH_MOTION_CLIPS.indexOf(m[1])<0) return;") &&
    swSrc.includes('url.pathname.indexOf("/lib/banners/motion/") >= 0) return;'),
    JSON.stringify(v57));

  await page.close();
  await browser.close();
  console.log("\n" + (failures ? "FAIL (" + failures + " failure(s))" : "PASS"));
  process.exit(failures ? 1 : 0);
})();
