/* Mocked regression sweep for pgStudio v5's GENERATE flow (v4.23.0):
   - Tier-3 path: a queued Face Slim edit produces exactly ONE dispatcher
     request whose prompt carries the 40% slim fragment, the target phrase
     and the TASK GUARD, and whose single inline image is the BAKED canvas
     (not the original fixture bytes)
   - Local-commit path: with only Tier-1/2 edits and an empty AI queue,
     GENERATE performs ZERO network calls and still lands a new full-res
     result in state.hist
   - Before-hold: pointerdown on the hold button shows the raw source pixels,
     release restores the edited settle frame
   Usage: PORT=8931 node test/sweep_studio_generate.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.addInitScript(`
    localStorage.setItem("hnk_ws_onboarded","1");
    localStorage.setItem("hnk_ws_seen","1");
    window.__reqs = [];
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      if (String(url).indexOf(":generateContent") >= 0) {
        try { window.__reqs.push(JSON.parse(opts.body)); } catch(e) { window.__reqs.push({parseError:String(e)}); }
        return new Promise(function(resolve){
          setTimeout(function(){
            resolve(new Response(JSON.stringify({
              candidates:[{content:{parts:[{inline_data:{mime_type:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}}]},finishReason:"STOP"}]
            }), {status:200, headers:{"Content-Type":"application/json"}}));
          }, 40);
        });
      }
      return realFetch.apply(this, arguments);
    };
  `);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  await page.evaluate(async () => {
    switchPage("pgStudio");
    state.key = "TEST_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    const c = document.createElement("canvas"); c.width = 48; c.height = 48;
    const x = c.getContext("2d");
    x.fillStyle = "#e0ac8c"; x.fillRect(0, 0, 48, 48);
    x.fillStyle = "#404060"; x.fillRect(10, 10, 28, 28);
    window.__fixture = c.toDataURL("image/png");
    window.__fixtureB64 = window.__fixture.split(",")[1];
    await new Promise(res => { ST.loadImage(window.__fixture, { done: res }); });
  });

  // 1) Tier-3: Face Slim 40 queued -> exactly one request with fragment + guard + baked image
  const gen = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("mu_faceSlim");
    inp.value = "40";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    window.__reqs = [];
    const savedPromptBefore = document.getElementById("prompt").value;
    document.getElementById("btnStGen").onclick();
    for (let w = 0; w < 200 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 200 && document.getElementById("btnStGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs[0] || {};
    const parts = (r.contents && r.contents[0] && r.contents[0].parts) || [];
    const txt = parts.filter(p => p.text).map(p => p.text).join("\n");
    const imgs = parts.filter(p => p.inline_data && p.inline_data.data).map(p => p.inline_data.data);
    return {
      reqCount: window.__reqs.length,
      has40: /40%/.test(txt),
      hasSlim: /slim/i.test(txt),
      hasTask: txt.indexOf("PORTRAIT RETOUCH TASK") >= 0,
      hasTarget: /every person/.test(txt),
      hasGuard: txt.indexOf("TASK GUARD") >= 0,
      imgCount: imgs.length,
      imgIsBaked: imgs.length === 1 && imgs[0] !== window.__fixtureB64,
      promptRestored: document.getElementById("prompt").value === savedPromptBefore,
      refRestored: !!(state.refs[0] && state.refs[0].b64 === window.__fixtureB64),
      resultShown: document.getElementById("stResultBox").className.indexOf(" on") >= 0
    };
  });
  report("Tier-3 generate: 1 request, slim fragment at 40%, target + TASK GUARD, baked single image, state restored",
    gen.reqCount === 1 && gen.has40 && gen.hasSlim && gen.hasTask && gen.hasTarget && gen.hasGuard &&
    gen.imgCount === 1 && gen.imgIsBaked && gen.promptRestored && gen.refRestored && gen.resultShown,
    JSON.stringify(gen));

  // 2) local-commit path: only bri=30, empty queue -> zero fetches, hist grows
  const local = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("mu_bri");
    inp.value = "30";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    window.__reqs = [];
    const histBefore = state.hist.length;
    const firstBefore = state.hist[0];
    document.getElementById("btnStGen").onclick();
    for (let w = 0; w < 200 && document.getElementById("btnStGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    await new Promise(r => setTimeout(r, 200));
    return {
      fetches: window.__reqs.length,
      grew: state.hist.length === Math.min(histBefore + 1, 8) && state.hist[0] !== firstBefore,
      newIsJpeg: state.hist[0] && state.hist[0].mime === "image/jpeg"
    };
  });
  report("local commit: zero network calls, new full-res result in history",
    local.fetches === 0 && local.grew && local.newIsJpeg, JSON.stringify(local));

  // 3) Before-hold: pointerdown shows raw source, release restores the edited frame
  const hold = await page.evaluate(async () => {
    function snap() { return document.getElementById("stCanvas").toDataURL(); }
    // bri=30 edit from check 2 is still active -> settle frame differs from raw
    await new Promise(r => setTimeout(r, 250));
    const edited = snap();
    const btn = document.getElementById("stHold");
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 }));
    const held = snap();
    const filterDuringHold = document.getElementById("stCanvas").style.filter;
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
    await new Promise(r => setTimeout(r, 250));
    const released = snap();
    return {
      heldDiffers: held !== edited,
      filterCleared: filterDuringHold === "",
      restored: released === edited
    };
  });
  report("Before-hold shows raw pixels (filter cleared) and release restores the edited frame",
    hold.heldDiffers && hold.filterCleared && hold.restored, JSON.stringify(hold));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
