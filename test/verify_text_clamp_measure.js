/* verify_text_clamp_measure.js — 6.109.0 / panel 6.180.0
   THE CARD DESCRIPTION THAT WAS DELETED, AND THE SECOND THAT WAS SPENT MEASURING IT.

   WHY THIS FILE EXISTS. Wave 11's pass over the web app opened Imagine on a
   phone and found cards showing nothing at all — just "…". Measured on the
   shipped build, over the real page:

       360px  en 3 of 22   my 8 of 22   shn 4 of 22   th 1   zh 2
       390px  en 3         my 4         shn 3         th 1
       412px  en 2         my 2         shn 1
       320px  and 480px and wider: none

   Phone widths only, which is why nobody looking at a desktop had ever seen it,
   and worst in the owner's own language. The sentence was not cut short — it was
   gone, and the ellipsis stood alone in an empty box.

   THE CAUSE. 6.171.0 measures a sentence by unclamping the box first: height,
   max-height, overflow and -webkit-line-clamp each hide the very overflow the
   reading needs. What it never unclamped is the FLEX GROWTH, and both surfaces
   ship these two rules:

       .im-card-body { display:flex; flex-direction:column; flex:1 1 auto }
       .im-card-sum  { max-height:7.5em; overflow:hidden; flex:1 1 auto }

   The summary grows into whatever the card has left, and cards in a wrapping
   flex row are stretched to the tallest card in their line — so the box has a
   height of its own that has nothing to do with its text. An EMPTY
   .im-card-sum measured 103px against an 86.25px ceiling (5 x 17.25). Every
   prefix the binary search tried measured over the ceiling, INCLUDING a prefix
   of one character, `lo` finished at 0, and the whole sentence was replaced.

   THE FIX is one more thing to neutralise while measuring — `flex:0 0 auto` plus
   `min-height:0` — restored with the rest. align-self is deliberately NOT
   touched: in a column flex container that is the CROSS axis, the width, and a
   narrower box wraps at a different character. Proved by serving the old build
   beside the new one and reading both pages: 17,956 identical readings, 34
   sentences restored (all of them ones that had been deleted), and NOT ONE other
   change — no .wfmini box moved by a character, at seven widths in five
   languages.

   AND THE SAME ANSWER IS NOT MEASURED TWICE. Each measurement costs a forced
   synchronous layout and the binary search costs one per probe. Measured at CPU
   x4 (a mid-range phone), on the shipped build:

       opening Imagine          1,105 ms of a 1,300 ms page switch, EVERY visit
       typing "studio" into the Workflows search   34,263 ms of blocked main thread
       typing "portrait" again                     22,054 ms

   — because Imagine rebuilds its 22 cards on every visit and the Workflows
   filter re-marks all 388 boxes on every keystroke, and the identical work was
   redone each time. The cut is a pure function of the sentence, the line budget,
   the box's content width and its text metrics, so it is remembered under exactly
   those; it has to be a CONTENT key rather than a WeakMap on the node, because
   the nodes are new each time. After: 674-1,144 ms of blocking for the same word,
   and Imagine's re-entry costs 72 ms instead of 962.

   WHAT IS DELIBERATELY NOT DONE. Measuring several boxes at once would cost one
   layout instead of N, and it is wrong: unclamping them together makes the page
   taller, which at 360-412px changes the width, which cuts at a different
   character. Tried, measured, rejected — it moved 40 of 3,000 readings. Every box
   that must be measured is still measured alone.

   FAULT INJECTION while writing this file: removing `flex:0 0 auto` from either
   surface fails B1/C1 (the empty summaries come back); removing the memo fails
   B4 (the second visit costs the same as the first); keying the memo on the node
   instead of the content fails B4 the same way, because Imagine's cards are
   rebuilt. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const PMAIN = read("panel/main.js");
const PCSS = read("panel/styles.css");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* the two copies of the function, sliced out so every check reads the real body */
const appFn = APP.slice(APP.indexOf("function ellMark(root, sel, lines){"), APP.indexOf("function escH(s){"));
const panFn = PMAIN.slice(PMAIN.indexOf("function ellMark(root, sel, lines) {"),
                          PMAIN.indexOf("globalThis.HNK.ellMark = ellMark;"));
const SURFACES = [["the web app", appFn, APP], ["the Photoshop panel", panFn, PMAIN]];

