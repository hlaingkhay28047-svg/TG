/* v4.92.0 regression sweep — the Workflow page fits the phone it is used on.

   WHAT THE OWNER SENT. A screenshot of the Workflow page on his phone with the
   right-hand column of cards sliced off down the middle: "Reference Transfer"
   losing its summary at the screen edge, "Scene Fit Pro" the same, thumbnails
   in the same row visibly different heights so no two titles lined up. He asked
   for it to be made tidy.

   WHAT IT ACTUALLY WAS — one CSS token, and the diagnosis only came from
   measuring. `.wfgrid` was `grid-template-columns:1fr 1fr`. `1fr` is shorthand
   for `minmax(auto,1fr)`, so each track's FLOOR is its min-content width: a
   track can never be narrower than the longest unbreakable run of text inside
   it. Burmese sets no spaces between words and several summaries glue tokens
   with punctuation that UAX#14 gives no break opportunity at. The worst,
   "အရောင်+အလင်း+မိတ်ကပ်+retouch style", measured 249.2px of min-content by
   itself. Both tracks pinned at min-content, the grid laid out 426px wide
   inside a 412px viewport, and `.grp{overflow:hidden}` clipped everything past
   the edge — the entire right column, in every category, at every phone width.
   The unequal thumbnails were the same bug seen from the other side: columns
   of 155px and 213px render a 3:2 thumbnail 90.1px and 127.3px tall.

   Measured on pgWf before and after `minmax(0,1fr)`, counting only elements
   that no ancestor scroller accounts for:
                        412      390      360
     clipped elements   56 -> 0  91 -> 0  91 -> 0
     row thumb spread   37.2 ->0 37.2 ->0 49.1 -> 0   (px)
   The narrower the phone, the worse it got, which is the wrong direction for
   an app used almost entirely on phones. Note that A2 — "the document does not
   scroll sideways" — PASSES on the broken build: .grp{overflow:hidden} ate the
   overflow instead of propagating it, so the usual whole-page check would
   never have found this. A had to be written to look for clipping.

   THE SECOND HALF OF THAT FIX IS NOT OPTIONAL. Once a track may shrink below
   min-content, the long run has to be allowed to break or it simply moves from
   being clipped by .grp to being clipped by the card. `.wfmini .t/.s` therefore
   carry overflow-wrap:anywhere. Assertion D pins it.

   AND A SECOND, INDEPENDENT DEFECT the same measurement pass turned up:
   #wfJump, the category quick-jump rail, is built as a nowrap overflow-x:auto
   scroller, but its chips kept the default flex-shrink of 1. So instead of
   scrolling they squashed: "Background & Scene 14" wrapped to three lines and
   the pill, at border-radius:999px, rendered as a 118px-tall ellipse. Chip
   height 118 -> 40.

   Pinned contracts:
   A) At 360, 390 and 412 nothing on pgWf is clipped by an ancestor or pushes
      the document sideways — the horizontal chip rails excepted, since those
      are scrollers and sticking out is what they are for.
   B) Thumbnails inside one grid row are the same height.
   C) The grid track floors are minmax(0,…) in BOTH the phone rule and the
      >=768px three-column rule.
   D) The card's title and summary may break inside an unbreakable run.
   E) The category chips are single-line and the rail scrolls instead.
   F) Every workflow card carries a translated summary — this is what caught
      the 11 that were still English while the app ran in Burmese: two missing
      ST_SUM rows (scene-fit-pro, master-pro-retouch, both shipped in v4.88),
      one missing PR_SUM row (sketchPose), and the eight Prompt Ideas cards,
      whose summary was the raw English prompt cut at 80 characters.
   G) No page errors and no 404s.

   EVERY ONE OF THESE HAS BEEN SEEN TO FAIL. Run this file against the v4.91.0
   tree and A, B, E and F all report FAIL; that is where the numbers above come
   from. An assertion that cannot fail is worse than no assertion.

   Usage: PORT=8931 node test/sweep_v492_gridfit.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
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

/* ---- C) the source-level contract, both breakpoints ---- */
const phoneRule = (src.match(/\.wfgrid\{display:grid;grid-template-columns:([^;]+);/) || [])[1] || "";
const deskRule = (src.match(/\.wfgrid\{grid-template-columns:(repeat\(3,[^)]*\)[^}]*)\}/) || [])[1] || "";
report("C) the two-column phone rule floors its tracks at 0, not min-content",
  /minmax\(\s*0\s*,\s*1fr\s*\)\s+minmax\(\s*0\s*,\s*1fr\s*\)/.test(phoneRule), { rule: phoneRule });
report("C2) the three-column desktop rule does the same",
  /repeat\(3,\s*minmax\(\s*0\s*,\s*1fr\s*\)\)/.test(deskRule), { rule: deskRule });

report("D) card title and summary may break inside an unbreakable run",
  /\.wfmini \.t\{[^}]*overflow-wrap:anywhere/.test(src) &&
  /\.wfmini \.s\{[^}]*overflow-wrap:anywhere/.test(src),
  "without this, minmax(0,1fr) just moves the clipping from .grp to the card");

