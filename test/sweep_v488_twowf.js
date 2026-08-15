/* v4.88.0 regression sweep — Scene Fit Pro, Master Pro Retouch, and the
   prompt-length constraint that nearly shipped broken.

   WHAT THE OWNER ASKED FOR. Two workflows. The first: his subject stays
   EXACTLY where it is — position, scale, crop, composition, pose, light,
   colour, every part — while IMAGE 2's people are removed, the props they
   covered are restored at their exact left/right places, and that scene is
   fitted around the untouched subject with the camera and lighting bent TO
   MATCH the subject. The second: one complete studio finish — skin, gown,
   existing makeup improved, detailed hair, hands and neck and legs, softboxes
   and stands and clutter removed, backdrop tidied, colour cleaned, dodge and
   burn — better and more complete than the 1186-character AI Retouch.

   SCENE FIT PRO IS THE INVERSE OF WHAT ALREADY EXISTED, which is the only
   reason it deserves its own button. Master BG FG Replace moves the subject
   INTO the removed person's position and adopts IMAGE 2's camera viewpoint.
   This one pins the subject and moves the scene. Assertion C is what keeps a
   future edit from quietly collapsing the two back together.

   AND THE LENGTH IS A CORRECTNESS CONSTRAINT, not a style note. This is the
   finding that changed the work. Smart Workflow prompts are dispatched to
   image-EDIT models whose promptMax runs 800 (Qwen Image 2) through 2000
   (Seedream v4) to 2048 (Wan), and rhTruncatePrompt cuts at submit. It is not
   a dumb cut: the app appends a TASK GUARD block at dispatch and the truncator
   keeps that whole guard plus the FIRST (maxLen - guardLen) characters of the
   body. So what survives on the tightest model is the OPENING of the prompt.

   The 14-agent workflow that drafted these returned 12,502 and 16,670
   characters, because the brief asked for "at least 4000" — a floor set
   without checking the ceiling. On Seedream that is 12-16% of the text
   surviving, with the FINAL COMMAND lost. Both were rewritten compressed and
   front-loaded, so the whole contract is stated in the opening paragraph and
   truncation degrades instead of decapitating.

   Pinned contracts:
   A) Both exist, wired into a visible category, with the fields the card needs.
   B) THE OPENING PARAGRAPH IS SELF-SUFFICIENT. The first 800 characters of
      each prompt — what survives on the tightest registered edit model — still
      name the workflow's whole job. This is the assertion the drafting mistake
      would have failed.
   C) Scene Fit Pro states the inverse direction explicitly and does not read
      as Master BG FG Replace: it forbids adopting IMAGE 2's viewpoint and
      forbids moving the subject into the removed person's spot.
   D) Props: the restore-and-keep-their-places requirement is present, and the
      relative-to-the-scene clarification with it — without that, "keep every
      prop's exact position" and "fit the scene around the subject" contradict.
   E) Master Pro Retouch covers every department the owner listed, and is
      materially more complete than the existing AI Retouch.
   F) Both resolve beauty-versus-identity the way this app always has: craft
      changes light and cleanliness, never bone structure or body shape.
   G) Both render as cards in the running app, and nothing 404s — the two ship
      before their card photographs, so they must be on NO_CARD_JPG.
   H) No page errors.

   Usage: PORT=8931 node test/sweep_v488_twowf.js  (serve docs/app first) */
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
const SCENE = byId["scene-fit-pro"], RT = byId["master-pro-retouch"];

/* The tightest promptMax among the registered image-EDIT models, read from the
   source rather than hard-coded so it tracks the registry. */
const editCaps = (src.match(/apiPath:"[^"]*image-edit[^"]*"[^}]*promptMax:(\d+)/g) || [])
  .map(m => +m.match(/promptMax:(\d+)/)[1]);
const FLOOR = editCaps.length ? Math.min.apply(null, editCaps) : 800;

/* ---- A ---- */
report("A) both workflows exist with the fields a card needs",
  !!SCENE && !!RT &&
  [SCENE, RT].every(w => w.title && w.summary && w.explanation && w.visual &&
    Array.isArray(w.req) && w.req.length >= 1 && w.prompt && w.negative),
  { scene: !!SCENE, retouch: !!RT });

report("A2) each is wired into a category that actually renders",
  /st\(\[[^\]]*"scene-fit-pro"[^\]]*\]\)/.test(src) &&
  /st\(\[[^\]]*"master-pro-retouch"[^\]]*\]\)/.test(src));

report("A3) Scene Fit Pro takes two images, Master Pro Retouch takes one",
  SCENE.req.length === 2 && RT.req.length === 1,
  { scene: SCENE.req.length, retouch: RT.req.length });

