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
          || u.indexOf("/openapi/v2/topazlabs/image-upscale-standard-v2") >= 0) {
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
      "wan-image-edit", "upscale-pro"];
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
      upscaleKind: rhEffectiveKind("upscale-pro"),
      upscaleImageParam: rhEffectiveImageParam("upscale-pro"),
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
    && setup.qwenSizeParam === true && setup.wanWhParam === true && setup.upscaleKind === "upscale"
    && setup.upscaleImageParam === "imageUrl"
    && setup.qwenSize1_1_hd === "1536*1536" && setup.qwenSize16_9_std === "1280*720" && setup.qwenSizeAuto === ""
    && setup.wanWh16_9 && setup.wanWh16_9.w === 1024 && setup.wanWh16_9.h === 576 && setup.wanWhAuto === null
    && setup.scale1k === "2x" && setup.scale2k === "4x" && setup.scale4k === "6x"
    && setup.truncKeepsGuard.len <= 800 && setup.truncKeepsGuard.hasGuard === true && setup.truncKeepsGuard.hasFullHead === false;
  if (!setupOk) {
    console.log("FAIL: RunningHub provider option/config did not register correctly for all built-in models");
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

  const overall = result === "OK" && qwenOk && upOk && noImgOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
