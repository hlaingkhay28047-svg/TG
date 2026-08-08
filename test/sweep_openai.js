/* Mocked end-to-end check of the OpenAI (gpt-image-1) generation path:
   configure a fake key, open one workflow card, switch the Provider select
   to OpenAI, GENERATE, and assert the mocked images/edits response produces
   a result. Run against the deployed docs/app/index.html, same as the other
   sweeps. Usage: PORT=8931 node test/sweep_openai.js */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__oaCalls = [];
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("api.openai.com") < 0) return realFetch.apply(this, arguments);
      window.__oaCalls.push(u);
      if (u.indexOf("/v1/images/edits") >= 0 || u.indexOf("/v1/images/generations") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({ data: [{ b64_json: "${B64}" }] }), {status:200}));
      }
      if (u.indexOf("/v1/models") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({ data: [] }), {status:200}));
      }
      return realFetch.apply(this, arguments);
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const setup = await page.evaluate(() => {
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    state.oaKey = "sk-TEST";
    renderOaProviderOption();
    var opt = document.querySelector('#selProvider option[value="openai"]');
    return { hasOption: !!opt };
  });
  console.log("setup:", JSON.stringify(setup));
  if (!setup.hasOption) {
    console.log("FAIL: OpenAI provider option did not register");
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
    document.getElementById("selProvider").value = "openai";
    gold().click();                             // GENERATE
    for (let w = 0; w < 100 && document.getElementById("resultBox").className.indexOf("on") < 0; w++) await sleep(50);
    const ok = document.getElementById("resultBox").className.indexOf("on") >= 0
      && document.getElementById("resultImg").src.indexOf("data:image") === 0;
    return ok ? "OK" : ("no result — " + (document.getElementById("stGen").textContent || ""));
  }, B64);

  const calls = await page.evaluate(() => window.__oaCalls);
  console.log("OpenAI calls made:", JSON.stringify(calls));
  console.log(result === "OK" ? "PASS" : ("FAIL: " + result));
  await browser.close();
  process.exit(result === "OK" ? 0 : 1);
})();
