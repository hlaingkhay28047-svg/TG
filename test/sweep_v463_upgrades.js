/* v4.63.0 regression sweep — a track worth dragging, on a page that is
   actually a touch page.

   Measured at 390px on the shipped layout: label 118px, track 120px, readout
   40px. The NAME of the control was wider than the control, giving 0.83 units
   per pixel on a 0-100 range against a ~40px fingertip. The app's own layout
   for the narrowest phones was already twice as precise and was switched off
   by one pixel — @media(max-width:359px).

   THE REASON THIS FILE EXISTS AT ALL: the fix lives in @media (pointer:coarse),
   and NOT ONE existing suite creates a touch page. sweep_studio_livepreview,
   sweep_studio_fixes, sweep_v442_upgrades and verify_tabbar_reachable all call
   browser.newPage({viewport}) with no hasTouch/isMobile, so Chromium resolves
   pointer:fine and none of these declarations apply. Shipped as-is, the
   ergonomics change would have been invisible to all 49 suites — including
   sweep_studio_livepreview §15, the elementFromPoint hit-test that is the only
   guard against a re-flowed row stealing pointer-down. This file opens a
   REAL touch context so the shipped layout is the layout under test.

   Pinned contracts:
   A) On a coarse pointer the media query actually matches. If this ever goes
      false the rest of the file is measuring the desktop layout and every
      other assertion here is worthless.
   B) The label and the readout share line one; the track gets line two, full
      width, at every phone width.
   C) The track is at least 200px — the point of the change.
   D) THE GESTALT RULE. The gap from a label to ITS OWN track must be smaller
      than the gap from that track to the NEXT row's label. A first draft
      measured 10.66px to its own and 2.66px to the next, so every track bound
      visually to the label BELOW it, across ~228 slider rows. Grabbing the
      wrong slider at 2am on photo 61 is the most expensive mistake this UI
      can make.
   E) Only rows that hold a track are restyled. 33 other .st-ctl rows carry
      toggles, chips or selects and have no slider to give a line to.
   F) The 44px touch minimum still holds on the track and the readout.
   G) The vertical cost is stated, not discovered: the row grows, and this
      test prints the real number so nobody has to guess it again.

   v4.96 — ONE STUDIO PAGE BECAME TWO. #pgStudio is gone; the Meitu suite lives
   on #pgMeitu and the Evoto suite on #pgEvoto, and the shared block (#stCols)
   is MOVED into whichever of the two is active. The inactive suite's card is
   parked in the hidden #stDock, so its rows measure 0x0 and cannot be read in
   the same page view as the other's. The ergonomics rule this file pins also
   grew from "#pgStudio .st-ctl.st-slider" to a three-selector list covering
   both new pages, so B-D-F now run TWICE per width — once per suite page, at
   the SAME thresholds — instead of once on the one page that used to hold both.
   That is a widening of coverage: the #pgEvoto arm of the rule was never
   exercised before it existed.

   Usage: PORT=8931 node test/sweep_v463_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const WIDTHS = [320, 360, 390, 414];
/* v4.96: the suite pages, and the ST.groups host tag that says which suite a
   group was built into ("mu" -> #stMuCard on #pgMeitu, "ev" -> #stEvCard on
   #pgEvoto). Every layout assertion below is run once per entry. */
