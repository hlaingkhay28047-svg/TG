/* v4.98.0 regression sweep — the video shelf goes from two models to sixty-five.

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
/* Deliberately absent — see the header. */
const REFUSED = ["rhart-video-flux3/image-to-video",
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

  report("A) the shelf is sixty-five models, with unique ids and unique endpoints",
    reg.n === 65 && new Set(reg.ids).size === 65 && new Set(reg.paths).size === 65,
    { n: reg.n, ids: new Set(reg.ids).size, paths: new Set(reg.paths).size });

  report("A2) the two that shipped before are still there, under the same ids",
    LEGACY.every(id => reg.ids.indexOf(id) >= 0), reg.ids.slice(0, 4));

  report("B) Seedance is registered — six variants, which is what the owner asked about",
    reg.seedance.length === 6 &&
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
        await rhV2SubmitVideo("K", m.apiPath, ["FIRST.jpg", "SECOND.jpg"], "p",
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

  const missingImage = bodies.filter(b => !b.ok || !(b.want.imageParam in b.body));
  report("D) every model puts the photo in the field ITS endpoint declares",
    missingImage.length === 0, missingImage.slice(0, 4).map(b => ({ id: b.id, want: b.want.imageParam, got: Object.keys(b.body || {}) })));

  const missingExtra = bodies.filter(b => b.want.extra &&
    Object.keys(b.want.extra).some(k => !(k in b.body)));
  report("D2) every REQUIRED parameter reaches the endpoint — thirty models declare one",
    missingExtra.length === 0,
    missingExtra.slice(0, 4).map(b => ({ id: b.id, missing: Object.keys(b.want.extra).filter(k => !(k in b.body)) })));

  const wrongAspect = bodies.filter(b => b.want.aspectParam &&
    b.want.aspectParam !== "aspectRatio" && ("aspectRatio" in b.body));
  report("D3) the models whose field is `ratio` are not sent `aspectRatio`",
    wrongAspect.length === 0, wrongAspect.slice(0, 4).map(b => b.id));

  const lastBad = bodies.filter(b => b.want.lastParam && b.body[b.want.lastParam] !== "SECOND.jpg");
  report("D4) the nineteen that take a last frame receive the second image there",
    lastBad.length === 0, lastBad.slice(0, 4).map(b => b.id));

  const promptBad = bodies.filter(b => typeof b.body.prompt !== "string");
  report("D5) every request carries a prompt", promptBad.length === 0, promptBad.slice(0, 3).map(b => b.id));

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
  report("E2) and that is not a hypothetical — 27 models have no resolution, 15 no duration",
    ui.noRes === 27 && ui.noDur === 15, { noRes: ui.noRes, noDur: ui.noDur });

  report("F) sixty-five options are grouped by family, not one flat scroll",
    ui.groups.length >= 12 && ui.options === 65 &&
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

  console.log("      (65 of RunningHub's 67 image-to-video endpoints, across " +
    ui.groups.length + " families; the 2 that need a base video or a keyframe " +
    "structure are refused by name)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
