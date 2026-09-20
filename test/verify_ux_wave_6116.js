/* 6.116.0 / panel 6.187.0 — WAVE B3 (the wide panel) + RETOUCH R1 (the result that fits).
   Owner (2026-09-20, the UI/UX programme, then three photographs the same afternoon).

   B3 — THE PHOTOSHOP PANEL PAST 600px. UXP has no grid, no media query, no gap, so every
   layout on the panel is an inline flex style measured by the host's own ruler:
     the studio (Retouch A / Retouch B): from a 600px host #stCols is two columns — the
     PHOTO card, the jump bar and MY RECIPES on the left (max(260px, 42%)), the suite's
     controls and the result on the right, a 14px gutter; one column below 600.
     the six generate pages (Freeform · Create · Video · Video Upscale · V→V · Talking
     Photo): from an 800px host, and only once the page HAS a result to show, the cards
     move into two panes — controls left (55%), the result box and everything after it
     right (45%). Under 800px, or with no result, the children go back to the page in
     their recorded order and the panes are removed: the DOM a 360px panel shows is
     exactly what it was, so every parity walk still sees the original page.
     The shared result card (#resultBox) goes home to its PAGE, not to a pane that may
     be gone, and a wide Freeform page re-adopts it.

   R1 — THE RESULT THAT FITS THE SCREEN. The photographs: on a monitor the Retouch A / B /
   V2 result stood ~1350px tall in a ~900px column (the wipe drew the picture at the
   card's full width), so only a strip showed, the grip sat at the line's middle — near
   the bottom of the window — and the range was below the fold; a press on the picture
   started the browser's own image drag and cancelled the wipe. Now: cmpFit sizes the
   four wipes (Retouch A/B · V2 · Freeform · Path) from the picture's own ratio within
   the window's height (300px of chrome: header, title, range, labels, buttons, the sticky GENERATE bar),
   centred, the range and the label row following; the pictures no
   longer take the pointer; the grip is 44px; the box is focusable and ← → nudge it;
   Retouch A/B's result gets Before · Zoom · After like V2's; the desktop live-preview
   stage is 80px taller. The panel's shared compare fits the panel's height the same way.

   HOW IT IS MEASURED. A — the source pins on both surfaces. B — the panel at 360 / 640 /
   900 and back to 360: columns, panes (only with a result, through the real paint
   paths), the result card's hand-off, the revert, the compare fit, no page error.
   C — the app at 1440×900, 1920×1000 and 390×844: the Retouch A, V2 and Freeform wipes
   fitted and centred (column-wide on the phone), a real mouse drag from 30% to 72%, the
   arrow keys, the grip, the labels, the stage cap. D — the release pins: 6.116.0 /
   panel 6.187.0 in lockstep, the What's New row in nine languages, CI runs this test
   as the 258th `node test/` invocation and the landing says 258 tests.
   Fault-injected while it was written: hnkHasResult forced true leaves an empty right
   pane at 900 (B3 fails on the result's rect); cmpFit removed from stCmpLayout fails C1
   (the box is 670px wide and 1005px tall at 1440×900).

   Usage: serve docs/app on 8931, then  node test/verify_ux_wave_6116.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const SCREEN = read("panel/src/ui/screens/retouch-studio-screen.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.116.0", PVER = "6.187.0";
const CMP_CHROME = 300;
const PANE_PAGES = ["pagePrompt", "pageCreate", "pageVideo", "pageVideoUp", "pageV2V", "pageTalk"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const has = (s, t) => s.indexOf(t) >= 0;
const count = (s, t) => s.split(t).length - 1;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ================= A) the source ================= */
function sourcePins() {
  report("A1) PANEL PANES — the six generate pages, an 800px host, a result on: hnkPanes / hnkPanesFor / hnkPanesAll / hnkHostWidth, bound after the sticky GENERATE, re-run on every page switch and at every result-box show site, published as HNK.panes",
    has(MAIN, 'const PANE_PAGES = ["pagePrompt", "pageCreate", "pageVideo", "pageVideoUp", "pageV2V", "pageTalk"];') && has(MAIN, "const PANE_MIN = 800;\nconst PANE_GUTTER = 14;") &&
    has(MAIN, "function hnkHostWidth() {") && has(MAIN, "function hnkHasResult(pageEl) {") && has(MAIN, 'return !!pageEl.querySelector(".result-box.on");') &&
    has(MAIN, "const two = w >= PANE_MIN && hnkHasResult(pageEl);") && has(MAIN, 'wrap.className = "hnk-panes";') && has(MAIN, 'L.style.flex = "1 1 55%";') && has(MAIN, 'R.style.flex = "1 1 45%";') &&
    has(MAIN, "function hnkPanesFor(el) {") && has(MAIN, "function hnkPanesAll() {") && has(MAIN, "function hnkPanesBind() {") &&
    has(MAIN, "  stickyGenBind();\n  hnkPanesBind();") && has(MAIN, "if (active && PANE_PAGES.indexOf(active.page) >= 0) { const ape4 = $(active.page); if (ape4) { try { hnkPanes(ape4); } catch (e) { } } }") &&
    count(MAIN, "try { hnkPanesFor(box); } catch (ep) { }") >= 5 && has(MAIN, "try { hnkPanesFor(rb); } catch (ep) { }") &&
    has(MAIN, "globalThis.HNK.panes = { layout: hnkPanes, of: hnkPanesFor, all: hnkPanesAll, host: hnkHostWidth, MIN: PANE_MIN, pages: PANE_PAGES.slice() };"),
    { hooks: count(MAIN, "hnkPanesFor(") });

  report("A2) STUDIO COLUMNS — from a 600px host #stCols is two columns (left max(260px, 42%), 14px gutter), measured by the host ruler through HNK.panes.host, bound once at mount, re-run on rebuild and resize, published as studioScreen.twoCol; the result card goes home to its PAGE and a wide Freeform page re-adopts it",
    has(SCREEN, "var ST_TWO_COL_MIN = 600, ST_COL_L_MIN = 260, ST_COL_L_SHARE = 0.42, ST_COL_GUTTER = 14, ST_PAGE_GUTTER = 16;") &&
    has(SCREEN, "function stHostWidth(w) {") && has(SCREEN, "function stBlockWidth(cols) {") && has(SCREEN, "function stTwoCol() {") &&
    has(SCREEN, "var two = host >= ST_TWO_COL_MIN;") && has(SCREEN, "var lw = Math.max(ST_COL_L_MIN, Math.round(w * ST_COL_L_SHARE));") &&
    has(SCREEN, "function stTwoColBind() {") && has(SCREEN, "stTwoColBind(); stTwoCol();") && has(SCREEN, "twoCol: stTwoCol") &&
    has(SCREEN, "function resultPageOf(box) {") && has(SCREEN, "if (!resultHome) resultHome = resultPageOf(box);") &&
    has(SCREEN, "try { var pn = g.HNK && g.HNK.panes; if (pn && pn.layout) pn.layout(resultHome); } catch (e) { }"), null);

  report("A3) THE WIPE THAT FITS (app) — cmpFit (CMP_CHROME 300: header, title, range, labels, buttons and the sticky GENERATE bar) in all four layout passes, cmpEnhance (pictures take no pointer, no native drag, focusable, ← → nudge, re-fit on load and resize) run once at boot, Before · Zoom · After on the Retouch A/B result through the shared cmpLabelPair / cmpZoomLabel, the 44px grip, the result box in the studio's scroll-margin rule, the desktop stage 80px taller",
    has(APP, "var CMP_CHROME = 300;") && has(APP, "function cmpFit(boxId, afterId, followIds){") && has(APP, "function cmpEnhance(boxId, rangeId, layoutFn, afterId){") &&
    has(APP, 'cmpFit("stCmp","stCmpAfter",["stCmpRange","stCmpLbls"]);') && has(APP, 'cmpFit("rsCmp","rsCmpAfter",["rsCmpRange","rsCmpLbls"]);') &&
    has(APP, 'cmpFit("cmpBox","cmpAfter",["cmpRange"]);') && has(APP, 'cmpFit("ptCmp","ptCmpBefore",["ptCmpRange"]);') &&
    has(APP, "try { cmpEnhanceAll(); } catch(e){}") && has(APP, 'cmpEnhance("stCmp","stCmpRange",stCmpLayout,"stCmpAfter");') && has(APP, 'cmpEnhance("ptCmp","ptCmpRange",ptCmpLayout,"ptCmpBefore");') &&
    has(APP, ".cmp img{display:block;width:100%;pointer-events:none;-webkit-user-drag:none;user-drag:none}") && has(APP, ".cmp:focus-visible{outline:2px solid var(--gold);outline-offset:3px}") &&
    has(APP, "width:44px;height:44px;border-radius:50%;background:var(--gold) url(") && !has(APP, "width:32px;height:32px;border-radius:50%;background:var(--gold) url(") &&
    has(APP, '<div class="row" id="stCmpLbls" style="justify-content:space-between"><span class="mut" id="stCmpBeforeLbl"></span><button class="chip" id="stZoomBtn"></button><span class="mut" id="stCmpAfterLbl"></span></div>') &&
    has(APP, '<div class="row" id="rsCmpLbls" style="justify-content:space-between">') &&
    has(APP, "function cmpLabelPair(beforeId, afterId){") && has(APP, "function cmpZoomLabel(btn){") && has(APP, 'cmpLabelPair("stCmpBeforeLbl","stCmpAfterLbl");\n  var sz=$("stZoomBtn");') &&
    has(APP, '$("stResultH2").textContent=L9({my:"ရလဒ် — မူရင်း vs ပြီးပြီ",en:"Result — Before vs After"});\ncmpLabelPair("stCmpBeforeLbl","stCmpAfterLbl"); cmpZoomLabel($("stZoomBtn"));') &&
    count(APP, "◀ Before") === 2 && count(APP, 'my:"ချဲ့ကြည့်",en:"Zoom"') === 1 &&
    has(APP, "#pgStudio .grp,#pgMeitu .grp,#pgEvoto .grp,#stMuCard,#stEvCard,#stResultBox{scroll-margin-top:calc(var(--navH,54px) + 10px + env(safe-area-inset-top) + var(--stageH,0px) + var(--jumpH,92px))}") &&
    has(APP, "  #pgStudio .grp,#pgMeitu .grp,#pgEvoto .grp,#stMuCard,#stEvCard,#stResultBox{scroll-margin-top:calc(var(--navH,54px) + 12px)}\n  #stColL #stCanvas{max-height:calc(100vh - 320px)}") &&
    has(APP, "  #stColL #stCanvas{max-height:calc(100vh - 320px)}") && !has(APP, "#stColL #stCanvas{max-height:calc(100vh - 400px)}"), null);

  report("A4) THE WIPE THAT FITS (panel) — fitCompareBox sizes the shared compare from the picture's ratio within the panel's height (an explicit side margin, no margin:auto, no pointer-events), and every panes pass re-fits it",
    has(MAIN, "const CMP_CHROME = 300;") && has(MAIN, "if (iw > 0 && ih > 0 && vh > 0) fit = Math.round(Math.max(240, vh - CMP_CHROME) * iw / ih);") &&
    has(MAIN, "const side = on ? Math.round((pw - fit) / 2) : 0;") && has(MAIN, 'box.setAttribute("data-fit", on ? String(fit) : "0");') &&
    has(MAIN, "  try { fitCompareBox(); } catch (e4) { }\n}") && !has(MAIN, "margin: auto") && !has(read("panel/styles.css").replace(/\/\*[\s\S]*?\*\//g, ""), "pointer-events"), null);
}

/* ================= B) the panel ================= */
const PANEL = path.join(ROOT, "panel");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
function servePanel() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const abs = path.resolve(PANEL, rel);
      if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
async function openPanel(browser, server, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e && e.message || e).slice(0, 200)));
  await page.route("**/*", (r) => {
    const u = r.request().url(); if (u.indexOf("127.0.0.1") >= 0) return r.continue();
    if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(UXP_STUB);
  await page.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, errs };
}
const PANEL_SNAP = (key) => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const pg = document.querySelector(".page.on");
  const out = { key, page: pg && pg.id, host: innerWidth, scrollW: document.documentElement.scrollWidth };
  const cols = document.getElementById("stCols");
  if (cols) out.cols = { dc: cols.getAttribute("data-cols"), host: cols.getAttribute("data-host"), L: R(document.getElementById("stColL")), R: R(document.getElementById("stColR")), inPage: !!(pg && pg.contains(cols)) };
  if (pg) {
    out.panes = pg.getAttribute("data-panes");
    const wrap = pg.querySelector(":scope > .hnk-panes"); out.wrap = !!wrap;
    if (wrap) {
      out.L = R(wrap.firstElementChild); out.R = R(wrap.lastElementChild);
      out.Lkids = Array.from(wrap.firstElementChild.children).map((c) => c.id || c.className);
      out.Rkids = Array.from(wrap.lastElementChild.children).map((c) => c.id || c.className);
    }
    out.kids = Array.from(pg.children).map((c) => c.id || c.className.split(" ").slice(0, 2).join("."));
    const rb = pg.querySelector(".result-box"); out.rb = R(rb); out.rbOn = !!(rb && /\bon\b/.test(rb.className));
    const box = document.getElementById("resultBox"); let p = box && box.parentNode, chain = [];
    while (p && p !== document.body) { chain.push(p.id || p.className); p = p.parentNode; }
    out.resultHome = chain.join(" < ");
  }
  return out;
};
const FAKE_RESULTS = (on) => {
  const px = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  state.cResultB64 = on ? px : null; paintCreateResultBox();
  state.resultB64 = on ? px : null; refreshCompare();
  if (on) { if (!vidHist.length) { vidHist.unshift({ url: "http://127.0.0.1/x.mp4", name: "x.mp4", ts: Date.now() }); vidHistSel = 0; } showVidResult(); }
  else { const b = document.getElementById("vidResultBox"); if (b) { b.className = "card result-box"; HNK.panes.of(b); } }
};

