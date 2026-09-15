/* ============================================================
   The web app's data files (v6.91.0, v6.92.0) — one reader for tools and tests.

   docs/app/data/libwf.js       window.HNK_LIBWF=<json>;    the Library catalog
   docs/app/data/hnkdata.js     window.HNK_DATA=<json>;     the studio tables
   docs/app/data/imagine.js     window.HNK_IMAGINE=<json>;  the Imagine tools,
                                                            templates and frame
   docs/app/data/trl-<code>.js  window.HNK_TRL=window.HNK_TRL||{};
                                window.HNK_TRL.<code>=<json>;
                                                            one native language
                                                            pack; the shell loads
                                                            only the chosen one
   docs/app/data/whats-new-archive.json                    What's New rows older
                                                            than the strip's cut
   Each .js file is a fixed assignment head wrapped around verbatim JSON, so
   the JSON text can be sliced out byte-for-byte (the panel's lifted catalog
   and Imagine module are pinned to it) and the browser can load it with a
   plain <script src>.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "docs", "app", "data");
/* the eighteen native packs (v4.43 → v4.77), in the order the shell listed them */
const TRL_CODES = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur", "tdd", "kht", "khb"];
const FILES = {
  libwf: { file: "libwf.js", global: "HNK_LIBWF", head: "window.HNK_LIBWF=", tag: "script" },
  hnkdata: { file: "hnkdata.js", global: "HNK_DATA", head: "window.HNK_DATA=", tag: "script" },
  imagine: { file: "imagine.js", global: "HNK_IMAGINE", head: "window.HNK_IMAGINE=", tag: "script" }
};
TRL_CODES.forEach(function (c) {
  FILES["trl-" + c] = { file: "trl-" + c + ".js", global: "HNK_TRL", code: c, head: "window.HNK_TRL=window.HNK_TRL||{};window.HNK_TRL." + c + "=", tag: "loader" };
});

function wrapperText(key) {
  const spec = FILES[key];
  if (!spec) throw new Error("unknown data file " + key);
  return fs.readFileSync(path.join(DATA_DIR, spec.file), "utf8");
}
/* the verbatim JSON between the assignment head and the trailing ";\n" */
function jsonText(key) {
  const spec = FILES[key];
  const text = wrapperText(key);
  if (text.indexOf(spec.head) !== 0 || text.slice(-2) !== ";\n") {
    throw new Error("docs/app/data/" + spec.file + " is not a single " + spec.head + "<json>; assignment");
  }
  return text.slice(spec.head.length, -2);
}
function libWfText() { return jsonText("libwf"); }
function hnkDataText() { return jsonText("hnkdata"); }
function imagineText() { return jsonText("imagine"); }
function readLibWf() { return JSON.parse(libWfText()); }
function readHnkData() { return JSON.parse(hnkDataText()); }
function readImagine() { return JSON.parse(imagineText()); }
function readTrlPack(code) {
  if (TRL_CODES.indexOf(code) < 0) throw new Error("no native pack for " + code);
  return JSON.parse(jsonText("trl-" + code));
}
/* every pack, keyed by code — what a page holds once the tests or the studio lifter load all eighteen */
function readTrl() {
  const out = {};
  TRL_CODES.forEach(function (c) { out[c] = readTrlPack(c); });
  return out;
}
function readWhatsNewArchive() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "whats-new-archive.json"), "utf8"));
}
/* the content tag the shell carries in its <script src="data/<file>?v=…"> and in the pack loader's table */
function contentTag(key) {
  return crypto.createHash("sha256").update(wrapperText(key), "utf8").digest("hex").slice(0, 12);
}
function trlTags() {
  const out = {};
  TRL_CODES.forEach(function (c) { out[c] = contentTag("trl-" + c); });
  return out;
}
/* the table the shell's loader carries, as the shell prints it */
function trlTagsLine() { return "window.HNK_TRL_TAGS=" + JSON.stringify(trlTags()) + ";"; }

module.exports = { ROOT, DATA_DIR, FILES, TRL_CODES, wrapperText, jsonText, libWfText, hnkDataText, imagineText,
  readLibWf, readHnkData, readImagine, readTrlPack, readTrl, readWhatsNewArchive, contentTag, trlTags, trlTagsLine };
