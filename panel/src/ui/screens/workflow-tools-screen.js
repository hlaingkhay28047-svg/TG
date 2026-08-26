/* ============================================================
   HNK AI Tools — Workflow Tools screen (staged Smart-Workflow buttons)
   Spec §15 + self-contained staged-button rule.

   Per-button staged interaction:
     Click 1  select  -> show the workflow's explanation + required images.
     Click 2  Prepare -> load the protected prompt, validate, highlight missing
                         slots; green "ready" when every required input is valid.
     Next     GENERATE (enabled only when ready).
   Direct Generate mode (global toggle) skips Prepare: once inputs are valid,
   GENERATE is available immediately.

   The protection (subject/identity/pose locks, negatives, reference-transfer
   rules) is inside the workflow, not the UI — this screen shows no separate
   guard/lock/QC controls.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* face-centred square thumbs (icons/thumbs/) — the wide banners beheaded
   subjects when cover-cropped into the 48px square (user report) */
var HNK_SQ_THUMBS = {
  "icons/banners/create.jpg": 1, "icons/banners/studio.jpg": 1,
  "icons/banners/setup.jpg": 1, "icons/banners/aitools.jpg": 1,
  "icons/banners/retouch.jpg": 1, "icons/banners/reference-transfer.jpg": 1,
  "icons/banners/master-bgfg-replace.jpg": 1, "icons/hero-banner.jpg": 1,
  "assets/user_library_ui/user-ref-085.jpg": 1, "assets/user_library_ui/user-ref-087.jpg": 1
};
function hnkThumbSrc(v) {
  if (v && HNK_SQ_THUMBS[v]) return "icons/thumbs/" + v.split("/").pop();
  return v;
}


var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("../dom") : globalThis.HNK.dom;
var registry = _CJS ? require("../../workflows/workflow-registry") : globalThis.HNK.workflowRegistry;
var wstate = _CJS ? require("../../workflows/workflow-state") : globalThis.HNK.workflowState;
var validator = _CJS ? require("../../workflows/workflow-validator") : globalThis.HNK.workflowValidator;
var compiler = _CJS ? require("../../workflows/workflow-request-compiler") : globalThis.HNK.workflowRequestCompiler;
var modelRegistry = _CJS ? require("../../models/model-registry") : globalThis.HNK.modelRegistry;
var imageImport = _CJS ? require("../../photoshop/image-import-service") : (globalThis.HNK && globalThis.HNK.imageImportService);

