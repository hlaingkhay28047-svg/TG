/* 6.133.0 — HORSE & STRAW: the owner's own card, and the one rule that makes it work.
 *
 * The owner wrote the card out in full and ended in Burmese:
 * "မြင်းကလူကိုလိုက်ပြီး pose အလိုက်သင့်နေပေးတာ အဲ့လို လုပ်ပေးပါ smartworkflow အသစ်ကို" —
 * the horse should follow the person and sit right for the pose. Everything else in the spec is the
 * same sentence said twice: an ABSOLUTE SUBJECT LOCK and an ABSOLUTE FRAME LOCK. So the card is one
 * required photo, one horse, straw on the floor the photograph already shows, and a size-and-pose
 * table read off the subject's own framing — half-body, three-quarter, full-length, sitting,
 * kneeling, reclining. The horse is cropped when it must be; the person never is.
 *
 * It lands in Background & Scene, which means the 6.129.0 + 6.132.0 house lines come with it —
 * FRAME EXTENT LOCK, COLOUR SEPARATION LOCK, LIGHT MATCH LOCK, SKIN FINISH, FRAME BALANCE — and
 * those say, in the studio's own words, exactly what the owner's two locks say. C4 re-runs the
 * 6.132.0 standing scanner over this card: its own words must never license what its own locks
 * forbid.
 *
 * What is pinned: the record (one input, no optional, the named locks, the five size rules, the
 * four pose rules, the straw rule, the occlusion rule, the AVOID list), its place in the catalog,
 * the nine-language card line, the four-step guide in English and Myanmar, the card picture, the
 * composed prompt the wizard really sends (house lines present, no raw token left), the panel's
 * lifted catalog and compiler producing the same prompt, the counts 198 → 199 / 205 → 206, the
 * What's New row in nine languages, the CI step, the live test-count chain and the release lockstep
 * (both of which move with every wave, so this header names neither by number).
 * Usage: PORT=8931 node test/verify_horse_straw_6133.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html"), LANDING = read("docs/index.html"), CI = read(".github/workflows/test.yml");
const MAIN = read("panel/main.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.137.0", PVER = "6.208.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.133.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 279;
const ID = "horse-straw";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/* ===================== A) the record ===================== */
const A = require("../tools/lib/app-data.js");
const lib = A.readLibWf(), W = lib.workflows;
const at = (id) => W.findIndex(w => w.id === id);
const HS = W[at(ID)];

report("A1) the record exists, titled Horse & Straw, and sits in the catalog right after Decor Theme Colour",
  !!HS && HS.title === "Horse & Straw" && at(ID) === at("decor-theme-color") + 1 && W.length === 95,
  { at: at(ID), dt: at("decor-theme-color"), n: W.length });

report("A2) ONE required photo and nothing optional — the student's own picture is the whole input",
  !!HS && Array.isArray(HS.req) && HS.req.length === 1 && /IMAGE 1/.test(HS.req[0]) &&
  Array.isArray(HS.opt) && HS.opt.length === 0 && !HS.fields,
  HS && { req: HS.req, opt: HS.opt, fields: HS.fields });

const P = String((HS || {}).prompt || "");
report("A3) the two locks the owner asked for are named LOCK, so the 6.126.0 lock-aware cut keeps them whole on a capped model",
  /\nSUBJECT LOCK: /.test(P) && /\nFRAME LOCK: /.test(P) &&
  /never regenerated/.test(P) && /the camera angle, the crop/i.test(P) &&
  /no zoom in, no zoom out, no wider canvas, no re-crop, no reframe/.test(P) &&
  /The horse adapts to the frame; the frame never adapts to the horse\./.test(P),
  { subject: /\nSUBJECT LOCK: /.test(P), frame: /\nFRAME LOCK: /.test(P) });

report("A4) the size table reads the subject's own framing — five cases, each naming what the horse becomes",
  /HORSE SIZE — read the subject's own framing first/.test(P) &&
  /standing at full length: a near full-size horse/.test(P) &&
  /sitting or kneeling: a smaller visual presence/.test(P) &&
  /lying or reclining: the horse behind or beside them, reduced/.test(P) &&
  /half-body or upper-body portrait: only the part of the horse that fits/.test(P) &&
  /three-quarter photograph: a medium view of the horse/.test(P),
  { table: (P.match(/^- the subject|^- a (half|three)/gm) || []).length });

