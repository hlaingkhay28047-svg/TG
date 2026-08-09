/* Mocked regression sweep for the v4.14.0 Retouch Studio page:
   - One-tap preset chip generates instantly (guard text + before photo
     present in the request) and the result/compare box appears
   - Missing-before-photo guard: tapping a preset with no photo shows an
     error and never sends a request
   - Sliders tab: empty-selection guard blocks Generate; picking a slider
     (shared state.rt with the Studio page's Retouch Pro group) sends a
     request whose prompt carries the retouch instruction block
   - The Sliders tab (#rsChips) and Studio's Retouch Pro group (#rtChips)
     stay in sync — a pick in one shows up rendered in the other
   - Pipeline: queuing a 2-stage recipe and running it sends two sequential
     requests, chaining stage 1's output forward as stage 2's IMAGE 1, then
     restores the true original photo once finished (for a fair before/after)
   - Pipeline cancel: cancelling after stage 1 starts stops before stage 2
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
    window.__outs = ["STAGE1OUT", "STAGE2OUT", "STAGE3OUT", "STAGE4OUT"];
    window.__callN = 0;
    window.__failOnCall = -1; // 0-based call index to fail with a safety-block response, or -1 for none
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      if (String(url).indexOf(":generateContent") >= 0) {
        var thisCall = window.__callN;
        try { window.__reqs.push(JSON.parse(opts.body)); } catch(e) { window.__reqs.push({parseError:String(e)}); }
        window.__callN++;
        if (window.__failOnCall === thisCall) {
          return new Promise(function(resolve){
            setTimeout(function(){
              resolve(new Response(JSON.stringify({
                candidates:[{content:{parts:[]},finishReason:"SAFETY"}],
                promptFeedback:{blockReason:"SAFETY"}
              }), {status:200, headers:{"Content-Type":"application/json"}}));
            }, 60);
          });
        }
        var out = window.__outs[thisCall] || "${B64}";
        // A small deliberate response delay (the request is recorded above
        // BEFORE this delay) gives the pipeline-cancel test a real window to
        // click Cancel after stage 1's request fires but before stage 2's
        // would — without it, a same-tick mocked round-trip can let the
        // whole pipeline finish before the test ever gets to click Cancel.
        return new Promise(function(resolve){
          setTimeout(function(){
            resolve(new Response(JSON.stringify({
              candidates:[{content:{parts:[{inline_data:{mime_type:"image/png",data: out}}]},finishReason:"STOP"}]
            }), {status:200, headers:{"Content-Type":"application/json"}}));
          }, 60);
        });
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.key = "TEST_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let allOk = true;
  function report(name, ok, extra){
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  // 1) missing-before-photo guard on a one-tap preset
  const noPhotoResult = await page.evaluate((b64) => {
    switchPage("pgRetouch");
    state.refs = [null, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0;
    document.querySelectorAll("#rsPresetGrid .chip")[0].click();
    return { reqCount: window.__reqs.length, statusText: document.getElementById("stRsGen").textContent };
  }, B64);
  report("onetap blocks generate with no before-photo", noPhotoResult.reqCount === 0 && /ပုံ|photo/i.test(noPhotoResult.statusText), JSON.stringify(noPhotoResult));

  // 2) one-tap preset generates instantly with a before photo
  const onetapResult = await page.evaluate(async (b64) => {
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0;
    const chips = document.querySelectorAll("#rsPresetGrid .chip");
    chips[0].click(); // evoto (first RS_ONETAP_KEYS entry)
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("rsResultBox").className.indexOf(" on") < 0; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const parts = (r.contents && r.contents[0] && r.contents[0].parts) || [];
    const txt = parts.filter(p => p.text).map(p => p.text).join("\n");
    const imgs = parts.filter(p => p.inline_data && p.inline_data.data).length;
    return {
      reqCount: window.__reqs.length,
      hasGuard: txt.indexOf("TASK GUARD") >= 0,
      imgCount: imgs,
      resultShown: document.getElementById("rsResultBox").className.indexOf(" on") >= 0,
      cmpAfterSrc: document.getElementById("rsCmpAfter").src,
      histCount: document.querySelectorAll("#rsHist img").length
    };
  }, B64);
  report("onetap preset sends a well-formed request and shows result", onetapResult.reqCount === 1 && onetapResult.hasGuard && onetapResult.imgCount >= 1 && onetapResult.resultShown && onetapResult.histCount >= 1, JSON.stringify(onetapResult));

  // 3) sliders tab: empty-selection guard
  const sliderGuardResult = await page.evaluate(() => {
    rsSetMode("sliders");
    Object.keys(state.rt).forEach(k => { state.rt[k] = 0; });
    renderRtChips();
    window.__reqs = [];
    document.getElementById("btnRsGen").onclick();
    return { reqScheduled: window.__reqs.length, statusText: document.getElementById("stRsGen").textContent };
  });
  report("sliders tab blocks generate with nothing selected", /[Ss]lider/.test(sliderGuardResult.statusText), JSON.stringify(sliderGuardResult));

  // 4) sliders tab + Studio's Retouch Pro group stay in sync, and generating carries the retouch block
  const sliderSyncResult = await page.evaluate(async () => {
    rsSetMode("sliders");
    const rsChip = document.querySelectorAll("#rsChips .chip")[0];
    const label = rsChip.textContent;
    rsChip.click(); // turn on the first slider from the Sliders tab
    const studioHasSameOn = Array.from(document.querySelectorAll("#rtChips .chip")).some(c => c.textContent === label && c.className.indexOf("on") >= 0);
    window.__reqs = []; window.__callN = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const parts = (r.contents && r.contents[0] && r.contents[0].parts) || [];
    const txt = parts.filter(p => p.text).map(p => p.text).join("\n");
    // wait for this generate call to fully finish (not just be sent) before
    // returning — otherwise its leftover in-flight completion (which flips
    // btnRsGen.disabled asynchronously) can fire mid-way through a LATER
    // test and corrupt that test's own busy/disabled-based synchronization.
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    // clean up: turn the slider back off so later stages start fresh
    rsChip.click();
    return { studioHasSameOn, hasRetouchBlock: /RETOUCH/i.test(txt) };
  });
  report("Sliders tab syncs with Studio's Retouch Pro group and its selection reaches the prompt", sliderSyncResult.studioHasSameOn && sliderSyncResult.hasRetouchBlock, JSON.stringify(sliderSyncResult));

  // 5) pipeline: queue a 2-stage recipe, run it, verify chaining + restore
  const pipelineResult = await page.evaluate(async (b64) => {
    rsSetMode("pipeline");
    state.refs = [{ mime: "image/png", b64: b64, label: "original" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsRecipeGrid .chip")[0].click(); // load a 2-step recipe
    const queueLen = rsPipelineQueue.length;
    window.__reqs = []; window.__callN = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 200 && window.__reqs.length < 2; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    const r2 = window.__reqs[1] || {};
    const parts2 = (r2.contents && r2.contents[0] && r2.contents[0].parts) || [];
    const chainedImg = parts2.some(p => p.inline_data && p.inline_data.data === "STAGE1OUT");
    return {
      queueLen,
      reqCount: window.__reqs.length,
      chainedImg,
      restoredToOriginal: state.refs[0] && state.refs[0].b64 === b64,
      resultShown: document.getElementById("rsResultBox").className.indexOf(" on") >= 0
    };
  }, B64);
  report("pipeline chains stage output forward and restores the true original after finishing", pipelineResult.queueLen === 2 && pipelineResult.reqCount === 2 && pipelineResult.chainedImg && pipelineResult.restoredToOriginal && pipelineResult.resultShown, JSON.stringify(pipelineResult));

  // 6) pipeline cancel stops before the next stage
  const cancelResult = await page.evaluate(async (b64) => {
    rsSetMode("pipeline");
    state.refs = [{ mime: "image/png", b64: b64, label: "original" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsRecipeGrid .chip")[0].click();
    window.__reqs = []; window.__callN = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    document.getElementById("btnRsCancel").click();
    for (let w = 0; w < 200 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    return { reqCount: window.__reqs.length, restoredToOriginal: state.refs[0] && state.refs[0].b64 === b64 };
  }, B64);
  report("pipeline cancel stops after the in-flight stage instead of running the rest", cancelResult.reqCount === 1 && cancelResult.restoredToOriginal, JSON.stringify(cancelResult));

  // 7) a genuine mid-pipeline failure (e.g. a safety-filter block) must show
  // as a real error with a retry option — not get repackaged as a false
  // "Pipeline stopped ✓" success message indistinguishable from a deliberate cancel
  const failResult = await page.evaluate(async (b64) => {
    rsSetMode("pipeline");
    state.refs = [{ mime: "image/png", b64: b64, label: "original" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsRecipeGrid .chip")[0].click(); // 2-stage recipe
    window.__reqs = []; window.__callN = 0; window.__failOnCall = 1; // stage 2 fails
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 300 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    window.__failOnCall = -1;
    const statusText = document.getElementById("stRsGen").textContent;
    const statusClass = document.getElementById("stRsGen").className;
    return {
      reqCount: window.__reqs.length,
      retryShown: document.getElementById("btnRsRetry").style.display !== "none",
      statusIsError: statusClass.indexOf("err") >= 0,
      notFalselyReportedAsStopped: !/✓/.test(statusText),
      partialResultStillShown: document.getElementById("rsResultBox").className.indexOf(" on") >= 0
    };
  }, B64);
  report("a real mid-pipeline failure surfaces as an error with retry, not a false 'stopped ✓' message", failResult.reqCount === 2 && failResult.retryShown && failResult.statusIsError && failResult.notFalselyReportedAsStopped && failResult.partialResultStillShown, JSON.stringify(failResult));

  // 8) editing the pipeline queue (e.g. tapping a different recipe) WHILE a
  // run is already in flight must not corrupt that already-running execution
  const queueMutationResult = await page.evaluate(async (b64) => {
    rsSetMode("pipeline");
    state.refs = [{ mime: "image/png", b64: b64, label: "original" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsRecipeGrid .chip")[0].click(); // evoto, rsGlam
    window.__reqs = []; window.__callN = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 20 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 10));
    rsPipelineQueue = ["rsNatural", "rsEditorial", "rsGlam"]; // simulates tapping another recipe mid-run
    for (let w = 0; w < 300 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    return { reqCount: window.__reqs.length };
  }, B64);
  report("mid-run edits to the pipeline queue don't corrupt the already-running execution", queueMutationResult.reqCount === 2, JSON.stringify(queueMutationResult));

  // 9) a reference image left in slot 2/3 by another page (Studio/Create)
  // must not silently ride along into a Retouch Studio request, and must be
  // restored afterward so those other pages are unaffected
  const staleRefResult = await page.evaluate(async (b64) => {
    rsSetMode("onetap");
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, { mime: "image/png", b64: "STALE_REF", label: "leftover" }, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0;
    document.querySelectorAll("#rsPresetGrid .chip")[0].click();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 100 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const parts = (r.contents && r.contents[0] && r.contents[0].parts) || [];
    const imgDatas = parts.filter(p => p.inline_data && p.inline_data.data).map(p => p.inline_data.data);
    return {
      imgCount: imgDatas.length,
      leakedStaleRef: imgDatas.indexOf("STALE_REF") >= 0,
      slot1RestoredAfter: state.refs[1] && state.refs[1].b64 === "STALE_REF"
    };
  }, B64);
  report("a leftover reference image in slot 2/3 doesn't leak into the request and is restored after", staleRefResult.imgCount === 1 && !staleRefResult.leakedStaleRef && staleRefResult.slot1RestoredAfter, JSON.stringify(staleRefResult));

  // 10) generation controls must reject re-entrant taps while one generation
  // is already running, so two concurrent calls into the shared dispatcher
  // can never race each other over state.hist/state.refs
  const reentrancyResult = await page.evaluate(async (b64) => {
    rsSetMode("pipeline");
    state.refs = [{ mime: "image/png", b64: b64, label: "original" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsRecipeGrid .chip")[0].click();
    window.__reqs = []; window.__callN = 0;
    document.getElementById("btnRsGen").onclick();
    for (let w = 0; w < 20 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 10));
    const chipsDisabledDuringRun = Array.from(document.querySelectorAll("#rsPresetGrid .chip")).every(c => c.disabled);
    document.querySelectorAll("#rsPresetGrid .chip")[0].click(); // attempted re-entrant tap while busy
    const genDisabledDuringRun = document.getElementById("btnRsGen").disabled;
    document.getElementById("btnRsGen").onclick(); // attempted re-entrant tap on Generate itself
    for (let w = 0; w < 300 && document.getElementById("btnRsGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    return { reqCount: window.__reqs.length, chipsDisabledDuringRun, genDisabledDuringRun };
  }, B64);
  report("controls reject re-entrant generation while one is already running", reentrancyResult.reqCount === 2 && reentrancyResult.chipsDisabledDuringRun && reentrancyResult.genDisabledDuringRun, JSON.stringify(reentrancyResult));

  // 11) "set as before photo" feeds the latest result back into IMAGE 1
  const toRefResult = await page.evaluate(() => {
    document.getElementById("btnRsToRef").click();
    return { refLabel: state.refs[0] && state.refs[0].label };
  });
  report("btnRsToRef sets the latest result as the new before photo", toRefResult.refLabel === "result", JSON.stringify(toRefResult));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