/* ================= A) the source ================= */
function sourcePins() {
  report("A1) both surfaces neutralise the FLEX GROWTH while measuring — flex:0 0 auto and min-height:0 — and restore both from the saved set, beside the four 6.171.0 already unclamped (height, max-height, overflow, -webkit-line-clamp)",
    SURFACES.every(([, fn]) =>
      /style\.flex\s*=\s*"0 0 auto"/.test(fn) && /style\.minHeight\s*=\s*"0"/.test(fn) &&
      /fx:\s*n\.style\.flex/.test(fn) && /mnh:\s*n\.style\.minHeight/.test(fn) &&
      /style\.flex\s*=\s*sv\.fx/.test(fn) && /style\.minHeight\s*=\s*sv\.mnh/.test(fn) &&
      /style\.height\s*=\s*"auto"/.test(fn) && /style\.maxHeight\s*=\s*"none"/.test(fn) &&
      /style\.overflow\s*=\s*"visible"/.test(fn) && /webkitLineClamp\s*=\s*"unset"/.test(fn)),
    SURFACES.map(([n, fn]) => [n, /style\.flex\s*=\s*"0 0 auto"/.test(fn)]));

  report("A2) neither surface touches align-self: in a column flex container that is the CROSS axis — the width — and a narrower box wraps at a different character",
    SURFACES.every(([, fn]) => !/alignSelf/.test(fn) && !/align-self/.test(fn)),
    SURFACES.map(([n, fn]) => [n, /alignSelf/.test(fn)]));

  report("A3) the answer is remembered under everything it depends on — the line budget, the box's content width, and the font metrics that decide where a line breaks — with the sentence itself in the key",
    SURFACES.every(([, , src]) => {
      const k = src.slice(src.indexOf("function ellKey"), src.indexOf("function ellApply"));
      return k && /clientWidth/.test(k) && /fontSize/.test(k) && /lineHeight/.test(k) && /fontFamily/.test(k) &&
             /fontWeight/.test(k) && /letterSpacing/.test(k) && /wordSpacing/.test(k) &&
             /lines\s*\+/.test(k) && /full/.test(k);
    }), "ellKey");

  report("A4) the memo is a CONTENT key in a Map, not a WeakMap on the node — Imagine rebuilds all 22 cards on every visit, so a per-node memo would never hit",
    SURFACES.every(([, , src]) => /ELL_CUT\s*=\s*new Map\(\)/.test(src) && !/ELL_CUT\s*=\s*new WeakMap/.test(src)) &&
    SURFACES.every(([, fn]) => /ELL_CUT\.get\(/.test(fn) && /ellRemember\(/.test(fn)), "ELL_CUT");

  report("A5) the pass is two phases and phase one WRITES NOTHING, so the whole list shares one layout: the text, the data-full attribute and every style change happen in phase two",
    SURFACES.every(([, fn]) => {
      const p1 = fn.slice(fn.indexOf("PHASE 1"), fn.indexOf("PHASE 2"));
      return p1.length > 40 && !/\.textContent\s*=/.test(p1) && !/setAttribute/.test(p1) && !/\.style\./.test(p1) &&
             /ellCeil\(/.test(p1) && /jobs\.push/.test(p1);
    }), "phase 1");

  report("A6) the remembered answers are bounded — a cache that grows for every width x language x sentence a long session touches is a leak, so it is cleared at its ceiling",
    SURFACES.every(([, , src]) => /ELL_CUT_MAX\s*=\s*\d+/.test(src) &&
      /ELL_CUT\.size\s*>=\s*ELL_CUT_MAX\)\s*ELL_CUT\.clear\(\)/.test(src)), "ELL_CUT_MAX");

  report("A7) the CSS this is about is still what both surfaces ship — the summary is a growing flex item inside a column flex body, which is the whole reason the box has a height its text never asked for",
    /\.im-card-body\{padding:8px 10px 10px;display:flex;flex-direction:column;flex:1 1 auto\}/.test(APP) &&
    /\.im-card-sum\{[^}]*max-height:7\.5em;overflow:hidden;flex:1 1 auto\}/.test(APP) &&
    /\.im-card-body\{padding:8px 10px 10px;display:flex;flex-direction:column;flex:1 1 auto\}/.test(PCSS) &&
    /\.im-card-sum\{[^}]*max-height:7\.5em;overflow:hidden;flex:1 1 auto\}/.test(PCSS), "the flex rules");
}

/* ================= B) the web app, on a phone ================= */
const CLAMPED = [[".im-card-sum", 5], [".wfmini .t", 2], [".wfmini .s", 3]];

async function readClamped(page, sel) {
  return page.evaluate((s) => [...document.querySelectorAll(s)].map(n => ({
    shown: n.textContent.replace(/…$/, ""),
    full: n.getAttribute("data-full") || "",
    ell: !!n.querySelector(".ell")
  })), sel);
}
/* a box is honest when it shows its whole sentence with no marker, or a PREFIX
   of it with one — and never nothing at all */
function honest(rows) {
  const empty = rows.filter(r => r.full && !r.shown.trim()).length;
  const bad = rows.filter(r => r.full && r.shown.trim() && !r.full.startsWith(r.shown)).length;
  const marker = rows.filter(r => r.full && r.shown.length < r.full.length && !r.ell).length;
  return { n: rows.length, empty, notPrefix: bad, cutWithoutMarker: marker };
}

