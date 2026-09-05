/* v6.15.1 — NO GEAR IN THE FRAME.
 *
 * The owner sent two screenshots — a relit portrait with a softbox drawn into
 * the picture, and a decor result with a bright white light panel standing at
 * the left edge — and one line: "softbox မီးပုံစံ ပါနေတယ် မပါအောင်လုပ်ပေးပါ".
 *
 * WHY THE FIX IS WORDING AND WHY THIS FILE EXISTS. The twelve relight prompts
 * named the gear positively — "medium strip softbox, positioned at the left
 * side (about 90°)" — and forbade it only in a trailing "Do NOT show" line.
 * Image models draw what a prompt names and follow a negation loosely, so the
 * softbox kept appearing. The prompts now describe the light (very large and
 * soft; tall and narrow; small and hard), say the source sits entirely outside
 * the picture, and rule out a bright panel or glow entering at any edge. That
 * is a rule about words, so it is asserted on the words — on both surfaces —
 * because the next person to "improve" a relight prompt will reach for the
 * photographer's noun first, exactly as the first author did.
 *
 * Usage: node test/verify_no_gear_in_frame.js   (no browser, no server) */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const PANEL_MAIN = fs.readFileSync(path.join(ROOT, "panel", "main.js"), "utf8");
const PANEL_CAT = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

