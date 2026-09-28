/* 6.141.0 / panel 6.212.0 — EVERY CONTROL ANNOUNCES ITSELF.
 *
 * THE MEASUREMENT. A walker over all nineteen web-app pages, at 390 px and at 1280 px, asking each
 * visible control for its accessible name (aria-label, aria-labelledby, a <label>, a title, a
 * placeholder, an image's alt, or its own text — a <select> or <input> never counts its own
 * contents, because "the option that happens to be selected" is not a name for the control):
 *
 *     22 <select>s with no name at all      selLang · rhModelSel · rhQuality · selProvider · selModel ·
 *                                            selRatio · selCount · selSize · selVidModel · selVidRes ·
 *                                            selVidDur · selVidAspect · selVuRes · selVtModel ·
 *                                            selVtOpt1 · selVtOpt2 · selTkModel · selT2IModel ·
 *                                            selT2IRatio · selT2IRes · galKind · galSort
 *     10 role=button images with alt=""     the Home card's recent thumbnails
 *      6 album inputs                        albFreeW · albFreeH · albCustomUnit · albFont_title ·
 *                                            albFont_subtitle · albFont_names
 *
 * and the panel's own twenty-two selects, wrapped in .hsl-btn pickers that showed a value and no
 * name. A screen reader read "combo box, 1080p" and "combo box, 5 s" on the Video page with no way
 * to tell which was Resolution and which Duration.
 *
 * THE FIX. One nine-language table of words (A11Y_WORDS), shared by both surfaces; a map from
 * control id to "context · word" ("Video · Resolution"); one pass that applies it, run at boot and
 * on every language change — a11yNameControls() from a11yApplyLang() in the app, a11yNamesApply()
 * through REFRESHERS in the panel, where the name also becomes the picker dialog's title (hslPick
 * reads aria-label) so the sheet says what it is choosing instead of a generic "Choose". The Home
 * recents get an alt that says what they are and where they go; the album's width, height, unit
 * and font controls take their captions as names (a new alb_unit string, in all eighteen packs);
 * every hidden mirror file input leaves the accessibility tree, since the buttons that drive them
 * carry the names.
 *
 * A) the code on both surfaces   B) the web app walked at two widths, in two languages
 * C) the panel walked, and the picker dialog titled   D) What's New   E) release pins
 * Usage: PORT=8931 node test/verify_named_controls_6141.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { APP_INIT } = require("../tools/build_panel_studio_suites.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const ALBUM = read("docs/app/data/album-module.js");
const PALBUM = read("panel/js/hnk_album.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.150.0", PVER = "6.221.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.141.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 292;
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const APP_SELECTS = ["selLang", "rhModelSel", "rhQuality", "selProvider", "selModel", "selRatio", "selCount", "selSize", "selVidModel", "selVidRes", "selVidDur", "selVidAspect", "selVuRes", "selVtModel", "selVtOpt1", "selVtOpt2", "selTkModel", "selT2IModel", "selT2IRatio", "selT2IRes", "galKind", "galSort"];
const PANEL_SELECTS = ["gateLang", "selLang", "rhModelSel", "rhQuality", "ffModel", "ffRatio", "ffCount", "ffSize", "t2iModel", "t2iRes", "t2iRatio", "galKind", "galSort", "vidModel", "vidRes", "vidDur", "vidAspect", "vuRes", "vtModel", "vtOpt", "vtOpt2", "tkModel"];
const WORDS = ["lang", "model", "quality", "engine", "ratio", "count", "size", "res", "dur", "kind", "sort", "opt1", "opt2", "video", "vup", "v2v", "talk", "t2i", "gallery", "freeform", "rh", "recent", "recentV"];

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
}

/* THE WALKER — evaluated in the page. Every visible control that the accessibility tree would
   expose, and the name it would be given; a <select>, <input> or <textarea> never counts its own
   contents as a name. */
