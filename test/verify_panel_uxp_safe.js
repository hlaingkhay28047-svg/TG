/* v6.62.0 / panel 6.133.0 — THE STYLESHEET'S OWN RULE SET, ENFORCED.

   WHY THIS FILE EXISTS. panel/styles.css opens with a header that calls
   itself UXP-SAFE and names, in prose, what Adobe's renderer cannot do:

       "UXP-SAFE: flexbox only (no grid/fr), no pointer-events,
        no object-fit (thumbs = background-size), no sticky."

   panel/index.html repeats it and adds `:not()`, `~`, `*` and `[disabled]`
   to the list of selectors "none of which the panel uses". main.js line 4
   repeats it again. Three files, one rule set, written down over two years
   of hard-won Photoshop defects — and NOTHING HAS EVER CHECKED IT.

   The audit that opened this wave (owner, 2026-09-11: "မစစ်ရသေးတဲ့
   အပိုင်းတေွလဲစစ်ပြီး အဓိပါယ် ရှိရှိ in and out အကုန်စစ်ပေးပါ သေချာအောင်"
   — check the parts not yet checked, in and out, properly, to be sure)
   stripped every CSS comment out of the file and matched the rule set
   against what actually shipped. The stylesheet was breaking its own list in
   FORTY-FIVE places:

     · `*` × 1   — the box-model reset, THE FIRST RULE IN THE FILE. If UXP
                   drops the universal selector, nothing in the panel is
                   border-box: an 84px thumb with 10px padding and a 1px
                   border measures 106px, every padded card overflows its
                   column, and every page is taller than its rules say. That
                   is the shape of the owner's "pannel အရမ်းရှည်" and
                   "ui ux မသပ်ရပ်" photographs.
     · `gap` × 29 — and the header comment on .hdr, three hundred lines below
                   the rule set, says in so many words: "margins here, UXP has
                   no gap". The panel wrote the finding down and then used the
                   property twenty-nine times anyway.
     · `object-fit` × 9   — thumbs stretched instead of cropped.
     · `pointer-events` × 6 — one of them, `.im-acts .btn.is-off`, was the
                   ONLY thing standing between a disabled Apply button and a
                   second run: off() in hnk_imagine.js sets a class and an
                   aria attribute, and the handlers never re-check.
     · `::-webkit-scrollbar` × 1 — a pseudo-element, and UXP has none.

   Forty-four of the forty-five are gone in this wave. The nine object-fit
   rules are converted on a measurement, not a fourth round of belief: the
   SELF-TEST card now reports whether this renderer keeps the property at all
   (caps.cssObjectFit) alongside box-sizing, flex gap, calc() and
   position:fixed, all four measured geometrically off-screen. Until that
   photograph arrives they are pinned below as an exact, shrink-only list: a
   new one fails this test, and a fixed one must be struck from the list.

   A rule nobody checks is not a rule. This file is the check. */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 600)));
  if (!ok) failures++;
}

/* Every check below runs on the stylesheet WITH ITS COMMENTS REMOVED. The
   file explains each rule it ever removed, so a naive grep matches the prose
   describing a violation and calls it a violation — the exact mistake that
   would make this gate unusable. Newlines are preserved so a hit still
   reports the line it is on. */
const CSS_RAW = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const CSS_LINES = CSS.split("\n");

