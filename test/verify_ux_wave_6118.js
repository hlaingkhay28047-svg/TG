/* 6.118.0 / panel 6.189.0 — UI/UX wave C: the text floor, the What's New rows measured (#212), the panel under a slow CPU (Wave 11 pass B).

   WHAT WAS MEASURED (the wave A audit sheets, then a live scan of every page on the three surfaces):
   - text under 10px still on screen: the header's WEB STUDIO kicker at 9.5px under 480px and 9px under 380px
     (app), AI PANEL at 8.5px (panel), WEBSITE at 8.5px under 480px (landing); the "A" mark in the ratio picker
     at 9px (app + panel); two badges at 7.5px in the app's rules; the landing's social hover labels at 8.5px.
   - the What's New rows: 6.41.0 gave the title and story a 2.25 line height for the tallest scripts WITHOUT
     measuring them (#212). Measured here with the ink probe in nine languages: the Burmese, Shan and Thai
     titles carry 14px of ascender ink on a 12.5px face, the stories 13px on 12px — 1.92 and 1.83 keep a 1px
     margin, 2.0 and 1.9 keep 1.5px, and each row is 11px shorter.
   - the panel with the CPU slowed four times: twenty page switches, the slowest 0.5s cold; at 360px in nine
     languages no text overruns its box (the horizontal rails scroll by design and are not overruns).
   NOW: the 10px floor holds on every surface (functional text stays at 11+), the two rows are 2.0 / 1.9 with
   the panel's ceilings stated in px, and the panel's budget and overflow are pinned so they cannot regress.

   A) source pins   B) the app: every page at 390 (my · en) and 1440 — no visible text under 10px; the What's New
   ink in nine languages   C) the panel: 360 · 900 text floor, 4x CPU switch budget, 360px nine-language overflow
   D) the landing at 390 · 768 · 1440   E) release pins   F) the AI Retouch photograph: the panel's card sends the
   app's beauty prompt whole (appPrompt, Auto → Nano Banana 2) and the panel compiler appends the AVOID list. */
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
const PCSS = read("panel/styles.css");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.118.0", PVER = "6.189.0";
const FLOOR = 10, FUNC_FLOOR = 11;
const PANEL_PAGES = ["aitools", "wf", "create", "prompt", "video", "vidup", "v2v", "talk", "meitu", "evoto", "retouch", "imagine", "path", "gallery", "album", "tutorials", "setup", "presets", "history", "library"];

let failures = 0;
function report(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failures++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 900) : "")); }
}
const has = (s, t) => s.indexOf(t) >= 0;