function create(deps) {
  var doc = deps.document;
  var state = deps.state || wstate.defaultState();
  var root = null;
  var nodes = {};

  function directMode() { return !!(deps.directGenerate && deps.directGenerate()); }

  function renderList() {
    dom.clear(root);
    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_wf_tools", "Workflow Tools") }));
    if (deps.onToggleDirect) {
      var d = dom.el(doc, "button", { class: "hnk-btn hnk-direct", id: "hnkDirectToggle",
        text: dom.tOnOff("ai_direct_gen", "Direct Generate", directMode()) });
      dom.on(d, "click", function () { deps.onToggleDirect(); d.textContent = dom.tOnOff("ai_direct_gen", "Direct Generate", directMode()); });
      root.appendChild(d);
    }
    var listEl = dom.el(doc, "div", { class: "hnk-wf-list" });
    registry.list().forEach(function (wf) {
      var thumb = null;
      if (wf.visual) {
        thumb = dom.el(doc, "div", { class: "hnk-thumb" });
        thumb.style.backgroundImage = 'url("' + hnkThumbSrc(wf.visual) + '")';
      }
      var m = modelRegistry.getModel(wf.route.modelId);
      var b = dom.el(doc, "button", { class: "hnk-action" + (wf.visual ? " has-thumb" : ""), id: "hnkWf_" + wf.id }, [
        thumb,
        dom.el(doc, "div", { class: "hnk-action-txt" }, [
          dom.el(doc, "div", { class: "hnk-action-label", text: wf.title }),
          dom.el(doc, "div", { class: "hnk-action-sub",
            text: dom.t(registry.summaryKey(wf.id), wf.summary) }),
          dom.el(doc, "div", { class: "hnk-action-meta",
            text: (m ? m.displayName : wf.route.modelId) +
              (wf.humanSubject ? " \u00b7 " + dom.t("ai_identity_lock", "Identity Lock") : "") })
        ])
      ]);
      dom.on(b, "click", function () { select(wf.id); });
      listEl.appendChild(b);
    });
    root.appendChild(listEl);
  }

  function select(workflowId) {
    wstate.selectWorkflow(state, workflowId);       // Click 1
    if (directMode()) wstate.prepare(state);        // Direct: skip staging
    renderSelected();
  }

  function addImage(inp) {
    if (deps.host && imageImport) {
      var res = imageImport.fromActiveLayer(deps.host);
      var apply = function (slot) { wstate.setInput(state, inp.key, { source: slot.source, role: inp.role, ref: slot.ref, valid: slot.valid, reason: slot.reason }); refresh(); };
      if (res && typeof res.then === "function") res.then(apply); else apply(res);
    } else {
      wstate.setInput(state, inp.key, { source: "file", role: inp.role, ref: deps.stubRef || ("ref_" + inp.key), valid: true });
      refresh();
    }
  }

  function refresh() {
    if (!state.workflowId) return;
    var ev = validator.evaluate(state);
    (state.requiredInputs || []).forEach(function (inp) {
      var mark = nodes["req_" + inp.key];
      if (mark) {
        var okk = !!(inp.image && inp.image.ref);
        // v6.19: a failed capture (no-active-layer, unreadable file, ...)
        // used to look identical to "never touched this slot" — both said
        // "Missing". Show the specific reason when there was an actual
        // failed attempt.
        var failReason = (!okk && inp.image && inp.image.reason && imageImport) ? imageImport.reasonMessage(dom, inp.image.reason) : "";
        mark.textContent = okk ? "✓" : (failReason || "Missing");
        mark.className = "hnk-req-mark " + (okk ? "ok" : "miss");
      }
    });
    var ready = ev.ready;
    var canGenerate = ready && (state.prepared || directMode());
    if (nodes.prepareBtn) {
      var showPrepare = !state.prepared && !directMode();
      nodes.prepareBtn.style.display = showPrepare ? "" : "none";
    }
    if (nodes.generate) {
      nodes.generate.style.display = (state.prepared || directMode()) ? "" : "none";
      dom.setDisabled(nodes.generate, !canGenerate);
    }
    if (nodes.readyMsg) {
      nodes.readyMsg.className = "hnk-status " + (canGenerate ? "ok" : "");
      nodes.readyMsg.textContent = canGenerate ? "All required inputs are ready — press GENERATE."
        : (state.prepared || directMode())
          ? (ev.reasons[0] ? ev.reasons[0].message : "Add the required images.")
          : "Press Prepare to load this workflow and check your images.";
    }
    return ev;
  }

  function doGenerate() {
    if (!state.prepared) wstate.prepare(state); // Direct mode assembles now
    var ev = validator.evaluate(state);
    if (!ev.ready) { refresh(); return; }
    var request = compiler.compile(state);
    if (deps.onGenerate) deps.onGenerate(request);
  }

  function renderSelected() {
    var wf = registry.get(state.workflowId);
    dom.clear(root);
    var back = dom.el(doc, "button", { class: "hnk-btn", id: "hnkWfBack", text: "\u2190 " + dom.t("ai_wf_tools", "Workflow Tools") });
    dom.on(back, "click", function () { wstate.reset(state); renderList(); });
    root.appendChild(back);

    root.appendChild(dom.el(doc, "div", { class: "hnk-h-title", text: wf.title }));
    // Signature visual hero for the selected workflow
    if (wf.visual) {
      var hero = dom.el(doc, "div", { class: "hnk-wf-hero" });
      hero.style.backgroundImage = 'url("' + wf.visual + '")';
      root.appendChild(hero);
    }
    // What this workflow protects / uses — meaning at a glance
    var chips = dom.el(doc, "div", { class: "hnk-wf-chips" }, [
      wf.humanSubject ? dom.el(doc, "span", { class: "hnk-wf-chip protect", text: dom.t("ai_identity_lock", "Identity Lock") }) : null,
      wf.referenceTransfer ? dom.el(doc, "span", { class: "hnk-wf-chip", text: dom.t("ai_ref_transfer", "Reference Transfer") }) : null,
      dom.el(doc, "span", { class: "hnk-wf-chip", text: (modelRegistry.getModel(wf.route.modelId) || { displayName: wf.route.modelId }).displayName })
    ]);
    root.appendChild(chips);
    // Click 1 — explanation + expected result
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-desc",
      text: dom.t(registry.explanationKey(wf.id), wf.explanation) }));

    root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_req_images", "Required Images") }));
    var reqWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
    state.requiredInputs.forEach(function (inp) { reqWrap.appendChild(inputRow(inp)); });
    root.appendChild(reqWrap);
    if (state.optionalInputs.length) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_opt_images", "Optional Images") }));
      var optWrap = dom.el(doc, "div", { class: "hnk-wf-reqs" });
      state.optionalInputs.forEach(function (inp) { optWrap.appendChild(inputRow(inp)); });
      root.appendChild(optWrap);
    }

    /* Optional typed instruction for workflows whose prompts act on a user
       request (the web app's guides all expect typed input for these). */
    var INSTRUCTION_WFS = { "object-edit": 1, "text-logo": 1, "water-edit": 1, "bg-replace": 1 };
    if (INSTRUCTION_WFS[wf.id]) {
      root.appendChild(dom.el(doc, "div", { class: "hnk-sec", text: dom.t("ai_your_request", "Your Request (optional)") }));
      var uTxt = dom.el(doc, "textarea", { class: "hnk-inp hnk-wf-usertext", id: "hnkWfUserText",
        placeholder: dom.t("ai_your_request_ph", "e.g. remove the chair on the left / write HNK STUDIO in gold serif") });
      uTxt.value = state.userText || "";
      dom.on(uTxt, "input", function () { wstate.setUserText(state, uTxt.value); });
      root.appendChild(uTxt);
    }

    var route = state.resolvedRoute || wf.route;
    var m = modelRegistry.getModel(route.modelId);
    var out = state.output || {};
    root.appendChild(dom.el(doc, "div", { class: "hnk-wf-route",
      text: dom.t("ai_model_lbl", "Model") + ": " + (route.auto ? dom.t("qual_auto", "Auto") + " \u00B7 " : "") + (m ? m.displayName : route.modelId) +
            "   ·   Output: " + String(out.size || "2k").toUpperCase() + " · " + (out.ratio || "source") }));

    // Click 2 — Prepare
    nodes.prepareBtn = dom.el(doc, "button", { class: "hnk-btn hnk-prepare", id: "hnkWfPrepare", text: dom.t("ai_prepare", "Prepare (load & check)") });
    dom.on(nodes.prepareBtn, "click", function () { wstate.prepare(state); refresh(); });
    root.appendChild(nodes.prepareBtn);

    nodes.readyMsg = dom.el(doc, "div", { class: "hnk-status", id: "hnkWfStatus" });
    root.appendChild(nodes.readyMsg);

    // Click 3 — Generate
    nodes.generate = dom.el(doc, "button", { class: "hnk-btn hnk-generate", id: "hnkWfGenerate", text: dom.t("btn_generate", "GENERATE") });
    dom.on(nodes.generate, "click", doGenerate);
    root.appendChild(nodes.generate);

    refresh();
  }

  function addFromLibrary(inp) {
    var g = (typeof globalThis !== "undefined") ? globalThis : {};
    var getPick = g.HNK && g.HNK.getLibraryPickDataUrl;
    var hint = function (msg) { if (nodes.readyMsg) { nodes.readyMsg.className = "hnk-status"; nodes.readyMsg.textContent = msg; } };
    if (!getPick) { hint(dom.t("ai_lib_bridge_off", "Library bridge unavailable on this host.")); return; }
    getPick().then(function (res) {
      if (!res || !res.dataUrl) { hint(dom.t("ai_lib_pick_first", "Pick a photo from the Presets tab \u2192 Visual Library first.")); return; }
      wstate.setInput(state, inp.key, { source: "library", role: inp.role, ref: res.dataUrl, valid: true });
      refresh();
    }).catch(function () { hint(dom.t("ai_lib_load_fail", "Library image could not be loaded.")); });
  }

  function inputRow(inp) {
    var mark = dom.el(doc, "span", { class: "hnk-req-mark miss", text: dom.t("ai_missing", "Missing") });
    nodes["req_" + inp.key] = mark;
    var lbl = dom.t(registry.inputLabelKey(inp.label) || "", inp.label);
    var add = dom.el(doc, "button", { class: "hnk-btn hnk-req-add", id: "hnkWfAdd_" + inp.key, text: dom.t("ai_add", "Add") + " " + lbl });
    dom.on(add, "click", function () { addImage(inp); });
    var lib = dom.el(doc, "button", { class: "hnk-btn hnk-req-add hnk-req-lib", id: "hnkWfLib_" + inp.key, text: "\u2726 " + dom.t("ai_library", "Library") });
    dom.on(lib, "click", function () { addFromLibrary(inp); });
    return dom.el(doc, "div", { class: "hnk-req-row" }, [
      dom.el(doc, "span", { class: "hnk-req-label", text: lbl }), mark, add, lib
    ]);
  }

  function render(mountRoot) {
    root = mountRoot;
    if (state.workflowId) renderSelected(); else renderList();
    return root;
  }

  return { render: render, refresh: refresh, select: select, getState: function () { return state; } };
}

var API = { create: create };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowToolsScreen = API; }
})();
