/* ============================================================
   HNK AI Tools — panel mount (v6.0)

   Mounts the two-mode AI Tools UI (Free Generate + Smart Workflow +
   RunningHub settings) into #hnkAiToolsRoot on the AI Tools tab.

   MUST stay an EXTERNAL script: UXP does not execute inline <script>
   blocks, which is exactly why the old inline opt-in mount never ran
   inside Photoshop. Loaded after every HNK module and before main.js.

   Defensive by design: if the full UXP boot path fails, it falls back
   to an in-memory store so the tab is never empty, and as a last
   resort prints the real error into the tab instead of silence.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var g = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined" ? window : {});
g.HNK_AI_TOOLS_AUTOSTART = true; /* the AI Tools tab always mounts in v6 */

function showError(root, e) {
  try {
    while (root.firstChild) root.removeChild(root.firstChild);
    var d = root.ownerDocument.createElement("div");
    d.className = "hnk-mount-err";
    var lead = "AI Tools failed to start";
    try {
      var b = g.HNK && g.HNK.i18n;
      if (b && typeof b.t === "function") {
        var v = b.t("ai_start_fail");
        if (v && v !== "ai_start_fail") lead = v;
      }
    } catch (t) { }
    d.textContent = lead + ": " + ((e && e.message) || e || "unknown error");
    root.appendChild(d);
  } catch (x) { /* never throw from the reporter */ }
}

async function mount() {
  var doc = (typeof document !== "undefined") ? document : null;
  if (!doc || !doc.getElementById) return;
  var root = doc.getElementById("hnkAiToolsRoot");
  if (!root || !g.HNK || !g.HNK.bootstrap) return;
  if (root.firstChild) return; /* already mounted */

  var lfs = null, host = null;
  try { lfs = require("uxp").storage.localFileSystem; } catch (e) { }
  host = g.HNK.photoshopHost || null;

  var lastErr = null;
  try { await g.HNK.bootstrap.start(lfs, host, doc); } catch (e) { lastErr = e; }
  if (root.firstChild) return; /* full boot succeeded */

  /* Fallback: in-memory store + live transport — UI works, persistence
     degrades gracefully instead of leaving the whole tab blank. */
  try {
    var transport = (g.HNK.runninghubHttp && g.HNK.runninghubHttp.create) ? g.HNK.runninghubHttp.create() : null;
    var boot = g.HNK.bootstrap.create({
      document: doc,
      root: root,
      io: { load: function () { return {}; }, save: function () { } },
      host: host,
      transport: transport
    });
    root.style.display = "";
    boot.mount();
  } catch (e2) {
    showError(root, lastErr || e2);
  }
}

(function arm() {
  try {
    var doc = (typeof document !== "undefined") ? document : null;
    if (!doc) return;
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", function () { mount(); });
    } else {
      mount();
    }
    /* one delayed retry covers slow module/init ordering on old hosts */
    try { setTimeout(function () { mount(); }, 1600); } catch (e) { }
  } catch (e) { }
})();

var API = { mount: mount };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { g.HNK = g.HNK || {}; g.HNK.aiToolsMount = API; }
})();
