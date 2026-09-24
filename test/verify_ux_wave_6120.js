/* 6.120.0 / panel 6.191.0 — UI/UX wave E: motion + loading, on the three surfaces.

   WHAT WAS MEASURED (every page of the app and the panel, the landing, under the OS preference and without it):
   - under prefers-reduced-motion the app already stood still (its media rules) and the landing kept one decorative
     sheen sweeping (.ch-media::before — the global rule matched elements, not pseudo-elements); the panel has no
     autoplaying clip at all and one keyframe (the Imagine ring). Neither surface offered the student a choice, and
     Photoshop exposes no system preference to the panel at all.
   - waiting: every generation page switches a .spin line on and hides the result card until the picture lands —
     no aria-busy, no live region, the card arriving 800px tall in one jump.
   - the boot: on a phone the header shrank 11px (the raw language <select> painted 55px tall before it was wrapped),
     the tab bar grew 14px (labels appended, 55px reserved), <main> moved 4px (the markup's page and the restored
     page collapse different top margins out of it) and the footer showed for a second — a layout-shift score of
     0.95 at 390px, 0.47 at 1440px. The landing's language picker widened 35 → 127px when its button was built: 0.20.
   NOW: Setup ▸ SETTINGS has Motion: Full · Reduced on both surfaces (the app also follows the OS preference, live);
   html.motion-reduce / body.motion-reduce is the one switch; the result card is on screen as a sized skeleton while
   a job runs (aria-busy, the spinner a live region); the boot shift is 0 on both widths; the landing's picker
   reserves its width and its pseudo-elements stop too.

   A) source pins   B) the app: OS preference at boot, the Settings switch live, the boot shift, the skeleton
   C) the landing   D) the panel: the row, the switch, the still spinner, the skeleton, the settings file   E) release */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");
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
const PHTML = read("panel/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.120.0", PVER = "6.191.0";
const PANEL = path.join(ROOT, "panel");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2" };

let failures = 0;
function report(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failures++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 900) : "")); }
}
const has = (s, t) => s.indexOf(t) >= 0;
/* the object literal after a marker, evaluated — comments and apostrophes inside are fine */
function objAfter(src, marker) {
  const at = src.indexOf(marker); if (at < 0) return null;
  const start = src.indexOf("{", at); let depth = 0, i = start, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) break; }
  }
  return vm.runInNewContext("(" + src.slice(start, i + 1) + ")");
}

