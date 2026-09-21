/* 6.115.0 — DESKTOP LAYER 4: THE RAIL AND THE BAND.
   Owner (2026-09-20, the UI/UX programme): every page professional on every computer.
   The 1440px audit sheet of wave A showed the web app as a phone shell stretched wide —
   the five sections in a floating dock at the BOTTOM of a 900px window, and on every
   page a 317px hero banner (422px at 1920) whose cover crop kept a third of the 2:1
   plate: the fold's biggest object, saying the least.

   WHAT SHIPS. From 1200px:
     THE RAIL — the tab bar is a fixed left rail the height of the window (200px, 232px
     from 1800px); the header and the column move right by that width through body
     padding, so the sticky header, the toast box and the GENERATE docks keep their own
     geometry. Each section is a 44px row with its icon; the active row carries a gold
     bar on its left edge; the NEW dot sits at the row's end. body.wall still hides it.
     THE BAND — every hero (.page-hero on fifteen pages, the Workflows .hero-mini, Home's
     .dash-greet) is a two-cell band: the words on the left on the panel's own ink, the
     WHOLE 2:1 plate on the right (its width is twice the band's height, so nothing is
     cropped), a seam fade joining them. 236px tall at 1200, 260 at 1440, 300 at 1800,
     340 at 2200 — the fold gives back 80–120px on every page.
     The docks that held 76px clear of the thumb bar sit 12px up; pgTalk's card joins the
     centred single-flow list it was missing from.
   The phone and the 768/1024 layers are untouched: below 1200px the dock is where it was
   and every hero is the stacked full-width band wave A measured.

   HOW IT IS MEASURED. A — the rules, pinned, and the lower layers' rules still there.
   B — the rail at 1280 / 1440 / 1920: geometry, five 44px rows, the active marker,
   aria-current, the header and column start after it, a rail click changes the page,
   nothing scrolls sideways. C — the band on every page with a hero at 1440 and 1920:
   the header's height, the picture box (2:1 ±5%, the band's height, on the right
   edge), the words inside their own cell, the text cell read from PIXELS at L ≤ .15.
   D — the phone (390) and a 1024 tablet keep the dock at the bottom and the stacked
   hero. E — the release pins: 6.115.0 / panel 6.186.0 in lockstep, the What's New row
   in nine languages on both surfaces, CI runs this test as the 257th `node test/`
   invocation and the landing says 257 tests.
   Fault-injected while it was written: the rail rule removed fails A1 and B; the
   band's picture rule removed fails C (the picture box goes back to the header's width).

   Usage: serve docs/app on 8931, then  node test/verify_ux_wave_6115.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const APP_PAGES = ["pgHome", "pgDash", "pgCreate", "pgWf", "pgImagine", "pgMeitu", "pgEvoto", "pgRetouch", "pgPath", "pgVideo", "pgVideoUp", "pgV2V", "pgTalk", "pgText2Img", "pgLib", "pgGallery", "pgAlbum", "pgAccount", "pgTutorials"];
const VER = "6.115.0", PVER = "6.186.0";
const TEXT_CELL_MAX_L = 0.15;   /* relative luminance of the text cell — the panel ink (#131826) reads ~.01; cream type over it is ≥ 12:1 */

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const has = (s, t) => s.indexOf(t) >= 0;

