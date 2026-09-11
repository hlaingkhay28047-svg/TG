/* v6.62.0 — THE UXP RULE SET, APPLIED WHERE THE CSS IS LIFTED.

   panel/styles.css is mostly hand-written, but one block is not: the Imagine
   rules are lifted verbatim out of docs/app/index.html by
   tools/build_panel_imagine.js, tokens renamed and the page id swapped. The
   web app runs in Chromium, where `pointer-events`, `gap`, `object-fit`,
   grid and pseudo-elements all work; the panel runs in Adobe UXP, where they
   do not.

   So the audit's forty-five violations could never have been fixed in the
   stylesheet alone: the first `node tools/build_panel_imagine.js` put six of
   them straight back, which is how this module came to exist. The lifter now
   passes every block through here, and the rule set is enforced at the seam
   between the two engines rather than swept up afterwards.

   THREE BEHAVIOURS, chosen by how safely the fix can be automated:

     REMOVE   pointer-events — a pure deletion. UXP implements none of it, so
              the declaration never did anything there; in Chromium removing
              it makes the two engines agree, which is the whole point. What
              it was standing in for (a disabled control) is enforced by
              main.js's capture-phase guard in BOTH engines.

     CONVERT  flex `gap` — into trailing margins on the children, named by
              type selector (`X > div, X > span, ...`) because `X > *` needs
              the universal selector the rule set also forbids. Direction
              comes from the same declaration block: column -> margin-bottom,
              row -> margin-right, a wrapping row -> both.

     REFUSE   everything else on the list — display:grid, the fr unit,
              position:sticky, the `inset` shorthand, object-fit, and the
              `*` / :not() / ~ / [disabled] selectors. Each of those has no
              mechanical translation that is certain to preserve the layout,
              and a silently wrong conversion in a file nobody reads is worse
              than a build that stops and names the line. If the web app
              grows one, a person decides what the panel should do instead.

   Comments are masked before matching. The panel's CSS explains every rule
   it ever removed, so a naive match finds the prose describing a violation
   and "fixes" the explanation. */

"use strict";

const KIDS = ["div", "span", "img", "p", "label", "select", "input", "textarea",
  "video", "b", "em", "i", "h2", "section"];

/* containers whose flex-direction is declared in a rule other than the one
   carrying the gap (an override that only restates spacing inherits it) */
const COLUMN_HINT = /flex-direction\s*:\s*column/;

