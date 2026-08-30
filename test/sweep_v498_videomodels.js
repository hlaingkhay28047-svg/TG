/* v4.98.0 regression sweep — the video shelf goes from two models to sixty-five.
   v5.55.0 — the shelf becomes the FULL doc-verified catalog: 182 models
   (image-to-video incl. Start+End pairs, reference-to-video, text-to-video)
   plus nine registry-sourced keepers with no doc page. Pins updated to the
   new measured truth; the per-model body check now understands the three
   new def shapes (maxImages 0 = no image field at all, kind:"vnode" =
   ComfyUI node-keyed body, durInt = numeric duration).

   WHAT THE OWNER ASKED. He asked whether the video models were complete and
   whether Seedance was there. Measured: the app registered TWO endpoints while
   RunningHub publishes SIXTY-SEVEN image-to-video endpoints across twelve
   families, and Seedance was not among the two. He then said add them all.

   SIXTY-FIVE, NOT SIXTY-SEVEN, AND THE SWEEP SAYS SO OUT LOUD. Two cannot be
   driven from a photograph and a prompt: rhart-video-flux3 requires a
   `keyframes` structure this app has no way to author, and
   minimax/hailuo-h3/regeneration requires a `baseVideoUrl` because it
   regenerates an existing video. Registering either would put an option in the
   picker that fails on use, which is worse than its absence. C pins both by
   name so a later "we added them all" cannot quietly include a broken one.

   THE ASSERTION THAT MATTERS MOST IS D. These endpoints do not share a request
   shape, and the old adapter hard-coded one. Measured across the sixty-seven:
   the first image is `imageUrl` on 34, `firstImageUrl` on 18, `imageUrls` on 4
   and `firstFrameUrl` on 6; nineteen accept a last frame; the aspect field is
   `aspectRatio` on some and `ratio` on others; and THIRTY declare REQUIRED
   parameters the adapter never sent — sound, bgm, generateAudio, cameraFixed,
   movementAmplitude, enablePromptExpansion, promptOptimizer, shotType, mode.
   A missing required field does not fail loudly. It fails at submit with an
   opaque error, which is exactly the class of bug this repo keeps finding. D
   builds the real request body for EVERY model and checks that the endpoint's
   own declared requirements are all present.

   AND E IS THE CONTROL-HONESTY RULE, APPLIED TO A NEW SURFACE. 27 of the 65
   declare no `resolution` at all and 15 declare no `duration`. Rendering an
   empty dropdown for those would be a control that looks available and does
   nothing — the defect the whole v4.34 wave was about.

   Usage: PORT=8931 node test/sweep_v498_videomodels.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* The two ids that existed before this release. Every saved config and every
   video workflow card names one of them, so they must survive verbatim. */
const LEGACY = ["rh-video-g-off", "gemini-omni-video"];
/* Deliberately absent — v5.55.0: ten documented endpoints this app cannot
   author inputs for (asset registration, lip-sync session flows, audio-file
   inputs, script authoring, draftCache), plus the one endpoint no longer in
   the doc index at all. rhart-video-flux3/image-to-video moved OUT of this
   list: its doc shows keyframes is an array of image URLs, so it is wired. */
