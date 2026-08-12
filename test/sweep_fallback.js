/* Mocked check of cross-provider auto-fallback: configure both Gemini
   (a key that will fail every call) and RunningHub (fully working), select
   Gemini as the primary provider with fallback ON, GENERATE, and assert the
   RunningHub path actually delivered the result. Also checks fallback OFF
   correctly stops after the primary provider's failure instead of trying
   the backup.

   v4.28 §4.2 (F1) — NEW CONTRACT: a promptless upscale-kind RunningHub model
   must never serve as a CROSS-PROVIDER fallback. Before v4.28 the fallback
   dispatcher happily routed a failed Gemini prompt into whatever RH model was
   active; if that model was an upscale endpoint the prompt was silently
   discarded and the user got back a same-looking photo presented as a
   successful generate. The new rule: when RunningHub is NOT the user-selected
   provider and the active RH model is upscale-kind, substitute the first
   configured prompt-capable RH model, or drop RH from the pool entirely.
   When RunningHub IS the selected provider, upscale stays legal (the user
   asked for it).
   Usage: PORT=8931 node test/sweep_fallback.js */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__geminiCalls = 0;
    window.__rhSubmits = [];   // v4.28: every RH model endpoint the app actually submitted to
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf(":generateContent") >= 0) {
        window.__geminiCalls++;
        return Promise.resolve(new Response(JSON.stringify({error:{message:"quota exceeded"}}), {status:429}));
      }
      if (u.indexOf("www.runninghub.ai") >= 0) {
        if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/out.png",fileName:"openapi/mock.png",size:"100"}}), {status:200}));
        if (u.indexOf("/openapi/v2/query") >= 0) return Promise.resolve(new Response(JSON.stringify({taskId:"t1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
        /* any model endpoint: record the apiPath, then answer like a queued task */
        var mm = u.match(/\\/openapi\\/v2\\/(.+)$/);
        if (mm) {
          window.__rhSubmits.push(mm[1]);
          return Promise.resolve(new Response(JSON.stringify({taskId:"t1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
        }
      }
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var bin = atob("${B64}");
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.key = "TEST_GEMINI_KEY_THAT_FAILS";
    state.rhKey = "TEST_RH_KEY"; // Nano Banana 2 has a built-in apiPath default — key alone is enough
    renderRhProviderOption();
    document.getElementById("selProvider").value = "gemini";
  });

  async function runOnce(fallbackOn, provider) {
    return page.evaluate(async (arg) => {
      const [b64, fbOn, prov] = arg;
      document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
      const card = document.querySelectorAll("#wfHost .wfmini")[0];
      card.click();
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await sleep(30);
      const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
      if (!gold()) return "wizard did not open";
      for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: b64, label: "t" + s };
      gold().click(); await sleep(30);
      if (!gold() || gold().disabled) return "step2 blocked";
      gold().click(); await sleep(30);
      if (!gold()) return "no GENERATE button";
      const sel = document.getElementById("selProvider");
      sel.value = prov || "gemini";
      if (sel.onchange) sel.onchange();
      document.getElementById("chkFallback").checked = fbOn;
      const histBefore = state.hist.length;
      gold().click();
      for (let w = 0; w < 100; w++) {
        if (state.hist.length > histBefore) return "OK";
        const stGen = document.getElementById("stGen");
        const btn = document.getElementById("btnGen");
        if (stGen && stGen.className.indexOf("err") >= 0 && stGen.textContent && !btn.disabled) return "ERR:" + stGen.textContent;
        await sleep(50);
      }
      return "TIMEOUT";
    }, [B64, fallbackOn, provider]);
  }

  console.log("\n== fallback ON: Gemini fails, RunningHub should deliver ==");
  const r1 = await runOnce(true);
  console.log("result:", r1);
  const pass1 = r1 === "OK";
  console.log(pass1 ? "PASS (fallback delivered a result)" : "FAIL");

  console.log("\n== fallback OFF: Gemini fails, should stop with an error (no RunningHub call) ==");
  await page.evaluate(() => { window.__geminiCalls = 0; });
  const r2 = await runOnce(false);
  console.log("result:", r2);
  const pass2 = r2 !== "OK"; // must NOT succeed — only Gemini was allowed and it always fails
  console.log(pass2 ? "PASS (stopped without silently using another provider)" : "FAIL");

  // ---- v4.28 §4.2 (F1): upscale-kind RH models are not cross-provider fallbacks ----
  const upPath = await page.evaluate(() => {
    var c = rhCfg(); c.activeModel = "upscale-pro"; rhSaveCfg(c);
    window.__geminiCalls = 0; window.__rhSubmits = [];
    return { apiPath: rhEffectiveApiPath("upscale-pro"), kind: rhEffectiveKind("upscale-pro") };
  });
  console.log("\n== F1: active RH model is upscale-kind, Gemini selected, fallback ON ==");
  console.log("active upscale model:", JSON.stringify(upPath));
  const r3 = await runOnce(true, "gemini");
  const sub3 = await page.evaluate(() => window.__rhSubmits.slice());
  console.log("result:", r3, "RH submits:", JSON.stringify(sub3));
  // The prompt must NEVER be handed to a promptless upscale endpoint here. Either
  // a prompt-capable RH model stood in, or RH was dropped from the pool entirely.
  const noUpscale3 = sub3.every(p => p.indexOf(upPath.apiPath) < 0) && !/upscale/i.test(sub3.join("|"));
  const pass3 = upPath.kind === "upscale" && noUpscale3;
  console.log(pass3 ? "PASS (the failed Gemini prompt was never routed into the promptless upscale endpoint)"
    : "FAIL (F1): upscale endpoint served a cross-provider fallback — " + JSON.stringify(sub3));
  // and if a substitute ran, it must have been a prompt-capable model that delivered
  const pass3b = sub3.length === 0 || r3 === "OK";
  console.log(pass3b ? "PASS (substitute RH model either delivered or RH was dropped cleanly)"
    : "FAIL (F1 substitute): " + r3 + " " + JSON.stringify(sub3));

  console.log("\n== F1 counterpart: RunningHub is the SELECTED provider — upscale stays legal ==");
  await page.evaluate(() => { window.__geminiCalls = 0; window.__rhSubmits = []; });
  const r4 = await runOnce(false, "runninghub");
  const sub4 = await page.evaluate(() => window.__rhSubmits.slice());
  console.log("result:", r4, "RH submits:", JSON.stringify(sub4));
  // the user explicitly picked the upscale model — it must still be the one that runs
  const pass4 = sub4.some(p => p.indexOf(upPath.apiPath) >= 0);
  console.log(pass4 ? "PASS (user-selected upscale model still runs on the RunningHub path)"
    : "FAIL (F1 over-reach): the guard also blocked the user's own choice — " + JSON.stringify(sub4));

  const overall = pass1 && pass2 && pass3 && pass3b && pass4;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
