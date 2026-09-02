/* ============================================================
   HNK AI Tools — RunningHub config (openapi/v2 "Standard Model API")
   Spec §17 (Adapter) · §19 (registry-driven)

   Endpoint paths are DATA, not code — so a real RunningHub apiPath can be
   dropped in (or a user can add one via Settings) without touching the
   adapter. Every built-in model below ships with its real, confirmed
   apiPath already: paste your RunningHub Enterprise-Shared key in Settings
   and it works immediately — no per-app/node setup (spec §17, §21).

   This is the SAME openapi/v2 (Bearer key + fixed apiPath, JSON in/out)
   scheme already proven live in the HNK Web Studio companion web app —
   ported 1:1 rather than the older Enterprise ai-app/webappId+nodeId
   scheme this file used to hold, which needed external per-account app
   ids this plugin never received and so never went live.

   v6.28.2 — no placeholder remains: the owner's verified Enterprise-Shared
   reference (2026-08-30) identifies rhart-image-g-2-official as GPT Image 2
   official stable, so the old empty "gpt-image-2" entry is retired and the
   id aliases to rh-image-g2-off in the model registry. flux-2-dev carries
   its confirmed text-to-image endpoint, ported from the companion web
   app's RH_T2I_MODELS (kind:"t2i" — prompt+aspectRatio+outputFormat only).

   v6.29.0 — two owner-supplied OpenAPI specs (2026-08-30) close out the
   held endpoints: flux-2-dev-edit joins on rhart-image/f-2-dev/edit-lora
   (FLUX.2 Dev's image-editing route, ComfyUI node-keyed body — see the
   adapter's kind:"fluxedit" branch), and rh-image-g2-t2i joins on
   rhart-image-g-2-official/text-to-image (GPT Image 2's official
   text-to-image, held since v6.28.2 for exactly this parameter table).
   The t2i branch is also field-faithful per model now — see the flag
   comments below.
   ============================================================ */
/* HNK-IIFE-WRAP: isolate module scope so top-level vars never collide
   under UXP shared-global <script> loading (browser-style). */
