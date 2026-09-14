/* ============================================================
   HNK — the video takes store (v6.87.0)

   Every video page (Video · V→V · Talking Photo · Upscale) kept its takes in
   memory only, while its own words promised "they stay until you delete
   them" — a panel reload emptied the strips, and RunningHub's result links
   die after 24 hours. The web app keeps a Video take in its Gallery; the
   panel keeps them the only way a Photoshop plugin can: as files in its own
   data folder (the gallery folder, next to the pictures) plus one small
   index, hnk_video_takes.json, that remembers where each take came from.

   record(entry)  writes the bytes as <page>-<ts>.mp4 through the gallery
                  store, adds the record (newest first), caps CAP per page
                  (the oldest beyond it loses its copy too) and rewrites the
                  index. Writing is best-effort: a take without a copy still
                  lands in the strip for this session.
   load()         reads the index once (boot); list(page) the records.
   remove(id) / forgetFile(name) / clear(page)  drop records (and copies).
   readDataUrl(entry)  the saved bytes back, for Download again after a
                  reload, when the in-memory `ref` is gone.
   galleryPath()  the folder the copies live in, for "Open the folder".
   ============================================================ */
(function () {
"use strict";

var FILE = "hnk_video_takes.json";
var CAP = 12;
var PAGES = ["video", "v2v", "talk", "upscale"];
var _list = [];
var _loaded = false;

function _uxp() {
  try { var h = globalThis.HNK && globalThis.HNK.__uxpForTests; if (h) return h; } catch (e) { }
  try { return (typeof require === "function") ? require("uxp") : null; } catch (e2) { return null; }
}
function _gs() { return (globalThis.HNK && globalThis.HNK.galleryStore) || null; }
async function _dataFolder() {
  var u = _uxp(); if (!u) return null;
  try { return await u.storage.localFileSystem.getDataFolder(); } catch (e) { return null; }
}
function _norm(e) {
  e = e || {};
  var ts = Number(e.ts) || Date.now();
  var page = PAGES.indexOf(e.page) >= 0 ? e.page : "video";
  return {
    id: String(e.id || (page + "-" + ts)),
    page: page,
    url: String(e.url || ""),
    name: String(e.name || ""),
    folder: String(e.folder || ""),
    folderPath: String(e.folderPath || ""),
    galleryFile: String(e.galleryFile || ""),
    tool: String(e.tool || ""),
    resolution: String(e.resolution || ""),
    duration: String(e.duration || ""),
    prompt: String(e.prompt || "").slice(0, 120),
    ts: ts
  };
}
async function _write() {
  try {
    var u = _uxp(); var d = await _dataFolder(); if (!u || !d) return false;
    var f = await d.createFile(FILE, { overwrite: true });
    await f.write(JSON.stringify({ v: 1, takes: _list }), { format: u.storage.formats.utf8 });
    return true;
  } catch (e) { return false; }
}
async function load() {
  if (_loaded) return _list.slice();
  _loaded = true;
  try {
    var u = _uxp(); var d = await _dataFolder(); if (!u || !d) return [];
    var f = await d.getEntry(FILE); if (!f || typeof f.read !== "function") return [];
    var o = JSON.parse(await f.read({ format: u.storage.formats.utf8 }));
    var arr = (o && Array.isArray(o.takes)) ? o.takes : [];
    _list = arr.filter(function (e) { return e && typeof e === "object" && PAGES.indexOf(e.page) >= 0; }).map(_norm);
  } catch (e) { _list = []; }
  return _list.slice();
}
async function _dropCopy(e) {
  var gs = _gs();
  if (e && e.galleryFile && gs) { try { await gs.remove(e.galleryFile); } catch (x) { } }
}
async function record(e) {
  var entry = _norm(e);
  var raw = e && e.ref ? String(e.ref) : "";
  var b64 = raw ? (raw.indexOf("data:") === 0 ? raw.split(",")[1] : raw) : "";
  var gs = _gs();
  if (b64 && gs) { try { entry.galleryFile = (await gs.save(b64, "mp4", entry.page)) || ""; } catch (x) { entry.galleryFile = ""; } }
  _list.unshift(entry);
  var n = 0;
  for (var i = 0; i < _list.length; i++) {
    if (_list[i].page !== entry.page) continue;
    n++;
    if (n > CAP) { var old = _list.splice(i, 1)[0]; i--; await _dropCopy(old); }
  }
  await _write();
  return entry;
}
function list(page) { return _list.filter(function (e) { return !page || e.page === page; }); }
async function remove(id) {
  for (var i = 0; i < _list.length; i++) {
    if (_list[i].id !== id) continue;
    var gone = _list.splice(i, 1)[0];
    await _dropCopy(gone);
    await _write();
    return true;
  }
  return false;
}
/* the copy was deleted from the Gallery page itself — drop the record only */
async function forgetFile(name) {
  var before = _list.length;
  _list = _list.filter(function (e) { return e.galleryFile !== name; });
  if (_list.length !== before) await _write();
  return before - _list.length;
}
async function clear(page) {
  var keep = [], drop = [];
  _list.forEach(function (e) { ((!page || e.page === page) ? drop : keep).push(e); });
  _list = keep;
  for (var i = 0; i < drop.length; i++) await _dropCopy(drop[i]);
  await _write();
  return drop.length;
}
async function readDataUrl(entry) {
  var gs = _gs();
  if (!entry || !entry.galleryFile || !gs || typeof gs.readDataUrl !== "function") return "";
  try { return (await gs.readDataUrl(entry.galleryFile)) || ""; } catch (e) { return ""; }
}
async function galleryPath() {
  var d = await _dataFolder();
  var p = d && d.nativePath ? String(d.nativePath) : "";
  if (!p) return "";
  return p + (p.indexOf("\\") >= 0 ? "\\" : "/") + "gallery";
}
function _reset() { _list = []; _loaded = false; }

var API = { load: load, record: record, list: list, remove: remove, forgetFile: forgetFile, clear: clear,
  readDataUrl: readDataUrl, galleryPath: galleryPath, CAP: CAP, FILE: FILE, PAGES: PAGES, _reset: _reset };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.takesStore = API; }
})();
