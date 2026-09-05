/* ============================================================
   HNK video model catalog — LIFTED, do not edit by hand.
   Source of truth: the web app's own RH_VIDEO_MODELS table
   (docs/app/index.html), copied verbatim so the panel offers the
   same doc-verified endpoints and never invents one. Regenerate by
   re-lifting that array when the app's catalog changes;
   test/verify_panel_video_catalog.js pins this file to the app.
   ============================================================ */
(function () {
"use strict";
var RH_VIDEO_MODELS = [
  /* RETIRED (v6.22.0) — probed live through price-preview on 2026-09-05 and answered
     "1000 Unknown error"; RunningHub's own registry files both as 已下架 (taken down):
       rhart-video-s/image-to-video-pro-deprecated   (was rhart-video-s-pro-deprecated)
       rhart-video-s/text-to-video-pro-deprecated    (was rhv-s-t2v-pro-deprecated)
     and higgsfield/dop/image-to-video (was higgsfield-dop): the live API now requires a
     `motions` list of presets that neither its doc index (no higgsfield page) nor the registry
     snapshot names — the only option would have been an invented one.
     A dead option in the picker is worse than its absence; they come back only if a
     live probe accepts them again. */
  /* v5.55.0 — the FULL video catalog, doc-verified. Every entry below that
     carries an api-<id> comment was generated from RunningHub's own
     published parameter table for that endpoint (fetched via the read-only
     fetch-docs CI lane): image field names, resolution/duration/aspect enums,
     prompt caps, and every REQUIRED parameter's documented default all come
     from the doc, never from memory. Three modes share this one shelf:
       - image-to-video  (minImages >= 1; Start+End pairs use lastParam)
       - reference-to-video (fam "· Ref": an imageUrls-style array of refs)
       - text-to-video   (fam "· T2V": minImages 0 — no photo needed; models
         with optional image slots also allow 0)
     durInt:true marks endpoints whose duration is a JSON NUMBER (integer
     range in the doc) rather than a string enum; resParam:"size" marks the
     two Wan endpoints whose resolution field is literally named "size";
     v6.22.0 — no row is kind:"vnode" any more: RunningHub renamed every ComfyUI node key to the
     parameter its doc page describes and refuses the old keys (probed live, price-preview);
     the builder keeps the vnode branch only for a future graph endpoint.
     kind:"vnode" marked ComfyUI node-keyed graphs (wan-2.2, LTX, MiniMax-H3
     oss): node.images/prompt/dur name the per-graph keys and node.fixed
     carries each REQUIRED select at its documented default.
     TEN documented video endpoints are deliberately NOT here, because this
     app cannot author their inputs yet (each is named so a later "we added
     them all" cannot quietly include a broken one):
       kling-elements, kling-elements-advanced (asset registration),
       rhart-video-s/sora-upload-character (character asset, no consumer),
       kling-lip-sync/identify-face + kling-lip-sync/lip-sync-video
       (multi-step session flow with an audio timeline),
       kling-v2-ai-avatar-standard/image-audio-to-video and
       kling-v2-ai-avatar-pro/image-audio-to-video (REQUIRE an audio file),
       vidu/short-play-q3-drama + vidu/short-play-q3-ad (script authoring),
       rhart-video-flux3/draft-enhance (needs a prior run's draftCache).
     minimax/hailuo-h3/regeneration-image-to-video is no longer refused: the
     v5.55.0 note said it had left the doc index, and v5.89.0's index pass
     found it again. It takes a finished 768P clip and re-runs it at 2K, so
     it is wired on the Video Tools shelf with its two siblings, not here.
     The two ids every stored config and workflow card names keep the top. */
  /* api-448184392 */
  { id:"rh-video-g-off", label:"Grok Imagine — Quick (6-10s)", apiPath:"rhart-video-g-official/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "480p"], durations:["6", "10"], aspect:false, promptMax:800 },
  /* api-462492098 */
  { id:"gemini-omni-video", label:"Omni Flash (RunningHub) — up to 4K", apiPath:"gemini-omni-flash/image-to-video", imageParam:"imageUrls", minImages:1, maxImages:3, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8", "10"], aspect:true, aspects:["16:9", "9:16"], promptMax:2048 },
  /* ======== v5.55.0 image-to-video — every documented endpoint ======== */
  /* api-448184338 */
  { id:"vidu-q2-pro", label:"Vidu Q2 Pro — (1080p, 10s)", fam:"Vidu", apiPath:"vidu/image-to-video-q2-pro", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184341 */
  { id:"vidu-q2-pro-fast", label:"Vidu Q2 Pro Fast — (1080p, 10s)", fam:"Vidu", apiPath:"vidu/image-to-video-q2-pro-fast", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184339 */
  { id:"vidu-q2-turbo", label:"Vidu Q2 Turbo — (1080p, 10s)", fam:"Vidu", apiPath:"vidu/image-to-video-q2-turbo", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184340 */
  { id:"vidu-q3-pro", label:"Vidu Q3 Pro — (2k, 16s)", fam:"Vidu", apiPath:"vidu/image-to-video-q3-pro", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p", "2k"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:false, promptMax:4000, extra:{"audio": true} },
  /* api-448184343 */
  { id:"vidu-q3-turbo", label:"Vidu Q3 Turbo — (1080p, 16s)", fam:"Vidu", apiPath:"vidu/image-to-video-q3-turbo", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:false, promptMax:4000, extra:{"audio": true} },
  /* api-448184337 */
  { id:"vidu-se2v-q2-pro", label:"Vidu Q2 Pro — Start+End (1080p, 8s)", fam:"Vidu", apiPath:"vidu/start-end-to-video-q2-pro", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184342 */
  { id:"vidu-se2v-q2-pro-fast", label:"Vidu Q2 Pro Fast — Start+End (1080p, 8s)", fam:"Vidu", apiPath:"vidu/start-end-to-video-q2-pro-fast", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184336 */
  { id:"vidu-se2v-q2-turbo", label:"Vidu Q2 Turbo — Start+End (1080p, 8s)", fam:"Vidu", apiPath:"vidu/start-end-to-video-q2-turbo", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "bgm": true} },
  /* api-448184345 */
  { id:"vidu-se2v-q3-pro", label:"Vidu Q3 Pro — Start+End (1080p, 16s)", fam:"Vidu", apiPath:"vidu/start-end-to-video-q3-pro", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "audio": true} },
  /* api-448184344 */
  { id:"vidu-se2v-q3-turbo", label:"Vidu Q3 Turbo — Start+End (1080p, 16s)", fam:"Vidu", apiPath:"vidu/start-end-to-video-q3-turbo", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:false, promptMax:4000, extra:{"movementAmplitude": "auto", "audio": true} },
  /* api-448184350 */
  { id:"kling-v2-5-turbo-pro", label:"Kling v2.5 Turbo Pro — (10s)", fam:"Kling", apiPath:"kling-v2.5-turbo-pro/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:false, promptMax:2000 },
  /* api-448184349 */
  { id:"kling-v2-5-turbo-std", label:"Kling v2.5 Turbo Std — (10s)", fam:"Kling", apiPath:"kling-v2.5-turbo-std/image-to-video", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:false, promptMax:2000 },
  /* api-448184355 */
  { id:"kling-v2-6-pro", label:"Kling v2.6 Pro — (10s)", fam:"Kling", apiPath:"kling-v2.6-pro/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:false, promptMax:2000, extra:{"sound": "true"} },
  /* api-494859290 */
  { id:"kling-v2-6-std", label:"Kling v2.6 Std — (10s)", fam:"Kling", apiPath:"kling-v2.6-std/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:false, promptMax:2000 },
  /* api-449426879 */
  { id:"kling-v3-4k", label:"Kling v3.0 4k — (15s)", fam:"Kling", apiPath:"kling-v3-4k/image-to-video", imageParam:"imageUrl", lastParam:"endImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2500 },
  /* api-494859292 */
  { id:"kling-v3-turbo-pro", label:"Kling V3 Turbo Pro — (15s)", fam:"Kling", apiPath:"kling-v3-turbo-pro/image-to-video", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500 },
  /* api-494859291 */
  { id:"kling-v3-turbo-std", label:"Kling V3 Turbo Std — (15s)", fam:"Kling", apiPath:"kling-v3-turbo-std/image-to-video", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500 },
  /* api-448184352 */
  { id:"kling-v3-0-pro", label:"Kling v3.0 Pro — (15s)", fam:"Kling", apiPath:"kling-v3.0-pro/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500, extra:{"sound": true} },
  /* api-448184354 */
  { id:"kling-v3-0-std", label:"Kling v3.0 Std — (15s)", fam:"Kling", apiPath:"kling-v3.0-std/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500, extra:{"sound": true} },
  /* api-448184346 */
  { id:"kling-video-o1", label:"Kling video O1 — (10s)", fam:"Kling", apiPath:"kling-video-o1/image-to-video", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "9:16", "16:9"], promptMax:2000, extra:{"mode": "std"} },
  /* api-448184347 */
  { id:"kling-video-o1-se2v", label:"Kling video O1 — Start+End (10s)", fam:"Kling", apiPath:"kling-video-o1/start-to-end", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "9:16", "16:9"], promptMax:2000, extra:{"mode": "std"} },
  /* api-449426878 */
  { id:"kling-video-o3-4k", label:"Kling video O3 4k — (15s)", fam:"Kling", apiPath:"kling-video-o3-4k/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2500 },
  /* api-448184351 */
  { id:"kling-video-o3-pro", label:"Kling video O3 Pro — (15s)", fam:"Kling", apiPath:"kling-video-o3-pro/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2500, extra:{"sound": true} },
  /* api-448184353 */
  { id:"kling-video-o3-std", label:"Kling video O3 Std — (15s)", fam:"Kling", apiPath:"kling-video-o3-std/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2500, extra:{"sound": true} },
  /* api-448184359 */
  { id:"seedance-2-0-global-fast-i2v", label:"Seedance 2.0 Global Fast — (4k, 15s)", fam:"Seedance", apiPath:"bytedance/seedance-2.0-global-fast/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859285 */
  { id:"seedance-2-0-global-mini-i2v", label:"Seedance 2.0 Global Mini — (4k, 15s)", fam:"Seedance", apiPath:"bytedance/seedance-2.0-global-mini/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-448184358 */
  { id:"seedance-2-0-global-i2v", label:"Seedance 2.0 Global — (4k, 15s)", fam:"Seedance", apiPath:"bytedance/seedance-2.0-global/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-498749515 */
  { id:"seedance-2-5-global-token-i2v", label:"Seedance 2.5 Global — (4k, 30s)", fam:"Seedance", apiPath:"bytedance/seedance-2.5-global-token/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive"], promptMax:20480 },
  /* api-498749516 */
  { id:"bytedance-seedance-2-5-token", label:"Seedance 2.5 — (4k, 30s)", fam:"Seedance", apiPath:"bytedance/seedance-2.5-token/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive"], promptMax:20480 },
  /* api-494859287 */
  { id:"rhart-video-sparkvideo-2-0-fast", label:"Seedance 2.0 Fast — (4k, 15s)", fam:"Seedance", apiPath:"rhart-video/sparkvideo-2.0-fast/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859286 */
  { id:"rhart-video-sparkvideo-2-0-mini", label:"Seedance 2.0 Mini — (4k, 15s)", fam:"Seedance", apiPath:"rhart-video/sparkvideo-2.0-mini/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859288 */
  { id:"rhart-video-sparkvideo-2-0", label:"Seedance 2.0 — (4k, 15s)", fam:"Seedance", apiPath:"rhart-video/sparkvideo-2.0/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859293 */
  { id:"rhv-sparkvideo-2-0-mmv-star", label:"Stephen Chow IP Video Gen(Seedance 2.0) — (4k, 15s)", fam:"Seedance", apiPath:"rhart-video/sparkvideo-2.0/multimodal-video-star", imageParam:"imageUrl", minImages:0, maxImages:1, oddOnly:false, resolutions:["480p", "720p", "1080p", "native1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20000, extra:{"templateId": "ca4e2a5b6ba3429aa32f1b6ce8095e49"} },
  /* api-494859294 */
  { id:"rhv-sparkvideo-2-0-mmv-star-fast", label:"Stephen Chow IP Video Gen Fast (Seedance 2.0 Fast) — (4k, 15s)", fam:"Seedance", apiPath:"rhart-video/sparkvideo-2.0/multimodal-video-star-fast", imageParam:"imageUrl", minImages:0, maxImages:1, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20000, extra:{"templateId": "ca4e2a5b6ba3429aa32f1b6ce8095e49"} },
  /* api-448184357 */
  { id:"seedance-v1-5-pro", label:"Seedance v1.5 Pro — (1080p, 12s)", fam:"Seedance", apiPath:"seedance-v1.5-pro/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"], promptMax:5000, extra:{"generateAudio": "true", "cameraFixed": "false"} },
  /* api-448184356 */
  { id:"seedance-v1-5-pro-fast", label:"Seedance v1.5 Pro Fast — (1080p, 12s)", fam:"Seedance", apiPath:"seedance-v1.5-pro/image-to-video-fast", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720p", "1080p"], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"], promptMax:5000, extra:{"generateAudio": "true", "cameraFixed": "false"} },
  /* api-448184367 */
  { id:"mm-hailuo-02-fast", label:"Hailuo 02 Fast — (10s)", fam:"MiniMax", apiPath:"minimax/hailuo-02/fast", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184366 */
  { id:"minimax-hailuo-02-pro", label:"Hailuo 02 Pro", fam:"MiniMax", apiPath:"minimax/hailuo-02/i2v-pro", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184361 */
  { id:"minimax-hailuo-02-standard", label:"Hailuo 02 Standard — (10s)", fam:"MiniMax", apiPath:"minimax/hailuo-02/i2v-standard", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184360 */
  { id:"mm-hailuo-02-standard", label:"Hailuo 02 Standard — (10s)", fam:"MiniMax", apiPath:"minimax/hailuo-02/standard", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:0, maxImages:2, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184364 */
  { id:"minimax-hailuo-2-3-fast-pro", label:"Hailuo 2.3 Fast Pro — (6s)", fam:"MiniMax", apiPath:"minimax/hailuo-2.3-fast-pro/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["6"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184363 */
  { id:"minimax-hailuo-2-3-fast", label:"Hailuo 2.3 Fast — (10s)", fam:"MiniMax", apiPath:"minimax/hailuo-2.3-fast/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184362 */
  { id:"minimax-hailuo-2-3-standard", label:"Hailuo 2.3 Standard — (10s)", fam:"MiniMax", apiPath:"minimax/hailuo-2.3/i2v-standard", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184365 */
  { id:"minimax-hailuo-2-3-pro", label:"Hailuo 2.3 Pro", fam:"MiniMax", apiPath:"minimax/hailuo-2.3/image-to-video-pro", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-495380676 */
  { id:"minimax-hailuo-h3", label:"MiniMax H3 (first last frame) — (768P, 15s)", fam:"MiniMax", apiPath:"minimax/hailuo-h3/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:0, maxImages:2, oddOnly:false, resolutions:["2K", "768P"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:20480 },
  /* api-502119462 */
  { id:"rhv-mm-h3-oss-fl2va", label:"MiniMax H3 fl2va RH插件流 支持文生、图生、首尾帧 — (15s)", fam:"MiniMax", apiPath:"rhart-video/minimax-h3-oss/fl2va", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:0, maxImages:2, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspectParam:"aspectRatio", aspects:["9:16 (Portrait Widescreen)", "16:9 (Widescreen)", "1:1 (Square)", "3:4 (Portrait Standard)", "4:3 (Standard)", "2:3 (Portrait Photo)", "3:2 (Photo)", "21:9 (Ultrawide)"], promptMax:20000 },
  /* v5.89.0 api-509445864 — H3 Max. Its own doc, not H3's: prompt 20480 (H3
     is 7000), resolution REQUIRED with only 480P/768P, duration "5".."15". */
  { id:"mm-hailuo-h3-max", label:"MiniMax H3 Max (first last frame) — (768P, 15s)", fam:"MiniMax", apiPath:"minimax/hailuo-h3-max/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480P", "768P"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:20480 },
  /* v5.89.0 api-498427799 — Context-IR i2va: video WITH a synchronised audio
     track. The doc declares no resolution field at all and no ratio on this
     route, so neither is sent; both frames are optional there but the shelf
     asks for the first, as its name says. */
  { id:"mm-h3-context-ir-image", label:"MiniMax H3 Context-IR — Photo + sound (15s)", fam:"MiniMax", apiPath:"minimax/hailuo-h3/context-ir-image", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:[], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:7000 },
  /* v5.89.0 api-508886444 — Gemini Omni 1.1 Flash. duration is an INTEGER
     3-10 in this doc (durInt), resolution REQUIRED, aspectRatio 16:9/9:16
     only, and lastImageUrl is the documented optional end frame. */
  { id:"gemini-omni-11-i2v", label:"Gemini Omni 1.1 Flash — (4k, 10s)", fam:"Omni Flash", apiPath:"google/gemini-omni-1.1-flash/image-to-video", imageParam:"imageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["360p", "720p", "1080p", "4k"], durations:["3", "4", "5", "6", "7", "8", "9", "10"], durInt:true, aspect:true, aspects:["16:9", "9:16"], promptMax:2048 },
  /* api-448184368 */
  { id:"youchuan", label:"Midjourney — (720p)", fam:"Midjourney", apiPath:"youchuan/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480p", "720p"], durations:[], aspect:false, promptMax:8192 },
  /* api-448184371 */
  { id:"rhart-video-v3-1-fast-official", label:"Veo3.1 Fast — (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-fast-official/image-to-video", imageParam:"imageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000, extra:{"generateAudio": false} },
  /* api-448184374 */
  { id:"rhart-video-v3-1-fast", label:"Veo3.1 Fast Low cost — (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-fast/image-to-video", imageParam:"imageUrls", minImages:1, maxImages:3, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184373 */
  { id:"rhv-v3-1-fast-se2v", label:"Veo3.1 Fast Low cost — Start+End (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-fast/start-end-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184375 */
  { id:"rhart-video-v3-1-lite-official", label:"Veo3.1 Lite — (1080p, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-lite-official/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:20000 },
  /* api-448184431 */
  { id:"rhv-v3-1-lite-official-se2v", label:"Veo3.1 Lite — Start+End (1080p)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-lite-official/start-end-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["720p", "1080p"], durations:[], aspect:true, aspects:["16:9", "9:16"], promptMax:20000 },
  /* api-448184369 */
  { id:"rhart-video-v3-1-pro-official", label:"Veo3.1 Pro — (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-pro-official/image-to-video", imageParam:"imageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000, extra:{"generateAudio": false} },
  /* api-448184370 */
  { id:"rhv-v3-1-pro-official-r2v", label:"Veo3.1 Pro — (4k)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-pro-official/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:3, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:[], aspect:false, promptMax:8000, extra:{"generateAudio": false} },
  /* api-471297125 */
  { id:"rhart-video-v3-1-pro", label:"Veo3.1 Pro Low cost — (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-pro/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184372 */
  { id:"rhv-v3-1-pro-se2v", label:"Veo3.1 Pro Low cost — Start+End (4k, 8s)", fam:"Veo 3.1", apiPath:"rhart-video-v3.1-pro/start-end-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184380 */
  { id:"rhart-video-s-official", label:"Sora 2 — (12s)", fam:"Sora", apiPath:"rhart-video-s-official/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["4", "8", "12"], aspect:false, promptMax:20000 },
  /* api-448184378 */
  { id:"rhart-video-s-official-pro", label:"Sora 2 Pro — (1080p, 20s)", fam:"Sora", apiPath:"rhart-video-s-official/image-to-video-pro", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["4", "8", "12", "16", "20"], aspect:false, promptMax:20000 },
  /* api-448184376 */
  { id:"rhart-video-s-official-realistic", label:"Sora 2 Realistic — (12s)", fam:"Sora", apiPath:"rhart-video-s-official/image-to-video-realistic", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["4", "8", "12"], aspect:false, promptMax:20000 },
  /* api-448184381 */
  { id:"rhart-video-s", label:"Sora 2 Low cost — (15s)", fam:"Sora", apiPath:"rhart-video-s/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["10", "15"], aspect:true, aspects:["9:16", "16:9"], promptMax:4000 },
  /* api-448184388 */
  { id:"alibaba-wan-2-5-preview", label:"Wan 2.5 Preview — (1080p, 10s)", fam:"Wan", apiPath:"alibaba/wan-2.5-preview/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["5", "10"], aspect:false, promptMax:1500 },
  /* api-448184393 */
  { id:"alibaba-wan-2-6", label:"Wan 2.6 — (1080p, 15s)", fam:"Wan", apiPath:"alibaba/wan-2.6/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["5", "10", "15"], aspect:false, promptMax:20000, extra:{"shotType": "single"} },
  /* api-448184385 */
  { id:"alibaba-wan-2-6-flash", label:"Wan 2.6 Flash — (1080p, 15s)", fam:"Wan", apiPath:"alibaba/wan-2.6/image-to-video-flash", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:20000, extra:{"shotType": "single", "enablePromptExpansion": false, "enableAudio": true} },
  /* api-448184383 */
  { id:"wan-2-6-r2v", label:"Wan 2.6 — (1248*1632, 10s)", fam:"Wan", apiPath:"alibaba/wan-2.6/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:5, oddOnly:false, resolutions:["1280*720", "720*1280", "960*960", "1088*832", "832*1088", "1920*1080", "1080*1920", "1440*1440", "1632*1248", "1248*1632"], resParam:"size", durations:["2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:false, promptMax:20000 },
  /* api-448184384 */
  { id:"wan-2-6-r2v-flash", label:"Wan 2.6 Flash — (1248*1632, 10s)", fam:"Wan", apiPath:"alibaba/wan-2.6/reference-to-video-flash", imageParam:"imageUrls", minImages:0, maxImages:5, oddOnly:false, resolutions:["1280*720", "720*1280", "960*960", "1088*832", "832*1088", "1920*1080", "1080*1920", "1440*1440", "1632*1248", "1248*1632"], resParam:"size", durations:["2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:false, promptMax:20000, extra:{"audio": true} },
  /* api-494859283 */
  { id:"alibaba-wan-2-7-spicy", label:"Wan 2.7 Spicy — (1080p, 15s)", fam:"Wan", apiPath:"alibaba/wan-2.7-spicy/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:5000 },
  /* api-448184387 */
  { id:"alibaba-wan-2-7", label:"Wan 2.7 — (1080P, 15s)", fam:"Wan", apiPath:"alibaba/wan-2.7/image-to-video", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["720P", "1080P"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:5000 },
  /* api-448184447 */
  { id:"wan-2-7-video-edit", label:"Wan 2.7 video edit — (1080P, 10s)", fam:"Wan", apiPath:"alibaba/wan-2.7/video-edit", imageParam:"imageUrls", minImages:1, maxImages:3, oddOnly:false, resolutions:["720P", "1080P"], durations:["0", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:5000 },
  /* api-505922314 */
  { id:"wan-3-0-prime-i2v", label:"Wan 3.0 Prime — (1080P, 30s)", fam:"Wan", apiPath:"alibaba/wan-3.0-prime/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480P", "720P", "1080P"], durations:["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20000 },
  /* api-505575335 */
  { id:"wan-3-0-i2v", label:"Wan 3.0 — (1080P, 30s)", fam:"Wan", apiPath:"alibaba/wan-3.0/image-to-video", imageParam:"firstFrameUrl", lastParam:"lastFrameUrl", minImages:1, maxImages:2, oddOnly:false, resolutions:["480P", "720P", "1080P"], durations:["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20000 },
  /* api-448184386 */
  { id:"rhv-wan-2-2-i2v", label:"Wan 2.2", fam:"Wan", apiPath:"rhart-video/wan-2.2/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:20000, extra:{"duration": "1", "resolution": "7"} },
  /* api-448184382 */
  { id:"rhv-wan-2-2-se2v", label:"Wan 2.2 video — Start+End", fam:"Wan", apiPath:"rhart-video/wan-2.2/start-to-end", imageParam:"imageUrl", lastParam:"lastImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:20000, extra:{"duration": "1", "resolution": "7"} },
  /* api-448184389 */
  { id:"rhv-ltx-2-3-i2v", label:"Ltx 2.3 — (20s)", fam:"LTX", apiPath:"rhart-video/ltx-2.3/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"], durInt:true, aspect:false, promptMax:20000, extra:{"resolution": "1", "aspectRatio": "2"} },
  /* api-448184390 */
  { id:"rhv-ltx-2-3-i2v-lora", label:"Ltx 2.3 lora — (15s)", fam:"LTX", apiPath:"rhart-video/ltx-2.3/image-to-video-lora", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:20000, extra:{"resolution": "1", "aspectRatio": "2"} },
  /* api-494859289 */
  { id:"rhart-video-g-official-v1-5", label:"Grok imagine video v1.5 — (720p, 15s)", fam:"Grok", apiPath:"rhart-video-g-official/image-to-video-v1.5", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["480p", "720p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2048 },
  /* api-448184391 */
  { id:"rhart-video-g", label:"Grok imagine Low cost v1.5 — (480p, 30s)", fam:"Grok", apiPath:"rhart-video-g/image-to-video", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:["720p", "480p"], durations:["6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], durInt:true, aspect:true, aspects:["2:3", "3:2", "1:1", "16:9", "9:16"], promptMax:20000 },
  /* api-448184394 */
  { id:"pixverse-v6", label:"Pixverse V6 — (1080p, 15s)", fam:"PixVerse", apiPath:"pixverse-v6/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2048, extra:{"generateAudioSwitch": true} },
  /* api-448184452 */
  { id:"pixverse-v6-transition", label:"Pixverse V6 transition — Start+End (1080p, 15s)", fam:"PixVerse", apiPath:"pixverse-v6/transition", imageParam:"firstImageUrl", lastParam:"endImageUrl", minImages:2, maxImages:2, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"], promptMax:2048, extra:{"generateAudioSwitch": false, "generateMultiClipSwitch": false} },
  /* api-450326933 */
  { id:"alibaba-happyhorse-1-0", label:"Happyhorse 1.0 — (1080p, 15s)", fam:"HappyHorse", apiPath:"alibaba/happyhorse-1.0/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500 },
  /* api-494859284 */
  { id:"alibaba-happyhorse-1-1", label:"Happyhorse 1.1 — (1080p, 15s)", fam:"HappyHorse", apiPath:"alibaba/happyhorse-1.1/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:false, promptMax:2500 },
  /* api-454760426 */
  { id:"skyreels-v4-fast", label:"Skyreels V4 Fast — (1080p, 15s)", fam:"SkyReels", apiPath:"skyreels-v4/image-to-video-fast", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2048, extra:{"promptOptimizer": true} },
  /* api-454760427 */
  { id:"skyreels-v4-std", label:"Skyreels V4 Std — (1080p, 15s)", fam:"SkyReels", apiPath:"skyreels-v4/image-to-video-std", imageParam:"firstImageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:2048, extra:{"sound": true, "promptOptimizer": true} },
  /* api-498749517 */
  { id:"rhv-flux3-i2v", label:"Flux 3 video — (fhd, 20s)", fam:"Flux", apiPath:"rhart-video-flux3/image-to-video", imageParam:"keyframes", minImages:1, maxImages:10, oddOnly:false, resolutions:["hd", "fhd"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"], durInt:true, aspect:true, aspects:["auto", "21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20480 },
  /* ======== v5.55.0 reference-to-video — every documented endpoint ======== */
  /* api-448184395 */
  { id:"vidu-r2v-q2", label:"Vidu Q2 — Ref (1080p, 10s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q2", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1"], promptMax:4000, extra:{"movementAmplitude": "auto"} },
  /* api-448184544 — filed under Image > reference-to-image in the doc index
     (a miscategorization; fetched in round 4). Only prompt is REQUIRED;
     imageUrls (<=7) and every control are optional with documented
     defaults. The doc's optional `videos` refs (<=2) are not sent — the
     pane has no video-ref slot. */
  { id:"vidu-r2v-q2-pro", label:"Vidu Q2 Pro — Ref (1080p, 10s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q2-pro", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1"], promptMax:2000 },
  /* api-448184399 */
  { id:"vidu-r2v-q3", label:"Vidu Q3 — Ref (1080p, 16s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q3", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], durInt:true, aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "auto"], promptMax:5000 },
  /* api-494859280 */
  { id:"vidu-r2v-q3-ad", label:"Vidu Q3 Ad — Ref (1080p, 16s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q3-ad", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], durInt:true, aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "auto"], promptMax:5000 },
  /* api-494859277 */
  { id:"vidu-r2v-q3-drama", label:"Vidu Q3 Drama — Ref (1080p, 15s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q3-drama", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["1080p"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "auto"], promptMax:5000 },
  /* api-448184398 */
  { id:"vidu-r2v-q3-mix", label:"Vidu Q3 Mix — Ref (1080p, 16s)", fam:"Vidu · Ref", apiPath:"vidu/reference-to-video-q3-mix", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], durInt:true, aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "auto"], promptMax:5000 },
  /* api-448184396 */
  { id:"kling-video-o1-std-refrence-to-video", label:"Kling video O1 Std refrence to video — Ref (10s)", fam:"Kling · Ref", apiPath:"kling-video-o1-std/refrence-to-video", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "9:16", "16:9"], promptMax:2000, extra:{"mode": "std", "keepOriginalSound": true} },
  /* api-449426880 */
  { id:"kling-video-o3-4k-r2v", label:"Kling video O3 4k — Ref (15s)", fam:"Kling · Ref", apiPath:"kling-video-o3-4k/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:2500 },
  /* api-448184401 */
  { id:"kling-video-o3-pro-r2v", label:"Kling video O3 Pro — Ref (15s)", fam:"Kling · Ref", apiPath:"kling-video-o3-pro/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:2500, extra:{"keepOriginalSound": true} },
  /* api-448184402 */
  { id:"kling-video-o3-std-r2v", label:"Kling video O3 Std — Ref (15s)", fam:"Kling · Ref", apiPath:"kling-video-o3-std/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:7, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:2500, extra:{"keepOriginalSound": true} },
  /* api-448184405 */
  { id:"seedance-2-0-global-fast-mmv", label:"Seedance 2.0 Global Fast — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"bytedance/seedance-2.0-global-fast/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859278 */
  { id:"seedance-2-0-global-mini-mmv", label:"Seedance 2.0 Global Mini — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"bytedance/seedance-2.0-global-mini/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-448184404 */
  { id:"seedance-2-0-global-mmv", label:"Seedance 2.0 Global — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"bytedance/seedance-2.0-global/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-498749512 */
  { id:"seedance-2-5-global-token-mmv", label:"Seedance 2.5 Global — Ref (4k, 30s)", fam:"Seedance · Ref", apiPath:"bytedance/seedance-2.5-global-token/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:30, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-498749513 */
  { id:"seedance-2-5-token-mmv", label:"Seedance 2.5 — Ref (4k, 30s)", fam:"Seedance · Ref", apiPath:"bytedance/seedance-2.5-token/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:30, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859281 */
  { id:"rhv-sparkvideo-2-0-fast-mmv", label:"Seedance 2.0 Fast — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"rhart-video/sparkvideo-2.0-fast/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859279 */
  { id:"rhv-sparkvideo-2-0-mini-mmv", label:"Seedance 2.0 Mini — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"rhart-video/sparkvideo-2.0-mini/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859282 */
  { id:"rhv-sparkvideo-2-0-mmv", label:"Seedance 2.0 — Ref (4k, 15s)", fam:"Seedance · Ref", apiPath:"rhart-video/sparkvideo-2.0/multimodal-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-448184397 */
  { id:"seedance-v1-lite-r2v", label:"Seedance V1 Lite — Ref (480p, 12s)", fam:"Seedance · Ref", apiPath:"seedance-v1-lite/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:4, oddOnly:false, resolutions:["720p", "480p"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "21:9", "1:1"], promptMax:5000, extra:{"cameraFixed": "false"} },
  /* api-495380675 */
  { id:"mm-hailuo-h3-multimodal-to-video", label:"MiniMax H3 Multimodal — Ref (768P, 15s)", fam:"MiniMax · Ref", apiPath:"minimax/hailuo-h3/multimodal-to-video", imageParam:"imageUrls", minImages:0, maxImages:9, oddOnly:false, resolutions:["2K", "768P"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20480 },
  /* api-502119463 */
  { id:"rhv-mm-h3-oss-fl2va-advanced", label:"MiniMax H3 ref2va RH插件流 支持多参 — Ref (15s)", fam:"MiniMax · Ref", apiPath:"rhart-video/minimax-h3-oss/fl2va-advanced", imageParam:"image1", imageParams:["image1", "image2", "image3", "image4", "image5", "image6", "image7", "image8", "image9"], minImages:0, maxImages:9, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspectParam:"aspectRatio", aspects:["16:9 (Widescreen)", "9:16 (Portrait Widescreen)", "1:1 (Square)", "3:4 (Portrait Standard)", "4:3 (Standard)", "2:3 (Portrait Photo)", "3:2 (Photo)", "21:9 (Ultrawide)"], promptMax:20000 },
  /* v5.89.0 api-498427801 — Context-IR r2va: up to NINE reference images and
     a ratio enum that starts at "adaptive". Its optional videoUrls/audioUrls
     reference slots are not sent — this shelf has no way to author them. */
  { id:"mm-h3-context-ir-multimodal", label:"MiniMax H3 Context-IR — Ref + sound (15s)", fam:"MiniMax · Ref", apiPath:"minimax/hailuo-h3/context-ir-multimodal", imageParam:"imageUrls", minImages:1, maxImages:9, oddOnly:false, resolutions:[], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:7000 },
  /* v5.89.0 api-508886445 — up to TEN references; its optional videoUrls are
     not sent for the same reason. */
  { id:"gemini-omni-11-r2v", label:"Gemini Omni 1.1 Flash — Ref (4k, 10s)", fam:"Omni Flash · Ref", apiPath:"google/gemini-omni-1.1-flash/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:10, oddOnly:false, resolutions:["360p", "720p", "1080p", "4k"], durations:["3", "4", "5", "6", "7", "8", "9", "10"], durInt:true, aspect:true, aspects:["16:9", "9:16"], promptMax:2048 },
  /* api-459865193 */
  { id:"rhv-v3-1-fast-official-r2v", label:"Veo3.1 Fast — Ref (1080p)", fam:"Veo 3.1 · Ref", apiPath:"rhart-video-v3.1-fast-official/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:3, oddOnly:false, resolutions:["720p", "1080p"], durations:[], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184400 */
  { id:"wan-2-7-r2v", label:"Wan 2.7 — Ref (1080P, 10s)", fam:"Wan · Ref", apiPath:"alibaba/wan-2.7/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:5, oddOnly:false, resolutions:["720P", "1080P"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:5000 },
  /* api-505922313 */
  { id:"wan-3-0-prime-r2v", label:"Wan 3.0 Prime — Ref (1080P, 30s)", fam:"Wan · Ref", apiPath:"alibaba/wan-3.0-prime/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:10, oddOnly:false, resolutions:["480P", "720P", "1080P"], durations:["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20000 },
  /* api-505575334 */
  { id:"wan-3-0-r2v", label:"Wan 3.0 — Ref (1080P, 30s)", fam:"Wan · Ref", apiPath:"alibaba/wan-3.0/reference-to-video", imageParam:"imageUrls", minImages:0, maxImages:10, oddOnly:false, resolutions:["480P", "720P", "1080P"], durations:["auto", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20000 },
  /* api-448184403 */
  { id:"rhv-g-official-r2v", label:"Grok imagine video — Ref (480p, 10s)", fam:"Grok · Ref", apiPath:"rhart-video-g-official/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:7, oddOnly:false, resolutions:["720p", "480p"], durations:["6", "10"], aspect:false, promptMax:2048 },
  /* api-498749514 */
  { id:"rhv-g-official-r2v-v1-5", label:"Grok imagine video v1.5 — Ref (720p, 15s)", fam:"Grok · Ref", apiPath:"rhart-video-g-official/reference-to-video-v1.5", imageParam:"referenceImages", minImages:1, maxImages:7, oddOnly:false, resolutions:["480p", "720p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "1:1", "9:16", "3:2", "2:3"], promptMax:2048 },
  /* api-450573659 */
  { id:"happyhorse-1-0-r2v", label:"Happyhorse 1.0 — Ref (1080p, 15s)", fam:"HappyHorse · Ref", apiPath:"alibaba/happyhorse-1.0/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:9, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "3:4", "4:3", "1:1"], promptMax:2500 },
  /* api-494859276 */
  { id:"happyhorse-1-1-r2v", label:"Happyhorse 1.1 — Ref (1080p, 15s)", fam:"HappyHorse · Ref", apiPath:"alibaba/happyhorse-1.1/reference-to-video", imageParam:"imageUrls", minImages:1, maxImages:9, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "3:4", "4:3", "1:1", "4:5", "5:4", "9:21", "21:9"], promptMax:2500 },
  /* api-454760425 */
  { id:"skyreels-v4-omni-reference-fast", label:"Skyreels V4 omni reference Fast — Ref (1080p, 15s)", fam:"SkyReels · Ref", apiPath:"skyreels-v4/omni-reference-fast", imageParam:"refImages", refObj:{"type": "image", "url": "{{URL}}"}, minImages:1, maxImages:3, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2500 },
  /* api-454760424 */
  { id:"skyreels-v4-omni-reference-std", label:"Skyreels V4 omni reference Std — Ref (1080p, 15s)", fam:"SkyReels · Ref", apiPath:"skyreels-v4/omni-reference-std", imageParam:"refImages", refObj:{"type": "image", "url": "{{URL}}"}, minImages:1, maxImages:3, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2500, extra:{"sound": true} },
  /* ======== v5.55.0 text-to-video — every documented endpoint ======== */
  /* api-448184406 */
  { id:"vidu-t2v", label:"Vidu Q2 — T2V (1080p, 10s)", fam:"Vidu · T2V", apiPath:"vidu/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], aspect:true, aspects:["4:3", "3:4", "16:9", "9:16", "1:1"], promptMax:4000, extra:{"style": "general", "movementAmplitude": "auto"} },
  /* api-448184407 */
  { id:"vidu-t2v-q3-pro", label:"Vidu Q3 Pro — T2V (1080p, 16s)", fam:"Vidu · T2V", apiPath:"vidu/text-to-video-q3-pro", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:true, aspects:["4:3", "3:4", "16:9", "9:16", "1:1"], promptMax:4000, extra:{"style": "general", "audio": true} },
  /* api-448184408 */
  { id:"vidu-t2v-q3-turbo", label:"Vidu Q3 Turbo — T2V (1080p, 16s)", fam:"Vidu · T2V", apiPath:"vidu/text-to-video-q3-turbo", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:true, aspects:["4:3", "3:4", "16:9", "9:16", "1:1"], promptMax:4000, extra:{"style": "general", "audio": true} },
  /* api-448184410 */
  { id:"kling-v2-5-turbo-pro-t2v", label:"Kling v2.5 Turbo Pro — T2V (10s)", fam:"Kling · T2V", apiPath:"kling-v2.5-turbo-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2000 },
  /* api-452094100 */
  { id:"kling-v2-5-turbo-std-t2v", label:"Kling v2.5 Turbo Std — T2V (10s)", fam:"Kling · T2V", apiPath:"kling-v2.5-turbo-std/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2000 },
  /* api-448184411 */
  { id:"kling-v2-6-pro-t2v", label:"Kling v2.6 Pro — T2V (10s)", fam:"Kling · T2V", apiPath:"kling-v2.6-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2000, extra:{"sound": "true"} },
  /* api-494859273 */
  { id:"kling-v2-6-std-t2v", label:"Kling v2.6 Std — T2V (10s)", fam:"Kling · T2V", apiPath:"kling-v2.6-std/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2000 },
  /* api-449426877 */
  { id:"kling-v3-4k-t2v", label:"Kling V3 4k — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-v3-4k/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:2500 },
  /* api-494859275 */
  { id:"kling-v3-turbo-pro-t2v", label:"Kling V3 Turbo Pro — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-v3-turbo-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500 },
  /* api-494859274 */
  { id:"kling-v3-turbo-std-t2v", label:"Kling V3 Turbo Std — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-v3-turbo-std/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500 },
  /* api-448184414 */
  { id:"kling-v3-0-pro-t2v", label:"Kling v3.0 Pro — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-v3.0-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500, extra:{"sound": true} },
  /* api-448184415 */
  { id:"kling-v3-0-std-t2v", label:"Kling v3.0 Std — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-v3.0-std/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500, extra:{"sound": true} },
  /* api-448184409 */
  { id:"kling-video-o1-t2v", label:"Kling video O1 — T2V (10s)", fam:"Kling · T2V", apiPath:"kling-video-o1/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspects:["1:1", "9:16", "16:9"], promptMax:2000, extra:{"mode": "std"} },
  /* api-449426876 */
  { id:"kling-video-o3-4k-t2v", label:"Kling video O3 4k — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-video-o3-4k/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:2500 },
  /* api-448184413 */
  { id:"kling-video-o3-pro-t2v", label:"Kling video O3 Pro — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-video-o3-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500, extra:{"sound": true} },
  /* api-448184412 */
  { id:"kling-video-o3-std-t2v", label:"Kling video O3 Std — T2V (15s)", fam:"Kling · T2V", apiPath:"kling-video-o3-std/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["1:1", "16:9", "9:16"], promptMax:2500, extra:{"sound": true} },
  /* api-448184419 */
  { id:"seedance-2-0-global-fast-t2v", label:"Seedance 2.0 Global Fast — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"bytedance/seedance-2.0-global-fast/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859268 */
  { id:"seedance-2-0-global-mini-t2v", label:"Seedance 2.0 Global Mini — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"bytedance/seedance-2.0-global-mini/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-448184418 */
  { id:"seedance-2-0-global-t2v", label:"Seedance 2.0 Global — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"bytedance/seedance-2.0-global/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-498749518 */
  { id:"seedance-2-5-global-token-t2v", label:"Seedance 2.5 Global — T2V (4k, 30s)", fam:"Seedance · T2V", apiPath:"bytedance/seedance-2.5-global-token/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-498749519 */
  { id:"seedance-2-5-token-t2v", label:"Seedance 2.5 — T2V (4k, 30s)", fam:"Seedance · T2V", apiPath:"bytedance/seedance-2.5-token/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "native1080p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859270 */
  { id:"rhv-sparkvideo-2-0-fast-t2v", label:"Seedance 2.0 Fast — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"rhart-video/sparkvideo-2.0-fast/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859269 */
  { id:"rhv-sparkvideo-2-0-mini-t2v", label:"Seedance 2.0 Mini — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"rhart-video/sparkvideo-2.0-mini/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-494859271 */
  { id:"rhv-sparkvideo-2-0-t2v", label:"Seedance 2.0 — T2V (4k, 15s)", fam:"Seedance · T2V", apiPath:"rhart-video/sparkvideo-2.0/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], durations:["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], promptMax:20480 },
  /* api-448184417 */
  { id:"seedance-v1-5-pro-t2v", label:"Seedance v1.5 Pro — T2V (1080p, 12s)", fam:"Seedance · T2V", apiPath:"seedance-v1.5-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12"], aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], promptMax:5000, extra:{"generateAudio": "true", "cameraFixed": "false"} },
  /* api-448184416 */
  { id:"seedance-v1-5-pro-t2v-fast", label:"Seedance v1.5 Pro Fast — T2V (1080p, 12s)", fam:"Seedance · T2V", apiPath:"seedance-v1.5-pro/text-to-video-fast", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p"], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12"], aspect:true, aspects:["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"], promptMax:5000, extra:{"generateAudio": "true", "cameraFixed": "false"} },
  /* api-448184420 */
  { id:"mm-hailuo-02-pro", label:"Hailuo 02 Pro — T2V (6s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-02/pro", imageParam:"firstImageUrl", lastParam:"lastImageUrl", minImages:0, maxImages:2, oddOnly:false, resolutions:[], durations:["6"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184424 */
  { id:"mm-hailuo-02-t2v-pro", label:"Hailuo 02 Pro — T2V", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-02/t2v-pro", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184421 */
  { id:"mm-hailuo-02-t2v-standard", label:"Hailuo 02 Standard — T2V (10s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-02/t2v-standard", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184423 */
  { id:"mm-hailuo-2-3-t2v-pro", label:"Hailuo 2.3 Pro — T2V", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-2.3/t2v-pro", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-448184422 */
  { id:"mm-hailuo-2-3-t2v-standard", label:"Hailuo 2.3 Standard — T2V (10s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-2.3/t2v-standard", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["6", "10"], aspect:false, promptMax:2000, extra:{"enablePromptExpansion": true} },
  /* api-495380677 */
  { id:"mm-hailuo-h3-t2v", label:"MiniMax H3 — T2V (768P, 15s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-h3/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["2K", "768P"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20480 },
  /* v5.89.0 api-509445865 — H3 Max T2V. ratio (not aspectRatio) is REQUIRED
     here and its documented default is 21:9. */
  { id:"mm-hailuo-h3-max-t2v", label:"MiniMax H3 Max — T2V (768P, 15s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-h3-max/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480P", "768P"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20480 },
  /* v5.89.0 api-498427800 — Context-IR t2va: a clip with its own sound from
     the prompt alone. No resolution field on this route. */
  { id:"mm-h3-context-ir-text", label:"MiniMax H3 Context-IR — T2V + sound (15s)", fam:"MiniMax · T2V", apiPath:"minimax/hailuo-h3/context-ir-text", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspectParam:"ratio", aspects:["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:7000 },
  /* api-448184430 */
  { id:"rhv-v3-1-fast-official-t2v", label:"Veo3.1 Fast — T2V (4k, 8s)", fam:"Veo 3.1 · T2V", apiPath:"rhart-video-v3.1-fast-official/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000, extra:{"generateAudio": true} },
  /* api-448184429 */
  { id:"rhv-v3-1-fast-t2v", label:"Veo3.1 Fast Low cost — T2V (4k, 8s)", fam:"Veo 3.1 · T2V", apiPath:"rhart-video-v3.1-fast/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184432 */
  { id:"rhv-v3-1-lite-official-t2v", label:"Veo3.1 Lite — T2V (1080p, 8s)", fam:"Veo 3.1 · T2V", apiPath:"rhart-video-v3.1-lite-official/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:20000 },
  /* api-448184426 */
  { id:"rhv-v3-1-pro-official-t2v", label:"Veo3.1 Pro — T2V (4k, 8s)", fam:"Veo 3.1 · T2V", apiPath:"rhart-video-v3.1-pro-official/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000, extra:{"generateAudio": false} },
  /* api-448184425 */
  { id:"rhv-v3-1-pro-t2v", label:"Veo3.1 Pro Low cost — T2V (4k, 8s)", fam:"Veo 3.1 · T2V", apiPath:"rhart-video-v3.1-pro/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["8"], aspect:true, aspects:["16:9", "9:16"], promptMax:8000 },
  /* api-448184442 */
  { id:"rhv-s-official-t2v", label:"Sora 2 — T2V (1280x720, 12s)", fam:"Sora · T2V", apiPath:"rhart-video-s-official/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720x1280", "1280x720"], resParam:"size", durations:["4", "8", "12"], aspect:false, promptMax:20000 },
  /* api-448184377 */
  { id:"rhv-s-official-t2v-pro", label:"Sora 2 Pro — T2V (1920x1080, 20s)", fam:"Sora · T2V", apiPath:"rhart-video-s-official/text-to-video-pro", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720x1280", "1280x720", "1024x1792", "1792x1024", "1080x1920", "1920x1080"], resParam:"size", durations:["4", "8", "12", "16", "20"], aspect:false, promptMax:20000 },
  /* api-448184443 */
  { id:"rhv-s-t2v", label:"Sora 2 Low cost — T2V (15s)", fam:"Sora · T2V", apiPath:"rhart-video-s/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["10", "15"], aspect:true, aspects:["9:16", "16:9"], promptMax:4000 },
  /* api-448184437 */
  { id:"wan-2-5-preview-t2v", label:"Wan 2.5 Preview — T2V (1248*1632, 10s)", fam:"Wan · T2V", apiPath:"alibaba/wan-2.5-preview/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["832*480", "480*832", "624*624", "1280*720", "720*1280", "960*960", "1088*832", "832*1088", "1920*1080", "1080*1920", "1440*1440", "1632*1248", "1248*1632"], resParam:"size", durations:["5", "10"], aspect:false, promptMax:1500 },
  /* api-448184440 */
  { id:"wan-2-6-t2v", label:"Wan 2.6 — T2V (1080*1920, 15s)", fam:"Wan · T2V", apiPath:"alibaba/wan-2.6/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["1280*720", "720*1280", "1920*1080", "1080*1920"], durations:["5", "10", "15"], aspect:false, promptMax:5000, extra:{"shotType": "single"} },
  /* api-448184436 */
  { id:"wan-2-7-t2v", label:"Wan 2.7 — T2V (1080P, 15s)", fam:"Wan · T2V", apiPath:"alibaba/wan-2.7/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720P", "1080P"], durations:["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:5000 },
  /* api-448184435 */
  { id:"rhv-wan-2-2-t2v", label:"Wan 2.2 — T2V", fam:"Wan · T2V", apiPath:"rhart-video/wan-2.2/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:[], aspect:false, promptMax:20000, extra:{"resolution": "1", "duration": "1"} },
  /* api-448184438 */
  { id:"rhv-ltx-2-3-t2v", label:"Ltx 2.3 — T2V (15s)", fam:"LTX · T2V", apiPath:"rhart-video/ltx-2.3/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:20000, extra:{"resolution": "2", "aspectRatio": "2"} },
  /* api-448184439 */
  { id:"rhv-ltx-2-3-t2v-lora", label:"Ltx 2.3 lora — T2V (15s)", fam:"LTX · T2V", apiPath:"rhart-video/ltx-2.3/text-to-video-lora", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:[], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:false, promptMax:20000, extra:{"resolution": "1", "aspectRatio": "2"} },
  /* api-448184433 */
  { id:"rhv-g-official-t2v", label:"Grok imagine — T2V (480p, 10s)", fam:"Grok · T2V", apiPath:"rhart-video-g-official/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "480p"], durations:["6", "10"], aspect:true, aspects:["16:9", "9:16", "1:1"], promptMax:800 },
  /* api-498749520 */
  { id:"rhv-g-official-t2v-v1-5", label:"Grok imagine video v1.5 — T2V (1080p, 15s)", fam:"Grok · T2V", apiPath:"rhart-video-g-official/text-to-video-v1.5", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "1:1", "9:16", "3:2", "2:3"], promptMax:2048 },
  /* api-448184434 */
  { id:"rhv-g-t2v", label:"Grok imagine Low cost v1.5 — T2V (480p, 30s)", fam:"Grok · T2V", apiPath:"rhart-video-g/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "480p"], durations:["6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"], durInt:true, aspect:true, aspects:["2:3", "3:2", "1:1", "16:9", "9:16"], promptMax:20000 },
  /* api-448184444 */
  { id:"pixverse-v6-t2v", label:"Pixverse V6 — T2V (1080p, 15s)", fam:"PixVerse · T2V", apiPath:"pixverse-v6/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"], promptMax:2048, extra:{"generateAudioSwitch": true} },
  /* api-450326932 */
  { id:"happyhorse-1-0-t2v", label:"Happyhorse 1.0 — T2V (1080p, 15s)", fam:"HappyHorse · T2V", apiPath:"alibaba/happyhorse-1.0/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2500 },
  /* api-494859272 */
  { id:"happyhorse-1-1-t2v", label:"Happyhorse 1.1 — T2V (1080p, 15s)", fam:"HappyHorse · T2V", apiPath:"alibaba/happyhorse-1.1/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "9:21", "21:9"], promptMax:2500 },
  /* api-454760428 */
  { id:"skyreels-v4-t2v-fast", label:"Skyreels V4 Fast — T2V (1080p, 15s)", fam:"SkyReels · T2V", apiPath:"skyreels-v4/text-to-video-fast", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2048, extra:{"promptOptimizer": true} },
  /* api-454760429 */
  { id:"skyreels-v4-t2v-std", label:"Skyreels V4 Std — T2V (1080p, 15s)", fam:"SkyReels · T2V", apiPath:"skyreels-v4/text-to-video-std", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["480p", "720p", "1080p"], durations:["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], durInt:true, aspect:true, aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2048, extra:{"sound": true, "promptOptimizer": true} },
  /* api-462492099 */
  { id:"gemini-omni-flash-t2v", label:"Gemini omni Flash Low cost — T2V (4k, 10s)", fam:"Omni Flash · T2V", apiPath:"gemini-omni-flash/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["720p", "1080p", "4k"], durations:["4", "6", "8", "10"], aspect:true, aspects:["16:9", "9:16"], promptMax:2048 },
  /* v5.89.0 api-508886443 */
  { id:"gemini-omni-11-t2v", label:"Gemini Omni 1.1 Flash — T2V (4k, 10s)", fam:"Omni Flash · T2V", apiPath:"google/gemini-omni-1.1-flash/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["360p", "720p", "1080p", "4k"], durations:["3", "4", "5", "6", "7", "8", "9", "10"], durInt:true, aspect:true, aspects:["16:9", "9:16"], promptMax:2048 },
  /* api-498749521 */
  { id:"rhv-flux3-t2v", label:"Flux 3 video — T2V (fhd, 20s)", fam:"Flux · T2V", apiPath:"rhart-video-flux3/text-to-video", imageParam:null, minImages:0, maxImages:0, oddOnly:false, resolutions:["hd", "fhd"], durations:["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"], durInt:true, aspect:true, aspects:["auto", "21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"], promptMax:20480 },
  /* -------- registry-sourced keepers: these eight endpoints have NO page in
     the current doc index (pixverse c1/v5.5/v5.6, runway gen4 pair, sora asyn,
     veo3.1-lite low-price, vidu q3-pro-fast; higgsfield/dop left in v6.22.0 — see RETIRED). They shipped
     in v4.98 from RunningHub's own model registry and stay exactly as
     registered until a doc page exists to verify them against. -------- */
  { id:"pixverse-c1", label:"pixverse-c1 \u2014 1080p", fam:"PixVerse", apiPath:"pixverse-c1/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:[], aspect:false, promptMax:2048, extra:{duration:5, "generateAudioSwitch": true} },
  { id:"pixverse-v5-5", label:"pixverse-v5.5 \u2014 1080p, 10s", fam:"PixVerse", apiPath:"pixverse-v5.5/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["5", "8", "10"], aspect:false, promptMax:2048, extra:{"generateAudioSwitch": "false", "generateMultiClipSwitch": "false"} },
  { id:"pixverse-v5-6", label:"pixverse-v5.6 \u2014 1080p, 10s", fam:"PixVerse", apiPath:"pixverse-v5.6/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["360p", "540p", "720p", "1080p"], durations:["5", "8", "10"], aspect:false, promptMax:2048, extra:{"generateAudioSwitch": "false"} },
  { id:"rhart-video-r-gen4-turbo-official", label:"runwayml gen4-turbo \u2014 10s", fam:"RHArt Video", apiPath:"rhart-video-r/gen4-turbo-official/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspectParam:"aspectRatio", aspects:["16:9", "9:16", "1:1", "4:3", "3:4"], promptMax:2048 },
  { id:"rhart-video-r-gen4-turbo", label:"runwayml gen4-turbo \u2014 10s", fam:"RHArt Video", apiPath:"rhart-video-r/gen4-turbo/image-to-video", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["5", "10"], aspect:true, aspectParam:"aspectRatio", aspects:["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], promptMax:1000 },
  { id:"rhart-video-s-asyn", label:"sora-2 \u2014 15s", fam:"RHArt Video", apiPath:"rhart-video-s/image-to-video-asyn", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:[], durations:["10", "15"], aspect:true, aspectParam:"aspectRatio", aspects:["9:16", "16:9"], promptMax:4000 },
  { id:"rhart-video-v3-1-lite", label:"google veo3.1-lite \u2014 4k, 8s", fam:"RHArt Video", apiPath:"rhart-video-v3.1-lite/image-to-video", imageParam:"imageUrls", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "4k"], durations:["8"], aspect:true, aspectParam:"aspectRatio", aspects:["16:9", "9:16"], promptMax:20000 },
  { id:"vidu-q3-pro-fast", label:"Vidu \u2014 1080p, 16s", fam:"Vidu", apiPath:"vidu/image-to-video-q3-pro-fast", imageParam:"imageUrl", minImages:1, maxImages:1, oddOnly:false, resolutions:["720p", "1080p"], durations:["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"], aspect:false, promptMax:2000 },
];
if (typeof module !== "undefined" && module.exports) module.exports = RH_VIDEO_MODELS;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.videoModels = RH_VIDEO_MODELS; }
})();
