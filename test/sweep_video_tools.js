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
  report("A) the tools shelf is 27 models with unique ids/endpoints, all in the picker",
    reg.n === 27 && new Set(reg.ids).size === 27 && new Set(reg.paths).size === 27 && reg.options === 27,
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
