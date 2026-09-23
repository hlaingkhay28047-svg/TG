/* 6.124.0 — SELECTION SWAP & FILL: the owner's ask, one Smart Workflow card beside Selection Edit.
 *
 * The owner wrote "Selection ပေးထားတဲ့နေရာကို ကြိုက်တဲ့ပစ္စည်းနဲ့ လဲတာထည့်တာဖြည့်တာပြောင်းတာ အဲ့ဒီ Workflow အသစ်ကိုထပ်လုပ်ပေးပါ
 * ဒီထပ်ပိုကောင်းပိုစုံတဲ့အကြံရှိရင်လဲဖြည့်ပြီးလုပ်ပေးပါ" — in the selected area, REPLACE · ADD · FILL · CHANGE with whatever
 * object they want, as a new workflow, plus any better and more complete ideas. It is here as ONE record over the endpoint the
 * studio already routes region work to (nano-banana-2 on the panel, the wizard's own picker on the web; no new apiPath):
 *   selection-swap   a REGION record (the live rectangular selection in Photoshop, the drawn marquee on the web) with one
 *                    required photo and an OPTIONAL exact-item slot (IMAGE 2), five fields — a four-way MODE choice (a new
 *                    field type on both surfaces: the chosen option's own line lands on the MODE line), an OBJECT line with
 *                    eight quick picks, a SIZE & PLACEMENT line, MATCH and SHADOW switches with OFF lines.
 * What is pinned: the record (place, flag, inputs, the five fields and their nine-language labels, hints and quick picks, the
 * prompt's roles and rules, the AVOID list), the nine-language card line and the two four-step guides, the app's region flow
 * and the panel's registry following the record's region flag instead of one id, the choice field's maths on both surfaces
 * (byte-identical prompts for the same values), the wizard's chips and quick picks and the panel's, the card picture, the
 * counts 197 → 198 and 204 → 205 on every surface, the What's New row, the CI step and the lockstep pair of the day (6.124.0 / 6.195.0 when this wave shipped).
 * Usage: PORT=8931 node test/verify_selection_swap.js   (serve docs/app first) */
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
const PANEL_CAT = read("panel/js/hnk_wf_catalog_data.js"), PANEL_HOME = read("panel/src/ui/screens/home-screen.js");
const REGISTRY = read("panel/src/workflows/workflow-registry.js"), SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const PCSS = read("panel/styles.css"), LIFTER = read("tools/build_panel_wf_catalog.js");
const WN = read("docs/app/data/whatsnew.js"), PWN = read("panel/js/hnk_whats_new.js"), MAIN = read("panel/main.js");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.129.0", PVER = "6.200.0";
const ID = "selection-swap", TITLE = "Selection Swap & Fill";

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
const nine = (o) => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].trim().length > 1);

/* ===================== A) the record ===================== */
const A = require("../tools/lib/app-data.js");
const lib = A.readLibWf(), W = lib.workflows, byId = {}; W.forEach(w => { byId[w.id] = w; });
const at = (id) => W.findIndex(w => w.id === id);
const R = byId[ID];
const F = (k) => (R && R.fields || []).find(f => f.key === k);
report("A1) the record exists with the wave's title, right after Selection Edit and before the gear card, carries the region flag, one required photo and ONE optional exact-item slot (the wizard names it IMAGE 2)",
  !!R && R.title === TITLE && at(ID) === at("region-edit") + 1 && at("light-gear-remove") === at(ID) + 1 && R.region === true &&
  R.req.length === 1 && /Your Photo/.test(R.req[0]) && (R.opt || []).length === 1 && !/IMAGE 2/.test(R.opt[0]) && /optional/i.test(R.opt[0]) && /exact item/i.test(R.opt[0]) &&   /* the wizard prefixes "IMAGE 2 —" itself */
  typeof R.summary === "string" && /Replace · Add · Fill · Change/.test(R.summary) && /IMAGE 2/.test(R.summary) && typeof R.explanation === "string" && /REPLACE/.test(R.explanation) && /FILL/.test(R.explanation),
  R && { at: at(ID), re: at("region-edit"), lg: at("light-gear-remove"), region: R.region, req: R.req, opt: R.opt });