/* ================= A) source ================= */
function sourcePins() {
  report("A1) the app's one motion switch: html.motion-reduce goes on before the first paint (OS preference or the stored choice), collapses every animation and transition, hides the hero and greeting clips; motionApply() mirrors the OS preference live and pauses / resumes the clips; the splash, the hero clips and the greeting clip read it",
    has(APP, 'if (_mo0 === "reduced" || _mq0) document.documentElement.classList.add("motion-reduce");') &&
    has(APP, "html.motion-reduce *,html.motion-reduce *::before,html.motion-reduce *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}") &&
    has(APP, "html.motion-reduce video.ph-motion,html.motion-reduce .dash-greet video.greet-motion{display:none}") &&
    has(APP, 'var MOTION_KEY="hnk_ws_motion";') && has(APP, "function motionReduced(){ return motionGet()===\"reduced\" || motionOsReduced(); }") &&
    has(APP, 'root.classList.toggle("motion-reduce", on);') && has(APP, 'if(typeof motionReduced==="function" && motionReduced()) return;   /* 6.120.0 */') &&
    has(APP, 'if(typeof motionReduced==="function" ? motionReduced() : (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;') &&
    has(APP, 'try{ if(localStorage.getItem("hnk_ws_motion")==="reduced") reduce = true; }catch(e){}') &&
    !/phMotionBoot\(\)\{\s*try\{\s*if\(window\.matchMedia && matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return;/.test(APP), null);
  report("A2) the loading skeleton: .result-box.pending shows the card with only its heading and a shimmering picture box in the picked ratio (--pend-ar, 3/4 default); the spinner class drives it through pendBox for the six generation pages (busy-only on Retouch A/B); the spinner lines are live regions; the two-pane desktop layout counts a pending card like a finished one",
    has(APP, ".result-box.pending{display:block}") && has(APP, ".result-box.pending>*{display:none}") && has(APP, ".result-box.pending>h2,.result-box.pending>.result-img{display:block}") &&
    has(APP, ".result-box.pending .result-img{position:relative;aspect-ratio:var(--pend-ar,3/4);background:") &&
    /* 6.128.0 — the table this wave wrote held the eight generate controls of the
       day; Path and the V2 batch joined it then, without a skeleton, so the pin
       names all ten rather than freezing the wave's own eight. */
    has(APP, 'var PEND_BOX={spin:["resultBox",1],vidSpin:["vidResultBox",1],vuSpin:["vuResultBox",1],vtSpin:["vtResultBox",1],tkSpin:["tkResultBox",1],t2iSpin:["t2iResultBox",1],stSpin:["stResultBox",0],rsSpin:["rsResultBox",0],ptSpin:["ptRunCard",0],v2Spin:["v2RunCard",0]};') &&
    has(APP, 'sp.setAttribute("role","status"); sp.setAttribute("aria-live","polite");') && has(APP, 'new MutationObserver(function(){ var now=/\\bon\\b/.test(sp.className); if(now!==last){ last=now; pendBox(id, now); } }).observe(sp,{attributes:true,attributeFilter:["class"]});') &&
    (APP.match(/:has\(>\.result-box\.on,>\.result-box\.pending\)/g) || []).length === 36 && !has(APP, ":has(>.result-box.on)"), { twoPane: (APP.match(/:has\(>\.result-box\.on,>\.result-box\.pending\)/g) || []).length });
  report("A3) the boot shift, closed at the source: the tab bar reserves its filled 69px, the header's raw language <select> holds the picker's 116×41 footprint (invisible) until upgrade() wraps it and clears the inline sizes, <main> keeps its children's margins inside (flow-root) and stands at least a screen tall, the version tag reserves its slot",
    has(APP, ".tabbar{min-height:69px}") && !has(APP, ".tabbar{min-height:55px}") &&
    has(APP, '<select class="inp" id="selLang" style="width:116px;max-width:132px;min-width:0;height:41px;min-height:41px;padding:0;font-size:16px;visibility:hidden"></select>') &&
    has(APP, 'if(id==="selLang"){ sel.style.width=""; sel.style.maxWidth=""; sel.style.minWidth=""; sel.style.height=""; sel.style.minHeight=""; sel.style.padding=""; sel.style.visibility=""; }') &&
    has(APP, "main.wrap{display:flow-root;min-height:calc(100vh - 65px)}") && has(APP, ".nav-tag{margin-left:auto;font-size:11px;color:var(--muted);min-width:48px;text-align:right}"), null);
  const PW = objAfter(APP, "var PREFS_W=") || {}, PL = objAfter(MAIN, "const PREFS_L = {") || {};
  const same = ["motion", "mFull", "mReduced"].every((k) => PW[k] && PL[k] && LANGS.every((l) => PW[k][l] && PW[k][l] === PL[k][l]));
  report("A4) Setup ▸ SETTINGS: the Motion row (label · Full · Reduced) on both surfaces, the three words identical in all nine languages (the parity walk); the app adds a note only when the device itself asks for reduced motion",
    same && has(APP, '<div class="row prefs-row" id="prefsMotionRow">') && has(APP, '<button class="chip" id="prefsMotionFull" data-motion="full"></button>') && has(APP, '<button class="chip" id="prefsMotionReduced" data-motion="reduced"></button>') &&
    has(APP, 'var mn=$("prefsMotionNote"); if(mn) mn.textContent = motionOsReduced() ? L9(PREFS_W.mOs) : "";') && PW.mOs && LANGS.every((l) => PW.mOs[l] && PW.mOs[l].length > 8) &&
    has(PHTML, '<div class="row prefs-row" id="prefsMotionRow">') && has(PHTML, '<div role="button" tabindex="0" class="chip" id="prefsMotionFull"></div>') && has(PHTML, '<div role="button" tabindex="0" class="chip" id="prefsMotionReduced"></div>'),
    { motion: PW.motion && PW.motion.en, panel: PL.motion && PL.motion.en, same });
  report("A5) the panel: state.motion (\"full\" default) → body.motion-reduce through applyMotion, motionSetP saves and repaints, loadSettings restores it, spinFrame leaves the ring and the bar still under it; styles.css stills every transition it declares by class (the sheet forbids *) and the Imagine ring; pendBoxP marks the Freeform and Video result cards pending / busy from the run start to the run end",
    has(MAIN, '  motion: "full",') && has(MAIN, "function motionReducedP() { return state.motion === \"reduced\"; }") && has(MAIN, 'if (motionReducedP()) rest.push("motion-reduce");') &&
    has(MAIN, 'motion: state.motion === "reduced" ? "reduced" : "full",   /* 6.191.0 — motion */') && has(MAIN, 'if (o.motion === "reduced") { state.motion = "reduced"; try { applyMotion(); } catch (eM) { } }') &&
    has(MAIN, "  if (motionReducedP()) return;   /* 6.191.0 — reduced motion: the ring and the bar stand still, the seconds text still counts */") &&
    has(MAIN, 'const PEND_BOX_P = { spin: "resultBox", vidSpin: "vidResultBox", vuSpin: "vuResultBox", vtSpin: "vtResultBox", tkSpin: "tkResultBox" };') &&
    has(MAIN, '  try { pendBoxP("spin", true); } catch (e) { }') && has(MAIN, '  try { pendBoxP("spin", false); } catch (e) { }') && has(MAIN, '  try { pendBoxP("vidSpin", true); } catch (e) { }') && has(MAIN, '  try { pendBoxP("vidSpin", false); } catch (e) { }') &&
    has(PCSS, "body.motion-reduce, body.motion-reduce .app, body.motion-reduce .tabb, body.motion-reduce .card, body.motion-reduce .btn,") && has(PCSS, "body.motion-reduce .im-spin { animation: none; }") &&
    has(PCSS, ".apg .card.result-box.pending { display: block; }") && has(PCSS, ".apg .result-box.pending .result-img { height: 220px; background-color: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; }"), null);
  report("A6) the landing: the reduced-motion rule reaches the pseudo-elements (the cinema cards' sheen), the language picker reserves its filled width at every breakpoint (123 · 127 under 640 · 111 under 380), and the hero picture states its 2000×1000 so the phone layout reserves its height",
    has(LANDING, "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}*::before,*::after{transition:none!important;animation:none!important}html{scroll-behavior:auto}}") &&
    has(LANDING, "  min-width:123px; /* 6.120.0") && has(LANDING, "@media (max-width:639px){.lsl-btn{width:88px}.langsel{min-width:127px}}") && has(LANDING, ".langsel{min-width:111px}}") &&
    has(LANDING, '<img src="assets/site/hero-fairy.jpg" width="2000" height="1000" alt='), null);
}

/* ================= B) the app ================= */
const RUNNING = () => {
  /* a transition or keyframe collapsed to .01ms by html.motion-reduce can be sampled mid-flight; motion is anything longer than 50ms or endless */
  const longEnough = (a) => { try { const t = a.effect.getComputedTiming(); return t.iterations === Infinity || (Number(t.duration) || 0) * (Number(t.iterations) || 1) > 50; } catch (e) { return true; } };
  const anims = document.getAnimations().filter((a) => a.playState === "running" && longEnough(a));
  const inf = [...document.querySelectorAll("*")].filter((el) => { const cs = getComputedStyle(el); return el.getClientRects().length && cs.animationName !== "none" && cs.animationPlayState !== "paused" && cs.animationIterationCount.split(",").some((x) => x.trim() === "infinite") && parseFloat(cs.animationDuration) > 0.05; }).length;
  const vids = [...document.querySelectorAll("video")];
  return { running: anims.length, infinite: inf, clips: vids.filter((v) => /ph-motion|greet-motion/.test(v.className)).length, playing: vids.filter((v) => !v.paused && !v.ended && v.readyState > 0).map((v) => v.className.split(" ")[0]), reduce: document.documentElement.classList.contains("motion-reduce") };
};
async function openApp(browser, w, h, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: h } }, opts || {}));
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); localStorage.setItem("hnk_nw_seen", "1"); });
  await page.addInitScript(() => { window.__cls = 0; window.__clsN = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__cls += e.value; window.__clsN++; } } }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?lang=en`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchPage === "function", null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
async function appMotion(browser) {
  /* B1 — the OS preference: the class before boot finishes, no clip plays and nothing loops on any page */
  {
    const { ctx, page, errs } = await openApp(browser, 1440, 900, { reducedMotion: "reduce" });
    const pages = await page.evaluate(() => [...document.querySelectorAll(".page[id^=pg]")].map((p) => p.id));
    const moving = {};
    for (const id of pages) {
      const m = await page.evaluate(new Function("id", "return (async () => { switchPage(id); await new Promise(r => setTimeout(r, 700)); return (" + RUNNING.toString() + ")(); })();"), id);
      if (m.running || m.infinite || m.playing.length || !m.reduce) moving[id] = m;
    }
    const built = await page.evaluate(() => document.querySelectorAll("video.ph-motion").length);
    report(`B1) the app under the OS preference (prefers-reduced-motion): html.motion-reduce from boot, ${pages.length} pages walked — no running animation, no looping keyframe, no clip playing; the hero clips are still built (${built}) so Full can start them later; no page error`,
      pages.length >= 18 && Object.keys(moving).length === 0 && built >= 5 && errs.length === 0, { moving, built, errs });
    await ctx.close();
  }
  /* B2 — the Settings switch, live: Reduced pauses the clips and stills the page; Full resumes them */
  {
    const { ctx, page, errs } = await openApp(browser, 1440, 900);
    const setupPage = await page.evaluate(() => { const c = document.getElementById("cardPrefs"); const p = c && c.closest(".page"); return p ? p.id : null; });
    const before = await page.evaluate(new Function("return (async () => { switchPage('pgHome'); await new Promise(r => setTimeout(r, 2500)); return (" + RUNNING.toString() + ")(); })();"));
    const row = await page.evaluate(new Function("pg", "return (async () => { switchPage(pg); await new Promise(r => setTimeout(r, 400)); const l = document.getElementById('prefsMotionL'), f = document.getElementById('prefsMotionFull'), r = document.getElementById('prefsMotionReduced'); const vis = (e) => e && e.getClientRects().length > 0; return { label: l && l.textContent, full: f && f.textContent, reduced: r && r.textContent, vis: vis(l) && vis(f) && vis(r), fullOn: f && /\\bon\\b/.test(f.className), redOn: r && /\\bon\\b/.test(r.className), pressed: f && f.getAttribute('aria-pressed') }; })();"), setupPage);
    await page.click("#prefsMotionReduced");
    await page.waitForTimeout(400);
    const afterRed = await page.evaluate(new Function("return (async () => { const m = (" + RUNNING.toString() + ")(); m.stored = localStorage.getItem('hnk_ws_motion'); m.redOn = /\\bon\\b/.test(document.getElementById('prefsMotionReduced').className); m.paused = [...document.querySelectorAll('video.ph-motion,video.greet-motion')].every(v => v.paused); switchPage('pgHome'); await new Promise(r => setTimeout(r, 900)); const h = (" + RUNNING.toString() + ")(); m.home = { running: h.running, infinite: h.infinite, playing: h.playing, reduce: h.reduce }; return m; })();"));
    const setupBack = await page.evaluate(new Function("pg", "return (async () => { switchPage(pg); await new Promise(r => setTimeout(r, 300)); return true; })();"), setupPage);
    await page.click("#prefsMotionFull");
    const afterFull = await page.evaluate(new Function("return (async () => { switchPage('pgHome'); scrollTo(0, 0); const t0 = Date.now(); let m; while (Date.now() - t0 < 6000) { m = (" + RUNNING.toString() + ")(); if (m.playing.length) break; await new Promise(r => setTimeout(r, 200)); } m.stored = localStorage.getItem('hnk_ws_motion'); return m; })();"));
    report("B2) Setup ▸ SETTINGS ▸ Motion, live: the row shows Motion · Full · Reduced (Full pressed); Reduced puts html.motion-reduce on, stores the choice, pauses every hero / greeting clip and leaves Home with nothing running or looping; Full takes the class off and a clip is playing on Home again within six seconds — no reload, no page error",
      setupPage && row.vis && row.label === "Motion" && row.full === "Full" && row.reduced === "Reduced" && row.fullOn && !row.redOn && row.pressed === "true" &&
      before.playing.length >= 1 && !before.reduce &&
      afterRed.reduce && afterRed.stored === "reduced" && afterRed.redOn && afterRed.paused && afterRed.home.running === 0 && afterRed.home.infinite === 0 && afterRed.home.playing.length === 0 &&
      setupBack && !afterFull.reduce && afterFull.stored === "full" && afterFull.playing.length >= 1 && errs.length === 0,
      { setupPage, row, before: { playing: before.playing, reduce: before.reduce }, afterRed: { reduce: afterRed.reduce, stored: afterRed.stored, paused: afterRed.paused, home: afterRed.home }, afterFull: { reduce: afterFull.reduce, stored: afterFull.stored, playing: afterFull.playing }, errs });
    /* the stored choice survives a reload and is on <html> before boot finishes */
    await page.evaluate(() => localStorage.setItem("hnk_ws_motion", "reduced"));
    await page.reload({ waitUntil: "domcontentloaded" });
    const early = await page.evaluate(() => document.documentElement.classList.contains("motion-reduce"));
    await page.waitForFunction(() => typeof switchPage === "function", null, { timeout: 30000 }); await page.waitForTimeout(1200);
    const late = await page.evaluate(new Function("return (" + RUNNING.toString() + ")();"));
    report("B3) a stored Reduced is on <html> at DOMContentLoaded (the head script) and holds after boot: no clip playing, nothing looping", early && late.reduce && late.playing.length === 0 && late.infinite === 0, { early, late });
    await ctx.close();
  }
}
async function appBootShift(browser) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page, errs } = await openApp(browser, w, h);
    await page.waitForTimeout(1500);
    const cls = await page.evaluate(() => ({ cls: +window.__cls.toFixed(4), n: window.__clsN }));
    const geom = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), w: Math.round(b.width) }; }; return { nav: r(".nav"), tabbar: r("#tabbar"), main: r("#mainWrap"), foot: r("footer.foot"), hsl: document.querySelector(".nav .hsl") ? r(".nav .hsl") : null, selInline: document.getElementById("selLang").getAttribute("style") }; });
    report(`B4) the boot at ${w}px: the whole start-up records a layout-shift score under 0.05 (was ${w === 390 ? "0.95" : "0.47"}) — the header stays 65px, the tab bar 69px, the footer below the first screen; the wrapped language select has shed its inline footprint`,
      cls.cls < 0.05 && geom.nav.h === 65 && (w === 390 ? geom.tabbar.h === 69 : true) && geom.foot.y >= h && geom.hsl && !/width:116px/.test(geom.selInline || "") && errs.length === 0, { cls, geom, errs });
    await ctx.close();
  }
}
async function appSkeleton(browser) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page, errs } = await openApp(browser, w, h);
    const r = await page.evaluate(async () => {
      const out = {};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      switchPage("pgCreate"); await wait(300);
      const sp = document.getElementById("spin"), box = document.getElementById("resultBox"), img = box.querySelector(".result-img");
      out.spinA11y = { role: sp.getAttribute("role"), live: sp.getAttribute("aria-live") };
      document.getElementById("selRatio").value = "9:16";
      sp.className = "spin on"; sp.textContent = "Generating — allow 20-60 seconds… · 3s"; await wait(200);
      const card = document.getElementById("btnGen").closest(".card");
      out.pending = { cls: box.className, busy: box.getAttribute("aria-busy"), ar: box.style.getPropertyValue("--pend-ar"), display: getComputedStyle(box).display, imgAr: getComputedStyle(img).aspectRatio, imgH: Math.round(img.getBoundingClientRect().height), imgW: Math.round(img.getBoundingClientRect().width), dlVisible: document.getElementById("btnDl").getClientRects().length > 0, anim: getComputedStyle(img).animationName, sideBySide: box.getBoundingClientRect().left >= card.getBoundingClientRect().right - 2, boxTop: Math.round(box.getBoundingClientRect().top), spinOuter: Math.round(sp.getBoundingClientRect().height + parseFloat(getComputedStyle(sp).marginTop)) };
      /* the picture lands: the job code sets the finished class, the spinner goes off */
      const c = document.createElement("canvas"); c.width = 576; c.height = 1024; const g = c.getContext("2d"); g.fillStyle = "#345"; g.fillRect(0, 0, 576, 1024);
      document.getElementById("resultImg").src = c.toDataURL("image/png"); await wait(150);
      box.className = "card result-box on"; sp.className = "spin"; await wait(250);
      out.landed = { cls: box.className, busy: box.getAttribute("aria-busy"), ar: box.style.getPropertyValue("--pend-ar"), dlVisible: document.getElementById("btnDl").getClientRects().length > 0, boxTop: Math.round(box.getBoundingClientRect().top), imgH: Math.round(img.getBoundingClientRect().height), sideBySide: box.getBoundingClientRect().left >= card.getBoundingClientRect().right - 2 };
      /* a second run over a finished picture: busy only, the picture stays */
      sp.className = "spin on"; await wait(150);
      out.again = { cls: box.className, busy: box.getAttribute("aria-busy"), imgVisible: document.getElementById("resultImg").getClientRects().length > 0 };
      sp.className = "spin"; await wait(150);
      out.again.after = { busy: box.getAttribute("aria-busy"), cls: box.className };
      /* the video pages default to 16/9, Text→Image to 3/4 */
      switchPage("pgVideo"); await wait(200);
      const vs = document.getElementById("vidSpin"), vb = document.getElementById("vidResultBox"); vs.className = "spin on"; await wait(150);
      out.video = { cls: vb.className, ar: vb.style.getPropertyValue("--pend-ar"), imgAr: getComputedStyle(vb.querySelector(".result-img")).aspectRatio, role: vs.getAttribute("role") }; vs.className = "spin"; await wait(120);
      switchPage("pgText2Img"); await wait(200);
      const ts = document.getElementById("t2iSpin"), tb = document.getElementById("t2iResultBox"); ts.className = "spin on"; await wait(150);
      out.t2i = { cls: tb.className, ar: tb.style.getPropertyValue("--pend-ar") }; ts.className = "spin"; await wait(120);
      out.t2iAfter = { cls: tb.className, busy: tb.getAttribute("aria-busy") };
      /* Retouch A: busy only, never a skeleton over the compare stage */
      switchPage("pgMeitu"); await wait(200);
      const ss = document.getElementById("stSpin"), sb = document.getElementById("stResultBox"); ss.className = "spin on"; await wait(150);
      out.retouch = { cls: sb.className, busy: sb.getAttribute("aria-busy"), display: getComputedStyle(sb).display }; ss.className = "spin"; await wait(120);
      return out;
    });
    const wide = w >= 1200;
    report(`B5) the skeleton at ${w}px: the spinner line is a live region; spinner on → the Freeform result card is on screen as a 9/16 skeleton (the picked ratio) with a shimmering picture box, aria-busy, its buttons hidden${wide ? ", beside the controls (two-pane)" : ""}; the picture lands in the skeleton's own frame (height within 4px)${wide ? " and the card does not move" : " and the card rises only by the closing status line"}; a second run over a finished picture is busy-only and keeps it; Video defaults 16/9, Text→Image 3/4; Retouch A is busy-only with its compare stage untouched`,
      r.spinA11y.role === "status" && r.spinA11y.live === "polite" &&
      /\bpending\b/.test(r.pending.cls) && r.pending.busy === "true" && r.pending.ar === "9/16" && r.pending.display === "block" && r.pending.imgAr === "9 / 16" && r.pending.imgH > 100 && !r.pending.dlVisible && r.pending.anim === "pendsheen" && (wide ? r.pending.sideBySide : true) &&
      !/\bpending\b/.test(r.landed.cls) && r.landed.busy === null && r.landed.ar === "" && r.landed.dlVisible && Math.abs(r.landed.imgH - r.pending.imgH) <= 4 && Math.abs((r.pending.boxTop - r.landed.boxTop) - (wide ? 0 : r.pending.spinOuter)) <= 2 && (wide ? r.landed.sideBySide : true) &&
      !/\bpending\b/.test(r.again.cls) && r.again.busy === "true" && r.again.imgVisible && r.again.after.busy === null &&
      /\bpending\b/.test(r.video.cls) && r.video.ar === "16/9" && r.video.imgAr === "16 / 9" && r.video.role === "status" &&
      /\bpending\b/.test(r.t2i.cls) && r.t2i.ar === "3/4" && !/\bpending\b/.test(r.t2iAfter.cls) && r.t2iAfter.busy === null &&
      !/\bpending\b/.test(r.retouch.cls) && r.retouch.busy === "true" && r.retouch.display === "none" && errs.length === 0, { r, errs });
    await ctx.close();
  }
}