(function () {
"use strict";

function defaults() {
  return {
    baseUrl: "https://www.runninghub.ai",
    paths: {
      upload: "/openapi/v2/media/upload/binary",
      query: "/openapi/v2/query"
    },
    // Poll cadence + ceilings (ms). Overridable per install.
    pollIntervalMs: 2500,
    pollTimeoutMs: 180000,
    // Per-model routing. `apiPath` is appended to baseUrl + "/openapi/v2/"
    // for that model's submit call. The other flags (kind/sizeParam/
    // whParam/imageParam/promptMax/quality/resolutions) tell the adapter's
    // buildRequestBody how to shape that model's JSON body — confirmed
    // against RunningHub's own API docs, never guessed.
    //  · quality:      the endpoint marks `quality` REQUIRED — ship the
    //                  documented default on every request.
    //  · resolutions:  the endpoint's documented resolution enum, when it is
    //                  narrower than the standard 1k/2k/4k — the adapter maps
    //                  anything outside it up to the smallest documented tier
    //                  (Seedream v4.5 documents 2k|4k only, so Auto/1K → 2k).
    models: {
      "nano-banana-2":         { apiPath: "rhart-image-n-g31-flash/image-to-image" },
      "nano-banana-pro":       { apiPath: "rhart-image-n-pro/edit" },
      "nano-banana-pro-off":   { apiPath: "rhart-image-n-pro-official/edit" },
      "rh-image-g2-off":       { apiPath: "rhart-image-g-2-official/image-to-image", quality: "medium" },
      /* v6.29.0 — the fetched doc (api-448184504) identifies this as
         "gpt-image-2.0/edit-channel-low-price": GPT Image 2's cheaper
         channel route. prompt is capped at its documented 20000; no
         quality field exists here, so none is configured. */
      "rh-image-g2":           { apiPath: "rhart-image-g-2/image-to-image", promptMax: 20000 },
      /* v6.29.0 — the owner's OpenAPI spec titles this endpoint
         "xai/grok-imagine-image/edit-official-stable": Grok Imagine's
         image edit model, whose body declares EXACTLY prompt + image.
         kind:"xedit" stops the default branch appending the undeclared
         resolution/aspectRatio it used to send. */
      "rh-image-x-off":        { apiPath: "rhart-image-x-official/edit", imageParam: "image", kind: "xedit", promptMax: 20000 },
      "qwen-image-2":          { apiPath: "alibaba/qwen-image-2.0/image-edit", sizeParam: true, promptMax: 800 },
      "qwen-image-2-pro":      { apiPath: "alibaba/qwen-image-2.0-pro/image-edit", sizeParam: true, promptMax: 800 },
      /* v6.29.0 — corrected to the endpoint's own fetched doc
         (api-448184518): node-keyed like its rhart-image/ siblings —
         12##text/41##select/43##file_type, all REQUIRED, no auto ratio
         option (fallback "1" = 1:1, the old required-ratio default). */
      "flux-2-dev":            { apiPath: "rhart-image/f-2-dev/text-to-image", kind: "t2i",
                                 t2iRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"], ratioRequired: true,
                                 t2iNodeKeys: { prompt: "12##text", ratio: "41##select", fileType: "43##file_type" } },
      "flux-2-dev-edit":       { apiPath: "rhart-image/f-2-dev/edit-lora", kind: "fluxedit" },
      /* v6.27.0 — the web app's remaining text-to-image models, ported with
         their confirmed endpoints (owner: the model set must be complete).
         v6.29.0 — the field flags now really do mirror the app's defs
         verbatim (t2iRatios/ratioRequired/resolutionField/numImagesField/
         outputFormat), fixing the blanket flux-shaped body the old t2i
         branch sent for every one of them. */
      "nano-banana-pro-t2i":   { apiPath: "rhart-image-n-pro-official/text-to-image", kind: "t2i", promptMax: 20000,
                                 t2iRatios: ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], resolutionField: true },
      "qwen-image-3-pro-t2i":  { apiPath: "alibaba/qwen-image-3.0-pro/text-to-image", kind: "t2i", sizeParam: true, promptMax: 3000 },
      /* v6.53.0 — the one text-to-image endpoint the web app offered and the
         panel did not, lifted from its own RH_T2I_MODELS entry: seven ratios,
         an 8192-character prompt, and the documented hd flag. Nothing here is
         authored — the app's table is the source, as it is for every other
         model on this shelf. */
      "youchuan-v81":          { apiPath: "youchuan/text-to-image-v81", kind: "t2i", promptMax: 8192,
                                 t2iRatios: ["1:1", "4:3", "3:2", "16:9", "3:4", "2:3", "9:16"],
                                 extraBody: { hd: true } },
      "rh-imagine-quality":    { apiPath: "rhart-imagine-image-quality/text-to-image", kind: "t2i", resolutions: ["1k", "2k"], promptMax: 4000,
                                 t2iRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], resolutionField: true, numImagesField: true, outputFormat: "png" },
      /* v6.29.0 — GPT Image 2 text-to-image (official stable), wired from
         the owner's full OpenAPI spec (2026-08-30): aspectRatio optional
         15-value enum, resolution REQUIRED 1k/2k/4k, quality REQUIRED
         (documented default medium, shipped constant like the i2i
         sibling). No outputFormat/numImages/size fields on this endpoint. */
      "rh-image-g2-t2i":       { apiPath: "rhart-image-g-2-official/text-to-image", kind: "t2i", promptMax: 20000,
                                 t2iRatios: ["1:1", "1:2", "2:1", "1:3", "3:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "21:9", "9:21", "16:9"],
                                 resolutionField: true, quality: "medium" },
      "wan-image-edit":        { apiPath: "alibaba/wan-2.7/image-edit", whParam: true, promptMax: 2048 },
      "wan-image-edit-pro":    { apiPath: "alibaba/wan-2.7/image-edit-pro", whParam: true, promptMax: 2048 },
      "upscale-pro":           { apiPath: "topazlabs/image-upscale-standard-v2", imageParam: "imageUrl", kind: "upscale" },
      "seedream-v4":           { apiPath: "seedream-v4/image-to-image", kind: "seedream", promptMax: 2000 },
      "seedream-v4-5":         { apiPath: "seedream-v4.5/image-to-image", kind: "seedream", promptMax: 2000, resolutions: ["2k", "4k"] },
      /* v6.29.0 — promptMax 4000 per the owner's OpenAPI spec, which also
         narrows this endpoint's optional aspectRatio to seven ratios plus
         auto (enforced in the adapter's imagine branch). */
      "rh-imagine-quality-edit": { apiPath: "rhart-imagine-image-quality/edit", imageParam: "imageUrl", kind: "imagine", promptMax: 4000 },
      /* v6.29.0 — imageParam dropped: the owner's OpenAPI spec shows this
         endpoint's body is ComfyUI node-keyed (66##image/41##text/
         64##select/65##file_type), built whole in the adapter's zimage
         branch — no flat image field exists to name. */
      "z-image-turbo":         { apiPath: "rhart-image/z-image-turbo/image-to-image", kind: "zimage" },
      /* api-448184490 — LoRA sibling, node-keyed; LoRA pair omitted (default
         strength 0 = plain Z-Image Turbo). v6.31.0 completeness pass. */
      "z-image-turbo-lora":    { apiPath: "rhart-image/z-image-turbo/image-to-image-lora", kind: "node", node: { image: "44##image", prompt: "18##text", ratio: "41##select", fileType: "42##file_type" } },
      "upscale-transparent":   { apiPath: "topazlabs/image-upscale-transparent", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* ---------- v6.30.0 full-catalog wave ----------
         Every entry below was wired from its own fetched doc page (the
         api-<id> comment; pulled by fetch-docs.yml). Body shapes come
         from the kind/flags exactly as documented — nothing is guessed.
         Node-keyed graphs never send their LoRA pairs, so each doc's
         default adapter/strength applies. */
      /* api-448184476 */
      "seedream-v5-lite": { apiPath: "seedream-v5-lite/image-to-image", kind: "sd5lite", promptMax: 2000 },
      /* api-494859263 */
      "seedream-v5-pro": { apiPath: "seedream-v5-pro/image-to-image", kind: "sd5pro", promptMax: 5000 },
      /* api-494859267 */
      "dola-seedream-5-pro": { apiPath: "dola-Seedream-5.0-pro/image-to-image", kind: "sd5pro", promptMax: 5000 },
      /* api-448184479 */
      "grok-image-i2i": { apiPath: "rhart-image-g/image-to-image", kind: "grokimg" },
      /* api-497874395 */
      "qwen-image-3": { apiPath: "alibaba/qwen-image-3.0/image-edit", sizeParam: true, promptMax: 3000 },
      /* api-494859264 */
      "qwen-image-3-pro": { apiPath: "alibaba/qwen-image-3.0-pro/image-edit", sizeParam: true, promptMax: 3000 },
      /* api-448184493 */
      "wan-25-image": { apiPath: "alibaba/wan-2.5-preview/image-to-image", kind: "wan25", promptMax: 2000, ratioEnum: ["1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9"] },
      /* api-448184495 */
      "nano-banana-v1-off": { apiPath: "rhart-image-v1-official/edit", kind: "nanov1", promptMax: 20000, ratioEnum: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"] },
      /* api-448184498 */
      "nano-banana-v1": { apiPath: "rhart-image-v1/edit", kind: "nanov1", promptMax: 20000, ratioEnum: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"] },
      /* api-448184501 */
      "nano-banana-2-off": { apiPath: "rhart-image-n-g31-flash-official/image-to-image", promptMax: 20000 },
      /* api-494859265 */
      "nano-banana-2-lite-off": { apiPath: "rhart-image-n-g31-flash-lite-official/image-to-image", kind: "ratioOnly", promptMax: 20000, ratioEnum: ["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"] },
      /* api-494859266 */
      "nano-banana-2-lite": { apiPath: "rhart-image-n-g31-flash-lite/image-to-image", kind: "ratioOnly", promptMax: 20000, ratioEnum: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"] },
      /* api-448184496 */
      "nano-banana-pro-ultra": { apiPath: "rhart-image-n-pro-official/edit-ultra", promptMax: 20000, resolutions: ["4k", "8k"] },
      /* api-448184503 */
      "gpt-image-15-off": { apiPath: "rhart-image-g-1.5-official/image-to-image", kind: "gpt15", ratioEnum: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"] },
      /* api-465292102 */
      "jimeng-46": { apiPath: "bytedance/jimeng-4.6/image-to-image", kind: "bare", promptMax: 800 },
      /* api-498427798 */
      "sd5-layers": { apiPath: "seedream-v5-pro/layer-decomposition", kind: "sdlayer", promptMax: 2000 },
      /* api-495680091 */
      "topaz-gp-standard": { apiPath: "topazlabs/image-gigapixel-standard-2", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680090 */
      "topaz-gp-lowres": { apiPath: "topazlabs/image-gigapixel-low-resolution-2", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680089 */
      "topaz-gp-text": { apiPath: "topazlabs/image-gigapixel-text-and-shapes", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680092 */
      "topaz-gp-hifi": { apiPath: "topazlabs/image-gigapixel-high-fidelity-2", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680093 */
      "topaz-gp-art": { apiPath: "topazlabs/image-gigapixel-art-and-cgi", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680095 */
      "topaz-up-faces": { apiPath: "topazlabs/image-upscale-detail-faces", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-495680096 */
      "topaz-up-hifi3": { apiPath: "topazlabs/image-upscale-high-fidelity-v3", imageParam: "imageUrl", kind: "upscale-transparent" },
      /* api-448184482 */
      "flux-2-dev-edit-plain": { apiPath: "rhart-image/f-2-dev/edit", kind: "node", node: { image: "20##image", prompt: "17##text", ratio: "46##select", fileType: "51##file_type", auto: true } },
      /* api-448184483 */
      "flux-klein-9b-edit": { apiPath: "rhart-image/f-2-klein-9b/edit", kind: "node", node: { image: "53##image", prompt: "54##text", ratio: "81##select", fileType: "55##file_type", auto: true } },
      /* api-448184484 */
      "flux-klein-4b-edit": { apiPath: "rhart-image/f-2-klein-4b/edit", kind: "node", node: { image: "19##image", prompt: "17##text", ratio: "47##select", fileType: "51##file_type" } },
      /* api-448184485 */
      "flux-klein-4b-edit-lora": { apiPath: "rhart-image/f-2-klein-4b/edit-lora", kind: "node", node: { image: "41##image", prompt: "16##text", ratio: "37##select", fileType: "40##file_type" } },
      /* api-448184480 */
      "flux-kontext-lora": { apiPath: "rhart-video/f-kontext/dev-lora", kind: "node", node: { image: "15##image", prompt: "4##text", ratio: "41##select", fileType: "16##file_type", auto: true } },
      /* api-448184487 */
      "qwen-edit-2511": { apiPath: "rhart-image/qwen-image/edit-2511", kind: "node", node: { images: ["57##image","58##image","59##image"], prompt: "53##text", ratio: "28##select", fileType: "52##file_type" } },
      /* api-448184486 */
      "qwen-edit-2511-lora": { apiPath: "rhart-image/qwen-image/edit-2511-lora", kind: "node", node: { image: "44##image", prompt: "38##text", ratio: "32##select", fileType: "40##file_type" } },
      /* api-448184492 */
      "wan-22-image": { apiPath: "rhart-video/wan-2.2/image-to-image", kind: "node", node: { image: "272##image", prompt: "79##text", ratio: "267##select", fileType: "242##file_type", auto: true } },
      /* api-448184505 */
      "seedream-v4-t2i": { apiPath: "seedream-v4/text-to-image", kind: "t2i", resolutionField: true, extraBody: { sequentialImageGeneration:"disabled", maxImages:1 } },
      /* api-448184506 */
      "seedream-v45-t2i": { apiPath: "seedream-v4.5/text-to-image", kind: "t2i", resolutionField: true, resolutions: ["2k","4k"], extraBody: { sequentialImageGeneration:"disabled", maxImages:1 } },
      /* api-448184507 */
      "seedream-v5-lite-t2i": { apiPath: "seedream-v5-lite/text-to-image", kind: "t2i", resolutionField: true, resolutions: ["2k","3k"], extraBody: { sequentialImageGeneration:"disabled", maxImages:1 } },
      /* api-494859257 */
      "seedream-v5-pro-t2i": { apiPath: "seedream-v5-pro/text-to-image", kind: "t2i", resolutionField: true, resolutions: ["1k","2k"], extraBody: { outputFormat:"png" } },
      /* api-494859262 */
      "dola-sd5-t2i": { apiPath: "dola-Seedream-5.0-pro/text-to-image", kind: "t2i", resolutionField: true, resolutions: ["1k","2k"], extraBody: { outputFormat:"png" } },
      /* api-448184508 */
      "grok-image-t2i": { apiPath: "rhart-image-g/text-to-image", kind: "t2i", t2iRatios: ["960x960","720x1280","1280x720","1168x784","784x1168"], extraBody: { model:"g-4.2" } },
      /* api-448969339 */
      "grok-imagine-t2i": { apiPath: "rhart-image-x-official/text-to-image", kind: "t2i", t2iRatios: ["2:1","20:9","16:9","4:3","3:2","1:1","2:3","3:4","9:16","9:20","1:2"], extraBody: { outputFormat:"png" } },
      /* api-497874394 */
      "qwen-image-3-t2i": { apiPath: "alibaba/qwen-image-3.0/text-to-image", kind: "t2i", sizeMap: "qwen3" },
      /* api-448184511 */
      "qwen-image-2-t2i": { apiPath: "alibaba/qwen-image-2.0/text-to-image", kind: "t2i", sizeMap: "qwen2" },
      /* api-448184512 */
      "qwen-image-2-pro-t2i": { apiPath: "alibaba/qwen-image-2.0-pro/text-to-image", kind: "t2i", sizeMap: "qwen2" },
      /* api-448184526 */
      "wan-25-t2i": { apiPath: "alibaba/wan-2.5-preview/text-to-image", kind: "t2i", sizeMap: "wan25", sizeRequired: true },
      /* api-448184525 */
      "wan-27-t2i": { apiPath: "alibaba/wan-2.7/text-to-image", kind: "t2i", whField: true },
      /* api-448184527 */
      "wan-27-pro-t2i": { apiPath: "alibaba/wan-2.7/text-to-image-pro", kind: "t2i", whField: true },
      /* api-448184532 */
      "nano-v1-off-t2i": { apiPath: "rhart-image-v1-official/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"], autoRatioValue: "auto" },
      /* api-448184535 */
      "nano-v1-t2i": { apiPath: "rhart-image-v1/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"], autoRatioValue: "auto" },
      /* api-448184536 */
      "nano-pro-low-t2i": { apiPath: "rhart-image-n-pro/text-to-image", kind: "t2i", t2iRatios: ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], resolutionField: true },
      /* api-448184533 */
      "nano-pro-ultra-t2i": { apiPath: "rhart-image-n-pro-official/text-to-image-ultra", kind: "t2i", t2iRatios: ["1:1","3:2","2:3","3:4","4:3","4:5","5:4","9:16","16:9","21:9"], resolutionField: true, resolutions: ["4k","8k"] },
      /* api-448184537 */
      "nano2-off-t2i": { apiPath: "rhart-image-n-g31-flash-official/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], resolutionField: true },
      /* api-448184538 */
      "nano2-low-t2i": { apiPath: "rhart-image-n-g31-flash/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"], resolutionField: true },
      /* api-494859260 */
      "nano2-lite-off-t2i": { apiPath: "rhart-image-n-g31-flash-lite-official/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"] },
      /* api-494859261 */
      "nano2-lite-low-t2i": { apiPath: "rhart-image-n-g31-flash-lite/text-to-image", kind: "t2i", t2iRatios: ["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","1:4","4:1","1:8","8:1"] },
      /* api-448184539 */
      "gpt15-off-t2i": { apiPath: "rhart-image-g-1.5-official/text-to-image", kind: "t2i", ratioForSizeOnly: true, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], sizeMap: "gpt15", sizeRequired: true, extraBody: { quality:"medium" } },
      /* api-448184541 */
      "gpt2-low-t2i": { apiPath: "rhart-image-g-2/text-to-image", kind: "t2i", t2iRatios: ["1:1","2:3","3:2","4:5","5:4","4:3","3:4","16:9","9:16","21:9","9:21","2:1","1:2","3:1","1:3"], resolutionField: true },
      /* api-465292103 */
      "jimeng-t2i": { apiPath: "bytedance/jimeng-4.6/text-to-image", kind: "t2i" },
      /* api-448184494 */
      "mj-v6-t2i": { apiPath: "youchuan/text-to-image-v6", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"] },
      /* api-448184530 */
      "mj-v61-t2i": { apiPath: "youchuan/text-to-image-v61", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"] },
      /* api-448184529 */
      "mj-niji6-t2i": { apiPath: "youchuan/text-to-image-niji6", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"] },
      /* api-448184531 */
      "mj-v7-t2i": { apiPath: "youchuan/text-to-image-v7", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"] },
      /* api-448184528 */
      "mj-niji7-t2i": { apiPath: "youchuan/text-to-image-niji7", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"] },
      /* api-494859259 */
      "mj-v82-t2i": { apiPath: "youchuan/text-to-image-v82", kind: "t2i", t2iRatios: ["1:1","4:3","3:2","16:9","3:4","2:3","9:16"], extraBody: { hd:true } },
      /* api-448184510 */
      "qwen-2512-t2i": { apiPath: "rhart-image/qwen-image/text-to-image-2512", kind: "t2i", t2iNodeKeys: { prompt: "3##text", ratio: "25##select", fileType: "31##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184509 */
      "qwen-2512-lora-t2i": { apiPath: "rhart-image/qwen-image/text-to-image-2512-lora", kind: "t2i", t2iNodeKeys: { prompt: "6##text", ratio: "24##select", fileType: "30##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184514 */
      "z-turbo-t2i": { apiPath: "rhart-image/z-image/turbo", kind: "t2i", t2iNodeKeys: { prompt: "10##text", ratio: "28##select", fileType: "29##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184513 */
      "z-turbo-lora-t2i": { apiPath: "rhart-image/z-image/turbo-lora", kind: "t2i", t2iNodeKeys: { prompt: "6##text", ratio: "30##select", fileType: "34##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184517 */
      "flux2-lora-t2i": { apiPath: "rhart-image/f-2-dev/text-to-image-lora", kind: "t2i", t2iNodeKeys: { prompt: "12##text", ratio: "42##select", fileType: "44##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184520 */
      "klein9b-t2i": { apiPath: "rhart-image/f-2-klein-9b/text-to-image", kind: "t2i", t2iNodeKeys: { prompt: "36##text", ratio: "51##select", fileType: "54##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184519 */
      "klein9b-lora-t2i": { apiPath: "rhart-image/f-2-klein-9b/text-to-image-lora", kind: "t2i", t2iNodeKeys: { prompt: "37##text", ratio: "52##select", fileType: "55##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184521 */
      "klein4b-t2i": { apiPath: "rhart-image/f-2-klein-4b/text-to-image", kind: "t2i", t2iNodeKeys: { prompt: "9##text", ratio: "94##select", fileType: "103##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184522 */
      "klein4b-lora-t2i": { apiPath: "rhart-image/f-2-klein-4b/text-to-image-lora", kind: "t2i", t2iNodeKeys: { prompt: "9##text", ratio: "33##select" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184515 */
      "krea-t2i": { apiPath: "rhart-image/f-krea-dev-lora", kind: "t2i", t2iNodeKeys: { prompt: "45##text", ratio: "133##select", fileType: "135##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184523 */
      "fdev-t2i": { apiPath: "rhart-image/f-dev", kind: "t2i", t2iNodeKeys: { prompt: "23##text", ratio: "43##select", fileType: "48##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184516 */
      "fdev-lora-t2i": { apiPath: "rhart-image/f-dev-lora", kind: "t2i", t2iNodeKeys: { prompt: "105##text", ratio: "104##select", fileType: "106##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
      /* api-448184524 */
      "wan22-lora-t2i": { apiPath: "rhart-video/wan-2.2/text-to-image-lora", kind: "t2i", t2iNodeKeys: { prompt: "79##text", ratio: "225##select", fileType: "201##file_type" }, t2iRatios: ["1:1","3:4","4:3","9:16","16:9","2:3","3:2"], ratioRequired: true },
    }
  };
}

/* Merge a user override (from Settings — e.g. a custom model's pasted
   apiPath) over the defaults. */
function resolve(override) {
  var d = defaults();
  if (!override || typeof override !== "object") return d;
  var out = Object.assign({}, d, override);
  /* an override saved before a base URL was set carries baseUrl:"" — an empty
     host must never wipe the default, or every request URL turns path-only */
  if (!out.baseUrl) out.baseUrl = d.baseUrl;
  out.paths = Object.assign({}, d.paths, override.paths || {});
  /* Per-model DEEP merge, not a flat Object.assign: an override commonly only
     carries { apiPath } (e.g. Settings' "add a model endpoint" form saves
     just the path) — a flat merge would silently replace the whole model
     config and drop its request-body-shape flags (kind/sizeParam/whParam/
     imageParam/promptMax), corrupting every future request for that model. */
  out.models = Object.assign({}, d.models);
  var overrideModels = override.models || {};
  for (var id in overrideModels) {
    if (!overrideModels.hasOwnProperty(id)) continue;
    out.models[id] = Object.assign({}, d.models[id] || {}, overrideModels[id]);
  }
  return out;
}

function modelConfig(cfg, modelId) {
  return (cfg && cfg.models && cfg.models[modelId]) || null;
}

/* True when the model has no real apiPath yet (so the UI can warn instead
   of firing a doomed request). */
function isPlaceholder(cfg, modelId) {
  var mc = modelConfig(cfg, modelId);
  return !mc || !mc.apiPath;
}

var API = { defaults: defaults, resolve: resolve, modelConfig: modelConfig, isPlaceholder: isPlaceholder };

if (typeof module !== "undefined" && module.exports) module.exports = API;
else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.runninghubConfig = API; }
})();
