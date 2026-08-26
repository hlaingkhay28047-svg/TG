/* ============================================================
   HNK AI Tools — Model Capability Registry
   Spec §17 (Enterprise Model Registry) · §19 (Capability Registry)

   Model capabilities are DATA, never hardcoded in UI code. Every screen,
   validator and request compiler reads from this single registry so that
   adding or retiring a model is a one-file change.

   Dual module: works under Node (CommonJS, for the test harness) and inside
   the UXP panel (attaches to the global HNK namespace). No runtime deps.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

/* Capability vocabulary
   ---------------------
   textToImage      can generate from a prompt with no input image
   imageEdit        can edit / transform an input image
   multiReference   accepts more than one reference image in one request
   maxImages        hard ceiling on total image slots this model accepts
   supportedSizes   subset of ["1k","2k","4k"]
   supportedRatios  subset of the global RATIOS plus "auto" / "source"
   variants         true  = endpoint returns N images in one request
                    false = N variants must be issued as N sequential requests
   visibleText      how well the model renders legible text: none|low|medium|high
   identityRetention how well the model retains a subject's identity: low|medium|high
*/

var ALL_SIZES = ["1k", "2k", "4k"];
var COMMON_RATIOS = ["auto", "source", "1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "16:9", "9:16", "21:9"];

var MODELS = [
  {
    id: "nano-banana-2",
    displayName: "Nano Banana 2",
    provider: "runninghub-enterprise",
    category: ["recommended", "image-edit", "multi-reference"],
    tagline: "Best for multi-reference image editing",
    detail: "Supports multiple images · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 14,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["reference-transfer", "background-edit", "multi-reference", "subject-face"]
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    provider: "runninghub-enterprise",
    category: ["recommended", "high-quality", "multi-reference", "image-edit"],
    tagline: "Best for complex full-scene edits",
    detail: "Highest fidelity multi-reference compositing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 14,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "high",
      identityRetention: "high"
    },
    recommendedFor: ["full-scene-edit", "reference-transfer", "multi-reference"]
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    provider: "runninghub-enterprise",
    category: ["recommended", "creative", "image-edit", "high-quality"],
    tagline: "Best for posters, layouts and complex instructions",
    detail: "Image generation and editing · Strong at visible text",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 4,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "source", "1:1", "3:2", "2:3", "16:9", "9:16", "4:5", "5:4"],
      variants: true,
      visibleText: "high",
      identityRetention: "medium"
    },
    recommendedFor: ["poster", "text-logo", "layout", "creative"]
  },
  {
    id: "qwen-image-2",
    displayName: "Qwen Image 2.0",
    provider: "runninghub-enterprise",
    category: ["image-edit", "fast"],
    tagline: "Fast, controlled local edits",
    detail: "Strong instruction following",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: false,
      maxImages: 2,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "source", "1:1", "4:5", "3:4", "4:3", "3:2", "2:3", "16:9", "9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "medium"
    },
    recommendedFor: ["object-edit", "local-edit"]
  },
  {
    id: "qwen-image-2-pro",
    displayName: "Qwen Image 2.0 Pro",
    provider: "runninghub-enterprise",
    category: ["image-edit", "high-quality"],
    tagline: "Best for controlled local edits",
    detail: "Strong instruction following",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 3,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: ["auto", "source", "1:1", "4:5", "3:4", "4:3", "3:2", "2:3", "16:9", "9:16"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit", "local-edit", "retouch"]
  },
  {
    id: "flux-2-dev",
    displayName: "FLUX.2 Dev",
    provider: "runninghub-enterprise",
    category: ["creative", "fast"],
    tagline: "Best for creative text-to-image generation",
    detail: "Limited editing support",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "1:1", "4:5", "3:4", "4:3", "3:2", "2:3", "16:9", "9:16", "21:9"],
      variants: true,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image", "creative"]
  },
  {
    id: "wan-image-edit",
    displayName: "Wan Image Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit", "fast"],
    tagline: "Fast targeted image edits",
    detail: "Lightweight edit model",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 2,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "source", "1:1", "4:5", "3:4", "4:3", "16:9", "9:16"],
      variants: false,
      visibleText: "none",
      identityRetention: "medium"
    },
    recommendedFor: ["object-edit", "water-edit"]
  },
  {
    id: "upscale-pro",
    displayName: "AI Upscale Pro",
    provider: "runninghub-enterprise",
    category: ["image-edit", "high-quality"],
    tagline: "Detail-preserving upscale",
    detail: "Upscales while restoring natural skin, hair and fabric detail; identity and composition stay locked",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["2k", "4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale", "restore"]
  },
  {
    id: "rh-image-g2-off",
    displayName: "RH Image G-2 (Official)",
    provider: "runninghub-enterprise",
    category: ["recommended", "image-edit", "multi-reference"],
    tagline: "RunningHub's official general-purpose edit model",
    detail: "Multi-reference image editing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["reference-transfer", "background-edit", "multi-reference"]
  },
  {
    id: "rh-image-g2",
    displayName: "RH Image G-2",
    provider: "runninghub-enterprise",
    category: ["image-edit", "multi-reference"],
    tagline: "General-purpose multi-reference image editing",
    detail: "Multi-reference image editing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["reference-transfer", "background-edit", "multi-reference"]
  },
  {
    id: "rh-image-x-off",
    displayName: "RH Image X (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "RunningHub's official single-image edit model",
    detail: "Single-image edit · Up to 4K",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit", "local-edit"]
  },
  {
    id: "nano-banana-pro-off",
    displayName: "Nano Banana Pro (Official)",
    provider: "runninghub-enterprise",
    category: ["recommended", "high-quality", "multi-reference", "image-edit"],
    tagline: "RunningHub's official Nano Banana Pro endpoint",
    detail: "Highest fidelity multi-reference compositing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 14,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "high",
      identityRetention: "high"
    },
    recommendedFor: ["full-scene-edit", "reference-transfer", "multi-reference"]
  },
  {
    id: "wan-image-edit-pro",
    displayName: "Wan Image Edit Pro",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Higher-fidelity targeted image edits",
    detail: "Same edit model family as Wan Image Edit, higher tier",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 2,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["1:1", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "2:3", "3:2"],
      variants: false,
      visibleText: "none",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit", "water-edit"]
  },
  {
    id: "seedream-v4",
    displayName: "Seedream v4",
    provider: "runninghub-enterprise",
    category: ["creative", "image-edit", "multi-reference"],
    tagline: "Best for creative multi-reference generation and editing",
    detail: "Text-to-image and image editing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "medium"
    },
    recommendedFor: ["creative", "reference-transfer", "multi-reference"]
  },
  {
    id: "seedream-v4-5",
    displayName: "Seedream v4.5",
    provider: "runninghub-enterprise",
    category: ["creative", "image-edit", "multi-reference", "high-quality"],
    tagline: "Newer Seedream generation — same request shape as v4",
    detail: "Text-to-image and image editing · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "medium"
    },
    recommendedFor: ["creative", "reference-transfer", "multi-reference"]
  },
  {
    id: "rh-imagine-quality-edit",
    displayName: "RH Imagine Image Quality",
    provider: "runninghub-enterprise",
    category: ["image-edit", "high-quality"],
    tagline: "Quality-focused single-image editing",
    detail: "Single-image edit · 1K–2K only",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k", "2k"],
      supportedRatios: COMMON_RATIOS,
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit", "retouch"]
  },
  {
    id: "z-image-turbo",
    displayName: "Z-Image Turbo",
    provider: "runninghub-enterprise",
    category: ["fast", "image-edit"],
    tagline: "Fast single-image editing, fixed aspect ratios",
    detail: "Single-image edit · requires a fixed aspect ratio (no Auto)",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "1:1"],
      variants: false,
      visibleText: "low",
      identityRetention: "medium"
    },
    recommendedFor: ["object-edit", "local-edit"]
  },
  {
    id: "upscale-transparent",
    displayName: "Upscale Transparent",
    provider: "runninghub-enterprise",
    category: ["image-edit", "high-quality"],
    tagline: "Upscale that preserves transparency",
    detail: "Upscales to an explicit target resolution; keeps alpha channel",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale", "restore"]
  },
  {
    /* Migrated from gpt-image-1 — OpenAI retires that model's API on
       2026-10-23. Old saved drafts/presets carrying "gpt-image-1" resolve
       here via LEGACY_ALIASES below. (Distinct from the "gpt-image-2"
       entry above, which is RunningHub's hosted endpoint.) */
    id: "gpt-image-2-openai",
    displayName: "GPT Image 2 (OpenAI)",
    provider: "openai",
    category: ["creative", "image-edit"],
    tagline: "Direct OpenAI account — no Enterprise key needed",
    detail: "Image generation and editing straight from your own OpenAI API key",
    capabilities: {
      textToImage: true,
      imageEdit: true,
      multiReference: true,
      maxImages: 4,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "1:1", "3:2", "2:3"],
      variants: false,
      visibleText: "high",
      identityRetention: "medium"
    },
    recommendedFor: ["poster", "text-logo", "creative"]
  }
];