report("E0) #wfJump chips are declared unshrinkable",
  /#wfJump \.chip\{flex:0 0 auto;white-space:nowrap\}/.test(src) ||
  /#libFilters \.chip,#libGroups \.chip,#wfJump \.chip\{flex:0 0 auto;white-space:nowrap\}/.test(src));

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const VIEWPORTS = [412, 390, 360];
  const results = {};
  const errs = [], bad = [];

  for (const width of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(width + ": " + String(e).slice(0, 160)));
    page.on("response", r => { if (r.status() === 404) bad.push(width + ": " + new URL(r.url()).pathname); });
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
      localStorage.setItem("hnk_web_studio_page", "pgWf");
      localStorage.setItem("hnk_ws_lang", "my");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2400);
    await page.evaluate(() => { document.querySelectorAll("#wfHost .grp-h").forEach(h => h.click()); });
    await page.waitForTimeout(900);

    results[width] = await page.evaluate(() => {
      const de = document.documentElement, vw = de.clientWidth;
      /* an element inside a horizontal scroller is SUPPOSED to stick out */
      const inScroller = el => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        return false;
      };
      const spill = [];
      document.querySelectorAll("#pgWf *").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0) return;
        /* 1.5px of slack: a 100%-width full-bleed image rounds a hair wide */
        if ((r.right > vw + 1.5 || r.left < -1.5) && !inScroller(el)) {
          spill.push({ sel: el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0],
            right: +r.right.toFixed(1), vw: vw, txt: (el.textContent || "").trim().slice(0, 30) });
        }
      });

      /* thumbnails sharing a row must share a height */
      const rows = {};
      document.querySelectorAll("#wfHost .wfmini img").forEach(im => {
        const r = im.getBoundingClientRect();
        const k = Math.round(r.top / 8) * 8;
        (rows[k] = rows[k] || []).push(+r.height.toFixed(1));
      });
      let artSpread = 0;
      Object.keys(rows).forEach(k => {
        if (rows[k].length < 2) return;
        artSpread = Math.max(artSpread, Math.max.apply(null, rows[k]) - Math.min.apply(null, rows[k]));
      });

      /* the quick-jump rail */
      const rail = document.getElementById("wfJump");
      const chips = rail ? [...rail.querySelectorAll(".chip")] : [];
      const chipH = chips.map(c => +c.getBoundingClientRect().height.toFixed(1));

      /* summaries still in English while the UI language is Burmese */
      const MM = /[က-႟]/;
      const untranslated = [];
      document.querySelectorAll("#wfHost .wfmini").forEach(c => {
        const s = c.querySelector(".s"), t = c.querySelector(".t");
        if (s && s.textContent.trim() && !MM.test(s.textContent))
          untranslated.push(t ? t.textContent.trim() : "?");
      });

      return {
        docScrollW: de.scrollWidth, docClientW: de.clientWidth,
        spill: spill.slice(0, 8), spillCount: spill.length,
        artSpread: +artSpread.toFixed(1),
        cards: document.querySelectorAll("#wfHost .wfmini").length,
        chipCount: chips.length,
        chipMaxH: chipH.length ? Math.max.apply(null, chipH) : 0,
        railScrolls: rail ? rail.scrollWidth > rail.clientWidth + 2 : false,
        untranslated: untranslated
      };
    });
    await ctx.close();
  }

  /* ---- A ---- */
  const spilled = VIEWPORTS.filter(w => results[w].spillCount > 0);
  report("A) nothing on pgWf is clipped or pushed sideways at 360/390/412",
    spilled.length === 0,
    spilled.map(w => ({ w: w, count: results[w].spillCount, first: results[w].spill[0] })));

  report("A2) the document itself never scrolls sideways",
    VIEWPORTS.every(w => results[w].docScrollW <= results[w].docClientW),
    VIEWPORTS.map(w => ({ w: w, scroll: results[w].docScrollW, client: results[w].docClientW })));

  /* ---- B ---- */
  report("B) thumbnails sharing a row share a height",
    VIEWPORTS.every(w => results[w].artSpread === 0),
    VIEWPORTS.map(w => ({ w: w, spread: results[w].artSpread })));

  /* ---- E ---- */
  report("E) category chips stay one line — the rail scrolls, the chip does not shrink",
    VIEWPORTS.every(w => results[w].chipCount > 0 && results[w].chipMaxH <= 48 && results[w].railScrolls),
    VIEWPORTS.map(w => ({ w: w, chips: results[w].chipCount, maxH: results[w].chipMaxH, scrolls: results[w].railScrolls })));

  /* ---- F ---- */
  report("F) every workflow card carries a translated summary",
    VIEWPORTS.every(w => results[w].untranslated.length === 0),
    { atWidest: results[412].untranslated.slice(0, 12), cards: results[412].cards });

  report("F2) the deck is still the full deck — no cards lost to any of this",
    results[412].cards >= 120, { cards: results[412].cards });

  /* ---- G ---- */
  report("G) no page errors", errs.length === 0, errs.slice(0, 5));
  report("G2) nothing 404s", bad.length === 0, bad.slice(0, 5));

  console.log("      (on v4.91.0 this same file reports 8 failures: 56 clipped elements at " +
    "412 and 91 at both 390 and 360, row thumbnail spread 37.2/37.2/49.1px, quick-jump " +
    "chips 118px tall, and 11 of 123 card summaries still English in a Burmese UI)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
