/* Mocked end-to-end check of the RunningHub Enterprise (Standard Model API,
   openapi/v2) generation path: save a fake key (Nano Banana 2 has a built-in
   apiPath default — no manual mapping needed), open one workflow card,
   switch the Provider select to RunningHub, GENERATE, and assert the mocked
   upload -> submit -> query(poll) -> download chain produces a result.
   Also verifies every other built-in model (RH Image G-2, RH Image X, Nano
   Banana Pro, Qwen Image 2/Pro, Wan Image Edit, Upscale Pro) configures
   correctly from just the key, and that the two families with a genuinely
   different request shape (Qwen's "size" WxH string, Upscale's prompt-less
   imageUrl+scale body) actually produce the right request body — not just
   that a request was sent.
   Run against the deployed docs/app/index.html, same as sweep_workflows.js.
   Usage: PORT=8931 node test/sweep_runninghub.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__rhCalls = [];
    window.__rhBodies = [];
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var bin = atob("${B64}");
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      window.__rhCalls.push(u);
      if (opts && typeof opts.body === "string") {
        try { window.__rhBodies.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) {}
      }
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/up_0.png",fileName:"openapi/up_0.png",size:"100"}}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/rhart-image-n-g31-flash/image-to-image") >= 0
          || u.indexOf("/openapi/v2/alibaba/qwen-image-2.0/image-edit") >= 0
          || u.indexOf("/openapi/v2/topazlabs/image-upscale-standard-v2") >= 0
          || u.indexOf("/openapi/v2/seedream-v4/image-to-image") >= 0
          || u.indexOf("/openapi/v2/seedream-v4.5/image-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-imagine-image-quality/edit") >= 0
          || u.indexOf("/openapi/v2/rhart-image/z-image-turbo/image-to-image") >= 0
          || u.indexOf("/openapi/v2/topazlabs/image-upscale-transparent") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.rhKey = "TEST_RH_KEY";
    renderRhProviderOption();
    var opt = document.querySelector('#selProvider option[value="runninghub"]');
    var builtins = ["nano-banana-2", "rh-image-g2-off", "rh-image-g2", "rh-image-x-off",
      "nano-banana-pro-off", "nano-banana-pro", "qwen-image-2", "qwen-image-2-pro",
      "wan-image-edit", "wan-image-edit-pro", "upscale-pro", "seedream-v4", "seedream-v4-5",
      "rh-imagine-quality-edit", "z-image-turbo", "upscale-transparent"];
    var stillUnconfigured = ["gpt-image-2", "flux-2-dev"];
    return {
      hasOption: !!opt, configured: rhIsConfigured("nano-banana-2"), active: !!rhActiveModelCfg(),
      apiPath: rhEffectiveApiPath("nano-banana-2"),
      allBuiltinsConfigured: builtins.every(function(id){ return rhIsConfigured(id); }),
      noneOfUnconfigured: stillUnconfigured.every(function(id){ return !rhIsConfigured(id); }),
      g2OffQuality: rhEffectiveQuality("rh-image-g2-off"),
      xOffImageParam: rhEffectiveImageParam("rh-image-x-off"),
      qwenSizeParam: rhEffectiveSizeParam("qwen-image-2"),
      wanWhParam: rhEffectiveWhParam("wan-image-edit"),
      wanProWhParam: rhEffectiveWhParam("wan-image-edit-pro"),
      upscaleKind: rhEffectiveKind("upscale-pro"),
      upscaleImageParam: rhEffectiveImageParam("upscale-pro"),
      seedreamKind: rhEffectiveKind("seedream-v4"),
      seedream45Kind: rhEffectiveKind("seedream-v4-5"),
      imagineKind: rhEffectiveKind("rh-imagine-quality-edit"),
      imagineImageParam: rhEffectiveImageParam("rh-imagine-quality-edit"),
      zimageKind: rhEffectiveKind("z-image-turbo"),
      zimageImageParam: rhEffectiveImageParam("z-image-turbo"),
      upTransparentKind: rhEffectiveKind("upscale-transparent"),
      upTransparentImageParam: rhEffectiveImageParam("upscale-transparent"),
      upTransparentWh2k: rhUpscaleTransparentWH("2K"),
      upTransparentWhAuto: rhUpscaleTransparentWH(""),
      // pure function checks — no network involved
      qwenSize1_1_hd: rhQwenSize("1:1", "2K"),
      qwenSize16_9_std: rhQwenSize("16:9", ""),
      qwenSizeAuto: rhQwenSize("", "1K"),
      wanWh16_9: rhWanWH("16:9", ""),
      wanWhAuto: rhWanWH("", "1K"),
      scale1k: rhScaleFromSize(""), scale2k: rhScaleFromSize("2K"), scale4k: rhScaleFromSize("4K"),
      // rhTruncatePrompt must keep the TASK GUARD block intact and trim the
      // task description instead, never the other way around (regression for
      // the .slice(0,maxLen) bug the adversarial review caught).
      truncKeepsGuard: (function(){
        var head = "x".repeat(2000);
        var guard = "TASK GUARD:\nkeep this exact block intact no matter what.";
        var out = rhTruncatePrompt(head + "\n\n" + guard, 800);
        return { len: out.length, hasGuard: out.indexOf(guard) >= 0, hasFullHead: out.indexOf(head) >= 0 };
      })()
    };
  });
  console.log("setup:", JSON.stringify(setup));
  var setupOk = setup.hasOption && setup.configured && setup.active && setup.allBuiltinsConfigured
    && setup.noneOfUnconfigured && setup.g2OffQuality === "medium" && setup.xOffImageParam === "image"
    && setup.qwenSizeParam === true && setup.wanWhParam === true && setup.wanProWhParam === true && setup.upscaleKind === "upscale"
    && setup.upscaleImageParam === "imageUrl"
    && setup.seedreamKind === "seedream" && setup.seedream45Kind === "seedream"
    && setup.imagineKind === "imagine" && setup.imagineImageParam === "imageUrl"
    && setup.zimageKind === "zimage" && setup.zimageImageParam === "imageUrl"
    && setup.upTransparentKind === "upscale-transparent" && setup.upTransparentImageParam === "imageUrl"
    && setup.upTransparentWh2k && setup.upTransparentWh2k.w === 2560 && setup.upTransparentWh2k.h === 1440
    && setup.upTransparentWhAuto === null
    && setup.qwenSize1_1_hd === "1536*1536" && setup.qwenSize16_9_std === "1280*720" && setup.qwenSizeAuto === ""
    && setup.wanWh16_9 && setup.wanWh16_9.w === 1024 && setup.wanWh16_9.h === 576 && setup.wanWhAuto === null
    && setup.scale1k === "2x" && setup.scale2k === "4x" && setup.scale4k === "6x"
    && setup.truncKeepsGuard.len <= 800 && setup.truncKeepsGuard.hasGuard === true && setup.truncKeepsGuard.hasFullHead === false;
  if (!setupOk) {
    console.log("FAIL: RunningHub provider option/config did not register correctly for all built-in models");
    await browser.close();
    process.exit(1);
  }

  // Ratio/Quality/Count are silent no-ops for upscale-kind RH models (see
  // rhGenerateUpscale/rhGenerateUpscaleTransparent — neither reads prompt,
  // ratio, or count at all) — the Create page must hide them rather than
  // let a user configure settings that get silently ignored, and must
  // switch back to visible when a non-upscale model is active.
  const genOptsUi = await page.evaluate(() => {
    document.getElementById("selProvider").value = "runninghub";
    var c1 = rhCfg(); c1.activeModel = "upscale-pro"; rhSaveCfg(c1);
    document.getElementById("selProvider").onchange();
    var hiddenForUpscale = document.getElementById("selRatio").style.display === "none"
      && document.getElementById("selQual").style.display === "none"
      && document.getElementById("selCount").style.display === "none";
    var c2 = rhCfg(); c2.activeModel = "nano-banana-2"; rhSaveCfg(c2);
    document.getElementById("selProvider").onchange();
    var visibleForNonUpscale = document.getElementById("selRatio").style.display !== "none"
      && document.getElementById("selQual").style.display !== "none"
      && document.getElementById("selCount").style.display !== "none";
    document.getElementById("selProvider").value = "gemini";
    document.getElementById("selProvider").onchange();
    var visibleForGemini = document.getElementById("selRatio").style.display !== "none";
    return { hiddenForUpscale, visibleForNonUpscale, visibleForGemini };
  });
  console.log("genOpts UI (upscale-kind hides Ratio/Quality/Count):", JSON.stringify(genOptsUi));
  const genOptsUiOk = genOptsUi.hiddenForUpscale && genOptsUi.visibleForNonUpscale && genOptsUi.visibleForGemini;
  console.log(genOptsUiOk ? "PASS (genOpts hidden for upscale-kind, visible otherwise)" : ("FAIL (genOpts UI): " + JSON.stringify(genOptsUi)));
  if (!genOptsUiOk) {
    await browser.close();
    process.exit(1);
  }

  const result = await page.evaluate(async (b64) => {
    document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
    const card = document.querySelectorAll("#wfHost .wfmini")[0];
    if (!card) return "no card found";
    card.click();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await sleep(30);
    const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
    if (!gold()) return "wizard did not open";
    for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: b64, label: "t" + s };
    gold().click(); await sleep(30);           // step 1 -> 2
    if (!gold()) return "no next on step2";
    if (gold().disabled) return "next disabled on step2";
    gold().click(); await sleep(30);           // step 2 -> 3
    if (!gold()) return "no GENERATE button";
    document.getElementById("selProvider").value = "runninghub";
    gold().click();                             // GENERATE
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const ok = document.getElementById("resultBox").className.indexOf("on") >= 0
      && document.getElementById("resultImg").src.indexOf("data:image") === 0;
    return ok ? "OK" : ("no result — " + (document.getElementById("stGen").textContent || ""));
  }, B64);

  const calls = await page.evaluate(() => window.__rhCalls);
  console.log("RunningHub calls made (nano-banana-2 e2e):", JSON.stringify(calls));
  console.log(result === "OK" ? "PASS (nano-banana-2 e2e)" : ("FAIL: " + result));

  // Qwen Image 2: activate it directly, generate via the Create page (not the
  // wizard) so ratio/size are under precise control, and inspect the actual
  // request body sent — must carry "size", must NOT carry resolution/aspectRatio.
  const qwenResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "qwen-image-2"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "1:1";
    document.getElementById("selSize").value = "2K";
    document.getElementById("prompt").value = "test qwen prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("qwen-image-2.0/image-edit") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("qwen submit body:", JSON.stringify(qwenResult.body));
  const qwenOk = qwenResult.ok && qwenResult.body && qwenResult.body.size === "1536*1536"
    && qwenResult.body.resolution === undefined && qwenResult.body.aspectRatio === undefined
    && Array.isArray(qwenResult.body.imageUrls);
  console.log(qwenOk ? "PASS (qwen size-mapping)" : ("FAIL (qwen size-mapping): " + JSON.stringify(qwenResult)));

  // Upscale Pro: no prompt required, single imageUrl + scale, no imageUrls array.
  const upResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "upscale-pro"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selSize").value = "4K";
    document.getElementById("prompt").value = "";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("image-upscale-standard-v2") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("upscale submit body:", JSON.stringify(upResult.body));
  const upOk = upResult.ok && upResult.body && upResult.body.scale === "6x"
    && typeof upResult.body.imageUrl === "string" && upResult.body.imageUrl.length > 0
    && upResult.body.imageUrls === undefined && upResult.body.prompt === undefined;
  console.log(upOk ? "PASS (upscale no-prompt body)" : ("FAIL (upscale no-prompt body): " + JSON.stringify(upResult)));

  // Seedream v4: activate it, generate at "2K" size, and inspect the actual
  // request body — must carry resolution (mapped from selSize, NOT width/
  // height), sequentialImageGeneration:"disabled", maxImages:1, and imageUrls
  // (never aspectRatio, which this endpoint doesn't declare at all).
  const seedreamResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "seedream-v4"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("selSize").value = "2K";
    document.getElementById("prompt").value = "test seedream prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/seedream-v4/image-to-image") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("seedream submit body:", JSON.stringify(seedreamResult.body));
  const seedreamOk = seedreamResult.ok && seedreamResult.body && seedreamResult.body.resolution === "2k"
    && seedreamResult.body.sequentialImageGeneration === "disabled" && seedreamResult.body.maxImages === 1
    && Array.isArray(seedreamResult.body.imageUrls)
    && seedreamResult.body.aspectRatio === undefined && seedreamResult.body.width === undefined && seedreamResult.body.height === undefined;
  console.log(seedreamOk ? "PASS (seedream resolution + sequential/maxImages defaults)" : ("FAIL (seedream): " + JSON.stringify(seedreamResult)));

  // RH Imagine Image Quality (edit): activate it, pick "4K" (this endpoint's
  // resolution enum is 1k/2k ONLY) and a valid ratio, and inspect the actual
  // request body — must clamp resolution down to "2k" (never send an invalid
  // "4k"), always carry numImages, use singular imageUrl, and carry the
  // selected aspectRatio.
  const imagineResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "rh-imagine-quality-edit"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("selSize").value = "4K";
    document.getElementById("prompt").value = "test imagine edit prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/rhart-imagine-image-quality/edit") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("imagine edit submit body:", JSON.stringify(imagineResult.body));
  const imagineOk = imagineResult.ok && imagineResult.body && imagineResult.body.resolution === "2k"
    && imagineResult.body.numImages === "1" && imagineResult.body.aspectRatio === "16:9"
    && typeof imagineResult.body.imageUrl === "string" && imagineResult.body.imageUrl.length > 0
    && imagineResult.body.imageUrls === undefined;
  console.log(imagineOk ? "PASS (imagine edit resolution clamp + numImages)" : ("FAIL (imagine edit): " + JSON.stringify(imagineResult)));

  // Z-Image Turbo: pick "4:5" — a ratio the shared #selRatio dropdown DOES
  // offer, but Z-Image Turbo's own aspectRatio enum does NOT include (its
  // enum is a strict subset of the shared dropdown's options). Must fall
  // back to the confirmed default "1:1" rather than sending the invalid
  // "4:5" value straight through. Also confirms outputFormat is always
  // sent and resolution is never sent (this endpoint has no such field).
  const zimageResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "z-image-turbo"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "4:5";
    document.getElementById("selSize").value = "2K";
    document.getElementById("prompt").value = "test z-image prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/z-image-turbo/image-to-image") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("z-image submit body (ratio 4:5 out of endpoint enum):", JSON.stringify(zimageResult.body));
  const zimageOk = zimageResult.ok && zimageResult.body && zimageResult.body.aspectRatio === "1:1"
    && zimageResult.body.outputFormat === "png" && zimageResult.body.resolution === undefined
    && typeof zimageResult.body.imageUrl === "string" && zimageResult.body.imageUrl.length > 0
    && zimageResult.body.imageUrls === undefined;
  console.log(zimageOk ? "PASS (z-image out-of-enum ratio falls back to 1:1)" : ("FAIL (z-image): " + JSON.stringify(zimageResult)));

  // A valid Z-Image Turbo ratio must pass through unchanged (not always 1:1).
  const zimageValidResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "z-image-turbo"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("prompt").value = "test z-image prompt 2";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/z-image-turbo/image-to-image") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body };
  }, B64);
  console.log("z-image submit body (valid ratio 16:9):", JSON.stringify(zimageValidResult.body));
  const zimageValidOk = zimageValidResult.ok && zimageValidResult.body && zimageValidResult.body.aspectRatio === "16:9";
  console.log(zimageValidOk ? "PASS (z-image valid ratio passes through)" : ("FAIL (z-image valid ratio): " + JSON.stringify(zimageValidResult)));

  // Upscale Transparent: activate it, pick "2K" (-> 2560x1440), and inspect
  // the actual request body — must carry outputWidth/outputHeight (never
  // "scale", which is Upscale Pro's field, not this endpoint's), no prompt,
  // and singular imageUrl.
  const upTransparentResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "upscale-transparent"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selSize").value = "2K";
    document.getElementById("prompt").value = "";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/topazlabs/image-upscale-transparent") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body };
  }, B64);
  console.log("upscale-transparent submit body:", JSON.stringify(upTransparentResult.body));
  const upTransparentOk = upTransparentResult.ok && upTransparentResult.body
    && upTransparentResult.body.outputWidth === 2560 && upTransparentResult.body.outputHeight === 1440
    && upTransparentResult.body.scale === undefined && upTransparentResult.body.prompt === undefined
    && typeof upTransparentResult.body.imageUrl === "string" && upTransparentResult.body.imageUrl.length > 0
    && upTransparentResult.body.imageUrls === undefined;
  console.log(upTransparentOk ? "PASS (upscale-transparent outputWidth/outputHeight body)" : ("FAIL (upscale-transparent): " + JSON.stringify(upTransparentResult)));

  // Upscale Transparent with no image attached must surface the same
  // helpful "add an image" message as Upscale Pro (shared no-image guard).
  const upTransparentNoImgMsg = await page.evaluate(async () => {
    var c = rhCfg(); c.activeModel = "upscale-transparent"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("prompt").value = "some text but no image";
    for (let i = 0; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 60; w++) {
      const st = document.getElementById("stGen");
      if (st && st.className.indexOf("err") >= 0 && st.textContent) return st.textContent;
      await sleep(50);
    }
    return "TIMEOUT — no error message appeared";
  });
  console.log("upscale-transparent no-image message:", upTransparentNoImgMsg);
  const upTransparentNoImgOk = /image|ပုံ/i.test(upTransparentNoImgMsg) && upTransparentNoImgMsg.indexOf("(?)") < 0;
  console.log(upTransparentNoImgOk ? "PASS (upscale-transparent no-image message)" : ("FAIL (upscale-transparent no-image message): " + upTransparentNoImgMsg));

  // Upscale Pro with no image attached must surface a helpful "add an image"
  // message, not the generic "RunningHub error — try again (?)" fallback.
  const noImgMsg = await page.evaluate(async () => {
    var c = rhCfg(); c.activeModel = "upscale-pro"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("prompt").value = "some text but no image";
    for (let i = 0; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 60; w++) {
      const st = document.getElementById("stGen");
      if (st && st.className.indexOf("err") >= 0 && st.textContent) return st.textContent;
      await sleep(50);
    }
    return "TIMEOUT — no error message appeared";
  });
  console.log("no-image message:", noImgMsg);
  const noImgOk = /image|ပုံ/i.test(noImgMsg) && noImgMsg.indexOf("(?)") < 0;
  console.log(noImgOk ? "PASS (upscale no-image message)" : ("FAIL (upscale no-image message): " + noImgMsg));

  const overall = result === "OK" && qwenOk && upOk && seedreamOk && imagineOk && zimageOk && zimageValidOk
    && upTransparentOk && upTransparentNoImgOk && noImgOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
