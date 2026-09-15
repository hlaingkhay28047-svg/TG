#!/usr/bin/env node
/* ============================================================
   tools/build_app_data.js — the web app's data files (v6.91.0, v6.92.0)

   1. Validates every file under docs/app/data (one fixed assignment head
      around verbatim JSON; whats-new-archive.json a list of versioned rows).
   2. Writes each file's content tag (SHA-256, 12 hex) into the shell — the
      <script src="data/<file>?v=…"> for libwf, hnkdata and imagine, and the
      window.HNK_TRL_TAGS={…} table the pack loader reads for the eighteen
      language packs — so a changed file gets a new URL and an unchanged one
      is served by sw.js from DATA_CACHE without a network round trip.
      Idempotent: run it after editing a data file.
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
  if (spec.tag !== "script") continue;
  const tag = A.contentTag(key);
  const re = new RegExp('<script src="data/' + spec.file.replace(/\./g, "\\.") + '\\?v=[0-9a-f]+"><\\/script>');
  if (!re.test(html)) throw new Error("docs/app/index.html does not load data/" + spec.file);
  html = html.replace(re, '<script src="data/' + spec.file + '?v=' + tag + '"></script>');
  console.log("data/" + spec.file + " ?v=" + tag);
}
const tagsRe = /window\.HNK_TRL_TAGS=\{[^}]*\};/;
if (!tagsRe.test(html)) throw new Error("docs/app/index.html carries no window.HNK_TRL_TAGS table (the pack loader)");
html = html.replace(tagsRe, A.trlTagsLine());
console.log("packs " + A.TRL_CODES.length + ": " + A.TRL_CODES.map(c => c + "=" + A.contentTag("trl-" + c)).join(" "));
const archive = A.readWhatsNewArchive();
if (!Array.isArray(archive) || archive.some(r => !/^\d+\.\d+\.\d+$/.test(r.v || ""))) throw new Error("whats-new-archive.json is not a list of versioned rows");
console.log("whats-new-archive.json rows " + archive.length);

if (html !== before) { fs.writeFileSync(INDEX, html); console.log("index.html updated"); }
else console.log("index.html unchanged");