const REFUSED = ["kling-elements-advanced",
                 "kling-lip-sync/lip-sync-video",
                 "kling-v2-ai-avatar-standard/image-audio-to-video",
                 "kling-v2-ai-avatar-pro/image-audio-to-video",
                 "vidu/short-play-q3-drama",
                 "vidu/short-play-q3-ad",
                 "rhart-video-flux3/draft-enhance",
                 "minimax/hailuo-h3/regeneration-image-to-video"];

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
    n: RH_VIDEO_MODELS.length,
    ids: RH_VIDEO_MODELS.map(m => m.id),
    paths: RH_VIDEO_MODELS.map(m => m.apiPath),
    fams: RH_VIDEO_MODELS.reduce((a, m) => { const f = m.fam || "HNK"; a[f] = (a[f] || 0) + 1; return a; }, {}),
    seedance: RH_VIDEO_MODELS.filter(m => /seedance|sparkvideo/i.test(m.apiPath)).map(m => ({
      id: m.id, path: m.apiPath, res: (m.resolutions || []).slice(-1)[0],
      dur: (m.durations || []).slice(-1)[0], promptMax: m.promptMax, last: !!m.lastParam }))
  }));

  report("A) the shelf is 182 models, with unique ids and unique endpoints",
    reg.n === 182 && new Set(reg.ids).size === 182 && new Set(reg.paths).size === 182,
    { n: reg.n, ids: new Set(reg.ids).size, paths: new Set(reg.paths).size });

  report("A2) the two that shipped before are still there, under the same ids",
    LEGACY.every(id => reg.ids.indexOf(id) >= 0), reg.ids.slice(0, 4));

  report("B) Seedance is registered — at least the six variants the owner asked about",
    reg.seedance.length >= 6 &&
    reg.seedance.some(m => /sparkvideo-2\.0\/image-to-video$/.test(m.path)) &&
    reg.seedance.some(m => /seedance-2\.5-token/.test(m.path)),
    reg.seedance);

  report("B2) Seedance lifts the two ceilings the makeup workflows are squeezed by",
    (function () {
      const s20 = reg.seedance.find(m => /sparkvideo-2\.0\/image-to-video$/.test(m.path));
      const s25 = reg.seedance.find(m => /seedance-2\.5-token/.test(m.path));
      return !!s20 && +s20.dur >= 15 && s20.promptMax >= 20000 && s20.last === true &&
             !!s25 && +s25.dur >= 30;
      })(),
    { note: "the shipped cut lists live inside a 2048 prompt cap and a 10s ceiling today",
      seedance20: reg.seedance.find(m => /sparkvideo-2\.0\/image-to-video$/.test(m.path)),
      seedance25: reg.seedance.find(m => /seedance-2\.5-token/.test(m.path)) });

  report("C) the two endpoints this app cannot drive are absent, and named in the source",
    REFUSED.every(p => reg.paths.indexOf(p) < 0) &&
    REFUSED.every(p => src.indexOf(p) >= 0),
    { registered: REFUSED.filter(p => reg.paths.indexOf(p) >= 0),
      undocumented: REFUSED.filter(p => src.indexOf(p) < 0) });

  /* ---- D) EVERY model builds a request its own endpoint would accept ---- */
  const bodies = await page.evaluate(async () => {
    const out = [];
    const orig = window.fetch;
    for (const m of RH_VIDEO_MODELS) {
      let seen = null;
      window.fetch = async (u, o) => { seen = { url: String(u), body: JSON.parse(o.body) }; throw new Error("halt"); };
      try {
        await rhV2SubmitVideo("K", m.apiPath, m.maxImages === 0 ? [] : ["FIRST.jpg", "SECOND.jpg"], "p",
          (m.resolutions || [])[0], (m.durations || [])[0], (m.aspects || [])[0],
          m.imageParam, m.promptMax, m);
      } catch (e) { /* expected */ }
      out.push({ id: m.id, ok: !!seen, url: seen && seen.url, body: seen && seen.body,
        want: { imageParam: m.imageParam, lastParam: m.lastParam || null,
                aspectParam: m.aspectParam || null, extra: m.extra || null } });
    }
    window.fetch = orig;
    return out;
  });

  const wantByPath = await page.evaluate(() =>
    RH_VIDEO_MODELS.reduce((a, m) => { a[m.id] = { apiPath: m.apiPath }; return a; }, {}));

  /* v5.55.0 — three def shapes have no top-level image field to check:
     text-to-video (maxImages 0 sends no image at all), and vnode graphs
     (the photo rides its ##image node key, asserted separately below). */
  const wantById = await page.evaluate(() =>
    RH_VIDEO_MODELS.reduce((a, m) => { a[m.id] = { maxImages: m.maxImages, kind: m.kind || null, node: m.node || null }; return a; }, {}));
  const missingImage = bodies.filter(b => {
    const w = wantById[b.id];
    if (!b.ok) return true;
    if (w.kind === "vnode") return (w.node.images || []).some(k => b.body[k] !== "FIRST.jpg" && !(w.node.images.indexOf(k) === 1 && b.body[k] === "SECOND.jpg"));
    if (w.maxImages === 0) return Object.keys(b.body).some(k => /image|frame|keyframe/i.test(k));
    return !(b.want.imageParam in b.body);
  });
  report("D) every model puts the photo in the field ITS endpoint declares (and t2v sends none)",
    missingImage.length === 0, missingImage.slice(0, 4).map(b => ({ id: b.id, want: b.want.imageParam, got: Object.keys(b.body || {}) })));

  const missingExtra = bodies.filter(b => b.want.extra &&
    Object.keys(b.want.extra).some(k => !(k in b.body)));
  report("D2) every REQUIRED parameter reaches the endpoint — thirty models declare one",
    missingExtra.length === 0,
    missingExtra.slice(0, 4).map(b => ({ id: b.id, missing: Object.keys(b.want.extra).filter(k => !(k in b.body)) })));

  /* D2b — THE ASSERTION D2 COULD NOT MAKE, AND THE BUG THAT PROVED IT.
     D2 checks the extras a model DECLARES, so it can only catch a descriptor
     that was built right and then broken. It cannot see a requirement the
     descriptor never recorded. Nine models declared `duration` REQUIRED with an
     EMPTY options list; the generator read options to build both the picker and
     the request, so those nine carried no duration anywhere and every run would
     have failed at submit — and D2 passed throughout. This checks the request
     against RunningHub's OWN published contract for each endpoint, which is the
     only source that knows what is required. */
  const CONTRACT = {
    /* endpoint -> fields RunningHub marks required. Transcribed from its
       published models_registry.json, kept here so the test does not depend on
       fetching the network. Only the endpoints with a required field that our
       own descriptor could plausibly miss. */
    "kling-v3-4k/image-to-video": ["duration"],
    "kling-video-o3-4k/image-to-video": ["duration"],
    "kling-video-o3-pro/image-to-video": ["duration"],
    "kling-video-o3-std/image-to-video": ["duration"],
    "pixverse-c1/image-to-video": ["duration", "resolution"],
    "pixverse-v6/image-to-video": ["duration", "resolution"],
    "rhart-video-g/image-to-video": ["duration", "resolution"],
    "rhart-video-g-official/image-to-video-v1.5": ["duration", "resolution"],
    "alibaba/wan-2.7-spicy/image-to-video": ["duration", "resolution"]
  };
  const contractMiss = bodies.map(b => {
    const m = wantByPath[b.id];
    const need = CONTRACT[m && m.apiPath];
    if (!need) return null;
    const missing = need.filter(k => !(k in b.body) || b.body[k] === "" || b.body[k] == null);
    return missing.length ? { id: b.id, path: m.apiPath, missing: missing } : null;
  }).filter(Boolean);
  report("D2b) the nine endpoints with a REQUIRED field and an empty option list still get one",
    contractMiss.length === 0, contractMiss);

  const wrongAspect = bodies.filter(b => b.want.aspectParam &&
    b.want.aspectParam !== "aspectRatio" && ("aspectRatio" in b.body));
  report("D3) the models whose field is `ratio` are not sent `aspectRatio`",
    wrongAspect.length === 0, wrongAspect.slice(0, 4).map(b => b.id));

  const lastBad = bodies.filter(b => b.want.lastParam && b.body[b.want.lastParam] !== "SECOND.jpg");
  report("D4) the nineteen that take a last frame receive the second image there",
    lastBad.length === 0, lastBad.slice(0, 4).map(b => b.id));

  const promptBad = bodies.filter(b => {
    const w = wantById[b.id];
    if (w.kind === "vnode") return w.node.prompt ? typeof b.body[w.node.prompt] !== "string" : false;
    return typeof b.body.prompt !== "string";
  });
  report("D5) every request carries a prompt (vnode graphs under their ##text key)",
    promptBad.length === 0, promptBad.slice(0, 3).map(b => b.id));

  /* ---- E) no control that looks available and does nothing ---- */
  const ui = await page.evaluate(() => {
    const sel = document.getElementById("selVidModel"), bad = [];
    let noRes = 0, noDur = 0;
    RH_VIDEO_MODELS.forEach(m => {
      sel.value = m.id; updateVidModelUI();
      const r = document.getElementById("selVidRes"), d = document.getElementById("selVidDur"),
            a = document.getElementById("selVidAspect");
      if (!(m.resolutions || []).length) noRes++;
      if (!(m.durations || []).length) noDur++;
      const emptyShown = (r.options.length === 0 && r.style.display !== "none") ||
                         (d.options.length === 0 && d.style.display !== "none");
      const offersRejected = m.aspects && m.aspects.length &&
        [...a.options].some(o => m.aspects.indexOf(o.value) < 0);
      const aspectShownWithout = !m.aspect && a.style.display !== "none";
      if (emptyShown || offersRejected || aspectShownWithout)
        bad.push({ id: m.id, emptyShown, offersRejected, aspectShownWithout });
    });
    return { bad, noRes, noDur, groups: [...sel.querySelectorAll("optgroup")].map(g => g.label),
      options: sel.querySelectorAll("option").length };
  });
  report("E) a control with no options is hidden, never rendered empty",
    ui.bad.length === 0, ui.bad.slice(0, 5));
  report("E2) and that is not a hypothetical — 63 models have no resolution, 13 no duration",
    ui.noRes === 63 && ui.noDur === 13, { noRes: ui.noRes, noDur: ui.noDur });

  report("F) 182 options are grouped by family, not one flat scroll",
    ui.groups.length >= 30 && ui.options === 182 &&
    ui.groups.some(g => /^Seedance/.test(g)) && ui.groups.some(g => /^Kling/.test(g)),
    { groups: ui.groups, options: ui.options });

  /* ---- G) the ten makeup workflows are untouched by all of this ---- */
  const wf = await page.evaluate(() => ({
    setup: VID_SETUP_V,
    n: VID_WF.length,
    stillValid: !!rhVideoModelDef(VID_SETUP_V.model)
  }));
  report("G) the video workflow shelf still pins a model that exists",
    wf.n === 29 && wf.setup.model === "gemini-omni-video" && wf.stillValid === true, wf);

  report("H) no page errors", errs.length === 0, errs);

  console.log("      (the full doc-verified catalog: 182 pane models across " +
    ui.groups.length + " family groups — i2v, reference and text-to-video — " +
    "plus the video-input tools shelf; the endpoints this app cannot drive " +
    "are refused by name)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
