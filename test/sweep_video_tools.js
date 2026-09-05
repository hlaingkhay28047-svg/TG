/* v5.55.0 sweep — the VIDEO TOOLS shelf (video-input catalog).

   WHAT THIS PROVES. The image and video generation shelves both learned the
   same lesson twice: an endpoint's REQUIRED field that the adapter never
   sends does not fail loudly — it fails at submit with an opaque error. The
   tools shelf is a THIRD adapter (video-input endpoints: edit, extend,
   Topaz enhance family, subtitle erase, motion control, continuation), so
   it gets the same proof on day one: every tool's body is built by the real
   builder (rhVtBody) and checked against the endpoint's OWN published
   required list, transcribed below from the fetched doc pages.

   Usage: PORT=8931 node test/sweep_video_tools.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* endpoint -> the fields RunningHub's own doc marks required (fetched via
   the read-only fetch-docs lane; kept here so the test needs no network). */
const CONTRACT = {
  "rhart-video-v3.1-fast-official/video-extend": [
    "video",
    "resolution"
  ],
  "rhart-video-v3.1-pro-official/video-extend": [
    "video",
    "resolution"
  ],
  "alibaba/happyhorse-1.0/video-edit": [
    "videoUrl",
    "prompt",
    "resolution"
  ],
  "rhart-video-g-official/edit-video": [
    "prompt",
    "videoUrl",
    "resolution"
  ],
  "gemini-omni-flash/video-edit": [
    "prompt",
    "resolution",
    "videoUrl"
  ],
  "kling-video-o1-std/edit-video": [
    "mode",
    "prompt",
    "videoUrl",
    "keepOriginalSound"
  ],
  "kling-video-o3-std/video-edit": [
    "prompt",
    "videoUrl",
    "keepOriginalSound"
  ],
  "kling-video-o3-pro/video-edit": [
    "prompt",
    "videoUrl",
    "keepOriginalSound"
  ],
  "volc-subtitle-erase-pro/video": [
    "videoUrl"
  ],
  "topazlabs/video-astra": [
    "videoUrl",
    "outputWidth",
    "outputHeight",
    "model"
  ],
  "topazlabs/video-starlight": [
    "videoUrl",
    "outputWidth",
    "outputHeight",
    "model"
  ],
  "volc-subtitle-erase/video": [
    "videoUrl"
  ],
  "topazlabs/video-denoise": [
    "videoUrl",
    "outputWidth",
    "outputHeight",
    "model"
  ],
  "rhart-video/video-fps-increaser": [
    "videoUrl"
  ],
  "rhart-video/video-upscaler": [
    "videoUrl",
    "targetResolution"
  ],
  "pixverse-v6/extend": [
    "prompt",
    "videoUrl",
    "resolution",
    "duration",
    "generateAudioSwitch"
  ],
  "topazlabs/video-frame-interpolation": [
    "videoUrl",
    "outputWidth",
    "outputHeight",
    "model"
  ],
  "bytedance/dreamactor-v2": [
    "imageUrl",
    "videoUrl"
  ],
  "kling-v2.6-std/motion-control": [
    "imageUrl",
    "videoUrl",
    "characterOrientation"
  ],
  "kling-v2.6-pro/motion-control": [
    "imageUrl",
    "videoUrl",
    "characterOrientation"
  ],
  "kling-v3.0-std/motion-control": [
    "imageUrl",
    "videoUrl",
    "characterOrientation"
  ],
  "kling-v3.0-pro/motion-control": [
    "imageUrl",
    "videoUrl",
    "characterOrientation"
  ],
  "topazlabs/video-proteus": [
    "videoUrl",
    "outputWidth",
    "outputHeight",
    "model"
  ],
  "alibaba/wan-2.7/video-extend": [
    "videoUrl",
    "resolution",
    "duration"
  ],
  "rhart-video-g-official/video-extend": [
    "videoUrl",
    "prompt",
    "duration"
  ],
  "rhart-video-flux3/video-to-video": [
    "prompt",
    "startVideo",
    "resolution"
  ],
  "rhart-video/wan2.2/character-motion-transfer": [
    "299##image",
    "275##video"
  ],
  /* v5.89.0 — four endpoints published since the last sweep. */
  "google/gemini-omni-1.1-flash/video-edit": [
    "videoUrl",
    "prompt",
    "resolution"
  ],
  /* The three MiniMax-H3 regeneration routes: a finished 768P clip goes back
     in as baseVideoUrl and comes out at 2K. resolution is a one-value enum,
     and it is still REQUIRED — the kind of field that fails opaquely when an
     adapter assumes a single-value enum can be left out. */
  "minimax/hailuo-h3/regeneration-image-to-video": [
    "prompt",
    "baseVideoUrl",
    "resolution"
  ],
  "minimax/hailuo-h3/regeneration-text-to-video": [
    "prompt",
    "baseVideoUrl",
    "resolution"
  ],
  "minimax/hailuo-h3/regeneration-multimodal-to-video": [
    "prompt",
    "baseVideoUrl",
    "resolution"
  ],
  "topazlabs/video-upscale": [
    "videoUrl",
    "targetResolution",
    "targetFps"
  ],
  "skyreels-v3/video-restyling": [
    "videoUrl",
    "styleName"
  ],
  "skyreels-v3/shot-switching-video-extension": [
    "prompt",
    "videoUrl"
  ],
  "skyreels-v3/single-shot-video-extension": [
    "prompt",
    "videoUrl"
  ],
  "rhart-video-r/gen4-aleph-official/video-to-video": [
    "prompt",
    "videoUrl"
  ],
  "volc-drama/video-translate": [
    "videoUrl",
    "projectName",
    "sourceLang",
    "targetLangs"
  ]
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  const reg = await page.evaluate(() => ({
    n: RH_VTOOL_MODELS.length,
    ids: RH_VTOOL_MODELS.map(m => m.id),
    paths: RH_VTOOL_MODELS.map(m => m.apiPath),
    options: document.getElementById("selVtModel").querySelectorAll("option").length
  }));
  report("A) the tools shelf is 37 models with unique ids/endpoints, all in the picker",
    reg.n === 37 && new Set(reg.ids).size === 37 && new Set(reg.paths).size === 37 && reg.options === 37,
    reg);

  /* B) every tool builds a body its own endpoint would accept */
  const bodies = await page.evaluate(() =>
    RH_VTOOL_MODELS.map(m => {
      const opt = {};
      (m.options || []).forEach(o => { opt[o.key] = o.def; });
      if (m.whPreset) opt.whPreset = "1080p";
      return { id: m.id, path: m.apiPath,
        body: rhVtBody(m, "VID.mp4", ["IMG.jpg"], "test prompt", opt) };
    }));
  const miss = bodies.map(b => {
    const need = CONTRACT[b.path];
    if (!need) return { id: b.id, missing: ["NO CONTRACT"] };
    const missing = need.filter(k => !(k in b.body) || b.body[k] === "" || b.body[k] == null);
    return missing.length ? { id: b.id, missing } : null;
  }).filter(Boolean);
  report("B) every tool sends every field ITS endpoint marks required", miss.length === 0, miss.slice(0, 5));

  /* B2) and nothing undeclared: no body invents a field outside its doc */
  const vid = bodies.find(b => b.path === "rhart-video/video-upscaler");
  report("B2) the upscaler body is exactly videoUrl + targetResolution",
    vid && Object.keys(vid.body).sort().join(",") === "targetResolution,videoUrl", vid && vid.body);

  /* C) Topaz preset resolves the REQUIRED outputWidth/outputHeight integers */
  const topaz = bodies.find(b => b.path === "topazlabs/video-starlight");
  report("C) Topaz preset 1080p becomes outputWidth 1920 / outputHeight 1080 + model enum",
    topaz && topaz.body.outputWidth === 1920 && topaz.body.outputHeight === 1080 &&
    topaz.body.model === "slp-2.5" && topaz.body.videoUrl === "VID.mp4", topaz && topaz.body);

  /* C2) motion control: photo AND video in their own fields, orientation default */
  const mc = bodies.find(b => b.path === "kling-v3.0-pro/motion-control");
  report("C2) motion control carries imageUrl + videoUrl + documented characterOrientation",
    mc && mc.body.imageUrl === "IMG.jpg" && mc.body.videoUrl === "VID.mp4" &&
    mc.body.characterOrientation === "video", mc && mc.body);

  /* C3) the wan2.2 node graph rides its two node keys, nothing else */
  const nodeTool = bodies.find(b => b.path === "rhart-video/wan2.2/character-motion-transfer");
  report("C3) wan2.2 motion transfer sends exactly 299##image + 275##video",
    nodeTool && nodeTool.body["299##image"] === "IMG.jpg" && nodeTool.body["275##video"] === "VID.mp4" &&
    Object.keys(nodeTool.body).length === 2, nodeTool && nodeTool.body);

  /* C4) v5.89.0 — the regeneration routes put the SOURCE VIDEO in
     baseVideoUrl, not videoUrl. Getting that name wrong is the exact failure
     the contract table above exists to catch, so it is asserted by name and
     the wrong name is asserted absent. */
  const regenT = bodies.find(b => b.path === "minimax/hailuo-h3/regeneration-text-to-video");
  report("C4) H3 regeneration sends baseVideoUrl (never videoUrl) with the required 2K",
    regenT && regenT.body.baseVideoUrl === "VID.mp4" && !("videoUrl" in regenT.body) &&
    regenT.body.resolution === "2K" && regenT.body.prompt === "test prompt" &&
    Object.keys(regenT.body).length === 3, regenT && regenT.body);

  /* C5) and the multimodal one carries its references as an ARRAY, capped at
     the nine its doc allows — a single string there would be rejected. */
  const regenM = bodies.find(b => b.path === "minimax/hailuo-h3/regeneration-multimodal-to-video");
  report("C5) H3 multimodal regeneration sends imageUrls as an array",
    regenM && Array.isArray(regenM.body.imageUrls) && regenM.body.imageUrls[0] === "IMG.jpg" &&
    regenM.body.baseVideoUrl === "VID.mp4", regenM && regenM.body);

  /* C6) the new Gemini video edit has NO image field in its doc, unlike its
     low-cost sibling, so it must not grow one. */
  const g11 = bodies.find(b => b.path === "google/gemini-omni-1.1-flash/video-edit");
  report("C6) Gemini Omni 1.1 video edit is exactly videoUrl + prompt + resolution",
    g11 && Object.keys(g11.body).sort().join(",") === "prompt,resolution,videoUrl",
    g11 && g11.body);

  /* v6.13.0 — volc-drama/video-translate wants a projectName UNIQUE per job, so
     rhVtBody stamps the submit time into the extra's {{TS}}; dubbing is on, and
     both languages ride as the registry's own enum strings. */
  const tr = bodies.find(b => b.path === "volc-drama/video-translate");
  report("C7) video translate stamps a unique project name, dubs, and carries both languages",
    tr && /^HNK-\d{10,}$/.test(String(tr.body.projectName)) && tr.body.isDub === true &&
    tr.body.sourceLang === "zh" && tr.body.targetLangs === "en" && tr.body.videoUrl === "VID.mp4" &&
    !("prompt" in tr.body), tr && tr.body);
  /* and the Aleph edit carries its OPTIONAL reference picture in the field the registry names */
  const al = bodies.find(b => b.path === "rhart-video-r/gen4-aleph-official/video-to-video");
  report("C8) Runway Aleph sends prompt + videoUrl + aspectRatio and the optional referenceImageUrl",
    al && al.body.prompt === "test prompt" && al.body.videoUrl === "VID.mp4" && al.body.aspectRatio === "16:9" &&
    al.body.referenceImageUrl === "IMG.jpg", al && al.body);

  /* D) UI honesty: image button only when the tool takes one, prompt likewise */
  const ui = await page.evaluate(() => {
    const bad = [];
    RH_VTOOL_MODELS.forEach(m => {
      document.getElementById("selVtModel").value = m.id; updateVtModelUI();
      const imgShown = document.getElementById("btnVtImgPick").style.display !== "none";
      const prShown = document.getElementById("vtPrompt").style.display !== "none";
      if (imgShown !== !!m.imageParam || prShown !== !!m.prompt)
        bad.push({ id: m.id, imgShown, prShown });
    });
    return bad;
  });
  report("D) image and prompt controls appear exactly when the tool declares them", ui.length === 0, ui.slice(0, 5));

  report("E) no page errors", errs.length === 0, errs);

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
