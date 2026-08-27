/* ============================================================
   HNK AI Tools — RunningHub Enterprise Error Normalizer
   Spec §24 (Error Messages)

   Turns raw provider/network failures into the user-friendly, actionable
   messages the spec mandates. Never leaks provider IDs, node IDs, endpoints or
   raw stack traces to the user (spec §3 Home Rules, §21 Settings).
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _lc(s) { return String(s == null ? "" : s).toLowerCase(); }

// v6.19: a failed submit/query/upload now carries the parsed server body
// (runninghub-task-service.js / runninghub-upload-service.js), which often
// says exactly what went wrong (bad param, offline node, a hand-pasted
// apiPath from Settings) — surface it instead of a bare status code.
// Ported from the web app's identical rhFriendly() bodyMsg extraction.
function _bodyMsg(raw) {
  try {
    var bb = raw && raw.body;
    if (!bb) return "";
    return String(bb.msg || bb.message || (bb.error && (bb.error.message || bb.error)) || bb.code || "").slice(0, 120);
  } catch (e) { return ""; }
}

/* raw can be: an Error, a { status, code, message } object, or a string.
   ctx can carry { modelName, size, imageCount, maxImages } for richer copy. */
function normalize(raw, ctx) {
  ctx = ctx || {};
  var status = (raw && raw.status) || 0;
  var code = _lc(raw && raw.code);
  var msg = _lc((raw && (raw.message || raw.error)) || (typeof raw === "string" ? raw : ""));

  // Invalid / unauthorized key
  if (status === 401 || status === 403 || code === "invalid-key" ||
      msg.indexOf("unauthorized") !== -1 || msg.indexOf("invalid key") !== -1 ||
      msg.indexOf("api key") !== -1) {
    return {
      code: "invalid-key",
      title: "RunningHub Enterprise connection failed.",
      message: "RunningHub Enterprise connection failed.",
      bullets: [
        "the key is correct",
        "Enterprise-Shared API access is enabled",
        "the account has available credits"
      ]
    };
  }

  // Insufficient credits
  if (status === 402 || code === "insufficient-credits" ||
      msg.indexOf("credit") !== -1 || msg.indexOf("quota") !== -1 || msg.indexOf("balance") !== -1) {
    return {
      code: "insufficient-credits",
      title: "Not enough RunningHub Enterprise credits.",
      message: "Your account does not have enough credits to run this generation.",
      bullets: ["top up the Enterprise-Shared account", "or choose a lighter model or smaller size"]
    };
  }

  // Too many images
  if (code === "too-many-images" || msg.indexOf("too many") !== -1) {
    var name = ctx.modelName || "This model";
    return {
      code: "too-many-images",
      title: name + " cannot accept this number of reference images.",
      message: name + " cannot accept this number of reference images.",
      bullets: ["Choose Nano Banana 2 or remove some references."]
    };
  }

  // Unsupported size
  if (code === "unsupported-size" || msg.indexOf("size") !== -1 && msg.indexOf("support") !== -1) {
    var avail = (ctx.available || ["1K", "2K"]).map(function (s) { return String(s).toUpperCase(); });
    return {
      code: "unsupported-size",
      title: "The selected model does not support " + String(ctx.size || "4K").toUpperCase() + " output.",
      message: "The selected model does not support this output size.",
      bullets: ["Available sizes: " + avail.join(" and ") + "."]
    };
  }

  // Empty request
  if (code === "empty-request") {
    return {
      code: "empty-request",
      title: "Add a prompt or at least one image before generating.",
      message: "Add a prompt or at least one image before generating.",
      bullets: []
    };
  }

  // Timeout
  if (code === "timeout" || status === 408 || msg.indexOf("timeout") !== -1 || msg.indexOf("timed out") !== -1) {
    return {
      code: "timeout",
      title: "The generation took too long.",
      message: "RunningHub did not return a result in time.",
      bullets: ["Try again", "or reduce the size / number of variants"]
    };
  }

  // Network
  if (code === "network" || status === 0 || msg.indexOf("network") !== -1 ||
      msg.indexOf("fetch") !== -1 || msg.indexOf("econn") !== -1) {
    return {
      code: "network",
      title: "Could not reach RunningHub Enterprise.",
      message: "A network error stopped the request.",
      bullets: ["Check your internet connection and try again."]
    };
  }

  // Rate limited — the web app treats this as its own branch (not a
  // generic failure): busy, not broken, so the fix is "wait", not "check
  // your key".
  if (status === 429) {
    return {
      code: "rate-limited",
      title: "RunningHub Enterprise is busy right now.",
      message: "RunningHub Enterprise is busy right now.",
      bullets: ["Wait a moment and try again."]
    };
  }

  // Fallback — never expose raw provider internals, but DO surface the
  // server's own error text when we have it (bodyMsg) — a bare "something
  // went wrong" hides exactly the detail (bad param, offline node, wrong
  // hand-pasted endpoint) that would let a Settings-savvy user self-fix.
  var fallbackMsg = "Something went wrong while generating. Please try again.";
  var bm = _bodyMsg(raw);
  if (bm) fallbackMsg += " (" + bm + ")";
  return {
    code: "unknown",
    title: "The generation could not be completed.",
    message: fallbackMsg,
    bullets: []
  };
}

/* Render to a single user-facing string (for logs / toasts). */
function toText(n) {
  if (!n) return "";
  var out = n.title || n.message || "";
  if (n.bullets && n.bullets.length) {
    out += "\n\nCheck that:\n" + n.bullets.map(function (b) { return "• " + b; }).join("\n");
  }
  return out;
}

var API = { normalize: normalize, toText: toText };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.errorNormalizer = API; }
})();
