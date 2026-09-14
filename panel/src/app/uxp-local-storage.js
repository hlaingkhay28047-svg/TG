/* ============================================================
   HNK Photoshop Panel — Web Storage where the host has none (v6.77.0 / panel 6.148.0)

   WHY THIS FILE EXISTS. The owner's photographs of 6.145.0 proved that the
   panel has no working localStorage in Photoshop: every What's New dismissal
   was forgotten at relaunch, and 6.75.0 moved that one list into the panel's
   settings file. But that was ONE of forty-one places the panel writes to
   localStorage. The other forty are the web app's own code, lifted into the
   panel by the build tools — Retouch A/B's recipes (save · pin · default),
   the watermark logo (Pick logo → "Stamp logo"), the Styles 880 favourites
   and recents, the Library's ★ favourites, the Smart Workflow favourites,
   Imagine's saved photos and the studio's UI mode. Every one of them is
   wrapped in try/catch, so in Photoshop each one failed in silence: the
   control drew, the tap landed, and nothing was kept. "Pick logo" then
   "Stamp logo" answered "Add a logo image first" forever.

   THE FIX IS ONE SHIM, NOT FORTY EDITS. This script runs first. If the host's
   own localStorage round-trips a value it does nothing at all — a browser,
   and the Chromium the tests drive, keep their real storage and every
   existing test keeps its meaning. If localStorage is absent or throws, the
   shim installs a Storage-shaped object over the plugin's data folder
   (hnk_local_storage.json, beside the two settings files), and the forty
   call sites work unchanged because they only ever asked for getItem/setItem.

   HOW IT BEHAVES. Synchronous, like the real thing: reads and writes hit an
   in-memory map; the file is read once at load (HNK.localStore.ready) and
   written 150ms after the last change. A value read BEFORE the file has
   loaded is a miss, so the file is merged UNDER whatever was written in the
   meantime — nothing from the previous session is lost to an early write.
   A single value past 4,000,000 characters, or a store past 12,000,000, is
   refused with a QuotaExceededError like a browser would.
   ============================================================ */
