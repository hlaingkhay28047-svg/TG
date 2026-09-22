/* ============================================================
   The web app's data files (v6.91.0, v6.92.0) — one reader for tools and tests.

   docs/app/data/libwf.js       window.HNK_LIBWF=<json>;    the Library catalog
   docs/app/data/hnkdata.js     window.HNK_DATA=<json>;     the studio tables
   docs/app/data/imagine.js     window.HNK_IMAGINE=<json>;  the Imagine tools,
                                                            templates and frame
   docs/app/data/album.js       window.HNK_ALBUM=<json>;    the Album page's
                                                            sizes, layout
                                                            templates and text
                                                            roles (v6.102.0)
   docs/app/data/trl-<code>.js  window.HNK_TRL=window.HNK_TRL||{};
                                window.HNK_TRL.<code>=<json>;
                                                            one native language
                                                            pack; the shell loads
                                                            only the chosen one
   docs/app/data/whatsnew.js    window.HNK_WHATS_NEW=<json>; the What's New strip
   docs/app/data/tutorials.js   window.HNK_TUTORIALS=<json>; the Tutorials hero + ten lessons (6.116.0)
   docs/app/data/trmore.js      window.HNK_TRMORE=<json>;   TR_V428 · TR_V430 · TR_PATH, the three
                                                            per-wave dictionaries the shell merges
                                                            into TR at boot (6.121.0); TR_X · TR_NEW ·
                                                            TR_L14 (x · new · l14) followed in 6.122.0
                                                            the app shows (v6.107.0)
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
  imagine: { file: "imagine.js", global: "HNK_IMAGINE", head: "window.HNK_IMAGINE=", tag: "script" },
  album: { file: "album.js", global: "HNK_ALBUM", head: "window.HNK_ALBUM=", tag: "script" },
  /* v6.107.0 — the What's New strip. The A4 ceiling in verify_app_data_files said, in so
     many words, that a third rise of the raw figure was not the answer and that WHATS_NEW
     was the obvious next table to move. It was 186 KB of the shell. */
  whatsnew: { file: "whatsnew.js", global: "HNK_WHATS_NEW", head: "window.HNK_WHATS_NEW=", tag: "script" },
  /* 6.116.0 — the Tutorials table (TUT_HERO + the ten lessons in nine languages). The A4
     ceiling ran out again by 4.8 KB when the compare-fit and the panes arrived; the note
     there says move a table out, not raise the number. 19 KB of the shell. */
  tutorials: { file: "tutorials.js", global: "HNK_TUTORIALS", head: "window.HNK_TUTORIALS=", tag: "script" },
  /* 6.121.0 — three per-wave TR dictionaries (TR_V428 · TR_V430 · TR_PATH, 105 KB of the shell)
     merged into TR at boot exactly as before. The A4 ceiling stood 440 bytes clear when the
     Smart Album designer arrived; the note there says move a table out, not raise the number.
     6.122.0 — the seven-language overlay TR_X, TR_NEW and the seven-language table TR_L14
     (sections x · new · l14, 99 KB) followed when wave G's shelf + ornaments pushed the shell
     50 KB over; the same merge lines read them from here. */
  trmore: { file: "trmore.js", global: "HNK_TRMORE", head: "window.HNK_TRMORE=", tag: "script" },
  /* 6.125.0 — NOT a table: the Album page's own module. Wave I's library, PSD reader, build dialog,
     standees, mockup, sheet background, marks and logo put the shell 149 KB over its A4 ceiling and
     every table that could leave it already had. The module is code, so it carries no assignment
     head and no JSON — it is validated by the two markers the panel lifter reads, and the shell
     loads it with a <script src> at exactly the point in the document where it used to sit. */
  albummod: { file: "album-module.js", global: "ALBUM", kind: "module", marks: ["/* ---- ALBUM_MODULE ---- */", "/* ---- /ALBUM_MODULE ---- */"], tag: "script" }
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
  if (spec && spec.kind === "module") throw new Error("docs/app/data/" + spec.file + " is a module, not a table — read it with moduleText()");
  const text = wrapperText(key);
  if (text.indexOf(spec.head) !== 0 || text.slice(-2) !== ";\n") {
    throw new Error("docs/app/data/" + spec.file + " is not a single " + spec.head + "<json>; assignment");
  }
  return text.slice(spec.head.length, -2);
}
/* 6.125.0 — the Album module's own text, between (and including) its two markers */
function moduleText(key) {
  const spec = FILES[key];
  if (!spec || spec.kind !== "module") throw new Error("no module named " + key);
  const text = wrapperText(key), a = text.indexOf(spec.marks[0]), b = text.indexOf(spec.marks[1]);
  if (a < 0 || b < a) throw new Error("docs/app/data/" + spec.file + " has lost its " + spec.marks[0] + " markers");
  return text.slice(a, b + spec.marks[1].length);
}
function albumModuleText() { return moduleText("albummod"); }
function libWfText() { return jsonText("libwf"); }
function hnkDataText() { return jsonText("hnkdata"); }
function imagineText() { return jsonText("imagine"); }
function albumText() { return jsonText("album"); }
function whatsNewText() { return jsonText("whatsnew"); }
function tutorialsText() { return jsonText("tutorials"); }
function trMoreText() { return jsonText("trmore"); }
function readLibWf() { return JSON.parse(libWfText()); }
function readHnkData() { return JSON.parse(hnkDataText()); }
function readImagine() { return JSON.parse(imagineText()); }
function readAlbum() { return JSON.parse(albumText()); }
function readWhatsNew() { return JSON.parse(whatsNewText()); }
function readTutorials() { return JSON.parse(tutorialsText()); }
function readTrMore() { return JSON.parse(trMoreText()); }
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

module.exports = { ROOT, DATA_DIR, FILES, TRL_CODES, wrapperText, jsonText, moduleText, albumModuleText, libWfText, hnkDataText, imagineText, albumText, whatsNewText, tutorialsText, trMoreText,
  readLibWf, readHnkData, readImagine, readAlbum, readWhatsNew, readTutorials, readTrMore, readTrlPack, readTrl, readWhatsNewArchive, contentTag, trlTags, trlTagsLine };
