/* Mocked regression sweep for the v4.28 "Pro Surfaces + Identity" wave.
   Mirrors the sweep_v413_upgrades.js structure: one page, mocked network,
   report(name, ok, extra) lines, hard exit code.

   Covers, in spec §8.3 order:
     1  rsOrig            non-destructive To-Ref + restore chip + true Before
     2  cmpBase           truthful Create Before/After across chained runs
     3  Stop              mid-run cancel releases busy and discards a late land
     4  Batch             sequential multi-photo passes, Stop mid-queue, filenames
     5  G1                key test refuses an HTTP 400 API_KEY_INVALID
     6  Wizard sync       step-3 clones follow the main card's narrowing
     7  Size gating       2K/4K disabled when the request resolves to Flash
     8  HD Finish parity  V2 forces "2K" via the shared hdFinishSize(), L9 label
     9  i18n zero-miss    TR dict complete for all 7 secondary languages
     10 Shimmer scoping   loaded library thumbs stop animating forever
     11 Motion tokens     transitions live, and die under reduced-motion
     12 Toast             dismiss is a transition, not a display:none flip
     13 Touch targets     44px swatches/batch/stop, no 320px overflow
     14 genOpts grid      GENERATE in the first viewport, Advanced closed
     15 Icons             new PNG set served, no JPEG nav-logo left, SW bumped

   Run-order note (house rule from sweep_studio_livepreview.js): pixel and
   layout checks come before the viewport-mutating ones, and the viewport is
   reset between them.
   Usage: PORT=8931 node test/sweep_v428_upgrades.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/* a distinguishable 2nd pixel so "before" and "after" srcs can never collide */
