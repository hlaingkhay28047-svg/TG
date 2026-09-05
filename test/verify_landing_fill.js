/* v6.9.x — THE WEBSITE FILLS A MONITOR TOO.
 *
 * WHY THIS FILE EXISTS. After the web app learned to fill a desktop screen the
 * owner asked for the site as well — "website ကိုကော သေချာလုပ်ပေးပါ". Every
 * section below the hero sat in a 1120px column: 57% of a 1920 screen, 43% of
 * a 2560 one, with the two-up cinema duo at 537px a side. From 1440px the
 * column follows the screen (capped so a paragraph keeps a readable measure),
 * and QHD gets its own cap. This measures the real column as a share of the
 * viewport, on the page as served from disk, and pins that phones are exactly
 * what they were and nothing scrolls sideways.
 *
 * Usage: node test/verify_landing_fill.js  (no server needed — file://) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const LANDING = path.join(ROOT, "docs/index.html");
const SRC = fs.readFileSync(LANDING, "utf8");
let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${String(detail).slice(0, 320)}`}`);
  if (!ok) failures++;
}

/* ---- A) the rules, and the layers they must not disturb ---- */
check("A) the site's container keeps its phone/tablet rule byte-for-byte",
  /\.wrap\{max-width:1120px;margin:0 auto;padding:0 var\(--sp-4\)\}/.test(SRC),
  "the base .wrap rule changed — the phone and tablet layout is not this wave's to touch");
check("A2) a ≥1440px layer lets the column follow the screen, and QHD gets its own cap",
  /@media \(min-width:1440px\)\{[\s\S]*?\.wrap\{max-width:min\(1480px,90vw\)\}/.test(SRC) &&
  /@media \(min-width:2200px\)\{[\s\S]*?\.wrap\{max-width:min\(1680px,86vw\)\}/.test(SRC),
  "the desktop layer is missing or its caps moved");
check("A3) the before/after duo is released from its 900px cap on a monitor",
  /@media \(min-width:1440px\)\{[\s\S]*?\.ba-grid\{max-width:none\}/.test(SRC),
  "the .ba-grid 900px cap still holds at desktop widths");

/* ---- B) measured ---- */
(async () => {
  const browser = await chromium.launch();
  try {
    const url = "file://" + LANDING;
    /* the column as a share of the viewport, at least — the caps are a design
       choice (a paragraph must keep a readable measure), so QHD is 66%, not 90% */
    const want = { 1366: 78, 1920: 75, 2560: 62 };
    for (const w of [1366, 1920, 2560]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", e => errs.push(String(e).slice(0, 140)));
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const secs = [...document.querySelectorAll("section[id]")];
        const rows = secs.map(sec => {
          const kids = [...sec.children].filter(k => k.getBoundingClientRect().width > 100);
          const iw = kids.length ? Math.max(...kids.map(k => k.getBoundingClientRect().width)) : 0;
          return { id: sec.id, pct: Math.round(iw / innerWidth * 100) };
        }).filter(r => r.pct > 0);
        return { rows, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      /* the login card and the footer are deliberately narrower/full-bleed; the
         content sections are the ones that were a sliver */
      const content = m.rows.filter(r => !/^(login|home)$/.test(r.id));
      const narrow = content.filter(r => r.pct < want[w]);
      check(`B) at ${w}px every content section is at least ${want[w]}% of the screen — ${content.length} sections`,
        content.length >= 10 && narrow.length === 0, JSON.stringify(narrow.length ? narrow : content).slice(0, 300));
      check(`B2) at ${w}px nothing scrolls sideways and no page error`, !m.overflow && errs.length === 0,
        JSON.stringify({ overflow: m.overflow, errs }));
      await ctx.close();
    }
    /* the phone is exactly what it was: 390 - 2×16 padding = 358 */
    const ph = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await ph.goto(url, { waitUntil: "domcontentloaded" });
    await ph.waitForTimeout(800);
    const p = await ph.evaluate(() => {
      const sec = document.getElementById("features");
      const kids = [...sec.children].filter(k => k.getBoundingClientRect().width > 100);
      return { w: Math.round(Math.max(...kids.map(k => k.getBoundingClientRect().width))), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check("C) a phone still gets its full-width section and no sideways scroll", p.w === 358 && !p.overflow, JSON.stringify(p));
    await ph.close();
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed — the site fills the monitor it is opened on, and the phone is untouched.");
  process.exit(failures ? 1 : 0);
})();
