/* Mocked end-to-end check of the OpenAI (gpt-image-2) generation path:
   configure a fake key, open one workflow card, switch the Provider select
   to OpenAI, GENERATE, and assert the mocked images/edits response produces
   a result. Run against the deployed docs/app/index.html, same as the other
   sweeps.
   v4.28 (§4.4): the model id moved gpt-image-1 -> gpt-image-2. The request
   SHAPE is unchanged — model/prompt/size (+ image[] on edits) — so this
   sweep also pins the negative: no `resolution` field may appear on either
   endpoint. `quality:"high"` is the one new optional field, sent only when
   the user picked High Detail.
   Usage: PORT=8931 node test/sweep_openai.js */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.__oaCalls = [];
    window.__oaBodies = [];   // v4.28: capture the outbound payload, not just the URL
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("api.openai.com") < 0) return realFetch.apply(this, arguments);
      window.__oaCalls.push(u);
      try {
        var b = opts && opts.body, rec = { url: u, fields: {} };
        if (b && typeof b.forEach === "function" && typeof b.append === "function") {
          rec.multipart = true;
          b.forEach(function(v, k){
            if (typeof v === "string") rec.fields[k] = v;
            else rec.fields[k] = (rec.fields[k] || 0) + 1;   // count File/Blob parts
          });
        } else if (typeof b === "string") {
          rec.multipart = false;
          try { rec.fields = JSON.parse(b); } catch(e) { rec.fields = {}; }
        }
        window.__oaBodies.push(rec);
      } catch(e) {}
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
  console.log(result === "OK" ? "PASS (edits round-trip delivers a result)" : ("FAIL: " + result));

  // v4.28 §4.4 — model id + request-shape contract on the edits (refs) payload.
  const edit = await page.evaluate(() =>
    (window.__oaBodies || []).filter(b => b.url.indexOf("/v1/images/edits") >= 0).pop() || null);
  console.log("edits payload:", JSON.stringify(edit));
  const modelOk = !!edit && edit.multipart === true && edit.fields.model === "gpt-image-2";
  console.log(modelOk ? "PASS (model id is gpt-image-2)" : "FAIL (model id): " + JSON.stringify(edit && edit.fields));
  const shapeOk = !!edit && edit.fields.resolution === undefined
    && typeof edit.fields.size === "string" && typeof edit.fields.prompt === "string"
    && edit.fields["image[]"] >= 1;
  console.log(shapeOk ? "PASS (request shape unchanged: model/prompt/size + image[], NO resolution field)"
    : "FAIL (request shape): " + JSON.stringify(edit && edit.fields));
  // Standard quality must NOT smuggle a quality field in.
  const qualDefaultOk = !!edit && edit.fields.quality === undefined;
  console.log(qualDefaultOk ? "PASS (standard detail sends no quality field)" : "FAIL (quality leaked at standard detail)");

  // v4.28 §4.4d — High Detail adds quality:"high" (legal on both endpoints).
  const hi = await page.evaluate(async () => {
    window.__oaBodies.length = 0;
    const outs = await oaGenerateOne("sk-TEST", "a prompt", [], "1:1", "high");
    const gen = (window.__oaBodies || []).filter(b => b.url.indexOf("/v1/images/generations") >= 0).pop();
    window.__oaBodies.length = 0;
    const outs2 = await oaGenerateOne("sk-TEST", "a prompt", [], "1:1", "standard");
    const genStd = (window.__oaBodies || []).filter(b => b.url.indexOf("/v1/images/generations") >= 0).pop();
    return { gen, genStd, got: !!(outs && outs[0]), got2: !!(outs2 && outs2[0]) };
  });
  console.log("generations payloads:", JSON.stringify(hi));
  const hiOk = hi.got && hi.got2 && hi.gen && hi.genStd
    && hi.gen.fields.model === "gpt-image-2" && hi.gen.fields.quality === "high"
    && hi.gen.fields.resolution === undefined
    && hi.genStd.fields.quality === undefined && hi.genStd.fields.resolution === undefined;
  console.log(hiOk ? 'PASS (High Detail sends quality:"high"; standard omits it; neither sends resolution)'
    : "FAIL (quality gating): " + JSON.stringify(hi));

  const overall = result === "OK" && modelOk && shapeOk && qualDefaultOk && hiOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