/* ================= A) the source ================= */
function sourcePins() {
  report("A1) THE RAIL — from 1200px the tab bar is a fixed full-height left rail (200px; 232px from 1800px) and the body moves right by that width; the v5.46 floating dock rule is gone; body.wall still hides the bar",
    has(APP, "@media(min-width:1200px){\n  body{padding-left:200px;padding-bottom:28px}\n  .tabbar{top:0;bottom:0;left:0;right:auto;width:200px;transform:none;flex-direction:column;justify-content:flex-start;align-items:stretch;gap:4px;padding:18px 10px 16px;border:0;border-right:1px solid var(--line);border-radius:0;box-shadow:none;overflow-x:hidden;overflow-y:auto;background:rgba(11,13,20,.97)}") &&
    has(APP, ".tabb{flex:0 0 auto;flex-direction:row;justify-content:flex-start;align-items:center;gap:12px;width:100%;min-width:0;min-height:44px;padding:10px 12px 10px 14px;border-radius:10px;font-size:13px;letter-spacing:.01em;text-align:left;white-space:normal}") &&
    has(APP, ".tabb.on{background:rgba(217,164,65,.12)}") &&
    has(APP, ".tabb::before{top:9px;bottom:9px;left:0;width:3px;height:auto;margin:0;border-radius:2px;background:var(--gold);transform:scaleY(.35);transform-origin:center}") &&
    has(APP, ".tabb .nw-dot{top:50%;right:12px;margin-top:-4px}") &&
    has(APP, "@media(min-width:1800px){\n  body{padding-left:232px}\n  .tabbar{width:232px}") &&
    !has(APP, ".tabbar{left:50%;right:auto;bottom:18px") && !has(APP, "body{padding-bottom:112px}") &&
    has(APP, "body.wall .tabbar{display:none}"), null);

  report("A2) THE BAND — every hero is a two-cell band from 1200px: the header at --hero-h (236 / 260 / 300 / 340), the picture cell 2 × that height on the right, the seam fade over the picture only, the greeting's CSS art held at auto 100% on the right; the 6.9.0 growth rules (clamp(260px,22vw,460px)) are gone",
    has(APP, ".page-hero,.hero-mini,.dash-greet{--hero-h:236px;--hero-pic:calc(var(--hero-h)*2);min-height:var(--hero-h);justify-content:center;gap:6px;padding:20px calc(var(--hero-pic) + 28px) 20px 26px;background:var(--panel);animation:none}") &&
    has(APP, ".hero-mini{isolation:isolate}") &&
    has(APP, ".dash-greet{background-color:var(--panel);background-size:auto 100%;background-position:right center;background-repeat:no-repeat}") &&
    has(APP, ".page-hero>img,.page-hero>video.ph-motion,.hero-mini .hero-art,.dash-greet video.greet-motion{left:auto;right:0;width:var(--hero-pic)}") &&
    has(APP, '.page-hero:after,.hero-mini .hero-art:after,.dash-greet::before,.dash-greet[data-art="evening"]::before{left:auto;right:0;width:var(--hero-pic);background:linear-gradient(90deg,var(--panel) 0%,') &&
    has(APP, ".page-hero .ph-kick,.page-hero .ph-head,.hero-strip .kick,.hero-strip h1,.hero-strip .lede,.dash-greet .hi,.dash-greet .sub,.dash-greet .wx{max-width:none}") &&
    has(APP, "@media(min-width:1440px){\n  .page-hero,.hero-mini,.dash-greet{--hero-h:260px}\n}") &&
    has(APP, "  .page-hero,.hero-mini,.dash-greet{--hero-h:300px}\n}") &&
    has(APP, "@media(min-width:2200px){\n  .page-hero,.hero-mini,.dash-greet{--hero-h:340px}\n}") &&
    !has(APP, "clamp(260px,22vw,460px)") && !has(APP, ".page-hero{min-height:208px}"), null);

  report("A3) the lower layers are what wave A measured — the phone tab bar rule, the 126px hero floor, the 768px hero rule, the .wrap caps at 1024 / 1200 / 1440 / 2200",
    has(APP, ".tabbar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;overflow-x:auto;") &&
    has(APP, ".page-hero{position:relative;min-height:126px;margin:var(--sp-3) 0 var(--sp-3);") &&
    has(APP, "@media (min-width:768px){.page-hero{min-height:172px;padding:16px 20px 14px}}") &&
    has(APP, ".hero-mini{margin:var(--sp-3) 0;padding:0 14px 10px;min-height:126px;") &&
    /@media\(min-width:1024px\)\{[\s\S]*?\.wrap\{max-width:980px\}/.test(APP) && /@media\(min-width:1200px\)\{[\s\S]*?\.wrap\{max-width:1160px\}/.test(APP) &&
    /@media\(min-width:1440px\)\{[\s\S]*?\.wrap\{max-width:min\(1720px,94vw\)\}/.test(APP) && /@media\(min-width:2200px\)\{[\s\S]*?\.wrap\{max-width:min\(2040px,92vw\)\}/.test(APP), null);

  report("A4) the docks that cleared the thumb bar sit 12px up on a desk, the toast box centres in the column beside the rail, and pgTalk's card joins the centred single-flow list at 880 / 1120",
    has(APP, "#btnRsGen,#btnGen,#btnVidGen,#btnVuGen,#btnT2IGen,.st-genbar,#ptRunCard.pt-sticky{bottom:12px}") &&
    has(APP, ".toast{left:calc(216px + var(--sa-l));bottom:24px}") && has(APP, ".toast{left:calc(248px + var(--sa-l))}") &&
    has(APP, "#pgV2V>.card,#pgTalk>.card,#pgRetouch>.card,#pgCreate>.card,#pgGallery>.card,#pgText2Img>.result-box,#pgCreate>.result-box,#pgTalk>.result-box{max-width:880px;margin-left:auto;margin-right:auto}") &&
    has(APP, "#pgV2V>.card,#pgTalk>.card,#pgRetouch>.card,#pgCreate>.card,#pgGallery>.card,#pgText2Img>.result-box,#pgCreate>.result-box,#pgTalk>.result-box{max-width:1120px}"), null);
}

/* ================= the desk ================= */
async function openApp(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  return { ctx, page, errs };
}

/* the band behind the words, read from pixels: the text cell is the header minus the picture cell */
async function textCellL(page) {
  const geo = await page.evaluate(() => {
    const pg = document.querySelector(".page.on"); const hero = pg && pg.querySelector(".page-hero,.hero-mini,.dash-greet"); if (!hero) return null;
    window.scrollTo(0, 0);
    const h = hero.getBoundingClientRect();
    const pic = hero.querySelector(":scope > img, :scope > .hero-art, :scope > video.greet-motion");
    const picW = pic ? pic.getBoundingClientRect().width : h.height * 2;
    return { clip: { x: h.left + 4, y: h.top + 4, width: Math.max(10, h.width - picW - 40), height: h.height - 8 } };
  });
  if (!geo) return null;
  const png = await page.screenshot({ clip: geo.clip });
  return page.evaluate(async (b64) => {
    const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode();
    const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const g = cv.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height).data; let L = 0, n = 0;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) { L += 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]); n++; }
    return +(L / n).toFixed(3);
  }, png.toString("base64"));
}

