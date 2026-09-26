/* 6.129.0 — THE BACKGROUND CHANGES, THE PHOTOGRAPH DOES NOT.
 *
 * The owner sent Photoshop photographs of BG Replace and wrote, in short: every background-changing
 * workflow must keep IMAGE 1's own frame — "တစ်ပိုင်းဆိုတစ်ပိုင်း အနီးကပ်ဆိုအနီးကပ် တစ်ကိုယ်လုံးဆိုတစ်ကိုယ်လုံး" (half-body stays
 * half-body, close-up stays close-up, full-length stays full-length), never bigger, never smaller;
 * the person must not take the new backdrop's colour; and there should be a choice of which side
 * gives way (subject follows scene · scene follows subject · professional balance) plus switches for
 * skin smoothing and balance, with the original face unchanged.
 *
 * His photographs showed all of it at once: a studio frame cropped below the gown's hem came back
 * full length with the train invented, the woman smaller inside the frame, and her arms and face
 * washed amber by the new backdrop.
 *
 * Measuring all twenty-nine Background & Scene cards through the app's own composed catalog said
 * why. Twenty-six DO state a frame rule and every one of them is about the CAMERA ("keep the
 * composition", "the crop comes from IMAGE 1", "do not re-pose, re-angle, zoom or recrop"); only
 * eight ever said how much of the BODY stays visible. SKIN TONE TRUTH (v5.74.0) guarded the skin's
 * colour and nothing guarded hair, gown or jewellery, or named the scene's grade being painted over
 * the subject.
 *
 * What this pins: the two new lock lines and the three controls written once in the app's catalog
 * post-pass; all twenty-nine cards carrying them with the designed defaults; Studio Scenes and
 * Studio Relight carrying the two locks and NOT the controls; no card outside those three groups
 * touched; the AVOID lists naming both failures; the compiled prompt at every setting of the three
 * controls, measured through the app's own wizard maths and the panel's own compiler; the wizard
 * drawing the controls on both surfaces; and the 6.129.0 / 6.200.0 release chain.
 * Usage: PORT=8931 node test/verify_scene_frame_6129.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js"), WN = read("docs/app/data/whatsnew.js"), PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.138.0", PVER = "6.209.0";
const COUNT = 280;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const EXTENT = "FRAME EXTENT LOCK:", SEP = "COLOUR SEPARATION LOCK:", MATCH = "LIGHT MATCH LOCK:";
/* 6.132.0 — the three cards whose whole job is to grade the WHOLE frame carry a lock of their
   own: they may take IMAGE 2's grade, and must still keep the person readable against the set. */
const SEP_LOOK = "SUBJECT SEPARATION LOCK:";
const SEP_LOOK_IDS = ["studio-look-copy", "full-look-transfer", "regency-birthday"];
const sepTagFor = (id) => (SEP_LOOK_IDS.indexOf(id) >= 0 ? SEP_LOOK : SEP);
const SMOOTH = "SKIN FINISH:", BAL = "FRAME BALANCE:";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ===================== A) the source, once ===================== */
report("A1) the post-pass names its three groups and its one control group: the two locks go to Background & Scene, Studio Scenes and Studio Relight; the three controls only to Background & Scene",
  has(APP, 'var SCENE_LOCK_GROUPS=["Background & Scene","Studio Scenes","Studio Relight"];') &&
  has(APP, 'var SCENE_CTRL_GROUP="Background & Scene";') &&
  has(APP, "if(SCENE_LOCK_GROUPS.indexOf(c.t)<0) return;") && has(APP, "var ctrl=(c.t===SCENE_CTRL_GROUP);") && has(APP, "if(!ctrl) return;"), null);

/* the lock names "the photograph you are editing" rather than IMAGE 1: on Couple Compose and
   the four Outfit & Scene cards the edit target is IMAGE 3, and IMAGE 1 is a face or an outfit
   reference, so a lock that said IMAGE 1 would have guarded the wrong photograph on five cards. */
