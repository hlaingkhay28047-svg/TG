/* v4.87.0 regression sweep — five video workflows read off five real clips.

   WHAT THE OWNER SENT, AND HOW IT WAS READ. Five vertical clips, with the
   instruction "one workflow per video, exactly what is in each one, in detail".
   Playwright's bundled Chromium has no H.264 decoder, so each clip was decoded
   with imageio_ffmpeg's binary and inspected frame by frame — nine evenly
   spaced frames per clip as a contact sheet, plus a denser pass over the two
   with hard transitions. The five are:

     tinyPlanet   a 360 pole-cam little-planet skyline that inverts to a
                  rabbit-hole tunnel of towers
     bottleLook   a flat-green commercial where she stands inside a giant white
                  soda-bottle cut-out and the outfit changes each beat
     phonePortal  a metro carriage, a giant phone tumbling through it, her
                  inside the screen, then a hand pushing back out of the glass
     cnyTiger     red New Year couplets on a table, then a hard cut to a red
                  poster with a tiger's head rising behind her
     specSheet    an off-white lookbook with garment-spec annotations and
                  front/side/back three-ups across four styled Looks

   AND THE CARD ART IS THE FOOTAGE. Each card is three real frames from its own
   clip, tiled into the deck's 960x640. This repo has run two separate audits
   because a card that promises a different shot than its workflow delivers is
   worse than no card; a card cut from the clip itself cannot drift.

   THE DEFECT THIS WORK EXPOSED. VID_KEEP asserted "the dress, the light and
   the setting stay as they are" and was appended to EVERY workflow — including
   Boarding Pass, whose whole job is changing her outfit as she walks through
   the card. A prompt that requests a wardrobe change and forbids one two
   sentences later is resolved by coin flip. It is now split: VID_ID carries
   only what is true of every workflow, VID_HOLD-style freezing stays in
   VID_KEEP for the five workflows that really do hold the scene, and every
   transforming workflow uses VID_ID. All five new ones transform, so all five
   would have inherited the contradiction.

   Pinned contracts:
   A) All five exist, with distinct keys, and the six originals are untouched.
   B) Every prompt fits the model's real promptMax. This is not cosmetic:
      VID_SETUP_V pins gemini-omni-video, rhV2SubmitVideo clips at submit, and
      a prompt cut mid-sentence fails silently with a plausible-looking clip.
      Read through the app's own rhVideoModelDef() against RH_VIDEO_MODELS
      rather than hard-coded — the first cut of this assertion read RH_MODELS,
      the wrong registry, got undefined, and passed while asserting nothing.
   C) The transforming workflows close on VID_ID and NOT on the freeze clause —
      the contradiction above, pinned so it cannot come back.
   D) The five that genuinely hold the scene still keep VID_KEEP.
   E) Each prompt actually describes ITS OWN clip: the distinguishing nouns of
      each are present, and no two prompts are near-duplicates of each other.
   F) Every card image exists at the deck's 960x640 and decodes in the browser.
   G) All eleven cards render in the app, with a label, a summary and art.
   H) No page errors.

   Usage: PORT=8931 node test/sweep_v487_videowf.js  (serve docs/app first) */
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

/* v4.89 — the owner's second batch. He sent nine clips; the first was the
   Boarding Pass concept already shipped, so eight were added and that one was
   reported instead. A duplicate card is worse than no card. */
const NEW = ["tinyPlanet", "bottleLook", "phonePortal", "cnyTiger", "specSheet",
  "makeupSwipe", "trafficType", "bossFight", "getReady", "wonderland",
  "receiptLook", "sparkNight", "stageIdol"];
const OLD = ["boardingPass", "dressSpin", "veilWind", "portraitLive", "pushIn", "couplePose"];
/* The workflows that TRANSFORM the scene, and so must not carry the freeze
   clause. boardingPass belongs here: it changes her outfit. */
const TRANSFORM = NEW.concat(["boardingPass"]);
const HOLD = ["dressSpin", "veilWind", "portraitLive", "pushIn", "couplePose"];

/* Distinguishing nouns, one set per clip, taken from what is actually on
   screen. Stated here rather than derived from the prompt, so this fails if a
   prompt is ever swapped onto the wrong key. */
const SIGNATURE = {
  tinyPlanet: ["360", "planet", "pole", "skyline"],
  bottleLook: ["bottle", "green", "outfit changes"],
  phonePortal: ["metro", "smartphone", "screen"],
  cnyTiger: ["couplet", "tiger", "red"],
  specSheet: ["spec sheet", "Look 1", "front, side and back".split(",")[0]],
  makeupSwipe: ["mirror", "beauty app", "heart"],
  trafficType: ["WALK", "STOP", "traffic signal"],
  bossFight: ["boxing", "health bar", "fog"],
  /* the skincare beat was cut to fit ten seconds; the cushion sponge,
     the lip tint and the brush are what remain */
  getReady: ["07:10", "wardrobe", "cushion"],
  wonderland: ["lolita", "chequerboard", "playing cards"],
  receiptLook: ["receipt", "CLOSED", "OPEN"],
  sparkNight: ["sparkler", "bokeh", "night"],
  stageIdol: ["filter", "stage", "microphone"]
};