/* ================= B) the rail ================= */
async function railWalk(browser) {
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1000]]) {
    const { ctx, page, errs } = await openApp(browser, w, h);
    const m = await page.evaluate(() => {
      const bar = document.querySelector(".tabbar"), r = bar.getBoundingClientRect();
      const tabs = Array.from(bar.querySelectorAll(".tabb")).map((b) => { const t = b.getBoundingClientRect(); return { x: Math.round(t.left), y: Math.round(t.top), w: Math.round(t.width), h: Math.round(t.height), on: b.classList.contains("on"), cur: b.getAttribute("aria-current") }; });
      const on = bar.querySelector(".tabb.on"); const bcs = on && getComputedStyle(on, "::before");
      const nav = document.querySelector(".nav").getBoundingClientRect(), wrap = document.querySelector("main.wrap").getBoundingClientRect();
      return { rail: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, tabs, bodyPad: getComputedStyle(document.body).paddingLeft,
        marker: bcs ? { w: bcs.width, opacity: bcs.opacity, transform: bcs.transform } : null, navLeft: Math.round(nav.left), wrapLeft: Math.round(wrap.left), wrapW: Math.round(wrap.width),
        overflow: document.documentElement.scrollWidth - innerWidth, innerH: innerHeight };
    });
    const railW = w >= 1800 ? 232 : 200;
    const stacked = m.tabs.every((t, i) => i === 0 || t.y >= m.tabs[i - 1].y + m.tabs[i - 1].h - 1);
    report(`B1) at ${w}px the tab bar is a left rail ${railW}px wide, the window's full height, from the top-left corner`, m.rail.x === 0 && m.rail.y === 0 && m.rail.w === railW && m.rail.h >= m.innerH - 1 && m.bodyPad === railW + "px", m.rail);
    report(`B2) at ${w}px the five sections are stacked rows inside the rail, each at least 44px tall and 160px wide, one of them active with aria-current=page and a 3px gold bar`,
      m.tabs.length === 5 && stacked && m.tabs.every((t) => t.h >= 44 && t.w >= 160 && t.x >= 0 && t.x + t.w <= railW) && m.tabs.filter((t) => t.on).length === 1 && m.tabs.find((t) => t.on).cur === "page" && !!m.marker && m.marker.w === "3px" && m.marker.opacity === "1" && m.marker.transform !== "none" && !/0\.35/.test(m.marker.transform), { tabs: m.tabs, marker: m.marker });
    report(`B3) at ${w}px the header and the column start after the rail and nothing scrolls sideways`, m.navLeft >= railW && m.wrapLeft >= railW && m.wrapW >= 900 && m.overflow <= 0 && errs.length === 0, { navLeft: m.navLeft, wrapLeft: m.wrapLeft, wrapW: m.wrapW, overflow: m.overflow, errs });
    if (w === 1440) {
      /* a rail row is the way to another section: the second row is Workflows */
      const before = await page.evaluate(() => document.querySelector(".page.on").id);
      await page.click(".tabbar .tabb:nth-child(2)");
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ id: document.querySelector(".page.on").id, on: Array.from(document.querySelectorAll(".tabbar .tabb")).findIndex((b) => b.classList.contains("on")) }));
      report("B4) at 1440px a click on the rail's second row opens the Workflows page and moves the active bar to that row", after.id === "pgWf" && after.on === 1 && before !== "pgWf", { before, after });
    }
    await ctx.close();
  }
}

