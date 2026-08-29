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
    window.__reqs = [];
    window.__upB64s = [];
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url);
      if (u.indexOf("mock.runninghub.test") >= 0) {
        var bin = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");
        var bytes = new Uint8Array(bin.length);
        for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes, {status:200, headers:{"Content-Type":"image/png"}}));
      }
      if (u.indexOf("www.runninghub.ai") < 0) return realFetch.apply(this, arguments);
      if (u.indexOf("/openapi/v2/media/upload/binary") >= 0) {
        var done = Promise.resolve();
        try {
          if (opts && opts.body && typeof opts.body.forEach === "function") {
            opts.body.forEach(function(v){
              if (v && typeof v.arrayBuffer === "function") {
                done = v.arrayBuffer().then(function(ab){
                  var by = new Uint8Array(ab), bin2 = "";
                  for (var i=0;i<by.length;i++) bin2 += String.fromCharCode(by[i]);
                  window.__upB64s.push(btoa(bin2));
                });
              }
            });
          }
        } catch(e) {}
        return done.then(function(){
          return new Response(JSON.stringify({code:0,message:"success",data:{type:"image",download_url:"https://mock.runninghub.test/up_0.png",fileName:"openapi/up_0.png",size:"100"}}), {status:200});
        });
      }
      if (u.indexOf("/openapi/v2/query") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"SUCCESS",errorCode:"",errorMessage:"",results:[{url:"https://mock.runninghub.test/out.png",nodeId:"2",outputType:"png",text:null}],clientId:"",promptTips:""}), {status:200}));
      }
      /* only a v2 model submit is a generate — the spend ledger's balance
         and price-preview calls must never count as one */
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{remainCoins:"0"}}), {status:200}));
      }
      if (opts && typeof opts.body === "string") {
        try { window.__reqs.push(JSON.parse(opts.body)); } catch(e) { window.__reqs.push({parseError:String(e)}); }
      }
      return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING",errorCode:"",errorMessage:"",results:null,clientId:"mock-client",promptTips:""}), {status:200}));
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
    state.rhKey = "TEST_RH_KEY";
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
    window.__reqs = []; window.__upB64s = [];
    const savedPromptBefore = document.getElementById("prompt").value;
    document.getElementById("btnStGen").onclick();
    for (let w = 0; w < 200 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
    for (let w = 0; w < 200 && document.getElementById("btnStGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0] || {};
    const txt = String(r.prompt || "");
    const imgs = window.__upB64s.slice();
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

  async function runGenerate(page) {
    return page.evaluate(async () => {
      window.__reqs = []; window.__upB64s = [];
      document.getElementById("btnStGen").onclick();
      for (let w = 0; w < 200 && !window.__reqs.length; w++) await new Promise(r => setTimeout(r, 30));
      for (let w = 0; w < 200 && document.getElementById("btnStGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
      const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0] || {};
      return {
        reqCount: window.__reqs.length,
        txt: String(r.prompt || ""),
        imgCount: window.__upB64s.length
      };
    });
  }

  // 4) clothing fragment: ev_dressWrinkle=50 queued -> one request whose prompt carries wrinkle @ 50%
  await page.evaluate(() => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("ev_dressWrinkle");
    inp.value = "50"; inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const cloth = await runGenerate(page);
  report("clothing frag: de-wrinkle 50 -> 1 dispatcher request with 'wrinkle' + '50%' in the prompt",
    cloth.reqCount === 1 && /wrinkle/i.test(cloth.txt) && /50%/.test(cloth.txt) && cloth.imgCount === 1,
    JSON.stringify({ req: cloth.reqCount, imgs: cloth.imgCount, wrinkle: /wrinkle/i.test(cloth.txt), pct: /50%/.test(cloth.txt) }));

  // 5) opt-in reference-transfer path: refX + Makeup Transfer -> 2 inline images + IMAGE 2 named as reference
  await page.evaluate(() => {
    document.getElementById("stReset").click();
    state.st.refX = { mime: "image/png", b64: window.__fixtureB64 };
    stRefreshUI();
    const inp = document.getElementById("mu_mkTransferV");
    inp.value = "60"; inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const refGen = await runGenerate(page);
  const refOk = refGen.reqCount === 1 && refGen.imgCount === 2 &&
    refGen.txt.indexOf("IMAGE 2 = style/makeup/color reference ONLY") >= 0 &&
    /makeup look from IMAGE 2/.test(refGen.txt);
  report("ref transfer: usesRef feature + refX sends 2 inline images and names IMAGE 2 reference-only",
    refOk, JSON.stringify({ req: refGen.reqCount, imgs: refGen.imgCount, named: refGen.txt.indexOf("IMAGE 2 = style/makeup/color reference ONLY") >= 0 }));

  // ...and without a usesRef feature queued, refs[1] stays nulled even though refX is still set (single-photo guarantee)
  await page.evaluate(() => {
    document.getElementById("stReset").click(); // clears the transfer chip; state.st.refX survives reset
    const inp = document.getElementById("mu_faceSlim");
    inp.value = "40"; inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const noRef = await runGenerate(page);
  report("single-photo guarantee: refX set but no usesRef feature queued -> exactly 1 inline image",
    noRef.reqCount === 1 && noRef.imgCount === 1 && noRef.txt.indexOf("IMAGE 2 =") < 0,
    JSON.stringify({ req: noRef.reqCount, imgs: noRef.imgCount }));

  // 6) backdrop + shadow rider compose into ONE fragment; the rider alone emits nothing
  const rider = await page.evaluate(() => {
    document.getElementById("stReset").click();
    document.querySelector("#ev_bdShadow .chip").click(); // E19 alone
    const aloneNone = state.st.pend.length === 0;
    document.querySelector("#ev_bdScene .chip").click();  // + E18
    const one = state.st.pend.filter(p => p.id === "ev_backdrop");
    const frag = one.length === 1 ? stFragOf(one[0]) : "";
    const combined = state.st.pend.length === 1 && /Replace the background/.test(frag) && /shadow/i.test(frag);
    document.getElementById("stReset").click();
    return { aloneNone, combined, frag: frag.slice(0, 60) };
  });
  report("backdrop rider: E19 alone emits nothing; E18+E19 emit one combined fragment with the shadow clause",
    rider.aloneNone && rider.combined, JSON.stringify(rider));

  // 7) Describe & Remove free text lands verbatim in the dispatched prompt
  await page.evaluate(() => {
    document.getElementById("stReset").click();
    const inp = document.getElementById("ev_removeText");
    inp.value = "the red umbrella on the left"; inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const rm = await runGenerate(page);
  report("Describe & Remove free text lands verbatim in the prompt",
    rm.reqCount === 1 && rm.txt.indexOf("Remove this from the photo: the red umbrella on the left.") >= 0,
    JSON.stringify({ req: rm.reqCount, found: rm.txt.indexOf("the red umbrella on the left") >= 0 }));

  // 8) local commit with only geometry + HSL edits: ZERO fetches, baked JPEG dims reflect the crop
  const geoLocal = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    document.querySelectorAll("#stGeoCropChips .chip")[1].click(); // 4:5 on the 48x48 fixture -> 38x48
    const h = document.getElementById("ev_hslH");
    h.value = "40"; h.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    window.__reqs = [];
    const firstBefore = state.hist[0];
    document.getElementById("btnStGen").onclick();
    for (let w = 0; w < 200 && document.getElementById("btnStGen").disabled; w++) await new Promise(r => setTimeout(r, 30));
    await new Promise(r => setTimeout(r, 200));
    const out = state.hist[0];
    const dims = await new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.src = "data:" + out.mime + ";base64," + out.b64;
    });
    document.getElementById("stReset").click();
    return { fetches: window.__reqs.length, grew: out !== firstBefore, mime: out.mime, dims };
  });
  report("local commit with geometry+HSL only: zero fetches, baked JPEG is 38x48 (4:5 crop)",
    geoLocal.fetches === 0 && geoLocal.grew && geoLocal.mime === "image/jpeg" &&
    geoLocal.dims.w === 38 && geoLocal.dims.h === 48, JSON.stringify(geoLocal));

  // 9) GENERATE label flips APPLY <-> GENERATE (n AI)
  const label = await page.evaluate(async () => {
    document.getElementById("stReset").click();
    const br = document.getElementById("mu_bri");
    br.value = "30"; br.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    const applyLbl = document.getElementById("btnStGen").textContent;
    const fs2 = document.getElementById("mu_faceSlim");
    fs2.value = "40"; fs2.dispatchEvent(new Event("input", { bubbles: true }));
    const genLbl = document.getElementById("btnStGen").textContent;
    document.getElementById("stReset").click();
    return { applyLbl, genLbl };
  });
  report("GENERATE label: dirty-only shows APPLY, queued AI shows GENERATE (1 AI)",
    label.applyLbl.indexOf("APPLY") >= 0 && /GENERATE \(1 AI\)/.test(label.genLbl), JSON.stringify(label));

  // 10) MY RECIPES: save -> survives reload -> apply restores sliders -> delete works
  await page.evaluate(() => {
    document.getElementById("stReset").click();
    localStorage.removeItem("hnk_st_recipes");
    const sm = document.getElementById("mu_smooth");
    sm.value = "44"; sm.dispatchEvent(new Event("input", { bubbles: true }));
    window.prompt = () => "Look 1"; /* v4.45: recipes are named at save time */
    document.getElementById("stSaveRecipe").click();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const recipes = await page.evaluate(async () => {
    switchPage("pgStudio");
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    const present = document.querySelectorAll("#stRecipeRow .pcard").length === 1;
    document.getElementById("stReset").click();
    const smBefore = document.getElementById("mu_smooth").value;
    document.querySelector("#stRecipeRow .pcard").click();
    const applied = document.getElementById("mu_smooth").value;
    document.querySelector("#stRecipeRow .pcard .x").click();
    const afterDelete = document.querySelectorAll("#stRecipeRow .pcard").length;
    const lsEmpty = JSON.parse(localStorage.getItem("hnk_st_recipes") || "[]").length === 0;
    return { present, smBefore, applied, afterDelete, lsEmpty };
  });
  report("recipes: saved recipe survives reload, applies its sliders, and deletes cleanly",
    recipes.present && recipes.smBefore === "0" && recipes.applied === "44" &&
    recipes.afterDelete === 0 && recipes.lsEmpty, JSON.stringify(recipes));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
