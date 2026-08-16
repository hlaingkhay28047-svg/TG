/* v4.65.0 regression sweep — the Studio page says what it means.

   Two strings on the Studio page were being cut off, and both were cut in the
   place where it costs the most.

   1) THE LINE THAT EXPLAINS THE PAGE. #stPendCount does double duty: when work
      is queued it shows two short counts, and when nothing is queued it carries
      the one sentence that tells a new owner what the Studio actually is —
      "sliders preview instantly on the photo, AI-only edits queue here for one
      GENERATE". It was white-space:nowrap with an ellipsis. Measured: 426px of
      text against 262px of room at 320, 332px at 390, 356px at 414. So on every
      phone the explanation was cut mid-word, on the one screen where a new user
      most needs it.

   2) THE PRESET NAMES. A preset tile is 76px wide and its name is the only
      thing telling it from the tile beside it. nowrap in a 74px content box
      clipped every name past about twelve characters — "Clean Commercial"
      wanted 95px and got 74.

   WHAT THIS FILE ALSO RECORDS: two things that LOOKED broken and were not.
   A first screenshot appeared to show the hero title overlapping its own
   subtitle; measuring every text pair in the hero at three widths found zero
   overlaps — it was Burmese glyph overshoot in the raster, not a layout fault.
   And a naive overflow scan reported 16-20 elements running past the page box;
   walking their ancestors showed all of them sit inside a legitimate horizontal
   chip scroller, so the real count is zero. Both checks live here so the next
   person to see those shapes does not re-fix a non-problem.

   NOT CHANGED, DELIBERATELY: the page ships 34 groups all collapsed. That looks
   like a wall of closed headers, but the page already carries group chips and a
   feature search for navigation, and opening them would stretch a page that is
   5.2 screens tall to many times that. Changing it needs evidence this file
   does not have, so it stays.

   v4.96 — ONE STUDIO PAGE BECAME TWO. #pgStudio no longer exists. The Meitu
   suite (#stMuCard) is its own page #pgMeitu and the Evoto suite (#stEvCard)
   is its own page #pgEvoto, and everything they share — the PHOTO card, the
   live preview, the jump bar, recipes, the result box and the generate bar —
   lives once in #stCols and is MOVED into whichever suite page is active. The
   inactive suite's card is parked in the hidden #stDock, so its tiles measure
   0x0. Three consequences for the checks below:

     - The page can no longer be revealed by hand. #stCols starts in #stDock
       and is appendChild'd into a suite page only by stMountSuite(), which
       switchPage() calls, so toggling .on would light an EMPTY page and every
       rect here would read 0. Every width now walks SUITES via switchPage().
     - C and D used to see both preset rows in one page view (16 tiles). They
       cannot any more, so they are SPLIT: #muPresetRow is measured on #pgMeitu
       and #evPresetRow on #pgEvoto, at the SAME thresholds. Note that "Clean
       Commercial" — the name that motivated the fix — is an Evoto preset, so
       the original assertion's real subject now lives on the #pgEvoto arm.
     - A, B, E and F read the shared block and G reads the hero, and all five
       now run once per suite page rather than once on the page that used to
       hold everything. Same thresholds, twice the coverage: the #pgEvoto arm
       of each rule never existed before this release.

   Pinned contracts:
   A) The explanation line wraps and is NOT ellipsis-truncated at any phone width.
   B) It stays clamped, so a longer translation can never push GENERATE off-screen.
   C) No preset tile name is vertically clipped.
   D) Tiles keep their 76px width — the fix was allowed to cost lines, not layout.
   E) The GENERATE button is still reachable and full width after the text grew.
   F) Zero real horizontal overflow once chip scrollers are excluded.
   G) Zero overlapping text pairs in the hero.

   Usage: PORT=8931 node test/sweep_v465_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const WIDTHS = [320, 390, 414];
/* v4.96: the two suite pages that replaced #pgStudio. Every check below runs
   once per entry, per width. */
