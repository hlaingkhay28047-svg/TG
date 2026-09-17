/* ============================================================
   HNK AI Tools — Smart Workflow Request Compiler
   Spec §20 + self-contained button rule.

   Compiles the workflow state into a provider-agnostic request. The workflow's
   FULL protected prompt (base + reference-transfer rules + subject locks) and
   its negative prompt travel with the request — self-contained, no external
   guard. If the state wasn't staged (Direct-Generate mode), the protected
   prompt is assembled on the fly from the registry. None of this ever crosses
   into Free Generate (enforced by the mode controller, spec §16).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _req(p) { return (typeof module !== "undefined" && module.exports) ? require(p) : null; }
var registry = _req("./workflow-registry") || (globalThis.HNK && globalThis.HNK.workflowRegistry);
var resolver = _req("../models/capability-resolver") || (globalThis.HNK && globalThis.HNK.capabilityResolver);

function _scenePresetLine(state) {
  var lists = [state && state.requiredInputs, state && state.optionalInputs];
  for (var l = 0; l < lists.length; l++) {
    var list = lists[l] || [];
    for (var i = 0; i < list.length; i++) {
      var im = list[i] && list[i].image;
      if (im && im.source === "preset" && im.ref && im.preset && im.preset.title)
        return "\nSCENE PRESET: " + im.preset.title + (im.preset.group ? " \u2014 " + im.preset.group : "");
    }
  }
  return "";
}

function _collect(list) {
  return (list || [])
    .filter(function (s) { return s.image && s.image.ref; })
    .map(function (s) { return { key: s.key, role: s.role, source: s.image.source, ref: s.image.ref }; });
}

/* the student's own sentence: the screen's typed box, else the workflow's first
   text field (Selection Edit asks through a field, object-edit through the box) */
function _typedText(wf, state) {
  var t = String((state && state.userText) || "").trim();
  if (t) return t;
  var vals = (state && state.fieldVals) || {};
  var fields = (wf && wf.fields) || [];
  for (var i = 0; i < fields.length; i++) {
    if (fields[i] && fields[i].type === "text") {
      var v = String(vals[fields[i].key] == null ? "" : vals[fields[i].key]).trim();
      if (v) return v;
    }
  }
  return "";
}

function compile(state) {
  var wf = registry.get(state && state.workflowId);
  if (!wf) return null;

  // Prefer the staged (prepared) prompt; else assemble it now (Direct Generate).
  var prompt = state.compiledPrompt;
  var negative = state.negativePrompt;
  var rules = state.protectionRules;
  if (!prompt) {
    var c = registry.compile(wf.id, state.fieldVals) || {};
    prompt = c.prompt; negative = c.negativePrompt; rules = c.rules;
  }
  /* v6.35.0 — design fields resolve at the moment of generation, so a
     staged prompt can never carry stale toggle/text/colour choices. */
  if (wf.fields && wf.fields.length) {
    var cf = registry.compile(wf.id, state.fieldVals) || {};
    if (cf.prompt) { prompt = cf.prompt; negative = negative || cf.negativePrompt; rules = rules || cf.rules; }
  }

  /* The screen's optional typed instruction: without it, object-edit and
     text-logo told the model to perform "the requested edit" while no
     request existed anywhere in the payload. */
  if (state.userText) prompt += "\nUSER REQUEST: " + state.userText;

  /* v6.76.0 — a Library scene preset names itself to the model, one line,
     the same line the web app's wizard sends (wizSendPrompt). */
  prompt += _scenePresetLine(state);

  /* v6.83.0 — THE STUDENT'S OWN PROMPT WINS, WHOLE. The wizard's Advanced
     box shows exactly the text assembled above (protected prompt + design
     fields + USER REQUEST + SCENE PRESET); once the student edits it, what
     they see is what is sent — nothing is appended behind their back, and
     "Reset" brings the live prompt back. The negative prompt and the
     protection rules still travel: they are the workflow's, not the text's. */
  var promptEdited = false;
  if (state.promptOverride && String(state.promptOverride).trim()) {
    prompt = String(state.promptOverride);
    promptEdited = true;
  }

  var route = state.resolvedRoute || wf.route;
  // Output comes from the shared, preserved prefs — with sane fallbacks only.
  var out = Object.assign({ size: "2k", ratio: "source", quality: "high" }, state.output || {});
  var size = resolver.clampSize(route.modelId, out.size);
  /* v6.79.0 — the wizard's Count is the request's variants (the app's cloned
     selCount); the provider adapter takes the request count it implies */
  var variants = Math.max(1, Math.min(4, parseInt(out.variants, 10) || 1));
  var requestCount = 1;
  try { requestCount = resolver.requestCountForVariants(route.modelId, variants) || variants; } catch (e) { requestCount = variants; }

  var requiredImages = _collect(state.requiredInputs);
  var optionalImages = _collect(state.optionalInputs);
  return {
    mode: "smart-workflow",
    workflowId: wf.id,
    regionBounds: state.regionBounds || null,
    compiledPrompt: prompt,
    promptEdited: promptEdited,
    negativePrompt: negative || "",
    requiredImages: requiredImages,
    optionalImages: optionalImages,
    /* flat list the provider adapter uploads (first = main image, rest = refs) —
       the adapter reads request.images; without this a workflow run uploads nothing */
    images: requiredImages.concat(optionalImages),
    workflowProtectionRules: (rules || []).slice(),
    /* 6.101.0 — WHAT THE STUDENT ACTUALLY ASKED FOR, kept beside the prompt.
       A workflow run's history row previewed the workflow's own id, so eight runs
       of Selection Edit read "region-edit" eight times. The typed instruction lives
       in two places depending on the card — the screen's own box (state.userText)
       or the workflow's first text field — and both end up inside compiledPrompt
       where nothing can read them back reliably. This carries the plain sentence. */
    typedText: _typedText(wf, state),
    model: route.modelId,
    modelResolvedFromAuto: !!route.auto,
    output: {
      size: size,
      requestedSize: out.size,
      ratio: out.ratio,
      quality: out.quality,
      variants: variants
    },
    requestCount: requestCount
  };
}

var API = { compile: compile };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.workflowRequestCompiler = API; }
})();