const REFUSE = [
  ["display:grid", /display\s*:\s*(inline-)?grid/],
  ["the fr unit", /\b\d*\.?\d+fr\b/],
  ["position:sticky", /position\s*:\s*sticky/],
  ["the `inset` shorthand", /(^|[;{\s])inset\s*:/],
  ["object-fit", /object-fit\s*:/],
  ["a `*` selector", /(^|[,{\s>])\*(\s|,|\{|$)/],
  ["a :not() selector", /:not\(/],
  ["a `~` sibling combinator", /~\s*[.#a-zA-Z]/],
  ["a [disabled] selector", /\[disabled\]/],
  ["a pseudo-element", /::[a-zA-Z-]+|:(before|after)\b/],
];

function mask(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

/* ---- REMOVE: pointer-events ------------------------------------------- */
function dropPointerEvents(css) {
  const m = mask(css);
  const re = /(^|[;{\s])pointer-events\s*:\s*[^;}]+;?/g;
  let out = "", last = 0, hit;
  while ((hit = re.exec(m)) !== null) {
    /* KEEP the separator the declaration started after -- always. The first
       version dropped it unless it was "{", which welded the neighbours
       together: `text-align:center;pointer-events:none;box-shadow:...` came
       out as `text-align:centerbox-shadow:...`, one declaration where there
       had been two, and the knob on the Imagine compare slider lost its
       shadow silently. Only the trailing ";" of the removed declaration goes. */
    out += css.slice(last, hit.index) + hit[1];
    last = hit.index + hit[0].length;
  }
  out += css.slice(last);
  return dropEmptyRules(out.replace(/\{\s*;/g, "{").replace(/;\s*;/g, ";"));
}

/* a rule whose only declaration was removed is now `SELECTOR { }`; take the
   selector with it rather than shipping a rule that styles nothing */
function dropEmptyRules(css) {
  let out = css;
  for (;;) {
    const m = mask(out);
    const hit = /\{\s*\}/.exec(m);
    if (!hit) return out;
    /* cut back to the nearest real boundary. "no boundary at all" is -1 and
       must stay -1: an earlier version folded it to 0 with a +1 and kept the
       first character of the selector, so `.a{}` left a stray ".". */
    const marks = [m.lastIndexOf("}", hit.index), m.lastIndexOf("\n", hit.index)];
    const c = m.lastIndexOf("*/", hit.index);
    if (c >= 0) marks.push(c + 1);
    const cut = Math.max.apply(null, [-1].concat(marks));
    out = out.slice(0, cut + 1).replace(/[ \t]*$/, "") + out.slice(hit.index + hit[0].length);
  }
}

/* ---- CONVERT: flex gap ------------------------------------------------- */
function degap(css, where) {
  let out = css;
  for (;;) {
    const m = mask(out);
    const block = /\{[^{}]*\}/g;
    let found = null, hit;
    while ((hit = block.exec(m)) !== null) {
      if (/(^|[;{\s])(row-|column-)?gap\s*:/.test(m.slice(hit.index, block.lastIndex))) {
        found = { start: hit.index, end: block.lastIndex };
        break;
      }
    }
    if (!found) return out;

    const body = out.slice(found.start, found.end);
    const bmask = m.slice(found.start, found.end);
    const g = /(^|[;{\s])((row-|column-)?gap)\s*:\s*([^;}]+?)\s*;?(?=[;}])/.exec(bmask);
    const prop = g[2], val = g[4].trim();

    /* same -1 trap as dropEmptyRules: with no preceding "}" or comment the
       boundary is -1, and folding it to 0 slices away the selector's first
       character -- ".r > div" came out as "r > div", a selector that matches
       a <r> element and nothing else. The unit case in
       test/verify_panel_uxp_safe.js is exactly this. */
    const marks = [m.lastIndexOf("}", found.start)];
    const cEnd = m.lastIndexOf("*/", found.start);
    if (cEnd >= 0) marks.push(cEnd + 1);
    const prevEnd = Math.max.apply(null, [-1].concat(marks));
    const selRaw = out.slice(prevEnd + 1, found.start);
    const sels = selRaw.replace(/\/\*[\s\S]*?\*\//g, "").trim().split(",")
      .map((s) => s.trim()).filter(Boolean);
    if (!sels.length) throw new Error(where + ": a `gap` declaration with no selector to hang margins on");

    const col = COLUMN_HINT.test(bmask);
    const wrap = /flex-wrap\s*:\s*wrap/.test(bmask);
    const props = [];
    if (prop === "row-gap") props.push("margin-bottom: " + val + ";");
    else if (prop === "column-gap") props.push("margin-right: " + val + ";");
    else if (col) props.push("margin-bottom: " + val + ";");
    else {
      props.push("margin-right: " + val + ";");
      if (wrap) props.push("margin-bottom: " + val + ";");
    }

    let newBody = body.slice(0, g.index + g[1].length) + body.slice(g.index + g[0].length);
    newBody = newBody.replace(/\{\s*;/g, "{").replace(/;\s*;/g, ";");
    const inner = newBody.slice(newBody.indexOf("{") + 1, newBody.lastIndexOf("}"));
    const keepRule = !!inner.replace(/[\s;]/g, "");

    const kids = [];
    for (const s of sels) for (const k of KIDS) kids.push(s + " > " + k);
    const lines = [];
    for (let i = 0; i < kids.length; i += 5) lines.push(kids.slice(i, i + 5).join(",\n"));
    const fallback = lines.join(",\n") + " { " + props.join(" ") + " }";

    if (keepRule) {
      out = out.slice(0, found.start) + newBody + "\n" + fallback + out.slice(found.end);
    } else {
      const head = out.slice(0, found.start);
      const cut = head.lastIndexOf("\n");
      out = head.slice(0, cut + 1) + fallback + out.slice(found.end);
    }
  }
}

/* ---- REFUSE: everything the rule set forbids and this cannot translate -- */
function refuse(css, where) {
  const lines = mask(css).split("\n");
  const bad = [];
  for (const [what, re] of REFUSE) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) bad.push(what + "  (line " + (i + 1) + " of the lifted block): " + lines[i].trim().slice(0, 90));
    }
  }
  if (bad.length) {
    throw new Error(where + ": the lifted CSS uses " + bad.length + " thing(s) Adobe UXP does not implement, and none of\n" +
      "them has a mechanical translation this build is willing to guess at. Decide what the PANEL\n" +
      "should do (the web app keeps its own rule either way), then change the app block or teach\n" +
      "tools/lib/uxp_safe_css.js the conversion:\n  " + bad.join("\n  "));
  }
}

/* the whole pass, in the order the three behaviours have to run:
   remove first (so a dropped declaration cannot look like a refusal), then
   convert, then refuse on whatever is left. */
function uxpSafeCss(css, where) {
  let out = dropPointerEvents(css);
  out = degap(out, where || "uxpSafeCss");
  refuse(out, where || "uxpSafeCss");
  return out;
}

module.exports = { uxpSafeCss, dropPointerEvents, dropEmptyRules, degap, refuse, KIDS };
