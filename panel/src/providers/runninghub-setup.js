/* ============================================================
   HNK AI Tools — RunningHub Setup Service (custom model apiPath)
   Every built-in model already ships with a real, confirmed apiPath (see
   runninghub-config.js) — nothing to configure for those. This service only
   covers the advanced/optional case: a model whose apiPath is not yet
   confirmed (or a future model added to the registry before its endpoint is
   filled in) — the user copies the endpoint path from RunningHub's own API
   docs and pastes it here. Persisted under the store key "hnk_rh_config" as
   a config OVERRIDE that runninghub-config.resolve()/the adapter read live —
   so a saved path takes effect on the next generation, no code edit, no
   reload required.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var KEY = "hnk_rh_config";

function _clean(v) { return (v == null ? "" : String(v)).trim().replace(/^\/+/, "").replace(/^openapi\/v2\//, ""); }

function create(store) {
  function get() {
    var v = store && store.get(KEY);
    if (v && typeof v === "object") { if (!v.models) v.models = {}; return v; }
    return { models: {} };
  }
  function _write(cfg) { if (store) store.set(KEY, cfg); return cfg; }

  /* Save (or clear, when blank) one model's custom endpoint path. */
  function setModelApiPath(modelId, apiPath) {
    var c = get();
    var path = _clean(apiPath);
    if (!path) { delete c.models[modelId]; return _write(c); }
    c.models[modelId] = { apiPath: path };
    return _write(c);
  }

  function getModelApiPath(modelId) {
    var c = get();
    return (c.models[modelId] && c.models[modelId].apiPath) || "";
  }

  function isConfigured(modelId) { return !!getModelApiPath(modelId); }

  function clear() { return _write({ models: {} }); }

  /* The override object the adapter consumes (runninghub-config.resolve). */
  function toOverride() { return get(); }

  return {
    get: get, setModelApiPath: setModelApiPath, getModelApiPath: getModelApiPath,
    isConfigured: isConfigured, clear: clear, toOverride: toOverride
  };
}

var API = { create: create, KEY: KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubSetup = API; }
})();
