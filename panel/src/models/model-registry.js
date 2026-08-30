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
  },
  /* ---------- v6.30.0 full-catalog wave ----------
     Generated from the fetched doc pages (api-<id> cited per entry); the
     request shapes live in runninghub-config + the adapter's kinds. */
  /* api-448184476 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v5-lite",
    displayName: "Seedream v5 Lite",
    provider: "runninghub-enterprise",
    category: ["creative","image-edit","multi-reference"],
    tagline: "Seedream's newest lite tier — multi-reference editing",
    detail: "Multi-reference edit · 2K-3K tiers",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["2k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "medium"
    },
    recommendedFor: ["creative","multi-reference"]
  },
  /* api-494859263 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v5-pro",
    displayName: "Seedream v5 Pro",
    provider: "runninghub-enterprise",
    category: ["high-quality","image-edit","multi-reference"],
    tagline: "Seedream's flagship multi-reference editing",
    detail: "Multi-reference edit · 1K-2K tiers",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "high",
      identityRetention: "high"
    },
    recommendedFor: ["reference-transfer","multi-reference"]
  },
  /* api-494859267 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "dola-seedream-5-pro",
    displayName: "Dola Seedream 5.0 Pro",
    provider: "runninghub-enterprise",
    category: ["high-quality","image-edit","multi-reference"],
    tagline: "Dola's Seedream 5.0 Pro channel — layered editing focus",
    detail: "Multi-reference edit · 1K-2K tiers",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "high",
      identityRetention: "high"
    },
    recommendedFor: ["reference-transfer","multi-reference"]
  },
  /* api-448184479 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "grok-image-i2i",
    displayName: "Grok 4.2 Image — Edit (Low-cost)",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "xAI Grok 4.2 image editing on the cheaper channel route",
    detail: "Single-image edit · prompt-only control",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "medium"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-497874395 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-image-3",
    displayName: "Qwen Image 3.0",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Qwen's newest instruction-following editor",
    detail: "Up to 3 reference images · 2K",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 3,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","source","1:1","4:5","3:4","4:3","3:2","2:3","16:9","9:16"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-494859264 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-image-3-pro",
    displayName: "Qwen Image 3.0 Pro",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Qwen's professional-tier editor",
    detail: "Up to 3 reference images · 2K",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 3,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","source","1:1","4:5","3:4","4:3","3:2","2:3","16:9","9:16"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","retouch"]
  },
  /* api-448184493 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan-25-image",
    displayName: "Wan 2.5 Preview — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Wan 2.5 preview multi-image understanding and editing",
    detail: "Up to 3 reference images",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 3,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9"],
      variants: false,
      visibleText: "none",
      identityRetention: "medium"
    },
    recommendedFor: ["object-edit"]
  },
  /* api-448184495 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-v1-off",
    displayName: "Nano Banana v1 — Edit (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "The original Nano Banana editor, official route",
    detail: "Up to 5 reference images",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 5,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","background-edit"]
  },
  /* api-448184498 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-v1",
    displayName: "Nano Banana v1 — Edit (Low-cost)",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "The original Nano Banana editor on the cheaper channel",
    detail: "Up to 5 reference images · best-effort stability",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 5,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","background-edit"]
  },
  /* api-448184501 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-2-off",
    displayName: "Nano Banana 2 — Edit (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit","multi-reference","high-quality"],
    tagline: "Nano Banana 2 on the official stable route",
    detail: "Up to 14 reference images · Up to 4K",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 14,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","source","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["multi-reference","reference-transfer"]
  },
  /* api-494859265 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-2-lite-off",
    displayName: "Nano Banana 2 Lite — Edit (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "Low-latency Nano Banana 2 Lite edits, official route",
    detail: "Up to 4 reference images · fast",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 4,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "low",
      identityRetention: "medium"
    },
    recommendedFor: ["local-edit"]
  },
  /* api-494859266 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-2-lite",
    displayName: "Nano Banana 2 Lite — Edit (Low-cost)",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "Low-latency Nano Banana 2 Lite on the cheaper channel",
    detail: "Up to 10 reference images · best-effort stability",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "low",
      identityRetention: "medium"
    },
    recommendedFor: ["local-edit"]
  },
  /* api-448184496 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-banana-pro-ultra",
    displayName: "Nano Banana Pro — Ultra 8K Edit",
    provider: "runninghub-enterprise",
    category: ["high-quality","image-edit","multi-reference"],
    tagline: "Nano Banana Pro's ultra tier — native 4K/8K output",
    detail: "Up to 10 reference images · 4K-8K",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["4k"],
      supportedRatios: ["auto","source","1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"],
      variants: false,
      visibleText: "high",
      identityRetention: "high"
    },
    recommendedFor: ["full-scene-edit","upscale"]
  },
  /* api-448184503 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "gpt-image-15-off",
    displayName: "GPT Image 1.5 — Edit (Official)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "GPT Image 1.5 official stable editing",
    detail: "Up to 10 reference images · 3 fixed sizes",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 10,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-465292102 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "jimeng-46",
    displayName: "Jimeng 4.6 — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit","multi-reference"],
    tagline: "Volcengine Jimeng 4.6 multi-reference editing",
    detail: "Up to 14 reference images",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 14,
      supportedSizes: ["1k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "medium"
    },
    recommendedFor: ["multi-reference","creative"]
  },
  /* api-498427798 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "sd5-layers",
    displayName: "Seedream 5 — Layer Split",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Decomposes one image into separate layers",
    detail: "Single image in · base + up to 16 layers out",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["local-edit"]
  },
  /* api-495680091 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-gp-standard",
    displayName: "Topaz Gigapixel Standard",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "General-purpose Gigapixel V2 upscale",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680090 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-gp-lowres",
    displayName: "Topaz Gigapixel Low-Res",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Gigapixel V2 tuned for low-resolution sources",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680089 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-gp-text",
    displayName: "Topaz Gigapixel Text",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Clean upscaling for text, logos and shapes",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680092 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-gp-hifi",
    displayName: "Topaz Gigapixel HiFi",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "High-fidelity Gigapixel V2 upscale",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680093 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-gp-art",
    displayName: "Topaz Gigapixel Art",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Gigapixel V2 for illustration and CGI",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680095 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-up-faces",
    displayName: "Topaz Detail Faces",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Upscale focused on recovering facial detail",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-495680096 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "topaz-up-hifi3",
    displayName: "Topaz High Fidelity 3",
    provider: "runninghub-enterprise",
    category: ["image-edit","high-quality"],
    tagline: "Faithful upscale that preserves original detail",
    detail: "Upscales to an explicit target resolution",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["source"],
      variants: false,
      visibleText: "keep",
      identityRetention: "high"
    },
    recommendedFor: ["upscale","restore"]
  },
  /* api-448184482 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux-2-dev-edit-plain",
    displayName: "FLUX.2 Dev — Edit (plain)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "FLUX.2 Dev's plain editing route (no LoRA graph)",
    detail: "Single-image edit · structure preserved",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184483 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux-klein-9b-edit",
    displayName: "FLUX.2 Klein 9B — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "Klein 9B's flagship sub-second editing",
    detail: "Single-image edit · sub-second",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184484 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux-klein-4b-edit",
    displayName: "FLUX.2 Klein 4B — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "Klein 4B's ultra-fast editing",
    detail: "Single-image edit · sub-second",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2","source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184485 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux-klein-4b-edit-lora",
    displayName: "FLUX.2 Klein 4B — Edit (LoRA)",
    provider: "runninghub-enterprise",
    category: ["image-edit","fast"],
    tagline: "Klein 4B editing on the LoRA graph (server default adapter)",
    detail: "Single-image edit · LoRA graph",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2","source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184480 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux-kontext-lora",
    displayName: "FLUX Kontext — Edit (LoRA)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Kontext instruction editing on the LoRA graph",
    detail: "Single-image edit · instruction-driven",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184487 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-edit-2511",
    displayName: "Qwen Edit 2511",
    provider: "runninghub-enterprise",
    category: ["image-edit","multi-reference"],
    tagline: "Qwen's 20B edit model, version 2511",
    detail: "Up to 3 reference images",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: true,
      maxImages: 3,
      supportedSizes: ["1k"],
      supportedRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2","source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184486 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-edit-2511-lora",
    displayName: "Qwen Edit 2511 (LoRA)",
    provider: "runninghub-enterprise",
    category: ["image-edit"],
    tagline: "Qwen Edit 2511 on the LoRA graph (server default adapter)",
    detail: "Single-image edit · LoRA graph",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2","source"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184492 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan-22-image",
    displayName: "Wan 2.2 — Edit",
    provider: "runninghub-enterprise",
    category: ["image-edit","creative"],
    tagline: "Wan 2.2's MoE redraw and style transfer",
    detail: "Single-image edit · redraw and style transfer",
    capabilities: {
      textToImage: false,
      imageEdit: true,
      multiReference: false,
      maxImages: 1,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "high"
    },
    recommendedFor: ["object-edit","local-edit"]
  },
  /* api-448184505 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v4-t2i",
    displayName: "Seedream v4 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Seedream v4 layout-focused generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184506 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v45-t2i",
    displayName: "Seedream v4.5 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Seedream v4.5 typography-grade generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["2k","4k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184507 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v5-lite-t2i",
    displayName: "Seedream v5 Lite (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Seedream v5 Lite generation with CoT reasoning",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-494859257 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "seedream-v5-pro-t2i",
    displayName: "Seedream v5 Pro (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Seedream v5 Pro commercial-grade generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-494859262 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "dola-sd5-t2i",
    displayName: "Dola Seedream 5.0 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Dola's Seedream 5.0 Pro text-to-image channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184508 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "grok-image-t2i",
    displayName: "Grok 4.2 Image (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "xAI Grok 4.2 generation on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448969339 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "grok-imagine-t2i",
    displayName: "Grok Imagine (T2I, Official)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Grok Imagine's official text-to-image",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","2:1","20:9","16:9","4:3","3:2","1:1","2:3","3:4","9:16","9:20","1:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-497874394 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-image-3-t2i",
    displayName: "Qwen 3.0 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Qwen 3.0 generation with auto resolution",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184511 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-image-2-t2i",
    displayName: "Qwen 2.0 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Qwen 2.0 fast bilingual-text generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184512 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-image-2-pro-t2i",
    displayName: "Qwen 2.0 Pro (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Qwen 2.0 Pro premium generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184526 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan-25-t2i",
    displayName: "Wan 2.5 Preview (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Wan 2.5 preview generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184525 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan-27-t2i",
    displayName: "Wan 2.7 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Wan 2.7 generation with thinking mode",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184527 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan-27-pro-t2i",
    displayName: "Wan 2.7 Pro (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Wan 2.7 Pro up to 4K generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184532 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-v1-off-t2i",
    displayName: "Nano Banana v1 (T2I, Official)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "The original Nano Banana generator, official route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184535 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-v1-t2i",
    displayName: "Nano Banana v1 (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Original Nano Banana on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184536 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-pro-low-t2i",
    displayName: "Nano Banana Pro (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Nano Banana Pro generation on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184533 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano-pro-ultra-t2i",
    displayName: "Nano Banana Pro Ultra 8K (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Nano Banana Pro's native 4K/8K generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["4k"],
      supportedRatios: ["auto","1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184537 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano2-off-t2i",
    displayName: "Nano Banana 2 (T2I, Official)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Nano Banana 2 generation, official route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184538 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano2-low-t2i",
    displayName: "Nano Banana 2 (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Nano Banana 2 on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-494859260 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano2-lite-off-t2i",
    displayName: "Nano Banana 2 Lite (T2I, Official)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Low-latency Nano Banana 2 Lite generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-494859261 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "nano2-lite-low-t2i",
    displayName: "Nano Banana 2 Lite (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Nano Banana 2 Lite on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184539 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "gpt15-off-t2i",
    displayName: "GPT Image 1.5 (T2I, Official)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "GPT Image 1.5 official stable generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184541 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "gpt2-low-t2i",
    displayName: "GPT Image 2 (T2I, Low-cost)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "GPT Image 2 generation on the cheaper channel",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k","2k","4k"],
      supportedRatios: ["auto","1:1","2:3","3:2","4:5","5:4","4:3","3:4","16:9","9:16","21:9","9:21","2:1","1:2","3:1","1:3"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-465292103 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "jimeng-t2i",
    displayName: "Jimeng 4.6 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Volcengine Jimeng 4.6 generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1"],
      variants: false,
      visibleText: "medium",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184494 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-v6-t2i",
    displayName: "Midjourney v6 (Artistic",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184530 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-v61-t2i",
    displayName: "Midjourney v6.1 (Artistic",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184529 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-niji6-t2i",
    displayName: "Midjourney Niji 6 (Anime",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184531 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-v7-t2i",
    displayName: "Midjourney v7 (Artistic",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184528 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-niji7-t2i",
    displayName: "Midjourney Niji 7 (Anime",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-494859259 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "mj-v82-t2i",
    displayName: "Midjourney v8.2 (Preview",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Midjourney aesthetics via the youchuan route",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","4:3","3:2","16:9","3:4","2:3","9:16"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184510 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-2512-t2i",
    displayName: "Qwen 2512 (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Qwen 2512 typography-strong generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184509 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "qwen-2512-lora-t2i",
    displayName: "Qwen 2512 (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Qwen 2512 on the LoRA graph (server default adapter)",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184514 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "z-turbo-t2i",
    displayName: "Z-Image Turbo (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Sub-second bilingual-text generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "high",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184513 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "z-turbo-lora-t2i",
    displayName: "Z-Image Turbo (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Z-Image Turbo on the LoRA graph (server default adapter)",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184517 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "flux2-lora-t2i",
    displayName: "FLUX.2 Dev (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "FLUX.2 Dev generation on the LoRA graph",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184520 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "klein9b-t2i",
    displayName: "FLUX.2 Klein 9B (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Klein 9B sub-second generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184519 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "klein9b-lora-t2i",
    displayName: "FLUX.2 Klein 9B (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Klein 9B generation on the LoRA graph",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184521 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "klein4b-t2i",
    displayName: "FLUX.2 Klein 4B (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Klein 4B ultra-fast generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184522 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "klein4b-lora-t2i",
    displayName: "FLUX.2 Klein 4B (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Klein 4B generation on the LoRA graph (no file_type field)",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184515 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "krea-t2i",
    displayName: "FLUX Krea (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Krea's film-look aesthetics on the LoRA graph",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184523 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "fdev-t2i",
    displayName: "FLUX.1 Dev (T2I)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "FLUX.1 Dev rectified-flow generation",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184516 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "fdev-lora-t2i",
    displayName: "FLUX.1 Dev (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "FLUX.1 Dev on the LoRA graph (server default adapter)",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
  /* api-448184524 — generated with the v6.30.0 full-catalog wave. */
  {
    id: "wan22-lora-t2i",
    displayName: "Wan 2.2 (T2I, LoRA)",
    provider: "runninghub-enterprise",
    category: ["creative"],
    tagline: "Wan 2.2 MoE generation on the LoRA graph",
    detail: "Text to image only",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      multiReference: false,
      maxImages: 0,
      supportedSizes: ["1k"],
      supportedRatios: ["auto","1:1","3:4","4:3","9:16","16:9","2:3","3:2"],
      variants: false,
      visibleText: "low",
      identityRetention: "low"
    },
    recommendedFor: ["text-to-image"]
  },
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
