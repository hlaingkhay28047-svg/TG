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
  /* v6.28.2 — the separate "GPT Image 2 (needs endpoint)" placeholder is
     gone: the owner's verified Enterprise-Shared reference (2026-08-30)
     shows GPT Image 2's official endpoint is rhart-image-g-2-official —
     the rh-image-g2-off entry above, which has shipped working since the
     v2 port. One model, one entry; the old id resolves via LEGACY_ALIASES
     so every stored draft/preset keeps working. */
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
    detail: "Text to image only",
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
  /* v6.29.0 — FLUX.2 Dev's image-editing route, from the owner's OpenAPI
     spec for rhart-image/f-2-dev/edit-lora (2026-08-30). The endpoint is
     LoRA-capable; the panel ships it as plain FLUX.2 Dev editing (the
     documented default LoRA strength is 0) until a LoRA picker exists.
     One input image, no resolution tier — its ratio node select documents
     seven fixed ratios plus auto-match (see the adapter's fluxedit
     branch). The old "Limited editing support" note on flux-2-dev above
     is retired: t2i and edit are separate routes now. */
  {
    id: "flux-2-dev-edit",
    displayName: "FLUX.2 Dev — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit", "creative", "high-quality"],
    tagline: "High-fidelity FLUX.2 Dev image editing",
    detail: "Single-image edit · structure, subject and lighting preserved",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit", "local-edit", "retouch"]
  },
  /* v6.27.0 — the web app's remaining text-to-image models, ported with
     their confirmed RunningHub endpoints so the model set matches the app
     (owner request). Endpoint + field shapes live in runninghub-config. */
  {
    id: "nano-banana-pro-t2i",
    displayName: "Nano Banana Pro — Best Quality (T2I)",
    provider: "runninghub-enterprise",
    category: ["high-quality", "creative"],
    tagline: "The app's best-quality text-to-image",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      variants: true,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image", "high-quality"]
  },
  /* v6.29.0 — GPT Image 2's official text-to-image route, wired from the
     owner's full OpenAPI spec (2026-08-30); it was listed in the verified
     Enterprise-Shared reference and held until this parameter table
     arrived. The endpoint's own blurb is the poster engine's: cinematic
     posters, lighting, textures, visible text. */
  {
    id: "rh-image-g2-t2i",
    displayName: "GPT Image 2 — Poster & Text (T2I)",
    provider: "runninghub-enterprise",
    category: ["recommended", "high-quality", "creative"],
    tagline: "GPT Image 2 text-to-image — posters and visible text",
    detail: "Text to image only · Up to 4K",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k", "2k", "4k"],
      supportedRatios: ["auto", "1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "16:9", "9:16", "21:9"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image", "poster", "high-quality"]
  },
  {
    id: "qwen-image-3-pro-t2i",
    displayName: "Qwen 3.0 Pro — Asia Looks (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Asia-look text-to-image generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"],
      variants: true,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  {
    id: "rh-imagine-quality",
    displayName: "RH Imagine — Sharp & Clean (T2I)",
    provider: "runninghub-enterprise",
    category: ["fast", "creative"],
    tagline: "Sharp, clean text-to-image",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
      variants: true,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image", "fast"]
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
    /* v6.28.2 — relabeled for what it actually is: the owner's verified
       Enterprise-Shared reference (2026-08-30) maps rhart-image-g-2-official
       to "GPT Image 2 — official stable". Same id (stored configs keep
       working), same endpoint, same documented required quality — only the
       name stops hiding the model. Precedent: the Grok Imagine relabel. */
    displayName: "GPT Image 2 — Official",
    provider: "runninghub-enterprise",
    category: ["recommended", "image-edit", "multi-reference"],
    tagline: "GPT Image 2 (official stable) on the studio's RunningHub engine",
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
  /* v6.29.0 — identified by the endpoint's own fetched doc
     (api-448184504): rhart-image-g-2 is GPT Image 2's channel-low-price
     route (cheaper, stability best-effort per the doc). Same id/endpoint;
     relabeled like the official sibling above. */
  {
    id: "rh-image-g2",
    displayName: "GPT Image 2 — Low-cost",
    provider: "runninghub-enterprise",
    category: ["image-edit", "multi-reference", "fast"],
    tagline: "GPT Image 2 on the cheaper channel route — best-effort stability",
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
  /* v6.29.0 — identified by the owner's OpenAPI spec (2026-08-30):
     rhart-image-x-official/edit is "xai/grok-imagine-image/
     edit-official-stable", Grok Imagine's image edit model. Same id,
     same endpoint — relabeled like GPT Image 2 before it. Its body is
     prompt + image ONLY (no ratio, no size tier), so the capabilities
     stop advertising controls the endpoint cannot honour. */
  {
    id: "rh-image-x-off",
    displayName: "Grok Imagine — Edit (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Grok Imagine's official image edit model",
    detail: "Single-image edit · prompt-only control, keeps source framing",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["source"],
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
  /* v6.29.0 — the owner's OpenAPI spec titles this endpoint
     "xai/rhart-imagine-image-quality/edit-official-stable": the Grok
     Imagine quality-edit model — relabeled, prompt capped at the
     documented 4000, and the ratio list narrowed to the spec's own
     optional enum (auto + seven). */
  {
    id: "rh-imagine-quality-edit",
    displayName: "Grok Imagine — Quality Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit", "high-quality"],
    tagline: "Grok Imagine's quality-focused single-image editing",
    detail: "Single-image edit · 1K–2K only",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k", "2k"],
      supportedRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
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
   gpt-image-1: OpenAI API shutdown 2026-10-23. gpt-image-2-openai: the
   direct-OpenAI route left with its provider in v6.26.0. gpt-image-2: the
   never-configured placeholder retired in v6.28.2 — all three resolve to
   rh-image-g2-off, which the verified Enterprise-Shared reference
   (2026-08-30) identifies as GPT Image 2's real official endpoint. */
var LEGACY_ALIASES = { "gpt-image-1": "rh-image-g2-off", "gpt-image-2-openai": "rh-image-g2-off", "gpt-image-2": "rh-image-g2-off" };

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