report("A2) FRAME EXTENT LOCK states the thing twenty-one of the twenty-nine never said — how much of the body is visible — in the owner's own three cases, and forbids inventing past the edited photograph's edge or resizing the person inside it",
  has(APP, 'var EXTENT_TAG="' + EXTENT + '";') &&
  has(APP, "the finished frame shows exactly as much of the person as") &&
  has(APP, "the photograph you are editing already shows") && !has(APP, "as much of the person as IMAGE 1") &&
  has(APP, "a close-up stays a close-up, a") && has(APP, "half-body stays a half-body, a full-length stays full-length.") &&
  has(APP, "a hand, a foot, a hem, a gown's train, a chair") && has(APP, "stays cut off at the same place") &&
  has(APP, "the person is never made larger or smaller") && has(APP, "inside the frame to make room for the new scene:") &&
  has(APP, "never pull back, zoom out or extend the canvas."), null);

report("A3) COLOUR SEPARATION LOCK keeps the whole person's colour, not only the skin, and says how to seat them in the scene instead — light direction, falloff, contact shadow, a faint edge bounce at most",
  has(APP, 'var SEP_TAG="' + SEP + '";') &&
  has(APP, "the scene's colour never washes over the person") &&
  has(APP, "balance and exposure stay exactly as they were photographed") &&
  has(APP, "and skin, hair, outfit") && has(APP, "and jewellery all keep the colour they had") &&
  has(APP, "DIRECTION, falloff and contact shadow, and at most a faint ambient bounce at the") &&
  has(APP, "never an amber, gold, teal or any other tint laid across"), null);

report("A4) the three controls the owner asked for: a LIGHT MATCH LOCK choice of three (professional balance the default, subject-follows-scene, scene-follows-subject), a SKIN FINISH switch OFF by default and a FRAME BALANCE switch ON by default, each labelled in nine languages",
  has(APP, 'var MATCH_TAG="' + MATCH + '";') && has(APP, 'var MATCH_LINE=MATCH_TAG+" {{MATCH}}";') &&
  has(APP, 'key:"matchmode", type:"choice", tag:MATCH_TAG, token:"{{MATCH}}",') && has(APP, '"default":"balance", options:MATCH_OPTS, label:MATCH_LABEL') &&
  has(APP, '{ v:"balance",') && has(APP, '{ v:"subject",') && has(APP, '{ v:"scene",') &&
  has(APP, "the person and the scene meet in the middle") && has(APP, "the person follows the scene") && has(APP, "the scene follows the person") &&
  has(APP, 'key:"skinsmooth", type:"toggle", tag:SMOOTH_TAG, off:SMOOTH_OFF,') && has(APP, '"default":false, label:SMOOTH_LABEL') &&
  has(APP, 'key:"framebal", type:"toggle", tag:BAL_TAG, off:BAL_OFF,') && has(APP, '"default":true, label:BAL_LABEL') &&
  has(APP, "this is never a new face.") && has(APP, "never overrides COLOUR SEPARATION LOCK") &&
  /* a switch that is off says so, rather than leaving the reader of the prompt to infer it */
  has(APP, 'var SMOOTH_OFF=SMOOTH_TAG+" no skin-finish pass at all') && has(APP, 'var BAL_OFF=BAL_TAG+" no whole-frame grade'), null);

report("A5) the pass cannot double-write: every block is added only where its own tag is absent — the separation tag is chosen per card first, so a look card is measured against its own lock — and a card that already owns one of the three keys keeps its own field",
  has(APP, "if(w.prompt.indexOf(EXTENT_TAG)<0)") &&
  has(APP, "var sepTag=(SEP_LOOK_IDS.indexOf(w.id)>=0)?SEP_LOOK_TAG:SEP_TAG;") &&
  has(APP, "if(w.prompt.indexOf(sepTag)<0)") &&
  has(APP, "if(!have.matchmode && w.prompt.indexOf(MATCH_TAG)<0)") &&
  has(APP, "if(!have.skinsmooth && w.prompt.indexOf(SMOOTH_TAG)<0)") &&
  has(APP, "if(!have.framebal && w.prompt.indexOf(BAL_TAG)<0)") &&
  has(APP, 'if(w.negative && w.negative.indexOf("full-length shot")<0)'), null);

