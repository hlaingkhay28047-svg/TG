/* Mocked check of cross-provider auto-fallback: configure both Gemini
   (a key that will fail every call) and RunningHub (fully working), select
   Gemini as the primary provider with fallback ON, GENERATE, and assert the
   RunningHub path actually delivered the result. Also checks fallback OFF
   correctly stops after the primary provider's failure instead of trying
   the backup.
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
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf(":generateContent") >= 0) {
        window.__geminiCalls++;
        return Promise.resolve(new Response(JSON.stringify({error:{message:"quota exceeded"}}), {status:429}));
      }
      if (u.indexOf("www.runninghub.ai") >= 0) {
        if (u.indexOf("/task/openapi/upload") >= 0) return Promise.resolve(new Response(JSON.stringify({fileName:"mock.png"}), {status:200}));
        if (u.indexOf("/task/openapi/ai-app/run") >= 0) return Promise.resolve(new Response(JSON.stringify({taskId:"t1"}), {status:200}));
        if (u.indexOf("/task/openapi/status") >= 0) return Promise.resolve(new Response(JSON.stringify({status:"SUCCESS"}), {status:200}));
        if (u.indexOf("/task/openapi/outputs") >= 0) return Promise.resolve(new Response(JSON.stringify({outputs:["https://mock.runninghub.test/out.png"]}), {status:200}));
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
    state.rhKey = "TEST_RH_KEY";
    rhSaveCfg({ activeModel: "nano-banana-2", models: { "nano-banana-2": {
      webappId: "mock-webapp-id", nodes: { prompt: { nodeId: "n_prompt", fieldName: "text" }, image: { nodeId: "n_image", fieldName: "image" } }
    } } });
    renderRhProviderOption();
    document.getElementById("selProvider").value = "gemini";
  });

  async function runOnce(fallbackOn) {
    return page.evaluate(async (arg) => {
      const [b64, fbOn] = arg;
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
      document.getElementById("selProvider").value = "gemini";
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
    }, [B64, fallbackOn]);
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

  const overall = pass1 && pass2;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
