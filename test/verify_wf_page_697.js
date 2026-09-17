/* verify_wf_page_697.js — 6.101.0 / panel 6.172.0
   THE OWNER'S NINE PHOTOGRAPHS OF THE SMART WORKFLOW PAGE.

   "selection edit မှာ လိုအပ်တာ update upgrade လုပ်ပါ ပြင်ဆင်ပါ … အရမ်းရှည်နေတယ် …
    history ဖျက်လို့ရတာအပြင် တစ်ခြားလိုအပ်တာတေွလဲ ဖြည့်ပေးပါ … WB ကော ညီရဲ့ လား
    တစ်ခါလေမညီလို့ … prompts box နဲနဲကြီးပေးပြီးသိသာအောင်လုပ်ပေးပါ ကျစ်ကျစ်လစ်လစ်နဲ့"

   FIVE THINGS, EACH MEASURED HERE.

   ONE — THE PARAGRAPH PAINTED THROUGH THE FIELD UNDER IT (A1, A2, C1, C7).
   The photograph of Selection Edit shows an English paragraph drawn straight through
   the "ဘာပြောင်းချင်လဲ ရေးပါ" label and the box beneath it. Two faults, one picture:
     (1) `.hnk-wf-about.is-clamp` asked for `max-height` + `overflow: hidden`. That is
         the rule Adobe UXP sizes a box by and then paints past anyway — 6.171.0
         measured it over the owner's real panel and found 101 of 194 cards doing it
         (verify_ui_tidy_696). So the ceiling held the LAYOUT at 4.6em while the ink
         went wherever the words went: onto the label, onto the field.
     (2) the word-cut ran while the page was still being built. A box that is not in
         the document yet measures zero, and zero is under every ceiling, so the cut
         was a silent no-op — the same flaw wfClamp was fixed for in 6.171.0.
   So the clipping rule is gone (the WORDS are the only thing holding the paragraph
   now) and the cut re-runs from render(), after mount, where there is something to
   measure. C7 puts 6.100.0's arrangement back and measures the ink that would land
   on the field, so this file would have caught the photograph.

   TWO — EVERY CARD LINE WAS BURMESE, FOR EVERYBODY (A3, A4, C2).
   A defect nobody had reported. `wf_sum_*` / `wf_exp_*` keys exist nowhere, so the
   panel's card summaries came from the lifted catalog — which was lifted from ONE
   run of the app, in Burmese. A Thai student read 194 Burmese card lines and 13
   Burmese group intros, while the workflow page itself fell back to English for
   everyone. The lifter now opens the app once per language with ?lang= and carries
   what the app itself printed; the registry picks the live language, then English,
   then whatever the card already had.

   THREE — THE INSTRUCTION BOX WAS ONE 42px LINE (A5, C3).
   "prompts box နဲနဲကြီးပေးပြီးသိသာအောင်လုပ်ပေးပါ" — a sentence needs room to be
   written in. A textarea with three lines of room inside a framed, accented block,
   with a hint under it saying what a good instruction looks like. Both surfaces.

   FOUR — HISTORY WAS DECORATIVE (A6, A7, C4, C5, C6).
   Eight rows, every one of them identical ("region-edit" previewed as its own id),
   no way to delete one, and a Re-run that called doGenerate() — i.e. ran whatever
   the page was set to NOW, not the row it sat on. Now: three rows (the page was also
   far too long), a ✕ per row, one Clear for THIS workflow's rows, the typed sentence
   previewed from the compiled request, and a Re-run that puts that row's own
   instruction, size and ratio back on the page before it starts.

   FIVE — "WB ကော ညီရဲ့ လား" (A8, B).
   It did not always, and nothing was measuring it. Every guard we had was a
   SENTENCE in a prompt. src/app/wb-match.js measures the result's mid-tone channel
   means against the pixels that went out and corrects a real drift: mid-tones only,
   a 1.5% deadzone, a ±12% ceiling so an intended colour change survives, green as
   the anchor so brightness is untouched, and an honest bullet naming the drift. The
   maths is pure, so section B drives it in Node over built frames — including the
   two frames that bracket the deadzone and the one the ceiling must refuse. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const PCSS = read("panel/styles.css");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const REGISTRY = read("panel/src/workflows/workflow-registry.js");
const HIST = read("panel/src/history/history-service.js");
const COMPILER = read("panel/src/workflows/workflow-request-compiler.js");
const LIFTER = read("tools/build_panel_wf_catalog.js");
const BOOT = read("panel/src/app/bootstrap.js");
const SETSVC = read("panel/src/app/settings-service.js");
const SETSCR = read("panel/src/ui/screens/settings-screen.js");
const PINDEX = read("panel/index.html");
const MAIN = read("panel/main.js");
const APP = read("docs/app/index.html");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const CATALOG = require(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"));
const WB = require(path.join(ROOT, "panel", "src", "app", "wb-match.js"));

const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* the region-edit record, read out of the catalog the panel actually ships */
function catalogWorkflow(id) {
  for (const c of CATALOG.categories) for (const w of c.items) if (w.id === id) return w;
  return null;
}
const REGION = catalogWorkflow("region-edit");

