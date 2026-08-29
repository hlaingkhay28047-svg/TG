/* Mocked end-to-end sweep: open every workflow wizard card, fill slots,
   GENERATE against a mocked RunningHub (v5.50.0 — the one engine), assert
   the submitted request is well-formed.
   Run against the deployed docs/app/index.html — the same file real users
   get — not a rebuilt copy, so this catches anything that broke between
   source and what actually shipped.
   Usage: PORT=8931 node test/sweep_workflows.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 200)));

  await page.addInitScript(`
    window.__reqs = [];
    window.__ups = 0;
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
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        window.__ups++;
        return Promise.resolve(new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/up_0.png",fileName:"openapi/up_0.png",size:"100"}}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0 || u.indexOf("/queue/status") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      }
      /* any other RH call is the model submit — capture its body */
      if (opts && typeof opts.body === "string") {
        try { window.__reqs.push(JSON.parse(opts.body)); } catch(e) { window.__reqs.push({parseError:String(e)}); }
      }
      return Promise.resolve(new Response(JSON.stringify({taskId:"mock-task-1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
    };
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.rhKey = "TEST_RH_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
  });

  const nCards = await page.evaluate(() => {
    document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
    return document.querySelectorAll("#wfHost .wfmini").length;
  });
  console.log("cards found:", nCards);

  let pass = 0; const fails = [];
  for (let i = 0; i < nCards; i++) {
    const res = await page.evaluate(async (arg) => {
      const [idx, b64] = arg;
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const card = document.querySelectorAll("#wfHost .wfmini")[idx];
      const title = card.querySelector(".t") ? card.querySelector(".t").textContent : ("card" + idx);
      state.refs = [null, null, null, null];
      state.imgRoles = null;
      window.__reqs = []; window.__ups = 0;
      card.click();
      await sleep(30);
      const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
      if (!gold()) return title + " :: wizard did not open";
      for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: b64, label: "t" + s };
      gold().click(); await sleep(30);            // step 1 -> 2
      if (!gold()) return title + " :: no next on step2";
      if (gold().disabled) return title + " :: next disabled on step2";
      gold().click(); await sleep(30);            // step 2 -> 3
      if (!gold()) return title + " :: no GENERATE button";
      gold().click();                              // GENERATE
      const hasPrompted = () => window.__reqs.some(x => x && typeof x.prompt === "string" && x.prompt.length);
      for (let w = 0; w < 120 && !hasPrompted(); w++) await sleep(50);
      if (!window.__reqs.length) return title + " :: no request sent";
      /* a card may legitimately fire a promptless helper submit first (the
         BG Replace card's transparent FG cutout does) — judge the prompt on
         the first submit that actually carries one */
      const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0];
      if (!r || r.parseError) return title + " :: bad request body";
      const txt = String(r.prompt || "");
      const imgs = window.__ups;
      let v = "OK";
      if (txt.length < 60) v = "prompt too short: " + txt.length;
      else if (imgs < 1) v = "no images uploaded";
      else if (/\{[A-Z_]+\}/.test(txt)) v = "placeholder leftover";
      else if (txt.indexOf("GUARD (HNK edit rule)") < 0) v = "guard missing";
      // close wizard + return to workflow page for next card
      const wz = document.getElementById("wiz");
      if (wz) { wz.className = "wiz"; document.body.style.overflow = ""; window._wizOnPick = null; }
      return v === "OK" ? "OK" : (title + " :: " + v);
    }, [i, B64]);
    if (res === "OK") pass++; else fails.push(res);
    if ((i + 1) % 20 === 0) console.log("progress", i + 1, "/", nCards, "pass", pass);
  }
  console.log("PASS " + pass + "/" + nCards);
  if (fails.length) { console.log("FAILS:"); fails.forEach(f => console.log("  - " + f)); }
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
