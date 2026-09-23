/* 6.123.0 — WAVE H: the owner's video, three Smart Workflow cards.
 *
 * The owner sent an eight-minute screen recording of another studio's Photoshop panel and wrote
 * "ဒီvideo ထဲက ထိုင်ခုံထည့်တဲ့ဟာကို smart workflow အနေနဲ့ လုပ်ပေးပါအသစ် အဲ့အပြင် တစ်ခြားဟာတေွလဲ အသုံးဝင်ရင် ထပ်ထည့်ပေးပါ":
 * make the "add a chair" step a new Smart Workflow, and add whatever else in the video is useful. Frame by frame the
 * video showed three things worth having: (1) a product photograph of a side table / pedestal set into a portrait in
 * place of the plain box the subject leaned on, hand contact kept; (2) a "Change Decoration Theme Color" preset with a
 * typed variable ("White & Gold") that recoloured a red-and-gold wedding stage; (3) "Remove Lightstand" presets. They
 * are here as three cards over the endpoints the studio already ships — no new apiPath anywhere:
 *   prop-insert         two inputs, a replace/add switch (SWAP RULE, with an OFF line) and an optional PLACEMENT line
 *   decor-theme-color   one input, a REQUIRED theme text (default "White & Gold") filling {{THEME}}
 *   light-gear-remove   one input, one tap
 * What is pinned: the three records (inputs, fields, the prompt's roles and rules, the AVOID lists, their places in the
 * catalog), the nine-language card lines, the four-step guides in English and Myanmar, the card pictures (960x640, one
 * real pass of each card's own prompt on the brand model), the counts moving 194 → 197 and 201 → 204 on the app, the
 * landing (ASCII and Myanmar digits) and the panel's Home, the What's New row, the CI step and the landing's test count,
 * the wizard's field maths on the app (the same function the wizard runs) and the panel's lifted catalog + compiler
 * producing the same prompt, and the 6.123.0 / 6.194.0 lockstep.
 * Usage: PORT=8931 node test/verify_prop_wave_h.js   (serve docs/app first) */
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
const PANEL_CAT = read("panel/js/hnk_wf_catalog_data.js"), PANEL_HOME = read("panel/src/ui/screens/home-screen.js");
const WN = read("docs/app/data/whatsnew.js"), PWN = read("panel/js/hnk_whats_new.js"), MAIN = read("panel/main.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.128.0", PVER = "6.199.0";   /* the wave shipped as 6.123.0 / 6.194.0; every release since (6.123.1, 6.124.0, 6.125.0) moves the pair on, and the strip leads with the newest row */
const IDS = ["prop-insert", "decor-theme-color", "light-gear-remove"];

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

/* ===================== A) the records ===================== */
const A = require("../tools/lib/app-data.js");
const lib = A.readLibWf(), W = lib.workflows, byId = {}; W.forEach(w => { byId[w.id] = w; });
const at = (id) => W.findIndex(w => w.id === id);
const PI = byId["prop-insert"], DT = byId["decor-theme-color"], LG = byId["light-gear-remove"];
report("A1) the three records exist, with the wave's titles, right after Reference Scenes (the two scene cards) and right after Selection Edit (the clean-up card)",
  !!PI && !!DT && !!LG && PI.title === "Furniture & Prop Insert" && DT.title === "Decor Theme Colour" && LG.title === "Remove Light Stands & Gear" &&
  at("prop-insert") === at("reference-scenes") + 1 && at("decor-theme-color") === at("prop-insert") + 1 && at("light-gear-remove") === at("region-edit") + 2 &&   /* 6.124.0 — Selection Swap & Fill sits between Selection Edit and the gear card */
  IDS.every(id => typeof byId[id].visual === "string" && fs.existsSync(path.join(ROOT, "docs", "app", "lib", "ui", byId[id].visual))),
  { pi: at("prop-insert"), rs: at("reference-scenes"), dt: at("decor-theme-color"), lg: at("light-gear-remove"), re: at("region-edit") });
report("A2) Furniture & Prop Insert takes two required inputs — the subject as IMAGE 1, the furniture photo as IMAGE 2 — and two fields: the SWAP RULE switch (ON by default, with an OFF line that adds beside the subject) and the optional PLACEMENT text filling {{WHERE}}",
  !!PI && PI.req.length === 2 && /IMAGE 1/.test(PI.req[0]) && /Furniture.*IMAGE 2/.test(PI.req[1]) && (PI.opt || []).length === 0 &&
  PI.fields.length === 2 && PI.fields[0].key === "replace" && PI.fields[0].type === "toggle" && PI.fields[0].tag === "SWAP RULE:" && PI.fields[0].default === true &&
  /^SWAP RULE: remove nothing from IMAGE 1 — add the IMAGE 2 piece as a new prop beside the subject/.test(PI.fields[0].off) &&
  PI.fields[1].key === "where" && PI.fields[1].type === "text" && PI.fields[1].tag === "PLACEMENT:" && PI.fields[1].token === "{{WHERE}}" && !PI.fields[1].required && PI.fields[1].max === 120 &&
  PI.fields.every(f => LANGS.every(l => f.label[l] && f.label[l].length > 2)), PI && { req: PI.req, fields: PI.fields.map(f => f.key) });
report("A3) its prompt names the input roles (IMAGE 1 the only edit target and only person; IMAGE 2 a product reference only, never returned), the swap rule keeps the hand contact, the fit rule asks for perspective, scale, ground contact and a contact shadow, and the AVOID list names the ways this goes wrong",
  !!PI && /^Place the exact piece of furniture shown in IMAGE 2 into the photograph in IMAGE 1/.test(PI.prompt) && /INPUT ROLES:\n- IMAGE 1 is the ONLY edit target and the ONLY person in the result\./.test(PI.prompt) &&
  /- IMAGE 2 is a PRODUCT REFERENCE ONLY/.test(PI.prompt) && /Never return IMAGE 2 itself\./.test(PI.prompt) && /\nSWAP RULE: if IMAGE 1 already holds a plain stand, box, table, stool or chair/.test(PI.prompt) &&
  /the hand, arm or body contact is\s+kept/.test(PI.prompt) && /\nPLACEMENT: \{\{WHERE\}\}\n/.test(PI.prompt) && /\nFIT: draw the piece at IMAGE 1's camera height and viewing angle, in true perspective/.test(PI.prompt) &&
  /a real contact shadow/.test(PI.prompt) && /RESULT: the same photograph as IMAGE 1 with one change only — the furniture\./.test(PI.prompt) &&
  ["IMAGE 2's background", "IMAGE 2 returned as the result", "a different chair or table than IMAGE 2", "floating furniture", "missing contact shadow", "hand floating above the surface", "furniture covering the face"].every(t => has(PI.negative, t)),
  PI && { head: PI.prompt.slice(0, 100) });
report("A4) Decor Theme Colour takes one input and one REQUIRED text field — the theme, default \"White & Gold\", filling {{THEME}} on the THEME line — and its prompt says what changes (drapes, flowers, ribbons, balloons, cloths, panels, props) and what never changes (every person, outfit, pose, the frame, lettering)",
  !!DT && DT.req.length === 1 && /IMAGE 1/.test(DT.req[0]) && (DT.opt || []).length === 0 && DT.fields.length === 1 && DT.fields[0].key === "theme" && DT.fields[0].type === "text" &&
  DT.fields[0].required === true && DT.fields[0].default === "White & Gold" && DT.fields[0].tag === "THEME:" && DT.fields[0].token === "{{THEME}}" && DT.fields[0].max === 60 &&
  /^Recolour the DECORATION of the event set in IMAGE 1 into one new colour theme\.\nTHEME: \{\{THEME\}\} — read these words as the palette of the whole set\./.test(DT.prompt) &&
  /WHAT CHANGES — every decorative element of the venue or studio set: backdrop drapes and curtains, stage panels and arches, flower/.test(DT.prompt) &&
  /Metallic ornaments \(gold, silver, brass\) keep their metal unless the theme names a different metal\./.test(DT.prompt) &&
  /WHAT NEVER CHANGES: every person — face, skin, hair, hands, pose, expression, outfit, jewellery and accessories keep their exact colours/.test(DT.prompt) &&
  /any sign, banner or printed text keeps its letters exactly/.test(DT.prompt) && ["colour bleeding onto skin", "colour bleeding onto clothes", "rewritten text", "changed outfit colour", "a person removed or added"].every(t => has(DT.negative, t)),
  DT && { fields: DT.fields });
report("A5) Remove Light Stands & Gear takes one input and no fields; its prompt lists the gear that goes (softboxes, stands, C-stands, tripods, reflectors, cables, sandbags, clamps, backdrop clips), says the LIGHT stays, and asks for a seamless rebuild; the AVOID list names gear left in frame, flattened light and a smeared backdrop",
  !!LG && LG.req.length === 1 && (LG.opt || []).length === 0 && LG.fields.length === 0 &&
  /^Remove every piece of photography equipment visible in IMAGE 1 and rebuild what stood behind it/.test(LG.prompt) &&
  ["softboxes", "light stands\nand C-stands", "tripods", "reflectors", "sandbags, clamps, cables", "backdrop stands and clips"].every(t => has(LG.prompt.replace(/\n/g, "\n"), t.replace("\n", " ")) || has(LG.prompt, t)) &&
  /WHAT STAYS: the light itself\./.test(LG.prompt) && /remove the equipment, never its effect/.test(LG.prompt) && /REBUILD: where equipment is removed, continue the backdrop, wall, floor, drapes or scenery/.test(LG.prompt) &&
  ["softbox left in frame", "light stand left in frame", "tripod left in frame", "flattened light", "removed catchlights", "smeared backdrop"].every(t => has(LG.negative, t)), LG && { head: LG.prompt.slice(0, 90) });
report("A6) every prompt speaks of the crop / composition itself, so the app's generic FRAME LOCK is never appended, and none carries a raw token outside its own field line",
  IDS.every(id => /crop|aspect ratio|same pose|framing|composition/i.test(byId[id].prompt)) &&
  PI.prompt.split("{{WHERE}}").length === 2 && DT.prompt.split("{{THEME}}").length === 2 && !/\{\{/.test(LG.prompt), null);

/* ===================== B) the app's source ===================== */
report("B1) Background & Scene lists the prop and decor cards right after Reference Scenes and before Couple Compose; Repair & Enhance lists the gear card right after Selection Edit",
  has(APP, '"scene-fit-pro","studio-look-copy","reference-scenes","prop-insert","decor-theme-color","couple-compose",') && has(APP, 'st(["region-edit","selection-swap","light-gear-remove","upscale",'), null);   /* 6.124.0 — Selection Swap & Fill joined the row */
const sumGaps = [];
IDS.forEach(id => {
  const m = APP.match(new RegExp('      "' + id + '":\\{([^\\n]*)\\},\\n'));
  if (!m) { sumGaps.push(id + " row missing"); return; }
  LANGS.forEach(l => { if (!new RegExp('(^|,)' + l + ':"').test(m[1])) sumGaps.push(id + "." + l); });
  if (id === "prop-insert" && !(/IMAGE 2/.test(m[1]) && /IMAGE 1/.test(m[1]))) sumGaps.push("prop row never names IMAGE 1 and IMAGE 2");
});
report("B2) the nine-language card lines exist for all three (the prop line names IMAGE 1 and IMAGE 2)", sumGaps.length === 0, sumGaps);
const stepGaps = [];
[["WF_STEPS_EN", "var WF_STEPS_EN = {"], ["WF_STEPS", "var WF_STEPS = {"]].forEach(([map, hdr]) => {
  const start = APP.indexOf(hdr);
  IDS.forEach(id => {
    const re = new RegExp('    "' + id + '": \\[\\n((?:      "[^\\n]*",?\\n)+)    \\]', "g"); re.lastIndex = start;
    const m = re.exec(APP);
    if (!m || m.index < start) { stepGaps.push(map + "." + id + " missing"); return; }
    const n = (m[1].match(/\n/g) || []).length;
    if (n !== 4) stepGaps.push(map + "." + id + " has " + n + " steps");
    if (!/IMAGE 1/.test(m[1])) stepGaps.push(map + "." + id + " never names IMAGE 1");
    if (!/GENERATE/.test(m[1])) stepGaps.push(map + "." + id + " never says GENERATE");
    if (id === "prop-insert" && !/IMAGE 2/.test(m[1])) stepGaps.push(map + "." + id + " never names IMAGE 2");
  });
});
report("B3) four guide steps per card in English and in Myanmar — each names IMAGE 1 and ends on GENERATE, the prop guide names IMAGE 2 and the switch", stepGaps.length === 0 && /switch ON to replace/.test(APP) && /switch ON ထားပါ/.test(APP), stepGaps);
const LANDING_CLAIMS = LANDING.replace(/<!--[\s\S]*?-->/g, "");
report("B4) the counts moved 194 → 197 → 198 Smart Workflows and 201 → 204 → 205 One-Tap (6.124.0 added Selection Swap & Fill) on the app's meta and statline fallbacks, the landing (ASCII and Myanmar digits, the two counters) and the panel's Home — and the old numbers are gone",
  (APP.match(/Smart Workflow 198/g) || []).length === 3 && !has(APP, "Smart Workflow 194") && (APP.match(/One-Tap 205/g) || []).length === 3 && !has(APP, "One-Tap 201") &&
  has(APP, '<b id="stWfCount">198</b>') && has(APP, '<b id="stTapCount">205</b>') &&
  (LANDING.match(/Smart Workflow 198/g) || []).length >= 30 && !has(LANDING_CLAIMS, "Smart Workflow 194") && (LANDING.match(/One-Tap 205/g) || []).length >= 30 && !has(LANDING_CLAIMS, "One-Tap 201") &&
  /data-count="wf">198</.test(LANDING) && /data-count="tap">205</.test(LANDING) && has(LANDING, "၁၉၈") && !has(LANDING_CLAIMS, "၁၉၄") &&
  has(PANEL_HOME, 'stat(205, "One-Tap Workflows");') && W.filter(x => !x.kind).length === 94,
  { app198: (APP.match(/Smart Workflow 198/g) || []).length, landing198: (LANDING.match(/Smart Workflow 198/g) || []).length, wf: W.length });
const artGaps = [];
IDS.forEach(id => {
  const p = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", id + ".jpg");
  if (!fs.existsSync(p)) { artGaps.push(id + " missing"); return; }
  const sz = jpegSize(fs.readFileSync(p)); if (!sz || sz.w !== 960 || sz.h !== 640) artGaps.push(id + " " + JSON.stringify(sz));
  if (fs.statSync(p).size < 40000) artGaps.push(id + " too small to be a photograph");
  if (new RegExp('NO_CARD_JPG=\\[[^\\]]*"' + id + '"').test(APP)) artGaps.push(id + " on the no-picture list");
});
report("B5) the three card pictures exist at the pack's 960x640, are photographs, and none is on the no-picture list", artGaps.length === 0, artGaps);
const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
/* this wave's own row: it led the strip when 6.123.0 shipped; 6.123.1 (the Imagine wipe hotfix) put its row above it,
   so the row is found by version, and every release after this one may do the same */
const WAVE_V = "6.123.0";
const row = rows.find(r => r.v === WAVE_V);
/* the row wears the shipped shape — t a plain title, s the excerpt with its **bold lead** — because renderDashNew
   reads both (a row without s threw "Cannot read properties of undefined (reading 'my')" in the dry run) */
report("B6) the What's New strip carries the 6.123.0 row — kind wf, opening the prop card — a plain title and a bold-led excerpt in all nine languages, both naming the three cards, and the panel's lifted table carries it (it led the strip when this wave shipped; the 6.123.1, 6.124.0, 6.125.0 and 6.126.0 rows sit above it now)",
  !!row && row.v === WAVE_V && rows.indexOf(row) <= 7 &&   /* 6.128.0 — each release adds a row above it; the window widens by one rather than the row being re-dated */ row.kind === "wf" && row.ref === "prop-insert" && LANGS.every(l => row.t[l] && row.s && row.s[l] && !row.t[l].startsWith("**") && row.s[l].startsWith("**") &&
    [row.t[l], row.s[l]].every(x => /Furniture & Prop Insert/.test(x) && /Decor Theme Colour/.test(x) && /Remove Light Stands & Gear/.test(x))) &&
  has(PWN, '"v":"' + WAVE_V + '"') && has(PWN, '"ref":"prop-insert"'), row && { v: row.v, kind: row.kind, ref: row.ref, at: rows.indexOf(row) });
report("B7) CI runs this test right after the Reference Scenes check, the suite counts 270 invocations and the landing says 270 tests (265 until 6.124.0 added verify_selection_swap, 266 until 6.125.0 added verify_album_wave_i, 267 until 6.127.0 added verify_skin_age_guard, 268 until 6.127.1 added verify_panel_v2_layer, 269 until 6.128.0 added verify_gen_loading_billing)",
  has(CI, "run: PORT=8931 node test/verify_reference_scenes.js\n") && has(CI, "run: PORT=8931 node test/verify_prop_wave_h.js") && CI.indexOf("verify_reference_scenes.js") < CI.indexOf("verify_prop_wave_h.js") &&
  (CI.match(/node test\//g) || []).length === 270 && has(LANDING, "270 tests") && !has(LANDING, "264 tests") && /data-count="tests">270</.test(LANDING), { steps: (CI.match(/node test\//g) || []).length });

/* ===================== C) the panel's lifted catalog and its compiler ===================== */
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items));
const pGaps = [];
IDS.forEach(id => {
  const it = items.find(x => x.id === id), w = byId[id];
  if (!it) { pGaps.push(id + " missing on the panel"); return; }
  if (it.prompt.indexOf(w.prompt) !== 0) pGaps.push(id + " prompt differs");
  if (it.negative.indexOf(w.negative) !== 0) pGaps.push(id + " negative differs");
  if (JSON.stringify(it.req) !== JSON.stringify(w.req)) pGaps.push(id + " inputs differ");
  const own = (it.fields || []).filter(f => f.key !== "skintone");
  if (JSON.stringify(own) !== JSON.stringify(w.fields)) pGaps.push(id + " fields differ");
  LANGS.forEach(l => { const s = cat.i18n && cat.i18n[l] && cat.i18n[l].sum && cat.i18n[l].sum[id]; if (!s || s.length < 10) pGaps.push(id + " no " + l + " summary"); });
});
const bgCat = cat.categories.find(c => c.category === "Background & Scene"), rpCat = cat.categories.find(c => c.category === "Repair & Enhance");
report("C1) the panel's lifted catalog carries the three with the app's prompts, AVOID lists, inputs and fields, nine card lines each, 198 cards in all — the scene pair under Background & Scene, the gear card under Repair & Enhance",
  pGaps.length === 0 && cat.total === 198 && items.length === 198 && !!bgCat && ["prop-insert", "decor-theme-color"].every(id => bgCat.items.some(x => x.id === id)) && !!rpCat && rpCat.items.some(x => x.id === "light-gear-remove"),
  { pGaps: pGaps.slice(0, 8), total: cat.total });
const REG = require("../panel/src/workflows/workflow-registry.js");
const cOn = REG.compile("prop-insert", { replace: true, where: "" }), cOff = REG.compile("prop-insert", { replace: false, where: "on her left, her hand resting on it" });
const cDt = REG.compile("decor-theme-color", { theme: "Emerald & Gold" }), cDtDef = REG.compile("decor-theme-color", undefined);
report("C2) the panel's compiler resolves the fields the way the app's wizard does: switch ON keeps the SWAP RULE line and drops the empty PLACEMENT line; switch OFF puts the OFF line in its place and the typed placement lands on the PLACEMENT line; the theme fills {{THEME}} and the default is White & Gold",
  !!cOn && /\nSWAP RULE: if IMAGE 1 already holds/.test(cOn.prompt) && !/PLACEMENT:/.test(cOn.prompt) && !/\{\{/.test(cOn.prompt) &&
  !!cOff && /\nSWAP RULE: remove nothing from IMAGE 1/.test(cOff.prompt) && !/SWAP RULE: if IMAGE 1/.test(cOff.prompt) && /\nPLACEMENT: on her left, her hand resting on it\n/.test(cOff.prompt) &&
  !!cDt && /THEME: Emerald & Gold — read these words/.test(cDt.prompt) && !/\{\{THEME\}\}/.test(cDt.prompt) && !!cDtDef && /THEME: White & Gold — read these words/.test(cDtDef.prompt),
  { on: cOn && cOn.prompt.slice(0, 60), offHas: cOff && /remove nothing/.test(cOff.prompt) });

/* ===================== D) the app, booted ===================== */
async function appWalk(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html?lang=en", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  const r = await page.evaluate((ids) => {
    const out = { errsSeen: 0 };
    const cats = window.HNK_WF_CATALOG || [];
    const all = [].concat.apply([], cats.map(c => c.items));
    out.total = all.length;
    const bg = cats.find(c => c.t === "Background & Scene"), rp = cats.find(c => c.t === "Repair & Enhance");
    const bgIds = bg ? bg.items.map(w => w.id) : [], rpIds = rp ? rp.items.map(w => w.id) : [];
    out.bgOrder = bgIds.slice(bgIds.indexOf("reference-scenes"), bgIds.indexOf("reference-scenes") + 4);
    out.rpOrder = rpIds.slice(0, 3);
    out.cardImg = ids.map(id => window._wfCardImgById(id));
    out.titles = ids.map(id => window._wfTitleById(id));
    out.batch = ids.map(id => window._wfBatchPrompt(id));
    out.on = window._wfFieldPrompt("prop-insert", { replace: true, where: "" });
    out.off = window._wfFieldPrompt("prop-insert", { replace: false, where: "  on her left,   her hand resting on it " });
    out.dtDef = window._wfFieldPrompt("decor-theme-color", null);
    out.dt = window._wfFieldPrompt("decor-theme-color", { theme: "Royal Blue & Silver" });
    out.lg = window._wfFieldPrompt("light-gear-remove", null);
    out.tap = document.getElementById("stTapCount") && document.getElementById("stTapCount").textContent;
    out.wfc = document.getElementById("stWfCount") && document.getElementById("stWfCount").textContent;
    /* the wizard opens on the prop card: step 1 shows the card picture; step 2 draws the two slots */
    window._openWizardById("prop-insert");
    out.wizOpen = /\bon\b/.test(document.getElementById("wiz").className);
    out.wizImg = !!document.querySelector("#wiz img.wiz-visual") && /cards5\/prop-insert\.jpg/.test(document.querySelector("#wiz img.wiz-visual").getAttribute("src") || "");
    const next = [...document.querySelectorAll("#wiz button")].find(b => /Start|→/.test(b.textContent));
    if (next) next.click();
    const slots = [...document.querySelectorAll("#wiz .wslot .nm")].map(n => n.textContent);
    out.slots = slots;
    return out;
  }, IDS);
  await ctx.close();
  return { r, errs };
}
async function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json")), pv = JSON.parse(read("docs/download/panel-version.json"));
  const CLAIMS = LANDING.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  report(`E1) ${VER} / panel ${PVER} in lockstep: APP_VER, version.json, sw.js cache, API_VERSION, PANEL_VERSION, manifest, release-manifest (+ artifact file, a 64-hex sha and a real size), panel-version.json, the download footer, the landing's badges`,
    has(APP, `var APP_VER="${VER}";`) && has(read("docs/app/version.json"), `"v":"${VER}"`) && has(read("docs/app/sw.js"), `var CACHE = "hnk-web-studio-v${VER.replace(/\./g, "-")}";`) &&
    has(read("server/index.js"), `const API_VERSION = "${VER}";`) && has(MAIN, `const PANEL_VERSION = "${PVER}";`) && has(read("panel/manifest.json"), `"version": "${PVER}"`) &&
    manifest.version === PVER && manifest.artifact_file === `HNK_Ai_Panel_v${PVER}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === PVER && pv.latest_version === PVER && has(read("docs/download/index.html"), `Web App ${VER} · Panel ${PVER}`) &&
    has(LANDING, VER) && has(LANDING, PVER) && !has(CLAIMS, "6.122.0") && !has(CLAIMS, "6.193.0"), { manifest: manifest.version, pv: pv.v });
}
(async () => {
  const browser = withPremium(await chromium.launch());
  try {
    const { r, errs } = await appWalk(browser);
    report("D1) the booted app composes 198 cards: Reference Scenes → Furniture & Prop Insert → Decor Theme Colour → Couple Compose under Background & Scene, Selection Edit → Selection Swap & Fill → Remove Light Stands & Gear under Repair & Enhance; the three carry their card pictures; the statline says 198 / 205",
      r.total === 198 && JSON.stringify(r.bgOrder) === JSON.stringify(["reference-scenes", "prop-insert", "decor-theme-color", "couple-compose"]) && JSON.stringify(r.rpOrder.slice(0, 3)) === JSON.stringify(["region-edit", "selection-swap", "light-gear-remove"]) &&
      r.cardImg.every((c, i) => c === "lib/wf/cards5/" + IDS[i] + ".jpg") && r.titles[0] === "Furniture & Prop Insert" && r.wfc === "198" && r.tap === "205", r);
    report("D2) the wizard's own field maths: switch ON → the SWAP RULE line, no PLACEMENT line, no raw token; switch OFF + a typed place → the OFF line in its place and 'PLACEMENT: on her left, her hand resting on it' (whitespace collapsed); the theme default is White & Gold and a typed theme fills every {{THEME}}; the gear card batches with its AVOID list and no FRAME LOCK",
      /\nSWAP RULE: if IMAGE 1 already holds/.test(r.on) && !/PLACEMENT:/.test(r.on) && !/\{\{/.test(r.on) &&
      /\nSWAP RULE: remove nothing from IMAGE 1/.test(r.off) && !/SWAP RULE: if IMAGE 1/.test(r.off) && /\nPLACEMENT: on her left, her hand resting on it\n/.test(r.off) &&
      /THEME: White & Gold — read these words/.test(r.dtDef) && /THEME: Royal Blue & Silver — read these words/.test(r.dt) && !/\{\{THEME\}\}/.test(r.dt) &&
      r.batch.every(b => /\n\nAVOID: /.test(b) && !/FRAME LOCK/.test(b) && !/\{\{/.test(b)) && r.lg.indexOf(LG.prompt) === 0,
      { on: r.on && r.on.slice(0, 80), off: r.off && (r.off.match(/PLACEMENT:[^\n]*/) || [])[0] });
    report("D3) the wizard opens on the prop card with its picture and, on Start, draws exactly two slots — IMAGE 1 the subject, IMAGE 2 the furniture photo — with no page error",
      r.wizOpen && r.wizImg && r.slots.length === 2 && /IMAGE 1 — Your Photo/.test(r.slots[0]) && /IMAGE 2 — Furniture/.test(r.slots[1]) && errs.length === 0, { slots: r.slots, errs });
    await releasePins();
  } catch (e) { report("X) the walk ran", false, String(e && e.stack || e).slice(0, 600)); }
  await browser.close();
  console.log(failures ? "\nFAIL — " + failures + " check(s)" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
