/* verify_skin_age_guard.js — 6.127.0 / panel 6.198.0
 *
 * WHY THIS EXISTS. 6.118.0 fixed ONE card. The owner asked the obvious next
 * question — "are the other skin cards ageing the face too?" — and they were.
 *
 * Measured on the catalog before this release: thirteen Look cards told the
 * model to "keep every real pore, FINE LINE, freckle and mole". A generative
 * model reads "keep the fine lines" as licence to draw them, and it draws them
 * deeper than the photograph had them. Six more cards whose job IS the skin
 * (Derma Skin Pro, Master Pro Retouch, Studio Look Copy, Master BG FG Replace,
 * Color Tone + Skin, Face Clarity) carried no statement of DIRECTION at all:
 * nothing told the model that a retouch may only subtract.
 *
 * The fix is not "smooth harder" — the texture these cards keep is the point,
 * and the owner chose to keep it. The fix is that the direction is now stated:
 * one AGE LOCK line, and three AVOID items.
 *
 * This test holds the line for every card added after today. A new card whose
 * prompt touches skin must either carry the guard or be listed in NON_SKIN
 * below with a reason — silence is a failure, not a default.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const R = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const data = p => { const s = R(p); return JSON.parse(s.slice(s.indexOf("=") + 1).trim().replace(/;$/, "")); };

let pass = 0, fail = 0;
function report(name, ok, detail) {
  if (ok) { pass++; console.log("PASS — " + name); }
  else { fail++; console.log("FAIL — " + name + (detail ? "  :: " + JSON.stringify(detail) : "")); }
}

const WF = data("docs/app/data/libwf.js").workflows;
const IM = data("docs/app/data/imagine.js").tools;

/* the sentence 6.127.0 installs, word for word on every surface */
const AGE_LOCK = "AGE LOCK: only reduce — lines, creases, eye bags and rough texture may be softened or cleared, never added, deepened or sharpened; the person reads the same age or younger than the source, never older.";
const AVOID_ITEMS = ["added wrinkles", "deepened lines", "older-looking face"];

/* a card is a SKIN card when its prompt sets out to finish skin — not merely
   when it says the word. A scene card that asks for "natural skin texture" as
   a realism cue is not retouching anybody. */
const SKIN_JOB = /\b(skin retouch|beauty retouch|skin finish|frequency separation|dermatolog|retouch of IMAGE|skin lock|texture truth|signature skin finish|glass[- ]skin)\b/i;

/* cards that mention skin but do not retouch it, each with the reason. A new
   entry here is a claim a reviewer can check against the prompt. */
const NON_SKIN = {
  "retouch": "already carries its own TEXTURE RULE since 6.118.0 — checked separately below",
  "upscale": "its prompt FORBIDS inventing wrinkles; adding a second rule would contradict it",
  "outfit": "Imagine OUTFIT CHANGE asks for no pores and no fine lines — the opposite direction",
};

/* ── A) no card anywhere asks the model to keep a fine line ───────────────── */
const fineLine = WF.filter(w => /keep (every )?(real )?pores?,? fine lines?/i.test(w.prompt)).map(w => w.id);
report("A) no card tells the model to keep a 'fine line' — the wording that re-drew them",
  fineLine.length === 0, fineLine);

/* ── B) every skin-job Smart Workflow carries the AGE LOCK and the AVOID items ── */
const wfSkin = WF.filter(w => SKIN_JOB.test(w.prompt) && !NON_SKIN[w.id]);
const wfMissing = wfSkin.filter(w =>
  w.prompt.indexOf(AGE_LOCK) < 0 ||
  !AVOID_ITEMS.every(x => (w.negative || "").toLowerCase().indexOf(x) >= 0));
report("B) every Smart Workflow that finishes skin carries the AGE LOCK line and names the three AVOID items",
  wfSkin.length >= 17 && wfMissing.length === 0, { skinCards: wfSkin.length, missing: wfMissing.map(w => w.id) });

/* ── B2) the AGE LOCK sits on its own line, and never on line 0 ──────────────
   6.126.0's cut keeps whole LOCK lines first, but rhLockSplit only considers
   lines after the first. An AGE LOCK glued into a paragraph, or standing as
   line 0, is dropped again by the 800-character models. */
const badPlace = wfSkin.filter(w => {
  const lines = w.prompt.split("\n");
  const at = lines.indexOf(AGE_LOCK);
  return at < 1;
});
report("B2) the AGE LOCK is its own line and never the first, so the 800-character cut keeps it whole",
  badPlace.length === 0, badPlace.map(w => w.id));

/* ── B3) the three age items LEAD the AVOID list ─────────────────────────────
   The first version of this release appended them, and appending lost them:
   rhAvoidFit sends the lead "AVOID: " and as many WHOLE opening items as the
   room holds, so an item written last is the first thing a capped model never
   hears. Measured on the shipped caps, sixteen of the 158 cut cases carried
   neither the AGE LOCK line nor one of these items; leading the list took that
   to two — and those two are cards whose TASK GUARD alone fills the 800 cap,
   the class verify_prompt_fit A2b/A3 records. The list is written worst-first;
   for a skin job "older-looking face" IS the worst, so this is also its place. */
const notLeading = wfSkin.filter(w => {
  const parts = (w.negative || "").split(",").map(x => x.trim().toLowerCase());
  return AVOID_ITEMS.some((x, i) => parts[i] !== x);
}).map(w => w.id);
report("B3) the three age items open every guarded AVOID list, so a capped model hears them first",
  notLeading.length === 0, notLeading);

