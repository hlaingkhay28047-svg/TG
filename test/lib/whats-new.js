/* ============================================================
   The What's New strip, for the tests that pin one release's row.

   v6.107.0 — THE STRIP LEFT THE SHELL. It used to be an array literal inside
   docs/app/index.html, and fifteen tests sliced their own release's row out of
   that literal with a regex, then sliced the panel's copy out of
   panel/js/hnk_whats_new.js with the same regex and compared the two strings.
   The A4 ceiling in verify_app_data_files said, in so many words, that the next
   time the shell grew the answer was to move this table rather than raise the
   number again — so it now lives in docs/app/data/whatsnew.js as verbatim JSON,
   the same shape as the Library catalog and the Imagine tables, and the panel's
   copy is that JSON dropped in whole.

   WHAT THIS MODULE KEEPS. Those fifteen assertions are about the CONTENT of a
   row — that it exists, that its title and body are written in all nine base
   languages, that the panel says the same thing — not about how the file spells
   it. So the row is rendered back into the spelling those tests were written
   against: one line of `{ v:…, kind:…, ref:…,` then `t:{…}` and `s:{…}`. Every
   existing check reads as it did.

   The app row and the panel row are rendered from the two PARSED tables, so
   comparing them compares content. Byte-identity between the app's data file
   and the panel's lifted copy is verify_panel_whats_new.js's job, and it still
   does it.
   ============================================================ */
"use strict";
const path = require("path");
const A = require("../../tools/lib/app-data.js");

/* one object, in the literal spelling the shell used: unquoted keys, JSON values */
function obj(o) {
  return "{" + Object.keys(o).map(function (k) { return k + ":" + JSON.stringify(o[k]); }).join(",") + "}";
}
/* one row, in the exact shape the fifteen regexes matched — including the two
   line breaks and the four-space indents, so a check on `wn.length` or on
   "(^|[,{])my:\"" counts what it counted before */
function rowText(row) {
  if (!row) return "";
  return "{ v:" + JSON.stringify(row.v) + ", kind:" + JSON.stringify(row.kind) +
         ", ref:" + JSON.stringify(row.ref) + ",\n    t:" + obj(row.t) +
         ",\n    s:" + obj(row.s) + " },\n";
}
function find(rows, v, ref) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].v === v && (!ref || rows[i].ref === ref)) return rows[i];
  }
  return null;
}
function appRows() { return A.readWhatsNew(); }
function panelRows() {
  const m = require(path.join(A.ROOT, "panel", "js", "hnk_whats_new.js"));
  return (m && m.LIST) || [];
}
/* the app's row for this release, rendered; "" when there is none */
function appRow(v, ref) { return rowText(find(appRows(), v, ref)); }
/* the panel's row for this release, rendered the same way */
function panelRow(v, ref) { return rowText(find(panelRows(), v, ref)); }

module.exports = { appRows, panelRows, appRow, panelRow, rowText, find };
