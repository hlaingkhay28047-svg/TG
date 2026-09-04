/* Lifts the web app's WHATS_NEW table into the panel, verbatim.
 *
 * WHY A TOOL. The panel's copy has always been the app's copy — the header of
 * the generated file has said "do not edit by hand" since it shipped — but the
 * copying itself was done by hand, which is exactly the step that drifts. A
 * student in Photoshop hearing about last month's release while their phone
 * shows this one is the failure verify_panel_whats_new.js exists to catch;
 * this tool is how the two stay identical in the first place.
 *
 * Usage: node tools/build_panel_whats_new.js */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs", "app", "index.html");
const OUT = path.join(ROOT, "panel", "js", "hnk_whats_new.js");

/* the array literal itself, characters and all — not a re-serialised object,
   so the panel's nine languages are the app's bytes */
function block(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error("not found: " + decl);
  const start = src.indexOf("[", i);
  let d = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === "[") d++;
    else if (src[k] === "]") { d--; if (!d) return src.slice(start, k + 1); }
  }
  throw new Error("unterminated: " + decl);
}

function build() {
  const lit = block(fs.readFileSync(APP, "utf8"), "var WHATS_NEW = [");
  const cur = fs.readFileSync(OUT, "utf8");
  const old = block(cur, "var WHATS_NEW = [");
  return cur.replace(old, lit);
}

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out);
  const n = (out.match(/\{ v:"/g) || []).length;
  console.log("wrote panel/js/hnk_whats_new.js — " + n + " entries, " +
    Buffer.byteLength(out) + " bytes");
}
module.exports = { build };