/* Categories the model selector exposes to the user (spec §8). */
var USER_CATEGORIES = [
  { id: "recommended", label: "Recommended" },
  { id: "creative", label: "Creative" },
  { id: "image-edit", label: "Image Edit" },
  { id: "multi-reference", label: "Multi-Reference" },
  { id: "fast", label: "Fast" },
  { id: "high-quality", label: "High Quality" },
  { id: "all", label: "All Models" }
];

var AUTO_MODEL_ID = "auto";

/* Retired model ids from older releases -> their current registry entry, so
   saved drafts/presets/settings keep resolving instead of failing.
   gpt-image-1: OpenAI API shutdown 2026-10-23 — migrated to gpt-image-2. */
var LEGACY_ALIASES = { "gpt-image-1": "gpt-image-2-openai" };

var _byId = {};
for (var i = 0; i < MODELS.length; i++) _byId[MODELS[i].id] = MODELS[i];

function listModels() { return MODELS.slice(); }

function getModel(id) {
  if (id === AUTO_MODEL_ID || id == null) return null;
  if (LEGACY_ALIASES[id]) id = LEGACY_ALIASES[id];
  return _byId[id] || null;
}

function hasModel(id) { return !!_byId[id] || !!(LEGACY_ALIASES[id] && _byId[LEGACY_ALIASES[id]]); }

function listByCategory(categoryId) {
  if (!categoryId || categoryId === "all") return MODELS.slice();
  return MODELS.filter(function (m) {
    return (m.category || []).indexOf(categoryId) !== -1;
  });
}

function categories() { return USER_CATEGORIES.slice(); }

var API = {
  ALL_SIZES: ALL_SIZES,
  COMMON_RATIOS: COMMON_RATIOS,
  AUTO_MODEL_ID: AUTO_MODEL_ID,
  listModels: listModels,
  getModel: getModel,
  hasModel: hasModel,
  listByCategory: listByCategory,
  categories: categories
};

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { (typeof globalThis !== "undefined" ? globalThis : this).HNK = (typeof globalThis !== "undefined" ? globalThis : this).HNK || {}; (typeof globalThis !== "undefined" ? globalThis : this).HNK.modelRegistry = API; }
})();
