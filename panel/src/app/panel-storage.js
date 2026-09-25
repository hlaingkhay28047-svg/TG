/* ============================================================
   HNK — what the panel keeps on the studio's disk (v6.135.0)

   The owner, 2026-09-25: "Ccx မှာ စက်မလေးအောင် history တွေကို ဖျက်လို့ရအောင်
   လုပ်ပေးပါ" — make the histories deletable so the machine does not get heavy.

   Every one of them already HAD a delete. What the panel never had was a place
   that says how much disk is in use, so a studio could not tell there was
   anything to delete — and one store had no delete at all:

     gallery/<wf>-<ts>.png     every result, for ever. The ceiling was removed in
                               6.57.0 on the owner's own instruction ("keep it
                               until I delete it"), which is right — but nothing
                               ever said how much "for ever" had come to.
     gallery/<page>-<ts>.mp4   the video takes' copies, 12 per page.
     album/*.json              an album record carries its photographs as data
                               URLs at 2,400 (Standard) or 4,000 (Print) pixels;
                               the shelf holds up to 24 albums.
     hnk_ff_web_<ts>.<ext>     THE LEAK. loadUrlIntoAnySlot writes one of these
                               for every web picture Photoshop has to convert,
                               and NOTHING has ever deleted one. A studio that
                               loaded fifty links carries fifty files it cannot
                               see and cannot remove.
     hnk_capture.jpg           one-shot scratch, overwritten in place.
     hnk_result.<ext>          same.
     hnk_album.psd             same.
     hnk_*.json                the settings and the takes index; kilobytes.

   measure() reports every row with a real byte count, sweepTemps() closes the
   leak, and clear(kind) empties one row. Nothing here deletes a result unless
   the caller asks for that row by name, and the caller's keep() predicate (the
   Gallery's ★) is honoured on every pass.

   Pure of main.js: the host comes from require("uxp") or HNK.__uxpForTests,
   exactly as the gallery and takes stores take theirs.
   ============================================================ */