/* ================= A) source ================= */
function sourcePins() {
  report("A1) the app's What's New rows are 2.0 (title) and 1.9 (story), measured — the two-line clamp stays; the panel's twin states the two-line ceilings in px (50 / 42) with the same line heights",
    has(APP, ".nw-t{font-weight:800;font-size:12.5px;line-height:2;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}") &&
    has(APP, ".nw-s{font-size:12px;color:var(--muted);line-height:1.9;margin-top:2px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}") &&
    has(APP, "6.118.0 — MEASURED, NOT GUESSED (#212)") && !has(APP, ".nw-t{font-weight:800;font-size:12.5px;line-height:2.25") &&
    has(PCSS, ".nw-t{font-weight:800;font-size:12.5px;line-height:2;max-height:50px;overflow:hidden}") && has(PCSS, ".nw-s{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.9;max-height:42px;overflow:hidden}") &&
    !has(PCSS, "max-height:4.5em"), null);
  report("A2) the 10px floor in the rules the scan named — app: the header kicker under 480 and 380px, the ratio picker's A mark, the two badges; panel: AI PANEL, the A mark; landing: WEBSITE under 480px, the social hover labels — none of the old sizes remain",
    has(APP, "@media(max-width:479px){ .nav-tag{display:none} .nav-in{gap:8px} .hnk-studio-label{font-size:10px;letter-spacing:.14em} }") &&
    has(APP, "@media(max-width:379px){.hnk-wordmark{font-size:17px;letter-spacing:.08em}.hnk-studio-label{font-size:10px;letter-spacing:.1em}") &&
    has(APP, ".rchip i{display:flex;align-items:center;justify-content:center;border:1.6px solid currentColor;border-radius:3px;opacity:.85;font-style:normal;font-size:10px;") &&
    has(APP, ".hsl-tag{font-size:10px;font-weight:800;line-height:1;") && has(APP, ".st-bg{flex:0 0 auto;order:2;font-size:10px;font-weight:800;") &&
    !/\.hnk-studio-label\{font-size:9(\.5)?px/.test(APP) && !/font-size:7\.5px/.test(APP.slice(0, APP.indexOf("</style>"))) &&
    has(PCSS, "  font-size: 10px; font-weight: 800; letter-spacing: 0.14em; line-height: 1; /* 6.118.0 — the text floor: nothing under 10px (was 8.5) */") &&
    has(PCSS, "border: 1.6px solid currentColor; border-radius: 3px; opacity: 0.85; font-style: normal; font-size: 10px; font-weight: 800;") && !has(PCSS, "font-size: 8.5px; font-weight: 800; letter-spacing: 0.18em") &&
    has(LANDING, "@media (max-width:479px){\n  .hnk-studio-label{font-size:10px;letter-spacing:.14em}") && has(LANDING, ".soc span{position:absolute;bottom:7px;left:50%;transform:translate(-50%,10px);font-size:10px;") &&
    !has(LANDING, "font-size:8.5px"), null);
}

/* ================= shared probes (serialised into the pages; the app's CSP forbids eval in-page, so they are functions) ================= */
/* every visible text-bearing element under the floor. SVG glyph icons (a letter drawn as an icon inside a 15px tile) are icons, not text. */
function tinyScan() {
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || "").trim(); if (!t) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.closest("svg")) continue;
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
    let p = el, hidden = false; while (p && p !== document.body) { const pc = getComputedStyle(p); if (pc.display === "none" || pc.visibility === "hidden" || parseFloat(pc.opacity) === 0) { hidden = true; break; } p = p.parentElement; }
    if (hidden) continue;
    seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const func = /^(BUTTON|A|LABEL|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || /(^|\s)(chip|tag|tabb|hsl-ctx|wf-need|go|subtab)(\s|$)/.test(el.className || "");
    if (fs < 10 || (func && fs < 11)) { const chain = []; p = el; for (let i = 0; i < 3 && p && p !== document.body; i++) { chain.unshift(p.tagName.toLowerCase() + (p.id ? "#" + p.id : "") + (p.classList.length ? "." + [...p.classList].slice(0, 2).join(".") : "")); p = p.parentElement; } out.push({ sel: chain.join(">"), t: t.slice(0, 18), fs: Math.round(fs * 10) / 10, func }); }
  }
  return out;
}
/* the ink probe over the What's New rows (the wf_card_compact probe, over these two classes) */
function inkWN() {
  const cv = document.createElement("canvas"), cx = cv.getContext("2d");
  const fontOf = (cs) => cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
  function probe(el) {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim()); if (!node) return null;
    const txt = node.nodeValue, cs = getComputedStyle(el), L = parseFloat(cs.lineHeight);
    const full = document.createRange(); full.selectNodeContents(node);
    const tops = [...new Set([...full.getClientRects()].filter((r) => r.height > 0).map((r) => Math.round(r.top * 10) / 10))].sort((a, b) => a - b);
    if (!tops.length) return null;
    const topAt = (i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const b = r.getBoundingClientRect(); return b.height > 0 ? b.top : -1; };
    const startOf = (k) => { let lo = 0, hi = txt.length - 1, ans = txt.length - 1; const want = tops[k]; while (lo <= hi) { const mid = (lo + hi) >> 1, t = topAt(mid); if (t < 0) { lo = mid + 1; continue; } if (t >= want - 0.6) { ans = mid; hi = mid - 1; } else lo = mid + 1; } return ans; };
    const N = tops.length, firstEnd = N > 1 ? startOf(1) : txt.length, lastStart = N > 1 ? startOf(N - 1) : 0;
    cx.font = fontOf(cs); const mAll = cx.measureText(txt), A = mAll.fontBoundingBoxAscent, D = mAll.fontBoundingBoxDescent;
    if (!(isFinite(A) && isFinite(D))) return { unsupported: true };
    const m0 = cx.measureText(txt.slice(0, firstEnd)), mL = cx.measureText(txt.slice(lastStart)); const half = (L - (A + D)) / 2;
    return { overTop: Math.round((m0.actualBoundingBoxAscent - A - half) * 100) / 100, overBot: Math.round((mL.actualBoundingBoxDescent - D - half) * 100) / 100, lines: N, L: Math.round(L * 100) / 100, boxH: Math.round(el.getBoundingClientRect().height * 10) / 10 };
  }
  const rows = [...document.querySelectorAll(".nw-row")].filter((r) => r.getBoundingClientRect().height > 0);
  const out = { rows: rows.length, t: { top: -99, bot: -99, lines: 0, L: 0, n: 0, boxH: 0 }, s: { top: -99, bot: -99, lines: 0, L: 0, n: 0, boxH: 0 }, rowH: 0, unsupported: 0 };
  for (const r of rows) {
    for (const [cls, k] of [[".nw-t", "t"], [".nw-s", "s"]]) { const p = probe(r.querySelector(cls)); if (!p) continue; if (p.unsupported) { out.unsupported++; continue; } out[k].n++; out[k].top = Math.max(out[k].top, p.overTop); out[k].bot = Math.max(out[k].bot, p.overBot); out[k].lines = Math.max(out[k].lines, p.lines); out[k].L = p.L; out[k].boxH = Math.max(out[k].boxH, p.boxH); }
    out.rowH = Math.max(out.rowH, Math.round(r.getBoundingClientRect().height));
  }
  return out;
}
/* text that overruns its box at a narrow width — a rail that scrolls by design is not an overrun */
function overflowScan() {
  const bad = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  const scroller = (e) => { let a = e.parentElement; while (a && a !== document.body) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowX) && a.scrollWidth > a.clientWidth + 1) return a; a = a.parentElement; } return null; };
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || "").trim(); if (!t) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
    if (scroller(el)) continue;
    let a = el.parentElement, clipped = null; while (a && a !== document.body) { const c = getComputedStyle(a); if (c.overflow === "hidden" || c.overflowX === "hidden") { const ar = a.getBoundingClientRect(); if (r.right > ar.right + 1) { clipped = a; break; } } a = a.parentElement; }
    const name = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + [...el.classList].slice(0, 2).join(".");
    if (clipped) bad.push({ why: "clipped", sel: name, t: t.slice(0, 18) });
    else if (r.right > innerWidth + 1 && r.left < innerWidth) bad.push({ why: "past-right", sel: name, t: t.slice(0, 18), right: Math.round(r.right) });
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) bad.push({ why: "page-overflow-x", sw: document.documentElement.scrollWidth });
  return bad.slice(0, 8);
}