/* ================= C) the band ================= */
async function bandWalk(browser) {
  for (const [w, h, want] of [[1440, 900, 260], [1920, 1000, 300]]) {
    const { ctx, page, errs } = await openApp(browser, w, h);
    const rows = [];
    for (const id of APP_PAGES) {
      const g = await page.evaluate(async (pid) => {
        switchPage(pid); window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 160));
        const pg = document.getElementById(pid); const hero = pg.querySelector(":scope > .page-hero, :scope > .hero-mini, :scope > .dash-greet"); if (!hero) return null;
        const r = hero.getBoundingClientRect();
        const pic = hero.querySelector(":scope > img, :scope > .hero-art, :scope > video.greet-motion");
        const cs = getComputedStyle(hero);
        let p = null;
        if (pic) { const q = pic.getBoundingClientRect(); p = { w: Math.round(q.width), h: Math.round(q.height), right: Math.round(r.right - q.right), left: Math.round(q.left) }; }
        else if (cs.backgroundSize === "auto 100%") { p = { w: Math.round(r.height * 2), h: Math.round(r.height), right: 0, left: Math.round(r.right - r.height * 2), css: cs.backgroundPosition }; }
        const words = hero.querySelector(".ph-head, h1, .hi"); const t = words && words.getBoundingClientRect();
        return { id: pid, w: Math.round(r.width), h: Math.round(r.height), pic: p, words: t ? { right: Math.round(t.right), fs: parseFloat(getComputedStyle(words).fontSize), lines: Math.round(t.height / parseFloat(getComputedStyle(words).lineHeight)) } : null };
      }, id);
      if (!g) continue;
      g.L = await textCellL(page);
      rows.push(g);
    }
    const bad = rows.filter((g) => !(g.h >= want && g.h <= want + 60 && g.pic && Math.abs(g.pic.w / g.pic.h - 2) <= 0.1 && Math.abs(g.pic.h - g.h) <= 3 && g.pic.right <= 2 && g.words && g.words.right <= g.pic.left + 8 && g.words.fs >= 22 && g.L !== null && g.L <= TEXT_CELL_MAX_L));
    report(`C1) at ${w}px every page with a hero (${rows.length} of ${APP_PAGES.length}) is a ${want}px band: the whole 2:1 plate on the right edge at the band's full height, the words in their own cell at ≥ 22px, and that cell reads from pixels at L ≤ ${TEXT_CELL_MAX_L}`,
      rows.length >= 17 && bad.length === 0, bad.length ? bad : rows.slice(0, 4));
    report(`C2) at ${w}px the three hero kinds are all measured — .page-hero (pgCreate), .hero-mini (pgWf) and .dash-greet (pgDash) — and no page error during the walk`,
      ["pgCreate", "pgWf", "pgDash"].every((id) => rows.some((g) => g.id === id)) && errs.length === 0, errs);
    await ctx.close();
  }
}

