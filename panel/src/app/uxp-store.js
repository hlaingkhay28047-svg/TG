/* ============================================================
   HNK AI Tools — Persistence Store
   Spec §26 (Reload plugin → draft/settings restored)

   A key/value store ({ get, set }) that the history / preset / settings /
   draft services persist through. All keys live in ONE JSON blob so a single
   read/write round-trips everything (mirrors the classic panel's single
   settings file). I/O is delegated to an injected `io` ({ load(): object,
   save(object) }) so the pure store logic is unit-testable; the UXP data-folder
   io is provided by the bootstrap.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* io: { load(): object|null, save(object): void }  (both may be sync;
   load errors are swallowed to an empty store so a corrupt file never bricks
   the panel). */
function create(io) {
  var cache = null;

  function _ensure() {
    if (cache) return cache;
    var loaded = null;
    try { loaded = io && io.load ? io.load() : null; } catch (e) { loaded = null; }
    cache = (loaded && typeof loaded === "object") ? loaded : {};
    return cache;
  }
  function _persist() {
    try { if (io && io.save) io.save(cache); } catch (e) {}
  }

  function get(key) {
    var c = _ensure();
    return Object.prototype.hasOwnProperty.call(c, key) ? c[key] : undefined;
  }
  function set(key, value) {
    var c = _ensure();
    c[key] = value;
    _persist();
    return value;
  }
  function remove(key) {
    var c = _ensure();
    if (Object.prototype.hasOwnProperty.call(c, key)) { delete c[key]; _persist(); }
  }
  function all() { return _ensure(); }

  return { get: get, set: set, remove: remove, all: all };
}

/* Build a UXP data-folder io backed by a single JSON file. Async UXP FS is
   wrapped behind a synchronous cache: the file is read once at boot (await
   preload()) and writes are fire-and-forget. Returns { io, preload }. */
function uxpFileIo(uxpLfs, filename) {
  filename = filename || "hnk_ai_tools.json";
  var mem = {};
  var ready = false;

  async function preload() {
    try {
      var folder = await uxpLfs.getDataFolder();
      var entry;
      try { entry = await folder.getEntry(filename); } catch (e) { entry = null; }
      if (entry) {
        var text = await entry.read();
        var parsed = JSON.parse(text || "{}");
        if (parsed && typeof parsed === "object") mem = parsed;
      }
    } catch (e) { /* first run / unreadable → empty */ }
    ready = true;
    return mem;
  }

  var io = {
    load: function () { return mem; },
    save: function (obj) {
      mem = obj || {};
      if (!ready) return; // don't clobber the file before preload finished
      // fire-and-forget async write
      (async function () {
        try {
          var folder = await uxpLfs.getDataFolder();
          var file = await folder.createFile(filename, { overwrite: true });
          await file.write(JSON.stringify(mem));
        } catch (e) {}
      })();
    }
  };
  return { io: io, preload: preload };
}

var API = { create: create, uxpFileIo: uxpFileIo };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.uxpStore = API; }
})();
