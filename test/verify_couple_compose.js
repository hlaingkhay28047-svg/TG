/* v6.17.0 — COUPLE COMPOSE, REDESIGNED.
 *
 * The owner's brief, with a screenshot of the old card: "couple compose မှာ image1
 * မိန်းကလေးမျက်နှာ image 2 ယောကျားလေးမျက်နှာ တွေကိုယူပြီး image 3 ထဲက စုံတွဲမျက်နှာ ထဲကို
 * သဘာဝဆန်ဆန်ထည့်မယ် — ကတ်ပုံကိုအသစ်ပြန်လုပ်ပေးပါ". The card used to build a brand-new
 * couple portrait out of two solo photos; it now takes the bride's face, the
 * groom's face and a couple photograph, and sets the two faces onto that couple
 * with everything else of the photograph kept. The card picture is redrawn.
 *
 * What is asserted: three required inputs in the wizard's own words; a prompt
 * that names which image is the target, which two are face sources, who gets
 * whose face, and that nothing but the faces crosses over; the guide steps on
 * both languages speak of three images; nine-language summary; the redrawn
 * card is 960x640 and — because it replaces a file under its own name — has
 * its LIB_ART_REV bump, its own LIB_PURGES entry, its fixture row with the
 * shipped bytes, and the sweep restatement; the panel's lifted catalog carries
 * the same record; What's New leads with it.
 *
 * Usage: node test/verify_couple_compose.js   (no browser, no server) */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "docs", "app", "sw.js"), "utf8");
const PANEL_CAT = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_wf_catalog_data.js"), "utf8");
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "fixtures", "lib-replacements.json"), "utf8"));
const SWEEP = fs.readFileSync(path.join(ROOT, "test", "sweep_v469_upgrades.js"), "utf8");
const ID = "couple-compose", TAG = "./__lib-purge-v6-17-0-couple-compose";
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

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

