/* v6.9.0 — THE APP FILLS A MONITOR.
 *
 * WHY THIS FILE EXISTS. The owner photographed the web app on a wide ASUS
 * monitor: a phone-shaped column in the middle, dark gutters wider than the
 * content. Layer 2 (v5.46) capped .wrap at 1160px — 60% of a 1920 screen and
 * ~45% of a 2560 one. A desktop layout that a real desk never sees is not a
 * desktop layout, so this measures the column as a share of the viewport at
 * the sizes students actually own, and pins that nothing overflows sideways.
 *
 * Usage: serve docs/app on 8931, then  node test/verify_desktop_fill.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { withPremium } = require("./_seed_premium.js");
const ROOT = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PORT = process.env.PORT || 8931;
let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
}

/* ---- A) the rule exists and the lower layers are untouched ---- */
check("A) a ≥1440px layer lets the column follow the screen, and QHD gets its own cap",
  /@media\(min-width:1440px\)\{[\s\S]*?\.wrap\{max-width:min\(1720px,94vw\)\}/.test(APP) &&
  /@media\(min-width:2200px\)\{[\s\S]*?\.wrap\{max-width:min\(2040px,92vw\)\}/.test(APP),
  "no 1440px layer, or the column is still a fixed pixel cap");
check("A2) the phone base rule is byte-for-byte what sweep_v528_safearea pins",
  /\.wrap\{max-width:760px;margin:0 auto;padding:0 calc\(16px \+ var\(--sa-r\)\) 0 calc\(16px \+ var\(--sa-l\)\)\}/.test(APP),
  "the base .wrap rule changed — the phone layout is not this wave's to touch");
check("A3) the 1024 and 1200 layers still carry their own caps",
  /@media\(min-width:1024px\)\{[\s\S]*?\.wrap\{max-width:980px\}/.test(APP) &&
  /@media\(min-width:1200px\)\{[\s\S]*?\.wrap\{max-width:1160px\}/.test(APP),
  "an intermediate desktop layer lost its cap");
check("A4) the wide grids keep the minmax(0,1fr) floor sweep_v492_gridfit taught",
  /repeat\(4,minmax\(0,1fr\)\)/.test(APP) && /repeat\(5,minmax\(0,1fr\)\)/.test(APP),
  "a wide .wfgrid rule uses bare 1fr — the min-content trap comes back");

/* ---- B) measured, at the desks students own ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const want = { 1366: 85, 1920: 90, 2560: 78 }; /* column as % of the viewport, at least */
    for (const w of [1366, 1920, 2560]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", e => errs.push(String(e).slice(0, 140)));
      await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const m = await page.evaluate(() => {
        const r = document.querySelector(".wrap").getBoundingClientRect();
        switchPage("pgDash");
        const dg = document.querySelector("#pgDash .dash-grid") || document.querySelector(".dash-grid");
        const dashCols = dg ? getComputedStyle(dg).gridTemplateColumns.split(" ").length : 0;
        switchPage("pgWf");
        const wf = document.querySelector("#pgWf .wfgrid") || document.querySelector(".wfgrid");
        return {
          pct: Math.round(r.width / innerWidth * 100),
          wfCols: wf ? getComputedStyle(wf).gridTemplateColumns.split(" ").length : 0,
          dashCols,
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });
      check(`B) at ${w}px the column is at least ${want[w]}% of the screen`, m.pct >= want[w], JSON.stringify(m));
      check(`B2) at ${w}px nothing scrolls sideways and no page error`, !m.overflow && errs.length === 0, JSON.stringify({ overflow: m.overflow, errs }));
      if (w >= 1920) check(`B3) at ${w}px the Smart Workflow grid shows ${w >= 1800 ? 5 : 4} columns`, m.wfCols === (w >= 1800 ? 5 : 4), JSON.stringify(m));
      /* the Home tiles are declared beside their 768px rule on purpose — a
         copy inside the desktop layer lost to it on equal specificity and the
         2560 screenshot still showed four tiles across */
      if (w >= 1800) check(`B4) at ${w}px Home shows six tiles across`, m.dashCols === 6, JSON.stringify(m));
      await ctx.close();
    }
    /* ---- D) every page's banner keeps a banner's shape on a monitor ----
       The owner's screenshot: at 2560 the greeting plate was a 7:1 sliver
       with the model cut off at the eyes. Plates are 1600x800; a box wider
       than ~4.6:1 throws away more than half the picture, a box squarer than
       3:1 is a poster, not a banner. Measured on every page that has one. */
    for (const w of [1920, 2560]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 1200 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const D = await page.evaluate(async () => {
        const out = [];
        const pages = [...document.querySelectorAll(".page")].map(p => p.id).filter(Boolean);
        for (const id of pages) {
          try { switchPage(id); } catch (e) { continue; }
          await new Promise(r => setTimeout(r, 60));
          const el = document.querySelector("#" + id + " .page-hero, #" + id + " .dash-greet, #" + id + " .hero-mini");
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 100) continue;
          out.push({ id, w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(2) });
        }
        return out;
      });
      const bad = D.filter(b => b.ratio > 4.6 || b.ratio < 3.0);
      check(`D) at ${w}px every page banner keeps a banner's shape (3:1 … 4.6:1) — ${D.length} banners measured`,
        D.length >= 8 && bad.length === 0, JSON.stringify(bad.length ? bad : D).slice(0, 280));
      await ctx.close();
    }

    /* the phone is exactly what it was */
    const ph = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await ph.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
    await ph.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await ph.waitForTimeout(1500);
    /* measured on the page that is actually SHOWING the grid: a hidden grid's
       computed columns are its specified value ("minmax(0, 1fr) minmax(0, 1fr)"),
       which splits into four tokens and would fail this for the wrong reason */
    const p = await ph.evaluate(() => {
      switchPage("pgWf");
      const g = document.querySelector("#pgWf .wfgrid") || document.querySelector(".wfgrid");
      return { w: Math.round(document.querySelector(".wrap").getBoundingClientRect().width),
               cols: g ? getComputedStyle(g).gridTemplateColumns.split(" ").length : 0 };
    });
    check("C) a phone still gets its full-width column and two-column grid", p.w === 390 && p.cols === 2, JSON.stringify(p));
    await ph.close();
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed — the studio fills the monitor it is opened on, and the phone is untouched.");
  process.exit(failures ? 1 : 0);
})();
