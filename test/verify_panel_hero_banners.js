/* verify_panel_hero_banners.js — 6.96.1 / panel 6.167.1
   EVERY HERO BANNER IS THE SAME 126px BAND, ON EVERY PANEL PAGE.

   The owner, on the CCX: "V to V နဲ့ Talk Pages တွေရဲ့ hero banner ui ux က
   ccx မှာ ဖြတ်ခံရထားတယ် စစ်ပေးပြီး ပြင်ပေးပါ" — the Video→Video and Talking
   Photo banners were cut.

   ROOT CAUSE, measured in the panel harness at a 400px panel before the fix:
   twelve pages opened their banner with class="page-hero"; those two opened it
   with class="phero" — a name NO rule in panel/styles.css has ever matched.
   So the box was a plain static block (position static, min-height 0, overflow
   visible, radius 0) and the <img> drew at its NATURAL 772 x 248 inside a
   368px page: 404px of picture hanging off the right edge, which the host
   clips — the cut in the photograph. The kicker and the headline, which are
   position:relative, fell BELOW the picture (y 379 and 398) instead of sitting
   on the band's bottom edge, and the whole hero stood 322px tall instead of
   126px. The two names are one word apart and nothing on either surface was
   watching, so it shipped in 6.73.0 (V→V) and 6.75.1 (Talk) and survived every
   release since.

   THE FIX is that one word on two lines. THE GUARD is two checks that would
   each have caught it on the day:

     B) a rendered walk of all fourteen panel heroes at 320px and 400px: the
        band is 126px tall and no wider than its page, the picture is INSIDE
        that band (absolute, never overhanging), and the kicker and headline
        both sit inside the band's own box. A page whose hero is unstyled
        fails all three at once.
     C) a static read of panel/index.html: every element that carries a class
        must have at least one source of style — a class some rule mentions,
        or an id some rule mentions. This is exact for the panel because the
        panel's own UXP rule is class-and-id selectors only (no descendant or
        tag rules to hide behind), and the markup carries no inline style=
        that draws. It reports 0 today and reports exactly the offending line
        when the typo is put back.

   Fault-injected while writing: restoring class="phero" on either page fails
   C1 by name and line, and fails B1/B2/B3 for that page. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { unstyledElements } = require("./lib/dead-classes.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PIDX = read("panel/index.html");
const PCSS = read("panel/styles.css");
const PMAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

/* every panel route whose page opens with a banner, and the page it paints */
const HEROES = [
  ["setup", "pageSetup"], ["prompt", "pagePrompt"], ["imagine", "pageImagine"],
  ["meitu", "pageMeitu"], ["evoto", "pageEvoto"], ["retouch", "pageRetouch"],
  ["path", "pagePath"], ["create", "pageCreate"], ["video", "pageVideo"],
  ["vidup", "pageVideoUp"], ["v2v", "pageV2V"], ["talk", "pageTalk"],
  ["presets", "pagePresets"], ["gallery", "pageGallery"]
];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* ================= A) the source ================= */
function sourcePins() {
  const heroes = (PIDX.match(/<div class="page-hero">/g) || []).length;
  report("A1) every banner in the panel's markup opens with the styled class: fourteen .page-hero boxes and not one .phero (the name no rule matches)",
    heroes === 14 && PIDX.indexOf('class="phero"') < 0 && !/\.phero\b/.test(PCSS),
    { heroes, phero: PIDX.indexOf('class="phero"') });

  report("A2) the two pages the owner photographed carry the styled banner over their own baked art, with the app's kicker and headline inside it",
    /<div class="page-hero">\s*<img src="icons\/banners\/banner-v2v-portal\.jpg"[^>]*>\s*<div class="ph-kick">Video to Video<\/div>\s*<p class="ph-head" id="phV2V">/.test(PIDX) &&
    /<div class="page-hero">\s*<img src="icons\/banners\/banner-talk-photo\.jpg"[^>]*>\s*<div class="ph-kick">Talking Photo<\/div>\s*<p class="ph-head" id="phTalk">/.test(PIDX), null);

  report("A3) the rule those boxes now land on is unchanged: a 126px band, rounded and clipped, the picture absolutely filling it, the words on its bottom edge",
    /\.page-hero \{\s*position: relative;\s*min-height: 126px;/.test(PCSS) &&
    /overflow: hidden;\s*\n\s*display: flex; flex-direction: column; justify-content: flex-end;/.test(PCSS) &&
    /\.page-hero img \{\s*position: absolute; top: 0; left: 0;\s*width: 100%; height: 100%;\s*\}/.test(PCSS), null);

  report("A4) both pages carry the web app's own banner file and headline id, so the two surfaces show one picture and one sentence",
    APP.indexOf('src="lib/banners/banner-v2v-portal.jpg"') > 0 && APP.indexOf('id="phV2V"') > 0 &&
    APP.indexOf('src="lib/banners/banner-talk-photo.jpg"') > 0 && APP.indexOf('id="phTalk"') > 0 &&
    fs.existsSync(path.join(PANEL, "icons/banners/banner-v2v-portal.jpg")) &&
    fs.existsSync(path.join(PANEL, "icons/banners/banner-talk-photo.jpg")), null);

  report("A5) the routes the walk below visits are the panel's own — every page in PAGES that carries a banner",
    HEROES.every(([key, page]) => new RegExp('key: "' + key + '",\\s*page: "' + page + '"').test(PMAIN)), null);
}

/* ================= B) the rendered band, every page, two widths ================= */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const out = {};
  for (const W of [320, 400]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 1000 } });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    /* the banner JPEGs are the subject here, so only non-image traffic is stubbed */
    await page.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });
    const rows = [];
    for (const [key, pid] of HEROES) {
      await page.evaluate(k => switchPage(k), key);
      await page.waitForTimeout(700);
      rows.push(await page.evaluate((args) => {
        const [pid, key] = args;
        const R = e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b2: Math.round(b.bottom) }; };
        const pg = document.getElementById(pid);
        const hero = pg && pg.querySelector(".page-hero");
        if (!hero) return { key: key, pid: pid, noHero: true };
        const cs = getComputedStyle(hero), hb = R(hero), pb = R(pg);
        const img = hero.querySelector("img"), k = hero.querySelector(".ph-kick"), h = hero.querySelector(".ph-head");
        const o = { key: key, cls: hero.className, h: hb.h, minH: cs.minHeight, ov: cs.overflow, pos: cs.position,
          widerThanPage: hb.w > pb.w + 1, pageW: pb.w };
        if (img) { const ib = R(img);
          o.imgPos = getComputedStyle(img).position;
          o.imgOutside = Math.max(0, ib.r - hb.r) + Math.max(0, ib.b2 - hb.b2) + Math.max(0, hb.x - ib.x) + Math.max(0, hb.y - ib.y);
          o.imgW = ib.w; o.imgH = ib.h; }
        if (k) { const kb = R(k); o.kickInside = kb.y >= hb.y - 1 && kb.b2 <= hb.b2 + 1; }
        if (h) { const hh = R(h); o.headInside = hh.y >= hb.y - 1 && hh.b2 <= hb.b2 + 1; }
        return o;
      }, [pid, key]));
    }
    out[W] = { rows, errs };
    await ctx.close();
  }
  server.close();

  for (const W of [320, 400]) {
    const rows = out[W].rows;
    const noHero = rows.filter(r => r.noHero).map(r => r.key);
    report("B1) at " + W + "px all fourteen panel banners are the 126px band — none missing, none taller, none wider than its own page",
      noHero.length === 0 && rows.length === 14 &&
      rows.every(r => r.minH === "126px" && r.h >= 126 && r.h <= 132 && !r.widerThanPage && r.pos === "relative" && r.ov === "hidden"),
      rows.filter(r => r.noHero || r.minH !== "126px" || r.h > 132 || r.widerThanPage));
    report("B2) at " + W + "px every banner picture is absolutely placed INSIDE its band — not one pixel of it hangs off (the V→V and Talk pictures used to overhang by 404)",
      rows.every(r => r.imgPos === "absolute" && r.imgOutside === 0 && r.imgW <= r.pageW && r.imgH <= 132),
      rows.filter(r => r.imgPos !== "absolute" || r.imgOutside !== 0).map(r => ({ key: r.key, pos: r.imgPos, outside: r.imgOutside, w: r.imgW, h: r.imgH })));
    report("B3) at " + W + "px every kicker and headline sits ON its banner, never under it",
      rows.every(r => r.kickInside !== false && r.headInside !== false),
      rows.filter(r => r.kickInside === false || r.headInside === false).map(r => r.key));
  }
  report("B4) the two pages the owner photographed measure exactly like the twelve that were always right",
    [320, 400].every(W => {
      const by = {}; out[W].rows.forEach(r => { by[r.key] = r; });
      const ok = by.video;
      return ["v2v", "talk"].every(k => by[k] && by[k].h === ok.h && by[k].imgW === ok.imgW && by[k].imgH === ok.imgH && by[k].cls === ok.cls);
    }),
    { at400: out[400].rows.filter(r => ["v2v", "talk", "video"].indexOf(r.key) >= 0) });
  report("B5) no panel error on either width", out[320].errs.length === 0 && out[400].errs.length === 0,
    { a: out[320].errs, b: out[400].errs });
}