/* ---- A) the record ---- */
const lib = JSON.parse(APP.match(/<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const w = lib.workflows.find(x => x.id === ID);
report("A) the record takes exactly three required inputs — the bride's face, the groom's face, the couple photograph — named as IMAGE 1, 2 and 3",
  !!w && w.req.length === 3 && /Bride.*IMAGE 1/.test(w.req[0]) && /Groom.*IMAGE 2/.test(w.req[1]) && /Couple.*IMAGE 3/.test(w.req[2]) && (w.opt || []).length === 0, w && w.req);
report("A2) title kept, summary and explanation say what moves and what stays, one text field for the extra request",
  !!w && w.title === "Couple Compose" && /IMAGE 3/.test(w.summary) && /kept/.test(w.summary) && /left exactly as they are/.test(w.explanation) &&
  Array.isArray(w.fields) && w.fields.length === 1 && w.fields[0].token === "{{NOTE}}" && LANGS.every(l => w.fields[0].label[l]), w && { summary: w.summary });

/* ---- B) the prompt ---- */
const P = w ? w.prompt : "";
const rules = [];
if (!/IMAGE 1 is the BRIDE'S FACE SOURCE/.test(P)) rules.push("bride source line");
if (!/IMAGE 2 is the GROOM'S FACE SOURCE/.test(P)) rules.push("groom source line");
if (!/IMAGE 3 is the COUPLE PHOTOGRAPH and the ONLY edit target/.test(P)) rules.push("target line");
if (!/^WHO IS WHO: the woman of IMAGE 3 receives the face from IMAGE 1 and the man of IMAGE 3 receives the face from IMAGE 2/m.test(P)) rules.push("who-is-who");
if (!/never swapped, blended, averaged or mixed/.test(P)) rules.push("no blend");
if (!/^EVERYTHING ELSE: .*remain exactly as photographed; nothing from IMAGE 1 or IMAGE 2 beyond the two faces enters the picture/m.test(P)) rules.push("everything-else line");
if (!/no seam, no line at the jaw and no change of colour at the hairline/.test(P)) rules.push("seamless skin");
if (!/never move, resize, re-pose or re-crop the couple/.test(P)) rules.push("no re-crop");
if (!/^EXTRA REQUEST: \{\{NOTE\}\}$/m.test(P)) rules.push("note token");
if ((P.match(/TASK GUARD:/g) || []).length !== 1) rules.push("one TASK GUARD");
if (!/TASK GUARD:\n[^\n]*Edit IMAGE 3 only\. Replace only the two faces/.test(P)) rules.push("guard restates the edit");
if (!/never depict a minor/.test(P)) rules.push("adult clause");
report("B) the prompt names the target and the two face sources, says who receives whose face, forbids blending, keeps everything else of IMAGE 3, seams the skin, keeps the crop, carries the note token and one TASK GUARD",
  rules.length === 0, rules);
const N = w ? w.negative : "";
report("B2) the AVOID list names blended or swapped faces, the original faces left in place, a seam at the jaw or hairline, and hair or clothing carried over from the face sources",
  /blended or averaged faces/.test(N) && /the two faces swapped/.test(N) && /original faces left in place/.test(N) && /seam or line at the jaw or hairline/.test(N) &&
  /hair or clothing carried over from IMAGE 1 or IMAGE 2/.test(N), N.slice(0, 200));

/* ---- C) the guide steps, both languages, speak of three images ---- */
const steps = [...APP.matchAll(/"couple-compose": \[\n((?:      "[^\n]*",?\n)+)    \]/g)].map(m => m[1]);
report("C) both guide blocks (English and Myanmar) have four lines and name IMAGE 1, IMAGE 2 and IMAGE 3",
  steps.length === 2 && steps.every(b => (b.match(/\n/g) || []).length === 4 && /IMAGE 1/.test(b) && /IMAGE 2/.test(b) && /IMAGE 3/.test(b)) &&
  /bride's face photo as IMAGE 1/.test(steps[0]) && /GENERATE/.test(steps[0]) && /GENERATE/.test(steps[1]), { blocks: steps.length });
const sumRow = (APP.match(new RegExp('      "' + ID + '":\\{([^\\n]*)\\},\\n')) || [])[1] || "";
report("C2) the nine-language summary row exists and names IMAGE 3 in English",
  LANGS.every(l => sumRow.indexOf(l + ':"') >= 0) && /IMAGE 3/.test(sumRow), sumRow.slice(0, 120));

/* ---- D) the redrawn card and its replace-in-place contract ---- */
const art = path.join(ROOT, "docs", "app", "lib", "wf", "cards5", ID + ".jpg");
const bytes = fs.existsSync(art) ? fs.readFileSync(art) : null;
const sz = bytes ? jpegSize(bytes) : null;
report("D) the card picture is 960x640", !!sz && sz.w === 960 && sz.h === 640, sz);
const rev = (APP.match(/var LIB_ART_REV = \{[\s\S]*?\n\};/) || [])[0] || "";
const swEntry = SW.indexOf('{ tag: "' + TAG + '", re: new RegExp("/lib/wf/cards5/(couple-compose)\\\\.jpg$") }') >= 0;
const swLast = SW.lastIndexOf('{ tag: "./__lib-purge') === SW.lastIndexOf('{ tag: "' + TAG + '"');
const fixRow = FIX.files.find(f => f.path === "docs/app/lib/wf/cards5/couple-compose.jpg");
const sha = bytes ? crypto.createHash("sha256").update(bytes).digest("hex") : "";
report("D2) replaced under its own name: LIB_ART_REV lists it at 2, sw.js carries its own purge entry as the newest, the fixture records the shipped bytes under that tag, and sweep_v469 restates the entry",
  /"lib\/wf\/cards5\/couple-compose\.jpg": 2/.test(rev) && swEntry && swLast && !!fixRow && fixRow.sha256 === sha && fixRow.tag === TAG &&
  SWEEP.indexOf('{ tag: "' + TAG + '",') >= 0, { rev: /couple-compose/.test(rev), swEntry, swLast, fix: fixRow && fixRow.tag, shaMatch: !!fixRow && fixRow.sha256 === sha });

/* ---- E) the panel carries it ---- */
const cat = JSON.parse(PANEL_CAT.match(/var CATALOG = (\{[\s\S]*?\});\n/)[1]);
const items = [].concat.apply([], cat.categories.map(c => c.items));
const pit = items.find(i => i.id === ID);
report("E) the panel's lifted catalog carries the record with the same prompt, AVOID list and three inputs",
  !!pit && !!w && pit.prompt.indexOf(P) === 0 && pit.negative === N && pit.req.length === 3 && pit.req[2] === REQ3(w), { found: !!pit });
function REQ3(x) { return x.req[2]; }

/* ---- F) What's New ---- */
/* the row shipped with 6.17.0; later releases stack above it, so it is found anywhere in the table rather than at its head */
const wnStart = APP.indexOf("var WHATS_NEW = [");
const wn = APP.slice(wnStart, APP.indexOf("\n];", wnStart));
report("F) a What's New row at 6.17.0 opens Couple Compose", /\{ v:"6\.17\.0", kind:"wf", ref:"couple-compose"/.test(wn), wn.slice(0, 100));

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — two faces onto the couple, everything else kept, on both surfaces");
process.exit(failures ? 1 : 0);