const WALK = `(function(rootSel){
  var root = rootSel ? document.querySelector(rootSel) : document; if(!root) return { err: "no root " + rootSel };
  var vis = function(n){ var r = n.getBoundingClientRect(); var cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  var hiddenAT = function(n){ for(var e = n; e; e = e.parentElement){ if(e.getAttribute && e.getAttribute("aria-hidden") === "true") return true; } return false; };
  var txt = function(e){ return (e && e.textContent || "").replace(/\\s+/g, " ").trim(); };
  var nameOf = function(n){
    var al = n.getAttribute("aria-label"); if(al && al.trim()) return al.trim();
    var lb = n.getAttribute("aria-labelledby"); if(lb){ var t = lb.split(/\\s+/).map(function(i){ return document.getElementById(i); }).filter(Boolean).map(txt).join(" ").trim(); if(t) return t; }
    if(n.labels && n.labels.length){ var t2 = Array.prototype.map.call(n.labels, txt).join(" ").trim(); if(t2) return t2; }
    if(n.title && n.title.trim()) return n.title.trim();
    if(/INPUT|TEXTAREA/.test(n.tagName) && n.placeholder && n.placeholder.trim()) return n.placeholder.trim();
    if(n.tagName === "INPUT" && /^(submit|button|reset)$/.test(n.type) && n.value) return n.value;
    if(/SELECT|INPUT|TEXTAREA/.test(n.tagName)) return "";
    if(n.tagName === "IMG") return (n.alt || "").trim();
    var tx = txt(n); if(tx) return tx;
    var im = n.querySelector("img[alt]"); if(im && im.alt.trim()) return im.alt.trim();
    return "";
  };
  var sel = "button,[role=button],a[href],select,input:not([type=hidden]),textarea,[role=tab],[role=link],[role=checkbox],[role=switch],[role=slider],[role=menuitem]";
  var all = Array.prototype.filter.call(root.querySelectorAll(sel), function(n){ return vis(n) && !hiddenAT(n); });
  var nameless = all.filter(function(n){ return !nameOf(n); }).map(function(n){ return (n.id || n.className || n.tagName).toString().slice(0, 50) + "<" + n.tagName.toLowerCase() + (n.type ? ":" + n.type : "") + ">"; });
  return { controls: all.length, nameless: nameless };
})`;

/* ===================== A) the code ===================== */

/* the words block alone — main.js has other objects with an `engine:` key */
function wordsBlock(src) { const i = src.indexOf("A11Y_WORDS = {"); return i < 0 ? "" : src.slice(i, src.indexOf("\n};", i) + 3); }
function wordLine(src, key) { return new RegExp("\\n\\s*" + key + ":\\s*\\{[^\\n]*\\}").exec(wordsBlock(src)); }
function nineLangWord(src, key) {
  const m = wordLine(src, key);
  if (!m) return false;
  return LANGS.every((c) => new RegExp("[{,]" + c + ':"').test(m[0]));
}
function partA() {
  report("A1) the web app carries the words, the map for all twenty-two selects and the pass, and a11yApplyLang runs the pass last — so a language change renames every control",
    has(APP, "var A11Y_WORDS = {") && has(APP, "var A11Y_SELECTS = {") && has(APP, "function a11yNameControls(){") &&
    has(APP, "  a11yNameControls();   /* 6.141.0 */\n}") &&
    APP_SELECTS.every((id) => new RegExp("\\b" + id + ":\\[").test(APP)), { missing: APP_SELECTS.filter((id) => !new RegExp("\\b" + id + ":\\[").test(APP)) });

  report("A2) the panel carries the same words and its own map for its twenty-two selects; the pass names the <select> and the .hsl-btn the customer taps, runs at boot and again on every language switch",
    has(MAIN, "const A11Y_WORDS = {") && has(MAIN, "const A11Y_SELECTS_PANEL = {") && has(MAIN, "function a11yNamesApply() {") &&
    has(MAIN, 'safe("a11y:names", a11yNamesApply);') && has(MAIN, "REFRESHERS.push(function () { try { a11yNamesApply(); } catch (e) { } });") &&
    has(MAIN, 'if (btn) btn.setAttribute("aria-label", name);') &&
    PANEL_SELECTS.every((id) => new RegExp("\\b" + id + ":\\[").test(MAIN)), { missing: PANEL_SELECTS.filter((id) => !new RegExp("\\b" + id + ":\\[").test(MAIN)) });

  report("A3) every word is written in all nine base languages, identically on both surfaces",
    WORDS.every((k) => nineLangWord(APP, k) && nineLangWord(MAIN, k)) &&
    WORDS.every((k) => { const a = wordLine(APP, k), b = wordLine(MAIN, k); return a && b && a[0].trim() === b[0].trim(); }),
    { app: WORDS.filter((k) => !nineLangWord(APP, k)), panel: WORDS.filter((k) => !nineLangWord(MAIN, k)) });

  const fileInputs = APP.match(/<input type="file"[^>]*>/g) || [];
  report("A4) the Home recents say what they are and where they go, and every hidden mirror file input has left the accessibility tree — the buttons that drive them carry the names",
    has(APP, 'im.alt=L9(it.kind==="video"?A11Y_WORDS.recentV:A11Y_WORDS.recent); im.setAttribute("aria-label",im.alt);') &&
    fileInputs.length >= 14 && fileInputs.every((t) => has(t, 'aria-hidden="true"') && has(t, 'tabindex="-1"')),
    { fileInputs: fileInputs.length, unhidden: fileInputs.filter((t) => !has(t, 'aria-hidden="true"')).length });

  report("A5) the album's width, height, unit and font controls take their captions as names — in the app's module and in the panel's lifted copy — and the unit has a word in all eighteen packs",
    has(ALBUM, 'n.setAttribute("aria-label", label); r.setAttribute("aria-label", label);') &&
    has(ALBUM, 'us.setAttribute("aria-label", L("alb_unit"));') &&
    has(ALBUM, 'sel.setAttribute("aria-label", L("alb_font") + " \\u00b7 " + pick9(role.label));') &&
    has(PALBUM, 'us.setAttribute("aria-label", L("alb_unit"));') && has(PALBUM, 'n.setAttribute("aria-label", label); r.setAttribute("aria-label", label);') &&
    has(APP, 'alb_unit:{my:"ယူနစ်",en:"Unit"}') && has(read("docs/app/data/trmore.js"), '"alb_unit":{"shn":') &&
    fs.readdirSync(path.join(ROOT, "docs/app/data")).filter((f) => /^trl-[a-z]+\.js$/.test(f)).every((f) => { const s = read("docs/app/data/" + f); return has(s, '"alb_unit":') || /^trl-(tdd|khb|kht)\.js$/.test(f); }),
    { packs: fs.readdirSync(path.join(ROOT, "docs/app/data")).filter((f) => /^trl-[a-z]+\.js$/.test(f)).filter((f) => !has(read("docs/app/data/" + f), '"alb_unit":')) });
}

