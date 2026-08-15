/* v4.85.0 regression sweep — the four window relights.

   WHAT THE OWNER ASKED FOR, AND WHAT THE REFERENCES ACTUALLY SHOW. Four
   before/after photographs, all of the same job: a window throwing its light
   and shadow pattern across the backdrop, and the warm colour response that
   comes with it. They are four workflows and not one because they are four
   genuinely different setups — soft bars from the left, broad golden shafts
   from the right, a hard raking rake with crisp shadow geometry, and a wide
   gentle wash sized for a full-length or couple frame.

   THEY LIVE IN THE RELIGHT FAMILY BUT THEY ARE NOT LAMPS. The Studio Relight
   category built every card as "Relight · <label>" with the summary
   "Professional studio relight with only the <label>". For a window that is
   both a lie and a stutter: "Relight · Window Blinds · Soft Left", "studio
   relight with only the Window Blinds · Soft Left". A card that promises a
   different job than its workflow performs is worse than no card, so the
   window family gets its own title and summary. Nothing else about the card
   changes — same visual assignment, same guard, same wiring.

   THE GUARD IS THE INTERESTING PART. Every reference turns a grey or taupe
   backdrop warm. The RELIGHT RULE says change ONLY the lighting, shadows,
   highlights "and the resulting color response". A warm window warming the
   wall IS that colour response, so these stay honest. What none of them does
   is INSTRUCT a background repaint — that would be a different workflow under
   a different guard, and D below is what keeps a future edit from drifting
   into one.

   Pinned contracts:
   A) All four exist in the data, with distinct keys, and the lights list is
      the eight originals plus these four — nothing was displaced.
   B) Each carries the equipment clause, so the pattern lands in the frame but
      the window and its blinds do not.
   C) Each names its own direction and quality — the four are actually four
      setups, not one prompt with four names. Measured as pairwise distinctness
      of the setup line, not as a hand-written list of expected words.
   D) None of them instructs a background REPLACEMENT or repaint. The warmth
      has to arrive as the light's consequence, which is what the shared
      RELIGHT guard permits.
   E) No subject negation. The proven equipment clause is the only negation
      allowed anywhere in this app's prompts; a "no ..." aimed at the person,
      her face, hands or pose summons what it forbids.
   F) The shared RELIGHT guard is appended to all twelve, new ones included.
   G) In the running app all twelve render as cards, the four windows are
      titled "Window Light · …" and the eight lamps still say "Relight · …",
      and every one of the twelve has a distinct visual.
   G5) NOTHING 404s while the shelf renders. This is the one that found a real
      defect: the card art path is lib/wf/cards5/<id>.jpg, and the four window
      photographs are not drawn yet, so each card fired a certain 404 on every
      render until the ids were added to NO_CARD_JPG. Watched at the network
      layer, not by reading the list, because the list is the fix.
   G0) …and G5 can actually fail. Getting there took three tries and each
      failure was instructive. Setting .open on the accordion leaves it at
      zero height (an inline max-height does the work), so the cards rendered
      but never fetched. Clicking the header instead still fetched nothing,
      because #wfHost lives on pgWf and a fresh profile lands on Home — every
      card sat inside a display:none page, where v4.84 established that lazy
      art is correctly deferred. G0 asserts the shelf really is open, on the
      right page, scrolled past, with its art loaded. An assertion that cannot
      fail is worse than no assertion: it reads like cover.
   H) No page errors.

   Usage: PORT=8931 node test/sweep_v485_windowlights.js  (serve docs/app first) */
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
const data = JSON.parse(src.match(
  /<script id="hnkData" type="application\/json">([\s\S]*?)<\/script>/)[1]);

const LIGHTS = data.lighting.lights;
const WIN_KEYS = ["winSoftL", "sunShaft", "winHard", "winWide"];
const LAMP_KEYS = ["key", "fill", "butterfly", "side", "rim", "back", "hair", "bglight"];
const wins = WIN_KEYS.map(k => LIGHTS.find(l => l.key === k)).filter(Boolean);

/* ---- A ---- */
report("A) the four window relights exist and the eight lamps are all still there",
  wins.length === 4 &&
  LAMP_KEYS.every(k => LIGHTS.some(l => l.key === k)) &&
  LIGHTS.length === 12 &&
  new Set(LIGHTS.map(l => l.key)).size === 12 &&
  data.counts.lighting === 12,
  { total: LIGHTS.length, counts: data.counts.lighting,
    missing: WIN_KEYS.filter(k => !LIGHTS.some(l => l.key === k)) });

report("A2) each carries an English label and a Burmese one",
  wins.every(w => w.label && w.label.length > 3 && w.labelMM && /[\u1000-\u109f]/.test(w.labelMM)),
  wins.map(w => ({ k: w.key, label: w.label, mm: w.labelMM })));

