/* 6.145.0 / panel 6.216.0 — THE LAST ENGLISH ON EVERY PAGE SPEAKS NINE LANGUAGES.
 *
 * The page audit after 6.144.0 walked every page on both surfaces for a visible sentence with Latin letters and
 * no Burmese in a Burmese app. What it found, beyond the brand kickers (.ph-kick), the model names and the
 * workflow titles the studio sells under: Home's "Student Web App" card and its five statline labels; the
 * clock's English weekday and AM/PM (Chromium's Intl has no Burmese, Shan or Kachin data — "my-MM" formats
 * as English); the Workflows' thirteen category names, chips and headings alike; the Library's six
 * collections; three Imagine tools and 62 presets named in English in the Burmese slot; two studio headings.
 * All of it now comes from tables shared verbatim by the web app and the panel.
 *
 * (A batched ellMark read was tried for the panel's Imagine switch and taken back: a label measured beside
 * unclamped siblings in a flex row was cut short. One sentence at a time stays — pinned in A6.)
 *
 * A) the tables on both surfaces, verbatim; the hooks; the Imagine names; ellMark unchanged
 * B) the web app: Home, the clock, the Workflows chips and headings, the Library chips in Burmese and English;
 *    no page shows an untranslated sentence beyond the allowed brand list   C) the panel: the same words from
 *    its own tables and the lifted catalog   D) What's New   E) release pins
 * Usage: PORT=8931 node test/verify_last_english_6145.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");
const WN = require("./lib/whats-new.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const HOME = read("panel/src/ui/screens/home-screen.js");
const WFS = read("panel/src/ui/screens/workflow-tools-screen.js");
const LIBP = read("panel/js/hnk_library_compact_cards.js");
const LIFTER = read("tools/build_panel_wf_catalog.js");
const CATALOG = read("panel/js/hnk_wf_catalog_data.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.148.0", PVER = "6.219.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.145.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 290;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const CATS = ["Face & Portrait", "Background & Scene", "Look Sets", "Studio Scenes", "Style Studio", "Creator Studio", "Lens Styles", "Fashion & Style", "Wedding Suite", "Studio Relight", "Repair & Enhance", "Replace Mix", "Prompt Ideas"];
const COLS = ["Reference", "Lighting", "Exact Skin", "Background", "Makeup", "Baby & Child"];
/* what may still read in English on a Burmese page: the brand kickers, the product and model names, the platforms */
const BRAND = /^(HNK|Freeform Create|Image to Video|Video to Video|Reference Library|Retouch A Studio|Clean Commercial|Portrait Style|No Install · Panel Data · RunningHub AI|GENERATE — RunningHub|Retouch A \/ Retouch B|Photoshop Panel|Describe an Edit|Subject \/ Face|Master Pro Retouch|Derma Skin Pro|Retouch [AB] Style|iPhone \/ iPad \(iOS\)|Windows \/ Mac \(Browser\)|Student Web App)$/;
const MODEL = /Grok|Kling|Flux|veo|Qwen|Seedream|Nano Banana|Wan|GPT|Official|Standard|Quick|Dev|¥/;
const CAPS = /^[A-Z0-9 ·•×\-–—:.\/+%()]+$/;   /* the kickers and section banners are set in capitals — the brand's register */
const PRODUCT = /^Smart Workflow$/;

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 700)));
  if (!ok) failures++;
}
/* a `var NAME = {...};` table as written in a source file */
function grabTable(src, name) {
  const m = src.match(new RegExp("var " + name + " = \\{[\\s\\S]*?\\};\\n")); return m ? m[0] : null;
}
function evalTable(src, name) {
  const t = grabTable(src, name); if (!t) return null;
  const m = {}; new Function("window", t + " window.T = " + name + ";")(m); return m.T;
}

