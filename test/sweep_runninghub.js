/* Mocked end-to-end check of the RunningHub Enterprise generation path:
   configure a fake key + model mapping, open one workflow card, switch the
   Provider select to RunningHub, GENERATE, and assert the mocked
   upload -> submit -> poll -> outputs -> download chain produces a result.
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
      if (u.indexOf("/task/openapi/upload") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({fileName:"mock_0.png"}), {status:200}));
      }
      if (u.indexOf("/task/openapi/ai-app/run") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-1"}), {status:200}));
      }
      if (u.indexOf("/task/openapi/status") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({status:"SUCCESS"}), {status:200}));
      }
      if (u.indexOf("/task/openapi/outputs") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({outputs:["https://mock.runninghub.test/out.png"]}), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.rhKey = "TEST_RH_KEY";
    rhSaveCfg({
      activeModel: "nano-banana-2",
      models: { "nano-banana-2": {
        webappId: "mock-webapp-id",
        nodes: {
          prompt: { nodeId: "n_prompt", fieldName: "text" },
          image:  { nodeId: "n_image", fieldName: "image" },
          refs:   { nodeId: "n_refs", fieldName: "image" }
        }
      } }
    });
    renderRhProviderOption();
    var opt = document.querySelector('#selProvider option[value="runninghub"]');
    return { hasOption: !!opt, configured: rhIsConfigured("nano-banana-2"), active: !!rhActiveModelCfg() };
  });
  console.log("setup:", JSON.stringify(setup));
  if (!setup.hasOption || !setup.configured || !setup.active) {
    console.log("FAIL: RunningHub provider option/config did not register");
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
  console.log("RunningHub calls made:", JSON.stringify(calls));
  console.log(result === "OK" ? "PASS" : ("FAIL: " + result));
  await browser.close();
  process.exit(result === "OK" ? 0 : 1);
})();