/* ---- B) the equipment clause, stated independently of the source ---- */
const EQUIP = ["softboxes", "light stands", "umbrellas", "reflectors", "lamps",
  "window frames", "blinds"];
report("B) every window prompt forbids the fixtures themselves appearing",
  wins.every(w => EQUIP.every(e => w.text.indexOf(e) >= 0)),
  wins.map(w => ({ k: w.key, missing: EQUIP.filter(e => w.text.indexOf(e) < 0) })));

/* ---- C) four setups, measured rather than asserted from a wish-list ----
   Compare the SETUP line (the one that starts with "- ") of each pair. A
   prompt family that was really one prompt with four names would collide
   here. Word-overlap rather than an expected-keyword list, so this keeps
   working when the wording is improved. */
function setupLine(t) {
  const m = t.split("\n").find(l => l.trim().indexOf("- ") === 0);
  return (m || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
const pairs = [];
for (let i = 0; i < wins.length; i++)
  for (let j = i + 1; j < wins.length; j++)
    pairs.push({ a: wins[i].key, b: wins[j].key,
      j: +jaccard(setupLine(wins[i].text), setupLine(wins[j].text)).toFixed(2) });
report("C) the four are four different setups, not one prompt renamed",
  pairs.every(p => p.j < 0.6), pairs);

/* Each also has to state a side and a quality, or the model is guessing. */
report("C2) each names a camera side and a light quality",
  wins.every(w => /camera-(left|right)|upper-(left|right)/.test(w.text) &&
    /soft|hard|broad|gentle|crisp|wide/.test(w.text)),
  wins.map(w => w.key));

/* ---- D) the warmth is a consequence, never an instruction to repaint ---- */
const REPAINT = /replace the background|change the background colou?r|new backdrop|swap the background|repaint the (background|backdrop)/i;
report("D) none of them instructs a background replacement or repaint",
  wins.every(w => !REPAINT.test(w.text)),
  wins.filter(w => REPAINT.test(w.text)).map(w => w.key));

/* ---- E) no subject negation ----
   Collect every negation in the prompt and require each one to belong to the
   equipment clause. Stated this way the assertion survives rewording of the
   clause and still fails the moment a "keep her hands away from..." style
   negation is aimed at the person. */
const negs = [];
wins.forEach(w => {
  const sentences = w.text.split(/(?<=[.\n])\s*/);
  sentences.forEach(s => {
    if (!/\b(no|not|never|without|avoid|do NOT|don't)\b/i.test(s)) return;
    const isEquip = /softbox|light stand|umbrella|reflector|lamp|window frame|blind|equipment/i.test(s);
    if (!isEquip) negs.push({ k: w.key, s: s.trim().slice(0, 110) });
  });
});
report("E) the equipment clause is the only negation — nothing negates the subject",
  negs.length === 0, negs);

/* ---- F ---- */
report("F) the shared RELIGHT guard still applies to all twelve",
  typeof data.lighting.guard === "string" &&
  /RELIGHT RULE/.test(data.lighting.guard) &&
  /prompt:l\.text\+"\\n"\+D\.lighting\.guard/.test(src),
  { guard: (data.lighting.guard || "").slice(0, 60) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [], lib404 = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  page.on("response", r => { if (r.status() === 404) lib404.push(new URL(r.url()).pathname); });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  /* ---- G) what the app actually builds, read off the DOM ----
     Read the rendered cards rather than an internal list: wfCats lives inside
     an IIFE and is not reachable, and the DOM is what the customer sees
     anyway. The wire is watched too — a card pointing at art that does not
     exist is a guaranteed 404 on every render, on a phone. */
  /* Go to the Workflows page first. #wfHost lives on pgWf, and a fresh profile
     lands on Home — every card would sit inside a display:none page, so its
     lazy art never fetches and the 404 watch below could never fail. Then open
     the shelf the way a customer does: setting .open by hand leaves the group
     at zero height, because the accordion carries an inline max-height. */
  await page.evaluate(() => switchPage("pgWf"));
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() => {
    const grps = [...document.querySelectorAll("#wfHost .grp")];
    const g = grps.find(x => /Studio Relight/i.test((x.querySelector(".grp-h") || x).textContent));
    if (!g) return false;
    const h = g.querySelector(".grp-h");
    if (h) h.click();
    g.scrollIntoView({ block: "start" });
    return true;
  });
  await page.waitForTimeout(1200);
  for (let s = 0; s < 10; s++) { await page.mouse.wheel(0, 420); await page.waitForTimeout(220); }
  await page.waitForTimeout(1600);

  const cards = await page.evaluate(() => {
    const grps = [...document.querySelectorAll("#wfHost .grp")];
    const g = grps.find(x => /Studio Relight/i.test((x.querySelector(".grp-h") || x).textContent));
    if (!g) return null;
    return [...g.querySelectorAll(".wfmini")].map(c => {
      const i = c.querySelector("img");
      return {
        title: (c.querySelector(".t") || {}).textContent || "",
        summary: (c.querySelector(".s") || {}).textContent || "",
        img: i ? i.getAttribute("src") : null,
        done: !!(i && i.complete && i.naturalWidth > 0)
      };
    });
  });

  report("G0) the shelf really opened and its card art was fetched — so G5 can fail",
    opened && cards && cards.filter(c => c.done).length >= 8,
    { opened: opened, loaded: cards ? cards.filter(c => c.done).length : null });

  report("G) the Studio Relight shelf renders all twelve cards",
    !!cards && cards.length === 12, { n: cards ? cards.length : null });

  const winCards = (cards || []).filter(c => /^Window Light · /.test(c.title));
  const lampCards = (cards || []).filter(c => /^Relight · /.test(c.title));
  report("G2) four are titled Window Light and the eight lamps still say Relight",
    winCards.length === 4 && lampCards.length === 8,
    { win: winCards.map(c => c.title), lamps: lampCards.length });

  report("G3) every window card carries its own readable summary",
    winCards.every(c => c.summary && c.summary.length > 8),
    winCards.map(c => ({ t: c.title, s: c.summary.slice(0, 50) })));

  report("G4) all twelve cards get a distinct visual",
    new Set((cards || []).map(c => c.img)).size === (cards || []).length,
    { imgs: (cards || []).length, distinct: new Set((cards || []).map(c => c.img)).size });

  /* G5 is the wire, and it is the assertion that caught this in development:
     the four new ids resolve to lib/wf/cards5/<id>.jpg, which is not drawn
     yet, so without a NO_CARD_JPG entry each card fires a 404 every render.
     Watched at the network layer rather than by reading the list, because the
     list is the fix and the 404 is the defect. */
  report("G5) no request 404s while the relight shelf renders",
    lib404.length === 0, lib404.slice(0, 6));

  /* v4.86 — the four card photographs landed, so NO_CARD_JPG went back to
     empty and the cards now point at real files. G6 pins the pair: the list is
     empty AND all four photographs load. Asserting only "the list is empty"
     would pass with the files missing (and G5 would then catch the 404s);
     asserting only "the files exist" would pass with the ids still suppressed
     and the SVG showing instead. Both together are the actual contract. */
  const shipped = await page.evaluate(() => {
    const grps = [...document.querySelectorAll("#wfHost .grp")];
    const g = grps.find(x => /Studio Relight/i.test((x.querySelector(".grp-h") || x).textContent));
    const want = ["lg-winSoftL", "lg-sunShaft", "lg-winHard", "lg-winWide"];
    return want.map(k => {
      const im = [...g.querySelectorAll(".wfmini img")]
        .find(i => (i.getAttribute("src") || "").indexOf(k + ".jpg") >= 0);
      return { k: k, wired: !!im, loaded: !!(im && im.complete && im.naturalWidth > 0),
        w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0 };
    });
  });
  report("G6) the four window cards are wired to real photographs that load",
    shipped.every(x => x.wired && x.loaded && x.w === 960 && x.h === 640),
    shipped);

  /* v4.88 — THIS ASSERTION WAS WRONG AND ITS OWN BATTERY CAUGHT IT. It read
     "NO_CARD_JPG is empty", which passed in v4.86 and then failed the moment
     v4.88 added two workflows that legitimately ship before their card art —
     the exact purpose the list exists for. An assertion that fails when the
     product gains a feature is testing the wrong thing; the ninth instance of
     that mistake in this repo. The contract is that THESE FOUR ids are off the
     list, because their photographs landed. What else is on it is not this
     suite's business. */
  const noCard = (src.match(/var NO_CARD_JPG=\[([^\]]*)\];/) || [])[1] || "";
  const stillSuppressed = ["lg-winSoftL", "lg-sunShaft", "lg-winHard", "lg-winWide"]
    .filter(k => noCard.indexOf(k) >= 0);
  report("G7) the four window ids are off NO_CARD_JPG, per its maintenance rule",
    stillSuppressed.length === 0, { stillSuppressed: stillSuppressed, list: noCard });

  report("H) no page errors", errs.length === 0, errs);

  console.log("      (read from four before/after references the owner supplied: soft bars " +
    "camera-left, golden shafts camera-right, a hard rake, and a wide wash for full-length)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
