/* Mocked end-to-end check of RunningHub text-to-image generation: save a
   fake key, verify all 6 confirmed models populate the model select, then
   run representative models through the actual generate flow and
   inspect the captured request body:
     - Flux 2 Dev (rhart-image/f-2-dev/text-to-image): aspectRatio is
       REQUIRED, so a bad/missing ratio selection must still send a valid
       default rather than omitting the field.
     - Qwen Image 3.0 Pro (alibaba/qwen-image-3.0-pro/text-to-image): uses a
       "size" WxH string instead of aspectRatio/resolution at all.
   Also checks the RH Imagine Image Quality model always sends its two
   required fields (resolution clamped to its 1k/2k-only enum, numImages).
   Results are plain {mime,b64} images and must land in state.t2iHist +
   trigger the same resultBox "on" flow as every other image result.
   Usage: PORT=8931 node test/sweep_text2img.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__t2iBodies = [];
    window.__trCalls = [];   // v4.28 §3.1: Burmese -> English translator hops
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf(":generateContent") >= 0) {
        try { window.__trCalls.push(JSON.parse(opts.body)); } catch(e) { window.__trCalls.push(null); }
        return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:"TRANSLATED_ENGLISH_PROMPT"}]}}]}), {status:200}));
      }
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var bin = atob("${B64}");
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      if (opts && typeof opts.body === "string") {
        try { window.__t2iBodies.push({ url: u, body: JSON.parse(opts.body) }); } catch(e) {}
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-t2i-1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/rhart-image/f-2-dev/text-to-image") >= 0
          || u.indexOf("/openapi/v2/alibaba/qwen-image-3.0-pro/text-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-image-g-2-official/text-to-image") >= 0
          || u.indexOf("/openapi/v2/alibaba/wan-2.5-preview/text-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-image-g-1.5-official/text-to-image") >= 0
          || u.indexOf("/openapi/v2/youchuan/text-to-image-v82") >= 0
          || u.indexOf("/openapi/v2/rhart-image-v1/text-to-image") >= 0
          || u.indexOf("/openapi/v2/rhart-image/z-image/turbo") >= 0
          || u.indexOf("/openapi/v2/rhart-imagine-image-quality/text-to-image") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-t2i-1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.rhKey = "TEST_RH_KEY";
    var ids = ["flux-2-dev","nano-banana-pro-t2i","rh-image-g2-t2i","rh-imagine-quality","qwen-image-3-pro-t2i","youchuan-v81"];
    var sel = document.getElementById("selT2IModel");
    return {
      allOptionsPresent: ids.every(function(id){ return !!sel.querySelector('option[value="'+id+'"]'); }),
      optionCount: sel.options.length
    };
  });
  console.log("setup:", JSON.stringify(setup));
  if (!setup.allOptionsPresent || setup.optionCount !== 49) {
    console.log("FAIL: text-to-image model select did not populate all 49 models (6 + the v5.54.0 catalog wave's 43)");
    await browser.close();
    process.exit(1);
  }

  // Size picker must only offer tiers a model actually honors: hidden
  // entirely for flux-2-dev (no resolutionField/sizeField), and limited to
  // 1K/2K only for rh-imagine-quality (never letting "4K" be picked at all,
  // rather than silently downgrading it after the fact).
  const sizeUi = await page.evaluate(() => {
    document.getElementById("selT2IModel").value = "flux-2-dev";
    document.getElementById("selT2IModel").onchange();
    const fluxHidden = document.getElementById("selT2IRes").style.display === "none";
    document.getElementById("selT2IModel").value = "rh-imagine-quality";
    document.getElementById("selT2IModel").onchange();
    const imagineOptions = Array.from(document.getElementById("selT2IRes").options).map(o => o.value);
    return { fluxHidden, imagineOptions };
  });
  console.log("size-picker UI:", JSON.stringify(sizeUi));
  const sizeUiOk = sizeUi.fluxHidden && sizeUi.imagineOptions.indexOf("4K") < 0 && sizeUi.imagineOptions.indexOf("2K") >= 0;
  console.log(sizeUiOk ? "PASS (size picker matches model capability)" : ("FAIL (size picker): " + JSON.stringify(sizeUi)));
  if (!sizeUiOk) {
    await browser.close();
    process.exit(1);
  }

  async function runModel(modelId, ratioValue, sizeValue, prompt, apiPathFragment) {
    return page.evaluate(async (args) => {
      var [modelId, ratioValue, sizeValue, prompt, apiPathFragment] = args;
      window.__t2iBodies.length = 0;
      document.getElementById("t2iResultBox").className = "card result-box";
      document.getElementById("selT2IModel").value = modelId;
      document.getElementById("selT2IModel").onchange();
      if (document.getElementById("selT2IRatio").style.display !== "none") {
        document.getElementById("selT2IRatio").value = ratioValue;
      }
      if (document.getElementById("selT2IRes").style.display !== "none") {
        document.getElementById("selT2IRes").value = sizeValue;
      }
      document.getElementById("t2iPrompt").value = prompt;
      document.getElementById("btnT2IGen").onclick();
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let w = 0; w < 100 && document.getElementById("t2iResultBox").className.indexOf("on") < 0; w++) await sleep(50);
      const ok = document.getElementById("t2iResultBox").className.indexOf("on") >= 0
        && document.getElementById("t2iResultImg").src.indexOf("data:image") === 0;
      const found = window.__t2iBodies.find(b => b.url.indexOf(apiPathFragment) >= 0);
      const body = found ? found.body : null;
      return { ok, body, st: document.getElementById("stT2IGen").textContent };
    }, [modelId, ratioValue, sizeValue, prompt, apiPathFragment]);
  }

  // Flux 2 Dev (v5.53.4 — corrected to its fetched doc api-448184518): the
  // body is ComfyUI node-keyed — 12##text/41##select/43##file_type, all
  // REQUIRED. "Auto" (empty) must still send a valid select — "1" (1:1),
  // since this endpoint's enum has no auto option — and the old flat
  // prompt/aspectRatio/outputFormat keys must be gone.
  const flux = await runModel("flux-2-dev", "", "1K", "a lion on the savannah", "f-2-dev/text-to-image");
  console.log("flux body:", JSON.stringify(flux.body));
  const fluxOk = flux.ok && flux.body && flux.body["41##select"] === "1"
    && String(flux.body["12##text"]).indexOf("a lion on the savannah") >= 0
    && flux.body["43##file_type"] === "PNG"
    && flux.body.prompt === undefined && flux.body.aspectRatio === undefined
    && flux.body.outputFormat === undefined && flux.body.imageUrls === undefined;
  console.log(fluxOk ? "PASS (flux node-keyed body; Auto ratio sends \"1\" = 1:1)" : ("FAIL (flux): " + JSON.stringify(flux)));

  // Qwen 3.0 Pro T2I: uses "size" WxH, no aspectRatio/resolution fields.
  const qwen = await runModel("qwen-image-3-pro-t2i", "16:9", "2K", "a futuristic city skyline", "qwen-image-3.0-pro/text-to-image");
  console.log("qwen t2i body:", JSON.stringify(qwen.body));
  const qwenOk = qwen.ok && qwen.body && qwen.body.size === "2048*1152"
    && qwen.body.aspectRatio === undefined && qwen.body.resolution === undefined;
  console.log(qwenOk ? "PASS (qwen t2i size mapping)" : ("FAIL (qwen t2i): " + JSON.stringify(qwen)));

  // RH Imagine Image Quality: resolution enum is 1k/2k ONLY (the picker no
  // longer even offers "4K", verified above) — a legitimate "2K" pick must
  // be honored exactly, and numImages must always be sent.
  const imagine = await runModel("rh-imagine-quality", "1:1", "2K", "a bowl of fruit, still life", "rhart-imagine-image-quality/text-to-image");
  console.log("imagine body:", JSON.stringify(imagine.body));
  const imagineOk = imagine.ok && imagine.body && imagine.body.numImages === "1" && imagine.body.resolution === "2k";
  console.log(imagineOk ? "PASS (imagine size honored + numImages)" : ("FAIL (imagine): " + JSON.stringify(imagine)));

  // GPT Image 2 T2I (v5.53.4, from the owner's OpenAPI spec): resolution and
  // quality are REQUIRED (quality ships the documented default "medium",
  // exactly like the i2i sibling), aspectRatio is optional, and the endpoint
  // declares NO outputFormat/numImages/size fields — sending one would be an
  // invented parameter.
  const gpt = await runModel("rh-image-g2-t2i", "16:9", "2K", "a wedding poster with golden title text", "rhart-image-g-2-official/text-to-image");
  console.log("gpt t2i body:", JSON.stringify(gpt.body));
  const gptOk = gpt.ok && gpt.body && gpt.body.resolution === "2k" && gpt.body.quality === "medium"
    && gpt.body.aspectRatio === "16:9"
    && gpt.body.outputFormat === undefined && gpt.body.numImages === undefined && gpt.body.size === undefined
    && gpt.body.imageUrls === undefined;
  console.log(gptOk ? "PASS (gpt t2i required resolution+quality, no invented fields)" : ("FAIL (gpt t2i): " + JSON.stringify(gpt)));

  // Auto size must still send the REQUIRED resolution (cheapest documented
  // tier), and Auto ratio must omit the optional aspectRatio so the server's
  // own documented 16:9 default applies.
  const gptAuto = await runModel("rh-image-g2-t2i", "", "", "a minimal product photo", "rhart-image-g-2-official/text-to-image");
  console.log("gpt t2i auto body:", JSON.stringify(gptAuto.body));
  const gptAutoOk = gptAuto.ok && gptAuto.body && gptAuto.body.resolution === "1k"
    && gptAuto.body.quality === "medium" && gptAuto.body.aspectRatio === undefined;
  console.log(gptAutoOk ? "PASS (gpt t2i Auto: resolution still sent, aspectRatio omitted)" : ("FAIL (gpt t2i auto): " + JSON.stringify(gptAuto)));

  // ---- v5.54.0 catalog wave: five representative new models prove their
  // documented shapes on the wire (each def cites its fetched doc). ----
  // wan-2.5 t2i: size is REQUIRED from a five-value W*H enum — Auto must
  // still send the documented default 1280*1280, never omit.
  const wan25 = await runModel("wan-25-t2i", "", "1K", "a red lantern", "wan-2.5-preview/text-to-image");
  const wan25Ok = wan25.ok && wan25.body && wan25.body.size === "1280*1280" && wan25.body.aspectRatio === undefined;
  console.log(wan25Ok ? "PASS (wan-2.5 t2i required size defaults to 1280*1280)" : ("FAIL (wan25 t2i): " + JSON.stringify(wan25.body)));
  // gpt-1.5 t2i: ratio only picks one of three fixed sizes; the endpoint
  // declares NO aspectRatio field, and quality is REQUIRED.
  const g15 = await runModel("gpt15-off-t2i", "3:2", "1K", "a poster", "rhart-image-g-1.5-official/text-to-image");
  const g15Ok = g15.ok && g15.body && g15.body.size === "1536*1024" && g15.body.quality === "medium" && g15.body.aspectRatio === undefined;
  console.log(g15Ok ? "PASS (gpt-1.5 t2i fixed size + quality, no aspectRatio)" : ("FAIL (gpt15 t2i): " + JSON.stringify(g15.body)));
  // midjourney v8.2: hd is REQUIRED (like v8.1) and ships true.
  const mj82 = await runModel("mj-v82-t2i", "16:9", "1K", "an anime city", "youchuan/text-to-image-v82");
  const mj82Ok = mj82.ok && mj82.body && mj82.body.hd === true && mj82.body.aspectRatio === "16:9";
  console.log(mj82Ok ? "PASS (mj v8.2 required hd flag)" : ("FAIL (mj82): " + JSON.stringify(mj82.body)));
  // nano-banana v1: aspectRatio is REQUIRED with a literal "auto" value —
  // Auto sends "auto", never omits and never forces a fixed ratio.
  const nv1 = await runModel("nano-v1-t2i", "", "1K", "a banana", "rhart-image-v1/text-to-image");
  const nv1Ok = nv1.ok && nv1.body && nv1.body.aspectRatio === "auto";
  console.log(nv1Ok ? 'PASS (nano v1 t2i Auto sends the documented literal "auto")' : ("FAIL (nano v1): " + JSON.stringify(nv1.body)));
  // z-image turbo t2i: node-keyed (10##text/28##select/29##file_type).
  const zt = await runModel("z-turbo-t2i", "9:16", "1K", "a neon sign", "rhart-image/z-image/turbo");
  const ztOk = zt.ok && zt.body && zt.body["28##select"] === "4" && zt.body["29##file_type"] === "PNG"
    && String(zt.body["10##text"]).indexOf("a neon sign") >= 0 && zt.body.prompt === undefined;
  console.log(ztOk ? "PASS (z-image turbo t2i node-keyed body)" : ("FAIL (z-turbo): " + JSON.stringify(zt.body)));

  // ---- v5.50.0: the Gemini translate bridge is retired — a Burmese t2i
  // prompt always ships raw with the English-recommended hint shown, and no
  // translate call ever leaves the browser. ----
  const MY = "ရွှေရောင် နေဝင်ချိန်မှာ တောင်တန်းတွေ";
  const trWithKey = await page.evaluate(async () => {
    window.__trCalls.length = 0;
    return null;
  }).then(() => runModel("flux-2-dev", "1:1", "1K", MY, "f-2-dev/text-to-image"));
  const trCalls = await page.evaluate(() => window.__trCalls.length);
  const hintWithKey = await page.evaluate(() => {
    var h = document.getElementById("t2iTrHint");
    return !!h && h.style.display !== "none";
  });
  console.log("raw Burmese t2i body prompt:", JSON.stringify(trWithKey.body && trWithKey.body["12##text"]));
  const trOk = trWithKey.ok && trWithKey.body && trCalls === 0
    && String(trWithKey.body["12##text"]).indexOf(MY) >= 0 && hintWithKey;
  console.log(trOk ? "PASS (Burmese t2i prompt sends raw with the hint — no translate call leaves the browser)"
    : ("FAIL (t2i translate gate): " + JSON.stringify({ trCalls, hintWithKey, prompt: trWithKey.body && trWithKey.body.prompt })));

  // Without a Gemini key there is nothing to translate WITH — the app must say
  // so inline instead of silently shipping Burmese, and must still send the
  // raw prompt (informed user choice, not a hard block).
  const noKey = await page.evaluate(() => { state.key = ""; window.__trCalls.length = 0; })
    .then(() => runModel("flux-2-dev", "1:1", "1K", MY, "f-2-dev/text-to-image"));
  const noKeyState = await page.evaluate(() => {
    var h = document.getElementById("t2iTrHint");
    return { visible: !!h && h.style.display !== "none", text: h ? h.textContent : "", calls: window.__trCalls.length };
  });
  console.log("no-key hint:", JSON.stringify(noKeyState));
  const noKeyOk = noKey.ok && noKey.body && noKeyState.visible && noKeyState.text.length > 0
    && noKeyState.calls === 0 && String(noKey.body["12##text"]).indexOf(MY) >= 0;
  console.log(noKeyOk ? "PASS (no key: inline hint is shown and the raw prompt still sends)"
    : ("FAIL (t2i no-key hint): " + JSON.stringify({ noKeyState, prompt: noKey.body && noKey.body.prompt })));

  // An English prompt must never take the translator hop or raise the hint.
  const enOnly = await page.evaluate(() => { state.key = "TEST_GEMINI_KEY"; window.__trCalls.length = 0; })
    .then(() => runModel("flux-2-dev", "1:1", "1K", "a lighthouse at dawn", "f-2-dev/text-to-image"));
  const enState = await page.evaluate(() => ({
    calls: window.__trCalls.length,
    hint: document.getElementById("t2iTrHint").style.display !== "none"
  }));
  const enOk = enOnly.ok && enState.calls === 0 && !enState.hint
    && String(enOnly.body["12##text"]).indexOf("a lighthouse at dawn") >= 0;
  console.log(enOk ? "PASS (English prompt skips the translator and the hint entirely)"
    : ("FAIL (t2i english passthrough): " + JSON.stringify(enState)));

  const overall = fluxOk && qwenOk && imagineOk && gptOk && gptAutoOk && wan25Ok && g15Ok && mj82Ok && nv1Ok && ztOk && trOk && noKeyOk && enOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
