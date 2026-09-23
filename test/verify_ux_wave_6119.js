/* 6.119.0 / panel 6.190.0 — UI/UX wave D: the landing site — tap targets, keyboard focus, heading order, a bypass link.

   WHAT WAS MEASURED (a live scan of the landing at 390 · 768 · 1024 · 1440 · 1920, then a Tab walk of every stop):
   - three interactive targets under 44px in one dimension: the navigation's App button (94–102 × 40), the FAQ
     site link (43 wide) and the footer's TikTok link (36 wide). Every other target already met 44 × 44.
   - two keyboard stops with no visible ring at all: the Before | After compare frames put an invisible range
     (opacity 0, by design — the picture is the control) over the frame; a keyboard user landed on it blind.
   - one heading skip: the two hero action cards were H3 directly under the page's H1.
   - no bypass block: a keyboard user Tabbed through nine navigation links and two controls before the hero.
   - real low-contrast text: none (the four gradient headlines are excluded, being painted with a gradient).
   NOW: every target is at least 44 × 44 at every width; the compare frame wears a 2px gold ring while its range
   holds focus and ← → still move the divider; the action cards are H2; the first Tab stop is a "Skip to
   content" link in seven languages (the other languages fall back like every other line) that lands on the hero.

   A) source pins   B) the landing at 390 · 768 · 1440 · 1920: targets, the Tab walk, the compare ring, the
   heading outline, the bypass link, contrast   C) release pins. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.119.0", PVER = "6.190.0";
const MIN = 44;

let failures = 0;
function report(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failures++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 900) : "")); }
}
const has = (s, t) => s.indexOf(t) >= 0;

/* ================= A) source ================= */
function sourcePins() {
  report("A1) the three short targets are 44px: the navigation's .btn has a 44px floor, the site links a 44px width floor (centred), the footer's social and tel links a 44px width floor (centred)",
    has(LANDING, ".nav .btn{padding:8px 16px;min-height:44px;font-size:var(--fs-sm);white-space:nowrap;flex:none}") &&
    has(LANDING, ".site-links a{display:flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 9px;") &&
    has(LANDING, '.foot p a.fl,.foot p a[href^="tel:"]{color:var(--gold-hi);transition:color .25s, text-shadow .25s;display:inline-block;min-height:44px;min-width:44px;line-height:44px;margin:-11px 0;text-align:center}'), null);
  report("A2) the compare frame wears the ring for its invisible range: .ba-range stays opacity 0 (the picture is the control) and .ba-frame:focus-within paints a 2px gold ring above the pictures that takes no pointer",
    has(LANDING, ".ba-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}") &&
    has(LANDING, '.ba-frame:focus-within::after{content:"";position:absolute;inset:0;border:2px solid var(--gold-hi);border-radius:inherit;pointer-events:none;z-index:6}'), null);
  const dict = (LANDING.match(/"skip\.main": \{[^}]*\}/) || [])[0] || "";
  report("A3) the bypass link: the first element in <body> is a.skip → #home with a data-i18n key in seven languages (my en th zh vi id ms), parked 200px above the page until it holds focus; the hero takes programmatic focus and shows no ring of its own; <main> is addressable",
    has(LANDING, '<body>\n<a class="skip" href="#home" data-i18n="skip.main">') &&
    has(LANDING, ".skip{position:absolute;top:-200px;left:12px;z-index:1000;display:inline-flex;align-items:center;min-height:44px;") &&
    has(LANDING, ".skip:focus-visible{top:12px;outline:2px solid #fff;outline-offset:2px}") && has(LANDING, ".hero:focus{outline:none}") &&
    has(LANDING, '<header class="hero" id="home" tabindex="-1">') && has(LANDING, '<main class="wrap" id="main">') &&
    ["my", "en", "th", "zh", "vi", "id", "ms"].every((l) => new RegExp('"' + l + '": "[^"]{4,}"').test(dict)) && has(dict, '"en": "Skip to content"'), { dict: dict.slice(0, 200) });
  report("A4) heading order: the two hero action cards are H2 (were H3 under the H1); the .act-h styling is by class and unchanged",
    (LANDING.match(/<h2 class="act-h" data-i18n-html="(cin1\.h|s5\.cinh)">/g) || []).length === 2 && !has(LANDING, '<h3 class="act-h"') &&
    has(LANDING, ".act-h{font-size:var(--fs-xl);line-height:1.55;color:#fff;margin:0 0 6px}"), null);
}