/* ================= C) the landing ================= */
function serveDir(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(dir, rel); if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
async function landingWalk(browser) {
  const server = await serveDir(path.join(ROOT, "docs"));
  try {
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" }); const page = await ctx.newPage();
      const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
      await page.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; } }).observe({ type: "layout-shift", buffered: true }); } catch (e) {} });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" }); await page.waitForTimeout(1500);
      await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 600)); });
      const m = await page.evaluate(() => {
        const running = document.getAnimations().filter((a) => a.playState === "running").length;
        const infP = [...document.querySelectorAll("*")].flatMap((el) => ["::before", "::after"].map((p) => { const cs = getComputedStyle(el, p); return cs.content !== "none" && el.getClientRects().length && cs.animationName !== "none" && cs.animationIterationCount.split(",").some((x) => x.trim() === "infinite") && parseFloat(cs.animationDuration) > 0.05 ? el.className + p + " " + cs.animationName : null; })).filter(Boolean);
        const playing = [...document.querySelectorAll("video")].filter((v) => !v.paused && v.readyState > 0).length;
        const ls = document.querySelector(".langsel").getBoundingClientRect();
        return { running, infP, playing, cls: +window.__cls.toFixed(4), langsel: Math.round(ls.width), minW: getComputedStyle(document.querySelector(".langsel")).minWidth, scroll: getComputedStyle(document.documentElement).scrollBehavior };
      });
      report(`C1) the landing at ${w}px under prefers-reduced-motion: no running animation, no looping pseudo-element (the cinema sheen included), no clip playing, smooth scrolling off; the language picker holds its reserved width so the load records a layout-shift score under 0.02`,
        m.running === 0 && m.infP.length === 0 && m.playing === 0 && m.scroll === "auto" && m.cls < 0.02 && m.langsel >= parseInt(m.minW, 10) && parseInt(m.minW, 10) >= 111 && errs.length === 0, { m, errs });
      await ctx.close();
    }
  } finally { server.close(); }
}

