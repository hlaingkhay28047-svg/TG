/* ============================================================
   HNK AI Tools — Settings screen controller
   Spec §21 (Settings Screen)

   Visible settings only: Enterprise key (Save & Verify), default
   model/size/ratio/quality/variants, language, theme, add-results-as-layers.
   No developer/provider strategy controls (§21). All persistence goes through
   the settings service.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var registry = _CJS ? require("../../models/model-registry") : globalThis.HNK.modelRegistry;

var SIZES = ["1k", "2k", "4k"];
var RATIOS = ["auto", "source", "1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "16:9", "9:16", "21:9"];
var QUALITIES = ["draft", "standard", "high", "ultra"];
var VARIANTS = ["1", "2", "4"];
/* v6.28.1 — the Language and Theme pickers (and their LANGS/THEMES tables)
   left this screen for the header controls, their one home. */
var DENSITIES = [["compact", "Compact"], ["normal", "Normal"], ["comfortable", "Comfortable"]];

function _select(doc, id, options, current, onChange) {
  var sel = dom.el(doc, "select", { class: "hnk-sel", id: id });
  options.forEach(function (opt) {
    var val = Array.isArray(opt) ? opt[0] : opt;
    var label = Array.isArray(opt) ? opt[1] : String(opt).toUpperCase();
    var o = dom.el(doc, "option", { value: String(val), text: label });
    if (String(val) === String(current)) o.selected = true;
    sel.appendChild(o);
  });
  dom.on(sel, "change", function () { onChange(sel.value); });
  return sel;
}

function _field(doc, label, node) {
  return dom.el(doc, "div", { class: "hnk-field" }, [
    dom.el(doc, "div", { class: "hnk-field-label", text: label }), node
  ]);
}

function _input(doc, id, placeholder, value) {
  var el = dom.el(doc, "input", { class: "hnk-sel", id: id, attrs: { type: "text", placeholder: placeholder } });
  if (value != null) el.value = value;
  return el;
}

/* Custom-model endpoint form. Every built-in model already works with just
   the Enterprise-Shared key above (spec §17) — this is only for a model
   whose apiPath isn't confirmed yet. The user copies the endpoint path from
   RunningHub's own API docs (the "Endpoint:" line on the model's page) and
   pastes it here — no node ids, no app discovery. Saved live to the store. */
function renderRunningHub(root, deps, s) {
  var doc = deps.document;
  var setup = deps.rh.setup;
  root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_rh_sec", "RunningHub \u2014 add a model endpoint (Advanced \u2014 optional)") }));
  root.appendChild(dom.el(doc, "div", { class: "hnk-field-label", text: dom.t("ai_rh_note", "Built-in models already work with the key above \u2014 nothing to do. If a model shows \"not connected\" (its endpoint path isn't confirmed yet), copy the path from RunningHub's API docs and paste it here.") }));

  var models = registry.listModels().filter(function (m) { return m.provider === "runninghub-enterprise"; }).map(function (m) { return [m.id, m.displayName]; });
  var modelSel = _select(doc, "hnkRhModel", models, models[0][0], function () { fill(); });
  root.appendChild(_field(doc, "Model", modelSel));

  var pathInput = _input(doc, "hnkRhPath", "e.g. rhart-image-n-g31-flash/image-to-image");
  root.appendChild(_field(doc, "Endpoint path", pathInput));

  function fill() { pathInput.value = setup.getModelApiPath(modelSel.value); }
  fill();

  var status = dom.el(doc, "div", { class: "hnk-status", id: "hnkRhStatus" });
  var saveBtn = dom.el(doc, "button", { class: "hnk-btn btn-gold", id: "hnkRhSave", text: dom.t("ai_rh_save", "Save this model's endpoint") });
  dom.on(saveBtn, "click", function () {
    setup.setModelApiPath(modelSel.value, pathInput.value);
    status.textContent = setup.isConfigured(modelSel.value)
      ? (modelSel.value + " is connected ✓")
      : "Endpoint path is required.";
  });
  root.appendChild(saveBtn);

  var testBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkRhTest", text: dom.t("ai_test_conn", "Test connection") });
  var rhTestToken = 0;
  dom.on(testBtn, "click", function () {
    var myToken = ++rhTestToken;
    dom.setDisabled(testBtn, true);
    status.textContent = dom.t("ai_verifying", "Verifying…");
    var key = deps.settings.get().apiKey;
    var p = deps.rh.verify(key);
    var apply = function (r) {
      if (myToken !== rhTestToken) return; // a newer click already superseded this one
      dom.setDisabled(testBtn, false);
      status.textContent = r.ok ? "RunningHub connection OK ✓" : (r.error && r.error.code === "no-transport" ? "Test needs the live connection (in Photoshop)." : "Connection failed — check the key.");
    };
    if (p && p.then) p.then(apply); else apply(p || {});
  });
  root.appendChild(testBtn);
  root.appendChild(status);
}