const SUITES = [["pgMeitu", "mu"], ["pgEvoto", "ev"]];

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const pageErrors = [];
  const byWidth = {};

  for (const w of WIDTHS) {
    /* hasTouch + isMobile is what makes Chromium resolve (pointer:coarse) */
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(w + "px " + String(e).slice(0, 200)));
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1300);

    byWidth[w] = await page.evaluate(SUITES => {
      const out = { suites: {} };
      out.coarse = matchMedia("(pointer:coarse)").matches;

      /* v4.96: the page can no longer be revealed by hand. #stCols — which
         carries the suite cards, and so every slider row — starts parked in
         the hidden #stDock and is appendChild'd into a suite page only by
         stMountSuite(), which switchPage() calls. Toggling .on directly would
         light an EMPTY page and every rect below would read 0. */
      SUITES.forEach(pair => {
        const pgId = pair[0], host = pair[1];
        const o = out.suites[pgId] = {};
        switchPage(pgId);
        /* the group must belong to THIS suite: the other suite's groups are in
           the card currently parked in #stDock and measure 0x0 */
        const g = ST.groups.find(g => g.host === host &&
          g.el.querySelectorAll(".st-ctl.st-slider").length >= 3);
        if (!g) { o.err = "no " + host + " group with 3 sliders"; return; }
        g.el.className = "grp open";
        const rows = Array.from(g.el.querySelectorAll(".st-ctl.st-slider")).slice(0, 3);

        const first = rows[0];
        const lb = first.querySelector("label"), rn = first.querySelector(".rng"), vl = first.querySelector(".st-val");
        const L = lb.getBoundingClientRect(), N = rn.getBoundingClientRect(),
          V = vl.getBoundingClientRect(), R = first.getBoundingClientRect();
        o.rowH = +R.height.toFixed(2);
        o.track = +N.width.toFixed(2);
        o.trackH = +N.height.toFixed(2);
        o.valW = +V.width.toFixed(2);
        /* the readout's 44px rule is met by its ::after hit area, not its box */
        /* measure the real painted hit area, not an arithmetic guess from the
           inset values — the first version of this computed height+top+bottom
           and so inherited the font's text height, which made the assertion
           pass at 44 locally and fail at 43 on a runner with different fonts.
           That was a real defect in the CSS, not a flaky test: the tap target
           genuinely depended on which fonts the device had. */
        o.valHit = (function () {
          const cs = getComputedStyle(vl, "::after");
          const h = parseFloat(cs.height || "0");
          return h > 0 ? h : (Math.abs(parseFloat(cs.top || "0")) + Math.abs(parseFloat(cs.bottom || "0")) + V.height);
        })();
        o.sameLine = Math.abs(L.top - V.top) < 4;
        o.trackBelow = N.top >= L.bottom - 1;
        o.labelToOwnTrack = +(N.top - L.bottom).toFixed(2);

        /* gap from a track to the NEXT row's label — the gestalt comparison */
        const gaps = [];
        for (let i = 0; i < rows.length - 1; i++) {
          const t = rows[i].querySelector(".rng").getBoundingClientRect();
          const nl = rows[i + 1].querySelector("label").getBoundingClientRect();
          gaps.push(+(nl.top - t.bottom).toFixed(2));
        }
        o.toNextLabel = gaps.length ? Math.min.apply(null, gaps) : null;

        /* E) a non-slider .st-ctl must NOT be given the stacked treatment.
           Still page-scoped and still offsetHeight-filtered: "was this row
           given a line of its own" is a LAYOUT question, and only the mounted
           suite lays out — reading the parked card would report 0 for every
           row and quietly answer nothing. */
        const others = Array.from(document.querySelectorAll("#" + pgId + " .st-ctl:not(.st-slider)"))
          .filter(x => x.offsetHeight > 0);
        o.otherCount = others.length;
        o.otherStacked = others.filter(x => {
          const l = x.querySelector("label");
          return l && getComputedStyle(l).flexBasis === "auto" && getComputedStyle(l).flexGrow === "1";
        }).length;
      });

      /* every slider row in BOTH suites carries the marker. Scoped to the two
         suite CARDS rather than to a page: whether a row wears .st-slider is a
         DOM fact that needs no layout, and both cards are always in the
         document — the active suite's in its page, the other in #stDock. So
         this still counts all 252 rows (99 Meitu + 153 Evoto) in one pass and
         the >100 floor below keeps its original meaning. Splitting it per page
         would have put Meitu's 99 under a threshold nothing about the app
         changed. */
      out.allRng = document.querySelectorAll("#stMuCard input.rng,#stEvCard input.rng").length;
      out.markedRows = document.querySelectorAll("#stMuCard .st-ctl.st-slider,#stEvCard .st-ctl.st-slider").length;
      out.unmarkedWithRng = Array.from(document.querySelectorAll("#stMuCard .st-ctl,#stEvCard .st-ctl"))
        .filter(x => x.querySelector(".rng") && !x.classList.contains("st-slider")).length;
      return out;
    }, SUITES);
    await ctx.close();
  }

  const at = w => byWidth[w] || {};
  /* v4.96: one reading per width PER SUITE PAGE. `each` runs a per-suite
     predicate across both pages at every width so the thresholds below are
     written down exactly once and applied to #pgMeitu and #pgEvoto alike. */
  const su = (w, pg) => (at(w).suites || {})[pg] || {};
  const each = fn => WIDTHS.every(w => SUITES.every(s => fn(su(w, s[0]), w, s[0])));
  const per = fn => SUITES.map(s => s[0].slice(2) + " " +
    WIDTHS.map(w => w + ":" + fn(su(w, s[0]))).join(" ")).join(" | ");

  report("A) the media query actually matches on a touch page — without this the rest is meaningless",
    WIDTHS.every(w => at(w).coarse === true),
    WIDTHS.map(w => w + ":" + at(w).coarse).join(" "));
  report("B) label and readout share line one; the track takes line two full-width",
    each(s => s.sameLine === true && s.trackBelow === true),
    per(s => "same=" + s.sameLine + ",below=" + s.trackBelow));
  report("C) the track is at least 200px at every phone width",
    each(s => s.track >= 200),
    per(s => s.track));
  report("D) a track sits nearer its OWN label than the next row's — the gestalt rule",
    each(s => s.labelToOwnTrack < s.toNextLabel),
    per(s => "own=" + s.labelToOwnTrack + " next=" + s.toNextLabel));
  report("E) only rows that hold a track are restyled, and every such row is marked",
    each(s => s.otherStacked === 0) &&
    WIDTHS.every(w => at(w).unmarkedWithRng === 0 && at(w).markedRows > 100),
    per(s => "others=" + s.otherCount + " stacked=" + s.otherStacked) + " || " +
    WIDTHS.map(w => w + ": marked=" + at(w).markedRows + " missed=" + at(w).unmarkedWithRng).join(" "));
  report("F) the 44px touch minimum still holds on the track and the readout",
    each(s => s.trackH >= 44 && s.valHit >= 44),
    per(s => "track=" + s.trackH + " valHit=" + s.valHit));

  /* G) not an assertion — the cost, printed so it is never a surprise again */
  console.log("      (row height by width: " + per(s => s.rowH) +
    "  — the shipped desktop row is 44px, so this is the price of the track)");

  /* H) the 880 pack's nested scroller is gone — a scroller inside a scroller
     on touch means the outer page steals the gesture at the inner one's ends */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 667 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1300);
    const h = await page.evaluate(() => {
      const g = document.querySelector(".st880-grid");
      if (!g) return { err: "no .st880-grid" };
      const cs = getComputedStyle(g);
      return {
        maxHeight: cs.maxHeight, overflowY: cs.overflowY,
        cols: cs.gridTemplateColumns.split(" ").length,
        colW: cs.gridTemplateColumns.split(" ")[0],
        /* the tile rules the class carries must still apply */
        imgW: (function () { const i = g.querySelector(".pcard img"); return i ? getComputedStyle(i).width : "no tile"; })()
      };
    });
    await ctx.close();
    report("H) the 880 style grid no longer nests a scroller inside the page",
      h.maxHeight === "none" && h.overflowY === "visible" && h.cols === 3,
      h);
  }

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
