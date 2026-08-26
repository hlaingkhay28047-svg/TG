/* ============================================================
   HNK AI Tools — OpenAI Provider Error Normalizer
   Spec §24 (Error Messages)

   Turns raw OpenAI failures into the user-friendly, actionable messages the
   spec mandates. Mirrors runninghub-error-normalizer.js's shape so both
   providers' errors render through the same status UI. Never leaks raw
   provider payloads or stack traces to the user.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function _lc(s) { return String(s == null ? "" : s).toLowerCase(); }

/* raw can be: an Error, a { status, code, body } object, or a string.
   ctx can carry { modelName } for richer copy. */
function normalize(raw, ctx) {
  ctx = ctx || {};
  var status = (raw && raw.status) || 0;
  var code = _lc(raw && raw.code);
  var apiMsg = _lc((raw && raw.body && raw.body.error && raw.body.error.message) || "");
  var apiCode = _lc((raw && raw.body && raw.body.error && raw.body.error.code) || "");
  var msg = _lc((raw && (raw.message || raw.error)) || (typeof raw === "string" ? raw : "")) || apiMsg;

  if (status === 401 || code === "invalid-key" || apiMsg.indexOf("api key") !== -1) {
    return {
      code: "invalid-key",
      title: "OpenAI connection failed.",
      message: "OpenAI connection failed.",
      bullets: ["the key is correct", "the key has image generation access", "the account has available credits"]
    };
  }

  if (status === 429 || apiCode === "insufficient_quota" || apiMsg.indexOf("quota") !== -1 || apiMsg.indexOf("credit") !== -1) {
    return {
      code: "insufficient-credits",
      title: "Not enough OpenAI credits or rate limit reached.",
      message: "Your account does not have enough credits, or you're being rate-limited.",
      bullets: ["top up the OpenAI account", "or wait a moment and try again"]
    };
  }

  if (status === 400 && (apiCode.indexOf("content_policy") !== -1 || apiMsg.indexOf("safety") !== -1 || apiMsg.indexOf("policy") !== -1)) {
    return {
      code: "content-policy",
      title: "Blocked by OpenAI's content policy.",
      message: "Blocked by OpenAI's content policy.",
      bullets: ["Try a different photo or reword the prompt."]
    };
  }

  if (code === "not-configured") {
    return {
      code: "not-configured",
      title: "OpenAI is not configured yet.",
      message: "Add your OpenAI key in Settings.",
      bullets: []
    };
  }

  if (code === "empty-request") {
    return {
      code: "empty-request",
      title: "Add a prompt or at least one image before generating.",
      message: "Add a prompt or at least one image before generating.",
      bullets: []
    };
  }

  if (code === "timeout" || status === 408 || msg.indexOf("timeout") !== -1 || msg.indexOf("timed out") !== -1) {
    return {
      code: "timeout",
      title: "The generation took too long.",
      message: "OpenAI did not return a result in time.",
      bullets: ["Try again", "or reduce the number of variants"]
    };
  }

  if (code === "network" || status === 0 || msg.indexOf("network") !== -1 || msg.indexOf("fetch") !== -1) {
    return {
      code: "network",
      title: "Could not reach OpenAI.",
      message: "A network error stopped the request.",
      bullets: ["Check your internet connection and try again."]
    };
  }

  return {
    code: "unknown",
    title: "The generation could not be completed.",
    message: "Something went wrong while generating. Please try again.",
    bullets: []
  };
}

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
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.openaiErrorNormalizer = API; }
})();
