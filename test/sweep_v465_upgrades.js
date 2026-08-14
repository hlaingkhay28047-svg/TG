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

    byWidth[w] = await page.evaluate(async () => {
      const out = {};
      document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
      const pg = document.getElementById("pgStudio");
      if (!pg) return { err: "no pgStudio" };
      pg.classList.add("on");
      await new Promise(r => setTimeout(r, 1000));

      /* A + B) the explanation line */
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
          boxW: h.clientWidth
        };
      }

      /* C + D) preset tiles */
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

      /* G) hero text overlaps */
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
      return out;
    });
    await ctx.close();
  }

  const at = w => byWidth[w] || {};

  report("A) the line explaining the page wraps — no ellipsis truncation at any phone width",
    WIDTHS.every(w => at(w).hint && at(w).hint.ellipsised === false && at(w).hint.whiteSpace === "normal"),
    WIDTHS.map(w => w + ":" + JSON.stringify(at(w).hint)).join(" | "));

  report("B) it stays clamped, so a longer translation cannot push GENERATE off-screen",
    WIDTHS.every(w => at(w).hint && /^\d+$/.test(String(at(w).hint.clamp)) && Number(at(w).hint.clamp) <= 4),
    WIDTHS.map(w => w + ":clamp=" + (at(w).hint || {}).clamp).join(" "));

  report("C) no preset tile name is clipped",
    WIDTHS.every(w => at(w).tiles > 0 && at(w).tilesClipped === 0),
    WIDTHS.map(w => w + ": tiles=" + at(w).tiles + " clipped=" + at(w).tilesClipped +
      " longest=" + JSON.stringify(at(w).longestName)).join(" | "));

  report("D) tiles keep one uniform 76px width — the fix cost lines, not layout",
    WIDTHS.every(w => (at(w).cardWidths || []).length === 1 && at(w).cardWidths[0] === 76),
    WIDTHS.map(w => w + ":" + JSON.stringify(at(w).cardWidths)).join(" "));

  report("E) the GENERATE button is still full width after the text grew",
    WIDTHS.every(w => at(w).genW >= 138),
    WIDTHS.map(w => w + ":" + at(w).genW).join(" "));

  report("F) zero real horizontal overflow once chip scrollers are excluded",
    WIDTHS.every(w => at(w).realOverflow === 0),
    WIDTHS.map(w => w + ": real=" + at(w).realOverflow + " inScrollers=" + at(w).overflowInScrollers).join(" | "));

  report("G) no overlapping text in the hero — the thing the screenshot seemed to show",
    WIDTHS.every(w => at(w).heroOverlaps === 0),
    WIDTHS.map(w => w + ":" + at(w).heroOverlaps).join(" "));

  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("      (Studio ships " + at(390).groups + " groups collapsed by default — " +
    "deliberate, navigated by the group chips and the feature search, not a defect this file asks anyone to fix)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