/* ================= B) the app ================= */
async function openApp(browser, w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); localStorage.removeItem("hnk_nw_seen"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=${lang}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchPage === "function", null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  return { ctx, page, errs };
}
async function appWalk(browser) {
  for (const vp of [{ w: 390, h: 844, lang: "my" }, { w: 390, h: 844, lang: "en" }, { w: 1440, h: 900, lang: "my" }]) {
    const { ctx, page, errs } = await openApp(browser, vp.w, vp.h, vp.lang);
    const pages = await page.evaluate(() => [...document.querySelectorAll(".page[id^=pg]")].map((p) => p.id));
    const found = {}; let scanned = 0;
    for (const pg of pages) {
      const rows = await page.evaluate(new Function("pg", "return (async () => { switchPage(pg); await new Promise(r => setTimeout(r, 220)); return (" + tinyScan.toString() + ")(); })();"), pg);
      scanned++; if (rows.length) found[pg] = rows.slice(0, 5);
    }
    report(`B1) the app at ${vp.w}×${vp.h} (${vp.lang}): ${scanned} pages walked — no visible text under ${FLOOR}px, no functional text (buttons, links, chips, tags, tabs, pickers) under ${FUNC_FLOOR}px`,
      scanned >= 18 && Object.keys(found).length === 0 && errs.length === 0, { scanned, found, errs });
    await ctx.close();
  }
}
async function inkWalk(browser) {
  const per = {};
  for (const lang of LANGS) {
    const { ctx, page } = await openApp(browser, 390, 844, lang);
    const r = await page.evaluate(new Function("return (async () => { const row = document.querySelector('.nw-row'); const pg = row && row.closest('.page'); if (pg) { switchPage(pg.id); await new Promise(r => setTimeout(r, 400)); } return (" + inkWN.toString() + ")(); })();"));
    per[lang] = r;
    await ctx.close();
  }
  /* the clamp lays every line out and hides all but two, so the probe reads the laid-out lines (up to fifteen for a
     story) — what the reader sees is the BOX, two line boxes tall; the ink margins hold on every laid-out line alike */
  const ok = (k, L) => LANGS.every((l) => per[l].rows >= 3 && per[l][k].n >= 3 && per[l][k].top <= -1 && per[l][k].bot <= -1 && per[l][k].boxH <= 2 * L + 1);
  report("B2) the What's New rows in nine languages: every title and story keeps at least 1px between its tallest ink and the line box on both sides (the tallest are Burmese · Shan · Thai), each box shows two line boxes at most, and the title's line box is 25px / the story's 22.8px (2.0 / 1.9 of the face) — a row stands ≤ 124px",
    ok("t", 25) && ok("s", 22.8) && LANGS.every((l) => per[l].t.L === 25 && per[l].s.L === 22.8 && per[l].rowH <= 124 && per[l].unsupported === 0), per);
}

