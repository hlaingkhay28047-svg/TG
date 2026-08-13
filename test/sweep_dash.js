/* v4.27.0 Home (pgDash) + IA re-architecture sweep (mocked generate).
   Covers the new-surface contract the wave shipped with:
     1. pgDash renders — 2×2 feature grid present, each card routes to its page
     2. fresh storage defaults to pgDash; a returning user's saved page wins
     3. Setup (pgHome) is reachable via the header gear (it left the tab bar)
     4. ?page=pgHome deep link still works
     5. statline numbers equal the live runtime counts (never hardcoded)
     6. the Continue row appears after a (mocked) generate
     7. Library teaser shows real Featured thumbnails and routes to pgLib
     8. wizard result step 4: result shown inline, 4 step dots, actions present
   Usage: PORT=8931 node test/sweep_dash.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let failures = 0;
function check(ok, label, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + label + (ok ? "" : "  " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();

  /* ---- 1+2a) FRESH storage: pgDash is the default landing page ---- */
  let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => { console.log("PAGEERROR:", String(e).slice(0, 300)); failures++; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  const fresh = await page.evaluate(() => ({
    cur: curPage,
    dashVisible: getComputedStyle(document.getElementById("pgDash")).display !== "none",
    homeTabActive: (Array.from(document.getElementById("tabbar").children).find(b => b.className.indexOf("on") >= 0) || {}).textContent || "",
    stored: localStorage.getItem("hnk_web_studio_page")
  }));
  check(fresh.cur === "pgDash" && fresh.dashVisible && fresh.homeTabActive.indexOf("Home") >= 0,
    "fresh storage lands on pgDash with the Home tab active", fresh);

  /* ---- 1b) grid cards render and route ---- */
  const grid = await page.evaluate(() => {
    const o = document.querySelector(".onb"); if (o) o.classList.remove("on");
    document.body.style.overflow = "";
    const cards = Array.from(document.querySelectorAll("#dashGrid .dash-card"));
    return {
      count: cards.length,
      /* v4.29: the four Home cards moved off the generic banner pool onto
         purpose-shot art in lib/dash/. Accept either home so the assertion
         proves "every card carries library art", not one folder name. */
      allHaveArt: cards.every(c => c.querySelector(".art img") && /^lib\/(banners|dash)\//.test(c.querySelector(".art img").getAttribute("src"))),
      allHaveBadge: cards.every(c => c.querySelector(".bdg use")),
      allHaveLabel: cards.every(c => (c.querySelector(".lbl") || {}).textContent),
      labels: cards.map(c => c.querySelector(".lbl").textContent)
    };
  });
  check(grid.count === 6 && grid.allHaveArt && grid.allHaveBadge && grid.allHaveLabel,
    "feature grid: 6 cards (v4.41 adds Path batch + Gallery), banner art + sprite badge + label each", grid);

  const routes = [];
  for (let i = 0; i < 6; i++) {
    const r = await page.evaluate((idx) => {
      switchPage("pgDash");
      document.querySelectorAll("#dashGrid .dash-card")[idx].click();
      return curPage;
    }, i);
    routes.push(r);
  }
  check(JSON.stringify(routes) === JSON.stringify(["pgRetouch", "pgWf", "pgCreate", "pgText2Img", "pgPath", "pgGallery"]),
    "grid cards route to pgRetouch / pgWf / pgCreate / Media Lab (pgText2Img default) / pgPath / pgGallery", routes);

  /* Media Lab card honors last-page-of-group memory */
  const mediaMem = await page.evaluate(() => {
    switchPage("pgVideo");
    switchPage("pgDash");
    document.querySelectorAll("#dashGrid .dash-card")[3].click();
    return curPage;
  });
  check(mediaMem === "pgVideo", "Media Lab card returns to the group's last-visited page", mediaMem);

  /* ---- 5) statline equals runtime counts ---- */
  const stat = await page.evaluate(() => {
    const wedTotal = ["trail", "veil", "gown", "petal", "extra"].reduce((n, k) => n + (D.wedding[k] || []).length, 0);
    const expectTap = D.presets.length + wedTotal + D.lighting.lights.length +
      PROMPT_LIB.length + LW.workflows.filter(w => !w.kind).length + 16;
    return {
      tap: document.getElementById("stTapCount").textContent,
      expectTap: String(expectTap),
      lib: document.getElementById("stLibCount").textContent,
      expectLib: String(LW.items.length),
      wf: document.getElementById("stWfCount").textContent,
      expectWf: String(document.querySelectorAll("#wfHost .wfmini").length),
      meitu: document.getElementById("stMeituCount").textContent,
      expectMeitu: String(ST_MEITU_COUNT),
      evoto: document.getElementById("stEvotoCount").textContent,
      expectEvoto: String(ST_EVOTO_COUNT),
      inDash: !!document.querySelector("#pgDash .statline")
    };
  });
  check(stat.inDash && stat.tap === stat.expectTap && stat.lib === stat.expectLib &&
    stat.wf === stat.expectWf && stat.meitu === stat.expectMeitu && stat.evoto === stat.expectEvoto,
    "statline lives on pgDash and every number matches its live runtime count", stat);

  /* ---- 7) Library teaser: real Featured thumbs + View More → pgLib ---- */
  const teaser = await page.evaluate(() => {
    switchPage("pgDash");
    const imgs = Array.from(document.querySelectorAll("#dashLibStrip img"));
    const featured = LW.featured.slice(0, 10);
    const srcsOk = imgs.every((im, i) => im.getAttribute("src") === "lib/ui/" + featured[i] + ".jpg");
    const strip = document.getElementById("dashLibStrip");
    const contained = strip.scrollWidth >= strip.clientWidth &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    document.getElementById("dashLibMore").click();
    return { count: imgs.length, srcsOk, contained, after: curPage };
  });
  check(teaser.count >= 8 && teaser.count <= 10 && teaser.srcsOk && teaser.contained && teaser.after === "pgLib",
    "Library teaser: 8-10 real Featured thumbnails, scroll contained, View More opens pgLib", teaser);

  /* promo band present with a _blank site link */
  const promo = await page.evaluate(() => {
    const a = document.getElementById("dashPromoGo");
    return { txt: (document.getElementById("dashPromoP").textContent || "").length > 10,
      href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") };
  });
  check(promo.txt && promo.href === "../" && promo.target === "_blank" && /noopener/.test(promo.rel),
    "promo band: copy + pill linking to the site root in a new tab", promo);

  /* ---- 3) Setup via header gear ---- */
  const gear = await page.evaluate(() => {
    switchPage("pgDash");
    const g = document.getElementById("btnGearSetup");
    const r = g.getBoundingClientRect();
    g.click();
    return {
      big: r.width >= 44 && r.height >= 44,
      aria: g.getAttribute("aria-label") || "",
      onSetup: curPage === "pgHome" && document.getElementById("pgHome").className.indexOf("on") >= 0,
      noTabActive: !Array.from(document.getElementById("tabbar").children).some(b => b.className.indexOf("on") >= 0),
      gearOn: g.className.indexOf("on") >= 0,
      apiKey: !!document.getElementById("apiKey")
    };
  });
  check(gear.big && /setup/i.test(gear.aria) && gear.onSetup && gear.noTabActive && gear.gearOn && gear.apiKey,
    "header gear (44px, labelled) opens Setup; no bar tab claims it", gear);
  await page.close();

  /* ---- 2b) returning user: stored page beats the pgDash default ---- */
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => { console.log("PAGEERROR:", String(e).slice(0, 300)); failures++; });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_web_studio_page", "pgStudio");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const ret = await page.evaluate(() => ({
    cur: curPage,
    vis: getComputedStyle(document.getElementById("pgStudio")).display !== "none",
    seeded: localStorage.getItem("hnk_ws_group_seed_v427") === "1"
  }));
  check(ret.cur === "pgStudio" && ret.vis && ret.seeded,
    "returning user's cold-open restore still wins over the Home default (+ one-time group seed ran)", ret);

  /* ---- 4) deep link ?page=pgHome ---- */
  await page.goto(`http://127.0.0.1:${PORT}/index.html?page=pgHome`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const deep = await page.evaluate(() => ({
    cur: curPage,
    vis: getComputedStyle(document.getElementById("pgHome")).display !== "none",
    gearOn: document.getElementById("btnGearSetup").className.indexOf("on") >= 0
  }));
  check(deep.cur === "pgHome" && deep.vis && deep.gearOn, "?page=pgHome deep link still opens Setup", deep);

  const deepDash = await page.evaluate(() => {
    switchPage("pgWf");
    return null;
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?page=pgDash`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const deep2 = await page.evaluate(() => ({ cur: curPage }));
  check(deep2.cur === "pgDash", "?page=pgDash deep link opens Home", deep2);
  await page.close();

  /* ---- 6+8) mocked generate: wizard result step 4, then the Continue row ---- */
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => { console.log("PAGEERROR:", String(e).slice(0, 300)); failures++; });
  await page.addInitScript(`
    localStorage.setItem("hnk_ws_onboarded","1");
    localStorage.setItem("hnk_ws_seen","1");
    const realFetch = window.fetch;
    window.fetch = function(url, opts){
      if (String(url).indexOf(":generateContent") >= 0) {
        return Promise.resolve(new Response(JSON.stringify({
          candidates:[{content:{parts:[{inline_data:{mime_type:"image/png",data:"${B64}"}}]},finishReason:"STOP"}]
        }), {status:200, headers:{"Content-Type":"application/json"}}));
      }
      return realFetch.apply(this, arguments);
    };
  `);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  const wiz4 = await page.evaluate(async (b64) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    state.key = "TEST_KEY";
    window.scrollTo = function(){}; Element.prototype.scrollIntoView = function(){};
    switchPage("pgWf");
    document.querySelectorAll("#wfHost .grp").forEach(g => g.classList.add("open"));
    document.querySelectorAll("#wfHost .wfmini")[0].click();
    await sleep(50);
    const gold = () => document.querySelector(".wiz.on .wiz-nav .btn-gold");
    if (!gold()) return { fail: "wizard did not open" };
    const dots = document.querySelectorAll(".wiz.on .wiz-dot").length;
    for (let s = 0; s < 4; s++) state.refs[s] = { mime: "image/png", b64: b64, label: "t" + s };
    gold().click(); await sleep(30);           // 1 -> 2
    if (!gold() || gold().disabled) return { fail: "step2 blocked" };
    gold().click(); await sleep(30);           // 2 -> 3
    if (!gold()) return { fail: "no GENERATE" };
    gold().click();                            // 3 -> 4 (inline result)
    let resultShown = false;
    for (let w = 0; w < 100; w++) { if (document.querySelector(".wiz.on .wiz-result")) { resultShown = true; break; } await sleep(50); }
    const acts = Array.from(document.querySelectorAll(".wiz.on .wiz-acts .btn")).map(b => b.textContent);
    const dl = document.querySelector(".wiz.on .wiz-acts a.btn");
    const wizStillOpen = document.getElementById("wiz").className.indexOf("on") >= 0;
    const gennoteGone = !document.querySelector(".wiz.on .wiz-body") ||
      document.body.textContent.indexOf("GENERATE jumps to the Create page") < 0;
    return {
      dots, resultShown, wizStillOpen, gennoteGone,
      actCount: acts.length,
      dlIsDataUrl: dl ? dl.href.indexOf("data:image") === 0 : false,
      dlHasDownload: dl ? !!dl.getAttribute("download") : false,
      histLen: state.hist.length
    };
  }, B64);
  check(!wiz4.fail && wiz4.dots === 4 && wiz4.resultShown && wiz4.wizStillOpen && wiz4.gennoteGone &&
    wiz4.actCount === 4 && wiz4.dlIsDataUrl && wiz4.dlHasDownload && wiz4.histLen > 0,
    "wizard step 4: 4 dots, inline result in the open wizard, 4 actions incl. a real Download, old lands-on-Freeform note gone", wiz4);

  /* repeat-run fast path: reopening with inputs satisfied offers skip-to-Generate */
  const fast = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const wz = document.getElementById("wiz");
    wz.className = "wiz"; document.body.style.overflow = ""; window._wizOnPick = null;
    document.querySelectorAll("#wfHost .wfmini")[0].click();
    await sleep(50);
    const chip = document.querySelector(".wiz.on .wiz-fast");
    if (!chip) return { fail: "no fast-path affordance" };
    chip.click(); await sleep(30);
    const gen = document.querySelector(".wiz.on .wiz-nav .btn-gold");
    const onGenerate = !!gen && document.querySelectorAll(".wiz.on .wiz-dot.on").length === 1 &&
      Array.from(document.querySelectorAll(".wiz.on .wiz-dot")).findIndex(d => d.className.indexOf(" on") >= 0) === 2;
    wz.className = "wiz"; document.body.style.overflow = ""; window._wizOnPick = null;
    return { onGenerate };
  });
  check(!fast.fail && fast.onGenerate,
    "repeat-run fast path: one tap jumps a fully-prepared wizard to the Generate step", fast);

  /* ---- 6) Continue row appears on Home after the generate ---- */
  const cont = await page.evaluate(() => {
    switchPage("pgDash");
    const card = document.getElementById("dashCont");
    const thumb = document.querySelector("#dashContRow img.dash-cont-thumb");
    return {
      shown: card.style.display !== "none",
      thumbIsResult: thumb ? thumb.src.indexOf("data:image/png") === 0 : false,
      chips: document.querySelectorAll("#dashContChips .chip").length,
      hist: state.hist.length
    };
  });
  check(cont.shown && cont.thumbIsResult && cont.chips >= 1 && cont.hist > 0,
    "Continue row appears after a mocked generate: state.hist[0] thumb + recent-workflow chips", cont);

  /* ---- keyless first-run user must actually SEE the key prompt ----
     v4.27.0 moved the landing page from Workflows to Home, and #keyBanner was
     markup-level a child of #pgWf — so it went from "the first thing a keyless
     user sees" to 0px on eleven of twelve pages, silently, with no test
     watching. It is now a sibling of the page stack. This asserts both halves:
     visible everywhere without a key, gone once a key is saved. */
  const kb = await page.evaluate(pgs => {
    try { localStorage.removeItem("hnk_web_studio_key"); } catch (e) {}
    state.key = ""; updateKeyBanner();
    const el = document.getElementById("keyBanner");
    const noKey = {};
    pgs.forEach(id => { switchPage(id); noKey[id] = el.offsetHeight; });
    state.key = "AIza-test-key-value-placeholder"; updateKeyBanner();
    switchPage("pgDash");
    const withKey = el.offsetHeight;
    state.key = ""; updateKeyBanner();
    return { noKey, withKey, pages: pgs.length };
  }, ["pgDash","pgWf","pgCreate","pgStudio","pgRetouch","pgPath","pgText2Img","pgVideo","pgVideoUp","pgLib","pgGal","pgHome"]);
  const kbHidden = Object.keys(kb.noKey).filter(k => !(kb.noKey[k] > 0));
  check(kbHidden.length === 0 && kb.withKey === 0,
    "key banner: a user with no API key sees the prompt on EVERY page (not just Workflows), and it disappears once a key is saved",
    JSON.stringify({ pagesMissingBanner: kbHidden, withKey: kb.withKey, pages: kb.pages }));

  await page.close();
  await browser.close();
  console.log("\n" + (failures ? "FAIL (" + failures + " failure(s))" : "PASS"));
  process.exit(failures ? 1 : 0);
})();