/* ================= B) the landing ================= */
/* Runs in the page. Visible = laid out, not hidden, opacity above 0.05 (reveal sections start at 0 and are walked
   into view first). Targets: every native control, link and ARIA button on the page. */
const MEASURE = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05; };
  const anc = (el) => { let e = el; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; e = e.parentElement; } return true; };
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,\/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
  const bgOf = (el) => { let e = el, acc = null; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); const c = parse(cs.backgroundColor); if (cs.backgroundImage && cs.backgroundImage !== "none") return { unknown: true }; if (c && c.a > 0) { if (c.a >= 1) { if (!acc) return c; return { r: c.r * (1 - acc.a) + acc.r * acc.a, g: c.g * (1 - acc.a) + acc.g * acc.a, b: c.b * (1 - acc.a) + acc.b * acc.a }; } acc = acc ? { r: c.r * (1 - acc.a) + acc.r, g: c.g * (1 - acc.a) + acc.g, b: c.b * (1 - acc.a) + acc.b, a: acc.a + c.a * (1 - acc.a) } : { r: c.r * c.a, g: c.g * c.a, b: c.b * c.a, a: c.a }; } e = e.parentElement; } if (acc) return { r: bodyBg.r * (1 - acc.a) + acc.r, g: bodyBg.g * (1 - acc.a) + acc.g, b: bodyBg.b * (1 - acc.a) + acc.b }; return bodyBg; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const desc = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") + " " + (el.textContent || "").trim().slice(0, 18);
  const out = { overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
  const targets = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [tabindex]:not([tabindex='-1'])")].filter((el) => vis(el) && anc(el));
  out.targets = targets.length;
  out.small = targets.map((el) => { const r = el.getBoundingClientRect(); return { d: desc(el), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((o) => o.w < 44 || o.h < 44);
  const named = (sel, re) => { const el = [...document.querySelectorAll(sel)].find((x) => re.test(x.textContent || "")); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  out.navCta = named(".nav a.btn.btn-gold", /./); out.faq = named(".site-links a", /FAQ/); out.tiktok = named(".foot p a.fl", /TikTok/i);
  const textEls = [...document.querySelectorAll("body *")].filter((el) => vis(el) && anc(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  out.low = []; out.gradientText = 0; out.unknownBg = 0;
  for (const el of textEls) {
    const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize);
    const clip = (cs.webkitBackgroundClip || cs.backgroundClip) === "text" || (cs.webkitTextFillColor && parse(cs.webkitTextFillColor) && parse(cs.webkitTextFillColor).a === 0);
    if (clip) { out.gradientText++; continue; }
    const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(el); if (bg.unknown) { out.unknownBg++; continue; }
    const fgc = fg.a < 1 ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) } : fg;
    const cr = ratio(fgc, bg); const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
    if (cr < (large ? 3 : 4.5)) out.low.push({ d: desc(el), cr: +cr.toFixed(2), fs: +fs.toFixed(1) });
  }
  out.h1 = document.querySelectorAll("h1").length;
  const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => vis(h) && anc(h));
  const lv = hs.map((h) => +h.tagName[1]);
  out.headingSkips = lv.filter((l, i) => i > 0 && l > lv[i - 1] + 1).length;
  out.firstHeadings = hs.slice(0, 3).map((h) => h.tagName + (h.className ? "." + h.className.split(/\s+/)[0] : ""));
  out.imgNoAlt = [...document.images].filter((i) => vis(i) && !i.hasAttribute("alt")).length;
  out.main = !!document.querySelector("main#main"); out.lang = document.documentElement.lang;
  return out;
};
/* One Tab stop: the element, whether it (or a :focus-within parent, as the language picker does) paints a ring, and whether it is itself visible. */
const STOP = () => {
  const el = document.activeElement; if (!el || el === document.body) return null;
  const cs = getComputedStyle(el); const p = el.parentElement, par = p ? getComputedStyle(p) : null;
  const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
  const parRing = !!(par && p.matches(":focus-within") && ((par.outlineStyle !== "none" && parseFloat(par.outlineWidth) > 0) || (par.boxShadow && par.boxShadow !== "none")));
  const frame = el.closest(".ba-frame"); const fa = frame ? getComputedStyle(frame, "::after") : null;
  const frameRing = !!(fa && fa.content !== "none" && parseFloat(fa.borderTopWidth) >= 2);
  const r = el.getBoundingClientRect();
  return { d: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""), ring, parRing, frameRing, vis: r.width > 0 && r.height > 0 && cs.opacity !== "0", inViewport: r.top >= 0 && r.bottom <= innerHeight };
};

async function landingWalk(browser) {
  const DOCS = path.join(ROOT, "docs");
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(DOCS, rel); if (!abs.startsWith(DOCS + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  try {
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
      await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1200);
      /* B5 first — the bypass link is the very first Tab stop of a fresh page */
      await page.keyboard.press("Tab");
      const first = await page.evaluate(STOP);
      const firstBox = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), text: (a.textContent || "").trim() }; });
      await page.keyboard.press("Enter"); await page.waitForTimeout(250);
      const landed = await page.evaluate(() => { const a = document.activeElement; return { d: a.tagName + "#" + a.id, outline: getComputedStyle(a).outlineStyle, hash: location.hash }; });
      await page.keyboard.press("Tab");
      const next = await page.evaluate(() => { const a = document.activeElement; return { d: a.tagName + "." + a.className, inHero: !!a.closest("header.hero"), inNav: !!a.closest("nav.nav") }; });
      report(`B5) the landing at ${w}px: the first Tab stop is the bypass link — 44px tall, slid into view at 12px with a ring, Burmese by default; Enter lands focus on the hero (#home, no ring of its own) and the next Tab is inside the hero, past the navigation`,
        first && first.d === "a.skip.nolat" && first.ring && first.inViewport && firstBox.h >= MIN && firstBox.top === 12 && firstBox.text === "အကြောင်းအရာသို့ ကျော်မယ်" &&
        landed.d === "HEADER#home" && landed.outline === "none" && landed.hash === "#home" && next.inHero && !next.inNav, { first, firstBox, landed, next });
      /* reveal walk — the sections start transparent until seen */
      await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); });
      const m = await page.evaluate(MEASURE);
      report(`B1) the landing at ${w}px: every interactive target is at least ${MIN} × ${MIN} — the navigation's App button, the FAQ link and the TikTok link among them — no horizontal overflow, no page error`,
        m.small.length === 0 && m.targets >= 25 && m.navCta && m.navCta.h >= MIN && m.navCta.w >= MIN && m.faq && m.faq.w >= MIN && m.faq.h >= MIN && m.tiktok && m.tiktok.w >= MIN && m.tiktok.h >= MIN && m.overflowX === 0 && errs.length === 0,
        { small: m.small.slice(0, 8), targets: m.targets, navCta: m.navCta, faq: m.faq, tiktok: m.tiktok, ovf: m.overflowX, errs });
      report(`B4) the landing at ${w}px: one H1, no heading level skipped, the hero action cards H2, every visible picture named, <main id="main">`,
        m.h1 === 1 && m.headingSkips === 0 && /^H1\b/.test(m.firstHeadings[0]) && m.firstHeadings[1] === "H2.act-h" && m.firstHeadings[2] === "H2.act-h" && m.imgNoAlt === 0 && m.main && m.lang === "my", { h1: m.h1, skips: m.headingSkips, first: m.firstHeadings, imgNoAlt: m.imgNoAlt, main: m.main });
      report(`B6) the landing at ${w}px: no visible text under the WCAG contrast floor (4.5:1, 3:1 for large) against its own background — gradient-painted headlines set aside`,
        m.low.length === 0, { low: m.low.slice(0, 10), gradient: m.gradientText, unknownBg: m.unknownBg });
      /* B2 — the Tab walk from the top: every stop paints a ring, on itself, on its :focus-within parent, or (the compare range) on its frame.
         The walk starts on the bypass link (focused by script so the sequential starting point is the top of the page) and ends when
         focus leaves the document (Tab past the last stop lands on <body>). */
      await page.evaluate(() => { scrollTo(0, 0); const a = document.querySelector("a.skip"); a.focus(); });
      const stops = [await page.evaluate(STOP)];
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press("Tab");
        const s = await page.evaluate(STOP); if (!s) break;
        stops.push(s);
      }
      const noRing = stops.filter((s) => !s.ring && !s.parRing && !s.frameRing).map((s) => s.d);
      const ranges = stops.filter((s) => s.d === "input.ba-range");
      report(`B2) the landing at ${w}px: ${stops.length} keyboard stops and every one of them paints a visible ring — the two compare ranges through their frame`,
        stops.length >= 55 && noRing.length === 0 && ranges.length === 2 && ranges.every((s) => s.frameRing), { stops: stops.length, noRing: noRing.slice(0, 8), ranges });
      /* B3 — the compare frame: ring on focus only, the divider still moves from the keyboard */
      const ba = await page.evaluate(async () => {
        const range = document.querySelector("input.ba-range"); const frame = range.closest(".ba-frame");
        range.blur(); document.body.focus && document.body.focus(); await new Promise((r) => setTimeout(r, 50));
        const before = getComputedStyle(frame, "::after"); const b = { content: before.content, bw: before.borderTopWidth };
        range.focus(); await new Promise((r) => setTimeout(r, 50));
        const after = getComputedStyle(frame, "::after"); const a = { content: after.content, bw: after.borderTopWidth, color: after.borderTopColor, z: after.zIndex, pe: after.pointerEvents };
        const v0 = Number(range.value);
        return { b, a, v0, cut0: frame.style.getPropertyValue("--cut") };
      });
      await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(120);
      const moved = await page.evaluate(() => { const range = document.querySelector("input.ba-range"); const frame = range.closest(".ba-frame"); return { v: Number(range.value), cut: frame.style.getPropertyValue("--cut") }; });
      report(`B3) the landing at ${w}px: the compare frame paints no ring at rest and a 2px gold ring (above the pictures, taking no pointer) while its range holds focus; → still moves the divider`,
        ba.b.content === "none" && ba.a.content === '""' && ba.a.bw === "2px" && ba.a.color === "rgb(244, 212, 136)" && ba.a.z === "6" && ba.a.pe === "none" && moved.v > ba.v0 && moved.cut !== ba.cut0 && /%$/.test(moved.cut), { ba, moved });
      await page.close();
    }
    /* B7 — the bypass link in the other languages: seven translations, the rest fall back like every other line */
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(800);
    const words = await page.evaluate(() => { const sel = document.querySelector(".langsel select"); const out = {}; for (const l of ["en", "th", "zh", "vi", "id", "ms", "shn", "kac", "my"]) { sel.value = l; sel.dispatchEvent(new Event("change", { bubbles: true })); out[l] = document.querySelector("a.skip").textContent; } return out; });
    report("B7) the bypass link follows the language picker: Skip to content · ข้ามไปยังเนื้อหา · 跳到内容 · Bỏ qua tới nội dung · Langsung ke konten · Langkau ke kandungan, and the languages without their own line fall back (Shan and Kachin to the Burmese)",
      words.en === "Skip to content" && words.th === "ข้ามไปยังเนื้อหา" && words.zh === "跳到内容" && words.vi === "Bỏ qua tới nội dung" && words.id === "Langsung ke konten" && words.ms === "Langkau ke kandungan" && words.my === "အကြောင်းအရာသို့ ကျော်မယ်" && words.shn === words.my && words.kac === words.my, words);
    await page.close();
  } finally { server.close(); }
}