const mode = F("mode"), what = F("what"), size = F("size"), match = F("match"), shadow = F("shadow");
report("A2) five fields in order — mode (a CHOICE: tag MODE:, token {{MODE}}, default replace, four options replace · add · fill · change each with its own prompt line, a nine-language label and hint), what (text, OBJECT:, optional, 140 chars, eight quick picks with English values and nine-language labels, its own hint), size (text, SIZE & PLACEMENT:, optional, 120), match and shadow (switches ON by default with OFF lines)",
  !!R && R.fields.map(f => f.key).join(",") === "mode,what,size,match,shadow" &&
  mode.type === "choice" && mode.tag === "MODE:" && mode.token === "{{MODE}}" && mode.default === "replace" && nine(mode.label) &&
  mode.options.map(o => o.v).join(",") === "replace,add,fill,change" && mode.options.every(o => /^(REPLACE|ADD|FILL|CHANGE) — /.test(o.line) && o.line.toUpperCase().indexOf(o.v.toUpperCase()) === 0 && nine(o.label) && nine(o.hint)) &&
  what.type === "text" && what.tag === "OBJECT:" && what.token === "{{WHAT}}" && !what.required && what.max === 140 && typeof what.ph === "string" && what.ph.length > 5 && nine(what.label) && nine(what.hint) &&
  Array.isArray(what.chips) && what.chips.length === 8 && what.chips.every(c => /^a /.test(c.v) && /^[a-z0-9 ,'-]+$/i.test(c.v) && nine(c.label)) && new Set(what.chips.map(c => c.v)).size === 8 &&
  size.type === "text" && size.tag === "SIZE & PLACEMENT:" && size.token === "{{SIZE}}" && !size.required && size.max === 120 && nine(size.label) && nine(size.hint) &&
  match.type === "toggle" && match.tag === "MATCH:" && match.default === true && /^MATCH: the object's size, angle and place follow the SIZE & PLACEMENT line even when that is not true to life/.test(match.off) && nine(match.label) &&
  shadow.type === "toggle" && shadow.tag === "SHADOW:" && shadow.default === true && /^SHADOW: draw no new shadow or reflection for the object/.test(shadow.off) && nine(shadow.label),
  R && { keys: R.fields.map(f => f.key + ":" + f.type), chips: what && what.chips && what.chips.length });
report("A3) the prompt: the selected-area frame first, then the MODE · OBJECT · SIZE & PLACEMENT lines each holding its token once, THE NEW OBJECT rule (IMAGE 2 exact item, never returned; else the OBJECT line; neither → FILL), the MATCH and SHADOW lines the switches govern, PRESERVE, EDGE RULE and the same-photograph close; the AVOID list names the old object left behind, the object removed, IMAGE 2 returned, a missing contact shadow, a seam",
  !!R && /^You are editing the user's SELECTED AREA of a photograph \(the rectangle selected in Photoshop or drawn on the web; the whole photo when none was drawn\)\. Make ONLY the change the MODE line asks/.test(R.prompt) && R.prompt.length + 12 + R.negative.length + 148 + 138 + 60 <= 3000 &&   /* the longest MODE line, a 140-char OBJECT and a 120-char SIZE line still fit Qwen Image 3's 3,000 cap with the AVOID list */
  has(R.prompt, "\nMODE: {{MODE}}\nOBJECT: {{WHAT}}\nSIZE & PLACEMENT: {{SIZE}}\nTHE NEW OBJECT: when IMAGE 2 is given, it is the exact item shown in IMAGE 2") &&
  ["{{MODE}}", "{{WHAT}}", "{{SIZE}}"].every(t => R.prompt.split(t).length === 2) && has(R.prompt, "never IMAGE 2 returned as the result") && has(R.prompt, "With no IMAGE 2 and no OBJECT line, act as MODE FILL") &&
  /\nMATCH: draw the object at the photograph's camera height and viewing angle, in true perspective/.test(R.prompt) && /\nSHADOW: the object casts the shadow such an object would cast in this light/.test(R.prompt) &&
  /\nPRESERVE: everything inside the area that the MODE line does not name stays exactly as photographed/.test(R.prompt) && /\nEDGE RULE: keep the outermost few pixels/.test(R.prompt) && /only the requested change made\.$/.test(R.prompt) &&
  ["the old object left behind in REPLACE or FILL", "the object removed in ADD or CHANGE", "IMAGE 2 returned as the result", "a different item than IMAGE 2", "missing contact shadow", "object covering a face or a hand", "seam", "watermark"].every(t => has(R.negative, t)),
  R && { head: R.prompt.slice(0, 80) });
report("A4) the four mode lines say what each mode keeps and removes, and the prompt speaks of the crop and composition itself so the app's generic FRAME LOCK is never appended",
  !!R && /same spot and footprint/.test(mode.options[0].line) && /contact/.test(mode.options[0].line) && /rebuild whatever the old object hid/.test(mode.options[0].line) &&
  /keep everything already inside the selected area/.test(mode.options[1].line) && /never covering a face or a hand/.test(mode.options[1].line) &&
  /rebuild the area from its own surroundings/.test(mode.options[2].line) && /put nothing new in/.test(mode.options[2].line) &&
  /keep the object that occupies the selected area exactly where it is/.test(mode.options[3].line) && /kind, colour, material, pattern or style/.test(mode.options[3].line) &&
  /crop|aspect ratio|same pose|framing|composition/i.test(R.prompt), null);

/* ===================== B) the app's source ===================== */
report("B1) Repair & Enhance lists the card right after Selection Edit and before the gear card; the nine-language card line exists; the two four-step guides name IMAGE 1, the optional IMAGE 2, Start and GENERATE",
  has(APP, 'st(["region-edit","selection-swap","light-gear-remove","upscale",') &&
  (() => { const m = APP.match(new RegExp('      "' + ID + '":\\{([^\\n]*)\\},\\n')); return !!m && LANGS.every(l => new RegExp('(^|,)' + l + ':"').test(m[1])) && /Replace · Add · Fill · Change/.test(m[1]); })() &&
  (() => { const en = APP.match(/var WF_STEPS_EN = \{[\s\S]*?"selection-swap": \[\n([\s\S]*?)\n    \],/), my = APP.match(/var WF_STEPS = \{[\s\S]*?"selection-swap": \[\n([\s\S]*?)\n    \],/);
    const lines = (m) => m ? m[1].split("\n").filter(x => /^\s*"/.test(x)) : [];
    return lines(en).length === 4 && lines(my).length === 4 && /IMAGE 1/.test(lines(en)[0]) && /IMAGE 2/.test(lines(en)[1]) && /Start/.test(lines(en)[2]) && /GENERATE/.test(lines(en)[3]) && /IMAGE 1/.test(lines(my)[0]) && /IMAGE 2/.test(lines(my)[1]) && /GENERATE/.test(lines(my)[3]); })(), null);
report("B2) the web app's region flow follows the record's flag (the marquee on step 2 and the crop-and-paste-back run), applyWfFields resolves a choice (value → default → first option) onto the token, a text field may carry its own hint and quick picks, and the wizard draws the choice row as chips with the chosen option's hint",
  has(APP, 'var rgn=((w.id==="region-edit"||w.region) && wiz.region && state.refs[0] && state.refs[0].b64) ? wiz.region : null, rgnFull=null;') &&
  has(APP, 'if((w.id==="region-edit"||w.region) && state.refs[0] && state.refs[0].b64) body.appendChild(wizRegionPicker(state.refs[0]));') &&
  has(APP, '}else if(f.type==="choice"){\n        /* 6.124.0') && has(APP, 'if(f.token) p=p.split(f.token).join(pick ? (pick.line||pick.v) : "");') &&
  has(APP, 'function wizQuickChips(f, ti){') && has(APP, 'if(f.hint) frow.lastChild.textContent=L9(f.hint);') && has(APP, 'if(f.chips&&f.chips.length) frow.appendChild(wizQuickChips(f, ti));') &&
  has(APP, 'frow.className += " is-choice";') && has(APP, 'var cb=el("button","chip wiz-choice");') && has(APP, 'chint.textContent=(po&&po.hint) ? L9(po.hint) : "";') &&
  has(APP, '.wiz-field.is-choice{flex-direction:column;align-items:stretch;') && has(APP, '.wiz-choices{display:flex;flex-wrap:wrap;gap:6px}') && has(APP, '.wiz-quick-chip{min-height:32px;'), null);
const LANDING_CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
report("B3) the counts moved 197 → 198 Smart Workflows and 204 → 205 One-Tap on the app's meta and statline fallbacks, the landing (ASCII and Myanmar digits, the two counters) and the panel's Home; the data file holds 94 workflows",
  (APP.match(/Smart Workflow 198/g) || []).length === 3 && !has(APP, "Smart Workflow 197") && (APP.match(/One-Tap 205/g) || []).length === 3 && !has(APP, "One-Tap 204") &&
  has(APP, '<b id="stWfCount">198</b>') && has(APP, '<b id="stTapCount">205</b>') &&
  (LANDING.match(/Smart Workflow 198/g) || []).length >= 30 && !has(LANDING_CLAIMS, "Smart Workflow 197") && (LANDING.match(/One-Tap 205/g) || []).length >= 30 && !has(LANDING_CLAIMS, "One-Tap 204") &&
  /data-count="wf">198</.test(LANDING) && /data-count="tap">205</.test(LANDING) && has(LANDING, "၁၉၈") && !has(LANDING_CLAIMS, "၁၉၇") &&
  has(PANEL_HOME, 'stat(205, "One-Tap Workflows");') && W.filter(x => !x.kind).length === 94,
  { app198: (APP.match(/Smart Workflow 198/g) || []).length, landing198: (LANDING.match(/Smart Workflow 198/g) || []).length, wf: W.filter(x => !x.kind).length });
const artGaps = [];
(() => {
  const p = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
  if (!fs.existsSync(p)) { artGaps.push("missing"); return; }
  const sz = jpegSize(fs.readFileSync(p)); if (!sz || sz.w !== 960 || sz.h !== 640) artGaps.push(JSON.stringify(sz));
  if (fs.statSync(p).size < 40000) artGaps.push("too small to be a photograph");
  if (new RegExp('NO_CARD_JPG=\\[[^\\]]*"' + ID + '"').test(APP)) artGaps.push("on the no-picture list");
})();
report("B4) the card picture exists at the pack's 960x640, is a photograph, and is not on the no-picture list", artGaps.length === 0, artGaps);
const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
/* 6.125.0 — the lockstep pair moves on with every release, so the wave's own row is found by
   the version it shipped under, not by today's VER */
const WAVE_V = "6.124.0";
const row = rows.find(r => r.v === WAVE_V);
report("B5) the What's New strip carries the 6.124.0 row — kind wf, opening this card — a plain title and a bold-led excerpt in all nine languages, both naming the card, the excerpt naming the four modes; the panel's lifted table carries it (it led the strip when this wave shipped; the 6.125.0 row sits above it now)",
  !!row && rows.indexOf(row) <= 6 &&   /* 6.129.0 — one more release above it */ row.kind === "wf" && row.ref === ID && LANGS.every(l => row.t[l] && row.s && row.s[l] && !row.t[l].startsWith("**") && row.s[l].startsWith("**") &&
    /Selection Swap & Fill/.test(row.t[l]) && /Replace · Add · Fill · Change/.test(row.s[l]) && /IMAGE 2/.test(row.s[l])) &&
  has(PWN, '"v":"' + WAVE_V + '"') && has(PWN, '"ref":"' + ID + '"'), row && { v: row.v, kind: row.kind, ref: row.ref, at: rows.indexOf(row) });
report("B6) CI runs this test right after the wave H check, the suite counts 271 invocations and the landing says 271 tests (266 until 6.125.0 added verify_album_wave_i, 267 until 6.127.0 added verify_skin_age_guard, 268 until 6.127.1 added verify_panel_v2_layer, 269 until 6.128.0 added verify_gen_loading_billing, 270 until 6.129.0 added verify_scene_frame_6129)",
  /run: PORT=8931 node test\/verify_prop_wave_h\.js\n(?:\s*#[^\n]*\n)*\s*- name: [^\n]*\n\s*run: PORT=8931 node test\/verify_selection_swap\.js/.test(CI) &&
  (CI.match(/node test\//g) || []).length === 271 && has(LANDING, "271 tests") && !has(LANDING, "265 tests") && /data-count="tests">271</.test(LANDING), { steps: (CI.match(/node test\//g) || []).length });

/* ===================== C) the panel ===================== */
report("C1) the lifter carries the record's region flag into the panel's catalog, the registry's region flag reads the id OR the flag, its applyFields resolves a choice the way the app does, the screen draws the choice row (chips, hint) and the quick picks, and the new CSS uses margins, never gap",
  has(LIFTER, "region: w.region ? true : undefined") && has(REGISTRY, 'region: w.id === "region-edit" || !!w.region,') &&
  has(REGISTRY, '} else if (f.type === "choice") {') && has(REGISTRY, 'if (f.token) p = p.split(f.token).join(pick ? (pick.line || pick.v) : "");') &&
  has(SCREEN, 'if (f.type === "choice") row.className += " is-choice";') && has(SCREEN, 'var crow = dom.el(doc, "div", { class: "hnk-wf-choices", id: "hnkWfChoice_" + f.key });') &&
  has(SCREEN, 'var quickChips = function (f, ti) {') && has(SCREEN, 'if (f.hint) { try { row.lastChild.textContent = fl(f.hint); } catch (eH) { } }') && has(SCREEN, 'if (f.chips && f.chips.length) row.appendChild(quickChips(f, ti));') &&
  has(PCSS, ".hnk-wf-field.is-choice { flex-direction: column; align-items: stretch;") && has(PCSS, ".hnk-wf-choices > button { margin-right: 6px; margin-bottom: 6px; }") && has(PCSS, ".hnk-wf-choice.on {") &&
  !/gap\s*:/.test(PCSS.slice(PCSS.indexOf("/* 6.124.0 — choice chips"), PCSS.indexOf("/* 6.124.0 — choice chips") + 1200)), null);
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items));
const it = items.find(x => x.id === ID), rpCat = cat.categories.find(c => c.category === "Repair & Enhance");
const pGaps = [];
if (!it) pGaps.push("missing on the panel");
else {
  if (it.prompt.indexOf(R.prompt) !== 0) pGaps.push("prompt differs");
  if (it.negative.indexOf(R.negative) !== 0) pGaps.push("negative differs");
  if (JSON.stringify(it.req) !== JSON.stringify(R.req) || JSON.stringify(it.opt) !== JSON.stringify(R.opt)) pGaps.push("inputs differ");
  if (JSON.stringify((it.fields || []).filter(f => f.key !== "skintone")) !== JSON.stringify(R.fields)) pGaps.push("fields differ");
  if (it.region !== true) pGaps.push("no region flag");
  LANGS.forEach(l => { const s = cat.i18n && cat.i18n[l] && cat.i18n[l].sum && cat.i18n[l].sum[ID]; if (!s || s.length < 10) pGaps.push("no " + l + " summary"); });
}
const rpIds = rpCat ? rpCat.items.map(x => x.id) : [];
report("C2) the panel's lifted catalog carries the record with the app's prompt, AVOID list, inputs, fields and region flag, nine card lines, 198 cards in all, under Repair & Enhance right after Selection Edit; it is the only item wearing the flag (Selection Edit keeps its id rule)",
  pGaps.length === 0 && cat.total === 198 && items.length === 198 && rpIds.indexOf(ID) === rpIds.indexOf("region-edit") + 1 && items.filter(x => x.region).length === 1, { pGaps, total: cat.total, rp: rpIds.slice(0, 3) });
const REG = require("../panel/src/workflows/workflow-registry.js");
const wf = REG.get(ID);
const VALS = {
  def: undefined,
  fill: { mode: "fill", what: "the cable on the floor" },
  add: { mode: "add", what: "  a bouquet of   white roses ", size: "small, on the left", match: false, shadow: false },
  bogus: { mode: "no-such-mode", what: "" },
  change: { mode: "change", what: "the same chair in white leather", size: "", match: true, shadow: true }
};
const C = {}; Object.keys(VALS).forEach(k => { const c = REG.compile(ID, VALS[k]); C[k] = c && c.prompt; });
/* the 3,000-character cap of Qwen Image 3 / 3 Pro: the longest MODE line, a 140-char OBJECT and a 120-char SIZE line, with the AVOID list the run appends */
const WORST = REG.compile(ID, { mode: "change", what: "x".repeat(140), size: "y".repeat(120) }).prompt.length + 12 + R.negative.length;
report("C3) the registry: the record is a region workflow with one optional input; the compiler resolves the fields — default → the REPLACE line, no OBJECT or SIZE line, the MATCH and SHADOW lines, no raw token; fill + an object → the FILL line and 'OBJECT: the cable on the floor'; add + a padded object + a place + both switches off → the ADD line, whitespace collapsed, the SIZE line, both OFF lines; an unknown mode falls back to REPLACE; change → the CHANGE line; the worst case with the AVOID list fits the 3,000-character cap",
  !!wf && wf.region === true && REG.get("region-edit").region === true && wf.optionalInputs.length === 1 && wf.requiredInputs.length === 1 && wf.fields.length === 5 &&
  /\nMODE: REPLACE — remove what occupies the selected area/.test(C.def) && !/\nOBJECT:/.test(C.def) && !/\nSIZE & PLACEMENT:/.test(C.def) && /\nMATCH: draw the object at the photograph's camera height/.test(C.def) && /\nSHADOW: the object casts the shadow/.test(C.def) && !/\{\{/.test(C.def) &&
  /\nMODE: FILL — remove what occupies the selected area/.test(C.fill) && /\nOBJECT: the cable on the floor\n/.test(C.fill) &&
  /\nMODE: ADD — keep everything already inside the selected area/.test(C.add) && /\nOBJECT: a bouquet of white roses\n/.test(C.add) && /\nSIZE & PLACEMENT: small, on the left\n/.test(C.add) &&
  /\nMATCH: the object's size, angle and place follow the SIZE & PLACEMENT line/.test(C.add) && !/MATCH: draw the object/.test(C.add) && /\nSHADOW: draw no new shadow or reflection/.test(C.add) && !/SHADOW: the object casts/.test(C.add) &&
  /\nMODE: REPLACE — /.test(C.bogus) && !/\nOBJECT:/.test(C.bogus) && /\nMODE: CHANGE — keep the object that occupies the selected area exactly where it is/.test(C.change) && /\nOBJECT: the same chair in white leather\n/.test(C.change) && !/\nSIZE & PLACEMENT:/.test(C.change) && WORST <= 3000,
  { def: C.def && (C.def.match(/MODE:[^\n]*/) || [])[0], add: C.add && (C.add.match(/OBJECT:[^\n]*/) || [])[0], worst: WORST });

/* ===================== D) the app, booted ===================== */
async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  const r = await page.evaluate(async (args) => {
    const [id, vals] = args;
    const out = {};
    const cats = window.HNK_WF_CATALOG || [];
    const all = [].concat.apply([], cats.map(c => c.items));
    out.total = all.length;
    const rp = cats.find(c => c.t === "Repair & Enhance");
    out.rpOrder = rp ? rp.items.map(w => w.id).slice(0, 3) : [];
    const rec = all.find(w => w.id === id);
    out.region = rec && rec.region; out.cardImg = window._wfCardImgById(id); out.title = window._wfTitleById(id);
    out.prompts = {}; Object.keys(vals).forEach(k => { out.prompts[k] = window._wfFieldPrompt(id, vals[k] === null ? null : vals[k]); });
    out.batch = window._wfBatchPrompt(id);
    out.tap = document.getElementById("stTapCount") && document.getElementById("stTapCount").textContent;
    out.wfc = document.getElementById("stWfCount") && document.getElementById("stWfCount").textContent;
    /* the wizard: step 1 shows the card picture; step 2 draws the two slots and, with IMAGE 1 loaded, the marquee picker */
    const c = document.createElement("canvas"); c.width = 600; c.height = 400; const x = c.getContext("2d"); x.fillStyle = "#3a5a8a"; x.fillRect(0, 0, 600, 400); x.fillStyle = "#c98a5b"; x.fillRect(380, 220, 140, 150);
    const u = c.toDataURL("image/jpeg", 0.9); state.refs[0] = { mime: "image/jpeg", b64: u.slice(u.indexOf(",") + 1), label: "t" }; renderRefs();
    window._openWizardById(id); await new Promise(r => setTimeout(r, 300));
    out.wizOpen = /\bon\b/.test(document.getElementById("wiz").className);
    out.wizImg = !!document.querySelector("#wiz img.wiz-visual") && /cards5\/selection-swap\.jpg/.test(document.querySelector("#wiz img.wiz-visual").getAttribute("src") || "");
    let nav = document.querySelectorAll(".wiz.on .wiz-nav .btn"); nav[nav.length - 1].click(); await new Promise(r => setTimeout(r, 300));
    out.slots = [...document.querySelectorAll("#wiz .wslot .nm")].map(n => n.textContent);
    out.picker = !!document.getElementById("wizRegion") && !!document.getElementById("wizRegionBox");
    nav = document.querySelectorAll(".wiz.on .wiz-nav .btn"); nav[nav.length - 1].click(); await new Promise(r => setTimeout(r, 300));
    /* step 3: the five fields */
    const rows = [...document.querySelectorAll("#wiz .wiz-fields .wiz-field")];
    out.rows = rows.map(el => el.className);
    const choice = document.querySelector("#wiz .wiz-field.is-choice");
    const chips = choice ? [...choice.querySelectorAll(".wiz-choice")] : [];
    out.chips = chips.map(b => b.textContent + (/\bon\b/.test(b.className) ? "*" : ""));
    out.hint0 = choice && choice.querySelector(".wiz-text-hint") && choice.querySelector(".wiz-text-hint").textContent;
    const fillChip = chips.find(b => b.getAttribute("data-v") === "fill"); if (fillChip) fillChip.click(); await new Promise(r => setTimeout(r, 60));
    out.chipsAfter = chips.map(b => b.getAttribute("data-v") + (/\bon\b/.test(b.className) ? "*" : ""));
    out.hint1 = choice && choice.querySelector(".wiz-text-hint") && choice.querySelector(".wiz-text-hint").textContent;
    const texts = [...document.querySelectorAll("#wiz .wiz-field.is-text")];
    const whatRow = texts[0], ta = whatRow && whatRow.querySelector("textarea");
    out.whatHint = whatRow && whatRow.querySelector(".wiz-text-hint") && whatRow.querySelector(".wiz-text-hint").textContent;
    const quick = whatRow ? [...whatRow.querySelectorAll(".wiz-quick .wiz-quick-chip")] : [];
    out.quickN = quick.length; out.quick0 = quick[0] && quick[0].textContent;
    if (quick[1]) quick[1].click(); await new Promise(r => setTimeout(r, 60));
    out.taValue = ta && ta.value; out.taMax = ta && ta.maxLength;
    out.sizeHint = texts[1] && texts[1].querySelector(".wiz-text-hint") && texts[1].querySelector(".wiz-text-hint").textContent;
    out.toggles = document.querySelectorAll("#wiz .wiz-field-toggle input[type=checkbox]").length;
    out.togglesOn = [...document.querySelectorAll("#wiz .wiz-field-toggle input[type=checkbox]")].every(i => i.checked);
    /* the run would compile fill + the quick pick: applyWfFields over the wizard's own values */
    out.livePrompt = window._wfFieldPrompt(id, { mode: "fill", what: ta && ta.value });
    return out;
  }, [ID, Object.assign({}, VALS, { def: null })]);
  await ctx.close();
  return { r, errs };
}
/* ===================== the panel, booted ===================== */
async function panelWalk(browser) {
  const server = http.createServer((req, res) => { const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html"; const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" }); res.end(fs.readFileSync(abs)); });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); const port = server.address().port;
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  let out = null;
  try {
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } }, null, { timeout: 30000 }).catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } }); await page.waitForTimeout(1200);
    out = await page.evaluate(async (id) => {
      const o = {};
      HNK.aiToolsApp.workflowScreen().select(id); await new Promise(r => setTimeout(r, 700));
      const root = document.getElementById("hnkAiToolsRoot");
      o.selCard = !!document.getElementById("hnkWfSelCard");
      o.optSlot = !!document.getElementById("hnkWfAdd_opt1") || !!document.getElementById("hnkWfFile_opt1");
      const choice = root.querySelector(".hnk-wf-field.is-choice"), crow = document.getElementById("hnkWfChoice_mode");
      const chips = crow ? [...crow.children] : [];
      o.chips = chips.map(b => b.getAttribute("data-v") + (/\bon\b/.test(b.className) ? "*" : ""));
      o.chipText = chips.map(b => b.textContent);
      o.hint0 = (document.getElementById("hnkWfChoiceHint_mode") || {}).textContent;
      o.column = choice && getComputedStyle(choice).flexDirection;
      const fill = chips.find(b => b.getAttribute("data-v") === "fill"); if (fill) fill.click(); await new Promise(r => setTimeout(r, 80));
      o.chipsAfter = chips.map(b => b.getAttribute("data-v") + (/\bon\b/.test(b.className) ? "*" : ""));
      o.hint1 = (document.getElementById("hnkWfChoiceHint_mode") || {}).textContent;
      const ta = document.getElementById("hnkWfText_what");
      o.whatHint = (document.getElementById("hnkWfTextHint_what") || {}).textContent;
      const quick = ta ? [...ta.closest(".hnk-wf-field").querySelectorAll(".hnk-wf-quick .hnk-wf-quick-chip")] : [];
      o.quickN = quick.length; if (quick[1]) quick[1].click(); await new Promise(r => setTimeout(r, 60));
      o.taValue = ta && ta.value; o.taMax = ta && ta.getAttribute("maxlength");
      o.switches = root.querySelectorAll(".hnk-wf-sw").length; o.switchesOn = root.querySelectorAll(".hnk-wf-sw.on").length;
      /* the compiler reads the state the chips wrote */
      const st = HNK.aiToolsApp.workflowScreen().getState();
      o.fieldVals = st && st.fieldVals;
      const compiled = HNK.workflowRegistry.compile(id, st && st.fieldVals);
      o.mode = compiled && (compiled.prompt.match(/\nMODE:[^\n]*/) || [""])[0].slice(0, 30); o.object = compiled && (compiled.prompt.match(/\nOBJECT:[^\n]*/) || [""])[0];
      document.getElementById("hnkWfBack").click(); await new Promise(r => setTimeout(r, 200));
      return o;
    }, ID);
  } finally { await page.close(); server.close(); }
  return { out, errs };
}
async function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json")), pv = JSON.parse(read("docs/download/panel-version.json"));
  report(`E1) ${VER} / panel ${PVER} in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest (+ artifact file, a 64-hex sha and a real size), panel-version.json, the download footer, the landing's badges`,
    has(APP, `var APP_VER="${VER}";`) && has(read("docs/app/version.json"), `"v":"${VER}"`) && has(read("docs/app/sw.js"), `var CACHE = "hnk-web-studio-v${VER.replace(/\./g, "-")}";`) &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) && has(MAIN, `const PANEL_VERSION = "${PVER}";`) && has(read("panel/manifest.json"), `"version": "${PVER}"`) &&
    manifest.version === PVER && manifest.artifact_file === `HNK_Ai_Panel_v${PVER}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === PVER && pv.latest_version === PVER && has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`) &&
    has(LANDING, VER) && has(LANDING, PVER) && !has(LANDING_CLAIMS, "6.123.1") && !has(LANDING_CLAIMS, "6.194.1"), { manifest: manifest.version, pv: pv.v });
}
(async () => {
  const browser = withPremium(await chromium.launch());
  try {
    const { r, errs } = await appWalk(browser);
    report("D1) the booted app composes 198 cards, Selection Edit → Selection Swap & Fill → Remove Light Stands & Gear under Repair & Enhance, the record wears its flag and card picture, and the statline says 198 / 205",
      r.total === 198 && JSON.stringify(r.rpOrder) === JSON.stringify(["region-edit", ID, "light-gear-remove"]) && r.region === true && r.cardImg === "lib/wf/cards5/" + ID + ".jpg" && r.title === TITLE && r.wfc === "198" && r.tap === "205", r && { total: r.total, rp: r.rpOrder, wfc: r.wfc, tap: r.tap });
    report("D2) the app's field maths equals the panel's compiler byte for byte on the same five value sets, the batch prompt carries AVOID, no FRAME LOCK and no raw token",
      Object.keys(VALS).every(k => r.prompts[k] === C[k]) && /\n\nAVOID: /.test(r.batch) && !/FRAME LOCK/.test(r.batch) && !/\{\{/.test(r.batch) && r.batch.indexOf(C.def) === 0,
      { same: Object.keys(VALS).map(k => k + ":" + (r.prompts[k] === C[k])) });
    report("D3) the wizard opens on the card with its picture; Start draws the two slots — IMAGE 1 the photo, IMAGE 2 the optional object — and the marquee picker under them (the flag, not the id); step 3 draws five rows: the choice row as four chips with Replace lit and its hint, a tap on Fill moves the light and the hint, the OBJECT line with its own hint and eight quick picks (a tap fills the line, 140 chars), the SIZE line with its hint, two switches ON",
      r.wizOpen && r.wizImg && r.slots.length === 2 && /IMAGE 1/.test(r.slots[0]) && /IMAGE 2/.test(r.slots[1]) && /Object/i.test(r.slots[1]) && r.picker &&
      r.rows.length === 5 && /is-choice/.test(r.rows[0]) && /is-text/.test(r.rows[1]) && /is-text/.test(r.rows[2]) && /wiz-field-toggle/.test(r.rows[3]) && /wiz-field-toggle/.test(r.rows[4]) &&
      JSON.stringify(r.chips) === JSON.stringify(["Replace*", "Add", "Fill (remove)", "Change"]) && r.hint0 === mode.options[0].hint.en &&
      JSON.stringify(r.chipsAfter) === JSON.stringify(["replace", "add", "fill*", "change"]) && r.hint1 === mode.options[2].hint.en &&
      r.whatHint === what.hint.en && r.quickN === 8 && r.quick0 === what.chips[0].label.en && r.taValue === what.chips[1].v && r.taMax === 140 && r.sizeHint === size.hint.en &&
      r.toggles === 2 && r.togglesOn && /\nMODE: FILL — /.test(r.livePrompt) && has(r.livePrompt, "\nOBJECT: " + what.chips[1].v + "\n"), r && { wizOpen: r.wizOpen, wizImg: r.wizImg, picker: r.picker, slots: r.slots, rows: r.rows, chips: r.chips, hint0: r.hint0 === mode.options[0].hint.en, after: r.chipsAfter, hint1: r.hint1 === mode.options[2].hint.en, whatHint: r.whatHint === what.hint.en, quick: r.quickN, quick0: r.quick0, ta: r.taValue, taMax: r.taMax, sizeHint: r.sizeHint === size.hint.en, toggles: r.toggles, on: r.togglesOn, live: r.livePrompt && r.livePrompt.slice(0, 40) });
    report("D4) no page error in the web app while all of that ran", errs.length === 0, errs);
    const p = await panelWalk(browser);
    const o = p.out || {};
    report("D5) the panel's workflow page: the Selection card stands where the required photo would (the flag), the optional IMAGE 2 slot has its source buttons, the choice row is a column of four chips (Burmese labels — the panel's own language) with Replace lit and its hint, a tap on Fill moves the light and the hint and the compiler's MODE line, the OBJECT line carries its own hint and eight quick picks (a tap fills the line and the OBJECT line, 140 chars), two switches ON",
      !!p.out && o.selCard && o.optSlot && JSON.stringify(o.chips) === JSON.stringify(["replace*", "add", "fill", "change"]) && JSON.stringify(o.chipText) === JSON.stringify(mode.options.map(x => x.label.my)) &&   /* the panel boots in Burmese */
      o.hint0 === mode.options[0].hint.my && o.column === "column" && JSON.stringify(o.chipsAfter) === JSON.stringify(["replace", "add", "fill*", "change"]) && o.hint1 === mode.options[2].hint.my &&
      o.whatHint === what.hint.my && o.quickN === 8 && o.taValue === what.chips[1].v && o.taMax === "140" && o.switches === 2 && o.switchesOn === 2 &&
      o.fieldVals && o.fieldVals.mode === "fill" && o.fieldVals.what === what.chips[1].v && /^\nMODE: FILL — /.test(o.mode) && o.object === "\nOBJECT: " + what.chips[1].v,
      Object.assign({ errs: p.errs }, o));
    report("D6) no page error in the panel while all of that ran", p.errs.length === 0, p.errs);
    await releasePins();
  } catch (e) { report("X) the walk ran", false, String(e && e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
