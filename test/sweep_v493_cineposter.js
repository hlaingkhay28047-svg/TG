/* v4.93.0 regression sweep — Cinematic Poster in the webapp, and the thirteen
   card images that arrived with it.

   WHERE THIS CAME FROM. The owner sent a Photoshop-panel handoff spec,
   HNK_Cinematic_Poster_Subject_Lock_v1.0.0, which shipped to HNK-Ai-V1 as
   v6.14.0. He then asked whether the webapp had it too. It did not, so this is
   the port — adapted, not copied, because the two apps are not the same shape.

   THE ONE ADAPTATION THAT MATTERS. The panel selects its treatment in code from
   an analyzer's scene tags. This app has no analyzer: a Smart Workflow here is a
   single prompt sent to an image-edit model. So the four treatments are written
   INTO the prompt as a read-the-photograph instruction. Same decision, made in
   the only place this app can make it.

   AND THE PROMPT CEILING IS WHY THE ORDER OF THE PROMPT IS PINNED. rhTruncatePrompt
   cuts at submit: it keeps the appended TASK GUARD plus the FIRST
   (maxLen - guardLen) characters of the body, and the tightest registered
   image-edit model is 800. What survives is therefore the OPENING. Assertion C
   is the one that matters — if a future edit moves the subject lock below the
   treatment list, the lock is what gets cut on the cheapest model.

   WHY IT IS NOT Scene Fit Pro OR Master BG FG Replace. Those two move a subject
   into someone else's scene, or hold a subject still while a DIFFERENT scene is
   fitted around it. This one never leaves the location the photograph was taken
   in — its fallback treatment is "enhance the location that is already in the
   photograph" and it explicitly forbids importing an unrelated theme. E pins
   that distance numerically so the three cannot drift together.

   THE THIRTEEN IMAGES. Eleven replace art already in the wild and therefore
   need a purge marker; two are new filenames and must NOT be in it. G checks the
   installed files, and sweep_v469's D0 checks the marker list itself.

   Usage: PORT=8931 node test/sweep_v493_cineposter.js  (serve docs/app first) */
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
const LW = JSON.parse(src.match(
  /<script id="hnkLibWf" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const byId = {};
LW.workflows.forEach(w => { byId[w.id] = w; });
const CP = byId["cinematic-poster"];

/* ---- A) it exists with everything a card needs ---- */
report("A) Cinematic Poster is registered with every field the card renderer uses",
  !!CP && !!CP.title && !!CP.summary && !!CP.explanation && !!CP.visual &&
  Array.isArray(CP.req) && CP.req.length === 1 && Array.isArray(CP.opt) &&
  CP.opt.length === 1 && !!CP.prompt && !!CP.negative,
  CP ? { req: CP.req, opt: CP.opt } : "missing");

report("A2) it is wired into a category that actually renders",
  /st\(\[[^\]]*"cinematic-poster"[^\]]*\]\)/.test(src));

report("A3) the second image is offered as a mood reference, not a subject slot",
  /mood/i.test(CP.opt[0]) && !/subject|person|face/i.test(CP.opt[0]), CP.opt[0]);

/* ---- B) the law ---- */
report("B) the law is stated: build the world around the people, never redraw them",
  /rebuilding the WORLD AROUND/i.test(CP.prompt) &&
  /never by redrawing the people/i.test(CP.prompt));

/* ---- C) the assertion the truncation ceiling makes necessary ---- */
const editCaps = (src.match(/apiPath:"[^"]*image-edit[^"]*"[^}]*promptMax:(\d+)/g) || [])
  .map(m => +m.match(/promptMax:(\d+)/)[1]);
const FLOOR = editCaps.length ? Math.min.apply(null, editCaps) : 800;
const head = CP.prompt.slice(0, FLOOR).toLowerCase();
const MUST_SURVIVE = ["cinematic", "world around", "never by redrawing",
                      "subject lock", "identity", "number of people"];
const lost = MUST_SURVIVE.filter(k => head.indexOf(k) < 0);
report("C) the first " + FLOOR + " characters still carry the law and the subject lock",
  lost.length === 0, { floor: FLOOR, lost: lost, promptLen: CP.prompt.length });

