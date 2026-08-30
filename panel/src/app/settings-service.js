/* ============================================================
   HNK AI Tools — Settings Service
   Spec §21 (Settings Screen)

   Persists the user-visible settings (defaults, language, theme, add-as-layer)
   and the RunningHub Enterprise key, independent of
   each other. Advanced developer/provider controls are NOT part of normal
   settings (§21). Persistence uses the injected `store` contract; key
   verification is delegated to an injected async `verifier` per provider
   (implemented by that provider's adapter).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var KEY = "hnk_settings";

function defaults() {
  return {
    apiKey: "",
    keyVerified: false,
    defaultModel: "auto",
    defaultSize: "2k",
    defaultRatio: "auto",
    defaultQuality: "high",
    defaultVariants: 1,
    language: "my",
    theme: "system",
    density: "normal",       // compact | normal | comfortable
    directGenerate: false,   // skip the staged Prepare step when inputs are valid
    addAsNewLayer: true
  };
}

function create(store, verifier) {
  function _read() {
    var d = defaults();
    try {
      var v = store && store.get(KEY);
      if (v && typeof v === "object") return Object.assign(d, v);
    } catch (e) {}
    return d;
  }
  function _write(s) { try { store && store.set(KEY, s); } catch (e) {} }

  function get() {
    var s = _read();
    /* v6.28.1 — ONE key home (owner: "don't duplicate"). Setup's Enterprise
       key (hnk_students_settings.json, bridged by main.js as HNK.studioKey)
       is the single source of truth; this store only ever carried its own
       copy because the two stacks persist to different files. When this
       store has no key of its own, adopt Setup's — so saving the key once
       in Setup lights up Free Generate and the Smart Workflows too. */
    if (!s.apiKey) {
      try {
        var g = (typeof globalThis !== "undefined") ? globalThis : null;
        var bridged = g && g.HNK && typeof g.HNK.studioKey === "function" ? g.HNK.studioKey() : "";
        if (bridged) {
          s.apiKey = bridged;
          s.keyVerified = !!(g.HNK.studioKeyVerified && g.HNK.studioKeyVerified());
        }
      } catch (e) {}
    }
    return s;
  }

  function set(patch) {
    var s = Object.assign(_read(), patch || {});
    // Changing a key invalidates its own verified status until re-verified.
    if (patch && Object.prototype.hasOwnProperty.call(patch, "apiKey")) s.keyVerified = false;
    _write(s);
    return s;
  }

  /* Save & Verify (spec §21). Returns { ok, settings, error? }. The verifier is
     async and provider-owned; absent it, we save unverified.
     v6.21 — this used to persist the CANDIDATE key immediately, before
     verifier() even resolved, then only flip keyVerified on failure — so a
     mistyped or expired key silently overwrote a previously-working saved
     key on disk, with no rollback. Verify FIRST; only persist the new key
     once verification actually succeeds. Mirrors the web app's identical
     v5.20 fix for the same bug (btnSaveRhKey/btnSaveOaKey). */
  async function saveAndVerifyKey(apiKey) {
    if (typeof verifier !== "function") {
      var s0 = set({ apiKey: apiKey });
      return { ok: false, settings: s0, error: { code: "no-verifier" } };
    }
    try {
      var res = await verifier(apiKey);
      if (res && res.ok) {
        var s = set({ apiKey: apiKey });
        s.keyVerified = true;
        _write(s);
        return { ok: true, settings: s, error: null };
      }
      return { ok: false, settings: _read(), error: res && res.error };
    } catch (e) {
      return { ok: false, settings: _read(), error: { code: "verify-failed" } };
    }
  }

  /* v6.26.0 — the OpenAI key (and its save/verify) left with its provider.
     v6.27.0 — applyDefaultsTo left with it by accident: the function body sat
     beside the removed OpenAI block, but the return object (and
     bootstrap.js's AI Tools init) still referenced it, so create() threw
     ReferenceError and the AI Tools tab failed to start in 6.26.0–6.26.2.
     Restored verbatim — it was always provider-neutral. */
  function applyDefaultsTo(state) {
    if (!state) return state;
    var s = _read();
    state.modelId = s.defaultModel;
    state.size = s.defaultSize;
    state.ratio = s.defaultRatio;
    state.quality = s.defaultQuality;
    state.variants = s.defaultVariants;
    if (state.advanced) state.advanced.addAsNewLayer = s.addAsNewLayer;
    return state;
  }

  return { get: get, set: set, saveAndVerifyKey: saveAndVerifyKey, applyDefaultsTo: applyDefaultsTo, defaults: defaults };
}

var API = { create: create, defaults: defaults, KEY: KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.settingsService = API; }
})();