/* ================= D) the phone and the tablet are what they were ================= */
async function lowerLayers(browser) {
  for (const [w, h, label] of [[390, 844, "phone"], [1024, 768, "tablet"]]) {
    const { ctx, page, errs } = await openApp(browser, w, h);
    const m = await page.evaluate(() => {
      const bar = document.querySelector(".tabbar").getBoundingClientRect();
      switchPage("pgCreate"); window.scrollTo(0, 0);
      const hero = document.querySelector("#pgCreate .page-hero").getBoundingClientRect(), img = document.querySelector("#pgCreate .page-hero>img").getBoundingClientRect();
      return { bar: { top: Math.round(bar.top), h: Math.round(bar.height), w: Math.round(bar.width) }, bodyPad: getComputedStyle(document.body).paddingLeft, hero: { w: Math.round(hero.width), h: Math.round(hero.height) }, img: { w: Math.round(img.width), h: Math.round(img.height) }, innerH: innerHeight, innerW: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    report(`D) the ${label} (${w}px) keeps the dock at the bottom and the stacked full-width hero — no rail, no band below 1200px`,
      m.bar.top >= m.innerH - m.bar.h - 2 && m.bar.w === m.innerW && m.bodyPad === "0px" && Math.abs(m.img.w - m.hero.w) <= 4 && m.hero.h >= 126 && m.hero.h <= 220 && m.overflow <= 0 && errs.length === 0, m);
    await ctx.close();
  }
}

/* ================= E) the release ================= */
function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.116.0 — this wave shipped as 6.115.0 / 6.186.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (read("panel/main.js").match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`E1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING, "6.114.0") && !has(LANDING, "6.185.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`E2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — title and story in all nine languages, pointing at Home — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgHome" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("E3) CI runs this test right after the wave A floor and the landing says how many tests the suite runs (257 when this wave shipped, 258 since 6.116.0 added verify_ux_wave_6116, 259 since 6.117.0 added verify_ux_wave_6117, 260 since 6.118.0 added verify_ux_wave_6118, 261 since 6.119.0 added verify_ux_wave_6119, 262 since 6.120.0 added verify_ux_wave_6120)",
    has(CI, "run: node test/verify_ux_wave_6114.js\n") && has(CI, "run: node test/verify_ux_wave_6115.js") && CI.indexOf("verify_ux_wave_6114") < CI.indexOf("verify_ux_wave_6115") &&
    (CI.match(/node test\//g) || []).length === 262 && has(LANDING, "262 tests") && !has(LANDING, "256 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    await railWalk(browser);
    await bandWalk(browser);
    await lowerLayers(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — from 1200px the five sections are a left rail and every hero a two-cell band with its whole plate; the phone and the tablet are what wave A measured");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