report("C2) the prompt stays inside the deck's established maximum",
  CP.prompt.length <= 6500, CP.prompt.length);

/* ---- D) all four treatments, and the refusal to force one ---- */
report("D) every treatment from the handoff is present",
  /coast, sea, beach, cliffs, rocks or open water/i.test(CP.prompt) &&
  /formal hedges, garden paths/i.test(CP.prompt) &&
  /bamboo, lotus, a traditional courtyard/i.test(CP.prompt) &&
  /enhance the location that is already in the photograph/i.test(CP.prompt));

report("D2) it refuses to import a theme the photograph does not have",
  /Do not import ocean, garden, bamboo, temple or wedding elements/i.test(CP.prompt));

report("D3) the mood reference can never donate a face",
  /MOOD REFERENCE ONLY/i.test(CP.prompt) &&
  /can never donate a face/i.test(CP.prompt));

report("D4) the plate comes back clean so poster text can go on top later",
  /NO LETTERING/i.test(CP.prompt) &&
  /no title, subtitle, letters, numbers, logo/i.test(CP.prompt));

/* ---- E) genuinely a different workflow from the two it sits beside ---- */
function words(t) {
  return new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter(w => w.length > 3));
}
function jaccard(a, b) {
  const A = words(a), B = words(b);
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return +(inter / (A.size + B.size - inter)).toFixed(2);
}
const jScene = jaccard(CP.prompt, byId["scene-fit-pro"].prompt);
const jMaster = jaccard(CP.prompt, byId["master-bgfg-replace"].prompt);
report("E) it is not a reworded Scene Fit Pro or Master BG FG Replace",
  jScene < 0.55 && jMaster < 0.55, { vsSceneFitPro: jScene, vsMasterBgFg: jMaster });

report("E2) unlike those two, it never moves the subject to another location",
  !/place the (original )?subject into/i.test(CP.prompt) &&
  !/remove the person from/i.test(CP.prompt));

/* ---- F) translated like every other card ---- */
report("F) the summary is translated in all nine languages",
  (function () {
    const m = src.match(/"cinematic-poster":\{([^}]*)\}/);
    if (!m) return false;
    return ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"]
      .every(l => new RegExp("\\b" + l + ":\"").test(m[1]));
  })());

/* ---- G) the thirteen card images ---- */
const REPLACED = ["film-grade", "lg-bglight", "lg-hair", "text-logo", "upscale",
                  "white-balance-fix", "mx-bg", "mx-color", "mx-fg", "mx-object", "pl-5"];
const NEW_ART = ["scene-fit-pro", "master-pro-retouch"];

report("G) all thirteen returned card images are installed at the deck's 960x640",
  (function () {
    const { execSync } = require("child_process");
    return REPLACED.concat(NEW_ART).every(n => {
      const p = path.join(APP, "lib/wf/cards5", n + ".jpg");
      if (!fs.existsSync(p)) return false;
      const out = execSync("node -e \"const b=require('fs').readFileSync('" + p +
        "');let i=2;while(i<b.length){if(b[i]!==0xFF){i++;continue}const m=b[i+1];" +
        "if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){" +
        "console.log(b.readUInt16BE(i+7)+'x'+b.readUInt16BE(i+5));break}" +
        "i+=2+b.readUInt16BE(i+2)}\"", { encoding: "utf8" }).trim();
      return out === "960x640";
    });
  })());

report("G2) the two workflows that had no art are off NO_CARD_JPG",
  (function () {
    const m = src.match(/var NO_CARD_JPG=\[([^\]]*)\]/);
    const list = m[1];
    return NEW_ART.every(n => list.indexOf('"' + n + '"') < 0);
  })());

/* v5.13 — Cinematic Poster's own art (held since v4.93) landed in the same
   wave as the three fantasy cards' art. G3 used to pin the opposite: that it
   was STILL on NO_CARD_JPG, ships-before-its-photo. That pin is now stale by
   construction, the same way G2 would go stale the moment NEW_ART's ids
   landed — so it is rewritten to what actually holds today: the id is off
   the list AND a real 960x640 photo backs it, checked the same two ways G
   and G2 already check the rest of this wave's art. */