/* ================= C) the panel ================= */
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
async function panelWalk(browser) {
  const server = await servePanel();
  try {
    /* C1: the text floor at 360 and 900 */
    for (const w of [360, 900]) {
      const { page, errs } = await openPanel(browser, server, w, 800);
      const found = {}; let scanned = 0;
      for (const key of PANEL_PAGES) {
        const rows = await page.evaluate(new Function("k", "return (async () => { try { HNK.panelNav.switchPage(k); } catch (e) { return [{ sel: 'ERR', t: String(e).slice(0, 40), fs: 0 }]; } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 260)); return (" + tinyScan.toString() + ")(); })();"), key);
        scanned++; if (rows.length) found[key] = rows.slice(0, 5);
      }
      report(`C1) the panel at ${w}px: ${scanned} pages — no visible text under ${FLOOR}px, no functional text under ${FUNC_FLOOR}px, no page error`,
        scanned === PANEL_PAGES.length && Object.keys(found).length === 0 && errs.length === 0, { found, errs });
      await page.close();
    }
    /* C2: the CPU slowed four times — every page switch inside the budget, twice */
    {
      const { page } = await openPanel(browser, server, 360, 800);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const times = await page.evaluate(async (PAGES) => { const out = {}; for (let round = 0; round < 2; round++) for (const k of PAGES) { const t0 = performance.now(); try { HNK.panelNav.switchPage(k); } catch (e) { out[k + "#err"] = String(e).slice(0, 60); } await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); (out[k] = out[k] || []).push(Math.round(performance.now() - t0)); } return out; }, PANEL_PAGES);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const cold = Math.max(...PANEL_PAGES.map((k) => (times[k] || [9999])[0])), warm = Math.max(...PANEL_PAGES.map((k) => (times[k] || [9999, 9999])[1]));
      report("C2) with the CPU slowed four times every one of the twenty page switches lands inside 900ms cold and 600ms warm (measured 0.5s / 0.37s at the slowest — Imagine — on the build this shipped with), none throws",
        cold <= 900 && warm <= 600 && !Object.keys(times).some((k) => /#err$/.test(k)), { cold, warm, times });
      await page.close();
    }
    /* C3: 360px in nine languages — nothing overruns */
    {
      const { page, errs } = await openPanel(browser, server, 360, 800);
      const per = {};
      for (const lang of LANGS) {
        const set = await page.evaluate(async (lang) => { const sl = document.querySelector(".hdr select"); if (!sl) return "no-select"; sl.value = lang; sl.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 450)); return HNK.i18n.lang(); }, lang);
        const found = {};
        for (const key of PANEL_PAGES) {
          const bad = await page.evaluate(new Function("k", "return (async () => { try { HNK.panelNav.switchPage(k); } catch (e) { return [{ why: 'ERR', t: String(e).slice(0, 40) }]; } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 220)); return (" + overflowScan.toString() + ")(); })();"), key);
          if (bad.length) found[key] = bad;
        }
        per[lang] = { set, found };
      }
      report("C3) at 360px, in all nine languages, on all twenty pages: no text overruns its box or the panel's edge and no page scrolls sideways — the rails that scroll by design excepted; the language switch took each time",
        LANGS.every((l) => per[l].set === l && Object.keys(per[l].found).length === 0) && errs.length === 0, { per: Object.fromEntries(LANGS.map((l) => [l, { set: per[l].set, found: per[l].found }])), errs });
      await page.close();
    }
  } finally { server.close(); }
}

