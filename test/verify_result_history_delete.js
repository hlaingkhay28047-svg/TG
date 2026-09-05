/* v6.20.0 — RESULTS HISTORY DELETE, EVERYWHERE.
 *
 * The owner's audit answer (2026-09-05): "မပါတဲ့ဟာတွေပါအောင် ထည့်ပေးပါ ပြီးပြည့်စုံအောင်" — add what
 * is missing so it is complete. Until now only CREATE and RETOUCH had a Clear,
 * no take could be deleted on its own, and VIDEO, VIDEO UPSCALE, VIDEO→VIDEO,
 * TALK and TEXT→IMAGE had nothing. Now every one of the seven strips carries
 * a ✕ on each take — asks once, removes it from the strip AND deletes its
 * Gallery record when the take carries one (fresh image takes now do:
 * galleryAdd writes the new key back as _id; video takes have carried id
 * since v5.86/v6.4), because a take removed from the strip alone would come
 * back from the Gallery on the next launch — and the five strips without a
 * Clear get one, strip only, Gallery untouched. The panel's CREATE and VIDEO
 * strips gain the same ✕ and Clear.
 *
 * What is driven here against the served app: three seeded video takes render
 * three ✕; a declined confirm removes nothing; an accepted one on a take with
 * a Gallery id calls galleryDel with that id and the selection follows; a take
 * without an id goes without touching the Gallery; Clear empties the strip,
 * hides the result box and itself, and never touches the Gallery; the same
 * on CREATE (images, _id) and TEXT→IMAGE (the last take hides the box). Static:
 * every render loop wraps its thumbnail, the five chips exist, nine languages,
 * the panel's two strips, What's New, CI.
 *
 * Usage: PORT=8931 node test/verify_result_history_delete.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const PANEL_JS = fs.readFileSync(path.join(ROOT, "panel", "main.js"), "utf8");
const PANEL_HTML = fs.readFileSync(path.join(ROOT, "panel", "index.html"), "utf8");
const PANEL_CSS = fs.readFileSync(path.join(ROOT, "panel", "styles.css"), "utf8");
const PANEL_WN = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_whats_new.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const STRIPS = ["hist", "rsHist", "vidHist", "vuHist", "vtHist", "tkHist", "t2iHist"];
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ---- A) the source ---- */
report("A) the five strips that had no Clear now carry one, hidden until there is something to clear",
  ["vidHist", "vuHist", "vtHist", "tkHist", "t2iHist"].every(h => new RegExp('<div class="hist" id="' + h + '"></div>\\n\\s*<button class="chip" id="' + h + 'Clear" style="display:none"></button>').test(APP)), null);
