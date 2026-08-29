/* ============================================================
   HNK AI Tools — App controller (navigation + mode separation)
   Spec §2 (Navigation) · §16 (Mode Separation) · §28 (Final Rule)

   Owns the modeController instance and the current screen. Navigating between
   Free Generate and Workflow Tools routes through the modeController so the two
   modes' prompts/rules never cross. Screens share the same freeGenerate /
   workflow state objects the modeController holds, so a round-trip preserves
   the Free Generate draft and clears only workflow-owned state.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

var _CJS = (typeof module !== "undefined" && module.exports);
function dep(cjsPath, globalName) { return _CJS ? require(cjsPath) : globalThis.HNK[globalName]; }

var dom = dep("./dom", "dom");
var modeController = dep("../app/mode-controller", "modeController");
var homeScreen = dep("./screens/home-screen", "homeScreen");
var freeScreen = dep("./screens/free-generate-screen", "freeGenerateScreen");
var workflowScreen = dep("./screens/workflow-tools-screen", "workflowToolsScreen");
var historyScreen = dep("./screens/history-screen", "historyScreen");
var settingsScreen = dep("./screens/settings-screen", "settingsScreen");
var fstate = dep("../free-generate/free-generate-state", "freeGenerateState");
var wfStateSvc = dep("../workflows/workflow-state", "workflowState");

var SCREENS = ["home", "free-generate", "workflow-tools", "history", "settings"];

function create(deps) {
  var doc = deps.document;
  var rootEl = deps.root;
  var ctrl = modeController.create();
  var current = "home";
  var free = null, workflow = null;

  /* v6.27.0 — web-app parity (owner report: the localized pill row over the
     English tab bar read as two stacked navigations saying nothing). The web
     app's in-page section pills are short ENGLISH words in every locale
     (Freeform · Studio · Retouch · Path), and none of them repeats a bottom
     tab: so these pills drop the "Home" duplicate (the bottom Home tab now
     returns to the cards home from anywhere) and take fixed web-app words —
     Freeform · Workflows · History · Settings — one row, one language. */
  function navContainer(activeScreen) {
    var nav = dom.el(doc, "div", { class: "hnk-nav", id: "hnkNav" });
    [["free-generate", "Freeform"], ["workflow-tools", "Workflows"],
     ["history", "History"], ["settings", "Settings"]].forEach(function (pair) {
      var isActive = pair[0] === activeScreen;
      var b = dom.el(doc, "button", { class: "hnk-nav-btn" + (isActive ? " active" : ""), id: "hnkNav_" + pair[0], text: pair[1] });
      if (isActive) b.setAttribute("aria-current", "page");
      dom.on(b, "click", function () { navigate(pair[0]); });
      nav.appendChild(b);
    });
    return nav;
  }

  function navigate(screen) {
    if (SCREENS.indexOf(screen) === -1) return;
    // Enforce mode separation on the Free <-> Workflow boundary (§16).
    if (screen === "workflow-tools") modeController.switchToWorkflow(ctrl);
    else if (screen === "free-generate") modeController.switchToFreeGenerate(ctrl);
    current = screen;
    mount();
  }

  /* Reuse / Re-run a history entry (spec §22). Free entries restore the Free
     Generate prompt/model/output; workflow entries reopen that workflow. Mode
     separation is preserved — nothing crosses between the two states. */
  function reuseHistory(entry) {
    if (!entry) return;
    if (entry.mode === "smart-workflow" && entry.workflowId) {
      modeController.switchToWorkflow(ctrl);
      current = "workflow-tools";
      mount();
      if (workflow) workflow.select(entry.workflowId);
      return;
    }
    modeController.switchToFreeGenerate(ctrl);
    var fg = ctrl.freeGenerate;
    fstate.setPrompt(fg, entry.prompt || "");
    fstate.setNegativePrompt(fg, entry.negativePrompt || "");
    if (entry.model) fstate.setModel(fg, entry.model);
    if (entry.size) fstate.setSize(fg, String(entry.size).toLowerCase());
    if (entry.ratio) fstate.setRatio(fg, entry.ratio);
    if (entry.quality) fstate.setQuality(fg, entry.quality);
    if (entry.variants) fstate.setVariants(fg, entry.variants);
    current = "free-generate";
    mount();
  }

  /* Record the fired request into history (sanitized by the service) then hand
     off to the caller's onGenerate (spec §22). */
  function recordAndForward(request) {
    if (deps.history && request) {
      try { deps.history.addFromRequest(request, { now: deps.now, timeLabel: deps.timeLabel }); } catch (e) {}
    }
    if (deps.onGenerate) deps.onGenerate(request);
  }

  function mount() {
    dom.clear(rootEl);
    // Density (compact | normal | comfortable) as a root class (spec: density options).
    var density = (deps.settings && deps.settings.get().density) || "normal";
    rootEl.className = "hnk-root hnk-density-" + density;
    rootEl.appendChild(navContainer(current));
    var body = dom.el(doc, "div", { class: "hnk-screen", id: "hnkScreen_" + current });
    rootEl.appendChild(body);

    if (current === "home") {
      homeScreen.render(body, {
        document: doc,
        onNavigate: navigate,
        onWorkflow: function (wfId) {
          modeController.switchToWorkflow(ctrl);
          current = "workflow-tools";
          mount();
          if (workflow) workflow.select(wfId);
        }
      });
    } else if (current === "free-generate") {
      // Fresh screen bound to the (restored) free state.
      free = freeScreen.create({
        document: doc, state: ctrl.freeGenerate,
        ctx: { hasApiKey: deps.hasApiKey !== false, requestRunning: false },
        stubRef: deps.stubRef,
        host: deps.host,
        onChange: deps.onFreeChange,
        onGenerate: recordAndForward
      });
      free.render(body);
    } else if (current === "workflow-tools") {
      // Shared output prefs come from settings and are preserved across workflow
      // switches (never reset by selecting a workflow).
      if (deps.settings) {
        var sg = deps.settings.get();
        wfStateSvc.setOutput(ctrl.workflow, { size: sg.defaultSize, ratio: sg.defaultRatio, quality: sg.defaultQuality });
      }
      workflow = workflowScreen.create({
        document: doc, state: ctrl.workflow, stubRef: deps.stubRef, host: deps.host,
        directGenerate: function () { return deps.settings ? !!deps.settings.get().directGenerate : false; },
        onToggleDirect: function () { if (deps.settings) { var s = deps.settings.get(); deps.settings.set({ directGenerate: !s.directGenerate }); } },
        onGenerate: recordAndForward
      });
      workflow.render(body);
    } else if (current === "history" && deps.history) {
      historyScreen.render(body, {
        document: doc, history: deps.history,
        onReuse: function (entry) { reuseHistory(entry); }
      });
    } else if (current === "settings" && deps.settings) {
      settingsScreen.render(body, {
        document: doc, settings: deps.settings, rh: deps.rh,
        onLanguage: deps.onLanguage, onTheme: deps.onTheme,
        onDensity: function () { mount(); } // re-apply the density class immediately
      });
    } else {
      body.appendChild(dom.el(doc, "div", { class: "hnk-todo", text: current + " screen — coming in a later phase" }));
    }
    return body;
  }

  return {
    mount: function () { mount(); return rootEl; },
    navigate: navigate,
    current: function () { return current; },
    controller: function () { return ctrl; },
    freeScreen: function () { return free; },
    workflowScreen: function () { return workflow; }
  };
}

var API = { create: create, SCREENS: SCREENS };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.appController = API; }
})();