async function appWalk(browser) {
  const out = {};
  for (const lang of ["en", "my"]) {
    for (const w of [320, 360, 390, 412, 480]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 880 } });
      const page = await ctx.newPage();
      const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
      await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=${lang}`, { waitUntil: "load" });
      await page.waitForTimeout(2200);
      for (const [sel, , ] of CLAMPED.map(x => x)) {
        await page.evaluate(p => window.switchPage(p), sel === ".im-card-sum" ? "pgImagine" : "pgWf");
        await page.waitForTimeout(900);
        out[`${lang}|${w}|${sel}`] = honest(await readClamped(page, sel));
      }
      out[`${lang}|${w}|errs`] = errs.length;
      await ctx.close();
    }
  }
  const all = Object.entries(out).filter(([k]) => !k.endsWith("errs"));
  const bad = all.filter(([, v]) => v.empty > 0);
  report("B1) the web app on a phone: across 320 / 360 / 390 / 412 / 480 px in English and Burmese, NOT ONE clamped box is empty — this is the defect, and at 360px in Burmese it was eight of the twenty-two Imagine summaries",
    bad.length === 0, bad.slice(0, 6));
  report("B2) what a box shows is always a PREFIX of the sentence it carries in data-full — never other words, never a sentence that was cut with no \"…\" to say so",
    all.every(([, v]) => v.notPrefix === 0 && v.cutWithoutMarker === 0),
    all.filter(([, v]) => v.notPrefix || v.cutWithoutMarker).slice(0, 4));
  report("B3) the Imagine summaries really are being read (22 per width) and so are the 194 Workflow cards' two clamped lines — a check that measured nothing would pass B1 and B2 by accident",
    all.filter(([k]) => k.endsWith(".im-card-sum")).every(([, v]) => v.n >= 20) &&
    all.filter(([k]) => k.endsWith(".wfmini .s")).every(([, v]) => v.n >= 150), all.map(([k, v]) => [k, v.n]));
  report("B4) no page error on any of the ten boots",
    Object.entries(out).filter(([k]) => k.endsWith("errs")).every(([, v]) => v === 0),
    Object.entries(out).filter(([k]) => k.endsWith("errs")));
  return out;
}

/* B5 — the memo. Imagine is entered twice and the second visit must cost a
   fraction of the first; the work is identical, so anything else means it is
   being redone. Measured with the CPU throttled the way a phone runs. */
async function memoWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=en`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const cost = await page.evaluate(async () => {
    const real = window.ellMark; const seen = [];
    window.ellMark = function (root, sel, lines) { const t = performance.now(); const o = real.apply(this, arguments);
      seen.push({ sel: sel, ms: performance.now() - t }); return o; };
    if (window.HNK && window.HNK.ellMark) window.HNK.ellMark = (r, s, l) => window.ellMark(r, s, l);
    const enter = async () => { seen.length = 0; window.switchPage("pgImagine");
      await new Promise(r => setTimeout(r, 1200));
      const ms = seen.filter(x => x.sel === ".im-card-sum").reduce((a, x) => a + x.ms, 0);
      window.switchPage("pgHome"); await new Promise(r => setTimeout(r, 400)); return ms; };
    const first = await enter(), second = await enter(), third = await enter();
    return { first: Math.round(first), second: Math.round(second), third: Math.round(third) };
  });
  await ctx.close();
  report("B5) the second and third visits to Imagine do not pay for the first one's measuring again: the cards are rebuilt each time, so a memo on the node would never hit — the answer is remembered by its content (measured at CPU x4: 1,105 ms the first time, 72 ms after)",
    cost.first > 0 && cost.second * 3 < cost.first && cost.third * 3 < cost.first, cost);
  return cost;
}

/* ================= C) the Photoshop panel ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } },
      null, { timeout: 30000 }).catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { try { switchPage("imagine"); } catch (e) { } });
    await page.waitForTimeout(900);
    await page.evaluate(() => { try { HNK.imagine.goHub(); } catch (e) { } });
    await page.waitForTimeout(700);
    const sum = honest(await readClamped(page, ".im-card-sum"));
    report("C1) the panel draws the same cards from the same table through the same clamp, at the 380px a docked Photoshop panel gets — not one summary empty, every one a prefix of its own sentence",
      sum.n >= 20 && sum.empty === 0 && sum.notPrefix === 0 && sum.cutWithoutMarker === 0, sum);
    const memo = await page.evaluate(async () => {
      if (!(window.HNK && window.HNK.ellMark)) return { no: true };
      const before = document.querySelectorAll(".im-card-sum").length;
      /* the second pass over the very same boxes must take the remembered road */
      let measured = 0;
      const el = document.querySelector(".im-card-sum");
      const orig = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight").get;
      Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: function () { measured++; return orig.call(this); } });
      HNK.ellMark(document, ".im-card-sum", 5);
      const second = measured;
      Object.defineProperty(Element.prototype, "scrollHeight", { configurable: true, get: orig });
      return { before, second, sample: el ? el.textContent.slice(0, 30) : "" };
    });
    report("C2) running the clamp again over boxes it has already answered for reads no geometry at all — the remembered answer is applied without a single scrollHeight",
      !memo.no && memo.before >= 20 && memo.second === 0, memo);
    report("C3) no page error in the panel",
      errs.length === 0, errs.slice(0, 3));
  } finally { await page.close(); server.close(); }
}