const SUITES = [["pgMeitu", "Meitu"], ["pgEvoto", "Evoto"]];

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];
  const byWidth = {};

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(w + "px " + String(e).slice(0, 160)));
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);

    byWidth[w] = await page.evaluate(async SUITES => {
      const byPage = {};

      for (const pair of SUITES) {
        const pgId = pair[0];
        /* v4.96: switchPage() — not a class toggle. It calls stMountSuite(),
           which moves #stCols (the whole shared block) into this page and
           parks the OTHER suite's card in #stDock. Without it the page is an
           empty hero and every measurement below reads 0. */
        switchPage(pgId);
        await new Promise(r => setTimeout(r, 1000));
        const pg = document.getElementById(pgId);
        const out = byPage[pgId] = {};
        if (!pg) { out.err = "no " + pgId; continue; }

        /* A + B) the explanation line. Shared, so it is the same node on both
           pages — but the .stcompact / .stslim rules that can hide it are
           written per page id, so it is worth reading once per page. */
        const h = document.getElementById("stPendCount");
        if (h) {
          const cs = getComputedStyle(h);
          out.hint = {
            whiteSpace: cs.whiteSpace,
            clamp: cs.webkitLineClamp,
            /* the real question is not "is scrollHeight > clientHeight" — Burmese
               diacritics overshoot the line box by a few px and would make that
               read false forever. The question is whether the ELLIPSIS is in play,
               which is what actually removes words. */
            ellipsised: cs.textOverflow === "ellipsis" && cs.whiteSpace === "nowrap",
            chars: (h.textContent || "").trim().length,
            lines: Math.round(h.clientHeight / (parseFloat(cs.lineHeight) || 14)),
            boxW: h.clientWidth,
            /* the shared block really did land in THIS page, not the dock */
            mounted: pg.contains(h)
          };
        }

        /* C + D) preset tiles. Scoped to pg, which after the v4.96 split means
           #muPresetRow on #pgMeitu and #evPresetRow on #pgEvoto — the other
           suite's row is inside the card parked in #stDock and measures 0x0. */
        const spans = Array.from(pg.querySelectorAll(".pcard span")).filter(s => s.offsetHeight > 0);
        out.tiles = spans.length;
        out.tilesClipped = spans.filter(s => s.scrollHeight > s.clientHeight + 2).length;
        out.longestName = spans.map(s => (s.textContent || "").trim())
          .sort((a, b) => b.length - a.length)[0] || null;
        const cards = Array.from(pg.querySelectorAll(".pcard")).filter(c => c.offsetHeight > 0);
        out.cardWidths = Array.from(new Set(cards.map(c => Math.round(c.getBoundingClientRect().width))));

        /* E) GENERATE still usable */
        const gen = pg.querySelector("#stGenBar .gen");
        out.genW = gen ? Math.round(gen.getBoundingClientRect().width) : null;

        /* F) real horizontal overflow, chip scrollers excluded */
        const pr = pg.getBoundingClientRect();
        let real = 0, inScroller = 0;
        Array.from(pg.querySelectorAll("*")).forEach(e => {
          if (!e.offsetWidth || !e.offsetHeight) return;
          if (e.getBoundingClientRect().right <= pr.right + 2) return;
          let a = e.parentElement, host = null;
          while (a && a !== pg) {
            const cs = getComputedStyle(a);
            if (/scroll|auto/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 2) { host = a; break; }
            a = a.parentElement;
          }
          if (host) inScroller++; else real++;
        });
        out.realOverflow = real;
        out.overflowInScrollers = inScroller;

        /* G) hero text overlaps. Each suite page carries its own hero now —
           #phMeitu and #phEvoto in place of the one #phStudio. */
        const hero = pg.querySelector(".page-hero");
        let ov = 0;
        if (hero) {
          const kids = Array.from(hero.querySelectorAll("*"))
            .filter(e => e.offsetHeight > 0 && (e.textContent || "").trim().length > 2 && e.children.length === 0);
          for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
            const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 &&
              Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) ov++;
          }
        }
        out.heroOverlaps = ov;
        out.groups = pg.querySelectorAll(".grp").length;
      }
      return byPage;
    }, SUITES);
    await ctx.close();
  }

  const at = (w, pgId) => (byWidth[w] || {})[pgId] || {};
  /* every contract holds at every width on BOTH suite pages */
  const all = fn => WIDTHS.every(w => SUITES.every(s => fn(at(w, s[0]))));
  const per = fn => WIDTHS.map(w => SUITES.map(s => w + "/" + s[1] + ":" + fn(at(w, s[0]))).join(" ")).join(" | ");

  report("A) the line explaining the page wraps — no ellipsis truncation at any phone width",
    all(o => o.hint && o.hint.mounted === true && o.hint.ellipsised === false && o.hint.whiteSpace === "normal"),
    per(o => JSON.stringify(o.hint)));

  report("B) it stays clamped, so a longer translation cannot push GENERATE off-screen",
    all(o => o.hint && /^\d+$/.test(String(o.hint.clamp)) && Number(o.hint.clamp) <= 4),
    per(o => "clamp=" + (o.hint || {}).clamp));

  report("C) no preset tile name is clipped",
    all(o => o.tiles > 0 && o.tilesClipped === 0),
    per(o => " tiles=" + o.tiles + " clipped=" + o.tilesClipped + " longest=" + JSON.stringify(o.longestName)));

  report("D) tiles keep one uniform 76px width — the fix cost lines, not layout",
    all(o => (o.cardWidths || []).length === 1 && o.cardWidths[0] === 76),
    per(o => JSON.stringify(o.cardWidths)));

  report("E) the GENERATE button is still full width after the text grew",
    all(o => o.genW >= 138),
    per(o => o.genW));

  report("F) zero real horizontal overflow once chip scrollers are excluded",
    all(o => o.realOverflow === 0),
    per(o => " real=" + o.realOverflow + " inScrollers=" + o.overflowInScrollers));

  report("G) no overlapping text in the hero — the thing the screenshot seemed to show",
    all(o => o.heroOverlaps === 0),
    per(o => o.heroOverlaps));

  report("no page errors", pageErrors.length === 0, pageErrors);

  /* v4.96: the 34 groups are now split across the two suite pages, so the wall
     of closed headers a customer actually faces is half what it was. Still not
     a defect this file asks anyone to fix — just a smaller one. */
  console.log("      (Studio ships " + SUITES.map(s => at(390, s[0]).groups + " on " + s[1]).join(" + ") +
    " = " + SUITES.reduce((n, s) => n + (at(390, s[0]).groups || 0), 0) + " groups collapsed by default — " +
    "deliberate, navigated by the group chips and the feature search, not a defect this file asks anyone to fix)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