/* ================= D) the landing ================= */
async function landingWalk(browser) {
  const DOCS = path.join(ROOT, "docs");
  const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(DOCS, rel); if (!abs.startsWith(DOCS + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" }); await page.waitForTimeout(1200);
      const rows = await page.evaluate(new Function("return (" + tinyScan.toString() + ")();"));
      report(`D1) the landing at ${w}px: no visible text under ${FLOOR}px, no functional text under ${FUNC_FLOOR}px, no page error`, rows.length === 0 && errs.length === 0, { rows: rows.slice(0, 6), errs });
      await page.close();
    }
  } finally { server.close(); }
}

/* ================= E) the release ================= */
function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.119.0 — this wave shipped as 6.118.0 / 6.189.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`E1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING, "6.117.0") && !has(LANDING, "6.188.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`E2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — a bold lead, title and story in all nine languages, pointing at Home — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgHome" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40 && row.s[l].startsWith("**")) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("E3) CI runs this test right after the R2 + B2 step and the landing says how many tests the suite runs (260 when this wave shipped, 261 since 6.119.0 added verify_ux_wave_6119, 262 since 6.120.0 added verify_ux_wave_6120, 263 since 6.121.0 added verify_album_designer)",
    has(CI, "run: node test/verify_ux_wave_6117.js\n") && has(CI, "run: node test/verify_ux_wave_6118.js") && CI.indexOf("verify_ux_wave_6117") < CI.indexOf("verify_ux_wave_6118") &&
    (CI.match(/node test\//g) || []).length === 265 && has(LANDING, "265 tests") && !has(LANDING, "259 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

/* ---- F) the AI Retouch photograph (owner, 2026-09-20): "wrinkles came out and the face looks older" ----
   Root cause, on the panel: the hand-built card carried its own prompt ("natural, subtle …
   keep real pore texture … keep natural skin character and apparent age") while the app
   asks for the studio beauty finish; it routed Auto to Qwen Image 2.0 Pro, whose 800-char
   cap cut the Subject lock mid-sentence; and the panel's request compiler never appended
   the AVOID list at all, on any card. Pinned here without a browser: the catalog, the
   registry, the compiler and the fitter are plain modules. */
function retouchPins() {
  const { readLibWf } = require("../tools/lib/app-data.js");
  const app = readLibWf().workflows.find((w) => w.id === "retouch");
  const REGSRC = read("panel/src/workflows/workflow-registry.js");
  const COMPSRC = read("panel/src/workflows/workflow-request-compiler.js");
  const CATALOG = read("panel/js/hnk_wf_catalog_data.js");
  report("F1) the app's AI Retouch prompt carries the TEXTURE RULE (lines and pores reduced, never added; the same age or younger, never older) and its AVOID list names added wrinkles and an older-looking face — and no longer forbids a \"beautified or idealized face\" while asking for a beauty retouch",
    !!app && /TEXTURE RULE: a retouch only removes and softens/.test(app.prompt) && /never older\./.test(app.prompt) && !/visible pores/i.test(app.prompt) &&
    /added wrinkles/.test(app.negative) && /aged or older-looking face/.test(app.negative) && !/beautified or idealized face/.test(app.negative) && /altered bone structure/.test(app.negative) &&
    /Subject lock: keep the exact same person/.test(app.prompt) && /COMPOSITION LOCK:/.test(app.prompt),
    app && { prompt: app.prompt.length, negative: app.negative.length });
  const reg = require(path.join(ROOT, "panel/src/workflows/workflow-registry.js"));
  const wf = reg.get("retouch"), c = reg.compile("retouch", {});
  const retouchBlock = (REGSRC.match(/id: "retouch", title: "AI Retouch"[\s\S]*?route: \{[^}]*\}/) || [""])[0];
  report("F2) the panel's AI Retouch card sends the app's prompt and AVOID list byte for byte (appPrompt — copied from the lifted catalog at load, bespoke so no second lock line is appended), routes Auto to Nano Banana 2 like every other catalog card, and the old \"keep real pore texture … apparent age\" wording and the Qwen route are gone from the source",
    !!wf && wf.appPrompt === true && wf.bespoke === true && !!c && c.prompt === app.prompt && c.negativePrompt === app.negative &&
    !!wf.route && wf.route.modelId === "nano-banana-2" && wf.route.auto === true &&
    /appPrompt: true,/.test(retouchBlock) && /modelId: "nano-banana-2"/.test(retouchBlock) && !/qwen-image-2-pro/.test(retouchBlock) &&
    !/hiddenPrompt: "[^"\n]*keep real pore texture/.test(REGSRC) && /if \(own\.appPrompt && w\.prompt\) \{/.test(REGSRC) && has(CATALOG, "TEXTURE RULE: a retouch only removes and softens"),
    { route: wf && wf.route, same: !!c && c.prompt === app.prompt });
  const st = require(path.join(ROOT, "panel/src/workflows/workflow-state.js"));
  const comp = require(path.join(ROOT, "panel/src/workflows/workflow-request-compiler.js"));
  require(path.join(ROOT, "panel/src/providers/prompt-fit.js"));
  const rc = require(path.join(ROOT, "panel/src/providers/runninghub-config.js"));
  const fit = globalThis.HNK.promptFit.fit;
  const PX = "data:image/png;base64,iVBORw0KGgo=";
  const s = st.defaultState(); st.selectWorkflow(s, "retouch");
  st.setInput(s, "portrait", { source: "file", ref: PX, valid: true });
  const direct = comp.compile(s);
  const s2 = st.defaultState(); st.selectWorkflow(s2, "retouch"); st.prepare(s2);
  st.setInput(s2, "portrait", { source: "file", ref: PX, valid: true });
  const staged = comp.compile(s2);
  const want = app.prompt + "\n\nAVOID: " + app.negative + ".";
  const mc = rc.modelConfig(rc.resolve(), direct.model) || {};
  const s3 = st.defaultState(); st.selectWorkflow(s3, "bg-replace");
  st.setInput(s3, "subject", { source: "file", ref: PX, valid: true });
  st.setInput(s3, "background", { source: "preset", ref: PX, valid: true, preset: { title: "Golden Hour", group: "Outdoor" } });
  const withPreset = comp.compile(s3).compiledPrompt;
  const ai = withPreset.indexOf("\n\nAVOID: "), si = withPreset.indexOf("\nSCENE PRESET: ");
  st.setPromptOverride(s2, "the student's own words");
  const over = comp.compile(s2);
  report("F3) the panel compiler composes prompt + \"\\n\\nAVOID: \" + negative + \".\" exactly as the app's wizard does — on the direct and the prepared path — before the SCENE PRESET line; the student's own override still goes verbatim; and on the Auto route the whole instruction arrives uncut",
    direct.compiledPrompt === want && staged.compiledPrompt === want && direct.model === "nano-banana-2" && direct.modelResolvedFromAuto === true &&
    ai > 0 && si > ai && withPreset.endsWith("\nSCENE PRESET: Golden Hour — Outdoor") && over.compiledPrompt === "the student's own words" && over.promptEdited === true &&
    (!mc.promptMax || fit(direct.compiledPrompt, mc.promptMax) === direct.compiledPrompt) &&
    /if \(negative && prompt\.indexOf\("\\n\\nAVOID:"\) < 0\) prompt \+= "\\n\\nAVOID: " \+ String\(negative\) \+ "\.";/.test(COMPSRC),
    { direct: direct.compiledPrompt.length, want: want.length, ai, si, promptMax: mc.promptMax || "uncapped" });
  const q = fit(want, 800);
  report("F4) should a student pick an 800-character model by hand, the cut still opens with the beauty task (never the old \"natural, subtle\" wording) and stops at a sentence",
    q.length <= 800 && q.indexOf("Apply a premium") === 0 && !/natural, subtle/.test(q) && /[.!?]["”')\]]?$/.test(q), { len: q.length, tail: q.slice(-40) });
}

(async () => {
  sourcePins();
  retouchPins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    await appWalk(browser);
    await inkWalk(browser);
    await panelWalk(browser);
    await landingWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — nothing under 10px on any surface, the What's New rows measured in nine languages, the panel inside its budget on a slow CPU with nothing overrunning at 360px, and AI Retouch sending the app's beauty prompt whole with its AVOID list");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
