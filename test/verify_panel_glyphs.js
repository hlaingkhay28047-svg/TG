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

   v6.65.0 — THE SIXTEEN PICTURES OF 6.135.0 ANSWERED IT, and corrected me.
   The strip drew almost everything: ⚠ is a yellow triangle, ♻ green, 📌 a
   red pin, ⚡ a yellow bolt. So "the host UI font has no colour emoji" was
   too broad, and condemning ⚠ by elimination was simply wrong — it draws.
   Only U+27A1 and U+1F504 come back as boxes; U+27A1 joins the rule set here.
   The same pictures showed three more things, and this file now pins them all:

     4. "glyph ruler: notdef 0 · n 0" — getBoundingClientRect answers an
        ALL-ZERO rect for a node created moments before. Not a zero-sized box:
        a box never laid out. The probe now measures on a later frame and
        refuses an all-zero rect, and "position:fixed yes" is retired as the
        false positive it always was (it accepted top≈0 && left≈0);
     5. Retouch A drew the SAME ICON TWO AND THREE TIMES down every feature
        row, because icn() wrote one <img> per tint and asked the stylesheet
        to hide the rest. It writes one now, and picks the tint itself;
     6. "+ Layer" refused with "no active layer" over a document that had one.
        ps.imaging.getPixels() must run inside executeAsModal; the throw was
        being swallowed into the same bare null the no-document branch
        returns. And HNK.herr, which the host has always called, was never
        published — so the log the owner photographed could not fill.

   v6.66.0 — 6.136.0 ANSWERED, AND PUT ONE OF MY READINGS IN DOUBT.
   The after-layout probe worked exactly as written and the verdict is final:
   every geometry row reads "unmeasurable" and the ruler reads
   "notdef -1 · n -1" — this renderer does not hand geometry to script, two
   frames and a 120 ms timer included. So the panel stops asking the layout
   for what the CASCADE already knows (box-sizing, position and gap are
   computed values), and one 100px box is now measured five ways so a single
   photograph names whatever ruler does work.

   And the two cells I called .notdef photograph as a solid CYAN square, while
   the boxes on 6.134.0 were black. Noto draws U+27A1 and U+1F504 as a white
   arrow on a blue plate; at 15px, inside a photograph of a screen, that is
   indistinguishable from an empty blue box. So the claim is withdrawn to
   "unsettled" and the card now prints those two at 52px beside a private-use
   codepoint nothing maps. The sprite swap stands on its own merit either way.

   v6.66.1 — THE 6.137.0 PHOTOGRAPHS SETTLED BOTH QUESTIONS, AND I WAS WRONG
   ABOUT ONE OF THEM. At 52px the control cell draws an empty outlined box
   while U+27A1 and U+1F504 draw a white arrow and white circular arrows on a
   blue plate: they are PRESENT, and reading the 15px strip's coloured square
   as .notdef was my mistake. The sprite swap stays, now as a choice.
   The ruler bake-off read rect 0 · client 0 · scroll 0 · computed 100px ·
   offset 0 — and calc() came back unresolved, so that lone 100px is an ECHO
   of what was set, not a measurement. There is no ruler in this renderer.
   And the same pictures showed Retouch A drawing its caret and section reset
   at 72px, the raw size of the icon file: every icon sized only by a .stpg or
   .apg rule was wrong, the one with an unscoped rule was right. Eight
   unscoped fallbacks are the floor now, and switchPage no longer re-derives
   the scope classes from a read of the element it wrote them onto.

   v6.68.0 — AND THE CAPTURE ITSELF. 6.138.0 gave the first honest refusal:
   "Photoshop would not hand over the layer's pixels." over an open 4672x7008
   document. executeAsModal was necessary and not sufficient — getPixels was
   being asked for 32.7 megapixels at once. The request is bounded to 2048 on
   the long edge now, with three routes behind it ending in one that never
   touches ps.imaging: Photoshop saves a flattened JPEG copy and the panel
   reads the bytes back. Every failed route keeps its reason. And the reason
   reaches the screen: the slot rebuild was dropping `detail`, which is why
   that photograph shows the sentence with nothing in brackets after it.

   Also settled by the same card: "page scope: yes · page apg stpg". The class
   is on the element, so the 72px icons were not a lost class — this renderer
   simply does not honour those scoped rules, and 6.67.0's unscoped floor is
   the permanent answer rather than a workaround.

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