/* ===================== B) the web app, walked ===================== */

async function partB(browser) {
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    await page.addInitScript(APP_INIT);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} try { var s = document.getElementById("splash"); if (s) s.remove(); } catch (e) {} });
    const pages = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll(".page[id^=pg]"), (n) => n.id));
    const bad = {}; let controls = 0;
    for (const pg of pages) {
      await page.evaluate((id) => { try { switchPage(id); } catch (e) {} }, pg);
      await page.waitForTimeout(350);
      const r = await page.evaluate(`${WALK}(${JSON.stringify("#" + pg)})`);
      controls += r.controls || 0;
      if (r.err || (r.nameless && r.nameless.length)) bad[pg] = r.err || r.nameless;
    }
    report("B1) at " + vp.width + " px every visible control on all " + pages.length + " pages has a name (" + controls + " controls walked)",
      pages.length >= 19 && controls > 800 && Object.keys(bad).length === 0, bad);

    const names = await page.evaluate((ids) => {
      const out = {}; ids.forEach((id) => { const n = document.getElementById(id); out[id] = n ? n.getAttribute("aria-label") : null; }); return out;
    }, APP_SELECTS);
    report("B2) at " + vp.width + " px the twenty-two selects read as context · word in the studio's language (" + JSON.stringify(names.selVidRes) + ", " + JSON.stringify(names.galSort) + ")",
      APP_SELECTS.every((id) => names[id] && names[id].length > 1) &&
      names.selVidRes === (await page.evaluate(() => L9(A11Y_WORDS.video) + " · " + L9(A11Y_WORDS.res))) &&
      names.selLang === (await page.evaluate(() => L9(A11Y_WORDS.lang))) &&
      names.selVidRes !== names.selVidDur && names.selVidModel !== names.selTkModel, names);

    if (vp.width === 1280) {
      const en = await page.evaluate(() => { LANG = "en"; applyLang(); return { res: document.getElementById("selVidRes").getAttribute("aria-label"), sort: document.getElementById("galSort").getAttribute("aria-label"), t2i: document.getElementById("selT2IModel").getAttribute("aria-label"), lang: document.getElementById("selLang").getAttribute("aria-label") }; });
      report("B3) a language change renames every control: in English the Video page's resolution is \"Video · Resolution\", the Gallery's sort \"Gallery · Sort order\", the text-to-image model \"Text to image · Model\"",
        en.res === "Video · Resolution" && en.sort === "Gallery · Sort order" && en.t2i === "Text to image · Model" && en.lang === "Language", en);
      const dash = await page.evaluate(async () => {
        try {
          const d = await galDb(); await new Promise((res, rej) => { const tx = d.transaction("gal", "readwrite"); tx.objectStore("gal").put({ id: 424242, kind: "image", mime: "image/png", b64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", ts: Date.now() }); tx.oncomplete = res; tx.onerror = rej; });
        } catch (e) { return { err: String(e) }; }
        switchPage("pgDash"); renderDashRecent(); await new Promise((r) => setTimeout(r, 700));
        const im = document.querySelector("#dashRecent img"); return { img: !!im, alt: im && im.alt, label: im && im.getAttribute("aria-label"), role: im && im.getAttribute("role") };
      });
      report("B4) a Home recent thumbnail is a button that says what it is and where it goes", dash.img && dash.role === "button" && dash.alt === "Recent image — open in the Gallery" && dash.label === dash.alt, dash);
    }
    report("B5) no page error at " + vp.width + " px", errs.length === 0, errs);
    await ctx.close();
  }
}

/* ===================== C) the panel, walked ===================== */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const PANEL_PAGES = ["gallery", "vidup", "v2v", "talk", "create", "path", "aitools", "wf", "prompt", "imagine", "presets", "album", "video", "setup"];

async function partC(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const panel = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = [];
    panel.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await panel.route("**/*", (route) => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await panel.addInitScript(UXP_STUB);
    await panel.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await panel.waitForTimeout(2500);
    await panel.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name && d.planLine); } catch (e) { return false; } }, null, { timeout: 20000 }).catch(() => {});

    const bad = {}; let controls = 0;
    for (const k of PANEL_PAGES) {
      await panel.evaluate((key) => { try { switchPage(key); } catch (e) {} }, k);
      await panel.waitForTimeout(350);
      const r = await panel.evaluate(`${WALK}(null)`);
      controls += r.controls || 0;
      if (r.err || (r.nameless && r.nameless.length)) bad[k] = r.err || r.nameless;
    }
    report("C1) every visible control on the panel's " + PANEL_PAGES.length + " pages has a name (" + controls + " controls walked)", controls > 400 && Object.keys(bad).length === 0, bad);

    const names = await panel.evaluate((ids) => {
      const out = {}; ids.forEach((id) => { const n = document.getElementById(id); const w = n && n.parentNode && n.parentNode.classList.contains("hsl") ? n.parentNode.querySelector(".hsl-btn") : null; out[id] = n ? [n.getAttribute("aria-label"), w ? w.getAttribute("aria-label") : "(no hsl)"] : null; }); return out;
    }, PANEL_SELECTS);
    report("C2) the panel's twenty-two selects are named, and where a picker button stands in for one it carries the same name",
      PANEL_SELECTS.every((id) => names[id] && names[id][0] && names[id][0].length > 1 && (names[id][1] === "(no hsl)" || names[id][1] === names[id][0])) &&
      names.vidRes[0] !== names.vidDur[0], names);

    const dlg = await panel.evaluate(() => { switchPage("video"); const s = document.getElementById("vidRes"); const b = s.parentNode.querySelector(".hsl-btn"); hslPickFor(b); const h = document.querySelector("#hnkPick .hnk-dlg-msg"); const t = h && h.textContent; try { hslPickClose(); } catch (e) {} return { title: t, expect: s.getAttribute("aria-label") }; });
    report("C3) the picker dialog is titled with the control's name instead of the generic word — \"" + dlg.title + "\"", !!dlg.title && dlg.title === dlg.expect, dlg);
    report("C4) no page error in the panel", errs.length === 0, errs);
    await panel.close();
  } finally { server.close(); }
}

/* ===================== D) What's New · E) release pins ===================== */

function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgHome");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgHome") === WN.panelRow(WAVE_V, "pgHome") && WN.appRow(WAVE_V, "pgHome").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the retouch workflow check it follows",
    steps === COUNT && has(CI, "node test/verify_named_controls_6141.js") && CI.indexOf("verify_named_controls_6141.js") > CI.indexOf("verify_retouch_workflow_6140.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

/* ===================== run ===================== */

(async function main() {
  partA();
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