(function () {
"use strict";

var GALLERY = "gallery";
var ALBUM = "album";
var KEEP_FILE = "_keep.json";              /* the Gallery's own ★ list, not a result */
var TEMP_WEB = /^hnk_ff_web_\d+\.[a-z0-9]+$/i;
var TEMP_ONE = /^hnk_(capture\.jpg|result\.[a-z0-9]+|album\.psd)$/i;
var VIDEO = /\.(mp4|mov|m4v|webm)$/i;
var SETTINGS = /^hnk_[a-z0-9_]+\.json$/i;  /* hnk_students_settings · hnk_ai_tools · hnk_local_storage · hnk_video_takes */

/* the rows, in the order the card shows them */
var KINDS = ["results", "videos", "albums", "temps", "settings"];

function _uxp() {
  try { var h = globalThis.HNK && globalThis.HNK.__uxpForTests; if (h) return h; } catch (e) { }
  try { return (typeof require === "function") ? require("uxp") : null; } catch (e2) { return null; }
}
async function _root() {
  var u = _uxp(); if (!u) return null;
  try { return await u.storage.localFileSystem.getDataFolder(); } catch (e) { return null; }
}
async function _sub(root, name) {
  if (!root) return null;
  try { var e = await root.getEntry(name); return (e && e.isFolder) ? e : null; } catch (e2) { return null; }
}
async function _entries(dir) {
  if (!dir || typeof dir.getEntries !== "function") return [];
  try { var all = await dir.getEntries(); return (all || []).filter(function (e) { return e && e.isFile; }); }
  catch (e) { return []; }
}
/* a file's size: getMetadata().size where the host has it, the entry's own .size
   otherwise, and 0 when neither answers — never a guess from the name */
async function _size(f) {
  try {
    if (f && typeof f.getMetadata === "function") {
      var m = await f.getMetadata();
      var n = Number(m && m.size);
      if (isFinite(n) && n >= 0) return n;
    }
  } catch (e) { }
  var s = Number(f && f.size);
  return (isFinite(s) && s >= 0) ? s : 0;
}
function _row() { return { n: 0, bytes: 0 }; }
function _add(row, bytes) { row.n++; row.bytes += bytes || 0; }

/* "1.4 MB" · "820 KB" · "0" — one decimal past a megabyte, whole kilobytes below
   it, and a plain 0 for nothing, so the card never reads "0.0 MB" */
function fmt(bytes) {
  var b = Number(bytes) || 0;
  if (b <= 0) return "0";
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}

/* measure() — every row, with counts and bytes. Never throws: a host that
   refuses the data folder reports ok:false and zeroes, and the card says so. */
async function measure() {
  var out = { ok: false, err: "", total: _row() };
  KINDS.forEach(function (k) { out[k] = _row(); });
  var root = await _root();
  if (!root) { out.err = "no data folder"; return out; }
  out.ok = true;
  try {
    var top = await _entries(root);
    for (var i = 0; i < top.length; i++) {
      var f = top[i], name = String(f.name || ""), sz = await _size(f);
      if (TEMP_WEB.test(name) || TEMP_ONE.test(name)) _add(out.temps, sz);
      else if (SETTINGS.test(name)) _add(out.settings, sz);
      /* anything else in the root is not ours to count or offer to delete */
    }
    var gdir = await _sub(root, GALLERY);
    var gs = await _entries(gdir);
    for (var j = 0; j < gs.length; j++) {
      var gf = gs[j], gn = String(gf.name || "");
      if (gn === KEEP_FILE) continue;                 /* the ★ list is bookkeeping, not a result */
      var gsz = await _size(gf);
      if (VIDEO.test(gn)) _add(out.videos, gsz); else _add(out.results, gsz);
    }
    var adir = await _sub(root, ALBUM);
    var as = await _entries(adir);
    for (var k2 = 0; k2 < as.length; k2++) _add(out.albums, await _size(as[k2]));
  } catch (e) {
    out.err = (e && e.message) ? String(e.message).slice(0, 120) : "read failed";
  }
  KINDS.forEach(function (k) { out.total.n += out[k].n; out.total.bytes += out[k].bytes; });
  return out;
}

/* sweepTemps() — the leak, closed. Deletes every hnk_ff_web_* file, optionally
   sparing one the caller is still using, and reports what went. The one-shot
   scratch files (capture / result / album psd) are deleted too: each is
   overwritten on its next use, so removing one costs nothing but the megabytes
   it was holding. */
async function sweepTemps(keepName) {
  var out = { n: 0, bytes: 0, ok: false };
  var root = await _root();
  if (!root) return out;
  out.ok = true;
  var top = await _entries(root);
  for (var i = 0; i < top.length; i++) {
    var f = top[i], name = String(f.name || "");
    if (keepName && name === keepName) continue;
    if (!TEMP_WEB.test(name) && !TEMP_ONE.test(name)) continue;
    var sz = await _size(f);
    try { await f.delete(); out.n++; out.bytes += sz; } catch (e) { }
  }
  return out;
}

/* clear(kind, opts) — one row, emptied.
     results  every gallery picture EXCEPT the ones opts.keep(name) marks ★
     videos   every gallery clip (opts.keep honoured the same way)
     albums   every album record
     temps    sweepTemps()
   settings is never offered: deleting it would sign the studio out and throw
   away their key, which is not housekeeping. */
async function clear(kind, opts) {
  opts = opts || {};
  var keep = (typeof opts.keep === "function") ? opts.keep : function () { return false; };
  if (kind === "temps") return sweepTemps(opts.keepName);
  var out = { n: 0, bytes: 0, kept: 0, ok: false, err: "" };
  /* a row this function does not own is refused by name, never reported as an
     empty success — "settings" lands here, and so does a typo */
  if (kind !== "results" && kind !== "videos" && kind !== "albums") { out.err = "not a deletable row: " + String(kind); return out; }
  var root = await _root();
  if (!root) { out.err = "no data folder"; return out; }
  out.ok = true;
  var dir = null, wantVideo = false, both = false;
  if (kind === "results") { dir = await _sub(root, GALLERY); wantVideo = false; }
  else if (kind === "videos") { dir = await _sub(root, GALLERY); wantVideo = true; }
  else { dir = await _sub(root, ALBUM); both = true; }
  var fs = await _entries(dir);
  for (var i = 0; i < fs.length; i++) {
    var f = fs[i], name = String(f.name || "");
    if (name === KEEP_FILE) continue;
    if (!both && VIDEO.test(name) !== wantVideo) continue;
    if (keep(name)) { out.kept++; continue; }
    var sz = await _size(f);
    try { await f.delete(); out.n++; out.bytes += sz; } catch (e) { }
  }
  return out;
}

var API = { KINDS: KINDS, TEMP_WEB: TEMP_WEB, TEMP_ONE: TEMP_ONE, VIDEO: VIDEO,
  fmt: fmt, measure: measure, sweepTemps: sweepTemps, clear: clear };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.panelStorage = API; }
})();