async function panelWalk(browser) {
  const server = await servePanel();
  try {
    const { page, errs } = await openPanel(browser, server, 360, 900);
    const go = async (key) => { await page.evaluate((k) => { HNK.panelNav.switchPage(k); window.scrollTo(0, 0); }, key); await page.waitForTimeout(300); };
    const snap = (key) => page.evaluate(PANEL_SNAP, key);
    const setW = async (w) => { await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(350); };
    const GEN = { prompt: "pagePrompt", create: "pageCreate", video: "pageVideo", vidup: "pageVideoUp", v2v: "pageV2V", talk: "pageTalk" };
    const ORIG = {};

    /* B1 — 360: one column, one pane, the original DOM */
    const b1 = {};
    for (const k of ["meitu", "evoto"]) { await go(k); b1[k] = await snap(k); }
    for (const k of Object.keys(GEN)) { await go(k); b1[k] = await snap(k); ORIG[k] = b1[k].kids.slice(); }
    report("B1) a 360px panel: Retouch A / B one column (PHOTO above the controls), the six generate pages one pane with no wrapper and the page's own children",
      ["meitu", "evoto"].every((k) => b1[k].cols && b1[k].cols.dc === "1" && b1[k].cols.inPage && b1[k].cols.L.y + b1[k].cols.L.h <= b1[k].cols.R.y + 2 && near(b1[k].cols.L.w, b1[k].cols.R.w, 2)) &&
      Object.keys(GEN).every((k) => b1[k].panes === "1" && !b1[k].wrap && b1[k].kids.indexOf("hnk-panes") < 0 && b1[k].kids.length >= 3) &&
      b1.meitu.scrollW <= 360, { meitu: b1.meitu.cols, prompt: { panes: b1.prompt.panes, kids: b1.prompt.kids } });

    /* B2 — 640: the studio in two columns, the generate pages still one pane (no result yet) */
    await setW(640);
    const b2 = {};
    for (const k of ["meitu", "evoto", "prompt", "create"]) { await go(k); b2[k] = await snap(k); }
    report("B2) a 640px panel: Retouch A / B in two columns — left 260px (the floor over 42% of 608), a 14px gutter, both columns from the same top, the block 608px wide, nothing scrolls sideways; the generate pages stay one pane without a result",
      ["meitu", "evoto"].every((k) => { const c = b2[k].cols; return c.dc === "2" && c.host === "640" && c.L.w === 260 && near(c.R.x, c.L.x + c.L.w + 14, 2) && near(c.L.y, c.R.y, 2) && near(c.L.w + 14 + c.R.w, 608, 3); }) &&
      ["prompt", "create"].every((k) => b2[k].panes === "1" && !b2[k].wrap) && b2.meitu.scrollW <= 640, { meitu: b2.meitu.cols, prompt: b2.prompt.panes });

    /* B3 — 900 with results through the real paint paths: two panes, the result on the right */
    await setW(900);
    await page.evaluate(FAKE_RESULTS, true);
    const b3 = {};
    for (const k of ["prompt", "create", "video", "talk", "vidup", "v2v", "meitu"]) { await go(k); b3[k] = await snap(k); }
    const paneOk = (s) => s.panes === "2" && s.wrap && s.Rkids.length >= 1 && /ResultBox|resultBox/.test(s.Rkids[0]) && s.Lkids.length >= 1 && s.Lkids.every((c) => !/ResultBox|resultBox/.test(c)) &&
      near(s.L.w, Math.round((868 - 14) * 0.55), 3) && near(s.R.w, Math.round((868 - 14) * 0.45), 3) && near(s.R.x, s.L.x + s.L.w + 14, 2) && near(s.L.y, s.R.y, 2) && s.rbOn && s.rb.h > 40 && s.rb.x >= s.R.x - 1 && s.rb.w <= s.R.w + 1;
    report("B3) a 900px panel with a result on Freeform, Create and Video: two panes — the cards left (55% of the row), the visible result box first on the right (45%), a 14px gutter — while Talking Photo, Video Upscale and V→V (no result) stay one pane; Retouch A still two columns (left 365 = 42% of 868)",
      ["prompt", "create", "video"].every((k) => paneOk(b3[k])) && ["talk", "vidup", "v2v"].every((k) => b3[k].panes === "1" && !b3[k].wrap) &&
      b3.meitu.cols.dc === "2" && b3.meitu.cols.L.w === 365 && b3.prompt.scrollW <= 900,
      { prompt: { panes: b3.prompt.panes, L: b3.prompt.L, R: b3.prompt.R, Lk: b3.prompt.Lkids, Rk: b3.prompt.Rkids, rb: b3.prompt.rb }, talk: b3.talk.panes, meitu: b3.meitu.cols });

    /* B4 — the result toggles: off → one pane in the recorded order; on → two again */
    await go("create");
    await page.evaluate(FAKE_RESULTS, false); const off = await snap("create");
    await page.evaluate(FAKE_RESULTS, true); await go("create"); const on = await snap("create");
    report("B4) the panes follow the result: cleared → one pane and the page's children back in their recorded order; shown again → two panes with the result box on the right",
      off.panes === "1" && !off.wrap && JSON.stringify(off.kids) === JSON.stringify(ORIG.create) && on.panes === "2" && on.wrap && /cResultBox/.test(on.Rkids[0]), { off: off.kids, orig: ORIG.create, on: on.Rkids });

    /* B5 — the shared result card's hand-off at 900 */
    await go("meitu"); const hm = await snap("meitu");
    await go("prompt"); const hp = await snap("prompt");
    report("B5) the shared result card (#resultBox) is borrowed by Retouch A's result slot and, back on a wide Freeform page, re-adopted into the right pane (its home is the page, never a pane that may be gone)",
      /^stResultSlot < stColR < stCols < st-mount < pageMeitu/.test(hm.resultHome) && /^hnk-pane hnk-pane-r < hnk-panes < pagePrompt/.test(hp.resultHome) && hp.panes === "2", { meitu: hm.resultHome, prompt: hp.resultHome });

    /* B6 — the panel's compare fits the panel's height: at 900×900 the 350px result pane is narrower than
       the fit (400px), so the box stays pane-wide; at 900×600 the fit (200px) bites and centres */
    await page.setViewportSize({ width: 900, height: 600 }); await page.waitForTimeout(350);
    await go("prompt");
    const fit = await page.evaluate(async () => {
      const mk = (w, h, c1, c2) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.fillStyle = c1; x.fillRect(0, 0, w, h); x.fillStyle = c2; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL("image/png"); };
      const before = mk(600, 900, "#553", "#a86"), after = mk(600, 900, "#357", "#9bd");
      state.beforeB64 = before.split(",")[1]; state.beforeMime = "image/png"; state.resultB64 = after.split(",")[1]; state.resultMime = "image/png";
      refreshCompare(); await new Promise((r) => setTimeout(r, 150));
      const cw = document.getElementById("cmpWrap"); cw.style.display = "";
      const iA = document.getElementById("imgAfter"), iB = document.getElementById("imgBefore"); iA.src = after; iB.src = before;
      await new Promise((r) => setTimeout(r, 300)); fitCompareBox(); await new Promise((r) => setTimeout(r, 100));
      const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const box = document.getElementById("cmpBox");
      const low = { vh: innerHeight, fit: Number(box.getAttribute("data-fit")), box: R(box), parent: R(box.parentNode), range: R(document.getElementById("cmpRange")), natural: [iA.naturalWidth, iA.naturalHeight] };
      return low;
    });
    await page.setViewportSize({ width: 900, height: 900 }); await page.waitForTimeout(350);
    const tall = await page.evaluate(() => { fitCompareBox(); const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; }; const box = document.getElementById("cmpBox"); return { vh: innerHeight, fit: Number(box.getAttribute("data-fit")), box: R(box), parent: R(box.parentNode) }; });
    report("B6) the panel's shared compare (a 600×900 result in the 350px result pane): in a 600px-tall panel the box is (600 − 300) × 2/3 = 200px wide, no taller than 300, centred, the range the same width; back at 900px tall the fit (400) is wider than the pane, so the box is pane-wide again",
      fit.natural[0] === 600 && fit.fit === Math.round((600 - CMP_CHROME) * 600 / 900) && near(fit.box.w, fit.fit, 2) && fit.box.h <= 600 - CMP_CHROME + 2 && fit.box.h >= 280 &&
      near(fit.box.x - fit.parent.x, (fit.parent.x + fit.parent.w) - (fit.box.x + fit.box.w), 3) && near(fit.range.w, fit.box.w, 2) &&
      tall.fit === 0 && near(tall.box.w, tall.parent.w, 2), { low: fit, tall });

    /* B7 — back to 360: everything reverts */
    await setW(360);
    const b7 = {};
    for (const k of ["prompt", "create", "video", "meitu"]) { await go(k); b7[k] = await snap(k); }
    report("B7) back at 360px with the results still on: the panes are gone, every generate page shows its own children in order, Retouch A is one column again; no page error in the whole walk",
      ["prompt", "create", "video"].every((k) => b7[k].panes === "1" && !b7[k].wrap && JSON.stringify(b7[k].kids) === JSON.stringify(ORIG[k])) && b7.meitu.cols.dc === "1" && b7.meitu.scrollW <= 360 && errs.length === 0,
      { prompt: b7.prompt.kids, orig: ORIG.prompt, meitu: b7.meitu.cols, errs });
    await page.close();
  } finally { server.close(); }
}