report("A5) the horse is what gets cropped, never the person",
  /HORSE FRAMING: crop the horse, never the person\./.test(P) &&
  /does not fit inside IMAGE 1's own frame is simply outside it/.test(P), null);

report("A6) POSE MATCH answers all four of the owner's cases, and the horse is always calm",
  /POSE MATCH: the horse answers the subject's pose\./.test(P) &&
  /Standing — the horse stands calmly beside or just behind them\./.test(P) &&
  /Sitting or kneeling — the horse lowers its head or angles its neck gently toward them\./.test(P) &&
  /Lying or reclining — the horse rests calmly nearby/.test(P) &&
  /Turned to the left or the right — the horse angles to match\./.test(P) &&
  /never rearing, never agitated/.test(P), null);

report("A7) one horse, real anatomy, dark mane and tail, a simple dark leather bridle",
  /HORSE DETAIL: realistic equine anatomy/.test(P) && /a dark mane and tail/.test(P) &&
  /a simple dark leather bridle/.test(P) && /ONE horse only/.test(P), null);

report("A8) straw goes only on ground the photograph already shows, and the horse hides nothing that matters",
  /STRAW: dry golden-beige straw and hay scattered realistically on the ground the photograph already shows/.test(P) &&
  /Never invent ground the frame does not have\./.test(P) &&
  /OCCLUSION: the horse never covers the face, the body, a key detail of the clothing, the hands/.test(P), null);

report("A9) the horse is integrated into IMAGE 1's own optics and light, with real contact shadows",
  /INTEGRATION: match IMAGE 1's perspective, lens character and depth of field/.test(P) &&
  /its light direction, brightness and exposure, its white balance and its tone/.test(P) &&
  /real contact shadows that follow IMAGE 1's own light/.test(P) &&
  /RESULT: the same photograph as IMAGE 1 with one addition/.test(P), null);

const N = String((HS || {}).negative || "");
report("A10) the AVOID list names the failures this card can have — a second or wrong-sized horse, a covered face, invented ground",
  ["changed face", "changed pose", "re-cropped", "reframed", "zoomed out", "a wider canvas",
   "a second horse", "a miniature horse", "an oversized horse", "a distorted horse",
   "the horse covering the face", "the horse covering the hands",
   "straw on ground the photograph does not show", "missing contact shadow", "watermark"]
    .every(k => has(N, k)),
  { missing: ["changed face", "a second horse", "a miniature horse", "an oversized horse",
    "the horse covering the face", "straw on ground the photograph does not show"].filter(k => !has(N, k)) });

report("A11) the card is listed in the Background & Scene group, so the house scene locks reach it",
  /"prop-insert","decor-theme-color","horse-straw"/.test(APP), null);

report("A12) the four-step guide is there in English and in Myanmar, and the nine-language card line is complete",
  has(APP, '"' + ID + '": [\n      "Add your photo as IMAGE 1') &&
  has(APP, '"' + ID + '": [\n      "ကိုယ့်ပုံကို IMAGE 1') &&
  (APP.match(new RegExp('"' + ID + '": \\[', "g")) || []).length === 2 &&
  LANGS.every(l => new RegExp('"' + ID + '":\\{[^}]*\\b' + l + ':"').test(APP)),
  { steps: (APP.match(new RegExp('"' + ID + '": \\[', "g")) || []).length });

const cardJpg = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
const cardBuf = fs.existsSync(cardJpg) ? fs.readFileSync(cardJpg) : null;
report("A13) the card carries its own picture, a real JPEG of the studio's own card size",
  !!cardBuf && cardBuf.length > 40000 && (() => { const d = jpegSize(cardBuf); return !!d && d.w === 960 && d.h === 640; })(),
  { bytes: cardBuf && cardBuf.length, size: cardBuf && jpegSize(cardBuf) });

/* ===================== B) the app, booted ===================== */
/* the 6.132.0 standing scanner, re-used verbatim: a card's own words may never
   license what its own locks forbid */
const SCAN_FN = `(function (body) {
    const RULES = [
      { v: "\\\\bextend(?:s|ed|ing)?\\\\b",            k: "extend",              f: "frame",  n: "\\\\bframe\\\\b|\\\\bcanvas\\\\b", a: 200 },
      { v: "\\\\bzoom(?:ing)? out\\\\b",               k: "zoom out",            f: "frame" },
      { v: "\\\\bpull(?:ing)? back\\\\b",              k: "pull back",           f: "frame" },
      { v: "\\\\bchoos(?:e|ing)\\\\b",                 k: "choose the framing",  f: "frame",  n: "\\\\b(scale|framing)\\\\b", a: 90 },
      { v: "colou?r[- ]?grad(?:e|ing)\\\\s+(?:the subject|the person|them)\\\\b", k: "grade the person", f: "colour" },
      { v: "\\\\bcolou?r\\\\b",                        k: "scene colour on the person", f: "colour",
        n: "\\\\b(on|onto|over|falling on)\\\\s+the\\\\s+(subject|person|skin)\\\\b", a: 70 },
    ];
    const NEG = /\\b(never|not|no|without|cannot|don't)\\b/i;
    const PLACE = /\\b(THE PLACE|THE SET|the place|the set|the environment|the scene|the background|the backdrop)\\b/;
    const out = [];
    RULES.forEach(function (r) {
      const re = new RegExp(r.v, "gi");
      let m;
      while ((m = re.exec(body))) {
        const i = m.index;
        if (r.n && !new RegExp(r.n, "i").test(body.slice(i, i + (r.a || 120)))) continue;
        if (NEG.test(body.slice(Math.max(0, i - 70), i))) continue;
        if (r.f === "frame" && PLACE.test(body.slice(Math.max(0, i - 45), i + 60))) continue;
        out.push(r.k + " :: " + body.slice(Math.max(0, i - 40), i + 110).replace(/\\s+/g, " ").trim());
      }
    });
    return out;
  })`;

async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {}
  });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.HNK_WF_CATALOG, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate((T) => {
    const out = {};
    const cats = window.HNK_WF_CATALOG || [];
    const bg = cats.find(c => c.t === "Background & Scene");
    out.bgN = bg ? bg.items.length : 0;
    const w = bg && bg.items.filter(x => x.id === T.ID)[0];
    out.found = !!w;
    if (!w) return out;
    out.prompt = String(w.prompt || "");
    out.negative = String(w.negative || "");
    out.fieldKeys = (w.fields || []).map(f => f.key);
    out.cardImg = w.cardImg || "";
    out.title = w.title || "";
    /* the scan reads only the card's OWN words — the house lines are stripped first */
    const own = out.prompt.split("\n").filter(l => !T.HOUSE.some(t => l.indexOf(t) === 0)).join("\n");
    out.licence = eval(T.SCAN)(own);
    out.def = window._wfFieldPrompt(T.ID, null);
    out.batch = window._wfBatchPrompt(T.ID);
    return out;
  }, { ID, HOUSE: ["FRAME EXTENT LOCK:", "COLOUR SEPARATION LOCK:", "SUBJECT SEPARATION LOCK:",
                   "LIGHT MATCH LOCK:", "SKIN FINISH:", "FRAME BALANCE:", "REAL PHOTOGRAPH:", "SKIN TONE TRUTH:"],
      SCAN: SCAN_FN });
  await ctx.close();
  return { r, errs };
}

