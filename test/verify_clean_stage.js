/* v6.25.0 — CLEAN STAGE (Retouch A / B). The owner's phone review: chips laid over the preview hid it
   and read as clutter. Now nothing sits on the picture (only the split line and a small zoom pill), ONE
   toolbar of equal icon+label buttons runs under it, the zoom presets are their own row (opened from Zoom
   or whenever zoomed), compact keeps the thumbnail + four essentials, the sticky-stage exit band follows
   the measured shrink, and the phone GENERATE bar folds its queue under ▾.
   Usage: PORT=8931 node test/verify_clean_stage.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 520)));
  if (!ok) failures++;
}
/* ---- A) source pins ---- */
report("A) the rail is a flex toolbar in normal flow and no control is absolutely positioned over the picture any more",
  /\.st-rail\{display:flex;flex-wrap:nowrap;align-items:stretch;justify-content:space-between/.test(APP) && /\.st-ov\{position:static;z-index:auto;flex:1 1 0;/.test(APP) &&
  !/#stHold\{bottom:12px;left:6px\}/.test(APP) && !/#stSplit\{top:10px;left:6px\}/.test(APP) && !/\.st-zoom-presets\{position:absolute;top:52px/.test(APP) &&
  /#stHold\{order:1\}#stSplit\{order:2\}#stSplitSwap\{order:3\}#stPin\{order:4\}#stSbs\{order:5\}#stZoomTgl\{order:6\}#stZones\{order:7\}#stUndoB\{order:8\}#stRedoB\{order:9\}#stReset\{order:10\}#stStageMin\{order:11\}/.test(APP), null);
report("A2) the zoom pill rides on the picture (top-right, gold on dark) and the presets row opens from the Zoom button or whenever zoomed",
  /wrap\.appendChild\(ind\);/.test(APP) && /#stZoomInd,#stZoomInd\.on\{position:absolute;top:8px;right:8px;/.test(APP) && /color:var\(--gold-hi\);border-color:rgba\(233,185,73,\.55\)\}/.test(APP) &&
  /ztg\.id="stZoomTgl";/.test(APP) && /#stStage\.zoomrow \.st-zoom-presets,#stStage\.zoomed \.st-zoom-presets\{display:flex\}/.test(APP) &&
  /if\(stgEl\) stgEl\.classList\.add\("zoomed"\);/.test(APP) && /if\(stgEl\) stgEl\.classList\.remove\("zoomed"\);/.test(APP) &&
  /\[pin,sbs\]\.forEach\(function\(b\)\{ b\.classList\.remove\("st-zp"\); if\(rail\) rail\.appendChild\(b\); \}\);/.test(APP), null);
report("A3) compact / mini keep the four essentials; the sticky exit band follows the measured shrink; the split line spans the picture only; the face scan refreshes the rail",
  /#stStage\.compact #stPin,#stStage\.compact #stSbs,#stStage\.compact #stZoomTgl,#stStage\.compact #stZones,#stStage\.compact #stSplitSwap,#stStage\.compact \.st-zoom-presets/.test(APP) &&
  /function exitBand\(\)\{ return Math\.max\(120,\(lastShrink\|\|0\)-10\); \}/.test(APP) && /y<Math\.max\(0,natTop-exitBand\(\)\)/.test(APP) && /var minY=Math\.max\(0,natTop-\(exitBand\(\)-10\)\);/.test(APP) &&
  /line\.style\.top=\(r\.top-sr\.top\)\+"px"; line\.style\.height=r\.height\+"px";/.test(APP) &&
  /if\(typeof stRefreshUI==="function"\) stRefreshUI\(\); \/\* v6\.25\.0 — the Face · Eyes · Lips zoom presets appear the moment the scan lands \*\//.test(APP), null);
report("A4) phone GENERATE bar: the queue folds under ▾ (id-level wrap rule beats the nowrap row), the back-to-top FAB leaves the studio pages, no text under 9px in the header / strip tags",
  /<button class="chip st-more" id="stGenMore" aria-expanded="false" style="display:none">/.test(APP) && /#stGenBar\.open>\.row\{flex-wrap:wrap;overflow:visible\}#stGenBar\.open>\.row \.gen\{flex:1 1 100%\}/.test(APP) &&
  /\.st-genbar #stPendChips,\.st-genbar #stClearAi,\.st-genbar #stToBatch\{display:none\}/.test(APP) && /more\.style\.display=n\?"":"none";/.test(APP) &&
  /body:has\(#pgStudio\.on\) \.fab-top,body:has\(#pgMeitu\.on\) \.fab-top,body:has\(#pgEvoto\.on\) \.fab-top\{display:none!important\}/.test(APP) &&
  !/\.hnk-studio-label\{font-size:7\.5px/.test(APP) && !/\.hnk-studio-label\{font-size:8\.5px/.test(APP) && !/padding:0 4px;font-size:8\.5px;color:var\(--gold-hi\)/.test(APP), null);
report("A5) CI runs this test", /node test\/verify_clean_stage\.js/.test(CI), null);
/* v6.25.0c — a video generate RunningHub answered with HTTP 200 but no flat taskId read as a blank "(200)":
   every openapi/v2 create site now reads the id through rhV2TaskIdOf (flat, data-enveloped, snake_case,
   taskIds list) and a refusal keeps its text; the error line quotes the answer when no msg field exists */
report("A6) every openapi/v2 create site reads the task id through rhV2TaskIdOf and keeps a refusal's raw text; the generic error line quotes the answer",
  /function rhV2TaskIdOf\(j\)\{/.test(APP) && (APP.match(/var tid=rhV2TaskIdOf\(j\);/g) || []).length >= 7 && !/if\(!r\.ok \|\| !j \|\| !j\.taskId\)/.test(APP) &&
  (APP.match(/e\.raw=String\(txt\|\|""\)\.slice\(0,300\); throw e;/g) || []).length >= 7 &&
  /if\(!bodyMsg && bb && typeof bb==="object"\) bodyMsg=JSON\.stringify\(bb\)\.slice\(0,120\);/.test(APP) && /if\(!bodyMsg && e && e\.raw\) bodyMsg=String\(e\.raw\)/.test(APP) &&
  new Function("var j=arguments[0];" + APP.slice(APP.indexOf("function rhV2TaskIdOf(j){"), APP.indexOf("async function rhV2Submit(")) + "return rhV2TaskIdOf(j);")({ data: { taskId: "abc" } }) === "abc" &&
  new Function("var j=arguments[0];" + APP.slice(APP.indexOf("function rhV2TaskIdOf(j){"), APP.indexOf("async function rhV2Submit(")) + "return rhV2TaskIdOf(j);")({ code: 0, taskIds: ["t9"] }) === "t9" &&
  new Function("var j=arguments[0];" + APP.slice(APP.indexOf("function rhV2TaskIdOf(j){"), APP.indexOf("async function rhV2Submit(")) + "return rhV2TaskIdOf(j);")({ code: 433, msg: "no" }) === "", null);

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
const RAIL = ["stHold", "stSplit", "stPin", "stZoomTgl", "stZones", "stUndoB", "stRedoB", "stReset", "stStageMin"];
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID_UA, locale: "my-MM" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await loadPhoto(page);

  /* B) the toolbar */
  const tb = await page.evaluate((ids) => {
    const c = document.getElementById("stCanvas").getBoundingClientRect();
    const rows = ids.map(id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { id, vis: cs.display !== "none" && r.width > 0, top: Math.round(r.top), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right), pos: cs.position }; });
    const vis = rows.filter(x => x.vis);
    const tops = vis.map(x => x.top); const sameRow = Math.max(...tops) - Math.min(...tops) <= 2;
    const ordered = vis.every((x, i) => i === 0 || x.l >= vis[i - 1].r - 1);
    const overPicture = vis.filter(x => x.top < c.bottom - 1).map(x => x.id);
    const inVp = vis.every(x => x.l >= -1 && x.r <= window.innerWidth + 1);
    const minH = Math.min(...vis.map(x => x.h));
    const presetsHidden = getComputedStyle(document.getElementById("stZoomPresets")).display === "none";
    const indHidden = getComputedStyle(document.getElementById("stZoomInd")).display === "none";
    const indInWrap = document.getElementById("stZoomInd").parentNode === document.getElementById("stZoomWrap");
    return { n: vis.length, ids: vis.map(x => x.id), sameRow, ordered, overPicture, inVp, minH, allStatic: vis.every(x => x.pos === "static"), presetsHidden, indHidden, indInWrap, canvasBottom: Math.round(c.bottom), railTop: Math.min(...tops) };
  }, RAIL);
  report("B) 393px phone: all nine toolbar buttons are visible on one row under the picture, in order, ≥40px tall, inside the viewport, none over the picture; the presets row and the zoom pill start hidden",
    tb.n === 9 && tb.sameRow && tb.ordered && tb.overPicture.length === 0 && tb.inVp && tb.minH >= 40 && tb.allStatic && tb.presetsHidden && tb.indHidden && tb.indInWrap && tb.railTop >= tb.canvasBottom - 1, tb);

  /* C) zoom row + pill */
  const zm = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stg = document.getElementById("stStage"), pr = document.getElementById("stZoomPresets"), ind = document.getElementById("stZoomInd"), c = document.getElementById("stCanvas");
    document.getElementById("stZoomTgl").click(); await sleep(150);
    const rowShown = getComputedStyle(pr).display === "flex" && stg.classList.contains("zoomrow");
    const face = ["stZpFace", "stZpEyes", "stZpLips"].map(id => getComputedStyle(document.getElementById(id)).display !== "none");
    const fit = getComputedStyle(document.getElementById("stZpFit")).display !== "none", p100 = getComputedStyle(document.getElementById("stZp100")).display !== "none";
    const prR = pr.getBoundingClientRect(), rail = document.getElementById("stRail").getBoundingClientRect();
    const rowBelowRail = prR.top >= rail.bottom - 1;
    document.getElementById("stZpEyes").click(); await sleep(700);
    const cr = document.getElementById("stZoomWrap").getBoundingClientRect(), ir = ind.getBoundingClientRect(), ics = getComputedStyle(ind); /* the zoomed canvas is transformed; the pill sits on the wrap */
    const pill = { shown: ics.display !== "none" && ir.width > 20, inside: ir.right <= cr.right + 1 && ir.top >= cr.top - 1 && ir.top <= cr.top + 20, h: Math.round(ir.height), text: ind.textContent, color: ics.color, bg: ics.backgroundColor, zoomedCls: stg.classList.contains("zoomed") };
    document.getElementById("stZoomTgl").click(); await sleep(100);          /* row toggled off — still shown while zoomed */
    const stillShownWhileZoomed = getComputedStyle(pr).display === "flex";
    ST.zoomReset(); await sleep(200);
    const afterReset = { rowHidden: getComputedStyle(pr).display === "none", pillHidden: getComputedStyle(ind).display === "none", cls: stg.classList.contains("zoomed") };
    return { rowShown, face, fit, p100, rowBelowRail, pill, stillShownWhileZoomed, afterReset };
  });
  report("C) Zoom opens the presets row under the toolbar (Fit · 100% · Face · Eyes · Lips once the scan landed); zooming shows the 28px gold-on-dark pill inside the picture's top-right; the row stays while zoomed and both go at Fit",
    zm.rowShown && zm.face.every(Boolean) && zm.fit && zm.p100 && zm.rowBelowRail && zm.pill.shown && zm.pill.inside && Math.abs(zm.pill.h - 28) <= 1 && /×|100%/.test(zm.pill.text) && zm.pill.color !== zm.pill.bg && zm.pill.zoomedCls &&
    zm.stillShownWhileZoomed && zm.afterReset.rowHidden && zm.afterReset.pillHidden && !zm.afterReset.cls, zm);

  /* D) split */
  const sp = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById("stSplit").click(); await sleep(250);
    const c = document.getElementById("stCanvas").getBoundingClientRect(), l = document.getElementById("stSplitLine").getBoundingClientRect();
    const sw = document.getElementById("stSplitSwap"), swR = sw.getBoundingClientRect(), ab = document.getElementById("stSplit").getBoundingClientRect();
    const res = { on: ST.split.on, lineTop: Math.round(l.top - c.top), lineBottom: Math.round(c.bottom - l.bottom), lineShown: getComputedStyle(document.getElementById("stSplitLine")).display !== "none", swapShown: getComputedStyle(sw).display !== "none" && swR.width > 20, swapBesideAB: Math.abs(swR.top - ab.top) <= 2 && swR.left >= ab.right - 1 };
    document.getElementById("stSplit").click(); await sleep(150);
    res.off = !ST.split.on && getComputedStyle(sw).display === "none";
    return res;
  });
  report("D) A|B: the split line spans exactly the picture (not the toolbar) and the swap chip appears beside A|B in the toolbar; off again hides both",
    sp.on && sp.lineShown && Math.abs(sp.lineTop) <= 2 && Math.abs(sp.lineBottom) <= 2 && sp.swapShown && sp.swapBesideAB && sp.off, sp);

  /* E) compact: four essentials; the exit band measured.
     Timing (task #107, cross-engine diag run #17): the stage reacts to the scroll EVENT, and WebKit delivers a
     programmatic scroll's event only at its next rendering opportunity — with the studio's hi-res preview tier
     still rendering that landed 300–550 ms after the scroll, while a fixed 350 ms read raced it (run #2 and the
     PR run at c433b91 read "still compact"; the exit itself fires within ~50 ms once the thread is idle, 16/16
     cycles). So wait for the reaction, up to two seconds, and report how long each direction took. */
  const cp = await page.evaluate(async (ids) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const until = async (fn, max) => { const t0 = performance.now(); while (performance.now() - t0 < max) { if (fn()) return Math.round(performance.now() - t0); await sleep(25); } return null; };
    const se = document.scrollingElement, stg = document.getElementById("stStage");
    se.scrollTop = 0; await until(() => !stg.classList.contains("compact"), 2000); await sleep(300);
    const nat = stg.getBoundingClientRect().top + window.scrollY;
    se.scrollTop = nat + 30; await sleep(260); se.scrollTop += 60;
    const enterMs = await until(() => stg.classList.contains("compact"), 2000); await sleep(120);
    const compact = stg.classList.contains("compact");
    const vis = ids.filter(id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== "none" && r.width > 0; });
    const presetsHidden = getComputedStyle(document.getElementById("stZoomPresets")).display === "none";
    const band = ST._stageExitBand ? ST._stageExitBand() : null;
    const fab = document.getElementById("btnTop"); fab.classList.add("on"); const fabHidden = getComputedStyle(fab).display === "none"; fab.classList.remove("on");
    se.scrollTop = 0; const exitMs = await until(() => !stg.classList.contains("compact"), 2000);
    return { compact, enterMs, vis, presetsHidden, band, fabHidden, exitMs, backFull: !stg.classList.contains("compact") };
  }, RAIL);
  report("E) scrolled past the enter band the compact stage shows exactly Before · A|B · Reset · ⌄ (no presets), the exit band is measured (≥120 and above the old constant for this taller stage), the back-to-top FAB stays hidden on the studio page, and the top scroll restores the full stage",
    cp.compact && typeof cp.enterMs === "number" && JSON.stringify(cp.vis) === JSON.stringify(["stHold", "stSplit", "stReset", "stStageMin"]) && cp.presetsHidden && typeof cp.band === "number" && cp.band >= 120 && cp.fabHidden && typeof cp.exitMs === "number" && cp.backFull, cp);

  /* F) phone GENERATE bar */
  const gb = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bar = document.getElementById("stGenBar"), more = document.getElementById("stGenMore"), chips = document.getElementById("stPendChips"), gen = document.getElementById("btnStGen");
    ["mu_ueDark"].forEach(id => svSet(id, 0)); stRenderPend(); await sleep(100);
    const emptyHidden = getComputedStyle(more).display === "none";
    const s = document.getElementById("mu_ueDark"); s.value = "100"; s.dispatchEvent(new Event("input", { bubbles: true })); await sleep(500);
    const shown = getComputedStyle(more).display !== "none", chipsFolded = getComputedStyle(chips).display === "none";
    const mr = more.getBoundingClientRect(), br = bar.getBoundingClientRect();
    const topRight = mr.top - br.top < 14 && br.right - mr.right < 14;
    more.click(); await sleep(250);
    const open = bar.classList.contains("open"), chipsShown = getComputedStyle(chips).display !== "none", chipN = chips.querySelectorAll(".chip").length;
    const row = gen.parentNode.getBoundingClientRect(), gr = gen.getBoundingClientRect();
    const genFull = gr.width >= row.width * 0.9, clearShown = getComputedStyle(document.getElementById("stClearAi")).display !== "none";
    more.click(); await sleep(150);
    const closed = !bar.classList.contains("open") && getComputedStyle(chips).display === "none";
    svSet("mu_ueDark", 0); stRenderPend();
    return { emptyHidden, shown, chipsFolded, topRight, open, chipsShown, chipN, genFull, clearShown, closed };
  });
  report("F) phone GENERATE bar: no ▾ with an empty queue; a queued edit shows ▾ top-right with the chips folded; open shows the chips + Clear AI with GENERATE on its own full-width row; closed folds them again",
    gb.emptyHidden && gb.shown && gb.chipsFolded && gb.topRight && gb.open && gb.chipsShown && gb.chipN >= 1 && gb.genFull && gb.clearShown && gb.closed, gb);
  await ctx.close();

  /* G) desktop: the same toolbar under the picture, with 2-up */
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await dctx.newPage(); dp.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await dp.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await dp.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" }); await dp.waitForTimeout(900);
  await loadPhoto(dp);
  const dk = await dp.evaluate(async (ids) => {
    const s = document.getElementById("mu_ueDark"); s.value = "100"; s.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 500));
    const c = document.getElementById("stCanvas").getBoundingClientRect();
    const all = ids.concat(["stSbs"]).map(id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, vis: getComputedStyle(e).display !== "none" && r.width > 0, top: Math.round(r.top), h: Math.round(r.height) }; });
    const vis = all.filter(x => x.vis); const tops = vis.map(x => x.top);
    const out = { n: vis.length, sbs: !!all.find(x => x.id === "stSbs" && x.vis), sameRow: Math.max(...tops) - Math.min(...tops) <= 2, below: Math.min(...tops) >= c.bottom - 1, more: getComputedStyle(document.getElementById("stGenMore")).display === "none", chips: getComputedStyle(document.getElementById("stPendChips")).display !== "none" && document.querySelectorAll("#stPendChips .chip").length >= 1 };
    svSet("mu_ueDark", 0); stRenderPend(); return out;
  }, RAIL);
  report("G) 1280px desktop: the ten buttons (2-up included) share one row under the picture; with an edit queued the GENERATE bar shows its chips open and no ▾", dk.n === 10 && dk.sbs && dk.sameRow && dk.below && dk.more && dk.chips, dk);
  await dctx.close();
  report("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