/* ============== A) the source ============== */
function sourcePins() {
  /* A1 — nothing declines to clip any more, because nothing is asked to. */
  report("A1) the paragraph's clamp carries NO clipping rule — .hnk-wf-about.is-clamp is display:block alone, with no max-height and no overflow:hidden for this renderer to size by and then paint past",
    /\.hnk-wf-about\.is-clamp \{ display: block; \}/.test(PCSS) &&
    !/\.hnk-wf-about\.is-clamp \{[^}]*max-height/.test(PCSS) &&
    !/\.hnk-wf-about\.is-clamp \{[^}]*overflow/.test(PCSS), null);

  /* A2 — and the cut runs where there is something to measure. */
  report("A2) the word-cut is re-run from render(), after mount — a detached box measures zero and zero is under every ceiling, so the cut at build time was a silent no-op; paintDesc is held and called again once the page is in the document",
    /var wfAboutRepaint = null;/.test(SCREEN) &&
    /if \(!descOpen\) ellFit\(root, "\.hnk-wf-about", 3\);/.test(SCREEN) &&
    /paintDesc\(\);\s*\n\s*wfAboutRepaint = paintDesc;/.test(SCREEN) &&
    /try \{ if \(state\.workflowId && wfAboutRepaint\) wfAboutRepaint\(\); \} catch \(e\) \{ \}/.test(SCREEN), null);

  /* A3 — the reader, and the three places that use it */
  report("A3) the registry reads the catalog's own per-language tables — summaryFor(id) and categoryTextFor(index) pick the live language, then English, then the fallback the card already had; both are exported and both are used by the card line, the group heading and the workflow page's first paragraph",
    /function _langNow\(\)/.test(REGISTRY) && /g\.HNK && g\.HNK\.i18n && g\.HNK\.i18n\.lang && g\.HNK\.i18n\.lang\(\)/.test(REGISTRY) &&
    /return t\[lang\] \|\| t\.en \|\| null;/.test(REGISTRY) &&
    /function summaryFor\(workflowId, fallback\)/.test(REGISTRY) && /function categoryTextFor\(index, fallback\)/.test(REGISTRY) &&
    /summaryFor: summaryFor, categoryTextFor: categoryTextFor,/.test(REGISTRY) &&
    /catIndex: _CATEGORIES\.length/.test(REGISTRY) &&
    /var summary = registry\.summaryFor\(wf\.id, wf\.cardSummary \|\| wf\.summary \|\| ""\);/.test(SCREEN) &&
    /var ct = registry\.categoryTextFor\(typeof c\.catIndex === "number" \? c\.catIndex : ci, \{ title: c\.category, desc: c\.desc \}\);/.test(SCREEN) &&
    /var sumTxt = registry\.summaryFor\(wf\.id, wf\.cardSummary \|\| wf\.summary \|\| ""\);/.test(SCREEN), null);

  /* A4 — the lift itself: nine openings of the app, not one */
  const langs = (LIFTER.match(/const LANGS = \[([^\]]+)\]/) || [])[1] || "";
  const iSum = Object.keys(CATALOG.i18n || {});
  const sizes = iSum.map((l) => Object.keys(CATALOG.i18n[l].sum || {}).length);
  const cats = iSum.map((l) => (CATALOG.i18n[l].cat || []).length);
  report("A4) the lifter opens the app once per language with ?lang= and carries what the app itself printed — the shipped catalog holds all nine tables, 194 card summaries and 13 group intros each, and they really differ language to language",
    LANGS.every((l) => langs.indexOf('"' + l + '"') >= 0) &&
    /\/index\.html` \+ \(lang \? "\?lang=" \+ lang : ""\)/.test(LIFTER) &&
    /i18n\[lang\] = \{ sum: sum, cat: cat \};/.test(LIFTER) &&
    /return \{ total: all\.length, categories: cats, i18n: i18n \};/.test(LIFTER) &&
    iSum.length === 9 && LANGS.every((l) => iSum.indexOf(l) >= 0) &&
    sizes.every((n) => n === CATALOG.total) && cats.every((n) => n === CATALOG.categories.length) &&
    CATALOG.i18n.en.sum["region-edit"] !== CATALOG.i18n.my.sum["region-edit"] &&
    CATALOG.i18n.th.sum["region-edit"] !== CATALOG.i18n.en.sum["region-edit"] &&
    CATALOG.i18n.en.cat[0].desc !== CATALOG.i18n.my.cat[0].desc,
    { langs: iSum, sums: sizes[0], cats: cats[0], total: CATALOG.total });

  /* A5 — the box, on both surfaces */
  report("A5) the instruction box is a textarea with three lines of room in a framed, accented block with a hint under it — the panel draws it with an explicit 74px height (this renderer honours a height, not a min-height) and the app's wizard with the same frame, the marker ADDED to the row's own classes so 6.93.0's required-line rule survives",
    /var ti = dom\.el\(doc, "textarea", \{ class: "hnk-input hnk-wf-text", id: "hnkWfText_" \+ f\.key \}\);/.test(SCREEN) &&
    /ti\.setAttribute\("rows", "3"\);/.test(SCREEN) &&
    /class: "hnk-wf-field-hint", id: "hnkWfTextHint_" \+ f\.key, text: l9\(L_TEXT_HINT\)/.test(SCREEN) &&
    /\.hnk-wf-field\.is-text \{ flex-direction: column; align-items: stretch;/.test(PCSS) &&
    /\.hnk-wf-field\.is-text \.hnk-wf-text \{[^}]*height: 74px;/.test(PCSS) &&
    /\.hnk-wf-field-hint \{ font-size: 10\.5px;/.test(PCSS) &&
    /frow\.className \+= " is-text";/.test(APP) &&
    /var ti=document\.createElement\("textarea"\); ti\.className="inp wiz-text"; ti\.rows=3;/.test(APP) &&
    /frow\.appendChild\(el\("div","wiz-text-hint", L9\(WIZ_TEXT_HINT\)\)\);/.test(APP) &&
    /\.wiz-field\.is-text\{flex-direction:column/.test(APP) && /\.wiz-text-hint\{font-size:11px/.test(APP) &&
    /var frow=el\("label","wiz-field wiz-field-"\+f\.type\+\(f\.required\?" wiz-field-req":""\)\);/.test(APP), null);

  /* A6 — the rows, and the three buttons on them */
  report("A6) the page opens with three history rows, each with a ✕ that forgets that run alone, this workflow's rows clear in one press, and Re-run restores THAT row's instruction, size and ratio before it starts",
    /var HIST_ROWS = 3;/.test(SCREEN) && /rows\.slice\(0, HIST_ROWS\)\.forEach/.test(SCREEN) &&
    /id: "hnkWfHistDel_" \+ i, text: "\\u2715"/.test(SCREEN) &&
    /try \{ if \(svc && svc\.remove\) svc\.remove\(e\.id\); \} catch \(eR\) \{ \}/.test(SCREEN) &&
    /if \(svc && svc\.clearWhere\) svc\.clearWhere\(function \(r\) \{ return r && r\.mode === "smart-workflow" && r\.workflowId === wf\.id; \}\);/.test(SCREEN) &&
    /if \(asked && asked !== wf\.id\) card\.appendChild\(dom\.el\(doc, "div", \{ class: "hnk-hist-ask", id: "hnkWfHistAsk_" \+ i, text: asked \}\)\);/.test(SCREEN) &&
    /if \(box\) \{ wstate\.setUserText\(state, asked\); box\.value = asked; \}/.test(SCREEN) &&
    /wstate\.setField\(state, fields\[fi\]\.key, asked\);/.test(SCREEN) &&
    /if \(e\.size\) wstate\.setOutput\(state, \{ size: String\(e\.size\)\.toLowerCase\(\) \}\);/.test(SCREEN) &&
    /if \(e\.ratio\) wstate\.setOutput\(state, \{ ratio: e\.ratio \}\);/.test(SCREEN) &&
    LANGS.every((l) => new RegExp('\\b' + l + ': "').test((SCREEN.match(/var L_HIST_DEL = \{[^}]*\}/) || [""])[0])) &&
    /var clr = dom\.el\(doc, "button", \{ class: "hnk-btn hnk-hist-clear", id: "hnkWfHistClear"/.test(SCREEN), null);

  /* A7 — the record itself: one row can go, and a row says what was asked */
  report("A7) the history service can forget one run or a page's own runs and says how many went, and a workflow row previews the student's typed sentence — carried on the compiled request, read back from the USER REQUEST line when it is not, and only then the workflow's id",
    /function remove\(id\) \{/.test(HIST) && /function clearWhere\(pred\) \{/.test(HIST) &&
    /remove: remove, clearWhere: clearWhere \};/.test(HIST) &&
    /var m = \/\\nUSER REQUEST: \(\[\^\\n\]\+\)\/\.exec\(String\(prompt == null \? "" : prompt\)\);/.test(HIST) &&
    /promptPreview: _preview\(isWorkflow \? \(String\(request\.typedText \|\| ""\) \|\| _userLine\(request\.compiledPrompt\) \|\| request\.workflowId \|\| ""\) : fullPrompt\)/.test(HIST) &&
    /function _typedText\(wf, state\) \{/.test(COMPILER) && /typedText: _typedText\(wf, state\),/.test(COMPILER), null);

  /* A8 — the white balance, its four rules, its switch and its sentence */
  const dict = (k) => (MAIN.match(new RegExp('"?' + k + '"?:', "g")) || []).length;
  report("A8) white balance is measured, not asked for: mid-tones only, a 1.5% deadzone, a ±12% ceiling and green as the anchor — registered on the panel, governed by an ON/OFF switch that defaults on, and reported as a bullet naming the drift in all nine languages",
    /var LUMA_LO = 0\.08, LUMA_HI = 0\.92;/.test(read("panel/src/app/wb-match.js")) &&
    /var DEADZONE = 0\.015;/.test(read("panel/src/app/wb-match.js")) &&
    /var MAX_GAIN = 0\.12;/.test(read("panel/src/app/wb-match.js")) &&
    /var gain = \{ r: _clamp\(gr, 1 - MAX_GAIN, 1 \+ MAX_GAIN\), g: 1, b: _clamp\(gb, 1 - MAX_GAIN, 1 \+ MAX_GAIN\) \};/.test(read("panel/src/app/wb-match.js")) &&
    /<script src="src\/app\/wb-match\.js"><\/script>/.test(PINDEX) &&
    PINDEX.indexOf('src="src/app/wb-match.js"') < PINDEX.indexOf('src="src/app/bootstrap.js"') &&
    /wbMatch: true/.test(SETSVC) && /id: "hnkSetWbMatch"/.test(SETSCR) &&
    /var m0 = await wbm\.matchDataUrl\(wbRef, r0\.ref\);/.test(BOOT) &&
    /if \(m0 && m0\.applied\) \{ r0\.ref = m0\.ref; r0\.wbMatched = m0\.driftPct; \}/.test(BOOT) &&
    /bullets: wbNote \? \[wbNote\] : \[\]/.test(BOOT) &&
    dict("wb_matched") >= 9 && dict("wb_already") >= 9 && dict("ai_wb_match") >= 9,
    { wb_matched: dict("wb_matched"), wb_already: dict("wb_already"), ai_wb_match: dict("ai_wb_match") });
}

/* ============== B) the white-balance maths, driven in Node ============== */
function frame(pixels) {
  /* pixels: [[r,g,b,a?], …] repeated — an {data,width,height} the module can read */
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => { data[i * 4] = p[0]; data[i * 4 + 1] = p[1]; data[i * 4 + 2] = p[2]; data[i * 4 + 3] = p.length > 3 ? p[3] : 255; });
  return { data: data, width: pixels.length, height: 1 };
}
const fill = (n, px) => frame(new Array(n).fill(px));

function wbMaths() {
  /* B1 — the same picture twice is left alone */
  const same = WB.gains(fill(64, [128, 128, 128]), fill(64, [128, 128, 128]));
  report("B1) two frames of the same neutral measure zero drift and nothing is done — a correction that fires on an already-matched result is how a fix becomes a bug",
    same.ok === false && same.drift === 0 && same.why === "under the deadzone" &&
    same.gain.r === 1 && same.gain.g === 1 && same.gain.b === 1, same);

  /* B2 — a real cast is measured and undone */
  const ref = fill(64, [128, 128, 128]);
  const cast = fill(64, [120, 128, 140]);
  const g2 = WB.gains(ref, cast);
  const fixed = WB.apply(fill(64, [120, 128, 140]), g2.gain);
  const m = WB.means(fixed), mr = WB.means(ref);
  report("B2) a result that came back 8.6% blue against the photograph is measured and put back on the photograph's neutral — the corrected frame's channel means land on the original's within one 255th",
    g2.ok === true && g2.clamped === false && Math.abs(g2.driftPct - 8.6) < 0.2 &&
    Math.abs(m.r - mr.r) < 0.005 && Math.abs(m.g - mr.g) < 0.005 && Math.abs(m.b - mr.b) < 0.005,
    { drift: g2.driftPct, gain: g2.gain, got: m, want: mr });

  /* B3 — the ceiling: an intended colour change survives */
  const g3 = WB.gains(fill(64, [200, 128, 60]), fill(64, [100, 128, 200]));
  const after = WB.means(WB.apply(fill(64, [100, 128, 200]), g3.gain));
  report("B3) a workflow that was MEANT to change colour is not repainted — a 100% channel swing is clamped to ±12% and reported as clamped, and the edit is still plainly there afterwards",
    g3.clamped === true && Math.abs(g3.gain.r - 1.12) < 1e-9 && Math.abs(g3.gain.b - 0.88) < 1e-9 &&
    after.r < 0.5 && after.b > 0.6, { gain: g3.gain, clamped: g3.clamped, after });

  /* B4 — green is the anchor: brightness is never touched */
  const g4 = WB.gains(fill(64, [100, 100, 100]), fill(64, [140, 140, 140]));
  report("B4) a result that is simply brighter is not \"corrected\" — the gains are normalised on green, so a change that lives in the luma measures zero colour drift and the frame is left exactly as it came back",
    g4.ok === false && Math.abs(g4.drift) < 1e-9 && g4.gain.r === 1 && g4.gain.b === 1, g4);

  /* B5 — mid-tones only */
  const blown = frame([].concat(
    new Array(90).fill([255, 255, 255]),      /* luma 1.00 — above LUMA_HI */
    new Array(90).fill([6, 6, 6]),            /* luma 0.02 — below LUMA_LO */
    new Array(20).fill([120, 130, 140])));    /* the only pixels with colour worth matching */
  const mm = WB.means(blown);
  report("B5) blown highlights and crushed shadows carry no colour worth matching and are not counted — a frame that is 90% white and 90% black measures exactly its 20 mid-tone pixels, and a transparent pixel says nothing at all",
    mm.n === 20 && Math.abs(mm.r - 120 / 255) < 1e-6 && Math.abs(mm.g - 130 / 255) < 1e-6 && Math.abs(mm.b - 140 / 255) < 1e-6 &&
    WB.means(frame(new Array(8).fill([128, 128, 128, 0]))) === null, mm);

  /* B6 — the deadzone, bracketed */
  const under = WB.gains(fill(64, [128, 128, 128]), fill(64, [127, 128, 128]));
  const over = WB.gains(fill(64, [128, 128, 128]), fill(64, [126, 128, 128]));
  report("B6) the deadzone is real and it is narrow: a 0.8% drift nobody can see is left alone and a 1.6% one is corrected — one 255th of red apart, on either side of the line",
    under.ok === false && under.driftPct < 1.5 && over.ok === true && over.driftPct >= 1.5,
    { under: under.driftPct, over: over.driftPct });

  /* B7 — it answers honestly, and never throws */
  const empty = WB.gains(frame(new Array(8).fill([128, 128, 128, 0])), fill(8, [128, 128, 128]));
  report("B7) every call answers with what it measured rather than claiming a silent success — the drift is reported even when nothing is done, and a frame with nothing to compare is refused by name instead of throwing",
    typeof under.driftPct === "number" && under.why === "under the deadzone" &&
    empty.ok === false && empty.why === "no mid-tone pixels to compare" &&
    empty.gain.r === 1 && empty.gain.b === 1, empty);
}

/* ============== C) the panel, measured at a Photoshop width ============== */
const NATURAL = `(el) => {
  const sv = { h: el.style.height, mh: el.style.maxHeight, ov: el.style.overflow };
  el.style.height = "auto"; el.style.maxHeight = "none"; el.style.overflow = "visible";
  const nat = el.scrollHeight;
  el.style.height = sv.h; el.style.maxHeight = sv.mh; el.style.overflow = sv.ov;
  return nat;
}`;

async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ctx = await browser.newContext({ viewport: { width: 400, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  let out = null;
  try {
    await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
      : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; } }, null, { timeout: 25000 });

    out = await page.evaluate(async (IN) => {
      const natural = eval("(" + IN.natural + ")");
      const settle = (ms) => new Promise((r) => setTimeout(r, ms || 700));
      const o = {};
      switchPage("wf"); await settle();
      HNK.aiToolsApp.workflowScreen().select("region-edit"); await settle(1300);

      const desc = () => document.getElementById("hnkWfDesc");
      const field = () => document.querySelector(".hnk-wf-field.is-text");
      /* the honest reading of "does it stay inside its block".
         clientHeight is the LINE box; scrollHeight is the INK, and for Burmese the ink
         sits a few pixels below the last line box (6.110.0's finding) whether or not
         anything is clamped. So the question is not scrollHeight === clientHeight — it
         is where the INK ends: above the field, or on it. C7 asks the same question of
         6.100.0's arrangement and gets the other answer. */
      const readDesc = () => {
        const d = desc(), cs = getComputedStyle(d), r = d.getBoundingClientRect();
        const f = field(), fr = f ? f.getBoundingClientRect() : null;
        return { text: d.textContent, cls: d.className, maxH: cs.maxHeight, ov: cs.overflow,
          box: Math.round(r.height), lh: parseFloat(cs.lineHeight) || 16,
          ink: natural(d), top: Math.round(r.top), bottom: Math.round(r.bottom),
          inkBottom: Math.round(r.top + natural(d)),
          fieldTop: fr ? Math.round(fr.top) : -1, ell: !!d.querySelector(".ell") };
      };
      o.my = readDesc();
      o.lang = state.lang;

      /* the same page in three more languages — the switch re-mounts the stack, so
         this is also the proof that the cut is re-run from render() and not only once */
      o.langs = {};
      for (const L of IN.langs) {
        state.lang = L; applyI18n(); await settle(1300);
        const d = readDesc();
        const h = document.querySelector(".hnk-wf-field-hint");
        o.langs[L] = { text: d.text, box: d.box, lh: d.lh, ink: d.ink, inkBottom: d.inkBottom,
          fieldTop: d.fieldTop, screen: HNK.aiToolsApp.current(), hint: h ? h.textContent : null };
      }
      state.lang = "my"; applyI18n(); await settle(1300);
      o.back = readDesc().text;

      /* the instruction box */
      const f = field();
      const ta = f ? f.querySelector("textarea") : null;
      o.box = { framed: !!f, tag: ta ? ta.tagName : null, id: ta ? ta.id : null,
        rows: ta ? ta.getAttribute("rows") : null, max: ta ? ta.getAttribute("maxlength") : null,
        h: ta ? Math.round(ta.getBoundingClientRect().height) : 0,
        label: f ? (f.querySelector(".hnk-wf-field-l") || {}).textContent : null,
        hint: f ? (f.querySelector(".hnk-wf-field-hint") || {}).textContent : null,
        hintBelow: (function () { if (!ta || !f) return false; const hh = f.querySelector(".hnk-wf-field-hint");
          return !!hh && hh.getBoundingClientRect().top >= ta.getBoundingClientRect().bottom - 1; })() };

      /* history — seeded through the real service the screen reads */
      const svc = HNK.aiToolsBoot.services.history;
      svc.clear();
      for (let i = 0; i < 5; i++) svc.add({ id: "t_re_" + i, mode: "smart-workflow", workflowId: "region-edit",
        badge: "WORKFLOW", modelName: "Auto", size: "L", ratio: "2:3", timeLabel: "10:0" + i,
        promptPreview: "turn the white flowers red " + i });
      for (let i = 0; i < 2; i++) svc.add({ id: "t_other_" + i, mode: "smart-workflow", workflowId: "subject-face",
        badge: "WORKFLOW", modelName: "Auto", size: "M", ratio: "1:1", timeLabel: "09:0" + i,
        promptPreview: "another workflow's run " + i });
      HNK.aiToolsApp.workflowScreen().select("region-edit"); await settle(1300);

      const rows = () => Array.prototype.slice.call(document.querySelectorAll("#hnkWfHistory .hnk-hist"));
      const asks = () => rows().map((r) => { const a = r.querySelector(".hnk-hist-ask"); return a ? a.textContent : null; });
      const mine = () => svc.list().filter((e) => e.workflowId === "region-edit").length;
      const other = () => svc.list().filter((e) => e.workflowId === "subject-face").length;
      o.hist = { n: rows().length, seeded: 5, asks: asks(), xs: rows().every((r) => !!r.querySelector(".hnk-hist-x")),
        clear: !!document.getElementById("hnkWfHistClear"), all: !!document.getElementById("hnkWfHistAll"),
        stored: svc.list().length };

      document.getElementById("hnkWfHistDel_0").click(); await settle(1100);
      o.afterX = { n: rows().length, asks: asks(), stored: svc.list().length, mine: mine(), other: other() };

      /* Re-run puts THIS row's own sentence and output choices back first */
      const ta2 = document.getElementById("hnkWfText_edit"); if (ta2) ta2.value = "";
      try { HNK.aiToolsApp.controller().workflow.output = { size: "s", ratio: "1:1" }; } catch (e) { }
      document.getElementById("hnkWfHistRerun_1").click(); await settle(1000);
      const wst = HNK.aiToolsApp.controller().workflow;
      const ta3 = document.getElementById("hnkWfText_edit");
      o.rerun = { row: asks()[1] || null, field: ta3 ? ta3.value : null, state: (wst.fieldVals || {}).edit,
        size: wst.output && wst.output.size, ratio: wst.output && wst.output.ratio };

      document.getElementById("hnkWfHistClear").click(); await settle(1100);
      o.afterClear = { n: rows().length, stored: svc.list().length, mine: mine(), other: other(),
        empty: !!document.getElementById("hnkWfHistoryEmpty") };

      /* C7 — 6.100.0's arrangement, put back */
      HNK.aiToolsApp.workflowScreen().select("region-edit"); await settle(1300);
      const d0 = desc(), fr0 = field().getBoundingClientRect();
      const keep = d0.textContent;
      const st = document.createElement("style");
      st.textContent = ".hnk-wf-about.is-clamp { max-height: 4.6em; overflow: hidden; }";
      document.head.appendChild(st);
      d0.textContent = IN.explanation;                  /* the uncut English note, as 6.100.0 drew it */
      await settle(400);
      const hurtBox = Math.round(d0.getBoundingClientRect().height);
      const hurtNat = natural(d0);
      o.hurt = { box: hurtBox, nat: hurtNat, over: hurtNat - hurtBox,
        inkBottom: Math.round(d0.getBoundingClientRect().top + hurtNat), fieldTop: Math.round(fr0.top) };
      st.parentNode.removeChild(st);
      d0.textContent = keep;
      await settle(300);
      return o;
    }, { natural: NATURAL, langs: ["en", "th", "zh"], explanation: REGION.explanation });
  } finally { await page.close(); await ctx.close(); server.close(); }

  const want = (l) => CATALOG.i18n[l].sum["region-edit"];
  const fits = (d) => d.box <= 3 * d.lh + 1 && d.fieldTop > 0 && d.inkBottom < d.fieldTop;

  report("C1) THE PHOTOGRAPH, ANSWERED: on Selection Edit the first paragraph carries no ceiling for this renderer to decline (max-height none, overflow visible), stands at most three lines tall, and its INK — not just its line boxes — ends above the instruction field instead of on top of it",
    !!out.my && out.my.maxH === "none" && out.my.ov === "visible" && /is-clamp/.test(out.my.cls) && fits(out.my),
    out.my);

  report("C2) and it is the app's own sentence for this workflow in the panel's language — Burmese by default, Thai for a Thai student, Chinese for a Chinese one, English for English, each of them three lines or under and each clearing the field below; the switch re-mounts the page, so this is the cut running from render()",
    out.lang === "my" && out.my.text === want("my") && out.back === want("my") &&
    ["en", "th", "zh"].every((L) => out.langs[L].text === want(L) && out.langs[L].screen === "workflow-tools" && fits(out.langs[L])),
    { my: out.my.text.slice(0, 40), en: out.langs.en.text.slice(0, 40), th: out.langs.th.text.slice(0, 40), zh: out.langs.zh.text.slice(0, 40) });

  report("C3) the instruction box is a real textarea, 74px of writing room inside its framed block, with the workflow's own label above it and the hint below it — in the panel's language, not English",
    out.box.framed && out.box.tag === "TEXTAREA" && out.box.id === "hnkWfText_edit" && out.box.rows === "3" &&
    out.box.max === "200" && out.box.h >= 70 && out.box.hintBelow &&
    out.box.label === REGION.fields[0].label.my && !!out.box.hint &&
    out.langs.th.hint && out.langs.th.hint !== out.langs.en.hint, out.box);

  report("C4) history opens with three rows out of five, each saying what was actually asked for rather than repeating the workflow's id, each with its own ✕, and one Clear for this workflow",
    out.hist.n === 3 && out.hist.stored === 7 && out.hist.xs && out.hist.clear && out.hist.all &&
    out.hist.asks.join("|") === "turn the white flowers red 4|turn the white flowers red 3|turn the white flowers red 2",
    out.hist);

  report("C5) ✕ forgets that one run and nothing else — the record drops from seven to six, this workflow keeps four, the other workflow's two are untouched, and the fourth row moves up into the three on screen",
    out.afterX.n === 3 && out.afterX.stored === 6 && out.afterX.mine === 4 && out.afterX.other === 2 &&
    out.afterX.asks.join("|") === "turn the white flowers red 3|turn the white flowers red 2|turn the white flowers red 1",
    out.afterX);

  report("C6) Re-run restores THAT row — its sentence goes back into the field and onto the workflow state, and its size and ratio replace whatever the page was set to; Clear then takes this workflow's rows and leaves the other workflow's alone",
    out.rerun.field === out.rerun.row && out.rerun.state === out.rerun.row &&
    out.rerun.size === "l" && out.rerun.ratio === "2:3" &&
    out.afterClear.n === 0 && out.afterClear.mine === 0 && out.afterClear.other === 2 &&
    out.afterClear.stored === 2 && out.afterClear.empty, { rerun: out.rerun, cleared: out.afterClear });

  report("C7) FAULT INJECTED: with 6.100.0's ceiling and its uncut English note put back, the paragraph's ink runs far past the box the stylesheet asked to clip and lands below the instruction field's top — the ink this renderer paints anyway (6.171.0 measured it on 101 of 194 cards), which is exactly the owner's photograph",
    out.hurt.over > 40 && out.hurt.inkBottom > out.hurt.fieldTop, out.hurt);

  report("C8) nothing threw while all of that ran", errs.length === 0, errs.slice(0, 4));
}

/* ============== D) the release ============== */
function releasePins() {
  const app = (APP.match(/var APP_VER="([\d.]+)";/) || [])[1];
  const pan = (MAIN.match(/PANEL_VERSION *= *"([\d.]+)"/) || [])[1];
  const esc = (v) => String(v).replace(/\./g, "\\.");
  const badge = (LANDING.match(/"badge\.tests": \{"my": "(\d+) tests green/) || [])[1];
  const steps = new Set(CI.match(/node test\/[A-Za-z0-9_]+\.js/g) || []);
  report("D1) the wave ships in lockstep and the suite carries this file, counted on the landing page",
    !!app && !!pan && MANIFEST.version === pan &&
    new RegExp('"version": *"' + esc(pan) + '"').test(read("panel/manifest.json")) &&
    new RegExp('"v":"' + esc(app) + '"').test(read("docs/app/version.json")) &&
    new RegExp('hnk-web-studio-v' + esc(app).replace(/\\\./g, "-")).test(read("docs/app/sw.js")) &&
    steps.has("node test/verify_wf_page_697.js") &&
    String(steps.size) === badge, { app, pan, manifest: MANIFEST.version, steps: steps.size, badge });
}

(async () => {
  sourcePins();
  wbMaths();
  const browser = await chromium.launch();
  try { await panelWalk(browser); } finally { await browser.close(); }
  releasePins();
  console.log(failures === 0 ? "ALL PASS" : failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
