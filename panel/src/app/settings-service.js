/* ============================================================
   HNK AI Tools — Settings Service
   Spec §21 (Settings Screen)

   Persists the user-visible settings (defaults, language, theme, add-as-layer)
   and both provider keys — RunningHub Enterprise and OpenAI, independent of
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
    oaiKey: "",
    oaiKeyVerified: false,
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

function create(store, verifier, oaiVerifier) {
  function _read() {
    var d = defaults();
    try {
      var v = store && store.get(KEY);
      if (v && typeof v === "object") return Object.assign(d, v);
    } catch (e) {}
    return d;
  }
  function _write(s) { try { store && store.set(KEY, s); } catch (e) {} }

  function get() { return _read(); }

  function set(patch) {
    var s = Object.assign(_read(), patch || {});
    // Changing a key invalidates its own verified status until re-verified.
    if (patch && Object.prototype.hasOwnProperty.call(patch, "apiKey")) s.keyVerified = false;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "oaiKey")) s.oaiKeyVerified = false;
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

  /* Same as saveAndVerifyKey, for the OpenAI key — kept separate since the two
     providers' keys are independent and either can be configured alone. */
  async function saveAndVerifyOaiKey(apiKey) {
    if (typeof oaiVerifier !== "function") {
      var s0 = set({ oaiKey: apiKey });
      return { ok: false, settings: s0, error: { code: "no-verifier" } };
    }
    try {
      var res = await oaiVerifier(apiKey);
      if (res && res.ok) {
        var s = set({ oaiKey: apiKey });
        s.oaiKeyVerified = true;
        _write(s);
        return { ok: true, settings: s, error: null };
      }
      return { ok: false, settings: _read(), error: res && res.error };
    } catch (e) {
      return { ok: false, settings: _read(), error: { code: "verify-failed" } };
    }
  }

  /* Seed a fresh Free Generate state's defaults from settings (spec §21). */
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

  return { get: get, set: set, saveAndVerifyKey: saveAndVerifyKey, saveAndVerifyOaiKey: saveAndVerifyOaiKey, applyDefaultsTo: applyDefaultsTo, defaults: defaults };
}

var API = { create: create, defaults: defaults, KEY: KEY };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.settingsService = API; }
})();
