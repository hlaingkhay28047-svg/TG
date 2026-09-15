/* test/lib/fake-fs.js — 6.95.0: the in-memory UXP data folder verify_panel_video_takes_persist (6.87.0) built for its
   panel walk, as a shared source string. Evaluated inside the page (addInitScript) it gives HNK.__uxpForTests a folder
   whose createFile really creates files, so the gallery and takes stores hold what a walk records. */
"use strict";
const FAKE_FS_SRC = `(function () {
  function mkFile(p, name, del) {
    var data = null;
    return { isFile: true, isFolder: false, name: name, nativePath: p,
      write: function (d) { data = (typeof d === "string") ? d : new Uint8Array(d); return Promise.resolve(); },
      read: function (o) {
        if (o && o.format === "binary") {
          if (data instanceof Uint8Array) return Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
          return Promise.resolve(new TextEncoder().encode(String(data || "")).buffer);
        }
        return Promise.resolve(typeof data === "string" ? data : new TextDecoder().decode(data || new Uint8Array()));
      },
      delete: function () { del(); return Promise.resolve(); },
      _data: function () { return data; } };
  }
  function mkFolder(p) {
    var ents = new Map();
    var F = { isFile: false, isFolder: true, name: p.split("/").pop(), nativePath: p, _ents: ents,
      getEntry: function (n) { return ents.has(n) ? Promise.resolve(ents.get(n)) : Promise.reject(new Error("ENOENT " + n)); },
      getEntries: function () { return Promise.resolve(Array.from(ents.values())); },
      createFolder: function (n) { var f = mkFolder(p + "/" + n); ents.set(n, f); return Promise.resolve(f); },
      createFile: function (n) { var f = ents.get(n); if (!f || !f.isFile) { f = mkFile(p + "/" + n, n, function () { ents.delete(n); }); ents.set(n, f); } return Promise.resolve(f); } };
    return F;
  }
  var root = mkFolder("/tmp/hnkdata");
  var uxp = { storage: { localFileSystem: { getDataFolder: function () { return Promise.resolve(root); } }, formats: { utf8: "utf8", binary: "binary" } } };
  return { root: root, uxp: uxp,
    names: function () { return Array.from(root._ents.keys()); },
    gallery: function () { var g = root._ents.get("gallery"); return g ? Array.from(g._ents.keys()) : []; },
    index: function () { var f = root._ents.get("hnk_video_takes.json"); return f ? f.read({ format: "utf8" }).then(function (s) { return JSON.parse(s); }) : Promise.resolve(null); } };
})()`;
module.exports = { FAKE_FS_SRC: FAKE_FS_SRC };