/* ===================== C) the panel ===================== */
function panelCatalog() {
  const src = read("panel/js/hnk_wf_catalog_data.js");
  const i = src.indexOf("var CATALOG = "), j = src.indexOf(";\n", i);
  return JSON.parse(src.slice(i + 14, j));
}

(async () => {
  const browser = withPremium(await chromium.launch());
  try {
    const { r, errs } = await appWalk(browser);

    report("B1) the composed card really is in Background & Scene once the app has built the catalog, with its own picture",
      r.found && r.title === "Horse & Straw" && r.cardImg === "lib/wf/cards5/" + ID + ".jpg" && r.bgN === 30,
      { found: r.found, n: r.bgN, img: r.cardImg });

    /* the v5.74.0 guard: a card whose OWN prompt already names the skin tone keeps its own
       wording and is given neither the house SKIN TONE TRUTH line nor the "Keep real skin tone"
       switch. Horse & Straw's SUBJECT LOCK names it ("the expression, the skin tone, the hair"),
       so it joins the twelve of the thirty Background & Scene cards that state it themselves —
       master-bgfg-replace, couple-compose and the four Outfit & Scene cards among them. Its
       skin tone is therefore locked unconditionally rather than left to a switch. */
    report("B2) it inherits the house scene lines — the two 6.129.0 locks plus the three controls the owner's group carries — and, because its own SUBJECT LOCK names the skin tone, the v5.74.0 guard gives it neither the SKIN TONE TRUTH line nor the switch",
      ["FRAME EXTENT LOCK:", "COLOUR SEPARATION LOCK:", "LIGHT MATCH LOCK:", "SKIN FINISH:", "FRAME BALANCE:"]
        .every(t => has(r.prompt || "", t)) &&
      ["matchmode", "skinsmooth", "framebal"].every(k => (r.fieldKeys || []).indexOf(k) >= 0) &&
      (r.fieldKeys || []).indexOf("skintone") < 0 && !has(r.prompt || "", "SKIN TONE TRUTH:") &&
      /the expression, the skin tone, the hair/.test(r.prompt || ""),
      { keys: r.fieldKeys, missing: ["FRAME EXTENT LOCK:", "COLOUR SEPARATION LOCK:", "LIGHT MATCH LOCK:", "SKIN FINISH:", "FRAME BALANCE:"].filter(t => !has(r.prompt || "", t)) });

    report("B3) the house AVOID items join the card's own list, so the scene failures are refused here too",
      has(r.negative || "", "a half-body photograph returned as a full-length shot") &&
      has(r.negative || "", "a second horse") && has(r.negative || "", "the horse covering the face"),
      { tail: (r.negative || "").slice(-160) });

    report("B4) THE STANDING RULE — the card's own words license nothing its own locks forbid",
      Array.isArray(r.licence) && r.licence.length === 0, { licence: (r.licence || []).slice(0, 4) });

    report("B5) the wizard compiles it with no raw token left, both at the defaults and as a one-tap batch",
      typeof r.def === "string" && r.def.length > 1500 && !/\{\{/.test(r.def) &&
      /\nLIGHT MATCH LOCK: the person and the scene meet in the middle/.test(r.def) &&
      has(r.def, "SUBJECT LOCK:") && has(r.def, "HORSE SIZE") &&
      typeof r.batch === "string" && !/\{\{/.test(r.batch) && /\n\nAVOID: /.test(r.batch) &&
      has(r.batch, "crop the horse, never the person"),
      { def: (r.def || "").length, batch: (r.batch || "").length });

    report("B6) no page error while the catalog was built and the card compiled", errs.length === 0, errs);

    /* ---- C) the panel carries the identical record ---- */
    const cat = panelCatalog();
    const pItems = [].concat.apply([], cat.categories.map(c => c.items));
    const pBg = cat.categories.find(c => c.category === "Background & Scene");
    const pw = pBg && pBg.items.filter(x => x.id === ID)[0];
    report("C1) the panel's lifted catalog carries Horse & Straw under Background & Scene with the app's prompt, AVOID list and one input — 199 cards in all",
      !!pw && pw.title === "Horse & Straw" && pw.prompt === r.prompt && pw.negative === r.negative &&
      (pw.req || []).length === 1 && cat.total === 199 && pItems.length === 199,
      { found: !!pw, total: cat.total, items: pItems.length, samePrompt: !!pw && pw.prompt === r.prompt });

    const REG = require("../panel/src/workflows/workflow-registry.js");
    const c = REG.compile(ID, undefined);
    const cSub = REG.compile(ID, { matchmode: "subject" });
    const cSm = REG.compile(ID, { skinsmooth: true }), cBal = REG.compile(ID, { framebal: false });
    report("C2) the panel's own compiler resolves the card and its three controls exactly as the app's wizard does (the AVOID list rides the record, as it does for every scene card, and is appended at send)",
      !!c && !/\{\{/.test(c.prompt) && has(c.prompt, "SUBJECT LOCK:") && has(c.prompt, "HORSE FRAMING: crop the horse, never the person.") &&
      /\nLIGHT MATCH LOCK: the person and the scene meet in the middle/.test(c.prompt) &&
      /SKIN FINISH: no skin-finish pass at all/.test(c.prompt) && /FRAME BALANCE: finish the whole frame/.test(c.prompt) &&
      /the person follows the scene/.test(cSub.prompt) &&
      /SKIN FINISH: give the person a light skin-finish pass/.test(cSm.prompt) &&
      /FRAME BALANCE: no whole-frame grade/.test(cBal.prompt) && !/finish the whole frame/.test(cBal.prompt),
      { len: c && c.prompt.length });

    /* ---- D) the release ---- */
    const WNJ = A.readWhatsNew(), rows = WNJ.rows || WNJ;
    const row = rows.filter(x => x.v === WAVE_V)[0];
    const PWN = read("panel/js/hnk_whats_new.js");
    /* 6.134.0 — it led the strip when this wave shipped; each release since adds a row above it, so the
       claim is that the row is there, near the top, and still points at the card — never that it leads. */
    report("D2) What's New carries the " + WAVE_V + " row near the top, in all nine languages, pointing at the card — and the panel's lifted table carries it too",
      !!row && rows.indexOf(row) <= 4 &&   /* 6.135.0, 6.136.0, then 6.137.0 — one more release above it each time */ row.kind === "wf" && row.ref === ID &&
      LANGS.every(l => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 200) &&
      has(PWN, '"v":"' + WAVE_V + '"') && has(PWN, '"ref":"' + ID + '"'),
      row && { at: rows.indexOf(row), kind: row.kind, ref: row.ref, langs: LANGS.filter(l => !row.t[l]) });

    report("D2) the counts moved 198 → 199 Smart Workflows and 205 → 206 One-Tap on the app's meta and statline, the landing (ASCII and Myanmar digits, both counters) and nowhere is the old pair left",
      (APP.match(/Smart Workflow 199/g) || []).length === 3 && !has(APP, "Smart Workflow 198") &&
      (APP.match(/One-Tap 206/g) || []).length === 3 && !has(APP, "One-Tap 205") &&
      has(APP, '<b id="stWfCount">199</b>') && has(APP, '<b id="stTapCount">206</b>') &&
      (LANDING.match(/Smart Workflow 199/g) || []).length >= 30 && (LANDING.match(/One-Tap 206/g) || []).length >= 30 &&
      /data-count="wf">199</.test(LANDING) && /data-count="tap">206</.test(LANDING) &&
      has(LANDING, "၁၉၉") && !has(LANDING, "၁၉၈"),
      { app199: (APP.match(/Smart Workflow 199/g) || []).length, landing199: (LANDING.match(/Smart Workflow 199/g) || []).length });

    const steps = (CI.match(/node test\//g) || []).length;
    report("D3) CI runs this test and the chain says " + COUNT + ": the step, the count in the workflow and the landing's \"" + COUNT + " tests\"",
      has(CI, "node test/verify_horse_straw_6133.js") && steps === COUNT &&
      has(LANDING, COUNT + " tests") && has(LANDING, 'data-count="tests">' + COUNT + "<") && !has(LANDING, "274 tests"),
      { steps });

    const man = JSON.parse(read("panel/release-manifest.json"));
    const pv = JSON.parse(read("docs/download/panel-version.json"));
    report("D4) " + VER + " / panel " + PVER + " in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest, panel-version.json, the download footer and the landing's badges",
      has(APP, 'var APP_VER="' + VER + '";') && has(read("docs/app/version.json"), '"v":"' + VER + '"') &&
      /* derived from VER, not spelled out: a bump that forgot the service worker's cache name
         is exactly what this line is for, and a hard-coded name only catches it once */
      has(read("docs/app/sw.js"), 'hnk-web-studio-v' + VER.replace(/\./g, "-")) &&
      has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') && has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') &&
      has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
      man.version === PVER && man.artifact_file === "HNK_Ai_Panel_v" + PVER + ".ccx" && /^[0-9a-f]{64}$/.test(man.sha256) && man.bytes > 20000000 &&
      pv.v === PVER && pv.latest_version === PVER &&
      has(read("docs/download/index.html"), "Web App " + VER + " · Panel " + PVER) &&
      has(LANDING, VER) && has(LANDING, PVER),
      { man: man.version, pv: pv.v });
  } catch (e) {
    report("X) the walk ran", false, String(e && e.stack || e).slice(0, 600));
  }
  await browser.close();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nALL PASS — the horse fits the frame, and the frame never bends to the horse");
  process.exit(failures ? 1 : 0);
})();