(function () {
  "use strict";
  var G = (typeof globalThis !== "undefined") ? globalThis : window;
  G.HNK = G.HNK || {};
  var FILE = "hnk_local_storage.json";
  var VALUE_CAP = 4000000, TOTAL_CAP = 12000000, WRITE_GAP_MS = 150;

  function nativeOk() {
    try {
      var ls = G.localStorage;
      if (!ls || typeof ls.getItem !== "function" || typeof ls.setItem !== "function") return false;
      var k = "__hnk_ls_probe__";
      ls.setItem(k, "1");
      var ok = ls.getItem(k) === "1";
      ls.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }

  /* The real Photoshop host is recognised by the version string its API
     carries (the test harness's stub carries none). There the shim ALWAYS
     stands in: a storage that round-trips within a session but is wiped
     at relaunch would pass the probe above and still forget everything,
     and the owner's photographs cannot tell those two hosts apart. What
     native answered is kept on HNK.localStore.nativeOk for the SELF-TEST row. */
  var native = nativeOk();
  /* v6.79.0 — TWO SIGNALS, AND A SECOND CHANCE. The owner's SELF-TEST on
     6.149.0 read "Storage · native localStorage" in real Photoshop: the one
     signal above (app.version) had not answered when this first script ran,
     so the forty-one call sites went to the host's own storage after all.
     The host's uxp module names itself too, and main.js — certain of the
     host by the time it boots — can call HNK.localStore.adopt() to install
     the shim late, carrying every key already written across. */
  function realHostNow() {
    try { var psm = (typeof require === "function") ? require("photoshop") : null; if (psm && psm.app && typeof psm.app.version === "string" && psm.app.version) return true; } catch (e) { }
    try { var ux = (typeof require === "function") ? require("uxp") : null; if (ux && ux.host && typeof ux.host.name === "string" && /photoshop/i.test(ux.host.name)) return true; } catch (e2) { }
    return false;
  }
  var realHost = realHostNow();
  if (native && !realHost) {
    G.HNK.localStore = { shimmed: false, backend: "native", nativeOk: true, installed: true, ready: Promise.resolve(),
      keys: function () { try { return G.localStorage.length; } catch (e) { return -1; } },
      adopt: function () { install(true); return G.HNK.localStore; } };
    return;
  }
  install(false);

  function install(seedFromNative) {

  /* ---- the file behind the map (UXP data folder; memory-only elsewhere) ---- */
  var lfs = null;
  try { var uxp = (typeof require === "function") ? require("uxp") : null; lfs = uxp && uxp.storage && uxp.storage.localFileSystem; } catch (e) { lfs = null; }
  var mem = {};          /* key -> string */
  var order = [];        /* insertion order, for key(i) */
  var loaded = false, dirty = false, timer = null, size = 0;
  /* a late adopt starts from what the session wrote to the host's storage;
     the file then merges UNDER these, exactly as it merges under early writes */
  if (seedFromNative) {
    try {
      var ns = G.localStorage;
      if (ns && typeof ns.key === "function") {
        for (var si = 0; si < ns.length; si++) {
          var sk = ns.key(si); if (sk == null) continue;
          var sv = ns.getItem(sk); if (typeof sv !== "string") continue;
          mem[String(sk)] = sv; order.push(String(sk));
        }
      }
    } catch (e) { }
  }

  function recount() { size = 0; for (var i = 0; i < order.length; i++) size += order[i].length + mem[order[i]].length; }
  if (seedFromNative && order.length) { recount(); dirty = true; }
  function quota(msg) { var e = new Error(msg || "QuotaExceededError: hnk_local_storage is full"); e.name = "QuotaExceededError"; e.code = 22; return e; }
  function schedule() {
    dirty = true;
    if (!lfs || !loaded) return;   /* never clobber the file before it has been read */
    if (timer) return;
    timer = setTimeout(flush, WRITE_GAP_MS);
  }
  async function flush() {
    timer = null;
    if (!dirty || !lfs || !loaded) return;
    dirty = false;
    try {
      var folder = await lfs.getDataFolder();
      var file = await folder.createFile(FILE, { overwrite: true });
      var out = {}; for (var i = 0; i < order.length; i++) out[order[i]] = mem[order[i]];
      await file.write(JSON.stringify(out));
    } catch (e) { dirty = true; }
  }
  async function preload() {
    if (!lfs) { loaded = true; return; }
    try {
      var folder = await lfs.getDataFolder();
      var entry = null;
      try { entry = await folder.getEntry(FILE); } catch (e) { entry = null; }
      if (entry && typeof entry.read === "function") {
        var text = await entry.read();
        var parsed = JSON.parse(text || "{}");
        if (parsed && typeof parsed === "object") {
          /* the file goes UNDER what this session already wrote */
          for (var k in parsed) {
            if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
            if (Object.prototype.hasOwnProperty.call(mem, k)) continue;
            if (typeof parsed[k] !== "string") continue;
            mem[k] = parsed[k]; order.push(k);
          }
          recount();
        }
      }
    } catch (e) { /* first run / unreadable: start empty */ }
    loaded = true;
    if (dirty) schedule();
  }

  var shim = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) {
      k = String(k); v = String(v);
      if (v.length > VALUE_CAP) throw quota("QuotaExceededError: one value past " + VALUE_CAP + " characters");
      var had = Object.prototype.hasOwnProperty.call(mem, k);
      var next = size - (had ? k.length + mem[k].length : 0) + k.length + v.length;
      if (next > TOTAL_CAP) throw quota();
      if (!had) order.push(k);
      mem[k] = v; size = next; schedule();
    },
    removeItem: function (k) {
      k = String(k);
      if (!Object.prototype.hasOwnProperty.call(mem, k)) return;
      size -= k.length + mem[k].length; delete mem[k];
      var i = order.indexOf(k); if (i >= 0) order.splice(i, 1);
      schedule();
    },
    clear: function () { mem = {}; order = []; size = 0; schedule(); },
    key: function (i) { i = i | 0; return (i >= 0 && i < order.length) ? order[i] : null; }
  };
  try { Object.defineProperty(shim, "length", { get: function () { return order.length; } }); } catch (e) { shim.length = 0; }

  var installed = false;
  try { Object.defineProperty(G, "localStorage", { value: shim, configurable: true, writable: true }); installed = G.localStorage === shim; } catch (e) { installed = false; }
  if (!installed) { try { G.localStorage = shim; installed = G.localStorage === shim; } catch (e2) { installed = false; } }

  G.HNK.localStore = {
    shimmed: true,
    nativeOk: native,
    adopted: !!seedFromNative,
    backend: lfs ? "file" : "memory",
    file: FILE,
    installed: installed,
    storage: shim,
    ready: preload(),
    flush: flush,
    keys: function () { return order.length; },
    adopt: function () { return G.HNK.localStore; }
  };
  }
})();
