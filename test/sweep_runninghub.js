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
          || u.indexOf("/openapi/v2/rhart-image-x-official/edit") >= 0
          || u.indexOf("/openapi/v2/alibaba/qwen-image-2.0/image-edit") >= 0
          || u.indexOf("/openapi/v2/topazlabs/image-upscale-standard-v2") >= 0
          || u.indexOf("/openapi/v2/seedream-v4/image-to-image") >= 0
          || u.indexOf("/openapi/v2/seedream-v4.5/image-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-imagine-image-quality/edit") >= 0
          || u.indexOf("/openapi/v2/rhart-image/z-image-turbo/image-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-image/f-2-dev/edit-lora") >= 0
          || u.indexOf("/openapi/v2/rhart-image/qwen-image/edit-2511") >= 0
          || u.indexOf("/openapi/v2/rhart-image-g/image-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-image-v1/edit") >= 0
          || u.indexOf("/openapi/v2/rhart-image-g-1.5-official/image-to-image") >= 0
          || u.indexOf("/openapi/v2/seedream-v5-pro/image-to-image") >= 0
          || u.indexOf("/openapi/v2/topazlabs/image-gigapixel-standard-2") >= 0
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
      "rh-imagine-quality-edit", "z-image-turbo", "upscale-transparent", "flux-2-dev",
      /* v5.54.0 catalog wave — every new image-edit entry ships configured */
      "seedream-v5-lite", "seedream-v5-pro", "dola-seedream-5-pro", "grok-image-i2i",
      "qwen-image-3", "qwen-image-3-pro", "wan-25-image", "nano-banana-v1-off",
      "nano-banana-v1", "nano-banana-2-off", "nano-banana-2-lite-off", "nano-banana-2-lite",
      "nano-banana-pro-ultra", "gpt-image-15-off", "jimeng-46", "sd5-layers",
      "topaz-gp-standard", "topaz-gp-lowres", "topaz-gp-text", "topaz-gp-hifi",
      "topaz-gp-art", "topaz-up-faces", "topaz-up-hifi3",
      "flux-2-dev-edit-plain", "flux-klein-9b-edit", "flux-klein-4b-edit",
      "flux-klein-4b-edit-lora", "flux-kontext-lora", "qwen-edit-2511",
      "qwen-edit-2511-lora", "wan-22-image", "z-image-turbo-lora"];
    /* v5.53.4 — empty at last: flux-2-dev was the final placeholder, now
       configured with the owner's rhart-image/f-2-dev/edit-lora spec. The
       mechanism stays so any future placeholder lands here, not in silence. */
    var stillUnconfigured = [];
    return {
      hasOption: !!opt, configured: rhIsConfigured("nano-banana-2"), active: !!rhActiveModelCfg(),
      apiPath: rhEffectiveApiPath("nano-banana-2"),
      allBuiltinsConfigured: builtins.every(function(id){ return rhIsConfigured(id); }),
      noneOfUnconfigured: stillUnconfigured.every(function(id){ return !rhIsConfigured(id); }),
      g2OffQuality: rhEffectiveQuality("rh-image-g2-off"),
      xOffImageParam: rhEffectiveImageParam("rh-image-x-off"),
      xOffKind: rhEffectiveKind("rh-image-x-off"),
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
    && setup.xOffKind === "xedit"
    && setup.qwenSizeParam === true && setup.wanWhParam === true && setup.wanProWhParam === true && setup.upscaleKind === "upscale"
    && setup.upscaleImageParam === "imageUrl"
    && setup.seedreamKind === "seedream" && setup.seedream45Kind === "seedream"
    && setup.imagineKind === "imagine" && setup.imagineImageParam === "imageUrl"
    && setup.zimageKind === "zimage"
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
  /* v5.50.0 — RunningHub is the one engine: the Quality select and the
     Gemini branch left with the retirement, so the check covers Ratio/Count
     hiding for upscale-kind and their return for a prompt-capable model. */
  const genOptsUi = await page.evaluate(() => {
    var c1 = rhCfg(); c1.activeModel = "upscale-pro"; rhSaveCfg(c1);
    updateGenOptsForRHKind();
    var hiddenForUpscale = document.getElementById("selRatio").style.display === "none"
      && document.getElementById("selCount").style.display === "none";
    var c2 = rhCfg(); c2.activeModel = "nano-banana-2"; rhSaveCfg(c2);
    updateGenOptsForRHKind();
    var visibleForNonUpscale = document.getElementById("selRatio").style.display !== "none"
      && document.getElementById("selCount").style.display !== "none";
    var qualGone = !document.getElementById("selQual");
    return { hiddenForUpscale, visibleForNonUpscale, qualGone };
  });
  console.log("genOpts UI (upscale-kind hides Ratio/Count):", JSON.stringify(genOptsUi));
  const genOptsUiOk = genOptsUi.hiddenForUpscale && genOptsUi.visibleForNonUpscale && genOptsUi.qualGone;
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

  // v4.28 §4.3 — seedream-v4-5 clamp. The v4.5 endpoint's resolution enum
  // starts at 2k: "1k" is out-of-enum and the API rejects it. Since the app's
  // DEFAULT Size is the empty/auto option (which every other seedream maps to
  // "1k"), v4.5 must be clamped up to "2k" instead of sending the invalid
  // value. Run at the default Size, not an explicit one — that is the path
  // that used to break.
  const sd45Result = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "seedream-v4-5"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("selSize").value = "";      // DEFAULT size — the regression path
    document.getElementById("prompt").value = "test seedream v4.5 prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/seedream-v4.5/image-to-image") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("seedream v4.5 submit body:", JSON.stringify(sd45Result.body));
  const sd45Ok = sd45Result.ok && sd45Result.body
    && sd45Result.body.resolution === "2k" && sd45Result.body.resolution !== "1k"
    && Array.isArray(sd45Result.body.imageUrls);
  console.log(sd45Ok ? 'PASS (seedream-v4-5 clamps the default Size up to "2k", never sends out-of-enum "1k")'
    : ("FAIL (seedream v4.5 clamp): " + JSON.stringify(sd45Result)));

  // The clamp must be scoped to v4.5 — plain seedream-v4 still honours "1k".
  const sd40Result = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "seedream-v4"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selSize").value = "";
    document.getElementById("prompt").value = "test seedream v4 default size";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/seedream-v4/image-to-image") >= 0) || {}).body || null;
    return { body: body };
  }, B64);
  const sd40Ok = !!sd40Result.body && sd40Result.body.resolution === "1k";
  console.log(sd40Ok ? 'PASS (clamp is scoped to v4.5 — seedream-v4 still sends "1k" at default Size)'
    : ("FAIL (clamp over-reach): " + JSON.stringify(sd40Result)));

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

  // Z-Image Turbo (v5.53.4 — corrected to the owner's OpenAPI spec): the
  // body is ComfyUI node-keyed (66##image/41##text/64##select/
  // 65##file_type, all REQUIRED) — never the old flat imageUrl/prompt/
  // aspectRatio/outputFormat keys, which the spec does not declare. Pick
  // "4:5" — a ratio the shared #selRatio dropdown DOES offer but this
  // endpoint's "1".."7" select does NOT — and it must fall back to "1"
  // (1:1), the same fallback the flat body used. No resolution of any
  // kind, and no auto option exists on this endpoint's enum.
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
  const zimageOk = zimageResult.ok && zimageResult.body && zimageResult.body["64##select"] === "1"
    && zimageResult.body["65##file_type"] === "PNG"
    && typeof zimageResult.body["66##image"] === "string" && zimageResult.body["66##image"].length > 0
    && String(zimageResult.body["41##text"]).indexOf("test z-image prompt") >= 0
    && zimageResult.body.aspectRatio === undefined && zimageResult.body.outputFormat === undefined
    && zimageResult.body.imageUrl === undefined && zimageResult.body.imageUrls === undefined
    && zimageResult.body.prompt === undefined && zimageResult.body.resolution === undefined;
  console.log(zimageOk ? "PASS (z-image node-keyed body; out-of-enum ratio falls back to \"1\" = 1:1)" : ("FAIL (z-image): " + JSON.stringify(zimageResult)));

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
  const zimageValidOk = zimageValidResult.ok && zimageValidResult.body && zimageValidResult.body["64##select"] === "5";
  console.log(zimageValidOk ? 'PASS (z-image valid ratio 16:9 maps to the documented "5")' : ("FAIL (z-image valid ratio): " + JSON.stringify(zimageValidResult)));

  // Flux 2 Dev — Edit (v5.53.4): the ComfyUI node-keyed body from the owner's
  // rhart-image/f-2-dev/edit-lora OpenAPI spec — 51##image/16##text/
  // 47##select/52##file_type ONLY. Must never carry the standard prompt/
  // imageUrls/resolution/aspectRatio fields, and must omit the optional
  // 18## LoRA pair (documented default strength 0 = plain FLUX.2 editing).
  // Also checks the control-honesty UI: Size hidden (no such field on this
  // endpoint) and the ratio dropdown narrowed to the documented seven
  // (no "4:5").
  const fluxResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "flux-2-dev"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    updateGenOptsForRHKind();
    var opts = Array.prototype.map.call(document.getElementById("selRatio").options, function(o){ return o.value || o.textContent; });
    var ratioHas45 = opts.indexOf("4:5") >= 0;
    var sizeHidden = document.getElementById("selSize").style.display === "none";
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("prompt").value = "test flux edit prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/f-2-dev/edit-lora") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body,
      ratioHas45: ratioHas45, sizeHidden: sizeHidden, st: document.getElementById("stGen").textContent };
  }, B64);
  console.log("flux edit submit body:", JSON.stringify(fluxResult.body),
    "ratioHas45:", fluxResult.ratioHas45, "sizeHidden:", fluxResult.sizeHidden);
  const fluxOk = fluxResult.ok && fluxResult.body
    && typeof fluxResult.body["51##image"] === "string" && fluxResult.body["51##image"].length > 0
    && String(fluxResult.body["16##text"]).indexOf("test flux edit prompt") >= 0
    && fluxResult.body["47##select"] === "5"
    && fluxResult.body["52##file_type"] === "PNG"
    && fluxResult.body.prompt === undefined && fluxResult.body.imageUrls === undefined
    && fluxResult.body.resolution === undefined && fluxResult.body.aspectRatio === undefined
    && fluxResult.body["18##lora_name"] === undefined && fluxResult.body["18##strength_model"] === undefined
    && fluxResult.ratioHas45 === false && fluxResult.sizeHidden === true;
  console.log(fluxOk ? "PASS (flux edit node-keyed body + narrowed controls)" : ("FAIL (flux edit): " + JSON.stringify(fluxResult)));

  // Auto ratio must send the documented "9" (auto-match the input image) —
  // 47##select is REQUIRED, so it can never be omitted or guessed.
  const fluxAutoResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    document.getElementById("selRatio").value = "";
    document.getElementById("prompt").value = "test flux edit auto ratio";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/f-2-dev/edit-lora") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body };
  }, B64);
  console.log("flux edit auto-ratio body:", JSON.stringify(fluxAutoResult.body));
  const fluxAutoOk = fluxAutoResult.ok && fluxAutoResult.body && fluxAutoResult.body["47##select"] === "9";
  console.log(fluxAutoOk ? 'PASS (flux edit Auto ratio sends the documented "9" auto-match)' : ("FAIL (flux edit auto ratio): " + JSON.stringify(fluxAutoResult)));

  // Restore the full ratio dropdown for the tests below (they assume the
  // default, un-narrowed control set).
  await page.evaluate(() => {
    var c = rhCfg(); c.activeModel = "nano-banana-2"; rhSaveCfg(c);
    updateGenOptsForRHKind();
  });

  // Grok Imagine Quality Edit (v5.53.4): the spec's OPTIONAL aspectRatio
  // enum is seven ratios + auto — a shared-dropdown value outside it
  // ("4:5") must be OMITTED (= the documented auto default), never sent.
  const imagineOutResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "rh-imagine-quality-edit"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    document.getElementById("selRatio").value = "4:5";
    document.getElementById("selSize").value = "1K";
    document.getElementById("prompt").value = "test imagine out-of-enum ratio";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/rhart-imagine-image-quality/edit") >= 0) || {}).body || null;
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body };
  }, B64);
  console.log("imagine edit out-of-enum ratio body:", JSON.stringify(imagineOutResult.body));
  const imagineOutOk = imagineOutResult.ok && imagineOutResult.body && imagineOutResult.body.aspectRatio === undefined
    && imagineOutResult.body.resolution === "1k" && imagineOutResult.body.numImages === "1";
  console.log(imagineOutOk ? 'PASS (imagine edit omits an out-of-enum ratio — the documented "auto" default)' : ("FAIL (imagine out-of-enum): " + JSON.stringify(imagineOutResult)));

  // Grok Imagine — Edit (v5.53.4, was "RH Image X (Official)"): the owner's
  // spec declares EXACTLY prompt + image. The body must carry nothing else
  // (the old default-branch resolution/aspectRatio were undeclared params),
  // and the Create page must hide Ratio and Size for it.
  const xeditResult = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "rh-image-x-off"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    updateGenOptsForRHKind();
    var ratioHidden = document.getElementById("selRatio").style.display === "none";
    var sizeHidden = document.getElementById("selSize").style.display === "none";
    document.getElementById("prompt").value = "test grok imagine edit prompt";
    state.refs[0] = { mime: "image/png", b64: b64, label: "t0" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/rhart-image-x-official/edit") >= 0) || {}).body || null;
    // restore the default control set for the tests below
    var c2 = rhCfg(); c2.activeModel = "nano-banana-2"; rhSaveCfg(c2);
    updateGenOptsForRHKind();
    return { ok: document.getElementById("resultBox").className.indexOf("on") >= 0, body: body,
      ratioHidden: ratioHidden, sizeHidden: sizeHidden };
  }, B64);
  console.log("grok imagine edit body:", JSON.stringify(xeditResult.body),
    "ratioHidden:", xeditResult.ratioHidden, "sizeHidden:", xeditResult.sizeHidden);
  const xeditOk = xeditResult.ok && xeditResult.body
    && typeof xeditResult.body.prompt === "string" && xeditResult.body.prompt.length > 0
    && typeof xeditResult.body.image === "string" && xeditResult.body.image.length > 0
    && xeditResult.body.resolution === undefined && xeditResult.body.aspectRatio === undefined
    && xeditResult.body.imageUrls === undefined && xeditResult.body.imageUrl === undefined
    && xeditResult.ratioHidden === true && xeditResult.sizeHidden === true;
  console.log(xeditOk ? "PASS (grok imagine edit sends the bare prompt+image pair; Ratio/Size hidden)" : ("FAIL (grok imagine edit): " + JSON.stringify(xeditResult)));

  // ---- v5.54.0 catalog wave: representative new i2i shapes on the wire ----
  // Generic node kind (qwen edit-2511): three image slots — with two refs,
  // 57## and 58## fill and 59## stays absent; ratio "16:9" -> "5".
  const q2511 = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "qwen-edit-2511"; rhSaveCfg(c);
    document.getElementById("selProvider").value = "runninghub";
    updateGenOptsForRHKind();
    document.getElementById("selRatio").value = "16:9";
    document.getElementById("prompt").value = "test 2511";
    state.refs[0] = { mime: "image/png", b64: b64, label: "a" };
    state.refs[1] = { mime: "image/png", b64: b64, label: "b" };
    for (let i = 2; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    return (window.__rhBodies.find(b => b.url.indexOf("/qwen-image/edit-2511") >= 0) || {}).body || null;
  }, B64);
  console.log("qwen-2511 body:", JSON.stringify(q2511));
  const q2511Ok = q2511 && typeof q2511["57##image"] === "string" && typeof q2511["58##image"] === "string"
    && q2511["59##image"] === undefined && q2511["28##select"] === "5" && q2511["52##file_type"] === "PNG"
    && q2511.prompt === undefined && q2511.imageUrls === undefined;
  console.log(q2511Ok ? "PASS (generic node kind: multi-slot fill + shared ratio table)" : ("FAIL (qwen-2511): " + JSON.stringify(q2511)));

  // grokimg: REQUIRED model field, single optional imageUrl, nothing else.
  const grok42 = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "grok-image-i2i"; rhSaveCfg(c);
    updateGenOptsForRHKind();
    var ratioHidden = document.getElementById("selRatio").style.display === "none";
    var sizeHidden = document.getElementById("selSize").style.display === "none";
    document.getElementById("prompt").value = "test grok 4.2";
    state.refs[0] = { mime: "image/png", b64: b64, label: "a" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    return { body: (window.__rhBodies.find(b => b.url.indexOf("/rhart-image-g/image-to-image") >= 0) || {}).body || null,
      ratioHidden: ratioHidden, sizeHidden: sizeHidden };
  }, B64);
  console.log("grok 4.2 body:", JSON.stringify(grok42.body), "hidden:", grok42.ratioHidden, grok42.sizeHidden);
  const grok42Ok = grok42.body && grok42.body.model === "g-4.2" && typeof grok42.body.imageUrl === "string"
    && grok42.body.resolution === undefined && grok42.body.aspectRatio === undefined
    && grok42.ratioHidden === true && grok42.sizeHidden === true;
  console.log(grok42Ok ? "PASS (grok 4.2 model field + bare body; Ratio/Size hidden)" : ("FAIL (grok42): " + JSON.stringify(grok42)));

  // nanov1: aspectRatio REQUIRED with a literal documented "auto" — an
  // out-of-enum pick must send "auto", never the raw value.
  const nanoV1 = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "nano-banana-v1"; rhSaveCfg(c);
    updateGenOptsForRHKind();
    document.getElementById("selRatio").value = "";
    document.getElementById("prompt").value = "test nano v1";
    state.refs[0] = { mime: "image/png", b64: b64, label: "a" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    return (window.__rhBodies.find(b => b.url.indexOf("/rhart-image-v1/edit") >= 0) || {}).body || null;
  }, B64);
  const nanoV1Ok = nanoV1 && nanoV1.aspectRatio === "auto" && Array.isArray(nanoV1.imageUrls) && nanoV1.resolution === undefined;
  console.log(nanoV1Ok ? 'PASS (nano v1 Auto sends the documented literal "auto")' : ("FAIL (nano v1): " + JSON.stringify(nanoV1)));

  // sd5pro: resolution 1k|2k (2k default) + outputFormat png; never 4k.
  const sd5 = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "seedream-v5-pro"; rhSaveCfg(c);
    updateGenOptsForRHKind();
    document.getElementById("selSize").value = "4K";
    document.getElementById("prompt").value = "test sd5 pro";
    state.refs[0] = { mime: "image/png", b64: b64, label: "a" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    return (window.__rhBodies.find(b => b.url.indexOf("/seedream-v5-pro/image-to-image") >= 0) || {}).body || null;
  }, B64);
  const sd5Ok = sd5 && sd5.resolution === "2k" && sd5.outputFormat === "png" && Array.isArray(sd5.imageUrls);
  console.log(sd5Ok ? "PASS (seedream v5 pro clamps to its 1k|2k enum + png output)" : ("FAIL (sd5pro): " + JSON.stringify(sd5)));

  // topaz gigapixel reuses the upscale-transparent shape end to end.
  const gp = await page.evaluate(async (b64) => {
    window.__rhBodies.length = 0;
    document.getElementById("resultBox").className = "card result-box";
    var c = rhCfg(); c.activeModel = "topaz-gp-standard"; rhSaveCfg(c);
    updateGenOptsForRHKind();
    document.getElementById("selSize").value = "2K";
    document.getElementById("prompt").value = "";
    state.refs[0] = { mime: "image/png", b64: b64, label: "a" };
    for (let i = 1; i < 4; i++) state.refs[i] = null;
    document.getElementById("btnGen").onclick();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const body = (window.__rhBodies.find(b => b.url.indexOf("/topazlabs/image-gigapixel-standard-2") >= 0) || {}).body || null;
    // restore the default control set for the tests below
    var c2 = rhCfg(); c2.activeModel = "nano-banana-2"; rhSaveCfg(c2);
    updateGenOptsForRHKind();
    return body;
  }, B64);
  const gpOk = gp && gp.outputWidth === 2560 && gp.outputHeight === 1440 && typeof gp.imageUrl === "string"
    && gp.scale === undefined && gp.prompt === undefined;
  console.log(gpOk ? "PASS (topaz gigapixel rides the upscale-transparent shape)" : ("FAIL (gigapixel): " + JSON.stringify(gp)));

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

  const overall = result === "OK" && qwenOk && upOk && seedreamOk && sd45Ok && sd40Ok && imagineOk && zimageOk && zimageValidOk
    && fluxOk && fluxAutoOk && imagineOutOk && xeditOk && q2511Ok && grok42Ok && nanoV1Ok && sd5Ok && gpOk
    && upTransparentOk && upTransparentNoImgOk && noImgOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
