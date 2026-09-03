/* ============================================================
   HNK — the Gallery store (v6.46.0)

   The web app keeps every result it makes and shows them in Library ▸
   Gallery, where a studio can pick some out, save them and throw the rest
   away. The panel kept nothing: a result went into the document as a layer
   and, once that document was closed without saving, it was gone.

   So the panel keeps them too, the only way a Photoshop plugin can: as files
   in its own data folder. Writing is fire-and-forget and never fails a
   generate — a studio that cannot spare the disk still gets its layer.
   ============================================================ */
(function () {
"use strict";

var FOLDER = "gallery";
/* v6.57.0 — NOTHING IS DELETED TO MAKE ROOM (owner instruction: keep it
   until I delete it). This used to drop everything past the newest 200, the
   same way the web app dropped everything past 60, and for the same reason:
   room nobody asked us for. A studio that shot a wedding and came back on
   Monday could find the first hour of it gone. The count is reported, and
   the studio's own delete is the only thing that removes a file. */
var MAX = 0;     /* 0 = no ceiling; kept as a field so callers still read it */

function _uxp() { return (typeof require === "function") ? require("uxp") : null; }

async function _folder(create) {
  var uxp = _uxp();
  if (!uxp) return null;
  var data = await uxp.storage.localFileSystem.getDataFolder();
  try { return await data.getEntry(FOLDER); }
  catch (e) {
    if (!create) return null;
    try { return await data.createFolder(FOLDER); } catch (e2) { return null; }
  }
}

/* b64 without the data: prefix. Returns the file name, or "" on any failure. */
async function save(b64, ext, label) {
  try {
    if (!b64) return "";
    var uxp = _uxp();
    var dir = await _folder(true);
    if (!dir) return "";
    var name = String(label || "hnk").replace(/[^a-z0-9-]+/gi, "-").slice(0, 24) +
      "-" + Date.now() + "." + (ext || "png");
    var f = await dir.createFile(name, { overwrite: true });
    var bin = (globalThis.HNK && globalThis.HNK.b64ToBuf) ? globalThis.HNK.b64ToBuf(b64) : null;
    if (!bin) return "";
    await f.write(bin, { format: uxp.storage.formats.binary });
    await trim();
    return name;
  } catch (e) { return ""; }
}

async function list() {
  try {
    var dir = await _folder(false);
    if (!dir) return [];
    var all = await dir.getEntries();
    var files = all.filter(function (e) { return e && e.isFile; });
    files.sort(function (a, b) { return String(b.name).localeCompare(String(a.name)); });
    return files;
  } catch (e) { return []; }
}

/* Kept as a no-op rather than deleted, so every existing caller keeps its
   shape and nothing has to remember not to call it. */
async function trim() { /* v6.57.0 — see MAX: results are the studio's until they delete them */ }

async function remove(name) {
  try {
    var files = await list();
    for (var i = 0; i < files.length; i++) {
      if (files[i].name === name) { await files[i].delete(); return true; }
    }
  } catch (e) { }
  return false;
}

async function clear() {
  try {
    var files = await list();
    for (var i = 0; i < files.length; i++) { try { await files[i].delete(); } catch (e) { } }
    return true;
  } catch (e) { return false; }
}

var API = { save: save, list: list, remove: remove, clear: clear, MAX: MAX };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.galleryStore = API; }
})();