/* ================= C) the app ================= */
async function openApp(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchPage === "function" && typeof stLoadImage === "function" && typeof cmpFit === "function", null, { timeout: 30000 });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}
const APP_RESULTS = async () => {
  const mk = (w, h, c1, c2) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) / 4, 0, 7); x.fill(); return c.toDataURL("image/png"); };
  const before = mk(600, 900, "#553", "#a86"), after = mk(600, 900, "#357", "#9bd");
  const b64 = (du) => du.split(",")[1];
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const wipe = (box, rg, lb, card) => ({ box: R(box), fit: Number(box.getAttribute("data-fit")), range: R(rg), lbls: R(lb), card: R(card), tab: box.getAttribute("tabindex"),
    cardPos: getComputedStyle(card).position, cardCap: parseFloat(getComputedStyle(card).maxHeight) || 0, cardSH: card.scrollHeight, cardCH: card.clientHeight, /* 6.117.0 — the sticky two-pane card */
    imgPE: getComputedStyle(box.querySelector("img")).pointerEvents, imgDrag: box.querySelector("img").draggable, handle: getComputedStyle(box.querySelector(".cmp-line"), "::after").width });
  const out = { vw: innerWidth, vh: innerHeight };
  switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 200));
  stLoadImage(before); await new Promise((r) => setTimeout(r, 700));
  stShowResult({ mime: "image/png", b64: b64(after) }); await new Promise((r) => setTimeout(r, 500));
  const box = document.getElementById("stCmp"), rg = document.getElementById("stCmpRange");
  out.st = wipe(box, rg, document.getElementById("stCmpLbls"), document.getElementById("stResultBox"));
  out.st.zoom = (document.getElementById("stZoomBtn").textContent || "").trim(); out.st.bl = (document.getElementById("stCmpBeforeLbl").textContent || "").trim(); out.st.al = (document.getElementById("stCmpAfterLbl").textContent || "").trim();
  out.st.canvasMaxH = getComputedStyle(document.getElementById("stCanvas")).maxHeight;
  rg.value = 50; stCmpLayout(); box.focus();
  box.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); box.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  out.st.keyVal = Number(rg.value); out.st.topW = document.getElementById("stCmpTop").style.width;
  box.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); out.st.homeVal = Number(rg.value);
  switchPage("pgRetouch"); await new Promise((r) => setTimeout(r, 200));
  state.refs[0] = { mime: "image/png", b64: b64(before), label: "x.png" }; state.hist = [{ mime: "image/png", b64: b64(after) }]; state.histSel = 0; state.result = state.hist[0];
  rsShowResult(); await new Promise((r) => setTimeout(r, 500));
  out.rs = wipe(document.getElementById("rsCmp"), document.getElementById("rsCmpRange"), document.getElementById("rsCmpLbls"), document.getElementById("rsResultBox"));
  switchPage("pgCreate"); await new Promise((r) => setTimeout(r, 200));
  document.getElementById("resultBox").className = "card result-box on"; state.cmpBase = null; refreshCmp(); document.getElementById("cmpWrap").style.display = ""; cmpLayout();
  await new Promise((r) => setTimeout(r, 400)); cmpLayout();
  out.ff = wipe(document.getElementById("cmpBox"), document.getElementById("cmpRange"), null, document.getElementById("resultBox"));
  switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 300));
  return out;
};
async function settle(page, sel) {
  let last = null;
  for (let i = 0; i < 20; i++) {
    const top = await page.evaluate((q) => Math.round(document.querySelector(q).getBoundingClientRect().top), sel);
    if (last !== null && top === last) return top;
    last = top; await page.waitForTimeout(150);
  }
  return last;
}
async function appWalk(browser) {
  for (const vp of [{ w: 1440, h: 900, tag: "a 1440×900 desk" }, { w: 1920, h: 1000, tag: "a 1920×1000 monitor" }]) {
    const { ctx, page, errs } = await openApp(browser, vp.w, vp.h);
    const m = await page.evaluate(APP_RESULTS);
    const wantH = vp.h - CMP_CHROME, wantW = Math.round(wantH * 600 / 900);
    const fitted = (s) => s.fit === wantW && near(s.box.w, wantW, 2) && s.box.h <= wantH + 2 && s.box.h >= wantH - 4 && near(s.range.w, s.box.w, 2) && (!s.lbls || near(s.lbls.w, s.box.w, 2)) &&
      near(s.box.x - s.card.x, (s.card.x + s.card.w) - (s.box.x + s.box.w), 3) && s.card.w > s.box.w + 100;
    /* 6.117.0 — wave B2 put the Freeform result in a sticky column beside the controls (from 1200px): the wipe
       takes what the card's own ceiling (window − header − 24px) leaves after the card's other content, measured,
       so the whole card stays in view and never scrolls inside; Retouch A and V2 keep the (height − 300) fit. */
    const paneFit = (s) => { const other = s.cardSH - s.box.h, budget = Math.min(wantH, s.cardCap - other - 8), w = Math.round(budget * 600 / 900);
      return s.cardPos === "sticky" && s.cardCap > 0 && near(s.fit, w, 1) && near(s.box.w, w, 2) && s.cardSH <= s.cardCH + 1 && near(s.range.w, s.box.w, 2) &&
        near(s.box.x - s.card.x, (s.card.x + s.card.w) - (s.box.x + s.box.w), 3) && s.card.w > s.box.w + 30; };
    report(`C1) ${vp.tag}: the Retouch A and V2 wipes of a 600×900 result are (height − 300) tall and 2/3 of that wide, centred in a card wider than that, the range and the label row the same width; the Freeform wipe fits its sticky two-pane card (6.117.0) without an inner scroll`,
      fitted(m.st) && fitted(m.rs) && paneFit(m.ff), { st: m.st, rs: m.rs, ff: m.ff, want: { wantW, wantH } });
    report(`C2) ${vp.tag}: the wipe is a control — the pictures take no pointer and cannot be dragged as images, the grip is 44px, the box is focusable, → → moves 50 → 54 and Home to 0; Retouch A/B's result says Before · Zoom · After`,
      m.st.imgPE === "none" && m.st.imgDrag === false && m.st.handle === "44px" && m.st.tab === "0" && m.st.keyVal === 54 && m.st.topW === "54%" && m.st.homeVal === 0 &&
      m.st.zoom.length > 1 && m.st.bl.length > 1 && m.st.al.length > 1 && m.rs.imgPE === "none" && m.rs.handle === "44px", { st: m.st });
    report(`C3) ${vp.tag}: the live-preview stage in the left column may stand (window − 320px) tall`,
      m.st.canvasMaxH === (vp.h - 320) + "px", m.st.canvasMaxH);
    /* a real mouse: press at 30% of the picture, drag to 72% — the wipe follows the pointer.
       stShowResult started a SMOOTH scroll to the result card; wait until the box stands still. */
    await page.evaluate(() => { document.getElementById("stCmpRange").value = 50; stCmpLayout(); });
    await settle(page, "#stCmp");
    await page.evaluate(() => { document.getElementById("stCmp").scrollIntoView({ block: "center" }); });
    await settle(page, "#stCmp");
    const bb = await (await page.$("#stCmp")).boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.30, bb.y + bb.height * 0.5); await page.mouse.down();
    await page.mouse.move(bb.x + bb.width * 0.50, bb.y + bb.height * 0.5, { steps: 4 });
    await page.mouse.move(bb.x + bb.width * 0.72, bb.y + bb.height * 0.5, { steps: 6 });
    const during = await page.evaluate(() => ({ v: Number(document.getElementById("stCmpRange").value), top: document.getElementById("stCmpTop").style.width, line: document.getElementById("stCmpLine").style.left }));
    await page.mouse.up();
    report(`C4) ${vp.tag}: a mouse press at 30% of the picture and a drag to 72% leaves the wipe at 70–74% while the button is still down (no native image drag stole it)`,
      during.v >= 70 && during.v <= 74 && during.top === during.v + "%" && during.line === during.v + "%" && errs.length === 0, { during, bb: { w: Math.round(bb.width), h: Math.round(bb.height) }, errs });
    await ctx.close();
  }
  const { ctx, page, errs } = await openApp(browser, 390, 844);
  const m = await page.evaluate(APP_RESULTS);
  const colWide = (s) => s.fit > s.box.w && near(s.range.w, s.box.w, 2) && s.box.w >= s.card.w - 40 && s.box.w <= s.card.w;
  report("C5) a 390×844 phone: the fit would be wider than the column, so the wipes stay column-wide (Retouch A, V2, Freeform) — nothing shrinks on a phone; no page error",
    colWide(m.st) && colWide(m.rs) && colWide(m.ff) && m.st.handle === "44px" && errs.length === 0, { st: m.st, rs: m.rs, ff: m.ff, errs });
  await ctx.close();
}

/* ================= D) the release ================= */
function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.117.0 — this wave shipped as 6.116.0 / 6.187.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`D1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING, "6.115.0") && !has(LANDING, "6.186.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`D2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — title and story in all nine languages, pointing at Retouch A — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgMeitu" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("D3) CI runs this test right after the wave B1 band and the landing says how many tests the suite runs (258 when this wave shipped, 259 since 6.117.0 added verify_ux_wave_6117, 260 since 6.118.0 added verify_ux_wave_6118)",
    has(CI, "run: node test/verify_ux_wave_6115.js\n") && has(CI, "run: node test/verify_ux_wave_6116.js") && CI.indexOf("verify_ux_wave_6115") < CI.indexOf("verify_ux_wave_6116") &&
    (CI.match(/node test\//g) || []).length === 260 && has(LANDING, "260 tests") && !has(LANDING, "257 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    await panelWalk(browser);
    await appWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — a wide panel lays the studio in two columns and a page with a result in two panes; on every surface the result fits the screen and the wipe drags from anywhere");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