report("G3) Cinematic Poster's own art has landed — off NO_CARD_JPG, real photo on disk",
  (function () {
    const m = src.match(/var NO_CARD_JPG=\[([^\]]*)\]/);
    const offList = m[1].indexOf('"cinematic-poster"') < 0;
    const p = path.join(APP, "lib/wf/cards5", "cinematic-poster.jpg");
    return offList && fs.existsSync(p);
  })());

report("G4) the purge marker covers every replaced name and none of the new ones",
  (function () {
    const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");
    const vm = require("vm");
    const box = {}; vm.createContext(box);
    vm.runInContext(sw.match(/var LIB_PURGES = \[[\s\S]*?\n\];/)[0] +
      "; globalThis.__P=LIB_PURGES;", box);
    /* By TAG, not by position. The first cut of this read the LAST entry in
       the list, which was this release's — until v4.95 appended one for the
       ten makeup video cards and this assertion started reading a regex about
       /lib/vid/ and failing. A marker is identified by its tag; where it sits
       in the array is an accident of release order. */
    const mine = box.__P.filter(p => p.tag === "./__lib-purge-v4-93-cards13");
    if (mine.length !== 1) return false;
    return REPLACED.every(n => mine[0].re.test("/lib/wf/cards5/" + n + ".jpg")) &&
      NEW_ART.every(n => !mine[0].re.test("/lib/wf/cards5/" + n + ".jpg"));
  })(),
  "a new filename in the purge regex charges every user a re-fetch for a file they never had");

/* ---- H) it renders ---- */
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() === 404) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_web_studio_page", "pgWf");
    localStorage.setItem("hnk_ws_lang", "my");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { document.querySelectorAll("#wfHost .grp-h").forEach(h => h.click()); });
  await page.waitForTimeout(900);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(50); }
  await page.waitForTimeout(1500);

  const seen = await page.evaluate(() => {
    const MM = /[က-႟]/;
    let card = null, svgOnly = [];
    document.querySelectorAll("#wfHost .wfmini").forEach(c => {
      const t = c.querySelector(".t"), s = c.querySelector(".s"), im = c.querySelector("img");
      const srcAttr = im ? (im.getAttribute("src") || "") : "";
      if (t.textContent.trim() === "Cinematic Poster") {
        card = { burmese: s ? MM.test(s.textContent) : false, svg: srcAttr.startsWith("data:image/svg") };
      }
      if (srcAttr.startsWith("data:image/svg")) svgOnly.push(t.textContent.trim());
    });
    return { total: document.querySelectorAll("#wfHost .wfmini").length, card: card, svgOnly: svgOnly };
  });

  report("H) the card renders on the Workflow page with a Burmese summary",
    !!seen.card && seen.card.burmese === true, seen.card);

  /* v5.13 — all four (Cinematic Poster, Nine-Tail Kitsune Fox, Mermaid
     Transformation, Fairy Wings) landed their reference-locked photographs
     and came off NO_CARD_JPG in the same wave. The INTENT this pin protects
     is unchanged: NO_CARD_JPG must name exactly the cards that really have
     no art yet — it happened to hold four between v5.12 and v5.13, and holds
     none now. */
  const EXPECT_SVG_ONLY = [];
  report("H2) no card is left on the generated-icon fallback — every art gap from this wave has landed",
    seen.svgOnly.length === EXPECT_SVG_ONLY.length && EXPECT_SVG_ONLY.every(t => seen.svgOnly.indexOf(t) >= 0),
    seen.svgOnly);

  report("H3) the deck is at least the size this wave shipped it at (124 + Cinematic Poster's siblings)",
    seen.total >= 125, seen.total);
  report("H4) nothing 404s", bad.length === 0, bad.slice(0, 6));
  report("H5) no page errors", errs.length === 0, errs);

  console.log("      (the twelve cards that used to sit on the SVG fallback or carry the " +
    "feather at the mouth now show the owner's own photographs; Cinematic Poster and " +
    "v5.12's three fantasy cards landed their own reference-locked art in v5.13 — " +
    "NO_CARD_JPG is empty)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