/* ===================== B) the app, booted ===================== */
async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.HNK_WF_CATALOG, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate((T) => {
    const out = {};
    const cats = window.HNK_WF_CATALOG || [];
    const bg = cats.find(c => c.t === "Background & Scene");
    const lockOnly = cats.filter(c => c.t === "Studio Scenes" || c.t === "Studio Relight");
    const others = cats.filter(c => ["Background & Scene", "Studio Scenes", "Studio Relight"].indexOf(c.t) < 0);
    const fieldOf = (w, k) => (w.fields || []).filter(f => f.key === k)[0];
    out.bgN = bg ? bg.items.length : 0;
    out.bgGaps = [];
    bg.items.forEach(w => {
      const p = String(w.prompt || ""), n = String(w.negative || "");
      const m = fieldOf(w, "matchmode"), s = fieldOf(w, "skinsmooth"), b = fieldOf(w, "framebal");
      const why = [];
      if (p.indexOf(T.EXTENT) < 0) why.push("no extent");
      const sepWant = T.SEP_LOOK_IDS.indexOf(w.id) >= 0 ? T.SEP_LOOK : T.SEP;
      if (p.indexOf(sepWant) < 0) why.push("no separation");
      if (p.indexOf(T.MATCH + " {{MATCH}}") < 0) why.push("no match line");
      if (p.indexOf(T.SMOOTH) < 0) why.push("no skin finish");
      if (p.indexOf(T.BAL) < 0) why.push("no balance");
      if (!m || m.type !== "choice" || m.default !== "balance" || (m.options || []).length !== 3 || m.token !== "{{MATCH}}") why.push("match field");
      if (!s || s.type !== "toggle" || s.default !== false) why.push("smooth field");
      if (!b || b.type !== "toggle" || b.default !== true) why.push("balance field");
      if (m && !T.LANGS.every(l => m.label[l] && m.options.every(o => o.label[l]))) why.push("match labels");
      if (s && !T.LANGS.every(l => s.label[l]) ) why.push("smooth labels");
      if (b && !T.LANGS.every(l => b.label[l]) ) why.push("balance labels");
      if (n.indexOf("a half-body photograph returned as a full-length shot") < 0) why.push("no crop AVOID");
      if (n.indexOf("the scene's colour cast laid over") < 0) why.push("no cast AVOID");
      if (why.length) out.bgGaps.push(w.id + ": " + why.join(", "));
    });
    /* the two locks reach the other two relighting groups; the three controls do not */
    out.lockOnlyN = 0; out.lockOnlyGaps = [];
    lockOnly.forEach(c => c.items.forEach(w => {
      if (!w.prompt) return;
      out.lockOnlyN++;
      if (String(w.prompt).indexOf(T.EXTENT) < 0 || String(w.prompt).indexOf(T.SEP) < 0) out.lockOnlyGaps.push(w.id + " missing a lock");
      if (fieldOf(w, "matchmode") || fieldOf(w, "skinsmooth") || fieldOf(w, "framebal")) out.lockOnlyGaps.push(w.id + " gained a control");
      if (String(w.prompt).indexOf(T.MATCH) >= 0) out.lockOnlyGaps.push(w.id + " gained the match line");
    }));
    /* nothing outside the three groups moved */
    out.otherN = 0; out.otherTouched = [];
    others.forEach(c => c.items.forEach(w => {
      out.otherN++;
      const p = String(w.prompt || "");
      if ([T.EXTENT, T.SEP, T.MATCH, T.SMOOTH, T.BAL].some(t => p.indexOf(t) >= 0)) out.otherTouched.push(c.t + "/" + w.id);
    }));
    /* the wizard's own field maths, at the default and at every setting */
    out.def = window._wfFieldPrompt("bg-replace", null);
    out.subject = window._wfFieldPrompt("bg-replace", { matchmode: "subject" });
    out.scene = window._wfFieldPrompt("bg-replace", { matchmode: "scene" });
    out.junk = window._wfFieldPrompt("bg-replace", { matchmode: "no-such-mode" });
    out.smoothOn = window._wfFieldPrompt("bg-replace", { skinsmooth: true });
    out.balOff = window._wfFieldPrompt("bg-replace", { framebal: false });
    out.batch = window._wfBatchPrompt("bg-replace");
    return out;
  }, { EXTENT, SEP, SEP_LOOK, SEP_LOOK_IDS, MATCH, SMOOTH, BAL, LANGS });
  /* the wizard draws the design controls on step 3, where they have sat since
     v5.62.0, and step 2 will not let go until the workflow's photo is in its
     slot — so the walk fills IMAGE 1 the way a pick does and taps through */
  await page.evaluate(() => { window._openWizardById("bg-replace"); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("#wiz button")].filter(x => /Start/.test(x.textContent) && !x.disabled)[0];
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.state.refs[0] = { mime: "image/jpeg", b64: "/9j/4AAQSkZJRg==", label: "bride.jpg" };
    if (window._wizOnPick) window._wizOnPick();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("#wiz button")].filter(x => /Next|→/.test(x.textContent) && !x.disabled)[0];
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  Object.assign(r, await page.evaluate(() => ({
    wizText: (document.getElementById("wiz") || {}).textContent || "",
    wizRows: document.querySelectorAll("#wiz .wiz-fields .wiz-field").length,
    wizChoice: document.querySelectorAll("#wiz .wiz-field-choice .chip, #wiz .wiz-choices .chip").length,
    wizToggles: document.querySelectorAll("#wiz .wiz-fields input[type=checkbox]").length
  })));
  await ctx.close();
  return { r, errs };
}

