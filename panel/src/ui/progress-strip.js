/* ============================================================
   HNK AI Tools — Progress Strip (v6.9.0 "Results are real")
   Blueprint §5 plugin v6.9.0 · audit item #2 (generation is feedback-free).

   A compact staged status strip:  queued → uploading → generating →
   downloading → placing — driven by the provider adapters' onStage lifecycle
   (generate-state-machine stages) plus the bootstrap's PLACING/READY hooks.
   Burmese-first labels, no emoji (do-not-break law).

   Design notes:
     - stepForStage() is a PURE mapping (machine stage -> strip step) so the
       progress model is unit-testable without a DOM.
     - ensure() re-attaches the strip element after the app-controller's
       mount() clears the root on navigation — the strip survives remounts.
     - setError()/setDone() render honest terminal states; errors finally
       become VISIBLE in the live panel (the v6.8.0 no-op status bug).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
var dom = _CJS ? require("./dom") : globalThis.HNK.dom;

var STEPS = ["queued", "uploading", "generating", "downloading", "placing"];

/* Burmese-first, English hint in parentheses; no emoji. */
var LABELS = {
  queued: "တန်းစီနေသည် (Queued)",
  uploading: "ပုံတင်နေသည် (Uploading)",
  generating: "ဖန်တီးနေသည် (Generating)",
  downloading: "ရလဒ်ဆွဲယူနေသည် (Downloading)",
  placing: "Photoshop ထဲ ထည့်နေသည် (Placing)",
  done: "ပြီးပါပြီ (Done)",
  error: "မအောင်မြင်ပါ (Failed)"
};

/* machine stage (generate-state-machine / adapters) -> strip step. */
var STAGE_TO_STEP = {
  IDLE: "queued", VALIDATING: "queued", PREPARING_IMAGES: "queued",
  UPLOADING: "uploading", BUILDING_REQUEST: "uploading",
  SUBMITTING: "generating", PROCESSING: "generating",
  DOWNLOADING_RESULT: "downloading",
  PLACING: "placing",
  READY: "done",
  ERROR: "error", CANCELLED: "error", TIMEOUT: "error"
};

/* Dictionary key per step — the 9-language table in main.js owns the wording;
   LABELS above stays the Burmese-first default used headless (Node tests) and
   whenever main.js has not published its i18n bridge yet. */
var LABEL_KEYS = {
  queued: "stage_queued", uploading: "stage_uploading", generating: "stage_generating",
  downloading: "stage_downloading", placing: "stage_placing",
  done: "st_done", error: "st_err"
};

function stepForStage(stage) { return STAGE_TO_STEP[stage] || null; }
function stepIndex(step) { return STEPS.indexOf(step); }
function labelFor(step) {
  var k = LABEL_KEYS[step];
  var def = LABELS[step] || String(step || "");
  return k ? dom.t(k, def) : def;
}

/* create({ document, root }) — root is the AI Tools mount root. */
function create(deps) {
  deps = deps || {};
  var doc = deps.document;
  var rootEl = deps.root;
  var el = null, rowEl = null, msgEl = null;
  var current = null;   // active step name or null (hidden)
  var terminal = null;  // "done" | "error" | null
  var message = "";

  function build() {
    el = dom.el(doc, "div", { class: "hnk-progress", id: "hnkProgressStrip" });
    rowEl = dom.el(doc, "div", { class: "hnk-progress-row" });
    STEPS.forEach(function (s) {
      rowEl.appendChild(dom.el(doc, "span", { class: "hnk-pstep", id: "hnkPstep_" + s, text: labelFor(s) }));
    });
    el.appendChild(rowEl);
    msgEl = dom.el(doc, "div", { class: "hnk-progress-msg", id: "hnkProgressMsg" });
    el.appendChild(msgEl);
  }

  /* The app controller clears the root on every navigation; re-attach. */
  function ensure() {
    if (!doc || !rootEl) return false;
    if (!el) build();
    var attached = false;
    try {
      var k = rootEl._kids || (rootEl.children ? Array.prototype.slice.call(rootEl.children) : null);
      if (k) attached = k.indexOf(el) !== -1;
      else attached = !!(el.parentNode && el.parentNode === rootEl);
    } catch (e) { attached = false; }
    if (!attached) { try { rootEl.appendChild(el); } catch (e2) { return false; } }
    return true;
  }

  function paint() {
    if (!ensure()) return;
    var active = current && !terminal;
    el.className = "hnk-progress" +
      (active ? " on" : "") +
      (terminal === "done" ? " ok" : "") +
      (terminal === "error" ? " err" : "");
    var idx = active ? stepIndex(current) : (terminal === "done" ? STEPS.length : -1);
    STEPS.forEach(function (s, i) {
      var node = null;
      try { node = (rowEl._kids && rowEl._kids[i]) || (rowEl.children && rowEl.children[i]) || null; } catch (e) {}
      if (!node) return;
      node.className = "hnk-pstep" + (i < idx ? " done" : "") + (active && i === idx ? " on" : "");
    });
    msgEl.textContent = message || (terminal ? labelFor(terminal) : (current ? labelFor(current) : ""));
  }

  /* Lifecycle hook — accepts machine stages AND bare step names. */
  function onStage(stage, info) {
    var step = stepForStage(stage) || (stepIndex(stage) !== -1 ? stage : null);
    if (step === "done") { setDone((info && info.label) || ""); return; }
    if (step === "error") { setError((info && info.label) || ""); return; }
    if (!step) return;
    terminal = null;
    current = step;
    message = "";
    paint();
  }

  function setDone(msg) { terminal = "done"; message = msg || labelFor("done"); paint(); }
  function setError(msg) { terminal = "error"; message = msg || labelFor("error"); paint(); }
  function reset() { current = null; terminal = null; message = ""; paint(); }

  return {
    onStage: onStage,
    setDone: setDone,
    setError: setError,
    reset: reset,
    ensure: ensure,
    el: function () { if (!el) build(); return el; },
    state: function () { return { step: current, terminal: terminal, message: message }; }
  };
}

var API = {
  STEPS: STEPS,
  LABELS: LABELS,
  LABEL_KEYS: LABEL_KEYS,
  stepForStage: stepForStage,
  stepIndex: stepIndex,
  labelFor: labelFor,
  create: create
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.progressStrip = API; }
})();
