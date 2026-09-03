/* ============================================================
   HNK AI Tools — Free Generate screen controller
   Spec §4–§14 (Free Generate UI, model selector, output, generate)

   Thin controller: every decision comes from the core.
     - image slots  -> freeGenerateState (+ dynamic maxSlots from validator)
     - model row     -> modelRegistry + resolved auto model shown before Generate
     - generate btn  -> freeGenerateValidator.evaluate (enable + reasons)
     - GENERATE      -> freeRequestCompiler.compile -> deps.onGenerate(request)
   Preservation toggles carry a tooltip that they are prompt instructions (§10).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var fstate = _CJS ? require("../../free-generate/free-generate-state") : globalThis.HNK.freeGenerateState;
var validator = _CJS ? require("../../free-generate/free-generate-validator") : globalThis.HNK.freeGenerateValidator;
var compiler = _CJS ? require("../../free-generate/free-request-compiler") : globalThis.HNK.freeRequestCompiler;
var registry = _CJS ? require("../../models/model-registry") : globalThis.HNK.modelRegistry;
var imageImport = _CJS ? require("../../photoshop/image-import-service") : (globalThis.HNK && globalThis.HNK.imageImportService);

var SIZES = ["1k", "2k", "4k"];
var QUALITIES = ["draft", "standard", "high", "ultra"];
var VARIANTS = [1, 2, 4];

/* Controller instance keeps refs to the live nodes it must refresh. */
function create(deps) {
  var doc = deps.document;
  var state = deps.state || fstate.defaultState();
  var ctx = deps.ctx || { hasApiKey: true, requestRunning: false };

  var nodes = {}; // named nodes we refresh
  var root = null;

  function evaluate() {
    return validator.evaluate(state, ctx);
  }

  /* Re-render the volatile bits: resolved-model banner, add-ref availability,
     estimated request count, generate button state + reason. */
  function refresh() {
    var ev = evaluate();

    if (nodes.modelBanner) {
      var rm = ev.resolvedModel;
      var m = registry.getModel(rm.modelId);
      var name = m ? m.displayName : rm.modelId;
      nodes.modelBanner.textContent = rm.auto
        ? ("Auto Model → " + name + "  ·  " + rm.reason)
        : ("Model: " + name);
    }
    if (nodes.addRef) {
      var atLimit = state.images.length >= ev.maxSlots;
      dom.setDisabled(nodes.addRef, atLimit);
      nodes.addRef.textContent = atLimit
        ? ("Max " + ev.maxSlots + " images for this model")
        : "+ Add Reference Image";
      /* v6.27.0 — the other three sources share the same dynamic limit */
      [nodes.addRefFile, nodes.addRefWeb, nodes.addRefLib].forEach(function (b) {
        if (b) dom.setDisabled(b, atLimit);
      });
      if (atLimit && nodes.refUrlRow) nodes.refUrlRow.style.display = "none";
    }
    if (nodes.estimate) {
      nodes.estimate.textContent = ev.requestCount > 1
        ? (ev.requestCount + " generation requests")
        : "1 generation request";
    }
    if (nodes.status) {
      nodes.status.textContent = ev.enabled
        ? "Ready to generate"
        : (ev.reasons[0] ? ev.reasons[0].message : "Not ready");
    }
    if (nodes.generate) dom.setDisabled(nodes.generate, !ev.enabled);
    if (nodes.slots) renderSlots();
    // Notify the host (bootstrap) so it can auto-save the draft (spec §26).
    if (deps.onChange) { try { deps.onChange(state); } catch (e) {} }
    return ev;
  }

  function renderSlots() {
    dom.clear(nodes.slots);
    var failMsgs = [];
    state.images.forEach(function (slot, i) {
      var row = dom.el(doc, "div", { class: "hnk-slot", id: "hnkSlot_" + slot.id });
      row.appendChild(dom.el(doc, "div", { class: "hnk-slot-role", text: (i === 0 ? "Main" : "Ref " + i) + " · " + slot.role }));
      var rm = dom.el(doc, "button", { class: "hnk-slot-x", text: "×" });
      dom.on(rm, "click", function () { fstate.removeImage(state, slot.id); refresh(); });
      row.appendChild(rm);
      nodes.slots.appendChild(row);
      // v6.19: a slot that failed to capture (no active layer, unreadable
      // file, bad clipboard/URL) used to render as an empty row with zero
      // explanation — collect the reason to show below the slot strip
      // (kept OUT of the compact wrapping .hnk-slot pill itself, whose
      // width is meant to stay small).
      if (!slot.valid && slot.reason && imageImport) {
        var msg = imageImport.reasonMessage(dom, slot.reason);
        if (msg) failMsgs.push(msg);
      }
    });
    if (nodes.slotErrors) {
      dom.clear(nodes.slotErrors);
      failMsgs.forEach(function (msg) {
        nodes.slotErrors.appendChild(dom.el(doc, "div", { class: "hnk-slot-err", text: msg }));
      });
    }
  }

  function render(mountRoot) {
    root = mountRoot;
    dom.clear(root);

    // IMAGES
    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_images", "IMAGES") }));
    nodes.slots = dom.el(doc, "div", { class: "hnk-slots" });
    root.appendChild(nodes.slots);
    nodes.slotErrors = dom.el(doc, "div", { class: "hnk-slot-errors" });
    root.appendChild(nodes.slotErrors);
    /* v6.27.0 — owner requirement: every image slot offers the classic tabs'
       four sources (Active Layer · File · Web Link · Library), not just the
       active layer. One applier so every source lands identically.
       v6.59.0 — five now: Paste joins them, through the same applier. */
    var atLimit = function () { return state.images.length >= evaluate().maxSlots; }; // dynamic limit (§5)
    var applySlot = function (slot) {
      fstate.addImage(state, { source: slot.source, ref: slot.ref, valid: slot.valid, reason: slot.reason });
      refresh();
    };
    nodes.addRef = dom.el(doc, "button", { class: "hnk-btn", id: "hnkAddRef", text: dom.t("ai_add_ref", "+ Add Reference Image") });
    dom.on(nodes.addRef, "click", function () {
      if (atLimit()) return;
      // With a Photoshop host, this button's slot source is the active layer
      // (spec §5); otherwise fall back to a stub ref (tests without a host).
      if (deps.host && imageImport) {
        var res = imageImport.fromActiveLayer(deps.host);
        if (res && typeof res.then === "function") res.then(applySlot);
        else applySlot(res);
      } else {
        fstate.addImage(state, { source: "file", ref: deps.stubRef || null, valid: deps.stubRef ? true : false });
        refresh();
      }
    });
    root.appendChild(nodes.addRef);

    var srcRow = dom.el(doc, "div", { class: "hnk-src-row" });
    nodes.addRefFile = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkAddRefFile", text: dom.t("btn_ref_file", "File") });
    dom.on(nodes.addRefFile, "click", function () {
      if (atLimit()) return;
      if (!(deps.host && deps.host.pickImageFile && imageImport)) {
        fstate.addImage(state, { source: "file", ref: deps.stubRef || null, valid: !!deps.stubRef });
        refresh();
        return;
      }
      Promise.resolve(deps.host.pickImageFile()).then(function (file) {
        if (!file) return; // user cancelled the picker — not an error
        return Promise.resolve(imageImport.fromFile(deps.host, file)).then(applySlot);
      }).catch(function () { applySlot({ source: "file", ref: null, valid: false, reason: "unreadable" }); });
    });
    srcRow.appendChild(nodes.addRefFile);
    /* v6.59.0 — Paste, the fifth source, on the Freeform slots too: the
       import service has carried fromPaste since the first spec and the host
       now really reads the clipboard, so the two screens offer the same five
       ways in. A host that cannot read the clipboard says so in the slot. */
    nodes.addRefPaste = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkAddRefPaste", text: dom.t("btn_ref_paste", "Paste") });
    dom.on(nodes.addRefPaste, "click", function () {
      if (atLimit()) return;
      if (!imageImport) return;
      var res = imageImport.fromPaste(deps.host);
      if (res && typeof res.then === "function") res.then(applySlot);
      else applySlot(res);
    });
    srcRow.appendChild(nodes.addRefPaste);
    nodes.addRefWeb = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkAddRefWeb", text: dom.t("btn_ref_web", "Web") });
    srcRow.appendChild(nodes.addRefWeb);
    nodes.addRefLib = dom.el(doc, "button", { class: "hnk-btn hnk-req-add hnk-req-lib", id: "hnkAddRefLib", text: "✦ " + dom.t("ai_library", "Library") });
    dom.on(nodes.addRefLib, "click", function () {
      if (atLimit()) return;
      var g = (typeof globalThis !== "undefined") ? globalThis : {};
      var getPick = g.HNK && g.HNK.getLibraryPickDataUrl;
      var hint = function (msg) { if (nodes.status) nodes.status.textContent = msg; };
      if (!getPick) { hint(dom.t("ai_lib_bridge_off", "Library bridge unavailable on this host.")); return; }
      getPick().then(function (res) {
        if (!res || !res.dataUrl) { hint(dom.t("ai_lib_pick_first", "Pick a photo from the Presets tab → Visual Library first.")); return; }
        applySlot({ source: "library", ref: res.dataUrl, valid: true });
      }).catch(function () { hint(dom.t("ai_lib_load_fail", "Library image could not be loaded.")); });
    });
    srcRow.appendChild(nodes.addRefLib);
    root.appendChild(srcRow);

    /* Web Link entry row — hidden until the Web button is pressed. */
    var urlInp = dom.el(doc, "input", { class: "hnk-inp hnk-url-inp", id: "hnkRefUrl",
      attrs: { type: "text", placeholder: dom.t("url_ph", "https://... image link") } });
    var urlGo = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkRefUrlGo", text: dom.t("btn_load", "Load") });
    nodes.refUrlRow = dom.el(doc, "div", { class: "hnk-url-row", id: "hnkRefUrlRow" }, [urlInp, urlGo]);
    nodes.refUrlRow.style.display = "none";
    dom.on(nodes.addRefWeb, "click", function () {
      if (atLimit()) return;
      var open = nodes.refUrlRow.style.display === "none";
      nodes.refUrlRow.style.display = open ? "" : "none";
      if (open) { try { urlInp.focus(); } catch (e) {} }
    });
    dom.on(urlGo, "click", function () {
      if (atLimit() || !imageImport) return;
      var res = imageImport.fromWebLink(deps.host, urlInp.value);
      if (res && typeof res.then === "function") res.then(applySlot);
      else applySlot(res);
      nodes.refUrlRow.style.display = "none";
    });
    root.appendChild(nodes.refUrlRow);

    // PROMPT
    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_prompt", "PROMPT") }));
    nodes.prompt = dom.el(doc, "textarea", { class: "hnk-prompt", id: "hnkPrompt", attrs: { maxlength: "20000", placeholder: dom.t("ai_prompt_ph", "Describe what you want...") } });
    nodes.prompt.value = state.prompt || ""; // reflect restored draft (§26)
    dom.on(nodes.prompt, "input", function () { fstate.setPrompt(state, nodes.prompt.value); refresh(); });
    root.appendChild(nodes.prompt);
    var clearBtn = dom.el(doc, "button", { class: "hnk-btn", id: "hnkClear", text: dom.t("btn_clear", "Clear") });
    dom.on(clearBtn, "click", function () { fstate.clearPrompt(state); if (nodes.prompt) nodes.prompt.value = ""; refresh(); });
    root.appendChild(clearBtn);

    // MODEL & OUTPUT
    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_model_output", "MODEL & OUTPUT") }));
    root.appendChild(dom.el(doc, "div", { class: "hnk-hint", text: dom.t("ai_model_note", "AI Tools has its own model/size settings, separate from the classic panel's Setup and Create tabs.") }));
    nodes.model = dom.el(doc, "select", { class: "hnk-model", id: "hnkModel" });
    nodes.model.appendChild(dom.el(doc, "option", { value: "auto", text: dom.t("ai_auto_model", "Auto Model") }));
    registry.listModels().forEach(function (m) {
      nodes.model.appendChild(dom.el(doc, "option", { value: m.id, text: m.displayName }));
    });
    nodes.model.value = state.modelId || "auto"; // reflect restored draft (§26)
    dom.on(nodes.model, "change", function () { fstate.setModel(state, nodes.model.value); refresh(); });
    root.appendChild(nodes.model);
    nodes.modelBanner = dom.el(doc, "div", { class: "hnk-model-banner", id: "hnkModelBanner" });
    root.appendChild(nodes.modelBanner);

    nodes.size = mkSelect(doc, SIZES, state.size, function (v) { fstate.setSize(state, v); refresh(); }, "hnkSize");
    root.appendChild(labelWrap(doc, "Size", nodes.size));
    nodes.quality = mkSelect(doc, QUALITIES, state.quality, function (v) { fstate.setQuality(state, v); refresh(); }, "hnkQuality");
    root.appendChild(labelWrap(doc, "Quality", nodes.quality));

    var variantRow = dom.el(doc, "div", { class: "hnk-variants" });
    VARIANTS.forEach(function (n) {
      var b = dom.el(doc, "button", { class: "hnk-btn hnk-variant", id: "hnkVar_" + n, text: String(n) });
      dom.on(b, "click", function () { fstate.setVariants(state, n); refresh(); });
      variantRow.appendChild(b);
    });
    root.appendChild(labelWrap(doc, "Variants", variantRow));
    nodes.estimate = dom.el(doc, "div", { class: "hnk-estimate" });
    root.appendChild(nodes.estimate);

    // STATUS + GENERATE
    nodes.status = dom.el(doc, "div", { class: "hnk-status", id: "hnkStatus" });
    root.appendChild(nodes.status);
    nodes.generate = dom.el(doc, "button", { class: "hnk-btn hnk-generate", id: "hnkGenerate", text: dom.t("btn_generate", "GENERATE") });
    dom.on(nodes.generate, "click", function () {
      var ev = evaluate();
      if (!ev.enabled) return;
      var request = compiler.compile(state);
      if (deps.onGenerate) deps.onGenerate(request);
    });
    root.appendChild(nodes.generate);

    refresh();
    return root;
  }

  return {
    render: render,
    refresh: refresh,
    evaluate: evaluate,
    getState: function () { return state; },
    setContext: function (c) { ctx = Object.assign(ctx, c || {}); refresh(); }
  };
}

function mkSelect(doc, values, current, onChange, id) {
  var sel = dom.el(doc, "select", { class: "hnk-sel", id: id });
  values.forEach(function (v) {
    var o = dom.el(doc, "option", { value: String(v), text: String(v).toUpperCase() });
    if (String(v) === String(current)) o.selected = true;
    sel.appendChild(o);
  });
  dom.on(sel, "change", function () { onChange(sel.value); });
  return sel;
}

function labelWrap(doc, label, node) {
  return dom.el(doc, "div", { class: "hnk-field" }, [
    dom.el(doc, "div", { class: "hnk-field-label", text: label }),
    node
  ]);
}

var API = { create: create };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.freeGenerateScreen = API; }
})();
