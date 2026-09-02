/* ============================================================
   LIFT the web app's RH_T2I_MODELS into the panel.

   The panel's Text to Image page has to offer the models the web app
   offers — the same list, the same labels, the same order, the same
   ratio and size choices per model. Retyping that table is how the two
   surfaces drift, and inventing an endpoint is forbidden outright, so
   the table is EXTRACTED from docs/app/index.html and written to
   panel/js/hnk_t2i_models.js. test/verify_panel_t2i_catalog.js re-runs
   this extraction and fails when the committed file is no longer what
   the app produces.

   Only the fields the picker needs travel: the identity (id, label,
   apiPath) and what the UI must know to offer the right controls
   (ratios, ratioRequired, resolutionField, resolutionEnum, sizeField,
   sizeMap, whField, promptMax). The request body itself is built by the
   panel's own provider config, from its own doc-verified endpoints.

   Usage: node tools/build_panel_t2i_models.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "docs/app/index.html");
const OUT = path.join(ROOT, "panel/js/hnk_t2i_models.js");
const ANCHOR = "var RH_T2I_MODELS = [";

/* Comments first: the app's table is documented between its entries, and a
   comment carrying an unbalanced quote ("1".."8") desynchronised the scanner
   and merged two models into one. Strings are respected while stripping. */
function stripComments(src) {
  let out = "", i = 0, inStr = false, q = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") { out += src[++i] || ""; i++; continue; }
      if (c === q) inStr = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
    if (c === "/" && d === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === "/" && d === "/") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    out += c; i++;
  }
  return out;
}

/* the array's entries, split at depth 1 so a nested { } (nodeKeys, extra)
   never ends an entry early */
function entries(html) {
  const start = html.indexOf(ANCHOR);
  if (start < 0) throw new Error("RH_T2I_MODELS is no longer in the app — the anchor moved.");
  const body = stripComments(html.slice(start + ANCHOR.length));
  const out = [];
  let depth = 0, cur = "", inStr = false, q = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === "\\") { cur += body[++i]; continue; }
      if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; cur += c; continue; }
    if (c === "{") { depth++; cur += c; continue; }
    if (c === "}") {
      depth--; cur += c;
      if (depth === 0) { out.push(cur.trim()); cur = ""; }
      continue;
    }
    if (depth === 0 && c === "]") break;
    if (depth > 0) cur += c;
  }
  return out;
}

function str(src, key) {
  const m = new RegExp("\\b" + key + ':\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(src);
  return m ? JSON.parse('"' + m[1] + '"') : null;
}
function bool(src, key) { return new RegExp("\\b" + key + ":\\s*true").test(src); }
function num(src, key) {
  const m = new RegExp("\\b" + key + ":\\s*(\\d+)").exec(src);
  return m ? Number(m[1]) : null;
}
function list(src, key) {
  const m = new RegExp("\\b" + key + ":\\s*\\[([^\\]]*)\\]").exec(src);
  if (!m) return null;
  return m[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean)
    .map(function (s) { return JSON.parse(s.replace(/'/g, '"')); });
}

/* resolutionField is a STRING in the app ("resolution"/"size"); the picker
   only cares that the model honours size tiers, so it travels as written */
function appModels(html) {
  return entries(html).map(function (src) {
    const m = { id: str(src, "id"), label: str(src, "label"), apiPath: str(src, "apiPath") };
    const ratios = list(src, "ratios"); if (ratios) m.ratios = ratios;
    if (bool(src, "ratioRequired")) m.ratioRequired = true;
    const rf = str(src, "resolutionField"); if (rf) m.resolutionField = rf;
    const re = list(src, "resolutionEnum"); if (re) m.resolutionEnum = re;
    const sf = str(src, "sizeField"); if (sf) m.sizeField = sf;
    const sm = str(src, "sizeMap"); if (sm) m.sizeMap = sm;
    const wf = str(src, "whField"); if (wf) m.whField = wf;
    const pm = num(src, "promptMax"); if (pm) m.promptMax = pm;
    return m;
  });
}


/* THE PICKER'S RATIO LIST, as the app computes it. A model without its own
   "ratios" still offers a ratio picker: the app falls back to the key order
   of whichever size table drives it (wan-2.5's fixed sizes, wan-2.7's
   width/height table, qwen3's size map). Those key orders are lifted here
   too, so the panel never re-derives — or re-orders — the app's list. */
function mapKeys(html, name) {
  const m = new RegExp("var " + name + "\\s*=\\s*\\{([\\s\\S]*?)\\n?\\};").exec(html);
  if (!m) return [];
  const out = [];
  const re = /"([0-9]+:[0-9]+)"\s*:/g;
  let k;
  while ((k = re.exec(m[1]))) out.push(k[1]);
  return out;
}
function uiRatiosFor(m, maps) {
  if (m.ratios) return null;                     /* its own list already travels */
  if (m.sizeMap === "wan25") return maps.wan25;
  if (m.whField) return maps.wanWh;
  if (m.sizeField) return maps.qwen3;
  return null;
}

function render(models) {
  const rows = models.map(function (m) {
    const parts = ['id:' + JSON.stringify(m.id), 'label:' + JSON.stringify(m.label), 'apiPath:' + JSON.stringify(m.apiPath)];
    ["ratios", "uiRatios", "ratioRequired", "resolutionField", "resolutionEnum", "sizeField", "sizeMap", "whField", "promptMax"]
      .forEach(function (k) { if (m[k] !== undefined) parts.push(k + ":" + JSON.stringify(m[k])); });
    return "  { " + parts.join(", ") + " },";
  });
  return [
    "/* ============================================================",
    "   HNK text-to-image model catalog — LIFTED, do not edit by hand.",
    "   Source of truth: the web app's own RH_T2I_MODELS table",
    "   (docs/app/index.html), extracted by tools/build_panel_t2i_models.js",
    "   so the panel's Text to Image page offers the same models, in the",
    "   same order, with the same ratio and size choices — and never",
    "   invents an endpoint. test/verify_panel_t2i_catalog.js pins this",
    "   file to the app.",
    "   ============================================================ */",
    "(function () {",
    '"use strict";',
    "var RH_T2I_MODELS = ["
  ].concat(rows).concat([
    "];",
    'if (typeof module !== "undefined" && module.exports) module.exports = RH_T2I_MODELS;',
    "else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.t2iModels = RH_T2I_MODELS; }",
    "})();",
    ""
  ]).join("\n");
}

function panelModels(src) {
  const start = src.indexOf("var RH_T2I_MODELS = [");
  if (start < 0) return null;
  const end = src.indexOf("\n];", start);
  return src.slice(start, end + 3);
}

function generate() {
  const html = fs.readFileSync(APP, "utf8");
  const models = appModels(html);
  const maps = {
    wan25: mapKeys(html, "RH_WAN25T_SIZE"),
    wanWh: mapKeys(html, "RH_WAN_RATIO_WH"),
    qwen3: mapKeys(html, "RH_QWEN3_T2I_SIZE_MAP")
  };
  models.forEach(function (m) {
    const ui = uiRatiosFor(m, maps);
    if (ui && ui.length) m.uiRatios = ui;
  });
  const text = render(models);
  return { text: text, models: models };
}

if (require.main === module) {
  const out = generate();
  fs.writeFileSync(OUT, out.text);
  console.log("wrote " + path.relative(ROOT, OUT) + " — " + out.models.length + " models");
}

module.exports = { generate: generate, appModels: appModels, panelModels: panelModels, render: render, OUT: OUT };