/* ── C) the two Imagine skin tools carry it too ──────────────────────────── */
/* named, not inferred: these are the two Imagine tools whose job is the skin.
   Face Clarity's prompt never says "retouch" — it asks for texture back after a
   beauty filter — so a regex would miss it. Naming it is the honest pin. */
const IM_SKIN_IDS = ["colortone", "faceclear"];
const imSkin = IM.filter(t => IM_SKIN_IDS.indexOf(t.id) >= 0);
const imMissing = imSkin.filter(t =>
  (t.keep || "").indexOf(AGE_LOCK) < 0 ||
  !AVOID_ITEMS.every(x => (t.avoid || "").toLowerCase().indexOf(x) >= 0));
report("C) every Imagine tool that finishes skin carries the AGE LOCK in its keep line and the three AVOID items",
  imSkin.length >= 2 && imMissing.length === 0, { tools: imSkin.map(t => t.id), missing: imMissing.map(t => t.id) });

/* ── C2) an Imagine AVOID keeps the studio-gear sentence last ────────────────
   6.16.0 put "NO STUDIO GEAR IN THE FRAME:" at the end of those lists on
   purpose. The new items are inserted before it, never after. */
const gearLast = IM.filter(t => (t.avoid || "").indexOf("NO STUDIO GEAR") >= 0)
  .filter(t => AVOID_ITEMS.some(x => (t.avoid || "").indexOf(x) > (t.avoid || "").indexOf("NO STUDIO GEAR")));
report("C2) the new AVOID items sit before the studio-gear sentence, which stays last",
  gearLast.length === 0, gearLast.map(t => t.id));

/* ── C3) the Imagine lists lead with them too ────────────────────────────── */
const imNotLeading = imSkin.filter(t => {
  const k = (t.avoid || "").indexOf("AVOID:");
  const parts = (t.avoid || "").slice(k + 6).split(",").map(x => x.trim().toLowerCase());
  return AVOID_ITEMS.some((x, i) => parts[i] !== x);
}).map(t => t.id);
report("C3) the two Imagine lists open with the three age items as well",
  imNotLeading.length === 0, imNotLeading);

/* ── D) AI Retouch keeps its own 6.118.0 rule — this release did not touch it ── */
const ret = WF.find(w => w.id === "retouch");
report("D) AI Retouch still carries the 6.118.0 TEXTURE RULE and its own older-face AVOID",
  !!ret && /TEXTURE RULE: a retouch only removes and softens/.test(ret.prompt) && /never older\./.test(ret.prompt) &&
  /aged or older-looking face/.test(ret.negative || ""), null);

/* ── E) the panel carries the same words, byte for byte ─────────────────────
   The panel lifts this catalog. A lift that dropped or reworded the guard
   would leave Photoshop ageing faces the web app no longer ages. */
const PANEL = R("panel/js/hnk_wf_catalog_data.js");
const PANEL_IM = R("panel/js/hnk_imagine.js");
const panelWf = PANEL.split(AGE_LOCK).length - 1;
const panelIm = PANEL_IM.split(AGE_LOCK).length - 1;
report("E) the Photoshop panel's lifted catalog and Imagine module carry the same AGE LOCK sentence, once per guarded card",
  panelWf === wfSkin.length && panelIm === imSkin.length,
  { panelWorkflows: panelWf, expectWorkflows: wfSkin.length, panelImagine: panelIm, expectImagine: imSkin.length });
report("E2) the panel carries the three AVOID items too, and no 'keep … fine line' survives the lift",
  AVOID_ITEMS.every(x => PANEL.toLowerCase().indexOf(x) >= 0) &&
  !/keep (every )?(real )?pores?,? fine lines?/i.test(PANEL), null);

/* ── F) release pins ─────────────────────────────────────────────────────── */
const VER = "6.130.0", PVER = "6.201.0";
report(`F) ${VER} / panel ${PVER} in lockstep on the app, the API, the panel and the download footer`,
  R("docs/app/index.html").indexOf(`var APP_VER="${VER}";`) >= 0 &&
  R("docs/app/version.json").indexOf(`"v":"${VER}"`) >= 0 &&
  R("server/index.js").indexOf(`const API_VERSION = "${VER}";`) >= 0 &&
  R("panel/main.js").indexOf(`const PANEL_VERSION = "${PVER}";`) >= 0 &&
  R("docs/download/index.html").indexOf(`Web App ${VER} · Panel ${PVER}`) >= 0, null);

const wn = data("docs/app/data/whatsnew.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
/* 6.127.1 — this wave shipped as 6.127.0 and led the strip that day; the
   6.127.1 row sits above it now, so the row is found rather than read at 0.
   6.129.0 — one more release above it. */
const WAVE_V = "6.127.0";
const wnRow = wn.find(r => r.v === WAVE_V);
report(`F2) the What's New strip carries the ${WAVE_V} row, in all nine languages, with a bold-led excerpt (it led the strip when this wave shipped)`,
  !!wnRow && wn.indexOf(wnRow) <= 4 && wnRow.kind === "wf" &&
  LANGS.every(l => wnRow.t[l] && wnRow.s[l] && !wnRow.t[l].startsWith("**") && wnRow.s[l].startsWith("**")),
  { at: wnRow ? wn.indexOf(wnRow) : -1, head: wn[0] && wn[0].v });

report("F3) CI runs this test",
  R(".github/workflows/test.yml").indexOf("node test/verify_skin_age_guard.js") >= 0, null);

console.log(`\nverify_skin_age_guard: ${pass} passed, ${fail} failed`);
if (fail) { console.log(`FAIL — ${fail} check(s)`); process.exit(1); }