/* v6.26.0 — the OpenAI key entry left with its provider: RunningHub
   Enterprise (above) is the one engine. */

function render(root, deps) {
  var doc = deps.document;
  var svc = deps.settings;
  var s = svc.get();
  dom.clear(root);
  /* v6.28.1 — ONE home per setting (owner: "don't duplicate"). The
     Enterprise key lives ONLY on the Setup tab now — the settings service
     bridges it in (see settings-service.js), so saving it once there powers
     Free Generate and the Smart Workflows too. Language and Theme live ONLY
     in the header controls. What remains here exists nowhere else: the AI
     Tools defaults, behaviour switches and the advanced endpoint form. */
  root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_settings_defaults", "AI Tools — Defaults") }));
  root.appendChild(dom.el(doc, "div", { class: "hnk-field-label",
    text: dom.t("ai_key_lives_in_setup", "The RunningHub Enterprise key is managed on the Setup tab — saved once, used everywhere.") }));

  // Defaults
  var modelOpts = [["auto", "Auto Model"]].concat(registry.listModels().map(function (m) { return [m.id, m.displayName]; }));
  root.appendChild(_field(doc, "Default Model", _select(doc, "hnkSetModel", modelOpts, s.defaultModel, function (v) { svc.set({ defaultModel: v }); })));
  root.appendChild(_field(doc, "Default Size", _select(doc, "hnkSetSize", SIZES, s.defaultSize, function (v) { svc.set({ defaultSize: v }); })));
  root.appendChild(_field(doc, "Default Ratio", _select(doc, "hnkSetRatio", RATIOS, s.defaultRatio, function (v) { svc.set({ defaultRatio: v }); })));
  root.appendChild(_field(doc, "Default Quality", _select(doc, "hnkSetQuality", QUALITIES, s.defaultQuality, function (v) { svc.set({ defaultQuality: v }); })));
  root.appendChild(_field(doc, "Default Variants", _select(doc, "hnkSetVariants", VARIANTS, String(s.defaultVariants), function (v) { svc.set({ defaultVariants: v | 0 }); })));
  root.appendChild(_field(doc, "Panel Density", _select(doc, "hnkSetDensity", DENSITIES, s.density, function (v) { svc.set({ density: v }); if (deps.onDensity) deps.onDensity(v); })));

  // Direct Generate — skip the staged Prepare step when inputs are already valid.
  var directBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkSetDirect", text: dom.tOnOff("ai_direct_gen", "Direct Generate", s.directGenerate) });
  dom.on(directBtn, "click", function () {
    var next = !svc.get().directGenerate; svc.set({ directGenerate: next });
    directBtn.textContent = dom.tOnOff("ai_direct_gen", "Direct Generate", next);
  });
  root.appendChild(directBtn);

  // Add results as new layers
  var layerBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkSetAddLayer", text: dom.tOnOff("ai_add_layers", "Add Results as New Layers", s.addAsNewLayer) });
  dom.on(layerBtn, "click", function () {
    var next = !svc.get().addAsNewLayer;
    svc.set({ addAsNewLayer: next });
    layerBtn.textContent = dom.tOnOff("ai_add_layers", "Add Results as New Layers", next);
  });
  root.appendChild(layerBtn);

  // ---- RunningHub setup (no-code, optional/advanced) ----
  if (deps.rh && deps.rh.setup) renderRunningHub(root, deps, s);
  return root;
}

var API = { render: render };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.settingsScreen = API; }
})();