/* v6.65.0 — the two the 6.135.0 photograph caught. The strip drew every
   symbol on the card except these two, so they are the only additions the
   picture licenses — and ⚠, which the earlier deduction-by-elimination had
   condemned, draws as a yellow triangle and is kept out by choice, not need. */
report("A5) both glyphs under suspicion have rules, and the arrow names a sprite no font can fail to have",
  T.GLYPHS["\u27A1"] && T.GLYPHS["\u27A1"].icon === "i-arrow" &&
  !!T.GLYPHS["\uD83D\uDD04"] &&
  T.uxpSafeText("\u27A1 next") === "next", null);

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
const CSSFILE = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
report("D2) Retouch A/B builds all four of its icon shapes from the raster",
  (RETOUCH.match(/src="icons\/ui\/' \+ name[^\n]*\.png/g) || []).length >= 4, null);
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

/* ------------------- D6-D9. ONE icon, not three. v6.65.0.

   The owner's photographs of 6.135.0 show Retouch A with the same icon drawn
   two and three times down every feature row. icn() had been writing every
   tint an icon can wear — cream, gold, ink, sometimes muted — as overlapping
   <img> elements and leaving the stylesheet to hide the ones the context did
   not want. A browser does that exactly; Photoshop does not. The panel now
   decides in JavaScript and writes one. -------------------------------- */

report("D6) icn() writes ONE <img>, and no loop over a tint list survives",
  !/for \(var i = 0; i < tints\.length; i\+\+\)/.test(RETOUCH) &&
  !/var TINTS_ALL/.test(RETOUCH) &&
  /function iconTag\(name, cls, tint\)/.test(RETOUCH) &&
  /return iconTag\(name, c, "cream"\);/.test(RETOUCH) &&
  /^  return '<img class="'[\s\S]*?\n\}/m.test(RETOUCH) &&
  (RETOUCH.match(/function icn\(name, cls\) \{[\s\S]*?\n\}/) || [""])[0]
    .split("<img").length - 1 === 3, null);

report("D7) the tint comes from the context the icon actually sits in, and the walk stops at the page",
  /function ctxTint\(node\)/.test(RETOUCH) &&
  /=== "stPendCount"\) return "muted"/.test(RETOUCH) &&
  /" grp-h "\) >= 0\) return "gold"/.test(RETOUCH) &&
  /" btn-gold "\) >= 0\) return "ink"/.test(RETOUCH) &&
  /" chip "\) >= 0 && c\.indexOf\(" on "\) >= 0\) return "ink"/.test(RETOUCH) &&
  /indexOf\(" stpg "\) >= 0\) break;/.test(RETOUCH) &&
  /return "cream";/.test(RETOUCH), null);