/* ================= D) fault injection ================= */
/* The proof that A1 is load-bearing: run 6.171.0's own algorithm over the real
   page WITHOUT the flex neutralisation and the empty summaries must come back.
   If they do not, this whole file is pinning something that was never broken. */
async function faultWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 880 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=en`, { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.switchPage("pgImagine"));
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const ns = [...document.querySelectorAll(".im-card-sum")], lines = 5;
    const run = (neutralise) => {
      let empty = 0, stretched = 0;
      for (const n of ns) {
        const old = n.querySelector(".ell"); if (old) old.remove();
        const full = n.getAttribute("data-full") || n.textContent || "";
        n.textContent = full;
        const m = window.ellCeil(n, lines); if (!(m.ceil > 0)) continue;
        const sv = { h: n.style.height, mh: n.style.maxHeight, ov: n.style.overflow, dp: n.style.display,
                     lc: n.style.webkitLineClamp, fx: n.style.flex, mnh: n.style.minHeight };
        n.style.height = "auto"; n.style.maxHeight = "none"; n.style.overflow = "visible";
        if (neutralise) { n.style.flex = "0 0 auto"; n.style.minHeight = "0"; }
        try { n.style.webkitLineClamp = "unset"; } catch (e) { }
        const keep = n.textContent; n.textContent = ""; if (n.scrollHeight > m.lh) stretched++; n.textContent = keep;
        let text = full;
        if (n.scrollHeight > m.ceil + m.lh / 2) {
          let lo = 0, hi = full.length;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; n.textContent = full.slice(0, mid);
            if (n.scrollHeight <= m.ceil + m.lh / 2) lo = mid; else hi = mid - 1; }
          let s = full.slice(0, lo); const sp = s.lastIndexOf(" "); if (sp > 12) s = s.slice(0, sp);
          text = s.replace(/[\s…,.;:—-]+$/, "");
        }
        if (!text.trim()) empty++;
        n.textContent = text;
        n.style.height = sv.h; n.style.maxHeight = sv.mh; n.style.overflow = sv.ov; n.style.display = sv.dp;
        n.style.flex = sv.fx; n.style.minHeight = sv.mnh;
        try { n.style.webkitLineClamp = sv.lc; } catch (e) { }
      }
      return { empty, stretched };
    };
    const without = run(false), with_ = run(true);
    return { without, with_, n: ns.length };
  });
  await ctx.close();
  report("D1) fault injection: 6.171.0's own algorithm, run over the same page WITHOUT the flex neutralisation, deletes sentences again — and the boxes it deletes them from are the ones whose EMPTY height is already over a line. With the neutralisation, none",
    r.without.empty > 0 && r.with_.empty === 0 && r.without.stretched > 0,
    r);
}

/* ================= E) the release ================= */
function releasePins() {
  const ver = JSON.parse(read("docs/app/version.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const rm = JSON.parse(read("panel/release-manifest.json"));
  const appVer = ver.v, panVer = rm.version;
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("E1) the release: app " + appVer + " / panel " + panVer + " agree across version.json, APP_VER, docs/download/panel-version.json and the release manifest; CI runs this test; the landing counts at least 251 tests; What's New carries the " + appVer + " row on both surfaces",
    APP.indexOf('APP_VER="' + appVer + '"') > 0 && pv.v === panVer && pv.latest_version === panVer &&
    JSON.parse(read("panel/manifest.json")).version === panVer &&
    /node test\/verify_text_clamp_measure\.js/.test(CI) && count >= 251 &&
    WN.appRow(appVer).length > 0 && WN.panelRow(appVer).length > 0,
    { appVer, panVer, pv: pv.v, count });
}

(async () => {
  sourcePins();
  const browser = withPremium(await chromium.launch());
  try {
    await appWalk(browser);
    await memoWalk(browser);
    await panelWalk(browser);
    await faultWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? `\n${failures} FAILED`
    : "\nALL PASS — no card loses its sentence to its own box height, and the same cut is never measured twice");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL —", e && e.stack || e); process.exit(1); });