/* ================= C) the release ================= */
function releasePins() {
  /* the landing's version CLAIMS (badges, JSON-LD, meta, nine-language lines) must all have moved on; the two
     "6.118.0 — the 10px floor" CSS comments are history and stay — so comments are stripped before the stale check */
  const LANDING_CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "");
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.120.0 — this wave shipped as 6.119.0 / 6.190.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`C1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING_CLAIMS, "6.118.0") && !has(LANDING_CLAIMS, "6.189.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`C2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — a bold lead, title and story in all nine languages, pointing at Home — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgHome" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40 && row.s[l].startsWith("**")) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("C3) CI runs this test right after the wave C step and the landing says how many tests the suite runs (261 when this wave shipped, 262 since 6.120.0 added verify_ux_wave_6120, 263 since 6.121.0 added verify_album_designer)",
    has(CI, "run: node test/verify_ux_wave_6118.js\n") && has(CI, "run: node test/verify_ux_wave_6119.js") && CI.indexOf("verify_ux_wave_6118") < CI.indexOf("verify_ux_wave_6119") &&
    (CI.match(/node test\//g) || []).length === 272 && has(LANDING, "272 tests") && !has(LANDING, "260 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  try { await landingWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every landing target 44px at four widths, every keyboard stop ringed (the compare frames included), the headings in order, a bypass link in seven languages, no low-contrast text, the release in lockstep.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