/* an icon whose gold file was never compiled must keep cream rather than
   fetch a 404 and draw nothing — the 6.128.0 failure, in a new place */
{
  const listed = new Set(((RETOUCH.match(/"i-bandage[\s\S]*?\.split\(" "\)\)/) || [""])[0]
    .match(/i-[a-z0-9-]+/g) || []));
  const onDisk = new Set();
  for (const f of fs.readdirSync(path.join(PANEL, "icons/ui"))) {
    const m = /^(i-[a-z0-9-]+)-cream\.png$/.exec(f);
    if (m && ["gold", "ink", "muted"].every((t) => fs.existsSync(path.join(PANEL, "icons/ui", m[1] + "-" + t + ".png"))))
      onDisk.add(m[1]);
  }
  const extra = [...listed].filter((n) => !onDisk.has(n));
  const missing = [...onDisk].filter((n) => !listed.has(n));
  report("D8) TINT4 names exactly the icons that have all four tints on disk (" + onDisk.size + ")",
    listed.size > 0 && extra.length === 0 && missing.length === 0, { extra, missing });
}

report("D9) and no rule in the stylesheet can hide a studio icon any more",
  !/\.stpg[^{\n]*\bi2[cgkm]\b[^{\n]*\{[^}]*display:\s*none/.test(CSSFILE), null);

report("D10) the icon is retinted where it lands: on write, on mount, and on the frame after a tap",
  /elm\.innerHTML = opts\.after[\s\S]{0,240}?retint\(elm\);/.test(RETOUCH) &&
  (RETOUCH.match(/retint\(doc\(\)\);/g) || []).length >= 2 &&
  /addEventListener\("click", retintSoon, true\)/.test(RETOUCH) &&
  /requestAnimationFrame/.test(RETOUCH), null);

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
/* v6.66.0 — offsetWidth is now MEASURED, on purpose, as the known-zero control
   in the ruler bake-off. The rule it was always standing for is the one kept
   here: no probe may DECIDE anything on it. Its only appearance is the one
   labelled line inside rulers(), and no caps.* verdict reads it. */
report("E3) no probe decides on offsetWidth/offsetLeft \u2014 they appear only as the bake-off's control",
  /getBoundingClientRect/.test(STCODE) &&
  (STCODE.match(/offsetWidth|offsetLeft/g) || []).length === 1 &&
  /out\.push\("offset " \+ num\(el\.offsetWidth\)\)/.test(STCODE) &&
  !/caps\.[A-Za-z]+\s*=\s*[^;\n]*offset(Width|Left)/.test(STCODE), null);
report("E4) the three probes that read 0 twice still measure what they claim to",
  /r1\.width - 100/.test(STCODE) && /rc2\.left - rc1\.left/.test(STCODE) &&
  /r3\.width - 60/.test(STCODE), null);

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

/* ---- E8/E9. v6.65.0 — what 6.135.0's photograph actually proved.

   "glyph ruler: notdef 0 · n 0" means getBoundingClientRect answered an
   ALL-ZERO rect for a node created moments earlier: not a zero-sized box, a
   box that was never laid out. And "position:fixed yes" was a FALSE POSITIVE
   — the old probe accepted top≈0 && left≈0, which an all-zero rect gives
   for free. Both corrections are pinned here. ---- */

report("E8) an all-zero rect is refused as never-laid-out instead of read as a measurement",
  /if \(!r\.width && !r\.height && !r\.top && !r\.left\) return null;/.test(STCODE) &&
  (STCODE.match(/"unmeasurable"/g) || []).length >= 5, null);

report("E9) the measurement waits for a laid-out frame, and fixed is probed AWAY from the origin",
  /raf\(function \(\) \{ raf\(measure\); \}\)/.test(STCODE) &&
  /setTimeout\(measure, 120\)/.test(STCODE) &&
  /position: "fixed", top: "12px", left: "7px"/.test(STCODE) &&
  /Math\.abs\(r4\.top - 12\) <= 1 && Math\.abs\(r4\.left - 7\) <= 1/.test(STCODE), null);

/* ---- E10-E12. v6.66.0 — the ruler is the blocker, so stop guessing at it.

   6.136.0 answered honestly and the answer was "nothing": four geometry rows
   unmeasurable, the ruler "notdef -1 · n -1". Two frames and a timer did not
   help, so getBoundingClientRect does not work in this renderer. Three of the
   four questions never needed it — box-sizing, position and gap are computed
   values — and one 100px box measured five ways will name whatever ruler does
   work, or prove there is none. ---- */

report("E10) the cascade is asked as well as the layout, for the three that need no geometry",
  /var computed = function \(el, prop\)/.test(STCODE) &&
  /caps\.cssBoxC = computed\(b1, "boxSizing"\)/.test(STCODE) &&
  /caps\.cssGapC = computed\(f2, "gap"\)/.test(STCODE) &&
  /caps\.cssCalcC = computed\(b3, "width"\)/.test(STCODE) &&
  /caps\.cssFixedC = computed\(b4, "position"\)/.test(STCODE), null);

report("E11) one 100px box is measured five ways, offsetWidth among them as the known-zero control",
  /var rulers = function \(el\)/.test(STCODE) &&
  /getBoundingClientRect/.test(STCODE) &&
  /"client " \+ num\(el\.clientWidth\)/.test(STCODE) &&
  /"scroll " \+ num\(el\.scrollWidth\)/.test(STCODE) &&
  /"computed " \+ \(computed\(el, "width"\)/.test(STCODE) &&
  /"offset " \+ num\(el\.offsetWidth\)/.test(STCODE) &&
  /var b7 = box\(doc, \{ width: "100px", height: "20px" \}\)/.test(STCODE) &&
  /caps\.rulers = rulers\(b7\)/.test(STCODE), null);

report("E12) and the two glyphs under suspicion get a control cell, so a photograph can settle them",
  /caps\.glyphTrio = \[chOf\(0xE0FF\), chOf\(0x27A1\), chOf\(0x1F504\)\]/.test(STCODE) &&
  /caps\.glyphTrio && caps\.glyphTrio\.length === 3/.test(MAIN) &&
  /big: true/.test(MAIN) && /diag-glyphs diag-big/.test(MAIN) &&
  /\.diag-big \.diag-gl \{/.test(CSSFILE) &&
  /font-size: 52px/.test(CSSFILE), null);

report("E13) the card prints the computed value beside the measured one, and the bake-off row",
  /const cssRow = function \(label, val, good, computed\)/.test(MAIN) &&
  /cssRow\("box-sizing", caps\.cssBox, "border-box", caps\.cssBoxC\)/.test(MAIN) &&
  /cssRow\("position:fixed", caps\.cssFixed, "yes", caps\.cssFixedC\)/.test(MAIN) &&
  /label: "rulers \(100px box\)"/.test(MAIN), null);

/* ---- E15-E19. v6.66.1 — what the 6.137.0 photographs settled.

   THE GLYPHS. At 52px the control cell draws an empty outlined box and the
   two suspects draw a white arrow and white circular arrows on a blue plate.
   They are nothing alike: U+27A1 and U+1F504 are PRESENT. My .notdef reading
   of the 15px strip was wrong, and the rule set now says so.

   THE RULER. rect 0, client 0, scroll 0, offset 0, computed 100px — but
   calc() came back "calc(50px + 10px)", unresolved. A renderer that had laid
   anything out would have resolved it, so getComputedStyle is echoing the
   value that was set. There is no ruler; there never was one.

   AND THE ICONS. Retouch A's caret and section reset drew at 72px — the raw
   size of the icon file. Every icon whose size came only from a .stpg/.apg
   rule was wrong; the one with an unscoped rule was right. ---- */

report("E15) the rule set records that both glyphs DRAW, and that the sprite is a choice",
  /DRAWS \u2014 SETTLED on 6\.137\.0/.test(T.GLYPHS["\u27A1"].note || "") &&
  /WRONG/.test(T.GLYPHS["\u27A1"].note || "") &&
  T.GLYPHS["\u27A1"].icon === "i-arrow", null);

report("E16) the card says the computed value is an echo, not a measurement",
  /caps\.cssEcho = \/\^calc\\\(\//.test(STCODE) &&
  /echo \(calc came back unresolved\)/.test(STCODE) &&
  /label: "\\u21b3 computed is"/.test(MAIN), null);

report("E17) and it reads the page's scope classes both ways, so a lost class cannot hide",
  /caps\.scopeAttr = viaAttr/.test(STCODE) && /caps\.scopeProp = viaProp/.test(STCODE) &&
  /caps\.scopeOk = \(\/\\bstpg\\b\/\.test\(viaAttr\)/.test(STCODE) &&
  /label: "page scope"/.test(MAIN), null);

report("E18) switchPage reads each page's scope ONCE from the markup, never re-derives it",
  /const scopeMem = \{\};/.test(MAIN) &&
  /let scope = scopeMem\[p\.page\];/.test(MAIN) &&
  /scopeMem\[p\.page\] = scope;/.test(MAIN) &&
  !/const apg = \/\\bapg\\b\/\.test\(clsOf\(pe\)\)/.test(MAIN), null);

/* every icon file is compiled at 72x72, so an <img> the stylesheet misses
   draws at 72px. The floor below is what stops that being possible. */
{
  const need = { "ic-car": "12px", "ic-h2": "14.4px", "ic-sa": "14px", "ic-xl": "32px",
                 "hsl-caret": "9px", "hsl-glyph-img": "15px", "st-tgi": "14px", "st-thph": "100%" };
  const missing = Object.keys(need).filter((c) => {
    const rx = new RegExp("^\\." + c + "\\s*\\{[^}]*width:\\s*" + need[c].replace(".", "\\."), "m");
    return !rx.test(CSSFILE);
  });
  report("E19) every icon class has an UNSCOPED size, so no missing scope can leave it at 72px",
    missing.length === 0, { missing });
}

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

/* ------------------- I. the three defects the same photographs showed. v6.65.0.

   "+ Layer" refused with "no active layer" over a document that plainly had
   one, and the panel's own log stayed empty while it happened. Two separate
   faults: ps.imaging.getPixels() must run inside executeAsModal or it throws,
   and the throw was swallowed into the same bare null the no-document branch
   returns — so the panel could only report the one thing that was not true.
   The host has always called HNK.herr/hwarn/hlog; main.js never published
   them, so every one of those calls went nowhere. -------------------------- */

const HOST = fs.readFileSync(path.join(PANEL, "src/photoshop/photoshop-host.js"), "utf8");
const IMPORTS = fs.readFileSync(path.join(PANEL, "src/photoshop/image-import-service.js"), "utf8");
const FREEGEN = fs.readFileSync(path.join(PANEL, "src/ui/screens/free-generate-screen.js"), "utf8");

report("I1) both captures read pixels inside executeAsModal, which is the only way Photoshop allows it",
  (HOST.match(/ps\.core\.executeAsModal\(run, \{ commandName:/g) || []).length === 2 &&
  /function captureActiveLayer\(\)/.test(HOST) && /function captureRegion\(/.test(HOST) &&
  (HOST.match(/typeof ps\.core\.executeAsModal === "function"/g) || []).length >= 2, null);

report("I2) a capture that THREW is no longer reported as a document with no layer",
  /return \{ error: _emsg\(e\) \};/.test(HOST) && /function _emsg\(e\)/.test(HOST) &&
  /if \(r && r\.error\) return _fail\("active-layer", "capture-failed", r\.error\);/.test(IMPORTS) &&
  /return _fail\("active-layer", "no-active-layer"\);/.test(IMPORTS) &&
  /slot_reason_capture_failed/.test(IMPORTS), null);

report("I3) and the reason carries Photoshop's own words to the two screens that print it",
  /function reasonMessage\(dom, reason, detail\)/.test(IMPORTS) &&
  /reasonMessage\(dom, slot\.reason, slot\.detail\)/.test(FREEGEN) &&
  /reasonMessage\(dom, inp\.image\.reason, inp\.image\.detail\)/.test(WFT), null);

report("I4) HNK.herr / hwarn / hlog exist, so the host's log calls reach the card",
  /globalThis\.HNK\.herr\s*=\s*function/.test(MAIN) &&
  /globalThis\.HNK\.hwarn\s*=\s*function/.test(MAIN) &&
  /globalThis\.HNK\.hlog\s*=\s*function/.test(MAIN) &&
  /_herr\(/.test(HOST), null);

/* ---- J. v6.68.0 — THE CAPTURE ITSELF, NOT JUST ITS EXCUSE.

   6.138.0's photograph is the first honest refusal: "Photoshop would not hand
   over the layer's pixels." over a document that was plainly open. So 6.65.0
   worked and executeAsModal was not the whole story. The document is
   SAM02346.ARW at 4672 x 7008 — 32.7 megapixels — and getPixels was being
   asked for all of it. It is bounded now, with three more routes behind it,
   the last of which never touches ps.imaging at all. ---- */

report("J1) the capture asks for a bounded picture first, not all 32 megapixels",
  /var CAP_MAX = 2048;/.test(HOST) && /function _capSize\(w, h\)/.test(HOST) &&
  /if \(cap && id != null\) reqs\.push\(\{ layerID: id, targetSize: cap \}\)/.test(HOST) &&
  /_capSize\(bounds\.width, bounds\.height\)/.test(HOST), null);

report("J2) and when imaging refuses, Photoshop writes the file itself",
  /async function _viaSavedCopy\(ps, uxp\)/.test(HOST) &&
  /_obj: "save"/.test(HOST) && /copy: true/.test(HOST) &&
  /createSessionToken\(file\)/.test(HOST) &&
  /via: "saved-copy"/.test(HOST), null);

/* a region has bounds a flattened save would ignore — answering with the
   whole page would be worse than refusing */
report("J3) the saved copy is offered for the whole document, never for a region",
  /_captureRoutes\(ps, uxp, reqs, w, h, true\)/.test(HOST) &&
  /_captureRoutes\(ps, uxp, reqs, bounds\.width, bounds\.height, false\)/.test(HOST), null);

report("J4) every route that fails keeps its own reason, so no refusal is silent again",
  /why\.push\("getPixels " \+ \(i \+ 1\)/.test(HOST) &&
  /why\.push\("saved copy: "/.test(HOST) &&
  /throw new Error\(why\.join\(" \| "\)/.test(HOST), null);

/* 6.138.0 printed the sentence with nothing after it: the detail existed and
   was dropped rebuilding the slot */
report("J5) and the detail survives the slot rebuild on both screens that print it",
  /reason: slot\.reason, detail: slot\.detail \}\);/.test(WFT) &&
  /reason: slot\.reason, detail: slot\.detail \}\);/.test(FREEGEN), null);

/* -------------------------------------------------------------------- H. CI */

const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
report("H1) CI runs this test", CI.includes("node test/verify_panel_glyphs.js"), null);

console.log(failures
  ? "\nFAIL (" + failures + ")"
  : "\nPASS — the panel asks for no glyph this renderer lacks, measures the ones nobody has checked, " +
    "and every icon path it builds — literal or concatenated — names a raster");
process.exit(failures ? 1 : 0);