/* ---- A ---- */
const block = src.slice(src.indexOf("var VID_WF=["), src.indexOf("function vidWfByKey"));
const keys = (block.match(/key:"([a-zA-Z]+)"/g) || []).map(k => k.slice(5, -1));
report("A) all thirteen new video workflows exist and the six originals are intact",
  NEW.every(k => keys.indexOf(k) >= 0) && OLD.every(k => keys.indexOf(k) >= 0) &&
  keys.length === 19 && new Set(keys).size === 19,
  { keys: keys });

/* ---- C + D) the split, in the source ---- */
report("C) VID_ID exists and carries no setting-freeze claim",
  /var VID_ID = /.test(src) &&
  !/var VID_ID = [^;]*setting stay as they are/.test(src),
  { hasId: /var VID_ID = /.test(src) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() >= 400) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const wf = await page.evaluate(() => {
    const sample = { en: "bangkok", loc: "THAILAND", fit: "a linen set" };
    return {
      /* the VIDEO registry, and via the app's own lookup — reading the wrong
         list is how a ceiling assertion silently stops asserting anything */
      cap: (typeof rhVideoModelDef === "function" &&
            (rhVideoModelDef(VID_SETUP_V.model) || {}).promptMax) || null,
      model: VID_SETUP_V.model,
      rows: VID_WF.map(w => {
        const t = w.cities ? w.text(sample) : w.text();
        return { key: w.key, len: t.length, text: t, art: w.art,
          label: typeof w.label === "string" ? w.label : "",
          summary: typeof w.summary === "string" ? w.summary : "" };
      })
    };
  });
  const byKey = {};
  wf.rows.forEach(r => { byKey[r.key] = r; });

  /* ---- B) the real ceiling, read from the registry ---- */
  const over = wf.rows.filter(r => wf.cap && r.len > wf.cap);
  report("B) every prompt fits the pinned model's promptMax",
    wf.cap > 0 && over.length === 0,
    { model: wf.model, cap: wf.cap, longest: Math.max.apply(null, wf.rows.map(r => r.len)),
      over: over.map(r => ({ k: r.key, len: r.len })) });

  /* ---- C2 + D) which clause each one actually closes on ---- */
  const FREEZE = "the dress, the light and the setting stay as they are";
  const froze = TRANSFORM.filter(k => byKey[k] && byKey[k].text.indexOf(FREEZE) >= 0);
  report("C2) no scene-transforming workflow carries the setting-freeze clause",
    froze.length === 0, { offenders: froze });

  const lostHold = HOLD.filter(k => byKey[k] && byKey[k].text.indexOf(FREEZE) < 0);
  report("D) the five hold-still workflows still carry it",
    lostHold.length === 0, { missing: lostHold });

  const noId = TRANSFORM.filter(k => byKey[k] &&
    byKey[k].text.indexOf("identity stay exactly as the reference photograph") < 0);
  report("D2) every transforming workflow still locks identity",
    noId.length === 0, { missing: noId });

  /* ---- T) THE TEN-SECOND BUDGET ----
     VID_SETUP_V pins dur:"10" and gemini-omni-video's durations enum tops out
     there, so ten seconds is a hard ceiling, not a default. The source clips
     the owner sent run 8.0s to 32.5s, and the first cut of these prompts
     described more action than ten seconds can hold — bossFight was 3.2x over,
     with a wake-up, a glove-up, a monster fight, a costume change and an end
     card. A model given more beats than fit does not choose the good ones; it
     rushes all of them. Every prompt now opens with an explicit beat sheet in
     seconds, which is also the part that survives truncation.

     Asserted structurally rather than by counting words: the prompt must name
     the ten-second budget, and every second it mentions must fall inside it. */
  const overrun = [];
  const noBudget = [];
  /* v4.90.1 — ALL NINETEEN, not just the new ones. The owner asked whether
     every prompt fits ten seconds; measured, it was 13 of 19, because the six
     that shipped before this batch never stated the budget. Asserting it of
     NEW only would have kept answering the wrong question. */
  const EVERY = NEW.concat(OLD);
  EVERY.forEach(k => {
    const t = byKey[k].text;
    if (!/\bTen seconds\b/i.test(t)) noBudget.push(k);
    const secs = (t.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\)/g) || [])
      .map(m => m.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\)/).slice(1).map(Number));
    const at = (t.match(/at (\d+(?:\.\d+)?)s\b/g) || []).map(m => +m.match(/(\d+(?:\.\d+)?)/)[1]);
    /* A prompt fills its ten seconds in one of two legitimate ways: a numbered
       beat sheet, or one sustained action stated as spanning the whole clip.
       dressSpin is a single 360 turn, veilWind is a veil moving, portraitLive
       is a blink and a breath — beats would be an invention. Requiring beats of
       those would be testing a house style, not the contract. */
    const bad = secs.filter(p => p[1] > 10 || p[0] >= p[1]).concat(at.filter(x => x > 10).map(x => [x, x]));
    if (bad.length) overrun.push({ k: k, secs: secs, at: at });
  });
  report("T) all nineteen prompts state the ten-second budget",
    noBudget.length === 0, { missing: noBudget });
  report("T2) every beat it names lands inside those ten seconds",
    overrun.length === 0, overrun);

  const SPANS = /across (the full |those )?ten seconds|for the whole ten seconds|for the whole duration|across the whole clip/i;
  const last = EVERY.map(k => {
    const t = byKey[k].text;
    const secs = (t.match(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\)/g) || [])
      .map(m => +m.match(/-(\d+(?:\.\d+)?)s\)/)[1]);
    const end = secs.length ? Math.max.apply(null, secs) : 0;
    const ok = secs.length ? (end >= 9 && end <= 10) : SPANS.test(t);
    return { k: k, end: end, beats: secs.length, ok: ok };
  }).filter(x => !x.ok);
  report("T3) each one fills its ten seconds — a beat sheet reaching 10s, or one action stated as spanning the clip",
    last.length === 0, last);

  /* ---- E) each prompt describes its own clip, and they are not clones ---- */
  const sigMiss = NEW.map(k => ({
    k: k,
    missing: SIGNATURE[k].filter(w => byKey[k].text.toLowerCase().indexOf(w.toLowerCase()) < 0)
  })).filter(x => x.missing.length);
  report("E) each new prompt names the things actually in its own clip",
    sigMiss.length === 0, sigMiss);

  function words(t) {
    return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3));
  }
  const pairs = [];
  for (let i = 0; i < NEW.length; i++)
    for (let j = i + 1; j < NEW.length; j++) {
      const A = words(byKey[NEW[i]].text), B = words(byKey[NEW[j]].text);
      let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
      pairs.push({ a: NEW[i], b: NEW[j], j: +(inter / (A.size + B.size - inter)).toFixed(2) });
    }
  report("E2) every pair is a different film, not one prompt renamed",
    pairs.every(p => p.j < 0.45), pairs.filter(p => p.j >= 0.40));

  /* ---- F) the card art, on disk and decoded ---- */
  const onDisk = NEW.map(k => {
    const p = path.join(APP, "lib", "vid", "vw-" + k + ".jpg");
    return { k: k, exists: fs.existsSync(p), bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  });
  report("F) every new card image exists on disk",
    onDisk.every(x => x.exists && x.bytes > 20000), onDisk);

  const decoded = await page.evaluate(async (keys) => {
    const out = [];
    for (const k of keys) {
      const r = await new Promise(res => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => res({ w: 0, h: 0 });
        im.src = "lib/vid/vw-" + k + ".jpg";
      });
      out.push({ k: k, ...r });
    }
    return out;
  }, NEW);
  report("F2) every new card image decodes at the deck's 960x640",
    decoded.every(x => x.w === 960 && x.h === 640), decoded);

  /* ---- G) what the Video page actually renders ---- */
  await page.evaluate(() => switchPage("pgVideo"));
  await page.waitForTimeout(1200);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("#vidWfRow .wfmini")].map(c => ({
      t: (c.querySelector(".t") || {}).textContent || "",
      s: (c.querySelector(".s") || {}).textContent || "",
      img: (c.querySelector("img") || {}).getAttribute ? c.querySelector("img").getAttribute("src") : null
    })));
  report("G) all nineteen video cards render with a label, a summary and art",
    cards.length === 19 &&
    cards.every(c => c.t.length > 2 && c.s.length > 5 && c.img && /^lib\/vid\//.test(c.img)),
    { n: cards.length, bad: cards.filter(c => !(c.t && c.s && c.img)).length });

  await page.waitForTimeout(1200);
  report("G2) nothing 404s while the video shelf renders",
    bad.length === 0, bad.slice(0, 6));

  report("H) no page errors", errs.length === 0, errs);

  console.log("      (thirteen clips decoded with imageio_ffmpeg — Chromium here has no H.264 — " +
    "and each card is three real frames of its own film)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
