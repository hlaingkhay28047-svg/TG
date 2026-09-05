/* v6.5.0 — TALKING PHOTO: one photo, one recording, and the person speaks.
 *
 * WHY THE FEATURE EXISTS AND WHY IT COULD NOT BEFORE. Students have asked for
 * a talking photo for months. The blocker was never the model — RunningHub
 * has published kling-v2-ai-avatar-{standard,pro}/image-audio-to-video all
 * along — it was that no page in this app had an AUDIO slot, so there was
 * nothing to put in the endpoint's required audioUrl. This page is that slot.
 *
 * WHY THE STUDENT BRINGS THE VOICE. There is a text-to-speech endpoint too,
 * and it was deliberately not wired: RunningHub documents exactly three voice
 * ids for it, and Burmese is not among the languages it boosts. A voice picker
 * built on that would be a picker of voices that cannot read our students'
 * own language, and filling it out would mean inventing ids — the one thing
 * this catalog never does. A recording works in every language.
 *
 * WHAT THIS PINS:
 *   A) the page, its slots, and its place in Media Lab
 *   B) the two endpoints are the published ones, and the ONLY ones
 *   C) the request body is exactly the three documented fields
 *   D) neither half can be skipped — and nothing is submitted when one is
 *   E) the price is on screen BEFORE the button, because RunningHub charges
 *      at submit, not on delivery
 *   F) a take survives leaving the app: history, gallery page, restore, and
 *      the recovery branch that knows this run returns a clip, not a picture
 *   G) an over-size recording is refused here rather than at upload
 *
 * Usage: PORT=8931 node test/verify_talking_photo.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "fixtures", "rh-model-registry.public.json"), "utf8"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) failures++;
}

const TINY_GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
/* a 44-byte silent WAV header — enough for an <audio> element to accept it */
const TINY_WAV = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

const EXPECT = [
  "kling-v2-ai-avatar-standard/image-audio-to-video",
  "kling-v2-ai-avatar-pro/image-audio-to-video"
];

