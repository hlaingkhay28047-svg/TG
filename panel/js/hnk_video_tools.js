/* ============================================================
   HNK video-TOOL catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_VTOOL_MODELS table
   (docs/app/index.html), copied verbatim so Media Lab ▸ VidUp offers the
   same doc-verified video-input endpoints (edit, extend, upscale, denoise,
   frame interpolation, subtitle erase) and never invents one.
   ============================================================ */
(function () {
"use strict";

var RH_VTOOL_MODELS = [
  /* api-448184427 */
  { id:"rhv-v3-1-fast-official-video-extend", label:"Google veo3.1 fast video extend Official", apiPath:"rhart-video-v3.1-fast-official/video-extend", videoParam:"video", prompt:true, promptMax:8000, options:[{"key": "resolution", "values": ["720p", "1080p"], "def": "720p"}] },
  /* api-448184428 */
  { id:"rhv-v3-1-pro-official-video-extend", label:"Google veo3.1 pro video extend Official", apiPath:"rhart-video-v3.1-pro-official/video-extend", videoParam:"video", prompt:true, promptMax:8000, options:[{"key": "resolution", "values": ["720p", "1080p"], "def": "720p"}] },
  /* api-450573658 */
  { id:"happyhorse-1-0-video-edit", label:"Happyhorse 1.0 video edit", apiPath:"alibaba/happyhorse-1.0/video-edit", videoParam:"videoUrl", imageParam:"imageUrls", imageArray:true, imageMax:5, prompt:"req", promptMax:2500, options:[{"key": "resolution", "values": ["720p", "1080p"], "def": "1080p"}] },
  /* api-448184446 */
  { id:"rhv-g-official-edit-video", label:"Xai grok imagine edit video Official", apiPath:"rhart-video-g-official/edit-video", videoParam:"videoUrl", prompt:"req", promptMax:800, options:[{"key": "resolution", "values": ["720p", "480p"], "def": "480p"}] },
  /* api-465292104 */
  { id:"gemini-omni-flash-video-edit", label:"Gemini omni flash video edit Low cost", apiPath:"gemini-omni-flash/video-edit", videoParam:"videoUrl", imageParam:"imageUrls", imageArray:true, imageMax:3, prompt:"req", promptMax:2048, options:[{"key": "resolution", "values": ["720p", "1080p", "4k"], "def": "720p"}] },
  /* api-448184445 */
  { id:"kling-video-o1-std-edit-video", label:"Kling video o1 std edit video", apiPath:"kling-video-o1-std/edit-video", videoParam:"videoUrl", imageParam:"imageUrls", imageArray:true, imageMax:7, prompt:"req", promptMax:2000, options:[{"key": "mode", "values": ["std", "pro"], "def": "std"}], extra:{"keepOriginalSound": true} },
  /* api-448184449 */
  { id:"kling-video-o3-std-video-edit", label:"Kling video o3 std video edit", apiPath:"kling-video-o3-std/video-edit", videoParam:"videoUrl", imageParam:"imageUrls", imageArray:true, imageMax:4, prompt:"req", promptMax:2500, extra:{"keepOriginalSound": true} },
  /* api-448184448 */
  { id:"kling-video-o3-pro-video-edit", label:"Kling video o3 pro video edit", apiPath:"kling-video-o3-pro/video-edit", videoParam:"videoUrl", imageParam:"imageUrls", imageArray:true, imageMax:4, prompt:"req", promptMax:2500, extra:{"keepOriginalSound": true} },
  /* api-465573721 */
  { id:"volc-subtitle-erase-pro-video", label:"Volc subtitle erase video(Refined version)", apiPath:"volc-subtitle-erase-pro/video", videoParam:"videoUrl" },
  /* api-495680098 */
  { id:"topazlabs-video-astra", label:"Topazlabs video astra", apiPath:"topazlabs/video-astra", videoParam:"videoUrl", whPreset:true, options:[{"key": "model", "values": ["ast-2"], "def": "ast-2"}] },
  /* api-495680100 */
  { id:"topazlabs-video-starlight", label:"Topazlabs video starlight", apiPath:"topazlabs/video-starlight", videoParam:"videoUrl", whPreset:true, options:[{"key": "model", "values": ["slp-2.5", "slhq-1", "slm-1", "wonder-1", "slf-2"], "def": "slp-2.5"}] },
  /* api-465573722 */
  { id:"volc-subtitle-erase-video", label:"Volc subtitle erase video(Standard Version)", apiPath:"volc-subtitle-erase/video", videoParam:"videoUrl" },
  /* api-495680099 */
  { id:"topazlabs-video-denoise", label:"Topazlabs video denoise", apiPath:"topazlabs/video-denoise", videoParam:"videoUrl", whPreset:true, options:[{"key": "model", "values": ["nyx-3", "nxhf-1", "nxl-1", "nxf-1"], "def": "nyx-3"}] },
  /* api-448184453 */
  { id:"rhv-video-fps-increaser", label:"Rh video fps increaser", apiPath:"rhart-video/video-fps-increaser", videoParam:"videoUrl" },
  /* api-448184454 */
  { id:"rhv-video-upscaler", label:"Rh video upscaler", apiPath:"rhart-video/video-upscaler", videoParam:"videoUrl", options:[{"key": "targetResolution", "values": ["720p", "1080p", "2k", "4k"], "def": "1080p"}] },
  /* api-448184451 */
  { id:"pixverse-v6-extend", label:"Pixverse v6 extend", apiPath:"pixverse-v6/extend", videoParam:"videoUrl", prompt:"req", promptMax:2048, options:[{"key": "resolution", "values": ["360p", "540p", "720p", "1080p"], "def": "720p"}, {"key": "duration", "values": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "def": "5", "int": true}], extra:{"generateAudioSwitch": true} },
  /* api-495680097 */
  { id:"topazlabs-video-frame-interpolation", label:"Topazlabs video frame interpolation", apiPath:"topazlabs/video-frame-interpolation", videoParam:"videoUrl", whPreset:true, options:[{"key": "model", "values": ["apo-8", "apf-2", "aion-1", "chr-2", "chf-3"], "def": "apo-8"}] },
  /* api-448184455 */
  { id:"dreamactor-v2", label:"Bytedance dreamactor v2", apiPath:"bytedance/dreamactor-v2", videoParam:"videoUrl", imageParam:"imageUrl", imageReq:true },
  /* api-448184459 */
  { id:"kling-v2-6-std-motion-control", label:"Kling v2.6 std motion control", apiPath:"kling-v2.6-std/motion-control", videoParam:"videoUrl", imageParam:"imageUrl", imageReq:true, prompt:true, promptMax:2500, options:[{"key": "characterOrientation", "values": ["image", "video"], "def": "video"}] },
  /* api-448184458 */
  { id:"kling-v2-6-pro-motion-control", label:"Kling v2.6 pro motion control", apiPath:"kling-v2.6-pro/motion-control", videoParam:"videoUrl", imageParam:"imageUrl", imageReq:true, prompt:true, promptMax:2500, options:[{"key": "characterOrientation", "values": ["image", "video"], "def": "video"}] },
  /* api-448184457 */
  { id:"kling-v3-0-std-motion-control", label:"Kling v3.0 std motion control", apiPath:"kling-v3.0-std/motion-control", videoParam:"videoUrl", imageParam:"imageUrl", imageReq:true, prompt:true, promptMax:2500, options:[{"key": "characterOrientation", "values": ["image", "video"], "def": "video"}] },
  /* api-448184456 */
  { id:"kling-v3-0-pro-motion-control", label:"Kling v3.0 pro motion control", apiPath:"kling-v3.0-pro/motion-control", videoParam:"videoUrl", imageParam:"imageUrl", imageReq:true, prompt:true, promptMax:2500, options:[{"key": "characterOrientation", "values": ["image", "video"], "def": "video"}] },
  /* api-495680101 */
  { id:"topazlabs-video-proteus", label:"Topazlabs video proteus", apiPath:"topazlabs/video-proteus", videoParam:"videoUrl", whPreset:true, options:[{"key": "model", "values": ["prob-4", "pnat-1", "rhea-1", "thd-3", "thf-4", "ahq-12", "alqs-2", "alq-13", "amqs-2", "amq-13", "ddv-3", "dtv-4", "dtd-4", "dtvs-2", "dtds-2", "gcg-5", "ghq-5", "ganim-1", "iris-3", "iris-2"], "def": "prob-4"}] },
  /* api-448184462 */
  { id:"wan-2-7-video-extend", label:"Wan 2.7 video extend", apiPath:"alibaba/wan-2.7/video-extend", videoParam:"videoUrl", prompt:true, promptMax:5000, options:[{"key": "resolution", "values": ["720P", "1080P"], "def": "1080P"}, {"key": "duration", "values": ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "def": "5"}] },
  /* api-448184463 */
  { id:"rhv-g-official-video-extend", label:"Xai grok imagine video video extend Official", apiPath:"rhart-video-g-official/video-extend", videoParam:"videoUrl", prompt:"req", promptMax:2048, options:[{"key": "duration", "values": ["6", "10"], "def": "6"}] },
  /* api-498749523 */
  { id:"rhv-flux3-video-to-video", label:"Flux 3 video video continuation", apiPath:"rhart-video-flux3/video-to-video", videoParam:"startVideo", prompt:"req", promptMax:20480, options:[{"key": "resolution", "values": ["hd", "fhd"], "def": "hd"}] },
  /* api-469373161 — ComfyUI node pair: the reference photo goes to 299##image,
     the motion video to 275##video; no other field exists on this graph. */
  { id:"wan22-motion-transfer", label:"Wan 2.2 Character Motion Transfer", apiPath:"rhart-video/wan2.2/character-motion-transfer", kind:"vnode", videoParam:"275##video", imageParam:"299##image", imageReq:true },
  /* v5.89.0 api-510034450 — Gemini Omni 1.1 Flash video edit. Its doc
     declares exactly videoUrl + prompt + resolution, all REQUIRED, and a
     source video of at most ten seconds; no reference-image field exists on
     this route, unlike its low-cost gemini-omni-flash sibling above. */
  { id:"gemini-omni-11-video-edit", label:"Gemini Omni 1.1 Flash video edit", apiPath:"google/gemini-omni-1.1-flash/video-edit", videoParam:"videoUrl", prompt:"req", promptMax:2048, options:[{"key": "resolution", "values": ["360p", "720p", "1080p", "4k"], "def": "720p"}] },
  /* v5.89.0 — the three MiniMax-H3 REGENERATION routes. These take a 768P H3
     clip the studio already generated and re-run it at 2K, so their input is
     a VIDEO (baseVideoUrl) and they belong on this shelf, not in the
     image-to-video picker where v5.55.0 looked for them. Each doc marks
     prompt + baseVideoUrl + resolution REQUIRED, resolution is a one-value
     enum ("2K"), and the prompt cap is 40000 because it must repeat the
     prompt that made the source clip. api-498427803's optional lastFrameUrl
     is not sent: this shelf has exactly one photo slot. */
  { id:"mm-h3-regen-i2v", label:"MiniMax H3 — regenerate to 2K (frame + prompt)", apiPath:"minimax/hailuo-h3/regeneration-image-to-video", videoParam:"baseVideoUrl", imageParam:"firstFrameUrl", prompt:"req", promptMax:40000, options:[{"key": "resolution", "values": ["2K"], "def": "2K"}] },
  /* api-498427804 */
  { id:"mm-h3-regen-t2v", label:"MiniMax H3 — regenerate to 2K (prompt only)", apiPath:"minimax/hailuo-h3/regeneration-text-to-video", videoParam:"baseVideoUrl", prompt:"req", promptMax:40000, options:[{"key": "resolution", "values": ["2K"], "def": "2K"}] },
  /* api-498427802 — up to nine reference images, as at generation time. */
  { id:"mm-h3-regen-multimodal", label:"MiniMax H3 — regenerate to 2K (references)", apiPath:"minimax/hailuo-h3/regeneration-multimodal-to-video", videoParam:"baseVideoUrl", imageParam:"imageUrls", imageArray:true, imageMax:9, prompt:"req", promptMax:40000, options:[{"key": "resolution", "values": ["2K"], "def": "2K"}] },
];

var API = { LIST: RH_VTOOL_MODELS,
  get: function (id) { for (var i = 0; i < RH_VTOOL_MODELS.length; i++) if (RH_VTOOL_MODELS[i].id === id) return RH_VTOOL_MODELS[i]; return null; } };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoTools = API; }
})();
