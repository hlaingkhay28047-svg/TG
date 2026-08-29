/* v4.20.0: locks in the new "Master BG FG Replace" Smart Workflow —
   removes the person from IMAGE 2, rebuilds the scene, inserts the exact
   IMAGE 1 subject in their place. Confirms the card renders in the
   Background & Scene category on the Workflow page, its wizard opens with
   2 image slots and generic guide steps, and GENERATE sends a well-formed
   request whose prompt text references both IMAGE 1 and IMAGE 2 and
   carries the negative/AVOID list.
   v4.20.2: fixed a real user-reported bug — with no curated
   lib/wf/cards5/master-bgfg-replace.jpg, the card always attempted (and
   failed) that fetch before falling back to its local SVG icon; on a slow
   connection that left the card visibly blank for a noticeable stretch.
   v4.20.3: a real curated photo now exists at that path (generated via the
   live Gemini API from this exact workflow, then committed as the card's
   thumbnail) — confirms the card loads that real JPG successfully instead
   of falling back to the SVG icon.
   Run against the deployed docs/app/index.html (same pattern as
   test/sweep_workflows.js). Usage: PORT=8931 node test/verify_master_bgfg_workflow.js */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  let cardJpgStatus = null;
  page.on("response", (res) => {
    if (res.url().indexOf("/lib/wf/cards5/master-bgfg-replace.jpg") >= 0) cardJpgStatus = res.status();
  });

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
      if (u.indexOf("/openapi/v2/") < 0 || u.indexOf("/price-preview/") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({code:0,data:{}}), {status:200}));
      }
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
    const onb = document.querySelector(".onb"); if (onb) onb.classList.remove("on");
    // v4.27.0: fresh storage now lands on Home (pgDash) — go to the Workflow
    // page like a user would, so its lazy-loaded card images actually load
    switchPage("pgWf");
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
  });

  let pass = 0, fail = 0;
  function check(cond, label, extra) {
    if (cond) { pass++; console.log("PASS (" + label + ")"); }
    else { fail++; console.log("FAIL (" + label + ") :: " + (extra !== undefined ? JSON.stringify(extra) : "")); }
  }

  const cardInfo = await page.evaluate(() => {
    document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
    const cards = Array.from(document.querySelectorAll("#wfHost .wfmini"));
    const idx = cards.findIndex(c => c.querySelector(".t") && c.querySelector(".t").textContent.indexOf("Master BG FG Replace") >= 0);
    if (idx >= 0) cards[idx].scrollIntoView({ block: "center" });
    return { idx, total: cards.length };
  });
  check(cardInfo.idx >= 0, "card renders in the Workflow page grid", cardInfo);

  if (cardInfo.idx >= 0) {
    await page.waitForTimeout(800); // let the lazy-loaded card image finish fetching
    const thumbInfo = await page.evaluate((idx) => {
      const card = document.querySelectorAll("#wfHost .wfmini")[idx];
      const img = card.querySelector("img");
      return img ? { src: img.src, complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight } : { noImg: true };
    }, cardInfo.idx);
    check(cardJpgStatus === 200, "curated card JPG loads successfully (status 200)", { cardJpgStatus });
    check(thumbInfo.src.indexOf("cards5/master-bgfg-replace.jpg") >= 0, "card shows the real curated photo, not the SVG fallback", thumbInfo);
    check(thumbInfo.complete && thumbInfo.naturalWidth > 0, "curated photo actually rendered (non-zero dimensions)", thumbInfo);
  }

  if (cardInfo.idx < 0) {
    console.log("FAIL " + pass + "/" + (pass + fail + 1));
    await browser.close();
    process.exit(1);
  }

  const res = await page.evaluate(async (arg) => {
    const [idx, b64] = arg;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelectorAll("#wfHost .wfmini")[idx];
    state.refs = [null, null, null, null];
    state.imgRoles = null;
    window.__reqs = []; window.__ups = 0;
    card.click();
    await sleep(30);
    const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
    if (!gold()) return { ok: false, reason: "wizard did not open" };
    for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: b64, label: "t" + s };
    gold().click(); await sleep(30);            // step 1 -> 2 (Images)
    if (!gold()) return { ok: false, reason: "no next on step2" };
    if (gold().disabled) return { ok: false, reason: "next disabled on step2" };
    gold().click(); await sleep(30);            // step 2 -> 3 (Generate)
    if (!gold()) return { ok: false, reason: "no GENERATE button" };
    gold().click();
    const hasPrompted = () => window.__reqs.some(x => x && typeof x.prompt === "string" && x.prompt.length);
    for (let w = 0; w < 120 && !hasPrompted(); w++) await sleep(50);
    if (!window.__reqs.length) return { ok: false, reason: "no request sent" };
    /* the card fires a promptless transparent FG-cutout submit first — the
       main edit is the first submit that carries the assembled prompt */
    const r = window.__reqs.find(x => x && typeof x.prompt === "string" && x.prompt.length) || window.__reqs[0];
    if (!r || r.parseError) return { ok: false, reason: "bad request body" };
    const txt = String(r.prompt || "");
    const imgs = window.__ups;
    const wz = document.getElementById("wiz");
    if (wz) { wz.className = "wiz"; document.body.style.overflow = ""; window._wizOnPick = null; }
    return {
      ok: true,
      txtLen: txt.length,
      imgs: imgs,
      hasGuard: txt.indexOf("GUARD (HNK edit rule)") >= 0,
      hasImage1: txt.indexOf("IMAGE 1") >= 0,
      hasImage2: txt.indexOf("IMAGE 2") >= 0,
      hasAvoid: txt.indexOf("AVOID:") >= 0,
      hasPlaceholder: /\{[A-Z_]+\}/.test(txt)
    };
  }, [cardInfo.idx, B64]);

  check(res.ok, "wizard completes and sends a request", res);
  if (res.ok) {
    check(res.imgs === 2, "exactly 2 images uploaded (IMAGE 1 subject + IMAGE 2 scene)", res);
    check(res.hasGuard, "TASK GUARD present in the assembled prompt", res);
    check(res.hasImage1 && res.hasImage2, "prompt text references both IMAGE 1 and IMAGE 2", res);
    check(res.hasAvoid, "negative prompt appended via AVOID:", res);
    check(!res.hasPlaceholder, "no leftover {PLACEHOLDER} tokens", res);
  }
  check(errors.length === 0, "no JS errors", errors);

  console.log((fail === 0 ? "PASS " : "FAIL ") + pass + "/" + (pass + fail));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