/* ---------------- A) the source ---------------- */
function partA() {
  const home = evalTable(APP, "HOME_UI"), ampm = evalTable(APP, "CLOCK_AMPM"), dw = evalTable(APP, "DATE_WORDS"), wf = evalTable(APP, "WF_CAT9"), lib = evalTable(APP, "LIB_CAT9");
  report("A1) the app's tables: HOME_UI (10 keys), CLOCK_AMPM (9), DATE_WORDS (Burmese, Shan, Kachin — 7 days, 12 months, Burmese digits), WF_CAT9 (the thirteen categories), LIB_CAT9 (the six collections) — every word in all nine base languages",
    !!home && Object.keys(home).length === 10 && Object.values(home).every(all9) && !!ampm && LANGS.every((l) => Array.isArray(ampm[l]) && ampm[l].length === 2) &&
    !!dw && ["my", "shn", "kac"].every((l) => dw[l] && dw[l].days.length === 7 && dw[l].months.length === 12 && typeof dw[l].sep === "string") && dw.my.digits === "၀၁၂၃၄၅၆၇၈၉" &&
    !!wf && CATS.every((c) => all9(wf[c])) && Object.keys(wf).length === 13 && !!lib && COLS.every((c) => all9(lib[c])) && Object.keys(lib).length === 6,
    { home: home && Object.keys(home), wf: wf && Object.keys(wf).length, lib: lib && Object.keys(lib).length });

  report("A2) the panel carries HOME_UI, CLOCK_AMPM, DATE_WORDS and the two clock helpers byte for byte (home-screen.js), and LIB_CAT9 byte for byte (hnk_library_compact_cards.js, indented) — one table, two surfaces",
    ["HOME_UI", "CLOCK_AMPM", "DATE_WORDS"].every((n) => grabTable(APP, n) && grabTable(APP, n) === grabTable(HOME, n)) &&
    (function () { const a = APP.match(/function fmtDateLong\(d, L\)\{[\s\S]*?\n\}\n/), b = HOME.match(/function fmtDateLong\(d, L\)\{[\s\S]*?\n\}\n/); return a && b && a[0] === b[0]; })() &&
    (function () { const a = APP.match(/function clockWords\(s, L\)\{[^\n]*\n/), b = HOME.match(/function clockWords\(s, L\)\{[^\n]*\n/); return a && b && a[0] === b[0]; })() &&
    (function () { const a = grabTable(APP, "LIB_CAT9"); const b = LIBP.match(/var LIB_CAT9 = \{[\s\S]*?\};\n/); const norm = (t) => t.split("\n").map((l) => l.trim()).join("\n"); return !!a && !!b && norm(a) === norm(b[0]); })(),
    { home: ["HOME_UI", "CLOCK_AMPM", "DATE_WORDS"].filter((n) => grabTable(APP, n) !== grabTable(HOME, n)) });

  report("A3) the hooks: Home's data-home nodes (h2, three destinations, five statline labels, the card's aria) painted by homeApplyLang from applyLang; the clock line through fmtDateLong and clockWords on both surfaces with fmtClock12 kept as the shared formatter; the thirteen categories carry tt beside the key t, drawn by grp and the jump chips; the Library chips read LIB_CAT9; the two studio headings",
    (APP.match(/data-home="/g) || []).length === 9 && has(APP, 'data-home-aria="dest_aria"') && has(APP, "function homeApplyLang(){") && has(APP, "  homeApplyLang();      /* 6.145.0") &&
    has(APP, "dt=fmtDateLong(new Date(), LANG);") && has(APP, "var tm=fmtClock12(new Date());\n    tm=clockWords(tm, LANG);") &&
    has(HOME, "var day = fmtDateLong(now, L);") && has(HOME, "var clock = fmtClock12(now);\n    clock = clockWords(clock, L);") &&
    CATS.every((c) => has(APP, 'cats.push({ t:"' + c + '", tt:L9(WF_CAT9["' + c + '"]),')) && has(APP, 'var g=grp(c.tt||c.t, c.items.length+t("unit"), !!c.open, c.ic);') && has(APP, "wfJumpTargets.push({t:c.tt||c.t, n:c.items.length, g:g.g});") &&
    has(APP, 'opts.push([c, L9(LIB_CAT9[c]||{en:c})+" ("+LW.collections[c]+")"]);') && has(LIBP, 'opts.push([c, L9(LIB_CAT9[c] || { en: c }) + " (" + LW.collections[c] + ")"]);') &&
    has(APP, 'host.appendChild(el("div","subh",L9({my:"ရေစာ / လိုဂို",en:"Watermark / Logo",shn:"လၢႆးၼမ်ႉ / လူဝ်ႇၵူဝ်ႇ",kac:"Watermark / Logo",th:"ลายน้ำ / โลโก้",zh:"水印 / 标志",vi:"Watermark / Logo",id:"Watermark / Logo",ms:"Tera air / Logo"})));') && has(read("panel/js/hnk_studio_suites.js"), 'el("div","subh",L9({my:"ရေစာ / လိုဂို",en:"Watermark / Logo",shn:"လၢႆးၼမ်ႉ / လူဝ်ႇၵူဝ်ႇ",kac:"Watermark / Logo",th:"ลายน้ำ / โลโก้",zh:"水印 / 标志",vi:"Watermark / Logo",id:"Watermark / Logo",ms:"Tera air / Logo"}))') && has(APP, 'L9({my:"ကိုယ်တိုင် — One-Tap / Slider",en:"Manual — One-Tap & Sliders",') &&
    has(HOME, "destCard.appendChild(dom.el(doc, \"h2\", { text: l9(HOME_UI.dest_h2) }));") && has(HOME, "stat(206, l9(HOME_UI.st_tap));") && has(HOME, 'stat(163, l9(HOME_UI.st_meitu), "meitu");') &&
    has(WFS, 'text: (ct.title || c.category) + " " + c.ids.length'));

  const D = A.readImagine(); const lat = (s) => typeof s === "string" && !/[က-႟]/.test(s) && /[A-Za-z]{3}/.test(s);
  const left = []; D.tools.forEach((t) => { if (lat(t.name.my)) left.push(t.id); (t.presets || []).forEach((p) => { if (lat(p.name.my)) left.push(t.id + "/" + p.id); }); });
  report("A4) the Imagine tools and presets: no name in the Burmese slot is English any more (65 were), and the lifted panel copy follows the data",
    left.length === 0 && D.tools.find((t) => t.id === "colortone").name.my === "အရောင်နဲ့ အသားအရေ" && has(read("panel/js/hnk_imagine.js"), A.imagineText()), { left: left.slice(0, 10) });

  report("A5) the catalog lift snapshots the name in each language beside the key (tt), and the panel's catalog carries Burmese category names under my and English under en",
    has(LIFTER, 'tt: String(c.tt || ""),') && has(LIFTER, "cat.push({ t: c.tt || c.t, desc: c.desc });") &&
    /"my":\{"sum":\{[\s\S]*?"cat":\[\{"t":"မျက်နှာနဲ့ ပုံတူ"/.test(CATALOG) && /"en":\{"sum":\{[\s\S]*?"cat":\[\{"t":"Face & Portrait"/.test(CATALOG) && /"th":\{"sum":\{[\s\S]*?"cat":\[\{"t":"หน้าและพอร์ตเทรต"/.test(CATALOG));

  /* 6.145.0 tried measuring ellMark's list in one layout (unclamp every unknown box, read them together). It read
     wrong: in a flex ROW a label measured while its siblings were unclamped was squeezed, overflowed, and was CUT
     short — verify_ux_wave_6114 found 34px buttons on Retouch A/B. The per-node measurement stays; this pins it. */
  const ellA = APP.slice(APP.indexOf("function ellMark(root, sel, lines){"), APP.indexOf("function escH(s){")), ellP = MAIN.slice(MAIN.indexOf("function ellMark(root, sel, lines) {"), MAIN.indexOf("globalThis.HNK.ellMark = ellMark;"));
  report("A6) ellMark still measures one sentence at a time on both surfaces (a batched read cut labels short in flex rows), with the guard before phase 2 and the half-line rule unchanged",
    has(ellA, "measured alone, exactly as 6.171.0") && !has(ellA, "var open=[];") && has(ellA, "if(n.scrollHeight>m.ceil+m.lh/2){") && ellA.indexOf("if(!(w>0)) return;") < ellA.indexOf("PHASE 2") &&
    has(ellP, "measured alone, exactly as 6.171.0") && !has(ellP, "const open = [];") && has(ellP, "if (n.scrollHeight > m.ceil + m.lh / 2) {"));
}

/* ---------------- B) the web app ---------------- */
async function partB(browser) {
  const home = evalTable(APP, "HOME_UI"), wf = evalTable(APP, "WF_CAT9"), lib = evalTable(APP, "LIB_CAT9"), ampm = evalTable(APP, "CLOCK_AMPM"), dw = evalTable(APP, "DATE_WORDS");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; });

  const b1 = await page.evaluate(() => {
    switchPage("pgDash");
    const q = (s) => document.querySelector(s);
    const st = {}; document.querySelectorAll("#pgDash [data-home]").forEach((n) => { st[n.getAttribute("data-home")] = n.textContent.trim(); });
    return { lang: LANG, st, aria: q("#pgDash [data-home-aria]").getAttribute("aria-label"), sub: (q("#pgDash .sub") || {}).textContent || "", dateLong: fmtDateLong(new Date(2026, 8, 27), "my"), dateShn: fmtDateLong(new Date(2026, 8, 27), "shn"), dateKac: fmtDateLong(new Date(2026, 8, 27), "kac"), dateTh: fmtDateLong(new Date(2026, 8, 27), "th"), am: clockWords("9:05 AM", "my"), pm: clockWords("4:38 PM", "my"), en: clockWords("4:38 PM", "en"), zh: clockWords("4:38 PM", "zh") };
  });
  report("B1) Home in Burmese: the destinations card and its aria, the three buttons and the five statline labels read the table; the clock line carries a Burmese weekday, month and digits and the Burmese half of the day; the helpers give Shan and Kachin their own names, Thai through Intl, and English AM/PM untouched",
    b1.lang === "my" && Object.keys(home).filter((k) => k !== "dest_aria").every((k) => b1.st[k] === home[k].my) && b1.aria === home.dest_aria.my &&
    /^[က-႟]/.test(b1.sub) && (b1.sub.indexOf("နံနက်") >= 0 || b1.sub.indexOf("ညနေ") >= 0) && !/AM|PM|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/.test(b1.sub) &&
    b1.dateLong === "တနင်္ဂနွေ၊ စက်တင်ဘာ ၂၇" && b1.dateShn === "ဝၼ်းဢႃးတိတ်ႉ၊ သႅပ်ႇထႅမ်ႇပႃႇ 27" && b1.dateKac === "Laban, Septemba 27" && /27/.test(b1.dateTh) && /กันยายน/.test(b1.dateTh) &&
    b1.am === "9:05 နံနက်" && b1.pm === "4:38 ညနေ" && b1.en === "4:38 PM" && b1.zh === "4:38 下午", b1);

  const b2 = await page.evaluate((cats) => {
    switchPage("pgWf");
    const heads = [...document.querySelectorAll("#wfHost .grp-t")].map((e) => e.textContent.trim());
    const chips = [...document.querySelectorAll("#pgWf .chip")].map((e) => e.textContent.trim());
    const keys = (window.HNK_WF_CATALOG || []).map((c) => c.t);
    const tts = (window.HNK_WF_CATALOG || []).map((c) => c.tt);
    return { heads, chips, keys, tts };
  }, CATS);
  const shown = CATS.filter((c) => b2.keys.indexOf(c) >= 0);
  report("B2) Workflows in Burmese: the catalog keeps the English keys (c.t) and carries the Burmese names (c.tt); every shown category's heading and its jump chip read the Burmese name, none reads the English key",
    shown.length >= 10 && shown.every((c) => b2.tts[b2.keys.indexOf(c)] === wf[c].my) &&
    shown.every((c) => b2.heads.some((h) => h === wf[c].my) && b2.chips.some((h) => h.indexOf(wf[c].my + " ") === 0)) &&
    !shown.some((c) => b2.heads.indexOf(c) >= 0 || b2.chips.some((h) => h.indexOf(c + " ") === 0)), { shown: shown.length, heads: b2.heads.slice(0, 4), chips: b2.chips.slice(0, 5) });

  const b3 = await page.evaluate(async () => {
    switchPage("pgLib"); await new Promise((r) => setTimeout(r, 400));
    return { chips: [...document.querySelectorAll("#libFilters .chip")].map((e) => e.textContent.trim()), n: Object.keys(LW.collections).length, counts: LW.collections };
  });
  report("B3) the Library's collection chips read the Burmese names with their counts; the English keys stay the filter",
    b3.n === 6 && COLS.every((c) => b3.chips.some((h) => h === lib[c].my + " (" + b3.counts[c] + ")")) && !COLS.some((c) => b3.chips.some((h) => h.indexOf(c + " (") === 0)), { chips: b3.chips });

  /* every page, phone width: no visible sentence in Latin letters without Burmese, beyond the brand list */
  const b4 = await page.evaluate(async () => {
    const out = {};
    const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
    for (const pg of [...document.querySelectorAll(".page[id^=pg]")].map((n) => n.id)) {
      try { switchPage(pg); } catch (e) {} await new Promise((r) => setTimeout(r, 350));
      const root = document.getElementById(pg); const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const eng = []; let n;
      while ((n = walker.nextNode())) { const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t.length < 14) continue; if (/[က-႟]/.test(t)) continue; if (!/[a-zA-Z]{4}/.test(t)) continue; if (!n.parentElement || !vis(n.parentElement)) continue; eng.push(t.slice(0, 70)); }
      if (eng.length) out[pg] = [...new Set(eng)];
    }
    return out;
  });
  const stray = {};
  Object.keys(b4).forEach((pg) => { const s = b4[pg].filter((t) => !BRAND.test(t) && !MODEL.test(t) && !CAPS.test(t) && !PRODUCT.test(t)); if (s.length) stray[pg] = s; });
  report("B4) every page of the web app, at phone width and in Burmese: no visible sentence in Latin letters without Burmese beyond the brand kickers, the product names and the model names",
    Object.keys(stray).length === 0, stray);

  const b5 = await page.evaluate((home) => {
    const was = LANG; LANG = "en"; applyLang();
    const st = {}; document.querySelectorAll("#pgDash [data-home]").forEach((n) => { st[n.getAttribute("data-home")] = n.textContent.trim(); });
    LANG = was; applyLang();
    return { st, back: document.querySelector("#pgDash [data-home=dest_h2]").textContent.trim() };
  }, home);
  report("B5) in English the same nodes read the English words (Student Web App · AI Tools · Account & license · Tutorials · One-Tap Workflows …), and Burmese comes back",
    Object.keys(home).filter((k) => k !== "dest_aria").every((k) => b5.st[k] === home[k].en) && b5.back === home.dest_h2.my, b5);
  report("B6) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) the panel ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
async function partC(browser) {
  const home = evalTable(APP, "HOME_UI"), wf = evalTable(APP, "WF_CAT9"), lib = evalTable(APP, "LIB_CAT9");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const pp = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = []; pp.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pp.route("**/*", (r) => { const u = r.request().url(); if (u.indexOf("127.0.0.1") >= 0) return r.continue(); if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") }); return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
    await pp.addInitScript(UXP_STUB);
    await pp.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
    await pp.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    await pp.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 30000 });
    await pp.waitForTimeout(800);
    const c1 = await pp.evaluate(async () => {
      HNK.panelNav.switchPage("aitools"); await new Promise((r) => setTimeout(r, 600));
      const root = document.getElementById("pageAiTools");
      const h2 = [...root.querySelectorAll("h2")].map((e) => e.textContent.trim());
      const btns = [...root.querySelectorAll(".unified-actions .btn, .unified-actions button")].map((e) => e.textContent.trim());
      const stats = [...root.querySelectorAll(".dash-stat span, .statline span")].map((e) => e.textContent.trim());
      const sub = (root.querySelector(".sub") || {}).textContent || "";
      HNK.panelNav.switchPage("wf"); await new Promise((r) => setTimeout(r, 700));
      const chips = [...document.querySelectorAll("#hnkWfJump .chip")].map((e) => e.textContent.trim());
      const heads = [...document.querySelectorAll("#hnkWfHost .grp-lbl, #hnkWfHost .grp-t")].map((e) => e.textContent.trim());
      HNK.panelNav.switchPage("presets"); await new Promise((r) => setTimeout(r, 700));
      const libChips = [...document.querySelectorAll("#libFilters .chip")].map((e) => e.textContent.trim());
      return { h2, btns, stats, sub, chips, heads, libChips };
    });
    report("C1) the panel's Home card, buttons and statline read the shared HOME_UI in Burmese; its clock line carries a Burmese weekday and half of the day; the Workflows chips and headings read the lifted Burmese names; the Library chips read LIB_CAT9",
      c1.h2.indexOf(home.dest_h2.my) >= 0 && [home.dest_ai.my, home.dest_acc.my, home.dest_tut.my].every((b) => c1.btns.indexOf(b) >= 0) &&
      [home.st_tap.my, home.st_lib.my, home.st_wf.my, home.st_meitu.my, home.st_evoto.my].every((s) => c1.stats.indexOf(s) >= 0) &&
      /^[က-႟]/.test(c1.sub) && !/AM|PM|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday/.test(c1.sub) &&
      ["Face & Portrait", "Background & Scene", "Wedding Suite", "Repair & Enhance"].every((c) => c1.chips.some((h) => h.indexOf(wf[c].my + " ") === 0) && c1.heads.some((h) => h === wf[c].my)) &&
      !["Face & Portrait", "Wedding Suite"].some((c) => c1.chips.some((h) => h.indexOf(c + " ") === 0)) &&
      COLS.every((c) => c1.libChips.some((h) => h.indexOf(lib[c].my + " (") === 0)), { h2: c1.h2, btns: c1.btns, stats: c1.stats, sub: c1.sub, chips: c1.chips.slice(0, 4), heads: c1.heads.slice(0, 3), lib: c1.libChips });
    report("C2) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgDash");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgDash") === WN.panelRow(WAVE_V, "pgDash") && WN.appRow(WAVE_V, "pgDash").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the Account-language check",
    steps === COUNT && has(CI, "node test/verify_last_english_6145.js") && CI.indexOf("verify_last_english_6145.js") > CI.indexOf("verify_account_lang_6144.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

(async function main() {
  partA();
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
