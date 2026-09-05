/* v6.16.0 — FLOWER PATH COPY.
 *
 * The owner's brief, one line: "image အတွက် smart workflow အသစ်တစ်ခုလုပ်မယ် — images ၁ က
 * solo ဒါမှမဟုတ် စုံတွဲ ရပ်နေတဲ့ ခြေထောက်နားကို ဒုတိယပုံမှာပြထား ပန်းခင်းလမ်း ပန်းတွေကိုပဲ
 * copy ယူမယ်". IMAGE 1 is one person or a couple standing; IMAGE 2 shows a flower
 * path on the ground; ONLY those flowers come across, onto IMAGE 1's floor at the
 * feet. Everything else in IMAGE 1 stays, and nothing else from IMAGE 2 follows.
 *
 * What is asserted, and why each line matters:
 *   - the record is in the Wedding Suite beside Bridal Decor, with two required
 *     inputs whose labels name IMAGE 1 and IMAGE 2 (the wizard draws its slots
 *     from those labels);
 *   - the prompt says which image is the target and which is the reference, says
 *     the flowers go on the GROUND only, says what to do when no ground shows,
 *     carries the note token and one TASK GUARD;
 *   - the AVOID list names the two ways this goes wrong on a real job — the
 *     reference's people or background bleeding in, and flowers landing on the
 *     person instead of the floor;
 *   - nine-language summary; a 960x640 card picture; the landing and the app's
 *     own share text count it (193 / 200); the panel's lifted catalog carries it;
 *   - What's New leads with it.
 *
 * Usage: node test/verify_flower_path_copy.js   (no browser, no server) */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const PANEL_CAT = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"), "utf8");
const ID = "flower-path-copy";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}
/* JPEG dimensions from the SOF marker — no image library needed */
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