function hits(re) {
  const out = [];
  for (let i = 0; i < CSS_LINES.length; i++) {
    if (new RegExp(re.source, re.flags.replace("g", "")).test(CSS_LINES[i])) {
      out.push({ line: i + 1, text: CSS_LINES[i].trim().slice(0, 90) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ A. CSS */

const RULES = [
  ["A1) no pointer-events — UXP implements none, so it can disable nothing",
    /pointer-events\s*:/],
  ["A2) no display:grid — the shell is flexbox only",
    /display\s*:\s*(inline-)?grid/],
  ["A3) no fr unit — it exists only inside a grid track",
    /\b\d*\.?\d+fr\b/],
  ["A4) no position:sticky — the header names it unsupported",
    /position\s*:\s*sticky/],
  ["A5) no `inset` shorthand — the panel writes top/left/right/bottom longhand",
    /(^|[;{\s])inset\s*:/],
  ["A6) no pseudo-elements — ::before / ::after / ::-webkit-* draw nothing in UXP",
    /::[a-zA-Z-]+|:(before|after)\b/],
  ["A7) no `*` selector — including the box-model reset, which is why the panel had no box model",
    /(^|[,{\s>])\*(\s|,|\{|$)/],
  ["A8) no :not() selector",
    /:not\(/],
  ["A9) no `~` general-sibling combinator",
    /~\s*[.#a-zA-Z]/],
  ["A10) no [disabled] attribute selector — every control in this panel is a div",
    /\[disabled\]/],
  ["A11) no flex `gap` — styles.css says so itself on .hdr: \"margins here, UXP has no gap\"",
    /(^|[;{\s])(row-|column-)?gap\s*:/],
];

for (const [name, re] of RULES) {
  const found = hits(re);
  report(name, found.length === 0, found.slice(0, 8));
}

/* A12 — object-fit: the one rule still open, pinned exactly.

   Nine declarations across four surfaces (Create gallery, the workflow
   request thumb, Gallery's grid and pick card, Path's workflow row and
   reference thumb, the Video Tools pick strip, the video wizard's visual and
   its slot thumbs). They are cover/contain fits on <img> elements whose
   pictures arrive through three different generators, so converting them is
   its own wave — and whether it is worth doing at all is a question the
   SELF-TEST card now answers from the renderer rather than from belief.

   The count is exact in BOTH directions on purpose: one more fails the gate,
   and one fewer fails it too, so a fix has to come here and say so. */
const OF_EXPECTED = 9;
const of_found = hits(/object-fit\s*:/);
report("A12) object-fit stays at exactly the " + OF_EXPECTED + " declarations this wave measured before converting",
  of_found.length === OF_EXPECTED,
  { expected: OF_EXPECTED, found: of_found.length, at: of_found.map((h) => h.line) });

/* ------------------------------------------------------- B. the reset itself */

/* The reset had to keep working after `*` went away, and a type-selector
   reset only covers the tags it names. This check keeps the list honest:
   every tag the panel actually renders must be in it. */
const INDEX = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
const JS_FILES = []
  .concat([path.join(PANEL, "main.js")])
  .concat(fs.readdirSync(path.join(PANEL, "js")).filter((f) => f.endsWith(".js")).map((f) => path.join(PANEL, "js", f)))
  .concat((function walk(dir) {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out = out.concat(walk(p));
      else if (e.name.endsWith(".js")) out.push(p);
    }
    return out;
  })(path.join(PANEL, "src")));

const resetBlock = (CSS.match(/\n(html, body, div[\s\S]*?)\{\s*box-sizing: border-box;/) || [])[1] || "";
const resetTags = new Set(resetBlock.split(",").map((s) => s.trim()).filter(Boolean));

const usedTags = new Set();
for (const t of INDEX.replace(/<!--[\s\S]*?-->/g, "").match(/<([a-zA-Z][a-zA-Z0-9]*)/g) || []) {
  usedTags.add(t.slice(1).toLowerCase());
}
for (const f of JS_FILES) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.match(/createElement\("([a-z0-9]+)"\)/g) || []) {
    usedTags.add(m.slice(15, -2));
  }
}
/* tags that carry no box and never need the reset */
for (const t of ["html", "head", "meta", "link", "style", "script", "title", "base"]) usedTags.delete(t);
usedTags.delete("body");

const missing = [...usedTags].filter((t) => !resetTags.has(t)).sort();
report("B1) the box-model reset names every tag the panel renders (it replaced `*`, so an unnamed tag has no reset)",
  resetBlock.length > 0 && missing.length === 0,
  { resetFound: resetBlock.length > 0, missing });

/* ------------------------------------------- C. a disabled control is disabled */

const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");

report("C1) the capture-phase guard exists and swallows both click and Enter/Space",
  /function bindOffGuard\(doc\)/.test(MAIN) &&
  /addEventListener\("click", swallow, true\)/.test(MAIN) &&
  /addEventListener\("keydown"[\s\S]{0,240}?true\)/.test(MAIN),
  { hasFn: /function bindOffGuard\(doc\)/.test(MAIN) });

report("C2) it reads all three ways the panel says \"off\": is-off, is-disabled, aria-disabled",
  /hasCls\(n, "is-off"\)/.test(MAIN) && /hasCls\(n, "is-disabled"\)/.test(MAIN) &&
  /getAttribute\("aria-disabled"\) === "true"/.test(MAIN),
  null);

report("C3) boot installs it — a guard that is never bound guards nothing",
  /safe\("off-guard", function \(\) \{ bindOffGuard\(document\); \}\)/.test(MAIN), null);

/* the whole point: the CSS crutch is gone, so the guard is the only thing
   holding the line and cannot be quietly dropped again */
report("C4) no rule anywhere still tries to disable a control with CSS",
  hits(/pointer-events\s*:\s*none/).length === 0, null);

/* ------------------------------------------------ D. the renderer is measured */

const SELFTEST = fs.readFileSync(path.join(PANEL, "src/app/panel-selftest.js"), "utf8");
for (const [key, why] of [
  ["cssBox", "the box-model reset, measured: 100px + 10px padding + 1px border"],
  ["cssGap", "flex gap, measured: two 10px children 20px apart"],
  ["cssCalc", "calc(50px + 10px)"],
  ["cssFixed", "position:fixed against the viewport origin"],
  ["cssObjectFit", "object-fit — the rule this wave did not convert"],
  ["cssBgSize", "background-size — the substitute the header names"],
]) {
  /* \b matters: `caps.cssGap` is a prefix of `caps.cssGapX`, and an
     includes() check would pass a renamed probe. The first version of this
     line did exactly that, and the injection test caught it. */
  const rx = new RegExp("caps\\." + key + "\\b");
  report("D) the SELF-TEST card measures " + why + " (caps." + key + ")",
    rx.test(SELFTEST) && rx.test(MAIN), null);
}

/* v6.63.0 — THIS CHECK USED TO PIN THE WRONG RULER, and the owner's
   photograph of 6.133.0 is what exposed it: `box-sizing 0px`, `flex gap 0`,
   `calc() NO`. None of those was a CSS answer. offsetWidth and offsetLeft
   return 0 in UXP, so all three probes reported the failure of the measuring
   instrument. position:fixed was the only row that worked, and the only one
   that used getBoundingClientRect. The check now demands the ruler that works
   and forbids the one that does not — which is a stronger assertion than the
   line it replaces, not a looser one. */
/* v6.65.0 — and the ruler that works still answers nothing if you read it too
   early. 6.135.0's card printed "glyph ruler: notdef 0 · n 0": an ALL-ZERO
   rect, which is not a zero-sized box but a box that was never laid out. So
   the check now demands three things of every probe — the right ruler, a
   laid-out frame to read it on, and a refusal to treat an all-zero rect as a
   measurement. It also demands that position:fixed be probed AWAY from the
   origin, because the old row accepted top≈0 && left≈0, which an all-zero
   rect gives for free: "position:fixed yes" on 6.135.0 was a false positive. */
report("D7) every geometric probe measures with getBoundingClientRect, and none with offsetWidth/offsetLeft (UXP answers 0)",
  /getBoundingClientRect/.test(SELFTEST) &&
  !/offsetWidth|offsetLeft/.test(SELFTEST.replace(/\/\*[\s\S]*?\*\//g, "")) &&
  /r1\.width - 100/.test(SELFTEST) && /rc2\.left - rc1\.left/.test(SELFTEST) &&
  /r3\.width - 60/.test(SELFTEST), null);

report("D8) it reads that ruler on a laid-out frame, and refuses an all-zero rect as a measurement",
  /if \(!r\.width && !r\.height && !r\.top && !r\.left\) return null;/.test(SELFTEST) &&
  /raf\(function \(\) \{ raf\(measure\); \}\)/.test(SELFTEST) &&
  /setTimeout\(measure, 120\)/.test(SELFTEST) &&
  /position: "fixed", top: "12px", left: "7px"/.test(SELFTEST), null);

/* ----------------------------------------------------- E. the rules are written */

report("E1) styles.css still carries the rule set in its header, and now says it is enforced",
  /UXP-SAFE/.test(CSS_RAW) && /verify_panel_uxp_safe\.js/.test(CSS_RAW), null);

/* --------------------------------------- F. the transform at the lifted seam */

/* The stylesheet could not be fixed in the stylesheet alone: the Imagine
   block is lifted out of the web app by tools/build_panel_imagine.js, and the
   first run after the audit put all six `pointer-events` declarations back.
   The rule set now lives at that seam (tools/lib/uxp_safe_css.js) — so the
   transform itself gets checked, because a silent CSS rewrite in a generated
   block is exactly the kind of thing nobody reads.

   Its first version DID have a defect these cases catch: it dropped the ";"
   that separated the removed declaration from the one before it, welding
   `text-align:center;pointer-events:none;box-shadow:...` into
   `text-align:centerbox-shadow:...` — one declaration where there were two,
   and the compare knob lost its shadow with nothing to show for it. */
const UXP = require("../tools/lib/uxp_safe_css.js");

function decls(css) {
  /* the declarations of the first rule, normalised — whitespace is not the point */
  const body = (css.match(/\{([^}]*)\}/) || [])[1] || "";
  return body.split(";").map((d) => d.replace(/\s+/g, "")).filter(Boolean);
}

report("F1) removing pointer-events keeps every neighbouring declaration intact",
  (function () {
    const got = decls(UXP.dropPointerEvents(".k{text-align:center;pointer-events:none;box-shadow:0 2px 8px #000}"));
    return got.length === 2 && got[0] === "text-align:center" && got[1] === "box-shadow:02px8px#000";
  })(),
  decls(UXP.dropPointerEvents(".k{text-align:center;pointer-events:none;box-shadow:0 2px 8px #000}")));

report("F2) it works first, last and alone in a block",
  decls(UXP.dropPointerEvents(".a{pointer-events:none;y:2}")).join("|") === "y:2" &&
  decls(UXP.dropPointerEvents(".a{x:1;pointer-events:none}")).join("|") === "x:1" &&
  !/pointer-events/.test(UXP.dropPointerEvents(".a{pointer-events:none}\n.b{z:3}")) &&
  /\.b\{z:3\}/.test(UXP.dropPointerEvents(".a{pointer-events:none}\n.b{z:3}")),
  null);

report("F3) a rule left with nothing goes, and takes its selector — no stray character",
  UXP.dropEmptyRules(".a{}\n.b{z:3}").replace(/^\s+/, "") === ".b{z:3}",
  JSON.stringify(UXP.dropEmptyRules(".a{}\n.b{z:3}")));

report("F4) prose in a comment is never edited — the panel's CSS explains every rule it removed",
  UXP.dropPointerEvents("/* pointer-events:none in prose */\n.a{x:1}") === "/* pointer-events:none in prose */\n.a{x:1}",
  null);

report("F5) gap becomes margins on typed children, and the rest of the rule survives",
  (function () {
    const g = UXP.degap(".r{display:flex;gap:8px;color:red}", "t");
    return /\.r > div/.test(g) && /margin-right: 8px;/.test(g) && !/gap\s*:/.test(g) && /color:red/.test(g);
  })(), null);

report("F6) a column gap becomes margin-bottom, a wrapping row becomes both",
  /margin-bottom: 6px;/.test(UXP.degap(".c{display:flex;flex-direction:column;gap:6px}", "t")) &&
  (function () {
    const w = UXP.degap(".w{display:flex;flex-wrap:wrap;gap:4px}", "t");
    return /margin-right: 4px;/.test(w) && /margin-bottom: 4px;/.test(w);
  })(), null);

report("F7) what it cannot translate it REFUSES, naming the thing — it never guesses",
  (function () {
    for (const bad of [".r{display:grid}", ".r{grid-template-columns:1fr}", ".r{position:sticky}",
      ".r{inset:0}", ".r{object-fit:cover}", ".r *{a:1}", ".r:not(.x){a:1}", ".r ~ .x{a:1}",
      ".r[disabled]{a:1}", ".r::after{content:''}"]) {
      let threw = false;
      try { UXP.refuse(bad, "t"); } catch (e) { threw = true; }
      if (!threw) return false;
    }
    return true;
  })(), null);

report("F8) the lifter runs the whole pass on what it lifts",
  /require\("\.\/lib\/uxp_safe_css\.js"\)/.test(fs.readFileSync(path.join(ROOT, "tools/build_panel_imagine.js"), "utf8")) &&
  /uxpSafeCss\(s,/.test(fs.readFileSync(path.join(ROOT, "tools/build_panel_imagine.js"), "utf8")), null);

const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
report("E2) CI runs this test", CI.includes("node test/verify_panel_uxp_safe.js"), null);

console.log(failures
  ? "\nFAIL (" + failures + ")"
  : "\nPASS — the panel obeys the rule set it wrote down, and the one rule still open is pinned to the count that was measured");
process.exit(failures ? 1 : 0);