/* ================= D) the panel ================= */
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
  const server = await serveDir(PANEL);
  try {
    const { page, errs } = await openPanel(browser, server, 900, 900);
    const PW = objAfter(APP, "var PREFS_W=");
    const row = await page.evaluate(async () => {
      HNK.panelNav.switchPage("setup"); await new Promise((r) => setTimeout(r, 500));
      const l = document.getElementById("prefsMotionL"), f = document.getElementById("prefsMotionFull"), r = document.getElementById("prefsMotionReduced");
      const vis = (e) => e && e.getClientRects().length > 0;
      return { label: l && l.textContent, full: f && f.textContent, reduced: r && r.textContent, vis: vis(l) && vis(f) && vis(r), fullOn: f && /\bon\b/.test(f.className), redOn: r && /\bon\b/.test(r.className), body: document.body.className };
    });
    const words = (k) => Object.values(PW[k]);
    report("D1) the panel's Setup ▸ SETTINGS shows the Motion row — label and two chips in one of the app's nine wordings, Full pressed, body without motion-reduce",
      row.vis && words("motion").indexOf(row.label) >= 0 && words("mFull").indexOf(row.full) >= 0 && words("mReduced").indexOf(row.reduced) >= 0 && row.fullOn && !row.redOn && !/motion-reduce/.test(row.body), row);
    /* D2 — Reduced: body class, the settings file, the still spinner; Full again */
    await page.click("#prefsMotionReduced"); await page.waitForTimeout(500);
    const red = await page.evaluate(async () => {
      const out = { body: document.body.className, redOn: /\bon\b/.test(document.getElementById("prefsMotionReduced").className) };
      try { const folder = await window.require("uxp").storage.localFileSystem.getDataFolder(); const f = await folder.getEntry("hnk_students_settings.json"); const o = JSON.parse(await f.read({ format: "utf8" })); out.saved = o.motion; } catch (e) { out.saved = "ERR " + e.message; }
      /* the spinner frame under Reduced: the ring keeps whatever transform it had (none), the bar stays */
      const sp = ffSpinEnsure("spin"); const ring = sp.querySelector(".spin-ring"), run = sp.querySelector(".spin-bar-in"); ring.style.transform = ""; run.style.marginLeft = "";
      spinFrame(sp, Date.now() - 400); out.ringT = ring.style.transform; out.runML = run.style.marginLeft;
      out.imSpinAnim = getComputedStyle(document.body).transitionProperty; /* body has no transition of its own; the rule is pinned at the source */
      return out;
    });
    await page.click("#prefsMotionFull"); await page.waitForTimeout(400);
    const full = await page.evaluate(async () => {
      const out = { body: document.body.className, fullOn: /\bon\b/.test(document.getElementById("prefsMotionFull").className) };
      try { const folder = await window.require("uxp").storage.localFileSystem.getDataFolder(); const f = await folder.getEntry("hnk_students_settings.json"); const o = JSON.parse(await f.read({ format: "utf8" })); out.saved = o.motion; } catch (e) { out.saved = "ERR " + e.message; }
      const sp = ffSpinEnsure("spin"); const ring = sp.querySelector(".spin-ring"); ring.style.transform = ""; spinFrame(sp, Date.now() - 400); out.ringT = ring.style.transform;
      return out;
    });
    report("D2) Reduced puts body.motion-reduce on, writes motion:\"reduced\" to the settings file and leaves the spinner frame untouched (no rotation, no bar run); Full takes the class off, writes \"full\" and the ring turns again",
      /\bmotion-reduce\b/.test(red.body) && red.redOn && red.saved === "reduced" && red.ringT === "" && red.runML === "" &&
      !/\bmotion-reduce\b/.test(full.body) && full.fullOn && full.saved === "full" && /rotate\(/.test(full.ringT), { red, full });
    /* D3 — the loading skeleton on Freeform: run start → pending + busy, run end → gone; a finished card is busy-only */
    const sk = await page.evaluate(async () => {
      HNK.panelNav.switchPage("prompt"); await new Promise((r) => setTimeout(r, 400));   /* the panel's Freeform page is "prompt" (pagePrompt) */
      const box = document.getElementById("resultBox"), sp = document.getElementById("spin"), img = box.querySelector(".result-img");
      const out = {};
      ffRunStart(1); await new Promise((r) => setTimeout(r, 120));
      out.pending = { cls: box.className, busy: box.getAttribute("aria-busy"), display: getComputedStyle(box).display, imgH: Math.round(img.getBoundingClientRect().height), spinRole: sp.getAttribute("role"), spinLive: sp.getAttribute("aria-live"), btnHidden: document.getElementById("btnSaveAs").getClientRects().length === 0 };
      ffRunEnd(); await new Promise((r) => setTimeout(r, 120));
      out.ended = { cls: box.className, busy: box.getAttribute("aria-busy"), display: getComputedStyle(box).display };
      box.className = "card result-box on"; ffRunStart(1); await new Promise((r) => setTimeout(r, 120));
      out.again = { cls: box.className, busy: box.getAttribute("aria-busy"), btnVisible: document.getElementById("btnSaveAs").getClientRects().length > 0 };
      ffRunEnd(); await new Promise((r) => setTimeout(r, 120));
      out.again.after = { cls: box.className, busy: box.getAttribute("aria-busy") };
      box.className = "card result-box";
      return out;
    });
    report("D3) the panel's Freeform: ffRunStart marks the result card pending (a 220px picture block, aria-busy, buttons hidden, the spinner a live region), ffRunEnd clears it; over a finished picture a new run is busy-only and keeps the buttons",
      /\bpending\b/.test(sk.pending.cls) && sk.pending.busy === "true" && sk.pending.display === "block" && sk.pending.imgH >= 200 && sk.pending.spinRole === "status" && sk.pending.spinLive === "polite" && sk.pending.btnHidden &&
      !/\bpending\b/.test(sk.ended.cls) && sk.ended.busy === null && sk.ended.display === "none" &&
      !/\bpending\b/.test(sk.again.cls) && sk.again.busy === "true" && sk.again.btnVisible && sk.again.after.busy === null && /\bon\b/.test(sk.again.after.cls), sk);
    report("D4) nothing threw in the panel while all of that ran", errs.length === 0, errs);
    await page.close();
  } finally { server.close(); }
}