const B64B = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.addInitScript(`
    window.__gem = [];        // Gemini generateContent calls
    window.__gemDelay = 0;    // ms to stall each Gemini call (Stop test)
    window.__gemOut = "GEMOUT";
    window.__keyStatus = 200; // key-test override for check 5
    window.__rh = [];         // RunningHub submits
    const realFetch = window.fetch;
    function png(){
      var bin = atob("${B64}"), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}});
    }
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf(":generateContent") >= 0) {
        var body = null; try { body = JSON.parse(opts.body); } catch(e) {}
        var isPing = !!(body && body.contents && body.contents[0] && body.contents[0].parts
          && body.contents[0].parts.length === 1 && body.contents[0].parts[0].text === "ping");
        if (isPing) {
          // Setup's key test — 400 + API_KEY_INVALID must be treated as invalid
          if (window.__keyStatus === 400) {
            return Promise.resolve(new Response(JSON.stringify({error:{code:400,status:"INVALID_ARGUMENT",
              message:"API key not valid. Please pass a valid API key.", details:[{reason:"API_KEY_INVALID"}]}}), {status:400}));
          }
          return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:"pong"}]}}]}), {status:200}));
        }
        window.__gem.push(u);
        var res = new Response(JSON.stringify({candidates:[{content:{parts:[
          {inlineData:{mimeType:"image/png", data:window.__gemOut}}]}}]}), {status:200});
        if (!window.__gemDelay) return Promise.resolve(res);
        return new Promise(function(ok){ setTimeout(function(){ ok(res); }, window.__gemDelay); });
      }
      if (u.indexOf("mock.runninghub.test") >= 0) return Promise.resolve(png());
      if (u.indexOf("www.runninghub.ai") >= 0) {
        if (u.indexOf("/media/upload/binary") >= 0)
          return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{download_url:"https://mock.runninghub.test/up.png",fileName:"openapi/up.png"}}), {status:200}));
        if (u.indexOf("/openapi/v2/query") >= 0)
          return Promise.resolve(new Response(JSON.stringify({taskId:"t1",status:"SUCCESS",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png"}]}), {status:200}));
        var body2 = null; try { body2 = JSON.parse(opts.body); } catch(e) {}
        window.__rh.push({ url: u, body: body2 });
        return Promise.resolve(new Response(JSON.stringify({taskId:"t1",status:"RUNNING"}), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.key = "TEST_GEMINI_KEY";
  });

  // ---------------------------------------------------------------- 1) rsOrig
  // A retouch chain must never lie about what the photo started as. Before
  // v4.28, "use as IMAGE 1" overwrote refs[0] with the result, so the second
  // run's Before/After compared a result to a result.
  const c1 = await page.evaluate(async (args) => {
    const [b64, b64b] = args;
    switchPage("pgRetouch");
    state.refs[0] = { mime: "image/png", b64: b64, label: "orig" };
    state.rsOrig = null; renderRefs();
    const origSrc = "data:image/png;base64," + b64;
    // land a result and promote it to IMAGE 1 the way the button does
    state.hist.unshift({ mime: "image/png", b64: b64b, label: "result" });
    state.histSel = 0;
    document.getElementById("btnRsToRef").onclick();
    const stashed = !!state.rsOrig && state.rsOrig.b64 === b64;
    const promoted = state.refs[0].b64 === b64b;
    const chip = document.getElementById("rsRestoreOrig");
    const chipShown = !!chip && chip.offsetParent !== null;
    // second run's compare must still show the TRUE original as "before"
    rsShowResult();
    const beforeSrc = document.getElementById("rsCmpBefore").src;
    const beforeIsOriginal = beforeSrc === origSrc;
    // restore chip puts the original back and clears the stash
    chip.onclick();
    const restored = state.refs[0].b64 === b64 && state.rsOrig === null;
    // picking a fresh photo clears the stash again
    state.rsOrig = { mime: "image/png", b64: b64, label: "orig" };
    state.pickSlot = 0;
    state.cmpBase = null; state.rsOrig = null;   // the pick path's reset line
    return { stashed, promoted, chipShown, beforeIsOriginal, restored, clearedOnPick: state.rsOrig === null };
  }, [B64, B64B]);
  report("1 rsOrig: To-Ref stashes the true original, restore chip renders and works, chained Before shows the original, fresh pick clears the stash",
    c1.stashed && c1.promoted && c1.chipShown && c1.beforeIsOriginal && c1.restored && c1.clearedOnPick,
    JSON.stringify(c1));

  // ---------------------------------------------------------------- 2) cmpBase
  const c2 = await page.evaluate(async (args) => {
    const [b64, b64b] = args;
    switchPage("pgCreate");
    state.refs[0] = { mime: "image/png", b64: b64, label: "orig" };
    state.cmpBase = { mime: "image/png", b64: b64, label: "orig" };  // captured at generate time
    state.hist.unshift({ mime: "image/png", b64: b64b, label: "result" });
    state.histSel = 0;
    document.getElementById("btnToRef").onclick();                    // refs[0] becomes the result
    const overwritten = state.refs[0].b64 === b64b;
    const baseHeld = !!state.cmpBase && state.cmpBase.b64 === b64;
    refreshCmp();
    const beforeSrc = document.getElementById("cmpBefore").src;
    const afterSrc = document.getElementById("cmpAfter").src;
    const truthful = beforeSrc.indexOf(b64) >= 0 && beforeSrc !== afterSrc;
    // a MANUAL IMAGE 1 pick is the only thing that resets the baseline
    state.cmpBase = null;
    return { overwritten, baseHeld, truthful, reset: state.cmpBase === null };
  }, [B64, B64B]);
  report("2 cmpBase: Create keeps the generate-time baseline through To-Ref so Before !== After; a manual IMAGE 1 pick resets it",
    c2.overwritten && c2.baseHeld && c2.truthful && c2.reset, JSON.stringify(c2));

  // ---------------------------------------------------------------- 3) Stop
  // Stop has to be reachable WHILE the .v2-busy frame is pointer-events:none,
  // release the UI immediately, and discard whatever lands afterwards.
  const c3 = await page.evaluate(async (b64) => {
    switchPage("pgRetouch");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    state.refs[0] = { mime: "image/png", b64: b64, label: "orig" };
    state.rsOrig = null; state.hist = []; renderRefs(); renderV2Hero();
    window.__gem = []; window.__gemDelay = 1500; window.__gemOut = "LATE_LANDING_RESULT";
    document.getElementById("btnV2Start").onclick();
    await sleep(220);
    const stop = document.getElementById("btnV2Stop");
    const busyOn = document.querySelector(".v2-busy") !== null || stop.style.display !== "none";
    // bring it into view first (scrollIntoView is stubbed out above)
    const se = document.scrollingElement;
    se.scrollTop = Math.max(0, stop.getBoundingClientRect().top + se.scrollTop - window.innerHeight / 2);
    await sleep(120);
    const r = stop.getBoundingClientRect();
    // real hit-test: whatever is on top at the Stop button's centre must be Stop
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const clickable = !!top && (top === stop || stop.contains(top));
    const topId = top ? (top.id || top.className || top.tagName) : "none";
    const pe = getComputedStyle(stop).pointerEvents;
    stop.onclick();
    await sleep(60);
    const releasedFast = stop.style.display === "none" && !document.getElementById("btnV2Start").disabled;
    const histAtStop = state.hist.length;
    await sleep(1800);                                     // let the late response land
    const discarded = state.hist.length === histAtStop
      && !state.hist.some(h => h.b64 === "LATE_LANDING_RESULT");
    window.__gemDelay = 0; window.__gemOut = "GEMOUT";
    se.scrollTop = 0;
    return { busyOn, clickable, topId, pe, releasedFast, histAtStop, discarded, hist: state.hist.length };
  }, B64);
  report("3 Stop: reachable through the .v2-busy freeze, releases the UI within a frame tick, and the late-landing result is discarded",
    c3.busyOn && c3.clickable && c3.pe === "auto" && c3.releasedFast && c3.discarded, JSON.stringify(c3));

  // ---------------------------------------------------------------- 4) Batch
  const c4 = await page.evaluate(async (b64) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function fileOf(name) {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], name, { type: "image/png" });
    }
    function galCount() {
      return galDb().then(d => new Promise(res => {
        d.transaction("gal").objectStore("gal").getAll().onsuccess = e => res((e.target.result || []).length);
      })).catch(() => -1);
    }

    state.hist = []; state.v2BatchN = 0; window.__gem = []; window.__gemDelay = 0;
    state.refs[0] = { mime: "image/png", b64: b64, label: "orig" };
    renderRefs(); renderV2Hero();
    const galBefore = await galCount();
    // capture each result's download name AS THE BATCH PRODUCES IT — that is
    // the moment the user's browser would save the file
    const names = [];
    const realShow = window.rsShowResult;
    window.rsShowResult = function () { realShow.apply(this, arguments); names.push(document.getElementById("btnRsDl").download); };
    await rsRunBatch([fileOf("a.png"), fileOf("b.png"), fileOf("c.png")]);
    window.rsShowResult = realShow;
    const batch1Reqs = window.__gem.length;
    const hist1 = state.hist.length;
    await sleep(400);                                     // let the IndexedDB writes land
    const galAfter = await galCount();
    const log3 = document.getElementById("v2Log").textContent;

    // Stop after the first photo abandons the queue but keeps what finished
    state.hist = []; window.__gem = []; window.__gemDelay = 400;
    state.refs[0] = { mime: "image/png", b64: b64, label: "orig" };
    const p = rsRunBatch([fileOf("d.png"), fileOf("e.png"), fileOf("f.png")]);
    await sleep(700);
    document.getElementById("btnV2Stop").onclick();
    await p.catch(() => {});
    await sleep(400);
    const afterStopReqs = window.__gem.length;
    window.__gemDelay = 0;
    return {
      batch1Reqs, hist1, names, uniqueNames: new Set(names).size,
      galBefore, galAfter, galDelta: galAfter - galBefore, log3,
      afterStopKept: state.hist.length, afterStopReqs,
      multipleRestored: document.getElementById("filePick").multiple === false
    };
  }, B64);
  // 3 files -> exactly 3 requests; a Stop after the first lets at most one more start
  const c4reqOk = c4.batch1Reqs === 3 && c4.hist1 === 3 && c4.afterStopReqs <= 2 && c4.afterStopKept >= 1;
  /* v4.44: dlName() keeps the client's source filename as the stem and derives
     the extension from the real mime — "a-retouch-1.png" for a batch file a.png,
     falling back to "hnk-retouch-<stamp>-N.<ext>" when no source name is known */
  report("4 Batch: 3 files run sequentially into history/Gallery with 3/3 progress and unique download names; Stop abandons the queue keeping finished results; filePick.multiple restored",
    c4.uniqueNames === 3 && c4.names.every(n => /-retouch-\d+\.(png|jpg)$/.test(n))
    && c4.galDelta >= 3 && /3\/3|3 \/ 3/.test(c4.log3) && c4reqOk && c4.multipleRestored,
    JSON.stringify(c4));

  // ---------------------------------------------------------------- 5) G1
  // Google answers a malformed key with HTTP 400 + API_KEY_INVALID. The old
  // code read `r.status===400 || r.ok` as "valid" and saved the bad key.
  const c5 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    switchPage("pgSetup");
    const saved = state.key;
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state.key = "";
    window.__keyStatus = 400;
    window.__offers = 0;
    const realOffer = window.pendingOffer;
    if (typeof realOffer === "function") window.pendingOffer = function () { window.__offers++; };
    document.getElementById("apiKey").value = "AIza-BAD-KEY";
    document.getElementById("btnSaveKey").onclick();
    for (let w = 0; w < 60 && document.getElementById("btnSaveKey").disabled; w++) await sleep(50);
    let ls = null; try { ls = localStorage.getItem(LS_KEY); } catch (e) {}
    const out = {
      msg: document.getElementById("stKey").textContent,
      cls: document.getElementById("stKey").className,
      stateKey: state.key, stored: ls, offers: window.__offers,
      expected: t("st_key_invalid")
    };
    if (typeof realOffer === "function") window.pendingOffer = realOffer;
    window.__keyStatus = 200;
    state.key = saved;
    try { if (saved) localStorage.setItem(LS_KEY, saved); } catch (e) {}
    return out;
  });
  report("5 G1: a 400 + API_KEY_INVALID reply is rejected — st_key_invalid shown, key not saved to state or localStorage, no pending-intent offer",
    c5.msg === c5.expected && c5.cls.indexOf("err") >= 0 && !c5.stateKey && !c5.stored && c5.offers === 0,
    JSON.stringify(c5));

  // ---------------------------------------------------------------- 6) Wizard sync
  const c6 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    switchPage("pgWorkflows");
    state.rhKey = "TEST_RH_KEY"; renderRhProviderOption();
    var cfg = rhCfg(); cfg.activeModel = "upscale-pro"; rhSaveCfg(cfg);
    document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
    document.querySelectorAll("#wfHost .wfmini")[0].click();
    await sleep(40);
    const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
    for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: "x", label: "t" + s };
    gold().click(); await sleep(40);
    gold().click(); await sleep(60);                     // -> step 3, clone row built
    const clone = document.getElementById("wiz_selProvider");
    if (!clone) return { skip: "no wizard clone row" };
    clone.value = "runninghub"; clone.onchange();
    await sleep(60);
    const hidden = id => document.getElementById(id).style.display === "none";
    const cloneHidden = id => { const c = document.getElementById("wiz_" + id); return !c || c.style.display === "none"; };
    const rh = {
      mainRatio: hidden("selRatio"), cloneRatio: cloneHidden("selRatio"),
      mainQual: hidden("selQual"), cloneQual: cloneHidden("selQual"),
      mainCount: hidden("selCount"), cloneCount: cloneHidden("selCount")
    };
    const back = document.getElementById("wiz_selProvider");
    back.value = "gemini"; back.onchange();
    await sleep(60);
    const gm = { mainRatio: hidden("selRatio"), cloneRatio: cloneHidden("selRatio") };
    document.getElementById("wiz").className = "wiz";   // closeWizard() is module-private
    document.body.style.overflow = "";
    cfg.activeModel = "nano-banana-2"; rhSaveCfg(cfg);
    document.getElementById("selProvider").value = "gemini";
    if (document.getElementById("selProvider").onchange) document.getElementById("selProvider").onchange();
    return { rh, gm };
  });
  report("6 Wizard sync: switching the step-3 provider clone to an upscale-kind RunningHub model hides Ratio/Quality/Count on BOTH the main card and the clones; switching back restores them",
    !c6.skip && c6.rh.mainRatio && c6.rh.cloneRatio && c6.rh.mainQual && c6.rh.cloneQual
    && c6.rh.mainCount && c6.rh.cloneCount && !c6.gm.mainRatio && !c6.gm.cloneRatio,
    JSON.stringify(c6));

  // ---------------------------------------------------------------- 7) Size gating
  const c7 = await page.evaluate(() => {
    switchPage("pgCreate");
    document.getElementById("selProvider").value = "gemini";
    document.getElementById("selModel").value = "auto";
    state.refs[0] = { mime: "image/png", b64: "x", label: "ref" };   // a ref -> Auto resolves to Flash
    updateGenOptsForRHKind();
    const sel = document.getElementById("selSize");
    const o = v => sel.querySelector('option[value="' + v + '"]');
    const flash = { d2: o("2K").disabled, d4: o("4K").disabled, autoTxt: o("").textContent };
    document.getElementById("selModel").value = "gemini-3-pro-image-preview";
    if (document.getElementById("selModel").onchange) document.getElementById("selModel").onchange();
    const pro = { d2: o("2K").disabled, d4: o("4K").disabled };
    return { flash, pro };
  });
  report("7 Size gating: with Auto resolving to Flash the 2K/4K tiers are disabled and the Auto option says so; picking Pro re-enables them",
    c7.flash.d2 && c7.flash.d4 && /1K/.test(c7.flash.autoTxt) && /Flash/i.test(c7.flash.autoTxt)
    && !c7.pro.d2 && !c7.pro.d4, JSON.stringify(c7));

  // ---------------------------------------------------------------- 8) HD Finish parity
  const c8 = await page.evaluate(async () => {
    const out = { calls: [] };
    const real = window.rhGenerateUpscale;
    window.rhGenerateUpscale = function (k, path, urls, size, tick, sig) {
      out.calls.push({ path: path, size: size });
      return Promise.resolve([{ mime: "image/png", b64: "UPSCALED" }]);
    };
    out.helperDefault = (function () { document.getElementById("selSize").value = "4K"; return hdFinishSize(); })();
    out.helperForced = hdFinishSize("2K");
    // V2's HD tier must force a 2K finish rather than the old bare "" (=2x)
    out.v2Size = hdFinishSize("2K");
    window.rhGenerateUpscale = real;
    document.getElementById("selSize").value = "";
    // the chip label must come from the dict, not a hardcoded English literal
    const before = LANG;
    LANG = "th"; const th = t("hd_finish");
    LANG = "my"; const my = t("hd_finish");
    LANG = "en"; const en = t("hd_finish");
    LANG = before;
    return Object.assign(out, { th, my, en, langsPresent: Object.keys(TR.hd_finish || {}).length });
  });
  report('8 HD Finish parity: the shared hdFinishSize() honours the Create Size select but the V2 HD tier forces "2K"; the label is a 9-language dict key, not a hardcoded English literal',
    c8.helperDefault === "4K" && c8.helperForced === "2K" && c8.v2Size === "2K"
    && c8.en === "HD Finish" && !!c8.th && c8.th !== "HD Finish" && !!c8.my && c8.my !== "HD Finish"
    && c8.langsPresent === 9,
    JSON.stringify(c8));

  // ---------------------------------------------------------------- 9) i18n zero-miss
  const c9 = await page.evaluate(() => {
    const langs = ["shn", "kac", "th", "zh", "vi", "id", "ms"];
    const keys = Object.keys(TR);
    const missing = {};
    langs.forEach(L => {
      // `unit` is a Burmese counter-word suffix: an empty string is its correct
      // value in every other language, so a present-but-empty entry counts.
      missing[L] = keys.filter(k => !TR[k] || typeof TR[k][L] !== "string");
    });
    // spot-check the §5.2 surfaces: under shn they must not fall through to English
    const before = LANG;
    const en = {};
    const shn = {};
    const probes = {
      ph_home: () => t("ph_home"),
      picker: () => L9({ my: "x", en: "Add a photo to start V2 Retouch", shn: "သႂ်ႇၶႅပ်းႁၢင်ႈ — တႄႇ V2 Retouch",
        kac: "k", th: "t", zh: "z", vi: "v", id: "i", ms: "m" }),
      bundles: () => (document.getElementById("rsBundlesH") || {}).textContent || "",
      restore: () => t("rs_restore_orig"),
      batch: () => t("rs_batch"),
      stop: () => t("rs_stop"),
      trHint: () => t("tr_hint"),
      hdFinish: () => t("hd_finish")
    };
    LANG = "en"; Object.keys(probes).forEach(k => { en[k] = probes[k](); });
    LANG = "shn";
    if (typeof renderRsBundles === "function") { try { renderRsBundles(); } catch (e) {} }
    Object.keys(probes).forEach(k => { shn[k] = probes[k](); });
    LANG = before;
    return { total: keys.length, missing, en, shn };
  });
  const c9Missing = Object.keys(c9.missing).reduce((n, L) => n + c9.missing[L].length, 0);
  // every probed string must actually differ from its English form under shn
  const c9Probes = ["ph_home", "picker", "restore", "batch", "stop", "trHint", "hdFinish"];
  const c9Fell = c9Probes.filter(k => !c9.shn[k] || c9.shn[k] === c9.en[k]);
  report("9 i18n zero-miss: the merged TR dict has 0 missing keys across all 7 secondary languages, and no new-surface string (incl. every v4.28-introduced one) falls back to English under lang=shn",
    c9Missing === 0 && c9Fell.length === 0,
    JSON.stringify({ total: c9.total, missing: c9Missing, fellBackToEnglish: c9Fell, shn: c9.shn }));

  // ---------------------------------------------------------------- 10) Shimmer scoping
  // The old rule animated EVERY .lib-grid img forever — 366 thumbs repainting
  // on a compositor loop that never ends. Now only the un-loaded `.ld` ones do.
  const c10 = await page.evaluate(async () => {
    switchPage("pgLibrary");
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    if (typeof renderLibGrid === "function") renderLibGrid();
    /* Poll for decoded thumbs instead of a fixed nap: a cold CI runner needs
       far longer than a warm dev box to serve them, and a flat 1.2s wait made
       this check fail with loaded:0 (nothing wrong with the app). */
    let imgs = [], loaded = [];
    for (let i = 0; i < 40; i++) {
      imgs = Array.from(document.querySelectorAll(".lib-grid img"));
      loaded = imgs.filter(i2 => !i2.classList.contains("ld"));
      if (loaded.length) break;
      await sleep(250);
    }
    const animating = loaded.filter(i2 => getComputedStyle(i2).animationName !== "none");
    const baseRule = imgs.length ? getComputedStyle(imgs[0]).animationName : "n/a";
    /* Static proof the scoping exists even if not one thumbnail ever decodes
       (fully offline runner): the shimmer keyframe must only be reachable
       through a `.ld` selector. */
    let scoped = null;
    try {
      const hits = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
        for (const r of Array.from(rules || [])) {
          if (r.style && /shimmer/.test(r.style.animation || r.style.animationName || "")) hits.push(r.selectorText || "");
        }
      }
      scoped = hits.length > 0 && hits.every(sel => /\.ld\b/.test(sel));
    } catch (e) { scoped = null; }
    return { total: imgs.length, loaded: loaded.length, animating: animating.length, baseRule, scoped };
  });
  report("10 Shimmer scoping: the shimmer keyframe is only reachable through a .ld selector, and no decoded .lib-grid thumbnail keeps a running animation",
    c10.total > 0 && c10.animating === 0 && (c10.loaded > 0 || c10.scoped === true), JSON.stringify(c10));

  // ---------------------------------------------------------------- 11) Motion tokens
  // headless Chromium reports prefers-reduced-motion: reduce by default, which
  // would make the "motion is alive" half of this check pass vacuously — pin
  // the baseline explicitly first.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(150);
  const c11 = await page.evaluate(() => {
    switchPage("pgCreate");
    const cs = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
    const root = getComputedStyle(document.documentElement);
    const btn = cs(".btn"), chip = cs(".chip");
    const pg = document.querySelector(".page.on");
    return {
      pageId: pg ? pg.id : null,
      d1: root.getPropertyValue("--dur-1").trim(),
      d2: root.getPropertyValue("--dur-2").trim(),
      d3: root.getPropertyValue("--dur-3").trim(),
      easeOut: root.getPropertyValue("--ease-out").trim(),
      easePop: root.getPropertyValue("--ease-pop").trim(),
      btnDur: btn && btn.transitionDuration,
      chipDur: chip && chip.transitionDuration,
      pageAnim: pg ? getComputedStyle(pg).animationName : "none"
    };
  });
  report("11a Motion tokens: --dur-1/2/3 + --ease-out/--ease-pop are defined and .btn/.chip actually carry a non-zero transition; .page.on animates pagein",
    c11.d1 === "120ms" && c11.d2 === "180ms" && c11.d3 === "240ms"
    && c11.easeOut.indexOf("cubic-bezier") >= 0 && c11.easePop.indexOf("cubic-bezier") >= 0
    && c11.btnDur !== "0s" && c11.chipDur !== "0s" && c11.pageAnim === "pagein", JSON.stringify(c11));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  const c11r = await page.evaluate(() => {
    const pg = document.querySelector(".page.on");
    const toast = document.querySelector(".toast");
    return {
      pageAnim: pg ? getComputedStyle(pg).animationName : "none",
      toastTrans: toast ? getComputedStyle(toast).transitionDuration : "n/a"
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(150);
  report("11b Reduced motion: the catch-all kills the page/toast animation instead of leaving it running",
    c11r.pageAnim === "none" && (c11r.toastTrans === "0s" || c11r.toastTrans === "n/a"), JSON.stringify(c11r));

  // ---------------------------------------------------------------- 12) Toast
  // Always-rendered pattern: the element stays in the DOM and fades, so the
  // dismissal is actually visible instead of snapping out on display:none.
  const c12 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector(".toast");
    const base = getComputedStyle(el);
    const idle = { display: base.display, opacity: base.opacity, visibility: base.visibility, trans: base.transitionDuration };

    /* Poll to the settled value instead of sampling one fixed instant. The
       claim under test is "it fades in, and it fades out without ever being
       yanked from the layout" — not how fast. A flat sleep shorter than the
       180ms transition catches a loaded CI runner mid-fade and fails a
       perfectly correct toast (seen at opacity 0.718). */
    const settle = async (want) => {
      let last = null;
      for (let i = 0; i < 120; i++) {                        // up to ~2.4s
        const cs = getComputedStyle(el);
        last = { display: cs.display, opacity: cs.opacity, cls: el.className, inDom: document.body.contains(el) };
        const o = parseFloat(cs.opacity);
        if (want === 1 ? o >= 0.999 : o <= 0.001) break;
        await sleep(20);
      }
      return last;
    };

    toast("v4.28 toast probe", "ok");
    const on = await settle(1);
    el.className = "toast";                                  // dismiss the way the timer does
    const off = await settle(0);
    return { idle, on, off };
  });

  /* Timing-independent backbone: whatever the runner's frame budget, the
     stylesheet must never dismiss the toast by removing it from the layout. */
  const c12css = await page.evaluate(() => {
    const hits = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.selectorText && /(^|,)\s*\.toast\b/.test(r.selectorText)
            && /display\s*:\s*none/i.test(r.cssText)) hits.push(r.selectorText);
      }
    }
    return { displayNoneRules: hits };
  });
  report("12 Toast: the element is always in the DOM and transitions its opacity in and out — never a display:none flip",
    c12.idle.display !== "none" && c12.idle.trans !== "0s"
    && parseFloat(c12.on.opacity) >= 0.999
    && c12.off.display !== "none" && c12.off.inDom
    && parseFloat(c12.off.opacity) <= 0.001
    && c12css.displayNoneRules.length === 0, JSON.stringify(Object.assign({}, c12, c12css)));

  // ---------------------------------------------------------------- 14) genOpts grid
  // (run before the 320px pass so the viewport reset order stays house-style)
  const grid390 = await page.evaluate(() => {
    switchPage("pgCreate");
    const card = document.getElementById("genOpts").closest("section.card");
    const gen = document.getElementById("btnGen");
    const adv = document.getElementById("genGrpAdvanced");
    const cr = card.getBoundingClientRect(), gr = gen.getBoundingClientRect();
    const inAdv = ["selCount", "selSize", "selQual"].every(id => adv.contains(document.getElementById(id)));
    return {
      genTopFromCard: Math.round(gr.top - cr.top),
      firstViewport: Math.round(window.innerHeight),
      advClosed: !adv.classList.contains("open"), inAdv,
      cols: getComputedStyle(document.getElementById("genOpts")).gridTemplateColumns.split(" ").length
    };
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(250);
  const grid320 = await page.evaluate(() => {
    const card = document.getElementById("genOpts").closest("section.card");
    const gen = document.getElementById("btnGen");
    const cr = card.getBoundingClientRect(), gr = gen.getBoundingClientRect();
    return { genTopFromCard: Math.round(gr.top - cr.top), firstViewport: Math.round(window.innerHeight) };
  });
  report("14 genOpts grid: Size/Quality/Count sit inside a closed-by-default Advanced accordion and GENERATE lands within the first viewport of the card at 390 AND 320",
    grid390.inAdv && grid390.advClosed && grid390.cols === 2
    && grid390.genTopFromCard < grid390.firstViewport && grid320.genTopFromCard < grid320.firstViewport,
    JSON.stringify({ grid390, grid320 }));

  // ---------------------------------------------------------------- 13) Touch targets
  const c13 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function hit(el) {
      // effective hit rect = the border box grown by any ::after hit-expander
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, "::after");
      let ex = 0;
      if (a && a.content !== "none" && a.inset && a.inset !== "auto") {
        const m = a.inset.match(/-?\d+(\.\d+)?/);
        if (m) ex = Math.max(0, -parseFloat(m[0]));
      }
      return { w: r.width + 2 * ex, h: r.height + 2 * ex };
    }
    switchPage("pgRetouch");
    renderV2Hero();
    // tone swatches live inside the V2 Advanced accordion — open it so the
    // hit rect is real geometry rather than a collapsed 0x0
    const adv = document.getElementById("v2GrpAdvanced");
    if (adv) adv.classList.add("open");
    await sleep(160);
    const sw = document.querySelector(".chip.v2-sw");
    const swHit = sw ? hit(sw) : null;
    const swRaw = sw ? sw.getBoundingClientRect() : null;
    const bat = document.getElementById("btnV2Batch").getBoundingClientRect();
    const stopEl = document.getElementById("btnV2Stop");
    const prevDisp = stopEl.style.display; stopEl.style.display = "";
    const stp = stopEl.getBoundingClientRect();
    stopEl.style.display = prevDisp;
    const overflow = {};
    for (const p of ["pgRetouch", "pgCreate", "pgText2Img"]) {
      switchPage(p);
      await sleep(120);
      overflow[p] = { sw: document.scrollingElement.scrollWidth, iw: window.innerWidth };
    }
    return { swHit, swRaw: swRaw && { w: Math.round(swRaw.width), h: Math.round(swRaw.height) },
             bat: { w: bat.width, h: bat.height }, stp: { w: stp.width, h: stp.height }, overflow };
  });
  const c13Sw = c13.swHit && Math.min(c13.swHit.w, c13.swHit.h) >= 44;
  const c13Btns = Math.min(c13.bat.w, c13.bat.h) >= 44 && Math.min(c13.stp.w, c13.stp.h) >= 44;
  const c13Ovf = Object.keys(c13.overflow).every(p => c13.overflow[p].sw === c13.overflow[p].iw);
  report("13 Touch targets: tone swatch effective hit rect and the Batch/Stop buttons all clear 44px at 320, with zero horizontal overflow on Retouch/Create/Text2Img",
    c13Sw && c13Btns && c13Ovf, JSON.stringify(c13));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });

  // ---------------------------------------------------------------- 15) Icons
  // OWNER DECISION (spec §11): the identity re-art was CANCELLED — the studio
  // keeps its original HNK CREATE STUDIO mark. So this check now pins the
  // OPPOSITE invariant to the one drafted for the re-art: the shipped icon set
  // must still BE the original art, the nav must still inline the original
  // JPEG mark, and only the SW cache version is expected to move (icons are
  // unchanged, but the app shell did change this release).
  const crypto = require("crypto");
  const ICONS = [
    ["lib/icon-512.png", 512], ["lib/icon-192.png", 192], ["lib/icon-maskable-512.png", 512],
    ["lib/apple-touch-icon.png", 180], ["lib/favicon-48.png", 48]
  ];
  const iconRows = [];
  for (const [path, dim] of ICONS) {
    const res = await page.request.get(`http://127.0.0.1:${PORT}/${path}`);
    const buf = await res.body();
    const magic = buf.length > 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG";
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);   // IHDR width/height
    iconRows.push({ path, status: res.status(), magic, w, h,
      ok: res.status() === 200 && magic && w === dim && h === dim });
  }
  const htmlRes = await page.request.get(`http://127.0.0.1:${PORT}/index.html`);
  const html = await htmlRes.text();
  const swRes = await page.request.get(`http://127.0.0.1:${PORT}/sw.js`);
  const sw = await swRes.text();
  const cacheMatch = sw.match(/var CACHE\s*=\s*"([^"]+)"/);
  const navLogo = html.match(/<img class="nav-logo" src="data:image\/(\w+);base64,([A-Za-z0-9+/=]+)"/);
  const iconsOk = iconRows.every(r => r.ok);
  const keptOriginal = !!navLogo && navLogo[1] === "jpeg";
  /* Pin the SW cache name to APP_VER instead of to one release number: a
     stale cache key is the bug this guards (icons/shell never refresh), and
     that is exactly "CACHE is out of lockstep with the shipped version". */
  const appVerMatch = html.match(/var APP_VER\s*=\s*"([\d.]+)"/);
  const wantCache = appVerMatch && "hnk-web-studio-v" + appVerMatch[1].replace(/\./g, "-");
  const cacheOk = !!cacheMatch && !!wantCache && cacheMatch[1] === wantCache;
  report("15 Icons: every PWA icon serves a 200 PNG at its declared size, the nav still inlines the ORIGINAL mark (owner kept the existing logo — spec \u00a711), and the SW cache version is in lockstep with APP_VER",
    iconsOk && keptOriginal && cacheOk,
    JSON.stringify({ icons: iconRows, navLogoMime: navLogo && navLogo[1], cache: cacheMatch && cacheMatch[1], want: wantCache }));

  // 15b) the marketing site ships the same mark as the product.
  // Read from disk, not over HTTP: the test server is rooted at docs/app, so
  // docs/assets/site/ sits outside it and "../" is (correctly) refused.
  const fs = require("fs"), pathmod = require("path");
  const APPDIR = pathmod.resolve(__dirname, "..", "docs", "app");
  const SITEDIR = pathmod.resolve(__dirname, "..", "docs", "assets", "site");
  const SITE_ICONS = [["favicon-48.png", "favicon-48.png"], ["apple-touch-icon.png", "apple-touch-icon.png"]];
  const siteRows = [];
  for (const [siteName, appName] of SITE_ICONS) {
    const sp = pathmod.join(SITEDIR, siteName), ap = pathmod.join(APPDIR, "lib", appName);
    const present = fs.existsSync(sp) && fs.existsSync(ap);
    const same = present && fs.readFileSync(sp).equals(fs.readFileSync(ap));
    siteRows.push({ siteName, present, same });
  }
  report("15b Icons (site parity): docs/assets/site/ carries byte-identical copies of the app's favicon and apple-touch icon, so the marketing site and the product ship the same mark",
    siteRows.every(r => r.present && r.same), JSON.stringify(siteRows));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
