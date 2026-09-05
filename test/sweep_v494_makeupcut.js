/* v4.94.0 regression sweep — ten makeup-look video workflows, cut fast.

   WHAT THE OWNER SENT. Ten vertical mp4s of makeup looks, with the brief:
   workflows that take a photo and make a video like these — fast, sharp, cut
   like an edit, professional, "and write the prompts so it all fits inside ten
   seconds, in detail". Playwright's Chromium has no H.264 decoder, so every
   clip was decoded with imageio_ffmpeg and the LOOK in each identified before
   a word of prompt was written: glass skin under a chandelier, crystal tear
   gems, an oxblood Douyin lip, bronze-and-gloss, cold porcelain, Thai soft
   pink bridal, doll blush, a sculpt-and-gradient technique reel, a glitter eye
   macro, and a black-slip noir. The source clips run 11.8s to 47.6s — every
   one of them longer than the budget — so each prompt is a CUT LIST that
   spends the ten seconds it actually has.

   THE DEFECT THIS WORK WOULD HAVE INHERITED. v4.87 split the shared prompt
   tail in two after finding that VID_KEEP's freeze clause contradicted the
   workflows that transform the scene. The same trap is here one level deeper:
   VID_KEEP says "no cuts" and VID_ID says "One continuous take", and BOTH are
   flat contradictions of a six-shot cut list. Appending either would have put
   the request in the body and its refusal in the tail — resolved by coin flip.
   Hence VID_CUT, asserted below, which keeps the identity lock and inverts the
   continuity clause.

   THE ASSERTION THAT IS NEW HERE. v4.87's T2 checks that no beat runs past
   ten seconds, and T3 that the last one reaches ten. Neither notices a HOLE.
   A cut list reading 0-2s, 2-4s, 6-8s, 8-10s passes both while leaving two
   dead seconds the model must invent something for, and a list reading 0-3s,
   2-5s, 5-8s, 8-10s passes both while asking for eleven seconds of action.
   D) below requires the shots to tile the clip exactly: start at 0, end at 10,
   and each one begin precisely where the last ended.

   THE CARD ART, IN TWO STAGES. v4.94 shipped these ten cards cut from the
   owner's own clips — two real frames each. Those were honest but they were
   phone footage of ten DIFFERENT women, which broke the one thing every other
   card in this deck does: show the studio's own reference model. v4.95
   replaces all ten with generated three-panel art built to that model, one
   panel per stage of the sequence the prompt asks for — bare, applying,
   finished. H4 pins the triptych structure, because a card that came back as
   a single frame would silently stop advertising that this is a CUT workflow.

   AND THE PURGE MARKER FLIPPED SIDES BETWEEN THOSE TWO RELEASES. See H3.

   Usage: PORT=8931 node test/sweep_v494_makeupcut.js  (serve docs/app first) */
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

const MK = ["mkGlassSkin", "mkGemTear", "mkDouyinRed", "mkGlossPop", "mkPorcelain",
  "mkPinkBridal", "mkDollBlush", "mkSculptBrush", "mkEyeMacro", "mkNoirSlip"];

/* The distinguishing nouns of each clip, written down here from what is on
   screen rather than read back out of the prompt — so this fails if a prompt
   is ever swapped onto the wrong key, which is exactly the drift the two card
   audits in this repo exist to catch. */
const SIGNATURE = {
  mkGlassSkin:   ["chandelier", "sequin", "glitter", "ponytail"],
  mkGemTear:     ["rhinestone", "crystals", "knot", "silver"],
  mkDouyinRed:   ["oxblood", "jade", "rose", "fringe"],
  mkGlossPop:    ["bronzer", "gloss", "pearl-cluster", "cheekbone"],
  mkPorcelain:   ["porcelain", "grey-green", "shadow", "pearl"],
  mkPinkBridal:  ["blush palette", "lace corset", "champagne", "drape"],
  mkDollBlush:   ["doll", "pearl chain", "ribbon", "nose"],
  mkSculptBrush: ["angled brush", "cheekbone", "coral", "bun"],
  mkEyeMacro:    ["macro", "plum", "glitter", "waterline"],
  mkNoirSlip:    ["plaster", "necklace", "square-neck", "liner"]
};

