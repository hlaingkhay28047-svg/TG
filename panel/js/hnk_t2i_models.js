/* ============================================================
   HNK text-to-image model catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_T2I_MODELS table
   (docs/app/index.html), extracted by tools/build_panel_t2i_models.js
   so the panel's Text to Image page offers the same models, in the
   same order, with the same ratio and size choices — and never
   invents an endpoint. test/verify_panel_t2i_catalog.js pins this
   file to the app.
   ============================================================ */
(function () {
"use strict";
var RH_T2I_MODELS = [
  { id:"flux-2-dev", label:"Flux 2 Dev — Standard (fast)", apiPath:"rhart-image/f-2-dev/text-to-image", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"nano-banana-pro-t2i", label:"Nano Banana Pro — Best Quality", apiPath:"rhart-image-n-pro-official/text-to-image", ratios:["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], resolutionField:"resolution", promptMax:20000 },
  { id:"rh-image-g2-t2i", label:"GPT Image 2 (Official) — Poster & Text", apiPath:"rhart-image-g-2-official/text-to-image", ratios:["1:1","1:2","2:1","1:3","3:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","21:9","9:21","16:9"], resolutionField:"resolution", promptMax:20000 },
  { id:"rh-imagine-quality", label:"RH Imagine — Sharp & Clean", apiPath:"rhart-imagine-image-quality/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3"], resolutionField:"resolution", resolutionEnum:["1k","2k"], promptMax:4000 },
  { id:"qwen-image-3-pro-t2i", label:"Qwen 3.0 Pro — Asia Looks", apiPath:"alibaba/qwen-image-3.0-pro/text-to-image", uiRatios:["1:1","2:3","3:2","3:4","4:3","9:16","16:9"], sizeField:"size", promptMax:3000 },
  { id:"youchuan-v81", label:"Midjourney v8.1 — Artistic", apiPath:"youchuan/text-to-image-v81", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"seedream-v4-t2i", label:"Seedream v4 — T2I", apiPath:"seedream-v4/text-to-image", resolutionField:"resolution", promptMax:2000 },
  { id:"seedream-v45-t2i", label:"Seedream v4.5 — T2I", apiPath:"seedream-v4.5/text-to-image", resolutionField:"resolution", resolutionEnum:["2k","4k"], promptMax:2000 },
  { id:"seedream-v5-lite-t2i", label:"Seedream v5 Lite — T2I", apiPath:"seedream-v5-lite/text-to-image", resolutionField:"resolution", resolutionEnum:["2k","3k"], promptMax:2000 },
  { id:"seedream-v5-pro-t2i", label:"Seedream v5 Pro — T2I", apiPath:"seedream-v5-pro/text-to-image", resolutionField:"resolution", resolutionEnum:["1k","2k"], promptMax:5000 },
  { id:"dola-sd5-t2i", label:"Dola Seedream 5.0 — T2I", apiPath:"dola-Seedream-5.0-pro/text-to-image", resolutionField:"resolution", resolutionEnum:["1k","2k"], promptMax:5000 },
  { id:"grok-image-t2i", label:"Grok 4.2 Image — T2I (Low-cost)", apiPath:"rhart-image-g/text-to-image", ratios:["960x960","720x1280","1280x720","1168x784","784x1168"] },
  { id:"grok-imagine-t2i", label:"Grok Imagine — T2I (Official)", apiPath:"rhart-image-x-official/text-to-image", ratios:["2:1","20:9","16:9","4:3","3:2","1:1","2:3","3:4","9:16","9:20","1:2"], promptMax:20000 },
  { id:"qwen-image-3-t2i", label:"Qwen 3.0 — T2I", apiPath:"alibaba/qwen-image-3.0/text-to-image", uiRatios:["1:1","2:3","3:2","3:4","4:3","9:16","16:9"], sizeField:"size", sizeMap:"qwen3", promptMax:3000 },
  { id:"qwen-image-2-t2i", label:"Qwen 2.0 — T2I", apiPath:"alibaba/qwen-image-2.0/text-to-image", uiRatios:["1:1","2:3","3:2","3:4","4:3","9:16","16:9"], sizeField:"size", sizeMap:"qwen2", promptMax:800 },
  { id:"qwen-image-2-pro-t2i", label:"Qwen 2.0 Pro — T2I", apiPath:"alibaba/qwen-image-2.0-pro/text-to-image", uiRatios:["1:1","2:3","3:2","3:4","4:3","9:16","16:9"], sizeField:"size", sizeMap:"qwen2", promptMax:800 },
  { id:"wan-25-t2i", label:"Wan 2.5 Preview — T2I", apiPath:"alibaba/wan-2.5-preview/text-to-image", uiRatios:["1:1","3:4","4:3","9:16","16:9"], sizeField:"size", sizeMap:"wan25", promptMax:2000 },
  { id:"wan-27-t2i", label:"Wan 2.7 — T2I", apiPath:"alibaba/wan-2.7/text-to-image", promptMax:5000 },
  { id:"wan-27-pro-t2i", label:"Wan 2.7 Pro — T2I", apiPath:"alibaba/wan-2.7/text-to-image-pro", promptMax:5000 },
  { id:"nano-v1-off-t2i", label:"Nano Banana v1 — T2I (Official)", apiPath:"rhart-image-v1-official/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"], promptMax:20000 },
  { id:"nano-v1-t2i", label:"Nano Banana v1 — T2I (Low-cost)", apiPath:"rhart-image-v1/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"], promptMax:20000 },
  { id:"nano-pro-low-t2i", label:"Nano Banana Pro — T2I (Low-cost)", apiPath:"rhart-image-n-pro/text-to-image", ratios:["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], resolutionField:"resolution", promptMax:20000 },
  { id:"nano-pro-ultra-t2i", label:"Nano Banana Pro Ultra 8K — T2I", apiPath:"rhart-image-n-pro-official/text-to-image-ultra", ratios:["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], resolutionField:"resolution", resolutionEnum:["4k","8k"], promptMax:20000 },
  { id:"nano2-off-t2i", label:"Nano Banana 2 — T2I (Official)", apiPath:"rhart-image-n-g31-flash-official/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], resolutionField:"resolution", promptMax:20000 },
  { id:"nano2-low-t2i", label:"Nano Banana 2 — T2I (Low-cost)", apiPath:"rhart-image-n-g31-flash/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], resolutionField:"resolution" },
  { id:"nano2-lite-off-t2i", label:"Nano Banana 2 Lite — T2I (Official)", apiPath:"rhart-image-n-g31-flash-lite-official/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], promptMax:20000 },
  { id:"nano2-lite-low-t2i", label:"Nano Banana 2 Lite — T2I (Low-cost)", apiPath:"rhart-image-n-g31-flash-lite/text-to-image", ratios:["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"] },
  { id:"gpt15-off-t2i", label:"GPT Image 1.5 — T2I (Official)", apiPath:"rhart-image-g-1.5-official/text-to-image", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], sizeField:"size", sizeMap:"gpt15" },
  { id:"gpt2-low-t2i", label:"GPT Image 2 — T2I (Low-cost)", apiPath:"rhart-image-g-2/text-to-image", ratios:["1:1","2:3","3:2","4:5","5:4","4:3","3:4","16:9","9:16","21:9","9:21","2:1","1:2","3:1","1:3"], resolutionField:"resolution", promptMax:20000 },
  { id:"jimeng-t2i", label:"Jimeng 4.6 — T2I", apiPath:"bytedance/jimeng-4.6/text-to-image", promptMax:800 },
  { id:"mj-v6-t2i", label:"Midjourney v6 — Artistic", apiPath:"youchuan/text-to-image-v6", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"mj-v61-t2i", label:"Midjourney v6.1 — Artistic", apiPath:"youchuan/text-to-image-v61", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"mj-niji6-t2i", label:"Midjourney Niji 6 — Anime", apiPath:"youchuan/text-to-image-niji6", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"mj-v7-t2i", label:"Midjourney v7 — Artistic", apiPath:"youchuan/text-to-image-v7", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"mj-niji7-t2i", label:"Midjourney Niji 7 — Anime", apiPath:"youchuan/text-to-image-niji7", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"mj-v82-t2i", label:"Midjourney v8.2 — Preview", apiPath:"youchuan/text-to-image-v82", ratios:["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], promptMax:8192 },
  { id:"qwen-2512-t2i", label:"Qwen 2512 — T2I", apiPath:"rhart-image/qwen-image/text-to-image-2512", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"qwen-2512-lora-t2i", label:"Qwen 2512 — T2I LoRA", apiPath:"rhart-image/qwen-image/text-to-image-2512-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"z-turbo-t2i", label:"Z-Image Turbo — T2I", apiPath:"rhart-image/z-image/turbo", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"z-turbo-lora-t2i", label:"Z-Image Turbo — T2I LoRA", apiPath:"rhart-image/z-image/turbo-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"flux2-lora-t2i", label:"Flux 2 Dev — T2I LoRA", apiPath:"rhart-image/f-2-dev/text-to-image-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"klein9b-t2i", label:"Flux Klein 9B — T2I", apiPath:"rhart-image/f-2-klein-9b/text-to-image", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"klein9b-lora-t2i", label:"Flux Klein 9B — T2I LoRA", apiPath:"rhart-image/f-2-klein-9b/text-to-image-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"klein4b-t2i", label:"Flux Klein 4B — T2I", apiPath:"rhart-image/f-2-klein-4b/text-to-image", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"klein4b-lora-t2i", label:"Flux Klein 4B — T2I LoRA", apiPath:"rhart-image/f-2-klein-4b/text-to-image-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"krea-t2i", label:"Flux Krea — T2I LoRA", apiPath:"rhart-image/f-krea-dev-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"fdev-t2i", label:"Flux 1 Dev — T2I", apiPath:"rhart-image/f-dev", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"fdev-lora-t2i", label:"Flux 1 Dev — T2I LoRA", apiPath:"rhart-image/f-dev-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
  { id:"wan22-lora-t2i", label:"Wan 2.2 — T2I LoRA", apiPath:"rhart-video/wan-2.2/text-to-image-lora", ratios:["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired:true },
];
if (typeof module !== "undefined" && module.exports) module.exports = RH_T2I_MODELS;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.t2iModels = RH_T2I_MODELS; }
})();
