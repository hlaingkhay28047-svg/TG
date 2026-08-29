/* Mocked regression sweep for the Retouch Studio page (v4.15.0: One-Tap +
   Sliders only — Pipeline mode was removed per user request):
   - One-Tap: missing-before-photo guard; a preset chip generates instantly
     with the identity guard + before photo in the request, shows the
     before/after compare, highlights the last-used preset, and offers a
     "re-run at a different strength" quick action on the result
   - Sliders: empty-selection guard; stays in sync with the Studio page's
     Retouch Pro group (shared state.rt/state.rtStrength); a Quick Bundle
     chip turns on every slider in the bundle in one tap and updates the
     selected-slider count summary
   - A reference image left in slot 2/3 by another page doesn't leak into a
     Retouch Studio request, and is restored after
   - Generation controls reject re-entrant taps while one is already running
   - "Set as before photo" (btnRsToRef) feeds the latest result back into
     IMAGE 1 for iterative retouching
   Usage: PORT=8931 node test/sweep_retouch_studio.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__reqs = [];
    window.__outs = ["T1VUMQ==", "T1VUMg==", "T1VUMw==", "T1VUNA=="];
    window.__callN = 0;
    window.__ups = 0;
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var m = /out_(\\d+)\\.png/.exec(u);
        var out = (m && window.__outs[+m[1]]) || "${B64}";
        var bin = atob(out);
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        window.__ups++;
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/up_0.png",fileName:"openapi/up_0.png",size:"100"}}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-"+(window.__callN-1),status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out_"+(window.__callN-1)+".png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      }
      var thisCall = window.__callN;
      if (opts && typeof opts.body === "string") {
        try { window.__reqs.push(JSON.parse(opts.body)); } catch(e) { window.__reqs.push({parseError:String(e)}); }
      }
      window.__callN++;
      // A small deliberate response delay (the request is recorded above
      // BEFORE this delay) gives the re-entrancy test a real window to
      // attempt a second tap while the first call is still in flight.
      return new Promise(function(resolve){
        setTimeout(function(){
          resolve(new Response(JSON.stringify({taskId:"mock-task-"+thisCall,status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
        }, 60);
      });
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.rhKey = "TEST_RH_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
  });

  let allOk = true;
  function report(name, ok, extra){
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  // 0) Pipeline mode was removed — no trace of it should remain in the DOM
  const noPipelineResult = await page.evaluate(() => {
    switchPage("pgRetouch");
    return {
      tabGone: !document.getElementById("rsTabPipeline"),
      paneGone: !document.getElementById("rsPipelinePane"),
      cancelBtnGone: !document.getElementById("btnRsCancel")
    };
  });
  report("Pipeline mode fully removed from the DOM", noPipelineResult.tabGone && noPipelineResult.paneGone && noPipelineResult.cancelBtnGone, JSON.stringify(noPipelineResult));

  // 1) missing-before-photo guard on a one-tap preset
  const noPhotoResult = await page.evaluate((b64) => {
    state.refs = [null, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    document.querySelectorAll("#rsPresetGrid .chip")[0].click();
    return { reqCount: window.__reqs.length, statusText: document.getElementById("stRsGen").textContent };
  }, B64);
  report("onetap blocks generate with no before-photo", noPhotoResult.reqCount === 0 && /ပုံ|photo/i.test(noPhotoResult.statusText), JSON.stringify(noPhotoResult));

  // 2) one-tap preset generates instantly, highlights itself as last-used,
  // and shows a "re-run at a different strength" quick action
  const onetapResult = await page.evaluate(async (b64) => {
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    const chips = document.querySelectorAll("#rsPresetGrid .chip");
    chips[0].click(); // evoto (first RS_ONETAP_KEYS entry)
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("rsResultBox").className.indexOf(" on") < 0; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0] || {};
    const txt = String(r.prompt || "");
    const imgs = window.__ups;
    return {
      reqCount: window.__reqs.length,
      hasGuard: txt.indexOf("TASK GUARD") >= 0,
      imgCount: imgs,
      resultShown: document.getElementById("rsResultBox").className.indexOf(" on") >= 0,
      histCount: document.querySelectorAll("#rsHist img").length,
      presetHighlighted: document.querySelectorAll("#rsPresetGrid .chip.on").length,
      rerunRowShown: document.getElementById("rsRerunRow").style.display !== "none",
      rerunChipCount: document.querySelectorAll("#rsRerunChips .chip").length
    };
  }, B64);
  report("onetap preset sends a well-formed request, shows result, highlights itself, offers re-run", onetapResult.reqCount === 1 && onetapResult.hasGuard && onetapResult.imgCount >= 1 && onetapResult.resultShown && onetapResult.histCount >= 1 && onetapResult.presetHighlighted === 1 && onetapResult.rerunRowShown && onetapResult.rerunChipCount === 3, JSON.stringify(onetapResult));

  // 3) tapping a re-run strength chip re-runs the SAME preset at the new strength
  const rerunResult = await page.evaluate(async () => {
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    const chips = document.querySelectorAll("#rsRerunChips .chip");
    const ninety = Array.from(chips).find(c => c.textContent === "90%");
    ninety.click();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0] || {};
    const txt = String(r.prompt || "");
    return { reqCount: window.__reqs.length, has90: /\b90%/.test(txt), strengthNowSet: state.rtStrength === 90 };
  });
  report("re-run-at-strength chip regenerates the same preset at the new strength", rerunResult.reqCount === 1 && rerunResult.has90 && rerunResult.strengthNowSet, JSON.stringify(rerunResult));

  // 4) sliders tab: empty-selection guard
  const sliderGuardResult = await page.evaluate(() => {
    rsSetMode("sliders");
    Object.keys(state.rt).forEach(k => { state.rt[k] = 0; });
    renderRtChips(); renderRsSelCount(); renderRsBundleGrid();
    window.__reqs = [];
    document.getElementById("btnRsGen").onclick();
    return { reqScheduled: window.__reqs.length, statusText: document.getElementById("stRsGen").textContent };
  });
  report("sliders tab blocks generate with nothing selected", /[Ss]lider/.test(sliderGuardResult.statusText), JSON.stringify(sliderGuardResult));

  // 5) a slider chip toggles the shared state.rt entry (the single source of
  // truth every generate reads), and generating carries the retouch block.
  // (#rtChips — the old Studio mirror host — left with v4.23.0's Meitu/Evoto
  // rebuild, so the state entry itself is now the cross-page contract.)
  const sliderSyncResult = await page.evaluate(async () => {
    rsSetMode("sliders");
    const rsChip = document.querySelectorAll("#rsChips .chip")[0];
    rsChip.click(); // turn on the first slider from the Sliders tab
    const firstKey = D.retouch.sliders.filter(s => state.rt[s.key]).map(s => s.key)[0];
    const stateHasIt = !!firstKey && state.rt[firstKey] === 1;
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0] || {};
    const txt = String(r.prompt || "");
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    // clean up: turn the slider back off so later checks start fresh
    document.querySelectorAll("#rsChips .chip")[0].click();
    const stateCleared = !!firstKey && !state.rt[firstKey];
    return { stateHasIt, stateCleared, hasRetouchBlock: /RETOUCH/i.test(txt) };
  });
  report("a slider chip toggles shared state.rt and its selection reaches the prompt as a retouch block", sliderSyncResult.stateHasIt && sliderSyncResult.stateCleared && sliderSyncResult.hasRetouchBlock, JSON.stringify(sliderSyncResult));

  // 6) a Quick Bundle chip turns on every slider in it and updates the count
  const bundleResult = await page.evaluate(() => {
    Object.keys(state.rt).forEach(k => { state.rt[k] = 0; });
    renderRtChips(); renderRsSelCount(); renderRsBundleGrid();
    const before = document.querySelectorAll("#rsChips .chip.on").length;
    document.querySelectorAll("#rsBundleGrid .chip")[0].click();
    return {
      before,
      after: document.querySelectorAll("#rsChips .chip.on").length,
      bundleShowsOn: document.querySelectorAll("#rsBundleGrid .chip.on").length,
      selCountText: document.getElementById("rsSelCount").textContent
    };
  });
  report("a Quick Bundle chip turns on all its sliders and updates the selected count", bundleResult.before === 0 && bundleResult.after > 0 && bundleResult.bundleShowsOn === 1 && /\d+\s*\/\s*\d+/.test(bundleResult.selCountText), JSON.stringify(bundleResult));

  // 7) a reference image left in slot 2/3 by another page (Studio/Create)
  // must not silently ride along into a Retouch Studio request, and must be
  // restored afterward so those other pages are unaffected
  const staleRefResult = await page.evaluate(async (b64) => {
    Object.keys(state.rt).forEach(k => { state.rt[k] = 0; });
    rsSetMode("onetap");
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, { mime: "image/png", b64: "U1RBTEVSRUY=", label: "leftover" }, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    document.querySelectorAll("#rsPresetGrid .chip")[1].click(); // a different preset than earlier checks
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    return {
      imgCount: window.__ups,
      leakedStaleRef: window.__ups > 1,
      slot1RestoredAfter: state.refs[1] && state.refs[1].b64 === "U1RBTEVSRUY="
    };
  }, B64);
  report("a leftover reference image in slot 2/3 doesn't leak into the request and is restored after", staleRefResult.imgCount === 1 && !staleRefResult.leakedStaleRef && staleRefResult.slot1RestoredAfter, JSON.stringify(staleRefResult));

  // 8) generation controls reject a re-entrant tap while one is already running
  const reentrancyResult = await page.evaluate(async (b64) => {
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0; window.__ups = 0;
    document.querySelectorAll("#rsPresetGrid .chip")[0].click();
    for (let w = 0; w < 20 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 10));
    // re-query fresh each time: rsRunOnetap rebuilds #rsPresetGrid (to highlight
    // the last-used preset), so a NodeList captured before the click would be
    // stale/detached and silently report the OLD (never-disabled) elements.
    const chipsDisabledDuringRun = Array.from(document.querySelectorAll("#rsPresetGrid .chip")).every(c => c.disabled);
    document.querySelectorAll("#rsPresetGrid .chip")[0].click(); // attempted re-entrant tap on the same chip while busy (disabled, so a real click() no-ops)
    document.querySelectorAll("#rsPresetGrid .chip")[1].click(); // attempted re-entrant tap on a DIFFERENT chip while busy
    for (let w = 0; w < 300 && document.querySelectorAll("#rsPresetGrid .chip")[0].disabled; w++) await new Promise(r => setTimeout(r, 30));
    return { reqCount: window.__reqs.length, chipsDisabledDuringRun };
  }, B64);
  report("controls reject re-entrant generation while one is already running", reentrancyResult.reqCount === 1 && reentrancyResult.chipsDisabledDuringRun, JSON.stringify(reentrancyResult));

  // 9) "set as before photo" feeds the latest result back into IMAGE 1
  const toRefResult = await page.evaluate(() => {
    document.getElementById("btnRsToRef").click();
    return { refLabel: state.refs[0] && state.refs[0].label };
  });
  report("btnRsToRef sets the latest result as the new before photo", toRefResult.refLabel === "result", JSON.stringify(toRefResult));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
