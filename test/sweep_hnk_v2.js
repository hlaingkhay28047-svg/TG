/* Mocked regression sweep for the HNK V2 Retouch hero on pgRetouch (v4.26.0
   wave): DP-panel-simple hero (photo slot -> strength -> mode -> quality ->
   gold V2 RETOUCH) riding the shared $("btnGen") dispatcher, with the
   RunningHub Upscale Pro HD-finish pass and the Manual (One-Tap/Sliders)
   accordion intact underneath. 8 assertions:
   1. hero present + gen-bar-as-photo-picker gating (empty tap opens picker,
      no request, no error)
   2. Fast defaults compose a well-formed flash request (strength/texture/
      color/guard fragments, no aspect-ratio line) and restore the shared
      generate selects afterward
   3. Quality tier forces the pro model + 2K imageSize; a strength dot and a
      single mode reshape the prompt (color-only, no texture block)
   4. success lands in the shared result box / history / status / v2 log
   5. Advanced controls (tone swatch, hair, de-shine) reach both the request
      text and the live #v2PromptPreview (preview honesty)
   6. HD tier runs the mocked upload -> topazlabs submit -> query chain and
      unshifts the RH-downloaded output over the base result
   7. Next photo re-opens the picker armed, auto-starts on the pick, and
      keeps every V2 setting unchanged
   8. the Manual accordion still holds the full One-Tap/Sliders layer
      (renamed "Studio Clean" chip generates with the TASK GUARD)
   Harness: sweep_retouch_studio.js Gemini mock + sweep_video_upscale.js
   RunningHub mocks.
   Usage: PORT=8931 node test/sweep_hnk_v2.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__reqs = [];
    window.__outs = ["GEMOUT1", "GEMOUT2", "GEMOUT3", "GEMOUT4", "GEMOUT5", "GEMOUT6"];
    window.__callN = 0;
    window.__rhReqs = [];
    window.__pickN = 0;
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var mo = /out_(\\d+)\\.png/.exec(u);
        var payload = (mo && window.__outs[+mo[1]]) || "${B64}";
        var bin = atob(payload);
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      if (u.indexOf("www.runninghub.ai") >= 0) {
        if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/in.png",fileName:"openapi/in.png",size:"100"}}), {status:200}));
        }
        if (u.indexOf("/openapi/v2/query") >= 0) {
          var tn = 0;
          try { tn = +(/T(\\d+)/.exec(JSON.parse(opts.body).taskId)||[0,0])[1]; } catch(e){}
          return Promise.resolve(new Response(JSON.stringify({taskId:"T"+tn,status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out_"+tn+".png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
        }
        if (u.indexOf("topazlabs/image-upscale-standard-v2") >= 0) {
          try { window.__rhReqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__rhReqs.push({ url: u, parseError: String(e) }); }
          return Promise.resolve(new Response(JSON.stringify({taskId:"T999",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
        }
        if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
        }
        /* v5.50.0 — every other RH call is a main-model submit (the one
           engine); record it exactly like the old Gemini branch did, delay
           AFTER recording for the same re-entrancy window */
        var thisCall = window.__callN;
        try { window.__reqs.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) { window.__reqs.push({ url: u, parseError: String(e) }); }
        window.__callN++;
        return new Promise(function(resolve){
          setTimeout(function(){
            resolve(new Response(JSON.stringify({taskId:"T"+thisCall,status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
          }, 60);
        });
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.rhKey = "TEST_RH_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    // the picker stub: V2's START doubles as the photo picker when slot 0 is empty
    document.getElementById("filePick").click = function(){ window.__pickN++; };
  });

  let allOk = true;
  function report(name, ok, extra){
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }
  const joinedText = r => String((r && r.body && r.body.prompt) || "");

  // 1) hero present + gen-bar picker gating: an empty tap opens the picker,
  // sends nothing and errors nothing
  const heroResult = await page.evaluate(() => {
    switchPage("pgRetouch");
    const heroOk = !!document.getElementById("v2Hero") && !!document.getElementById("btnV2Start");
    state.refs = [null, null, null];
    renderRefs();
    window.__reqs = []; window.__callN = 0; window.__pickN = 0;
    document.getElementById("btnV2Start").onclick();
    return { heroOk, reqCount: window.__reqs.length, pickN: window.__pickN, statusText: document.getElementById("stV2Gen").textContent };
  });
  report("hero present; empty START becomes the photo picker (no request, no error)",
    heroResult.heroOk && heroResult.reqCount === 0 && heroResult.pickN === 1 && !heroResult.statusText,
    JSON.stringify(heroResult));

  // 2) Fast defaults compose: one flash request with the strength/texture/
  // color/guard fragments, no aspect-ratio line; shared selects restored
  const fastResult = await page.evaluate(async (b64) => {
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    renderRefs();
    // pin the defaults regardless of any state a previous check persisted
    state.v2 = { strength:60, mode:"both", quality:"fast", balance:0, blemish:60, deshine:0, tone:"off", toneStrength:42, hair:"off", outfit:"off" };
    renderV2Hero();
    const pre = ["selRatio","selCount","selSize"].map(id => document.getElementById(id).value);
    // make the pre-run values distinctive so a non-restore is visible
    document.getElementById("selRatio").value = "9:16";
    document.getElementById("selCount").value = "2";
    const pre2 = ["selRatio","selCount","selSize"].map(id => document.getElementById(id).value);
    window.__reqs = []; window.__callN = 0;
    await document.getElementById("btnV2Start").onclick();
    const post = ["selRatio","selCount","selSize"].map(id => document.getElementById(id).value);
    // put the shared selects back to their defaults: later checks (Manual
    // layer) generate through the live selects, where count=2 would honestly
    // fire two requests
    document.getElementById("selRatio").value = "";
    document.getElementById("selCount").value = "1";
    const r = window.__reqs[0] || {};
    const txt = String((r.body && r.body.prompt) || "");
    return {
      reqCount: window.__reqs.length,
      urlFlash: String(r.url || "").indexOf("rhart-image-n-g31-flash/image-to-image") >= 0,
      noQualityLine: txt.indexOf("QUALITY: ultra-detailed") < 0,
      has60: txt.indexOf("(60%)") >= 0,
      hasTexture: txt.indexOf("SKIN TEXTURE") >= 0,
      hasColor: txt.indexOf("SKIN COLOR") >= 0,
      hasNeverBlur: txt.indexOf("never blur") >= 0,
      hasGuard: txt.indexOf("TASK GUARD") >= 0,
      noRatioLine: txt.indexOf("Output aspect ratio") < 0,
      selectsRestored: JSON.stringify(post) === JSON.stringify(pre2),
      pre, pre2, post
    };
  }, B64);
  report("Fast defaults compose the full prompt on the RH model and restore the shared selects",
    fastResult.reqCount === 1 && fastResult.urlFlash && fastResult.has60 && fastResult.hasTexture
    && fastResult.hasColor && fastResult.hasNeverBlur && fastResult.hasGuard && fastResult.noRatioLine
    && fastResult.noQualityLine && fastResult.selectsRestored,
    JSON.stringify(fastResult));

  // 3+4) Quality tier + Subtle dot + single mode reshape the request; the
  // result lands in the shared result box / history / status / v2 log
  const qualityResult = await page.evaluate(async () => {
    document.querySelectorAll("#v2Dots .chip")[0].click();          // Subtle = 30
    document.getElementById("v2ModeCol").click();                   // Skin Color Fix only
    document.querySelectorAll("#v2QualityChips .chip")[1].click();  // Quality tier
    window.__reqs = []; window.__callN = 0;
    const beforeFirst = state.hist[0];
    await document.getElementById("btnV2Start").onclick();
    const r = window.__reqs[0] || {};
    const txt = String((r.body && r.body.prompt) || "");
    return {
      reqCount: window.__reqs.length,
      urlPro: String(r.url || "").indexOf("rhart-image-n-g31-flash/image-to-image") >= 0,
      imageSize2K: txt.indexOf("QUALITY: ultra-detailed") >= 0, /* the tier's QUALITY line replaces the old 2K model force */
      has30: txt.indexOf("(30%)") >= 0,
      hasOrangeYellow: txt.indexOf("orange/yellow") >= 0,
      noTextureBlock: txt.indexOf("SKIN TEXTURE") < 0,
      resultOn: document.getElementById("rsResultBox").className.indexOf("result-box on") >= 0,
      histChanged: state.hist[0] !== beforeFirst,
      histSel0: state.histSel === 0,
      histThumbs: document.querySelectorAll("#rsHist img").length,
      statusOk: document.getElementById("stV2Gen").className.indexOf("ok") >= 0,
      logStamped: /\[\d\d:\d\d:\d\d\]/.test(document.getElementById("v2Log").textContent)
    };
  });
  report("Quality tier forces the QUALITY finish line; Subtle dot + Color-only mode reshape the prompt",
    qualityResult.reqCount === 1 && qualityResult.urlPro && qualityResult.imageSize2K
    && qualityResult.has30 && qualityResult.hasOrangeYellow && qualityResult.noTextureBlock,
    JSON.stringify(qualityResult));
  report("result lands: shared result box + history + ok status + timestamped v2 log",
    qualityResult.resultOn && qualityResult.histChanged && qualityResult.histSel0
    && qualityResult.histThumbs >= 1 && qualityResult.statusOk && qualityResult.logStamped,
    JSON.stringify(qualityResult));

  // 5) Advanced fragments reach the request AND the live prompt preview
  const advResult = await page.evaluate(async () => {
    const grp = document.getElementById("v2GrpAdvanced");
    grp.querySelector(".grp-h").click();
    const opened = grp.className.indexOf("open") >= 0;
    document.getElementById("v2ModeBoth").click();                       // both blocks back on
    document.querySelectorAll("#v2ToneChips .chip.v2-sw")[0].click();    // swatch 1 = #E7D9DE
    document.querySelectorAll("#v2HairChips .chip")[1].click();          // hair Soft
    const de = document.getElementById("v2Deshine"); de.value = 40; de.oninput.call(de);
    const preview = document.getElementById("v2PromptPreview").textContent;
    window.__reqs = []; window.__callN = 0;
    await document.getElementById("btnV2Start").onclick();
    const r = window.__reqs[0] || {};
    const txt = String((r.body && r.body.prompt) || "");
    const frags = ["E7D9DE", "42%", "flyaway", "oily shine"];
    return {
      opened,
      reqCount: window.__reqs.length,
      reqHasAll: frags.every(f => txt.indexOf(f) >= 0),
      previewHasAll: frags.every(f => preview.indexOf(f) >= 0),
      toneStrengthShown: document.getElementById("v2ToneStrengthWrap").style.display !== "none"
    };
  });
  report("Advanced fragments (tone swatch/hair/de-shine) reach the request and the preview",
    advResult.opened && advResult.reqCount === 1 && advResult.reqHasAll && advResult.previewHasAll
    && advResult.toneStrengthShown,
    JSON.stringify(advResult));

  // 6) HD finish: after the Gemini success, one topazlabs submit at
  // v4.28 W2: the HD tier now forces the 2K finish size (scale 4x) through the
  // shared hdFinishSize() helper — 2x was out of step with the "HD" promise
  const hdResult = await page.evaluate(async (b64) => {
    state.rhKey = "TEST_RH_KEY";
    renderV2Hero(); // gate re-evaluated on every render — chip enables now
    const hdChip = document.querySelectorAll("#v2QualityChips .chip")[2];
    const wasEnabled = !hdChip.disabled;
    const hintHidden = document.getElementById("v2HdHint").style.display === "none";
    hdChip.click();
    window.__reqs = []; window.__callN = 0; window.__rhReqs = [];
    window.__outs = ["GEMOUTHD"]; // distinct from the RH-downloaded PNG below
    await document.getElementById("btnV2Start").onclick();
    const sub = window.__rhReqs[0] || {};
    return {
      wasEnabled, hintHidden,
      gemCount: window.__reqs.length,
      rhSubmits: window.__rhReqs.length,
      urlTopaz: String(sub.url || "").indexOf("topazlabs/image-upscale-standard-v2") >= 0,
      scale4x: sub.body && sub.body.scale === "4x", // hdFinishSize("2K") → rhScaleFromSize → 4x
      imageUrlSent: sub.body && typeof sub.body.imageUrl === "string" && sub.body.imageUrl.length > 0,
      histIsRhOut: state.hist[0] && state.hist[0].b64 === b64,        // the mocked download round-trips to the tiny PNG
      histNotGemini: state.hist[0] && state.hist[0].b64 !== "GEMOUTHD",
      baseStillInHist: !!state.hist[1] && state.hist[1].b64 === "GEMOUTHD" // base result preserved beneath, never destroyed
    };
  }, B64);
  report("HD tier: enabled chip + topazlabs 2K-finish (4x) submit; RH output lands over the preserved base",
    hdResult.wasEnabled && hdResult.hintHidden && hdResult.gemCount === 1 && hdResult.rhSubmits === 1
    && hdResult.urlTopaz && hdResult.scale4x && hdResult.imageUrlSent
    && hdResult.histIsRhOut && hdResult.histNotGemini && hdResult.baseStillInHist,
    JSON.stringify(hdResult));

  // 7) Next photo: arms the picker, auto-starts on the pick, settings unchanged
  const nextResult = await page.evaluate(async (b64) => {
    document.querySelectorAll("#v2QualityChips .chip")[0].click(); // back to Fast (no RH pass) — a settings change also disarms, proving btnV2Next re-arms
    const snap = JSON.stringify(state.v2);
    window.__reqs = []; window.__callN = 0; window.__pickN = 0;
    window.__outs = ["GEMOUT_NEXT"];
    document.getElementById("btnV2Next").click();
    const armed = state.v2Armed === true;
    const picked = window.__pickN === 1;
    // simulate the pick landing (what filePick.onchange does)
    state.refs[0] = { mime: "image/png", b64: b64, label: "next-photo" };
    renderRefs(); // fan-out -> renderV2Hero -> auto-start hook
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 200 && rsBusy; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const txt = String((r.body && r.body.prompt) || "");
    const strengthNow = state.v2.strength;
    return {
      armed, picked,
      autoFired: window.__reqs.length === 1,
      sameStrength: txt.indexOf("(" + strengthNow + "%)") >= 0,
      settingsUnchanged: JSON.stringify(state.v2) === snap,
      disarmedAfter: state.v2Armed === false,
      logCounts: /#\d+/.test(document.getElementById("v2Log").textContent)
    };
  }, B64);
  report("Next photo re-arms the picker, auto-starts on pick, and keeps every setting",
    nextResult.armed && nextResult.picked && nextResult.autoFired && nextResult.sameStrength
    && nextResult.settingsUnchanged && nextResult.disarmedAfter && nextResult.logCounts,
    JSON.stringify(nextResult));

  // 8) Manual layer intact: closed accordion holding the full One-Tap/Sliders
  // UI; the renamed "Studio Clean" chip still generates with the TASK GUARD
  const manualResult = await page.evaluate(async () => {
    const grp = document.getElementById("rsGrpManual");
    const present = !!grp;
    const closedByDefault = present && grp.className.indexOf("open") < 0;
    if (present) grp.querySelector(".grp-h").click();
    const opens = present && grp.className.indexOf("open") >= 0;
    const insideOk = ["rsTabOnetap", "rsPresetGrid", "rsSlidersPane"].every(id => {
      const n = document.getElementById(id);
      return !!n && grp.contains(n);
    });
    const chip0 = document.querySelectorAll("#rsPresetGrid .chip")[0]; // evoto -> renamed
    const renamed = chip0 && chip0.textContent.indexOf("Studio Clean") >= 0;
    const titleHasOld = chip0 && String(chip0.title).indexOf("Retouch B") >= 0;
    window.__reqs = []; window.__callN = 0;
    window.__outs = ["GEMOUT_MANUAL"];
    chip0.click();
    for (let w = 0; w < 100 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 200 && rsBusy; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const txt = String((r.body && r.body.prompt) || "");
    return {
      present, closedByDefault, opens, insideOk, renamed, titleHasOld,
      manualReqCount: window.__reqs.length,
      manualHasGuard: txt.indexOf("TASK GUARD") >= 0,
      resultOn: document.getElementById("rsResultBox").className.indexOf("result-box on") >= 0
    };
  });
  report("Manual accordion intact: One-Tap/Sliders preserved, renamed chip still generates",
    manualResult.present && manualResult.closedByDefault && manualResult.opens && manualResult.insideOk
    && manualResult.renamed && manualResult.titleHasOld && manualResult.manualReqCount === 1
    && manualResult.manualHasGuard && manualResult.resultOn,
    JSON.stringify(manualResult));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