/* ---- A) the record ---- */
const lib = JSON.parse(APP.match(/<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const w = lib.workflows.find(x => x.id === ID);
report("A) the record exists in the catalog with a title, a summary, an explanation and one text field for the extra request",
  !!w && w.title === "Flower Path Copy" && w.summary.length > 40 && w.explanation.length > 100 &&
  Array.isArray(w.fields) && w.fields.length === 1 && w.fields[0].type === "text" && w.fields[0].token === "{{NOTE}}" &&
  LANGS.every(l => w.fields[0].label[l]), w && { fields: w.fields.map(f => f.key) });
report("A2) it takes exactly two inputs, named as the wizard names them — IMAGE 1 the subject, IMAGE 2 the flower reference",
  !!w && w.req.length === 2 && /IMAGE 1/.test(w.req[0]) && /Subject/.test(w.req[0]) && /IMAGE 2/.test(w.req[1]) && /Flower/.test(w.req[1]) && (w.opt || []).length === 0, w && w.req);
report("A3) it sits in the Wedding Suite right after Bridal Decor",
  APP.indexOf('items: st(["bridal-decor","' + ID + '"]).concat(wed) });') >= 0);

/* ---- B) the prompt ---- */
const P = w ? w.prompt : "";
const rules = [];
if (!/IMAGE 1 is the ONLY edit target: one person or a couple standing/.test(P)) rules.push("target line");
if (!/IMAGE 2 is a FLOWER REFERENCE ONLY/.test(P)) rules.push("reference line");
if (!/Never copy its people, its background, its floor, its furniture, its light, its colour or its framing/.test(P)) rules.push("what never comes across");
if (!/^GROUND ONLY: the flowers belong on the floor\. Nothing is added to the person/m.test(P)) rules.push("ground-only line");
if (!/^COVERAGE: .*where it shows no ground at all, add nothing and return IMAGE 1 unchanged/m.test(P)) rules.push("no-ground rule");
if (!/^FLOWER FIDELITY: every species, colour, bloom size and the proportion between kinds is IMAGE 2's/m.test(P)) rules.push("fidelity line");
if (!/contact shadow under every bloom/.test(P)) rules.push("contact shadows");
if (!/never re-crop, reframe, zoom, rotate or re-pose IMAGE 1/.test(P)) rules.push("no re-crop");
if (!/^EXTRA REQUEST: \{\{NOTE\}\}$/m.test(P)) rules.push("note token");
if ((P.match(/TASK GUARD:/g) || []).length !== 1) rules.push("exactly one TASK GUARD");
if (!/TASK GUARD:\n[^\n]*From IMAGE 2 take only the flowers on the ground/.test(P)) rules.push("guard restates the one thing taken");
if (!/never depict a minor/.test(P)) rules.push("adult clause");
report("B) the prompt names the target and the reference, puts the flowers on the ground only, says what to do when no ground shows, keeps the crop, carries the note token and one TASK GUARD",
  rules.length === 0, rules);
const N = w ? w.negative : "";
report("B2) the AVOID list names the reference's people, background and floor, invented or wrong-coloured flowers, flowers on the body or in the hair, and petals without a contact shadow",
  /IMAGE 2's people/.test(N) && /IMAGE 2's background/.test(N) && /IMAGE 2's floor/.test(N) && /invented flowers/.test(N) &&
  /wrong flower colours/.test(N) && /flowers on the body or in the hair/.test(N) && /floating petals with no contact shadow/.test(N), N.slice(0, 200));

/* ---- C) nine languages ---- */
const sumRow = (APP.match(new RegExp('      "' + ID + '":\\{([^\\n]*)\\},\\n')) || [])[1] || "";
report("C) the nine-language summary row exists and names the flower path and the feet in English",
  LANGS.every(l => sumRow.indexOf(l + ':"') >= 0) && /flower path/.test(sumRow) && /feet/.test(sumRow), sumRow.slice(0, 120));

/* ---- D) the card picture ---- */
const art = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
const sz = fs.existsSync(art) ? jpegSize(fs.readFileSync(art)) : null;
report("D) a 960x640 card picture ships under the workflow's own id",
  !!sz && sz.w === 960 && sz.h === 640, sz);

/* ---- E) the counts — the catalog total is every card the app builds (presets, relights, cleanups AND the staged
   workflows), so it is read from the lifted catalog rather than guessed from one list ---- */
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items));
const total = items.length;
report("E) the app's share text and the landing count the new workflow — Smart Workflow " + total + " — and the landing carries no stale 188",
  total === 193 && APP.indexOf("Smart Workflow 193") >= 0 && APP.indexOf("Smart Workflow 188") < 0 &&
  (LANDING.match(/Smart Workflow 193/g) || []).length >= 30 && LANDING.indexOf("Smart Workflow 188") < 0 &&
  /data-count="wf">193</.test(LANDING) && /data-count="tap">200</.test(LANDING) && APP.indexOf("One-Tap 200") >= 0 && APP.indexOf("One-Tap 195") < 0,
  { total, app189: APP.indexOf("Smart Workflow 193") >= 0, landing189: (LANDING.match(/Smart Workflow 193/g) || []).length });

/* ---- F) the panel carries it ---- */
const pit = items.find(i => i.id === ID);
const wedCat = cat.categories.find(c => c.items.some(i => i.id === ID));
report("F) the panel's lifted catalog carries the record with the same prompt, AVOID list, two inputs and text field, in the Wedding Suite",
  !!pit && !!w && pit.prompt.indexOf(P) === 0 && pit.negative === N && pit.req.length === 2 && (pit.fields || []).length === 1 &&
  !!wedCat && /Wedding/.test(String(wedCat.category || "")), { found: !!pit, cat: wedCat && wedCat.category });

/* ---- G) What's New — the row shipped with 6.16.0; later releases stack above it ---- */
const wnStart = APP.indexOf("var WHATS_NEW = [");
const wn = APP.slice(wnStart, APP.indexOf("\n];", wnStart));   /* the whole table — later releases stack above this row */
report("G) a What's New row opens this workflow", /\{ v:"6\.16\.0", kind:"wf", ref:"flower-path-copy"/.test(wn), wn.slice(0, 100));

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — only the flowers come across, onto the floor at the feet, on both surfaces");
process.exit(failures ? 1 : 0);
