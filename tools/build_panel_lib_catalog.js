#!/usr/bin/env node
/* Build panel/js/hnk_library_compact_data.js from the web app's OWN Visual
   Library data — the <script id="hnkLibWf" type="application/json"> block in
   docs/app/index.html that pgLib renders (items, featured, collections,
   workflows, groupOrder). The panel ships that JSON text byte-for-byte, so
   its Library page filters, groups, searches and titles exactly like the app;
   art still resolves from the deployed /app/lib tree (nothing binary ships).
   Usage:
     node tools/build_panel_lib_catalog.js            (writes the data file)
     node tools/build_panel_lib_catalog.js --print    (JSON to stdout only) */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OPEN = '<script id="hnkLibWf" type="application/json">';
const CLOSE = "</script>";
const OUT = path.join(ROOT, "panel", "js", "hnk_library_compact_data.js");
/* the data file wraps the JSON text between these two markers; the sync test
   slices the same markers, so the two texts can be compared verbatim */
const HEAD_MARK = "var LW = ";
const TAIL_MARK = ";\n/*END-LW*/";

function appLibText(html) {
  const a = html.indexOf(OPEN);
  if (a < 0) throw new Error("docs/app/index.html has no hnkLibWf block");
  const b = html.indexOf(CLOSE, a);
  return html.slice(a + OPEN.length, b);
}

function validate(json) {
  const lw = JSON.parse(json);
  const items = lw.items || [];
  const ids = new Set(items.map(it => it.id));
  const bad = items.filter(it => !it.id || !it.t || !it.f || typeof it.c !== "string" || !it.g || typeof it.q !== "string");
  if (bad.length) throw new Error("items missing id/t/f/c/g/q: " + bad.slice(0, 5).map(it => it.id).join(","));
  if (ids.size !== items.length) throw new Error("duplicate item ids");
  const badFeat = (lw.featured || []).filter(id => !ids.has(id));
  if (badFeat.length) throw new Error("featured ids not in items: " + badFeat.join(","));
  const sum = Object.values(lw.collections || {}).reduce((a, b) => a + b, 0);
  if (sum !== items.length) throw new Error("collections sum " + sum + " != items " + items.length);
  return lw;
}

function panelLibText(src) {
  const a = src.indexOf(HEAD_MARK);
  const b = src.indexOf(TAIL_MARK, a);
  if (a < 0 || b < 0) return null;
  return src.slice(a + HEAD_MARK.length, b);
}

function render(json) {
  return "/* ============================================================\n" +
    "   HNK Visual Library — GENERATED, do not edit by hand.\n" +
    "   Source of truth: the web app's own <script id=\"hnkLibWf\"> JSON in\n" +
    "   docs/app/index.html (items, featured, collections, workflows,\n" +
    "   groupOrder), copied byte-for-byte. Regenerate with:\n" +
    "     node tools/build_panel_lib_catalog.js\n" +
    "   test/verify_panel_catalog_sync.js pins this file to the app.\n" +
    "   ============================================================ */\n" +
    "(function(){\n\"use strict\";\n" + HEAD_MARK + json + TAIL_MARK + "\n" +
    "if (typeof module !== \"undefined\" && module.exports) module.exports = LW;\n" +
    "else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.LIB_WF = LW; globalThis.HNK_LIB_WF = LW; }\n})();\n";
}

module.exports = { OPEN, CLOSE, OUT, appLibText, panelLibText, validate, render };

if (require.main === module) {
  try {
    const json = appLibText(fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8"));
    const lw = validate(json);
    if (process.argv.includes("--print")) { process.stdout.write(json); process.exit(0); }
    fs.writeFileSync(OUT, render(json));
    console.log("wrote panel/js/hnk_library_compact_data.js —", lw.items.length, "items,",
      lw.featured.length, "featured,", Object.keys(lw.collections).length, "collections,",
      lw.workflows.length, "workflows,", json.length, "bytes of JSON");
  } catch (e) { console.error(String(e)); process.exit(1); }
}
