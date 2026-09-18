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
const { uxpSafeCode } = require("./lib/uxp_safe_text.js");

const A = require("./lib/app-data.js");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "panel", "js", "hnk_whats_new.js");

/* v6.107.0 — THE SOURCE MOVED, THE RULE DID NOT. The strip left the shell for
   docs/app/data/whatsnew.js (the A4 ceiling in verify_app_data_files named it as the
   table to move rather than raise the number a fourth time), so the app's bytes are now
   that file's JSON rather than an array literal inside index.html. The panel still gets
   the app's bytes verbatim: the JSON text is sliced out of the wrapper by app-data.js
   and dropped in whole, so the two copies remain byte-identical by construction. */
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
  const lit = A.whatsNewText();
  const cur = fs.readFileSync(OUT, "utf8");
  const old = block(cur, "var WHATS_NEW = [");
  return uxpSafeCode(cur.replace(old, lit), "build_panel_whats_new");
}

if (require.main === module) {
  const out = build();
  fs.writeFileSync(OUT, out);
  const n = (out.match(/\{"v":"|\{ v:"/g) || []).length;
  console.log("wrote panel/js/hnk_whats_new.js — " + n + " entries, " +
    Buffer.byteLength(out) + " bytes");
}
module.exports = { build };
