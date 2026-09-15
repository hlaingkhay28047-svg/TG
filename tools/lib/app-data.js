/* ============================================================
   The web app's data files (v6.91.0) — one reader for tools and tests.

   docs/app/data/libwf.js     window.HNK_LIBWF=<json>;   the Library catalog
   docs/app/data/hnkdata.js   window.HNK_DATA=<json>;    the studio tables
   docs/app/data/whats-new-archive.json                  What's New rows older
                                                         than the strip's cut
   Each .js file is a single assignment wrapped around verbatim JSON, so the
   JSON text can be sliced out byte-for-byte (the panel's lifted catalog is
   pinned to it) and the browser can load it with a plain <script src>.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "docs", "app", "data");
const FILES = {
  libwf: { file: "libwf.js", global: "HNK_LIBWF" },
  hnkdata: { file: "hnkdata.js", global: "HNK_DATA" }
};

function wrapperText(key) {
  const spec = FILES[key];
  if (!spec) throw new Error("unknown data file " + key);
  return fs.readFileSync(path.join(DATA_DIR, spec.file), "utf8");
}
/* the verbatim JSON between the assignment and the trailing ";\n" */
function jsonText(key) {
  const spec = FILES[key];
  const text = wrapperText(key);
  const head = "window." + spec.global + "=";
  if (text.indexOf(head) !== 0 || text.slice(-2) !== ";\n") {
    throw new Error("docs/app/data/" + spec.file + " is not a single window." + spec.global + "= assignment");
  }
  return text.slice(head.length, -2);
}
function libWfText() { return jsonText("libwf"); }
function hnkDataText() { return jsonText("hnkdata"); }
function readLibWf() { return JSON.parse(libWfText()); }
function readHnkData() { return JSON.parse(hnkDataText()); }
function readWhatsNewArchive() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "whats-new-archive.json"), "utf8"));
}
/* the content tag the shell carries in its <script src="data/<file>?v=…"> */
function contentTag(key) {
  return crypto.createHash("sha256").update(wrapperText(key), "utf8").digest("hex").slice(0, 12);
}

module.exports = { ROOT, DATA_DIR, FILES, wrapperText, jsonText, libWfText, hnkDataText, readLibWf, readHnkData, readWhatsNewArchive, contentTag };
