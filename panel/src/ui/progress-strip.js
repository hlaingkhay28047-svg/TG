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

/* 6.135.0 — THE CLOCK. The owner, 2026-09-25: "Generate မှာ loading time
   တွေမပါသေးတာတေွ ပါအောင်ထည့်ပေးပါ". Freeform, Video, Upscale, V\u2192V, Talking
   Photo, Text\u2192Image, Retouch, Path and Imagine all count their seconds; this
   strip — the one every Smart Workflow run in the panel draws — showed the stage
   name and nothing else, so a two-minute run looked identical at 5s and at 115s.
   secLabel is a pure function so the wording is testable without a DOM or a timer;
   the running total stays on the terminal line, which is the number a studio
   actually wants ("Done \u00b7 48s"). */
function secLabel(base, ms) {
  var b = String(base || "");
  /* nothing to hang the number on: an empty strip line stays empty rather than
     becoming a bare " \u00b7 9s" with no word in front of it */
  if (!b) return "";
  var n = Math.round((Number(ms) || 0) / 1000);
  if (!(n > 0)) return b;
  return b + " \u00b7 " + n + "s";
}

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
  /* 6.135.0 — the run clock: t0 is set by the first live stage and survives every
     stage change after it, so the number is the whole run's age, not this step's.
     tick repaints once a second and is always cleared before it can outlive a run. */
  var t0 = 0, running = false, tick = null;
  var now = (typeof deps.now === "function") ? deps.now : function () { return Date.now(); };
  function stopTick() { if (tick) { try { clearInterval(tick); } catch (e) { } tick = null; } }
  function startTick() {
    stopTick();
    if (typeof setInterval !== "function") return;
    tick = setInterval(function () { try { paint(); } catch (e) { stopTick(); } }, 1000);
    /* a panel that closes mid-run must not leave a timer behind */
    if (tick && typeof tick.unref === "function") { try { tick.unref(); } catch (e2) { } }
  }
  /* running, not t0, says whether a run is being timed: an injected or monotonic
     clock may legitimately read 0 at the first stage, and a falsy t0 would then
     silently drop the seconds for the whole run. */
  function elapsed() { return running ? Math.max(0, now() - t0) : 0; }

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

  /* 6.168.2 — WHERE THE STRIP LIVES. It was appended to the mount root, which put
     it at the very bottom of the page: on a Smart Workflow the student pressed
     GENERATE near the top and then had to scroll past the Results card and the
     History link to find out whether anything was happening at all. The owner
     photographed exactly that and asked for it beside the button.

     So a screen that wants the strip in a particular place renders an empty anchor
     with id hnkRunHere, and the strip moves itself into it — appendChild moves a
     node that is already in the document, so it follows the anchor across every
     repaint. A screen with no anchor keeps the old behaviour, appended to the root,
     so every other page is untouched. */
  function anchor() {
    if (!doc || !rootEl) return null;
    try {
      if (typeof rootEl.querySelector === "function") return rootEl.querySelector("#hnkRunHere");
    } catch (e) { }
    return null;
  }

  /* The app controller clears the root on every navigation; re-attach. */
  function ensure() {
    if (!doc || !rootEl) return false;
    if (!el) build();
    var host = anchor() || rootEl;
    var attached = false;
    try {
      var k = host._kids || (host.children ? Array.prototype.slice.call(host.children) : null);
      if (k) attached = k.indexOf(el) !== -1;
      else attached = !!(el.parentNode && el.parentNode === host);
    } catch (e) { attached = false; }
    if (!attached) { try { host.appendChild(el); } catch (e2) { return false; } }
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
    /* 6.135.0 — the seconds ride on whatever the line already says: the stage's own
       word while it runs, the caller's message or "Done"/"Failed" when it ends. */
    var base = message || (terminal ? labelFor(terminal) : (current ? labelFor(current) : ""));
    msgEl.textContent = running ? secLabel(base, elapsed()) : base;
  }

  /* Lifecycle hook — accepts machine stages AND bare step names. */
  function onStage(stage, info) {
    var step = stepForStage(stage) || (stepIndex(stage) !== -1 ? stage : null);
    if (step === "done") { setDone((info && info.label) || ""); return; }
    if (step === "error") { setError((info && info.label) || ""); return; }
    if (!step) return;
    if (!running || terminal) { t0 = now(); running = true; }   /* a fresh run: the first live stage starts the clock */
    terminal = null;
    current = step;
    message = "";
    startTick();
    paint();
  }

  /* the terminal lines keep the total and stop the timer — never the other way round */
  function setDone(msg) { stopTick(); terminal = "done"; message = msg || labelFor("done"); paint(); }
  function setError(msg) { stopTick(); terminal = "error"; message = msg || labelFor("error"); paint(); }
  function reset() { stopTick(); t0 = 0; running = false; current = null; terminal = null; message = ""; paint(); }

  return {
    onStage: onStage,
    setDone: setDone,
    setError: setError,
    reset: reset,
    ensure: ensure,
    el: function () { if (!el) build(); return el; },
    secLabel: secLabel,
    elapsedMs: elapsed,
    stop: stopTick,
    state: function () { return { step: current, terminal: terminal, message: message, elapsedMs: elapsed() }; }
  };
}

var API = {
  STEPS: STEPS,
  LABELS: LABELS,
  LABEL_KEYS: LABEL_KEYS,
  secLabel: secLabel,
  stepForStage: stepForStage,
  stepIndex: stepIndex,
  labelFor: labelFor,
  create: create
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.progressStrip = API; }
})();