/* ---- A) registered ---- */
const block = src.slice(src.indexOf("var VID_WF=["), src.indexOf("function vidWfByKey"));
const keys = (block.match(/key:"([a-zA-Z0-9]+)"/g) || []).map(k => k.slice(5, -1));
report("A) all ten makeup workflows are registered and the shelf holds thirty-three (twenty-nine here, four reference-video cards since v6.15.0)",
  MK.every(k => keys.indexOf(k) >= 0) && keys.length === 33 && new Set(keys).size === 33,
  { n: keys.length, missing: MK.filter(k => keys.indexOf(k) < 0) });

/* ---- B) the third tail exists, and is not one of the two that forbid cuts ---- */
report("B) VID_CUT exists, locks identity, and does NOT forbid cutting",
  /var VID_CUT = /.test(src) &&
  /var VID_CUT = [^;]*identity stay exactly as the reference photograph/.test(src) &&
  !/var VID_CUT = [^;]*no cuts/.test(src) &&
  !/var VID_CUT = [^;]*One continuous take/.test(src));

report("B2) VID_CUT names the one change a beauty edit must not make",
  /var VID_CUT = [^;]*makeup is the only thing that changes on her/.test(src));

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
    localStorage.setItem("hnk_ws_lang", "my");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const got = await page.evaluate((MK) => {
    const by = {}; VID_WF.forEach(w => { by[w.key] = w; });
    return {
      cap: (typeof rhVideoModelDef === "function" &&
            (rhVideoModelDef(VID_SETUP_V.model) || {}).promptMax) || null,
      dur: VID_SETUP_V.dur,
      rows: MK.map(k => ({ k: k, text: by[k].text(), art: by[k].art,
        label: by[k].label, summary: by[k].summary, hint: by[k].hint }))
    };
  }, MK);
  const byKey = {}; got.rows.forEach(r => { byKey[r.k] = r; });

  /* ---- C) they are cut lists, not descriptions ---- */
  const shots = MK.map(k => ({
    k: k, n: (byKey[k].text.match(/SHOT \d+ \(/g) || []).length
  }));
  report("C) every one is a real cut list — four shots minimum, not one long take",
    shots.every(s => s.n >= 4), shots.filter(s => s.n < 4));

  report("C2) every one closes on VID_CUT and neither of the tails that forbid cutting",
    MK.every(k => byKey[k].text.indexOf("Cut hard on the beat") >= 0 &&
      byKey[k].text.indexOf("no cuts") < 0 &&
      byKey[k].text.indexOf("One continuous take") < 0),
    MK.filter(k => byKey[k].text.indexOf("Cut hard on the beat") < 0));

  /* ---- D) THE SHOTS TILE THE TEN SECONDS EXACTLY ----
     Not just "inside ten seconds" (v4.87 T2) and not just "reaches ten"
     (T3): no gap, no overlap, no dead air. */
  const tiling = MK.map(k => {
    const b = [...byKey[k].text.matchAll(/\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\)/g)]
      .map(m => [+m[1], +m[2]]);
    const holes = [];
    for (let i = 1; i < b.length; i++)
      if (b[i][0] !== b[i - 1][1]) holes.push({ after: b[i - 1][1], next: b[i][0] });
    const shrink = b.filter(p => p[1] <= p[0]);
    return { k: k, start: b.length ? b[0][0] : null, end: b.length ? b[b.length - 1][1] : null,
      holes: holes, shrink: shrink };
  });
  report("D) the shots tile the clip exactly — start at 0, end at 10, no gap and no overlap",
    tiling.every(t => t.start === 0 && t.end === 10 && !t.holes.length && !t.shrink.length),
    tiling.filter(t => !(t.start === 0 && t.end === 10 && !t.holes.length && !t.shrink.length)));

  report("D2) the ten-second budget is the model's real ceiling, not a house preference",
    got.dur === "10", { dur: got.dur });

  /* ---- E) the ceiling that truncation makes real ---- */
  const lens = MK.map(k => ({ k: k, len: byKey[k].text.length }));
  const over = lens.filter(x => got.cap && x.len > got.cap);
  report("E) every prompt fits the pinned model's promptMax with the cut list intact",
    got.cap > 0 && over.length === 0,
    { cap: got.cap, longest: Math.max.apply(null, lens.map(x => x.len)), over: over });

  /* ---- F) each prompt describes its own clip, and they are ten films ---- */
  const sigMiss = MK.map(k => ({
    k: k, missing: SIGNATURE[k].filter(w => byKey[k].text.toLowerCase().indexOf(w.toLowerCase()) < 0)
  })).filter(x => x.missing.length);
  report("F) each prompt names the things actually in its own clip",
    sigMiss.length === 0, sigMiss);

  function words(t) {
    return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3));
  }
  const pairs = [];
  for (let i = 0; i < MK.length; i++)
    for (let j = i + 1; j < MK.length; j++) {
      const A = words(byKey[MK[i]].text), B = words(byKey[MK[j]].text);
      let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
      pairs.push({ a: MK[i], b: MK[j], j: +(inter / (A.size + B.size - inter)).toFixed(3) });
    }
  report("F2) no two of the ten are one prompt with the colours swapped",
    pairs.every(p => p.j < 0.45),
    pairs.sort((x, y) => y.j - x.j).slice(0, 3));

  /* ---- G) translated like every other card ---- */
  const MM = /[က-႟]/;
  const bare = MK.filter(k => !MM.test(byKey[k].label) || !MM.test(byKey[k].summary) ||
    !MM.test(byKey[k].hint));
  report("G) label, summary and hint all resolve to Burmese in a Burmese UI",
    bare.length === 0, bare);

  const langs = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
  /* The whole entry, not the part before text:function — hint is declared
     after it, and slicing there silently dropped a third of the strings this
     is meant to count. */
  const i18nMiss = MK.map(k => {
    const from = src.indexOf('key:"' + k + '"');
    const rest = src.slice(from + 6);
    const nextKey = rest.indexOf('key:"');
    const entry = nextKey < 0 ? rest : rest.slice(0, nextKey);
    return { k: k, missing: langs.filter(l =>
      (entry.match(new RegExp("[,{]" + l + ':"', "g")) || []).length < 3) };
  }).filter(x => x.missing.length);
  report("G2) all three strings exist in all nine languages",
    i18nMiss.length === 0, i18nMiss);

  /* ---- H) the card art ---- */
  const onDisk = MK.map(k => {
    const p = path.join(APP, "lib", "vid", "vw-" + k + ".jpg");
    return { k: k, exists: fs.existsSync(p), bytes: fs.existsSync(p) ? fs.statSync(p).size : 0 };
  });
  report("H) every card image exists on disk",
    onDisk.every(x => x.exists && x.bytes > 20000), onDisk.filter(x => !x.exists || x.bytes <= 20000));

  const decoded = await page.evaluate(async (keys) => {
    const out = [];
    for (const k of keys) {
      const r = await new Promise(res => {
        const im = new Image();
        im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => res({ w: 0, h: 0 });
        im.src = "lib/vid/vw-" + k + ".jpg";
      });
      out.push({ k: k, w: r.w, h: r.h });
    }
    return out;
  }, MK);
  report("H2) every card image decodes at the deck's 960x640",
    decoded.every(x => x.w === 960 && x.h === 640), decoded.filter(x => x.w !== 960));

  /* THE MARKER THIS RELEASE ADDS, AND WHY v4.94 WAS RIGHT NOT TO.

     One release ago these ten filenames had never shipped, so v4.94 added no
     purge marker — a brand-new name inside one charges every user a re-fetch
     for a file they never had, the class sweep_v469 holds closed. That
     reasoning expired the moment v4.94 reached Pages. The names are live now,
     /lib/ is cache-first and never revalidated, and so replacing the art under
     the same names is invisible for ever without an entry. The marker is
     therefore REQUIRED here for exactly the reason it was forbidden before.

     AND AN EARLIER CUT OF THIS ASSERTION WAS WRONG IN A WAY WORTH KEEPING.
     It asked whether any marker's regex MATCHES the new paths, and failed on
     all ten — because v4.83 shipped a whole-folder marker, /lib\/vid\//, when
     the video shelf's first six cards were replaced. But purgeReplacedLibArt()
     checks `c.match(p.tag)` and returns early if the tag is present, so a
     marker fires exactly once per device, ever. The v4.83 tag was set on every
     device the moment it ran v4.83 and can never fire again. Matching an old
     marker is not coverage; a NEW tag is. */
  const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");
  const vm = require("vm");
  const box = {}; vm.createContext(box);
  vm.runInContext(sw.match(/var LIB_PURGES = \[[\s\S]*?\n\];/)[0] +
    "; globalThis.__P=LIB_PURGES;", box);
  const fresh = box.__P.filter(p => /v4-95/.test(p.tag));
  report("H3) the replaced names are covered by a marker minted THIS release, not an old one",
    fresh.length === 1 &&
    MK.every(k => fresh[0].re.test("/lib/vid/vw-" + k + ".jpg")),
    { tags: box.__P.map(p => p.tag).slice(-2),
      uncovered: fresh.length ? MK.filter(k => !fresh[0].re.test("/lib/vid/vw-" + k + ".jpg")) : MK });

  /* The other twenty-three cards in /lib/vid/ (nineteen then, four more since
     v6.15.0) are untouched by this wave. Purging
     them would re-download ~2MB on every device to deliver nothing. */
  const OTHER_VID = fs.readdirSync(path.join(APP, "lib", "vid"))
    .filter(f => /^vw-.*\.jpg$/.test(f) && MK.indexOf(f.slice(3, -4)) < 0);
  report("H3b) it covers exactly these ten and none of the other video cards",
    OTHER_VID.length === 23 &&
    OTHER_VID.every(f => !fresh[0].re.test("/lib/vid/" + f)),
    { others: OTHER_VID.length,
      swept: OTHER_VID.filter(f => fresh.length && fresh[0].re.test("/lib/vid/" + f)) });

  report("H3c) a marker still fires once per device, which is what makes a fresh tag necessary",
    /if \(done\) return;/.test(sw));

  /* ---- H4) THE ART IS ACTUALLY A THREE-PANEL FILMSTRIP ----
     These cards advertise a CUT workflow. A single-frame card would still be
     960x640, still decode, still pass every other assertion here — and would
     quietly stop saying "this output is edited". Measured rather than trusted:
     a divider is a column with almost no vertical variance, and one must exist
     near each third. The floor is set from the data — the quietest column
     INSIDE a panel measures 34.6 across the ten, the noisiest divider 11.1. */
  const strip = await page.evaluate(async (keys) => {
    const out = [];
    const cv = document.createElement("canvas");
    cv.width = 960; cv.height = 640;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    for (const k of keys) {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.onerror = r; im.src = "lib/vid/vw-" + k + ".jpg"; });
      cx.drawImage(im, 0, 0, 960, 640);
      const d = cx.getImageData(0, 0, 960, 640).data;
      const colStd = (x) => {
        let s = 0, s2 = 0;
        for (let y = 0; y < 640; y++) {
          const i = (y * 960 + x) * 4;
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          s += l; s2 += l * l;
        }
        return Math.sqrt(Math.max(0, s2 / 640 - (s / 640) * (s / 640)));
      };
      const near = (c) => {
        let best = Infinity;
        for (let x = c - 14; x <= c + 14; x++) best = Math.min(best, colStd(x));
        return +best.toFixed(1);
      };
      out.push({ k: k, d1: near(320), d2: near(640) });
    }
    return out;
  }, MK);
  const notStrip = strip.filter(r => r.d1 > 20 || r.d2 > 20);
  report("H4) every card is a three-panel filmstrip, not one frame",
    notStrip.length === 0, notStrip.length ? notStrip : strip.slice(0, 2));

  /* ---- I) it renders ---- */
  await page.evaluate(() => switchPage("pgVideo"));
  await page.waitForTimeout(1400);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll("#vidWfRow .wfmini")].map(c => ({
      t: (c.querySelector(".t") || {}).textContent || "",
      s: (c.querySelector(".s") || {}).textContent || "",
      img: c.querySelector("img") ? c.querySelector("img").getAttribute("src") : null
    })));
  report("I) all thirty-three video cards render with a label, a summary and art",
    cards.length === 33 &&
    cards.every(c => c.t.length > 2 && c.s.length > 5 && c.img && /^lib\/vid\//.test(c.img)),
    { n: cards.length, bad: cards.filter(c => !(c.t && c.s && c.img)).length });

  /* Selecting a card writes the prompt into the box the user submits from —
     if the textarea's own maxlength clipped it, the cut list would lose its
     last shots before it ever reached the ceiling asserted in E. */
  const applied = await page.evaluate(() => {
    vidWfApply(vidWfByKey("mkGlassSkin"));
    const el = document.getElementById("vidPrompt");
    return { len: el.value.length, ends: el.value.slice(-40), model: document.getElementById("selVidModel").value };
  });
  report("I2) picking a card loads the whole prompt into the box, uncut",
    applied.len === byKey.mkGlassSkin.text.length &&
    applied.ends === byKey.mkGlassSkin.text.slice(-40),
    { boxed: applied.len, prompt: byKey.mkGlassSkin.text.length });

  await page.waitForTimeout(900);
  report("I3) nothing 404s while the video shelf renders", bad.length === 0, bad.slice(0, 6));
  report("I4) no page errors", errs.length === 0, errs);

  console.log("      (ten clips decoded with imageio_ffmpeg — Chromium here has no H.264 — " +
    "and all ten cards now carry generated three-panel art built to the studio's own model)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
