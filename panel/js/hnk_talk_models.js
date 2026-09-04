/* ============================================================
   HNK talking-photo catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_TALK_MODELS table
   (docs/app/index.html), copied verbatim by
   tools/build_panel_talk_models.js so Media Lab ▸ Talk offers the SAME two
   published endpoints at the SAME published price, and never invents one.
   ============================================================ */
(function () {
"use strict";

var RH_TALK_MODELS = [
  { id:"talk-std", apiPath:"kling-v2-ai-avatar-standard/image-audio-to-video", label:"Kling V2 Standard", cny:0.36, imageParam:"imageUrl", audioParam:"audioUrl" },
  { id:"talk-pro", apiPath:"kling-v2-ai-avatar-pro/image-audio-to-video",      label:"Kling V2 Pro",      cny:0.72, imageParam:"imageUrl", audioParam:"audioUrl" }
];

function models() { return RH_TALK_MODELS.slice(); }
function get(id) {
  for (var i = 0; i < RH_TALK_MODELS.length; i++) if (RH_TALK_MODELS[i].id === id) return RH_TALK_MODELS[i];
  return RH_TALK_MODELS[0] || null;
}
/* the app's rhTalkBody, verbatim in behaviour: exactly the two required
   fields under the names the endpoint documents, plus the optional prompt
   only when the student actually wrote one */
function body(def, imageUrl, audioUrl, promptText) {
  var out = {};
  out[def.imageParam] = imageUrl || "";
  out[def.audioParam] = audioUrl || "";
  var p = String(promptText || "").trim();
  if (p) out.prompt = p;
  return out;
}

var API = { models: models, get: get, body: body };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.talkModels = API; }
})();