/* ================= C) the static guard ================= */
function deadClassScan() {
  const dead = unstyledElements(path.join(PANEL, "index.html"), path.join(PANEL, "styles.css"));
  report("C1) every element in the panel's markup has a source of style — a class a rule names, or an id a rule names. An unstyled box draws nothing, which is exactly how class=\"phero\" shipped twice",
    dead.length === 0, dead.slice(0, 10));
}

/* ================= D) the release ================= */
/* 6.96.2 — these pins read the tree instead of naming the version this test was
   written for. A pin that hardcodes its own wave turns the very next lockstep
   bump into a false alarm (this test did exactly that on 6.96.2, and
   verify_ui_tidy_696 had done it one wave earlier). What is pinned is the
   AGREEMENT between the seven places, and the presence of THIS subject's own
   What's New row — 6.96.1, the wave that fixed the two banners — which stays in
   the table as later rows are added above it. */
function releasePins() {
  const appVer = JSON.parse(read("docs/app/version.json")).v;
  const panVer = MANIFEST.version;
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  const count = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("D1) the wave ships in lockstep — web " + appVer + ", panel " + panVer + " across the manifest, panel-version.json and PANEL_VERSION, with this test in the CI sweep and the landing count at 233 or more",
    /^6\.9[6-9]\.\d+$|^6\.\d{3}\.\d+$|^[7-9]\./.test(appVer) &&
    /^6\.16[7-9]\.\d+$|^6\.1[7-9]\d\.\d+$|^6\.[2-9]\d\d\.\d+$/.test(panVer) &&
    new RegExp('var APP_VER *= *"' + appVer.replace(/\./g, "\\.") + '"').test(APP) &&
    pv.v === panVer && pv.latest_version === panVer &&
    new RegExp('PANEL_VERSION = "' + panVer.replace(/\./g, "\\.") + '"').test(PMAIN) &&
    CI.indexOf("node test/verify_panel_hero_banners.js") > 0 && count >= 233,
    { appVer, panVer, pv: pv.v, count });

  /* the row this test's own wave added, wherever it now sits in the table */
  /* 6.107.0 — the row used to be sliced out of the WHATS_NEW literal in
     index.html by hand, from one `{ v:"` to the next. The table now lives in
     data/whatsnew.js as JSON, so the row is read from there and rendered back
     into the spelling this check was written against — same row, same nine
     language keys, no slicing arithmetic. */
  const row = WN.appRow("6.96.1");
  report("D2) the 6.96.1 What's New row still names the two banners in all nine languages",
    row.length > 100 && LANGS.every(l => new RegExp('\\b' + l + ':"').test(row)), { len: row.length });
}

(async () => {
  sourcePins();
  deadClassScan();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nDONE — every check passed");
  process.exit(failures ? 1 : 0);
})();