/* ===================== C) the panel ===================== */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  let out = {};
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } }, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) {} });
    await page.waitForTimeout(1200);
    out = await page.evaluate(async () => {
      const o = {};
      const open = (window.HNK && HNK.wfOpen) || window.wfOpen || null;
      if (open) open("bg-replace"); else {
        const card = [...document.querySelectorAll("#pageAiTools .wfmini")].find(c => /Background|BG Replace/i.test(c.textContent));
        if (card) card.click();
      }
      await new Promise(r => setTimeout(r, 800));
      const page2 = document.getElementById("pageAiTools") || document.body;
      o.text = page2.textContent || "";
      o.choiceRow = document.querySelectorAll(".is-choice").length;
      o.switches = document.querySelectorAll("#pageAiTools .sw, #pageAiTools .switch, #pageAiTools input[type=checkbox]").length;
      return o;
    });
  } catch (e) { out.err = String(e && e.message || e).slice(0, 200); }
  await page.close();
  server.close();
  return { out, errs };
}

/* ===================== D) the release ===================== */
function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json")), pv = JSON.parse(read("docs/download/panel-version.json"));
  const CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  report(`D1) ${VER} / panel ${PVER} in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest (+ artifact file, a 64-hex sha and a real size), panel-version.json, the download footer and the landing's badges`,
    has(APP, `var APP_VER="${VER}";`) && has(read("docs/app/version.json"), `"v":"${VER}"`) &&
    has(read("docs/app/sw.js"), `var CACHE = "hnk-web-studio-v${VER.replace(/\./g, "-")}";`) &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) && has(MAIN, `const PANEL_VERSION = "${PVER}";`) &&
    has(read("panel/manifest.json"), `"version": "${PVER}"`) &&
    manifest.version === PVER && manifest.artifact_file === `HNK_Ai_Panel_v${PVER}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === PVER && pv.latest_version === PVER && has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`) &&
    has(LANDING, VER) && has(LANDING, PVER) && !has(CLAIMS, "6.127.1") && !has(CLAIMS, "6.198.1"),
    { manifest: manifest.version, pv: pv.v });
  const wnRow = (s) => { const i = s.indexOf(VER); return i < 0 ? "" : s.slice(i, i + 4000); };
  const rowA = wnRow(WN), rowP = wnRow(PWN);
  report("D2) the What's New row is there in all nine languages, on the web app and in the panel's lifted table",
    !!rowA && !!rowP && LANGS.every(l => new RegExp('"' + l + '"\\s*:').test(rowA.slice(0, 2600))) && LANGS.every(l => new RegExp('"' + l + '"\\s*:').test(rowP.slice(0, 2600))),
    { app: rowA.slice(0, 80), panel: rowP.slice(0, 80) });
  const steps = (CI.match(/node test\//g) || []).length;
  report(`D3) the suite runs this test and the chain says ${COUNT}: the CI step, the count in the workflow and the landing's "${COUNT} tests"`,
    has(CI, "node test/verify_scene_frame_6129.js") && steps === COUNT &&
    has(LANDING, String(COUNT) + " tests") && has(LANDING, 'data-count="tests">' + COUNT + "<"),
    { steps });
}

(async () => {
  const browser = withPremium(await chromium.launch());
  try {
    const { r, errs } = await appWalk(browser);
    report("B1) all thirty Background & Scene cards carry both locks, the match line and the two switch lines, with the designed defaults, nine-language labels and both new AVOID items",
      r.bgN === 30 && r.bgGaps.length === 0, { n: r.bgN, gaps: r.bgGaps.slice(0, 6) });
    report("B2) Studio Scenes and Studio Relight take the two locks and none of the three controls — they relight the same real person, but the controls belong to the group the owner named",
      r.lockOnlyN > 0 && r.lockOnlyGaps.length === 0, { n: r.lockOnlyN, gaps: r.lockOnlyGaps.slice(0, 6) });
    report("B3) no card in any other group gained any of the five lines",
      r.otherN > 100 && r.otherTouched.length === 0, { n: r.otherN, touched: r.otherTouched.slice(0, 6) });
    report("B4) at the defaults the compiled prompt carries the professional-balance line with no raw token left, grades the whole frame (Balance ON) and states that no skin-finish pass runs (Skin smooth OFF) — the original face is not touched unless the student asks",
      /\nLIGHT MATCH LOCK: the person and the scene meet in the middle/.test(r.def) && !/\{\{MATCH\}\}/.test(r.def) &&
      /\nFRAME BALANCE: finish the whole frame/.test(r.def) &&
      /\nSKIN FINISH: no skin-finish pass at all/.test(r.def) && !/give the person a light skin-finish pass/.test(r.def) &&
      r.def.indexOf(EXTENT) > 0 && r.def.indexOf(SEP) > 0,
      { match: (r.def.match(/LIGHT MATCH LOCK:[^\n]{0,60}/) || [])[0], smooth: (r.def.match(/SKIN FINISH:[^\n]{0,40}/) || [])[0] });
    report("B5) the three ways compile to three different rules, and an unknown value falls back to the professional balance",
      /the person follows the scene/.test(r.subject) && !/meet in the middle/.test(r.subject) &&
      /the scene follows the person/.test(r.scene) && !/meet in the middle/.test(r.scene) &&
      /meet in the middle/.test(r.junk) && !/\{\{MATCH\}\}/.test(r.junk),
      { subject: /follows the scene/.test(r.subject), scene: /follows the person/.test(r.scene) });
    report("B6) each switch says what it does in both positions: Skin smooth ON asks for the pass and still forbids a new face, OFF says the skin is left as photographed; Balance OFF says no whole-frame grade; and the one-tap batch prompt carries the locks with no raw token",
      /\nSKIN FINISH: give the person a light skin-finish pass/.test(r.smoothOn) && /this is never a new face\./.test(r.smoothOn) &&
      /\nSKIN FINISH: no skin-finish pass at all/.test(r.def) &&
      /\nFRAME BALANCE: no whole-frame grade/.test(r.balOff) && !/finish the whole frame/.test(r.balOff) &&
      /\nFRAME BALANCE: finish the whole frame/.test(r.def) &&
      r.batch.indexOf(EXTENT) > 0 && r.batch.indexOf(SEP) > 0 && !/\{\{/.test(r.batch) && /\n\nAVOID: /.test(r.batch),
      { smoothOn: (r.smoothOn.match(/SKIN FINISH:[^\n]{0,40}/) || [])[0], balOff: (r.balOff.match(/FRAME BALANCE:[^\n]{0,40}/) || [])[0] });
    report("B7) step 3 of the web app's wizard draws the three controls with their words — Light match over its three ways, Skin smooth and Balance — beside the skin-tone switch, and the walk raised no page error",
      /Light match/.test(r.wizText) && /Professional balance/.test(r.wizText) && /Subject follows scene/.test(r.wizText) &&
      /Scene follows subject/.test(r.wizText) && /Skin smooth/.test(r.wizText) && /Balance/.test(r.wizText) &&
      r.wizRows === 4 && errs.length === 0,
      { rows: r.wizRows, toggles: r.wizToggles, errs, sample: r.wizText.slice(0, 200) });

    /* C) the panel carries the identical record */
    const cat = (() => { const m = {}; const src = read("panel/js/hnk_wf_catalog_data.js");
      const i = src.indexOf("var CATALOG = "); const j = src.indexOf(";\n", i);
      m.json = JSON.parse(src.slice(i + 14, j)); return m.json; })();
    const pItems = [].concat.apply([], cat.categories.map(c => c.items));
    const pBg = cat.categories.find(c => c.category === "Background & Scene");
    const pGaps = [];
    (pBg ? pBg.items : []).forEach(w => {
      const p = String(w.prompt || ""), n = String(w.negative || "");
      const f = (k) => (w.fields || []).filter(x => x.key === k)[0];
      if (p.indexOf(EXTENT) < 0 || p.indexOf(sepTagFor(w.id)) < 0 || p.indexOf(MATCH) < 0) pGaps.push(w.id + " lines");
      if (!f("matchmode") || !f("skinsmooth") || !f("framebal")) pGaps.push(w.id + " fields");
      if (n.indexOf("full-length shot") < 0) pGaps.push(w.id + " avoid");
    });
    report("C1) the panel's lifted catalog carries the same thirty records — both locks, the match line, the three fields and the two AVOID items — so the CCX says what the web app says",
      !!pBg && pBg.items.length === 30 && pGaps.length === 0 && pItems.length === cat.total,
      { n: pBg && pBg.items.length, gaps: pGaps.slice(0, 6) });
    const REG = require("../panel/src/workflows/workflow-registry.js");
    const cDef = REG.compile("bg-replace", undefined), cSub = REG.compile("bg-replace", { matchmode: "subject" });
    const cSm = REG.compile("bg-replace", { skinsmooth: true }), cBal = REG.compile("bg-replace", { framebal: false });
    report("C2) the panel's compiler resolves the three controls exactly as the app's wizard does: the default is the professional balance with no raw token and each switch's OFF line, subject-follows-scene swaps the rule, Skin smooth ON asks for the pass and Balance OFF says no whole-frame grade",
      !!cDef && /LIGHT MATCH LOCK: the person and the scene meet in the middle/.test(cDef.prompt) && !/\{\{MATCH\}\}/.test(cDef.prompt) &&
      /SKIN FINISH: no skin-finish pass at all/.test(cDef.prompt) && /FRAME BALANCE: finish the whole frame/.test(cDef.prompt) &&
      /the person follows the scene/.test(cSub.prompt) &&
      /SKIN FINISH: give the person a light skin-finish pass/.test(cSm.prompt) &&
      /FRAME BALANCE: no whole-frame grade/.test(cBal.prompt) && !/finish the whole frame/.test(cBal.prompt),
      { def: (cDef && cDef.prompt.match(/LIGHT MATCH LOCK:[^\n]{0,50}/) || [])[0],
        smOn: (cSm && cSm.prompt.match(/SKIN FINISH:[^\n]{0,40}/) || [])[0],
        balOff: (cBal && cBal.prompt.match(/FRAME BALANCE:[^\n]{0,40}/) || [])[0] });
    const { out, errs: pErrs } = await panelWalk(browser);
    const pt = out.text || "";
    report("C3) the Photoshop panel opens the card and draws the same three controls, in the student's own language (the panel boots Burmese), with a chip row for the three ways and no page error",
      !out.err && /Light match|\u1021\u101c\u1004\u103a\u1038 \u1000\u102d\u102f\u1000\u103a\u100a\u103e\u102d\u1019\u103e\u102f/.test(pt) &&
      /Professional balance|Professional \u101f\u1014\u103a\u1001\u103b\u1000\u103a/.test(pt) &&
      /Skin smooth|\u1021\u101e\u102c\u1038\u1021\u101b\u1031 \u1001\u103b\u1031\u102c\u1019\u103d\u1031\u1037/.test(pt) &&
      out.choiceRow >= 1 && pErrs.length === 0,
      { err: out.err, choiceRow: out.choiceRow, switches: out.switches, errs: pErrs, sample: pt.slice(0, 220) });
    releasePins();
  } catch (e) { report("X) the walk ran", false, String(e && e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
