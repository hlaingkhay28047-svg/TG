/* v6.64.0 — THE PANEL DOES NOT ASK FOR A GLYPH THIS RENDERER HAS NOT GOT.

   WHAT THE OWNER PHOTOGRAPHED. Sixteen pictures of panel 6.134.0. The icon
   wave had worked — the SELF-TEST card's stroke-vs-fill row shows a thin
   outline house beside the gold star, "icon (png) yes", "SVG in img yes" —
   and black rounded squares were still scattered through the UI text on
   Retouch A, Retouch B, Path and Recipes.

   A square like that is `.notdef`: the glyph a font draws when it is asked
   for a character it does not carry. The panel is painted in the host's UI
   font, and that font has no colour emoji. The SAME photographs show → ←
   and ✓ drawn correctly, so the answer is not "replace every symbol" — 1,131
   of them already work — and it is not another guess either. This wave does
   three separate things and this file holds all three:

     1. the characters that CANNOT work are gone from the panel, replaced at
        the seam where the app's text is lifted (tools/lib/uxp_safe_text.js),
        so the next lift cannot put them back;
     2. the characters nobody has measured are MEASURED, by the panel, in the
        renderer — advance width against a codepoint no font maps — and the
        SELF-TEST card prints the verdict and draws the strip so one
        photograph can check the arithmetic;
     3. the icon raster gate is closed properly. 6.63.0 said "no panel
        surface draws an icon from a .svg" and it was not true: its regex
        matched a LITERAL "icons/ui/<name>.svg", and eight builders across
        Retouch A/B, Home, Workflows and the shell rail assemble the path by
        concatenation. Every one of them was still fetching the stroke SVG
        that Photoshop paints as a black silhouette — on the very screens
        the owner kept photographing. That is checked here by the shape of
        the line, not by the shape of one string.

   Run: node test/verify_panel_glyphs.js */

"use strict";

const fs = require("fs");
const path = require("path");
const T = require("../tools/lib/uxp_safe_text.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}

/* every file the panel ships that can put text or a src on the screen */
function panelFiles() {
  const out = [path.join(PANEL, "index.html"), path.join(PANEL, "main.js")];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(path.join(PANEL, "src"));
  walk(path.join(PANEL, "js"));
  return out;
}

/* the prose explains which characters were removed and why, so a naive scan
   finds the explanation and calls it the defect — the same discipline the
   UXP-SAFE gate and the raster gate already use */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

/* ---------------------------------------- A. the rule module does what it says */

const A = [];
function unit(name, got, want) { A.push({ name, ok: got === want, got, want }); }

unit("a leading pictograph and its space go", T.uxpSafeText("\u{1F504} Retry", "u"), "Retry");
unit("the warning sign leads nothing", T.uxpSafeText("\u26A0 IMAGE 2 is missing", "u"), "IMAGE 2 is missing");
unit("a mid-sentence glyph leaves one space", T.uxpSafeText("then tap \u{1F4BE} Save", "u"), "then tap Save");
unit("the emoji presentation selector goes with its character",
  T.uxpSafeText("\u2600\uFE0F 28\u00B0C \u00B7 Clear", "u"), "28\u00B0C \u00B7 Clear");
unit("a string with nothing forbidden is returned untouched",
  T.uxpSafeText("\u2192 arrow and \u2713 tick stay", "u"), "\u2192 arrow and \u2713 tick stay");
report("A1) the replacement rules behave (" + A.length + " cases)",
  A.every((c) => c.ok), A.filter((c) => !c.ok));

let refused = false;
try { T.uxpSafeText("\u{1F600} hello", "u"); } catch (e) { refused = /no entry/.test(String(e.message)); }
report("A2) an emoji the rule set has no decision for STOPS the build instead of vanishing", refused, null);

/* the pairing rule, which is what keeps the Recipes empty state's save icon:
   the app writes the emoji as a marker and swaps it for a sprite */
const paired = 'x=escH(L9({en:"tap \u{1F4BE} Save"})).replace("\u{1F4BE}",icn("i-save"));';
report("A3) a glyph handed to a sprite on the same line is kept, not deleted",
  T.uxpSafeCode(paired, "u") === paired, T.uxpSafeCode(paired, "u"));

/* the spacing fix must be local: an early version tidied the whole line and
   ate the space out of every innocent " (" in the slice */
const innocent = 'var x = a + " (" + n + ") \u26A0 hey";';
report("A4) tidying the removed glyph's space does not touch any other space in the line",
  T.uxpSafeCode(innocent, "u") === 'var x = a + " (" + n + ") hey";', T.uxpSafeCode(innocent, "u"));

/* ------------------------------------- B. nothing on a panel surface ships one */

const offenders = [], waived = [];
for (const f of panelFiles()) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  for (const hit of T.findForbidden(code, { allowPaired: true })) {
    /* a line may carry an explicit, reasoned waiver. They are printed, never
       silent: WX_ICON is the app's table, pinned byte for byte by
       verify_greet_clock_weather, and the panel paints wxNode()'s sprite. */
    const line = src.split("\n")[hit.line - 1] || "";
    if (/uxp-glyph-ok:/.test(line) || /uxp-glyph-ok:/.test(src.split("\n")[hit.line] || "")) {
      waived.push(rel + ":" + hit.line + " " + hit.cp);
      continue;
    }
    offenders.push(rel + ":" + hit.line + " " + hit.cp + "  " + hit.text.slice(0, 70));
  }
}
report("B1) no panel surface ships a character this renderer has no glyph for",
  offenders.length === 0, offenders.slice(0, 12));