/* ---- B) the assertion the drafting mistake would have failed ---- */
const HEADLINE = {
  "scene-fit-pro": ["IMAGE 1", "IMAGE 2", "remove", "prop", "fit"],
  "master-pro-retouch": ["skin", "hair", "colour", "identity"]
};
const openings = [SCENE, RT].map(w => {
  const head = w.prompt.slice(0, FLOOR).toLowerCase();
  return { id: w.id, total: w.prompt.length,
    missing: HEADLINE[w.id].filter(k => head.indexOf(k.toLowerCase()) < 0) };
});
report("B) the first " + FLOOR + " characters still state the whole job",
  openings.every(o => o.missing.length === 0), { floor: FLOOR, openings: openings });

/* A second, blunter guard on the same failure: a prompt so long that the
   opening is a small fraction of it has stopped being front-loaded. The
   ceiling is generous — master-bgfg-replace is 5649 and is the precedent —
   but 12k is not a prompt, it is a document. */
report("B2) neither prompt is longer than the deck's established maximum",
  [SCENE, RT].every(w => w.prompt.length <= 6500),
  [SCENE, RT].map(w => ({ id: w.id, len: w.prompt.length })));

/* ---- C) genuinely the inverse, not a second copy ---- */
const p = SCENE.prompt;
report("C) Scene Fit Pro states the inverse direction of fit explicitly",
  /INVERSE/i.test(p) &&
  /do not adopt IMAGE 2's camera viewpoint/i.test(p) &&
  /do not move the subject into the removed person's position/i.test(p) &&
  /IMAGE 1 wins/i.test(p));

const MBG = byId["master-bgfg-replace"];
function words(t) {
  return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3));
}
const A = words(p), B = words(MBG.prompt);
let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
const jac = +(inter / (A.size + B.size - inter)).toFixed(2);
report("C2) it is not a reworded Master BG FG Replace", jac < 0.55, { jaccard: jac });

/* ---- D) the props requirement, and the clarification that makes it obeyable ---- */
report("D) props are restored whole and keep their places",
  /bench/i.test(p) && /every leg/i.test(p) &&
  /same left-to-right order/i.test(p) && /same near-far order/i.test(p),
  { hasBench: /bench/i.test(p) });

report("D2) prop positions are qualified as relative to the SCENE, not the frame",
  /RELATIVE TO THE SCENE, not to the frame/i.test(p),
  "without this, 'keep every prop's exact position' and 'fit the scene around " +
  "the subject' are mutually impossible and the model picks one at random");

/* ---- E) every department the owner listed ---- */
const DEPTS = {
  skin: /frequency-separation|pores/i,
  dimension: /dodge and burn/i,
  makeup: /makeup she is already wearing|improve the makeup/i,
  hair: /flyaway|hairline/i,
  limbs: /knuckles|collarbone|ankles/i,
  wardrobe: /creases|lace|beadwork/i,
  set: /softbox/i, stands: /light stands|C-stands/i,
  backdrop: /backdrop itself|floor line/i,
  colour: /white balance/i
};
const gaps = Object.keys(DEPTS).filter(k => !DEPTS[k].test(RT.prompt));
report("E) Master Pro Retouch covers every department the owner listed",
  gaps.length === 0, { missing: gaps });

report("E2) it is materially more complete than the existing AI Retouch",
  RT.prompt.length > byId["retouch"].prompt.length * 3,
  { new: RT.prompt.length, old: byId["retouch"].prompt.length });

/* ---- F ---- */
report("F) both resolve beauty against identity the way this app always has",
  /craft, never from redesign|never from redesign/i.test(RT.prompt) &&
  /No slimming, no reshaping/i.test(RT.prompt) &&
  /preserve exact facial identity/i.test(p),
  { retouch: /never from redesign/i.test(RT.prompt) });

report("F2) the negatives carry the reshaping vocabulary",
  /slimmed face/i.test(RT.negative) && /reshaped face/i.test(RT.negative) &&
  /moved subject/i.test(SCENE.negative) && /recropped/i.test(SCENE.negative));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() === 404) bad.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_web_studio_page", "pgWf");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const titles = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#wfHost .grp").forEach(g => {
      const h = (g.querySelector(".grp-h") || g).textContent.trim();
      out[h] = [...g.querySelectorAll(".wfmini .t")].map(t => t.textContent);
    });
    return out;
  });
  const all = Object.keys(titles).reduce((a, k) => a.concat(titles[k]), []);
  report("G) both render as cards on the Workflow page",
    all.indexOf("Scene Fit Pro") >= 0 && all.indexOf("Master Pro Retouch") >= 0,
    { cards: all.length });

  /* open every group and scroll, so the lazy card art actually fires */
  await page.evaluate(() => {
    document.querySelectorAll("#wfHost .grp-h").forEach(h => h.click());
  });
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(160); }
  await page.waitForTimeout(1800);
  report("G2) nothing 404s — the two are on NO_CARD_JPG until their art lands",
    bad.length === 0, bad.slice(0, 6));

  report("H) no page errors", errs.length === 0, errs);

  console.log("      (tightest registered image-edit promptMax is " + FLOOR +
    "; rhTruncatePrompt keeps the TASK GUARD plus the FIRST maxLen-guard chars, " +
    "so the opening is what survives — the drafts came back at 12,502 and 16,670)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
