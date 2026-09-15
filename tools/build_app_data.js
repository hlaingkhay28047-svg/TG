#!/usr/bin/env node
/* ============================================================
   tools/build_app_data.js — the web app's data files (v6.91.0)

   1. Validates docs/app/data/libwf.js and hnkdata.js (one window.X=
      assignment around verbatim JSON) and whats-new-archive.json.
   2. Writes each file's content tag (SHA-256, 12 hex) into the shell's
      <script src="data/<file>?v=…"> so a changed file gets a new URL and
      an unchanged one is served by sw.js from DATA_CACHE without a network
      round trip. Idempotent: run it after editing a data file.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const A = require("./lib/app-data.js");

const INDEX = path.join(A.ROOT, "docs", "app", "index.html");
let html = fs.readFileSync(INDEX, "utf8");
const before = html;

for (const key of Object.keys(A.FILES)) {
  const spec = A.FILES[key];
  JSON.parse(A.jsonText(key));
  const tag = A.contentTag(key);
  const re = new RegExp('<script src="data/' + spec.file.replace(/\./g, "\\.") + '\\?v=[0-9a-f]+"><\\/script>');
  if (!re.test(html)) throw new Error("docs/app/index.html does not load data/" + spec.file);
  html = html.replace(re, '<script src="data/' + spec.file + '?v=' + tag + '"></script>');
  console.log("data/" + spec.file + " ?v=" + tag);
}
const archive = A.readWhatsNewArchive();
if (!Array.isArray(archive) || archive.some(r => !/^\d+\.\d+\.\d+$/.test(r.v || ""))) throw new Error("whats-new-archive.json is not a list of versioned rows");
console.log("whats-new-archive.json rows " + archive.length);

if (html !== before) { fs.writeFileSync(INDEX, html); console.log("index.html updated"); }
else console.log("index.html unchanged");