(async () => {
  /* ---- B) the endpoints are RunningHub's own, checked against its registry ---- */
  const byEndpoint = new Map(REG.models.map(m => [m.endpoint, m]));
  const shipped = [...APP.matchAll(/RH_TALK_MODELS\s*=\s*\[([\s\S]*?)\n\];/g)]
    .flatMap(m => [...m[1].matchAll(/apiPath:"([^"]+)"/g)].map(x => x[1]));
  report("B) the page ships exactly the two published talking-photo endpoints",
    shipped.length === 2 && EXPECT.every(e => shipped.includes(e)), shipped);
  report("B2) and RunningHub's own registry describes both, with the fields this page fills",
    EXPECT.every(e => {
      const m = byEndpoint.get(e);
      if (!m) return false;
      const req = m.params.filter(p => p.required).map(p => p.fieldKey).sort().join(",");
      return req === "audioUrl,imageUrl" && m.params.some(p => p.fieldKey === "prompt" && !p.required);
    }), EXPECT.map(e => (byEndpoint.get(e) || { params: [] }).params.map(p => p.fieldKey + (p.required ? "!" : ""))));
  /* the endpoint that exists but was deliberately NOT wired, and why */
  report("B3) no invented voice list — the text-to-speech endpoint stays out until its voices are published",
    !/rhart-audio\/text-to-audio/.test(APP) && !/voice_id/.test(APP),
    "the app references a TTS endpoint or a voice id that RunningHub has not enumerated");

  /* ---- F) source-level: the take is kept, restored, and recovered ---- */
  const flat = APP.replace(/\s+/g, " ");
  report("F) a finished take is saved under its own page",
    /galleryAddVideo\([^)]*\{\s*page:\s*"pgTalk"/.test(flat), "no take is filed under pgTalk");
  report("F2) the page reads its own takes back when it opens",
    /if\s*\(\s*id\s*===\s*"pgTalk"\s*\)\s*return\s+resRestoreTalk\(\)/.test(APP) &&
    APP.indexOf("function resRestoreTalk()") >= 0,
    "resRestorePage does not route pgTalk to a restore");
  report("F3) a job recovered after the tab was killed knows this run returns a clip, not a picture",
    /job\.kind\s*===\s*"talk"/.test(APP) && /state\.tkHist\.unshift/.test(APP),
    "rhJobClaim has no talk branch, so a paid job would be filed as a still");
  report("F4) both slots survive leaving the app",
    /tkImg:\s*ti/.test(APP) && /tkAud:\s*ta/.test(APP) && /w\.tkAud\s*&&\s*w\.tkAud\.b64/.test(APP),
    "the work-in-progress record does not carry the photo and the recording");

  /* ---- H) the panel's copy of the catalog IS the app's, byte for byte ---- */
  const built = require("../tools/build_panel_talk_models.js").build();
  const onDisk = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_talk_models.js"), "utf8");
  report("H) the panel's talking-photo catalog is the app's, lifted — not retyped",
    built === onDisk,
    "panel/js/hnk_talk_models.js is not what tools/build_panel_talk_models.js produces — re-run it");
  report("H2) and the panel's request builder is the lifted one, not a second copy",
    /TALK\.body\(def, imageUrl, audioUrl, promptText\)/.test(
      fs.readFileSync(path.join(ROOT, "panel", "src", "providers", "runninghub-video.js"), "utf8")),
    "the panel provider builds its own talking-photo body instead of using the lifted catalog's");

  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    /* NO SUBMIT MAY ESCAPE: a generate that got through would be a real,
       paid RunningHub call. What is watched is therefore the SUBMIT, not
       "any request to runninghub.ai" — saving a key makes the app check the
       account's status (/uc/openapi/accountStatus), which is a read, costs
       nothing, and happens on every page in the product. The first version of
       this check counted that probe as a submit; it passed locally only
       because the probe had not fired inside the window, and went red on CI
       where it had. Anything carrying one of the two talking-photo apiPaths,
       or POSTed to the model base, is a submit and fails. */
    const posted = [];       /* real submits — must stay empty */
    const probed = [];       /* the account-status read, allowed and counted */
    await page.route("**/openapi/**", route => {
      const req = route.request(), url = req.url();
      const isSubmit = EXPECT.some(p => url.includes(p)) ||
        (req.method() === "POST" && /\/openapi\/v2\//.test(url));
      (isSubmit ? posted : probed).push(url);
      route.abort();
    });
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2400);

    const A = await page.evaluate(() => {
      const D = id => document.getElementById(id);
      switchPage("pgTalk");
      const pg = D("pgTalk");
      return {
        visible: !!pg && getComputedStyle(pg).display !== "none",
        hasImgSlot: !!D("tkImgPick") && D("tkImgPick").accept.indexOf("image") >= 0,
        hasAudSlot: !!D("tkAudPick") && D("tkAudPick").accept.indexOf("audio") >= 0,
        inMediaLab: TOPGROUPS.some(g => g.label === "Media Lab" && g.pages.indexOf("pgTalk") >= 0),
        options: [...D("selTkModel").options].map(o => o.value),
        priceBefore: D("tkPriceNote").textContent,
        introFilled: D("tkIntro").textContent.length > 20,
        needFilled: D("tkNeedNote").textContent.length > 10
      };
    });
    report("A) the page is live, in Media Lab, with a photo slot and an audio slot",
      A.visible && A.hasImgSlot && A.hasAudSlot && A.inMediaLab, A);
    report("A2) both tiers are offered, and the page explains itself",
      A.options.join(",") === "talk-std,talk-pro" && A.introFilled && A.needFilled, A);

    /* ---- E) the price is on screen before anything is submitted ---- */
    report("E) the per-second price is shown before the button is ever pressed",
      /0\.36/.test(A.priceBefore) && /Generate|ငွေဖြတ်/.test(A.priceBefore), A.priceBefore);
    const E2 = await page.evaluate(() => {
      const D = id => document.getElementById(id);
      D("selTkModel").value = "talk-pro";
      D("selTkModel").onchange();
      return D("tkPriceNote").textContent;
    });
    report("E2) and it follows the tier the student picks",
      /0\.72/.test(E2) && /Pro/.test(E2), E2);

    /* ---- C) the body is exactly the documented three fields ---- */
    const C = await page.evaluate(() => ({
      withPrompt: rhTalkBody(rhTalkDef("talk-pro"), "IMG", "AUD", "  look at the camera  "),
      withoutPrompt: rhTalkBody(rhTalkDef("talk-std"), "IMG", "AUD", "   "),
      path: rhTalkDef("talk-std").apiPath
    }));
    report("C) the request carries the photo and the recording under the documented field names",
      C.withPrompt.imageUrl === "IMG" && C.withPrompt.audioUrl === "AUD", C.withPrompt);
    report("C2) an optional prompt is trimmed when given and omitted entirely when blank",
      C.withPrompt.prompt === "look at the camera" && !("prompt" in C.withoutPrompt), C);
    report("C3) and nothing else is invented into the body",
      Object.keys(C.withPrompt).sort().join(",") === "audioUrl,imageUrl,prompt" &&
      Object.keys(C.withoutPrompt).sort().join(",") === "audioUrl,imageUrl", C);

    /* ---- D) neither half can be skipped ---- */
    const D1 = await page.evaluate(async () => {
      const D = id => document.getElementById(id);
      /* a key, so the two guards under test are the ones that answer — the
         no-key path leaves the page for Setup and would mask them */
      state.rhKey = "test-key-not-a-real-one";
      state.tkImg = null; state.tkAud = null;
      await D("btnTkGen").onclick.call(D("btnTkGen"));
      return D("stTkGen").textContent;
    });
    const D2 = await page.evaluate(async arg => {
      const D = id => document.getElementById(id);
      state.tkImg = { mime: "image/gif", b64: arg.gif, name: "her.jpg" };
      state.tkAud = null;
      await D("btnTkGen").onclick.call(D("btnTkGen"));
      return D("stTkGen").textContent;
    }, { gif: TINY_GIF });
    report("D) with nothing picked, the page asks for the photo and submits nothing",
      D1.length > 0 && posted.length === 0, { msg: D1, posted });
    report("D2) with only a photo, it asks for the recording and still submits nothing",
      D2.length > 0 && D2 !== D1 && posted.length === 0, { msg: D2, posted });

    /* ---- G) an over-size recording is refused before upload ---- */
    const G = await page.evaluate(() => ({
      cap: TALK_AUDIO_MAX_B64,
      capIsReal: TALK_AUDIO_MAX_B64 > 1024 * 1024 && TALK_AUDIO_MAX_B64 <= 64 * 1024 * 1024,
      guarded: true
    }));
    report("G) a recording too large to upload is capped in the page, not discovered at upload",
      G.capIsReal && /TALK_AUDIO_MAX_B64/.test(APP) &&
      /m\[2\]\.length\s*>\s*TALK_AUDIO_MAX_B64/.test(APP), G);

    /* ---- F5) the history strip really renders, and a take is selectable ---- */
    const F5 = await page.evaluate(arg => {
      const D = id => document.getElementById(id);
      state.tkHist = [
        { url: "https://example.invalid/a.mp4", prompt: "first", ts: 2 },
        { url: "https://example.invalid/b.mp4", prompt: "second", ts: 1 }
      ];
      state.tkHistSel = 0;
      showTkResult(false);
      return {
        boxOn: D("tkResultBox").className.indexOf("on") >= 0,
        /* v6.20.0 — each take sits in a .hitem wrapper with its own ✕, so count the videos, not the children */
        tiles: D("tkHist").querySelectorAll("video").length,
        selected: [...D("tkHist").querySelectorAll("video")].filter(v => v.classList.contains("sel")).length,
        histLabel: D("tkHistH").textContent.length > 0,
        expiryShown: D("tkExpireNote").style.display !== "none"
      };
    }, {});
    report("F5) earlier takes are listed, one is marked, and the 24-hour warning is up for an unsaved take",
      F5.boxOn && F5.tiles === 2 && F5.selected === 1 && F5.histLabel && F5.expiryShown, F5);

    report("Z) no page error while the Talking Photo page was used",
      errs.length === 0, errs.slice(0, 4));
    report("Z2) and not one generate reached RunningHub during this test",
      posted.length === 0, posted);
    report("Z3) the only calls that did go out were reads, not submits",
      probed.every(u => /accountStatus|\/uc\/openapi\//.test(u)),
      probed.filter(u => !/accountStatus|\/uc\/openapi\//.test(u)));
  } finally {
    await browser.close();
  }

  console.log(failures ? "\n" + failures + " check(s) failed"
    : "\nAll checks passed — a photo and a recording, over RunningHub's own published endpoints.");
  process.exit(failures ? 1 : 0);
})();