const data = JSON.parse(APP.match(/<script id="hnkData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const L = data.lighting.lights, GUARD = data.lighting.guard;
const GEAR = /softbox|octabox|umbrella|beauty dish|strobe|light stand|reflector|panel/i;
const setupLine = t => (t.split("\n").find(l => l.trim().indexOf("- ") === 0) || "");
const studio = L.filter(l => !/^(win|sunShaft)/.test(l.key)), wins = L.filter(l => /^(win|sunShaft)/.test(l.key));

/* ---- A) the eight studio setup lines describe the LIGHT, not the fixture ---- */
const named = studio.filter(l => GEAR.test(setupLine(l.text))).map(l => l.key + ": " + setupLine(l.text).slice(0, 90));
report("A) no studio setup line names a softbox, octabox, umbrella, dish, strobe, stand or reflector — it describes the light's size, softness and direction",
  L.length === 12 && studio.length === 8 && wins.length === 4 && named.length === 0, named);
const noOut = studio.filter(l => !/outside the picture/.test(setupLine(l.text))).map(l => l.key);
report("A2) every studio setup line puts the source outside the picture",
  noOut.length === 0, noOut);
const quality = studio.filter(l => !/\b(soft|hard|wrapping|narrow|crisp|wide-spreading)\b/.test(setupLine(l.text))).map(l => l.key);
report("A3) every studio setup line still says what the light is like — soft or hard, large or narrow — so the diagram lost nothing but the noun",
  quality.length === 0, quality);

/* ---- B) the equipment clause on all twelve carries the edge rule ---- */
const EQUIP = ["softboxes", "light stands", "umbrellas", "reflectors", "lamps"];
const EDGE = "entering at any edge of the frame";
const clauseGaps = [];
L.forEach(l => {
  const sent = l.text.split(/(?<=[.\n])\s*/).find(s => /Do NOT show/.test(s)) || "";
  EQUIP.forEach(e => { if (sent.indexOf(e) < 0) clauseGaps.push(l.key + " lacks " + e); });
  if (sent.indexOf(EDGE) < 0) clauseGaps.push(l.key + " lacks the edge rule");
  if (!/bright panel, white rectangle, glowing shape or light spill/.test(sent)) clauseGaps.push(l.key + " does not name what a leaked source looks like");
  if (/^(win|sunShaft)/.test(l.key) && !/window frames or blinds/.test(sent)) clauseGaps.push(l.key + " lost the window fixtures");
});
report("B) all twelve carry one equipment clause that forbids the fixtures AND a bright panel, white rectangle, glow or spill at any edge",
  clauseGaps.length === 0, clauseGaps.slice(0, 8));
/* one negation per prompt, still — the v4.85 rule that nothing negates the subject. Scoped to the four
   window lights as v4.85 scopes it: the studio rim/back/hair/background prompts carry physics clauses
   ("does not produce a front eye catchlight") that predate this file and aim at the light, not the person */
const extraNeg = [];
wins.forEach(l => l.text.split(/(?<=[.\n])\s*/).forEach(s => {
  if (!/\b(no|not|never|without|avoid|do NOT|don't)\b/i.test(s)) return;
  if (!/softbox|light stand|umbrella|reflector|lamp|window frame|blind|equipment/i.test(s)) extraNeg.push(l.key + ": " + s.trim().slice(0, 80));
}));
report("B2) the equipment clause is still the only negation in every window relight prompt",
  extraNeg.length === 0, extraNeg.slice(0, 6));

/* ---- C) the shared guard keeps the edges as they were ---- */
report("C) the RELIGHT guard says every source stays outside the picture and the crop, edges, backdrop and objects of IMAGE 1 stay as they are",
  /RELIGHT RULE/.test(GUARD) && /Every light source stays outside the picture/.test(GUARD) &&
  /the crop, the frame edges, the backdrop and every object in IMAGE 1 remain exactly as they are/.test(GUARD), GUARD);

/* ---- D) the generic AVOID list every one-tap card carries names the gear and the edge ---- */
const NEG = (APP.match(/var GENERIC_NEG = "([^"]*)";/) || [])[1] || "";
/* kept short on purpose: the AVOID list rides every one-tap card, and the tightest shipped cap (800) leaves
   the longest cleanup card only thirty-odd characters of room — verify_prompt_fit A holds that line */
report("D) GENERIC_NEG names a lamp or light panel in frame, and the relight cards still carry it as their AVOID list",
  /lamp or light panel in frame/.test(NEG) &&
  APP.indexOf('prompt:l.text+"\\n"+D.lighting.guard, negative:GENERIC_NEG') >= 0, NEG.slice(-160));

/* ---- E) the panel: the lifted catalog carries the same twelve prompts, and its own designer says the same ---- */
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items));
const drift = [];
L.forEach(l => {
  const it = items.find(i => i.id === "lg-" + l.key);
  if (!it) { drift.push("lg-" + l.key + " missing on the panel"); return; }
  /* the app appends its SKIN TONE TRUTH clause to every tone-group card at build time; the lifted copy carries it too */
  if (it.prompt.indexOf(l.text + "\n" + GUARD) !== 0) drift.push("lg-" + l.key + " prompt differs");
  if (it.negative !== NEG) drift.push("lg-" + l.key + " negative differs");
});
report("E) the panel's lifted catalog opens each of the twelve relight prompts with the app's text and guard, and carries the same AVOID list",
  drift.length === 0, drift.slice(0, 6));
const designer = (PANEL_MAIN.match(/: "\\nDo NOT show any studio equipment in the image - ([^"]*)"\);/) || [])[1] || "";
report("E2) the panel's Lighting designer uses the strengthened clause and ships with equipment OFF",
  designer.indexOf(EDGE) >= 0 && /bright panel, white rectangle, glowing shape or light spill/.test(designer) &&
  /lightEquip: false,/.test(PANEL_MAIN), { designer: designer.slice(0, 160) });

/* ---- F) What's New says so, and opens a relight card ---- */
/* the relight row shipped with 6.16.0; later releases stack above it, so it is found by what it says */
const wnStart = APP.indexOf("var WHATS_NEW = [");
const wnBlock = APP.slice(wnStart, APP.indexOf("\n];", wnStart));   /* the whole table, not a fixed slice */
report("F) a What's New row opens a Relight card and says the softbox is gone",
  /\{ v:"6\.16\.0", kind:"wf", ref:"lg-side",\n    t:\{[^\n]*no softbox, lamp or light panel/.test(wnBlock), wnBlock.slice(0, 100));

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — twelve lights described as light, every source outside the picture, on both surfaces");
process.exit(failures ? 1 : 0);
