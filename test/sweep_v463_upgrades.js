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

   Usage: PORT=8931 node test/sweep_v463_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const WIDTHS = [320, 360, 390, 414];

(async () => {
  const browser = await chromium.launch();
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

    byWidth[w] = await page.evaluate(() => {
      const out = {};
      out.coarse = matchMedia("(pointer:coarse)").matches;
      document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
      document.getElementById("pgStudio").classList.add("on");
      const g = ST.groups.find(g => g.el.querySelectorAll(".st-ctl.st-slider").length >= 3);
      if (!g) return Object.assign(out, { err: "no group with 3 sliders" });
      g.el.className = "grp open";
      const rows = Array.from(g.el.querySelectorAll(".st-ctl.st-slider")).slice(0, 3);

      const first = rows[0];
      const lb = first.querySelector("label"), rn = first.querySelector(".rng"), vl = first.querySelector(".st-val");
      const L = lb.getBoundingClientRect(), N = rn.getBoundingClientRect(),
        V = vl.getBoundingClientRect(), R = first.getBoundingClientRect();
      out.rowH = +R.height.toFixed(2);
      out.track = +N.width.toFixed(2);
      out.trackH = +N.height.toFixed(2);
      out.valW = +V.width.toFixed(2);
      /* the readout's 44px rule is met by its ::after hit area, not its box */
      out.valHit = (function () {
        const cs = getComputedStyle(vl, "::after");
        return Math.abs(parseFloat(cs.top || "0")) + Math.abs(parseFloat(cs.bottom || "0")) + V.height;
      })();
      out.sameLine = Math.abs(L.top - V.top) < 4;
      out.trackBelow = N.top >= L.bottom - 1;
      out.labelToOwnTrack = +(N.top - L.bottom).toFixed(2);

      /* gap from a track to the NEXT row's label — the gestalt comparison */
      const gaps = [];
      for (let i = 0; i < rows.length - 1; i++) {
        const t = rows[i].querySelector(".rng").getBoundingClientRect();
        const nl = rows[i + 1].querySelector("label").getBoundingClientRect();
        gaps.push(+(nl.top - t.bottom).toFixed(2));
      }
      out.toNextLabel = gaps.length ? Math.min.apply(null, gaps) : null;

      /* E) a non-slider .st-ctl must NOT be given the stacked treatment */
      const others = Array.from(document.querySelectorAll("#pgStudio .st-ctl:not(.st-slider)"))
        .filter(x => x.offsetHeight > 0);
      out.otherCount = others.length;
      out.otherStacked = others.filter(x => {
        const l = x.querySelector("label");
        return l && getComputedStyle(l).flexBasis === "auto" && getComputedStyle(l).flexGrow === "1";
      }).length;

      /* every slider row in the whole page carries the marker */
      out.allRng = document.querySelectorAll("#pgStudio input.rng").length;
      out.markedRows = document.querySelectorAll("#pgStudio .st-ctl.st-slider").length;
      out.unmarkedWithRng = Array.from(document.querySelectorAll("#pgStudio .st-ctl"))
        .filter(x => x.querySelector(".rng") && !x.classList.contains("st-slider")).length;
      return out;
    });
    await ctx.close();
  }

  const at = w => byWidth[w] || {};
  report("A) the media query actually matches on a touch page — without this the rest is meaningless",
    WIDTHS.every(w => at(w).coarse === true),
    WIDTHS.map(w => w + ":" + at(w).coarse).join(" "));
  report("B) label and readout share line one; the track takes line two full-width",
    WIDTHS.every(w => at(w).sameLine === true && at(w).trackBelow === true),
    WIDTHS.map(w => w + ":same=" + at(w).sameLine + ",below=" + at(w).trackBelow).join(" "));
  report("C) the track is at least 200px at every phone width",
    WIDTHS.every(w => at(w).track >= 200),
    WIDTHS.map(w => w + ":" + at(w).track).join(" "));
  report("D) a track sits nearer its OWN label than the next row's — the gestalt rule",
    WIDTHS.every(w => at(w).labelToOwnTrack < at(w).toNextLabel),
    WIDTHS.map(w => w + ": own=" + at(w).labelToOwnTrack + " next=" + at(w).toNextLabel).join(" | "));
  report("E) only rows that hold a track are restyled, and every such row is marked",
    WIDTHS.every(w => at(w).otherStacked === 0 && at(w).unmarkedWithRng === 0 && at(w).markedRows > 100),
    WIDTHS.map(w => w + ": others=" + at(w).otherCount + " stacked=" + at(w).otherStacked +
      " marked=" + at(w).markedRows + " missed=" + at(w).unmarkedWithRng).join(" | "));
  report("F) the 44px touch minimum still holds on the track and the readout",
    WIDTHS.every(w => at(w).trackH >= 44 && at(w).valHit >= 44),
    WIDTHS.map(w => w + ": track=" + at(w).trackH + " valHit=" + at(w).valHit).join(" "));

  /* G) not an assertion — the cost, printed so it is never a surprise again */
  console.log("      (row height by width: " +
    WIDTHS.map(w => w + "px=" + at(w).rowH).join(", ") +
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