const loopGaps = [];
[["hist", "im", "hist"], ["rsHist", "im", "hist"], ["vidHist", "v", "vidHist"], ["vuHist", "v", "vuHist"], ["vtHist", "v", "vtHist"], ["tkHist", "v", "tkHist"], ["t2iHist", "im", "t2iHist"]].forEach(([hid, v, key]) => {
  const start = APP.indexOf('  var h=$("' + hid + '"); h.innerHTML="";');
  const blk = APP.slice(start, start + 900);
  if (start < 0 || blk.indexOf('histItem(h, ' + v + ', "' + key + '", i);') < 0) loopGaps.push(hid + " loop does not wrap its thumbnail");
  if (blk.indexOf("h.appendChild(" + v + ");") >= 0) loopGaps.push(hid + " still appends bare");
  if (key !== "hist" && blk.indexOf('histStripClearSync("' + key + '");') < 0) loopGaps.push(hid + " never syncs its Clear");
});
report("A2) every one of the seven render loops wraps its thumbnail with a ✕ through histItem, and the five sync their Clear after the loop", loopGaps.length === 0, loopGaps);
report("A3) HIST_STRIPS knows all six lists (CREATE and RETOUCH share one), which key carries the Gallery id, and VIDEO UPSCALE has none",
  /var HIST_STRIPS=\{\n  hist:\s*\{ list:"hist",\s*sel:"histSel",\s*idKey:"_id"/.test(APP) && /vidHist:\{ list:"vidHist", sel:"vidHistSel", idKey:"id"/.test(APP) &&
  /vuHist: \{ list:"vuHist",\s*sel:"vuHistSel",\s*idKey:null/.test(APP) && /vtHist: \{ list:"vtHist",\s*sel:"vtHistSel",\s*idKey:"id"/.test(APP) &&
  /tkHist: \{ list:"tkHist",\s*sel:"tkHistSel",\s*idKey:"id"/.test(APP) && /t2iHist:\{ list:"t2iHist", sel:"t2iHistSel", idKey:"_id"/.test(APP), null);
report("A4) the ✕ asks first, splices the take, deletes its Gallery record when it has one, and the Clear touches the strip only",
  /if\(!confirm\(L9\(gid \? HIST_L\.askGal : HIST_L\.ask\)\)\) return;\n  list\.splice\(i,1\);\n  if\(gid && typeof galleryDel==="function"\) galleryDel\(gid,/.test(APP) &&
  /function histStripClear\(key\)\{ histStripEmpty\(key\); toast\(L9\(HIST_L\.cleared\),"ok"\); \}/.test(APP) && !/function histStripEmpty\(key\)\{[^}]*galleryDel/.test(APP), null);
report("A5) galleryAdd writes the new record's key back onto the take as _id and still resolves true",
  /tx\.oncomplete=function\(\)\{ if\(!failed\)\{ if\(out && rq\.result\) out\._id=rq\.result; resolve\(true\); \} \};/.test(APP), null);
const hl = APP.match(/var HIST_L=\{([\s\S]*?)\n\};/);
const hlGaps = [];
["clear", "cleared", "del", "askGal", "ask", "doneGal", "done"].forEach(k => {
  const m = hl && hl[1].match(new RegExp("\\n  " + k + ":\\s*\\{([^\\n]*)\\}"));
  if (!m) { hlGaps.push(k + " missing"); return; }
  LANGS.forEach(l => { if (!new RegExp('(^|,)' + l + ':"').test(m[1])) hlGaps.push(k + "." + l); });
});
report("A6) the seven strings — Clear label, cleared toast, ✕ label, both questions, both toasts — speak the nine languages", !!hl && hlGaps.length === 0, hlGaps);
report("A7) the thumbnails' ✕ is styled on the corner", /\.hist \.hitem\{position:relative/.test(APP) && /\.hist \.hx\{position:absolute/.test(APP), null);

/* ---- B) the panel ---- */
report("B) the panel's CREATE and VIDEO strips carry the same Clear chips and a ✕ per take, styled the same way",
  /<div class="hist" id="hist"><\/div>\n\s*<div role="button" tabindex="0" class="chip" id="histClear" style="display:none"><\/div>/.test(PANEL_HTML) &&
  /<div class="hist" id="vidHist"><\/div>\n\s*<div role="button" tabindex="0" class="chip" id="vidHistClear" style="display:none"><\/div>/.test(PANEL_HTML) &&
  /histItemP\(host, im, idx\);/.test(PANEL_JS) && /histClearSyncP\(\);\n\}/.test(PANEL_JS) && /vidItemP\(h, v, i\);/.test(PANEL_JS) && /vidClearSyncP\(\);/.test(PANEL_JS) &&
  /\.apg \.hist \.hx \{ position: absolute/.test(PANEL_CSS) && /const x = document\.createElement\("div"\); x\.className = "hx"/.test(PANEL_JS) && !/createElement\(\s*["']button["']\s*\)/.test(PANEL_JS), null);
const pl = PANEL_JS.match(/const HIST_L = \{([\s\S]*?)\n\};/);
const plGaps = [];
["clear", "cleared", "del", "done"].forEach(k => {
  const m = pl && pl[1].match(new RegExp("\\n  " + k + ":\\s*\\{([^\\n]*)\\}"));
  if (!m) { plGaps.push(k + " missing"); return; }
  LANGS.forEach(l => { if (!new RegExp('(^|,)' + l + ':"').test(m[1])) plGaps.push(k + "." + l); });
});
const appClear = (APP.match(/\n  clear:\s*\{my:"([^"]*)",en:"([^"]*)"/) || []).slice(1, 3);
const panClear = (PANEL_JS.match(/\n  clear:\s*\{my:"([^"]*)",en:"([^"]*)"/) || []).slice(1, 3);
report("B2) the panel's strings speak the nine languages and its Clear label is the app's own words", plGaps.length === 0 && appClear.length === 2 && JSON.stringify(appClear) === JSON.stringify(panClear), { plGaps, appClear, panClear });

/* ---- C..G) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const got = await page.evaluate((PNG1) => {
      const out = {};
      const sk = document.getElementById("onbSkip"); if (sk) sk.click();
      const vis = el => !!el && getComputedStyle(el).display !== "none";
      const on = id => /\bon\b/.test(document.getElementById(id).className);
      const xs = host => Array.from(document.querySelectorAll("#" + host + " .hitem .hx"));
      let asked = [], answer = true; const realConfirm = window.confirm; window.confirm = m => { asked.push(m); return answer; };
      const dels = []; const realDel = window.galleryDel; window.galleryDel = (id, cb) => { dels.push(id); if (cb) cb(); };
      try {
        /* C) VIDEO — three takes, two with Gallery ids */
        switchPage("pgVideo");
        state.vidHist = [{ url: "", blob: null, id: 101, prompt: "a", ts: 1 }, { url: "", blob: null, id: 102, prompt: "b", ts: 2 }, { url: "", blob: null, prompt: "c", ts: 3 }];
        state.vidHistSel = 2;
        showVidResult(false);
        out.C0 = { n: xs("vidHist").length, clrOn: vis(document.getElementById("vidHistClear")), clrText: document.getElementById("vidHistClear").textContent, boxOn: on("vidResultBox") };
        answer = false; xs("vidHist")[1].click();
        out.C1 = { asked: asked.length, n: state.vidHist.length, dels: dels.slice(), askedGallery: /Gallery/.test(asked[0] || "") };
        answer = true; xs("vidHist")[1].click();
        out.C2 = { asked: asked.length, n: state.vidHist.length, dels: dels.slice(), sel: state.vidHistSel, left: state.vidHist.map(e => e.prompt), xs: xs("vidHist").length };
        xs("vidHist")[1].click();   /* the take without an id */
        out.C3 = { asked: asked.length, askedGallery: /Gallery/.test(asked[asked.length - 1] || ""), n: state.vidHist.length, dels: dels.slice(), sel: state.vidHistSel };
        document.getElementById("vidHistClear").click();
        out.C4 = { n: state.vidHist.length, xs: xs("vidHist").length, clrOn: vis(document.getElementById("vidHistClear")), boxOn: on("vidResultBox"), dels: dels.slice(), asked: asked.length };
        /* D) CREATE — images, _id */
        switchPage("pgCreate");
        state.hist = [{ mime: "image/png", b64: PNG1, _id: 7 }, { mime: "image/png", b64: PNG1 }]; state.histSel = 0; state.result = state.hist[0];
        showResult();
        out.D0 = { n: xs("hist").length, clrOn: vis(document.getElementById("histClear")) };
        answer = false; xs("hist")[0].click();
        out.D1 = { n: state.hist.length };
        answer = true; xs("hist")[0].click();
        out.D2 = { n: state.hist.length, dels: dels.slice(), sel: state.histSel, resultIsRemaining: state.result === state.hist[0], xs: xs("hist").length };
        /* E) TEXT→IMAGE — the last take goes, so does the box */
        switchPage("pgText2Img");
        state.t2iHist = [{ mime: "image/png", b64: PNG1 }]; state.t2iHistSel = 0;
        showT2IResult();
        out.E0 = { n: xs("t2iHist").length, clrOn: vis(document.getElementById("t2iHistClear")), boxOn: on("t2iResultBox") };
        xs("t2iHist")[0].click();
        out.E1 = { n: state.t2iHist.length, boxOn: on("t2iResultBox"), clrOn: vis(document.getElementById("t2iHistClear")), dels: dels.slice() };
      } finally {
        window.confirm = realConfirm; window.galleryDel = realDel;
        state.vidHist = []; state.hist = []; state.t2iHist = [];
      }
      return out;
    }, PNG1);
    report("C) VIDEO: three seeded takes show three ✕; the Clear chip shows with its label; the result box is on",
      got.C0.n === 3 && got.C0.clrOn && got.C0.clrText.length > 3 && got.C0.boxOn, got.C0);
    report("C2) a declined confirm removes nothing; an accepted one on a take with a Gallery id asks about the Gallery, calls galleryDel with that id, removes the take and moves the selection down",
      got.C1.asked === 1 && got.C1.n === 3 && got.C1.dels.length === 0 && got.C1.askedGallery &&
      got.C2.asked === 2 && got.C2.n === 2 && JSON.stringify(got.C2.dels) === "[102]" && got.C2.sel === 1 && JSON.stringify(got.C2.left) === '["a","c"]' && got.C2.xs === 2, { C1: got.C1, C2: got.C2 });
    report("C3) a take without a Gallery id asks only about the History and never calls galleryDel",
      got.C3.asked === 3 && !got.C3.askedGallery && got.C3.n === 1 && JSON.stringify(got.C3.dels) === "[102]" && got.C3.sel === 0, got.C3);
    report("C4) Clear empties the strip, hides the result box and itself, asks nothing and touches no Gallery record",
      got.C4.n === 0 && got.C4.xs === 0 && !got.C4.clrOn && !got.C4.boxOn && JSON.stringify(got.C4.dels) === "[102]" && got.C4.asked === 3, got.C4);
    report("D) CREATE: two image takes show two ✕ and the Clear; declined keeps both; accepted deletes Gallery record 7, leaves one take selected as the result",
      got.D0.n === 2 && got.D0.clrOn && got.D1.n === 2 && got.D2.n === 1 && got.D2.dels.indexOf(7) >= 0 && got.D2.sel === 0 && got.D2.resultIsRemaining && got.D2.xs === 1, { D0: got.D0, D1: got.D1, D2: got.D2 });
    report("E) TEXT→IMAGE: the last take's ✕ empties the strip and hides the box and the Clear; a take without _id leaves the Gallery alone",
      got.E0.n === 1 && got.E0.clrOn && got.E0.boxOn && got.E1.n === 0 && !got.E1.boxOn && !got.E1.clrOn && got.E1.dels.indexOf(undefined) < 0 && got.E1.dels.length === got.C4.dels.length + 1, { E0: got.E0, E1: got.E1 });
    report("F) no page errors while driving it", errs.length === 0, errs);
  } finally {
    await browser.close();
  }

  /* ---- G) What's New, CI ---- */
  const wnStart = APP.indexOf("var WHATS_NEW = [");
  const wnBlock = APP.slice(wnStart, APP.indexOf("\n];", wnStart));
  const rowRe = /\{ v:"([\d.]+)", kind:"page", ref:"pgCreate",\s*t:\{my:"([^"]*)",en:"([^"]*)"/g;
  let row = null, m;
  while ((m = rowRe.exec(wnBlock))) { if (/Results Histories can be deleted/.test(m[3])) row = m; }
  report("G) What's New carries the row at 6.20.0 — found by what it says — naming the ✕, the Gallery copy and the five pages, in Burmese and English",
    !!row && row[1] === "6.20.0" && /VIDEO UPSCALE/.test(row[3]) && /Gallery/.test(row[3]) && /Results History/.test(row[2]) && /✕/.test(row[2]), row && row.slice(1, 4).map(x => x.slice(0, 80)));
  report("G2) the panel's lifted What's New says the same, byte for byte", !!row && PANEL_WN.indexOf(row[0]) >= 0, null);
  report("G3) CI runs this", /node test\/verify_result_history_delete\.js/.test(CI), null);

  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every strip's takes can go, one by one or all at once, on both surfaces");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