/* ================= E) the release ================= */
function releasePins() {
  const LANDING_CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");   /* 6.131.0 — a developer comment is not a claim; the newer sibling tests already strip both forms */
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.121.0 — this wave shipped as 6.120.0 / 6.191.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`E1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING_CLAIMS, "6.119.0") && !has(LANDING_CLAIMS, "6.190.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`E2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — a bold lead, title and story in all nine languages, pointing at Home — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgHome" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40 && row.s[l].startsWith("**")) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("E3) CI runs this test right after the wave D step and the landing says how many tests the suite runs (262 when this wave shipped, 263 since 6.121.0 added verify_album_designer)",
    has(CI, "run: node test/verify_ux_wave_6119.js\n") && has(CI, "run: node test/verify_ux_wave_6120.js") && CI.indexOf("verify_ux_wave_6119") < CI.indexOf("verify_ux_wave_6120") &&
    (CI.match(/node test\//g) || []).length === 274 && has(LANDING, "274 tests") && !has(LANDING, "261 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    await appMotion(browser);
    await appBootShift(browser);
    await appSkeleton(browser);
    await landingWalk(browser);
    await panelWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — motion is one switch on every surface (the OS preference and a Settings row), the result card waits on screen as a sized skeleton, the boot no longer shifts, the landing's picker holds its width.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
