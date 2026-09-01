/* ============================================================
   HNK AI Tools — tiny DOM helpers (UXP-safe)
   UXP's webview supports a DOM subset. These helpers use only the pieces the
   existing panel already relies on (createElement, textContent, appendChild,
   addEventListener, classList via className) so the UI controllers stay
   testable under a stub document, exactly like main.js.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _doc(ctx) { return (ctx && ctx.document) || (typeof document !== "undefined" ? document : null); }

/* el(doc, tag, {class, text, id, attrs}, [children]) */
/* v6.47.0 — "button" here means A CONTROL, and a control in this panel is a
   div. Adobe's UXP paints its own button widget over our stylesheet: on the
   owner's Photoshop every screen came back as rows of light-grey system
   pills, the widget flattened its own children (Home's two-line action cards
   arrived as one squashed line while the LEARNING cards beside them, which
   are divs, stacked correctly), and its font stack has no Burmese, so every
   Myanmar label inside one rendered as empty space. A div wears .hnk-btn,
   .hnk-action and the body font stack exactly as written. Same events, same
   ids, same classes — only the tag changes. */
function el(doc, tag, opts, children) {
  opts = opts || {};
  var isBtn = (tag === "button");
  var node = doc.createElement(isBtn ? "div" : tag);
  if (isBtn && node.setAttribute) { node.setAttribute("role", "button"); node.setAttribute("tabindex", "0"); }
  if (opts.class) node.className = opts.class;
  if (opts.id) node.id = opts.id;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.value != null) node.value = opts.value;
  if (opts.attrs) {
    for (var k in opts.attrs) {
      if (opts.attrs.hasOwnProperty(k) && node.setAttribute) node.setAttribute(k, opts.attrs[k]);
    }
  }
  if (children && children.length) {
    for (var i = 0; i < children.length; i++) {
      if (children[i]) node.appendChild(children[i]);
    }
  }
  return node;
}

function clear(node) {
  if (!node) return node;
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function on(node, evt, fn) {
  if (node && node.addEventListener) node.addEventListener(evt, fn);
  return node;
}

function setDisabled(node, disabled) {
  if (!node) return;
  node.disabled = !!disabled;
  // reflect in className so tests + CSS can see it without relying on :disabled
  var base = (node.className || "").replace(/\s*is-disabled/g, "");
  node.className = disabled ? (base + " is-disabled") : base;
}

/* ---------------- i18n bridge (AI Tools sub-app) ----------------
   main.js owns the 9-language I18N table and publishes a tiny read-only
   bridge on globalThis.HNK.i18n once it loads. The AI Tools modules load
   BEFORE main.js, so the lookup has to stay lazy: resolve at render time,
   never at module-definition time.

   t(key, fallbackEnglish) returns the active language's string, or the
   English literal the call site passes when the bridge is absent (Node
   unit tests, or a boot where main.js never ran). Call sites therefore
   read as plain English source and keep working headless. */
function _bridge() {
  try {
    var g = (typeof globalThis !== "undefined") ? globalThis : null;
    var b = g && g.HNK && g.HNK.i18n;
    return (b && typeof b.t === "function") ? b : null;
  } catch (e) { return null; }
}

function t(key, fallback) {
  var b = _bridge();
  if (b) {
    try {
      var v = b.t(key);
      /* t() echoes the key back when it is unknown — treat that as a miss. */
      if (typeof v === "string" && v && v !== key) return v;
    } catch (e) { }
  }
  return (fallback != null) ? String(fallback) : String(key);
}

/* Same lookup with {name}-style placeholder substitution. */
function tf(key, fallback, vars) {
  var s = t(key, fallback);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, function (m, k) {
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
  });
}

/* "Label: ON" / "Label: OFF" — one place so every toggle button agrees. */
function tOnOff(key, fallback, isOn) {
  return t(key, fallback) + ": " + (isOn ? t("on", "ON") : t("off", "OFF"));
}

var API = { el: el, clear: clear, on: on, setDisabled: setDisabled, doc: _doc, t: t, tf: tf, tOnOff: tOnOff };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.dom = API; }
})();
