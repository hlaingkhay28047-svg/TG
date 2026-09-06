/* TEMPORARY cross-engine diagnostic for task #107 (WebKit-only findings E/F of verify_clean_stage) — dispatched
   through cross-engine.yml with tests=diag_webkit_stage; removed by the wave that lands the fix.
   Prints a timeline of the compact -> full exit on a scroll to the top, and the computed flex geometry of the
   phone GENERATE bar with its queue open. Never asserts. */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; 24090RA29G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
async function loadPhoto(page) {
  await page.evaluate(async () => {
    switchPage("pgMeitu");
    const r = await fetch("lib/st-sample.jpg"); const bl = await r.blob();
    const du = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); });
    state.stFull = { key: stFullKey(du.slice(du.indexOf(",") + 1)), du };
    await new Promise(res => { ST.loadImage(du, { done: res }); });
    for (let w = 0; w < 200 && !((ST.faceLM && ST.faceLM.scanned) || (window.STFACE && STFACE.off)); w++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 400));
    const st = document.getElementById("stStage"), nav = document.querySelector("nav.nav"); const nh = nav ? nav.getBoundingClientRect().height : 54;
    window.scrollTo(0, Math.max(0, st.getBoundingClientRect().top + window.scrollY - nh - 2));
  });
  await page.waitForTimeout(500);
}
(async () => {
  const browser = await chromium.launch(); withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID_UA, locale: "my-MM" });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 300)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1");
    window.__scr = []; window.addEventListener("scroll", () => { window.__scr.push([Math.round(performance.now()), Math.round(window.scrollY)]); }, { passive: true });
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(900);
  await loadPhoto(page);
  const env = await page.evaluate(() => ({ ua: navigator.userAgent.slice(0, 80), iw: innerWidth, ih: innerHeight, vv: window.visualViewport ? visualViewport.height : null, dpr: devicePixelRatio, se: document.scrollingElement && document.scrollingElement.tagName,
    sbHtml: getComputedStyle(document.documentElement).scrollBehavior, sbBody: getComputedStyle(document.body).scrollBehavior, mode: ST.ui.mode, natTop: ST._natTop, navH: getComputedStyle(stActivePage()).getPropertyValue("--navH"), mq767: matchMedia("(max-width:767px)").matches, pageCls: stActivePage().className }));
  console.log("ENV", JSON.stringify(env));
  /* ---- E replay with a timeline ---- */
  const e = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const se = document.scrollingElement, stg = document.getElementById("stStage");
    const tl = [];
    const snap = tag => tl.push({ tag, t: Math.round(performance.now()), y: Math.round(window.scrollY), st: Math.round(se.scrollTop), compact: stg.classList.contains("compact"), stTop: Math.round(stg.getBoundingClientRect().top), natTop: ST._natTop == null ? null : Math.round(ST._natTop), scr: window.__scr.length, pg: stActivePage().className });
    se.scrollTop = 0; await sleep(300); snap("top0");
    const nat = stg.getBoundingClientRect().top + window.scrollY;
    se.scrollTop = nat + 30; await sleep(260); snap("nat+30"); se.scrollTop += 60; await sleep(350); snap("enter");
    const band = ST._stageExitBand();
    window.__scr.length = 0;
    se.scrollTop = 0;
    for (let i = 1; i <= 24; i++) { await sleep(50); snap("exit+" + i * 50); }
    const scr = window.__scr.slice(0, 12);
    const stillCompact = stg.classList.contains("compact");
    let alt = null;
    if (stillCompact) {
      alt = {};
      window.scrollTo(0, 0); await sleep(400); alt.afterScrollTo = { compact: stg.classList.contains("compact"), y: Math.round(window.scrollY), scr: window.__scr.length };
      if (stg.classList.contains("compact")) { window.dispatchEvent(new Event("scroll")); await sleep(300); alt.afterDispatch = { compact: stg.classList.contains("compact"), natTop: ST._natTop }; }
      if (stg.classList.contains("compact")) { se.scrollTop = 5; await sleep(300); alt.afterY5 = { compact: stg.classList.contains("compact"), y: Math.round(window.scrollY), scr: window.__scr.length }; se.scrollTop = 0; await sleep(300); alt.afterY5then0 = { compact: stg.classList.contains("compact"), y: Math.round(window.scrollY) }; }
    }
    const raf = await new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (n < 5) requestAnimationFrame(f); else r({ frames: n, ms: Math.round(performance.now() - t0) }); }; requestAnimationFrame(f); });
    return { nat: Math.round(nat), band, thr: Math.max(0, nat - band), tl, scr, alt, raf, compactEnd: stg.classList.contains("compact") };
  });
  console.log("E-DIAG", JSON.stringify(e));
  /* ---- E repeated: eight enter/exit cycles, timing the exit and counting scroll events ---- */
  const cyc = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const se = document.scrollingElement, stg = document.getElementById("stStage");
    const out = [];
    for (let i = 0; i < 8; i++) {
      se.scrollTop = 0; await sleep(400);
      if (stg.classList.contains("compact")) { out.push({ i, note: "still compact at cycle start", y: Math.round(scrollY), natTop: ST._natTop }); stg.classList.remove("compact"); }
      const nat = stg.getBoundingClientRect().top + window.scrollY;
      se.scrollTop = nat + 30; await sleep(260); se.scrollTop += 60; await sleep(350);
      const entered = stg.classList.contains("compact"), yEnter = Math.round(scrollY);
      window.__scr.length = 0; const t0 = performance.now();
      se.scrollTop = 0;
      let exitMs = null; for (let k = 0; k < 60; k++) { await sleep(25); if (!stg.classList.contains("compact")) { exitMs = Math.round(performance.now() - t0); break; } }
      out.push({ i, entered, yEnter, exitMs, yEnd: Math.round(scrollY), scr: window.__scr.slice(0, 6), natTop: ST._natTop == null ? null : Math.round(ST._natTop), band: ST._stageExitBand(), stTop: Math.round(stg.getBoundingClientRect().top), compactEnd: stg.classList.contains("compact") });
    }
    return out;
  });
  console.log("E-CYCLES", JSON.stringify(cyc));
  /* ---- F replay with computed flex geometry ---- */
  const f = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rect = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const cs = (el, props) => { const c = getComputedStyle(el); const o = {}; props.forEach(p => { o[p] = c.getPropertyValue(p); }); return o; };
    const bar = document.getElementById("stGenBar"), more = document.getElementById("stGenMore"), chips = document.getElementById("stPendChips"), gen = document.getElementById("btnStGen"), row = gen.parentNode;
    ["mu_ueDark"].forEach(id => svSet(id, 0)); stRenderPend(); await sleep(100);
    const s = document.getElementById("mu_ueDark"); s.value = "100"; s.dispatchEvent(new Event("input", { bubbles: true })); await sleep(500);
    const closedGeom = { row: rect(row), gen: rect(gen), more: rect(more), ...cs(row, ["flex-wrap", "overflow-x"]) };
    more.click(); await sleep(250);
    const kids = Array.from(row.children).map(k => ({ id: k.id, disp: getComputedStyle(k).display, pos: getComputedStyle(k).position, flex: getComputedStyle(k).getPropertyValue("flex"), r: rect(k) }));
    const rules = [];
    const walk = (list, media) => { for (const r of list) { try { if (r.selectorText) { if (/stGenBar|st-genbar|^\.gen$|^\.row$|^\.grow$|^\.btn$/.test(r.selectorText)) rules.push({ m: media || "", s: r.selectorText.slice(0, 120), c: r.style.cssText.slice(0, 160) }); } else if (r.cssRules && r.media) walk(r.cssRules, (media ? media + " & " : "") + r.media.mediaText); else if (r.cssRules) walk(r.cssRules, media); } catch (e) {} } };
    for (const ss of document.styleSheets) { try { walk(ss.cssRules, ""); } catch (e) { rules.push({ err: String(e).slice(0, 80) }); } }
    const out = { open: bar.classList.contains("open"), barCls: bar.className, pageCls: stActivePage().className, stageCls: document.getElementById("stStage").className, iw: innerWidth, mq767: matchMedia("(max-width:767px)").matches,
      bar: { r: rect(bar), ...cs(bar, ["position", "width", "padding-left", "padding-right"]) },
      row: { r: rect(row), sw: row.scrollWidth, cw: row.clientWidth, ...cs(row, ["display", "flex-wrap", "overflow", "overflow-x", "width", "gap", "padding-left", "padding-right", "margin-top"]) },
      gen: { r: rect(gen), ...cs(gen, ["display", "flex", "flex-basis", "flex-grow", "flex-shrink", "width", "min-width", "max-width", "box-sizing", "white-space", "position"]), text: gen.textContent.trim().slice(0, 40) },
      kids, closedGeom, rules };
    more.click(); await sleep(150); svSet("mu_ueDark", 0); stRenderPend();
    return out;
  });
  console.log("F-DIAG", JSON.stringify(f));
  /* ---- F again with the stage forced full (in case E left it compact) ---- */
  const f2 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rect = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const stg = document.getElementById("stStage"); const wasCompact = stg.classList.contains("compact");
    stg.classList.remove("compact"); stActivePage().classList.remove("stcompact"); await sleep(100);
    const bar = document.getElementById("stGenBar"), more = document.getElementById("stGenMore"), gen = document.getElementById("btnStGen"), row = gen.parentNode;
    const s = document.getElementById("mu_ueDark"); s.value = "100"; s.dispatchEvent(new Event("input", { bubbles: true })); await sleep(500);
    more.click(); await sleep(250);
    const out = { wasCompact, open: bar.classList.contains("open"), row: rect(row), gen: rect(gen), genFlex: getComputedStyle(gen).getPropertyValue("flex"), wrap: getComputedStyle(row).flexWrap, genFull: gen.getBoundingClientRect().width >= row.getBoundingClientRect().width * 0.9 };
    more.click(); await sleep(150); svSet("mu_ueDark", 0); stRenderPend();
    return out;
  });
  console.log("F2-DIAG", JSON.stringify(f2));
  await browser.close();
  console.log("DIAG DONE");
})().catch(e => { console.error(e); process.exit(1); });