console.log("     (" + waived.length + " waived by an explicit uxp-glyph-ok note: " + waived.join(", ") + ")");

/* the web app keeps every one of them — it runs in Chromium, where they draw,
   and a wave that quietly rewrote the app's copy would be a different change */
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
report("B2) the web app is untouched — the rule set applies to the panel only",
  T.findForbidden(APP).length > 100, T.findForbidden(APP).length);

/* ------------------------------- C. the seam, so a re-lift cannot undo any of it */

const LIFTERS = ["studio_suites", "whats_new", "path_looks", "video_tool_wf", "video_wizard",
  "video_wf", "talk_models", "video_containers", "finish_engines", "imagine"];
const unwired = LIFTERS.filter(function (n) {
  const src = fs.readFileSync(path.join(ROOT, "tools", "build_panel_" + n + ".js"), "utf8");
  return !/uxpSafeCode\(/.test(src) || !/uxp_safe_text/.test(src);
});
report("C1) every generator that lifts the app's text runs the glyph pass (" + LIFTERS.length + " lifters)",
  unwired.length === 0, unwired);

/* ------------------------- D. the raster gate, closed on the concatenated form */

const svgAsk = [];
for (const f of panelFiles()) {
  const rel = path.relative(ROOT, f);
  const code = stripComments(fs.readFileSync(f, "utf8"));
  code.split("\n").forEach(function (line, i) {
    if (line.indexOf("icons/ui/") < 0) return;
    if (!/\.svg["'>]/.test(line)) return;
    /* the SELF-TEST probe loads one SVG on purpose, to report what this
       renderer does with it. That is evidence, not a dependency. */
    if (rel.endsWith("panel-selftest.js") && /probeImg\(/.test(line)) return;
    svgAsk.push(rel + ":" + (i + 1) + "  " + line.trim().slice(0, 96));
  });
}
report("D1) no panel surface asks for an icon .svg — including the paths built by concatenation, " +
  "which is how eight of them survived the 6.63.0 raster wave",
  svgAsk.length === 0, svgAsk.slice(0, 10));

/* the four screens the owner photographed, named, so a regression is legible */
const RETOUCH = fs.readFileSync(path.join(PANEL, "src/ui/screens/retouch-studio-screen.js"), "utf8");
const HOME = fs.readFileSync(path.join(PANEL, "src/ui/screens/home-screen.js"), "utf8");
const WFT = fs.readFileSync(path.join(PANEL, "src/ui/screens/workflow-tools-screen.js"), "utf8");
const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
report("D2) Retouch A/B builds all four of its icon shapes from the raster",
  (RETOUCH.match(/src="icons\/ui\/' \+ name[^\n]*\.png/g) || []).length >= 3 &&
  /tints\[i\] \+ '\.png"/.test(RETOUCH), null);
report("D3) Home's sprite row and tile, the Workflows icon and its favourite star, and the shell rail",
  /im\.src = "icons\/ui\/" \+ name \+ "-" \+ tint \+ "\.png";/.test(HOME) &&
  /"icons\/ui\/" \+ c\.ic \+ "-cream\.png"/.test(HOME) &&
  /im\.src = "icons\/ui\/" \+ name \+ "\.png";/.test(WFT) &&
  /i-star-fill-muted"\) \+ "\.png"/.test(WFT) &&
  /const want = "icons\/ui\/" \+ name \+ "-" \+ tint \+ "\.png";/.test(MAIN), null);

/* every PNG a builder can name has to exist, or the fix trades a black icon
   for an empty one. The tinted names are enumerable: <base>-<tint>.png */
const have = new Set(fs.readdirSync(path.join(PANEL, "icons", "ui")).filter((f) => f.endsWith(".png")));
const named = new Set();
for (const f of panelFiles()) {
  for (const m of fs.readFileSync(f, "utf8").match(/icons\/ui\/[A-Za-z0-9_-]+\.png/g) || []) named.add(m.split("/").pop());
}
const missing = [...named].filter((n) => !have.has(n));
report("D4) every icon named literally is on disk (" + named.size + " named, " + have.size + " files)",
  missing.length === 0, missing.slice(0, 10));

/* the moon this wave added, because the theme button used to paint U+2600 */
report("D5) the theme button paints a sprite, and the moon beside the sun exists",
  /ffIcon\(\(th === "light" \|\| th === "porcelain"\) \? "i-moon" : "i-sun", "cream"\)/.test(MAIN) &&
  ["cream", "gold", "ink", "muted"].every((t) => have.has("i-moon-" + t + ".png")), null);

/* ------------------------------------------------- E. the probe, and its ruler */

const SELFTEST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
const STCODE = stripComments(SELFTEST);

/* 6.63.0 moved these to getBoundingClientRect and the 6.134.0 photograph
   still read 0. The rest of the cause was the placement: nine thousand
   pixels off-screen, with every child absolutely positioned on top of its
   sibling. position:fixed at the origin is the one placement that has ever
   returned a number here. */
report("E1) the probe host is ON SCREEN at the origin, where the one working probe always was",
  /host\.style\.position = "fixed"; host\.style\.top = "0"; host\.style\.left = "0";/.test(STCODE) &&
  /host\.style\.opacity = "0"/.test(STCODE), null);
report("E2) box() no longer positions a probe box, so the flex children are in flow and can differ",
  !/function box\(doc2, css\) \{\s*var d = doc2\.createElement\("div"\);\s*d\.style\.position/.test(STCODE) &&
  !/c1\.style\.position = "static"/.test(STCODE), null);
report("E3) nothing measures with offsetWidth/offsetLeft, which answer 0 here",
  !/offsetWidth|offsetLeft/.test(STCODE) && /getBoundingClientRect/.test(STCODE), null);
report("E4) the three probes that read 0 twice still measure what they claim to",
  /w1 - 100/.test(STCODE) && /x2 - x1/.test(STCODE) && /w3 - 60/.test(STCODE), null);

report("E5) the glyph probe measures an advance width against a codepoint no font maps",
  /gw\(chOf\(0xE0FF\)\)/.test(STCODE) && /caps\.glyphMiss/.test(STCODE), null);
report("E6) it refuses to answer when the ruler itself is broken, instead of reporting every glyph missing",
  /caps\.glyphMiss = "unmeasurable"/.test(STCODE) && /"indistinguishable"/.test(STCODE), null);
/* the list is codepoints, not characters: a diagnostic that carries the very
   glyphs it is investigating would need a waiver from B1, and a waiver is how
   the next one gets in. */
report("E7) it measures the symbols the panel actually uses, and the emoji this wave removed as the control",
  /caps\.glyphList = GLYPHS/.test(STCODE) && /var GLYPH_CP = \[/.test(STCODE) &&
  /0x26A0/.test(STCODE) && /0x2192/.test(STCODE) && /0x1F504/.test(STCODE) &&
  !/GLYPH_CP = \[[^\]]*"/.test(STCODE), null);

/* ------------------------------------------- F. the card says it, and shows it */

report("F1) the card prints the verdict as codepoints, which are legible even when the glyphs are not",
  /label: "glyphs"/.test(MAIN) && /caps\.glyphMiss/.test(MAIN) && /glyph ruler/.test(MAIN), null);
report("F2) and DRAWS the whole strip, so one photograph checks the arithmetic",
  /label: "symbols " \+ part/.test(MAIN) && /chars: chunk/.test(MAIN) &&
  /r\.chars && r\.chars\.length/.test(MAIN), null);
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
report("F3) the strip has a rule to draw it by, and it obeys the panel's own UXP rules",
  /\.diag-glyphs \{/.test(CSS) && /\.diag-gl \{/.test(CSS) &&
  !/\.diag-glyphs[^{]*\{[^}]*gap:/.test(CSS), null);

/* ------------------------------------- G. the workflow hero, which drew nothing */

report("G1) the workflow detail hero paints through remoteArt, like the grid card that worked",
  /setArt\(heroIm, wf\.visual/.test(WFT) && !/hero\.style\.backgroundImage/.test(WFT), null);
report("G2) and its rule holds an <img> instead of a background it could never fetch",
  /\.hnk-wf-hero img \{/.test(CSS) && !/\.hnk-wf-hero \{[^}]*background-size/.test(CSS), null);

/* -------------------------------------------------------------------- H. CI */

const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
report("H1) CI runs this test", CI.includes("node test/verify_panel_glyphs.js"), null);

console.log(failures
  ? "\nFAIL (" + failures + ")"
  : "\nPASS — the panel asks for no glyph this renderer lacks, measures the ones nobody has checked, " +
    "and every icon path it builds — literal or concatenated — names a raster");
process.exit(failures ? 1 : 0);
