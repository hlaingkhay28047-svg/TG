/* 6.32.2 — REFERENCE SCENES, the owner's two-image Smart Workflow, its prompt word for word.
 *
 * The owner's brief (2026-09-07): "Reference scenes from image 2 keep image 1 subject frame and composition and scenes follow
 * the subject compose — ခုပေးထားတဲ့ prompts ကို အတိအကျ သုံးပြီး Reference scenes smart workflow card အသစ်လုပ်ပေးပါ": a card that
 * takes the student's photo (IMAGE 1) and a scene photograph (IMAGE 2) and sends that sentence FIRST, then (6.32.3) the input roles. So this test pins the
 * prompt byte for byte — in the record, in the panel's lifted catalog, and in the prompt the page composes for the engine
 * (wfLocked adds no FRAME LOCK: the sentence already speaks of composition) — plus the two required inputs, no fields, the
 * Background & Scene slot after Studio Look Copy, the nine-language summary, the four-step guide in both languages, the card
 * picture (960x640, the pack's geometry) drawn from one real pass of the prompt, the Smart Workflow count moving 193 → 194 on
 * the app, the landing and its counter, the What's New row, and the CI step.
 * Usage: PORT=8931 node test/verify_reference_scenes.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const PANEL_CAT = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"), "utf8");
const PANEL_WN = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_whats_new.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const ID = "reference-scenes";
const PROMPT = "Reference scenes from image 2 keep image 1 subject frame and composition and scenes follow the subject compose";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) { if (buf[i] !== 0xFF) { i++; continue; } const m = buf[i + 1]; if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + buf.readUInt16BE(i + 2); }
  return null;
}

/* ---- A) the record ---- */
const lib = JSON.parse(APP.match(/<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const w = lib.workflows.find(x => x.id === ID), idx = lib.workflows.findIndex(x => x.id === ID), slc = lib.workflows.findIndex(x => x.id === "studio-look-copy");
report("A) the record takes exactly two required inputs — your photo as IMAGE 1, the scene as IMAGE 2 — no optional input and no fields",
  !!w && w.req.length === 2 && /Your Photo.*IMAGE 1/.test(w.req[0]) && /Scene.*IMAGE 2/.test(w.req[1]) && (w.opt || []).length === 0 && Array.isArray(w.fields) && w.fields.length === 0, w && { req: w.req, fields: w.fields });
/* 6.32.3 — the bare sentence made two-image edit models hand IMAGE 2 back (the reference photograph itself, watermark included); the roles
   behind it are the Studio Look Copy shape: IMAGE 1 the only edit target and the only person, IMAGE 2 the place only, never returned itself */
report("A2) the prompt OPENS with the owner's sentence, byte for byte, then names the input roles (IMAGE 1 the only edit target and the only person; IMAGE 2 a scene reference only, never returned itself, its person and watermark never copied) — no lock, guard or token words",
  !!w && w.prompt.indexOf(PROMPT + "\n\nINPUT ROLES:\n- IMAGE 1 is the ONLY edit target and the ONLY person in the result.") === 0 && /- IMAGE 2 is a SCENE REFERENCE ONLY\./.test(w.prompt) && /Never return IMAGE 2 itself, and never put IMAGE 2's person in the frame\.$/.test(w.prompt) &&
  /never copy any text, logo, signature or watermark on it/.test(w.prompt) && !/FRAME LOCK|TASK GUARD|EXTRA REQUEST|\{\{/.test(w.prompt) && /IMAGE 2 returned as the result/.test(w.negative) && /reference watermark/.test(w.negative),
  w && { head: w.prompt.slice(0, 140), tail: w.prompt.slice(-80) });
report("A3) title, summary and explanation say what moves and what stays; the AVOID list names IMAGE 2's person, a re-crop and a floating subject; the record sits right after Studio Look Copy",
  !!w && w.title === "Reference Scenes" && /IMAGE 2/.test(w.summary) && /IMAGE 1/.test(w.summary) && /stay as shot/.test(w.summary) && /word for word/.test(w.explanation) &&
  /IMAGE 2's person/.test(w.negative) && /re-cropped/.test(w.negative) && /floating subject/.test(w.negative) && idx === slc + 1 && typeof w.visual === "string" && /^user-ref-\d+\.jpg$/.test(w.visual) && fs.existsSync(path.join(ROOT, "docs", "app", "lib", "ui", w.visual)),
  w && { title: w.title, idx, slc, visual: w.visual });

/* ---- B) the category, the summary row, the guides ---- */
report("B) Background & Scene lists it right after Studio Look Copy and before Couple Compose",
  APP.indexOf('"scene-fit-pro","studio-look-copy","reference-scenes","couple-compose",') >= 0, "category line");
const sumRow = (APP.match(new RegExp('      "' + ID + '":\\{([^\\n]*)\\},\\n')) || [])[1] || "";
report("B2) the nine-language summary row exists and names IMAGE 1 and IMAGE 2 in English",
  LANGS.every(l => sumRow.indexOf(l + ':"') >= 0) && /IMAGE 2/.test(sumRow) && /IMAGE 1/.test(sumRow), sumRow.slice(0, 120));
const steps = [...APP.matchAll(new RegExp('"' + ID + '": \\[\\n((?:      "[^\\n]*",?\\n)+)    \\]', "g"))].map(m => m[1]);
report("B3) both guide blocks (English and Myanmar) have four lines, name IMAGE 1 and IMAGE 2, and end on GENERATE",
  steps.length === 2 && steps.every(b => (b.match(/\n/g) || []).length === 4 && /IMAGE 1/.test(b) && /IMAGE 2/.test(b) && /GENERATE/.test(b)) && /word for word/.test(steps[0]), { blocks: steps.length });

/* ---- C) the card picture ---- */
const art = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
const bytes = fs.existsSync(art) ? fs.readFileSync(art) : null, sz = bytes ? jpegSize(bytes) : null;
report("C) the card picture exists at the pack's 960x640 and the card is not on the no-picture list",
  !!sz && sz.w === 960 && sz.h === 640 && !new RegExp('NO_CARD_JPG=\\[[^\\]]*"' + ID + '"').test(APP), sz);

/* ---- D) the counts, What's New, CI ---- */
report("D) the app's meta, the landing and its counter all count 194 Smart Workflows (193 nowhere)",
  APP.indexOf("Smart Workflow 194") >= 0 && APP.indexOf("Smart Workflow 193") < 0 && (LANDING.match(/Smart Workflow 194/g) || []).length >= 30 && LANDING.indexOf("Smart Workflow 193") < 0 &&
  /data-count="wf">194</.test(LANDING) && !/data-count="wf">193</.test(LANDING) && lib.workflows.filter(x => !x.kind).length + 0 > 0,
  { app: APP.indexOf("Smart Workflow 194") >= 0, landing: (LANDING.match(/Smart Workflow 194/g) || []).length });
const wn = (APP.match(new RegExp('\\{ v:"6\\.32\\.2", kind:"wf", ref:"' + ID + '",[\\s\\S]*?\\} \\},\\n')) || [""])[0];
const wn3 = (APP.match(new RegExp('\\{ v:"6\\.32\\.3", kind:"wf", ref:"' + ID + '",[\\s\\S]*?\\} \\},\\n')) || [""])[0];
report("D3) WHATS_NEW carries the 6.32.3 fix row (kind wf) above the 6.32.2 row, a title and a line in all nine languages, and it names the roles",
  !!wn3 && LANGS.every(l => (wn3.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /IMAGE 1 = the person to keep/.test(wn3) && APP.indexOf(wn3) < APP.indexOf(wn), { row: wn3.slice(0, 90) });
report("D2) WHATS_NEW carries the 6.32.2 row (kind wf) with a title and a line in all nine languages, the panel's lifted What's New carries it, and CI runs this test",
  !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && /word for word/.test(wn) && PANEL_WN.indexOf('"' + ID + '"') >= 0 && /PORT=8931 node test\/verify_reference_scenes\.js/.test(CI),
  { row: wn.slice(0, 100), panel: PANEL_WN.indexOf('"' + ID + '"') >= 0, ci: /verify_reference_scenes/.test(CI) });

/* ---- E) the panel carries it, prompt identical ---- */
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items)), pi = items.find(x => x.id === ID);
const bgCat = cat.categories.find(c => c.items.some(x => x.id === ID));
/* the lifted catalog carries the COMPOSED prompt — the owner's sentence first, then only the two house lines every Background & Scene card
   gets (REAL PHOTOGRAPH, SKIN TONE TRUTH); no FRAME LOCK (the sentence already speaks of composition), no guard, no token */
const HOUSE = /^(REAL PHOTOGRAPH:|SKIN TONE TRUTH:)/;
const REC = w ? w.prompt : PROMPT;   /* 6.32.3 — the record's whole prompt (sentence + roles); the house lines follow THAT */
const houseOnly = extra => { const ls = extra.split("\n"); return ls[0] === "" && ls.length >= 2 && ls.slice(1).every(l => HOUSE.test(l)) && !/FRAME LOCK|TASK GUARD|\{\{|EXTRA REQUEST/.test(extra); };
report("E) the panel's lifted catalog carries the record in Background & Scene with the same two inputs, the record's prompt (the owner's sentence + the roles) with only the house lines after it, and counts 194 items",
  !!pi && typeof pi.prompt === "string" && pi.prompt.indexOf(REC) === 0 && houseOnly(pi.prompt.slice(REC.length)) && Array.isArray(pi.req) && pi.req.length === 2 && !!bgCat && /Background/.test(bgCat.category || bgCat.t || "") && items.length === 194,
  { found: !!pi, head: pi && pi.prompt.slice(0, 120), tail: pi && pi.prompt.slice(REC.length, REC.length + 60), n: items.length, cat: bgCat && (bgCat.category || bgCat.t) });

/* ---- F) the page ---- */
(async () => {
  const browser = await chromium.launch(); withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 940 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2400);
    const live = await page.evaluate(id => {
      const rec = LW.workflows.filter(x => x.id === id)[0];
      const cats = (window.HNK_WF_CATALOG || []).filter(c => (c.items || []).some(i => i.id === id));
      const bg = cats[0], ids = bg ? bg.items.map(i => i.id) : [];
      const composed = window._wfBatchPrompt ? window._wfBatchPrompt(id) : null;
      const item = bg ? bg.items.filter(i => i.id === id)[0] : null;
      return { rec: !!rec, cats: cats.map(c => c.t), after: ids.indexOf(id) === ids.indexOf("studio-look-copy") + 1, composed, itemPrompt: item && item.prompt, summary: item && item.summary, req: item && item.req };
    }, ID);
    /* the page's item prompt = the owner's sentence + the two house lines; the batch prompt the engine receives = that + the AVOID list, as on every card */
    const itemOk = typeof live.itemPrompt === "string" && live.itemPrompt.indexOf(REC) === 0 && houseOnly(live.itemPrompt.slice(REC.length));
    report("F) on the page the record is in Background & Scene right after Studio Look Copy; its prompt opens with the owner's sentence exactly, then the input roles, followed only by the two house lines every card gets (REAL PHOTOGRAPH, SKIN TONE TRUTH) — no FRAME LOCK (the prompt already speaks of crop and framing), no token, nothing else; the batch prompt the engine receives is that plus the AVOID list; the panel's lifted item is the same prompt",
      live.rec && live.cats.length === 1 && /Background/.test(live.cats[0]) && live.after && itemOk && live.composed === live.itemPrompt + "\n\nAVOID: " + w.negative + "." && (!pi || pi.prompt === live.itemPrompt) &&
      typeof live.summary === "string" && live.summary.length > 10 && live.req && live.req.length === 2,
      { cats: live.cats, after: live.after, item: live.itemPrompt && live.itemPrompt.slice(0, 130), tail: live.itemPrompt && live.itemPrompt.slice(REC.length, REC.length + 40), avoid: live.composed && live.composed.slice(-60), panelSame: !!pi && pi.prompt === live.itemPrompt });
    report("F2) no page error", errs.length === 0, errs);
  } finally { await browser.close(); }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
