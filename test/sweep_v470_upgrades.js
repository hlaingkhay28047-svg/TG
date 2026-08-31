/* v4.70.0 regression sweep — the look tiles get the phone's real pixels.

   WHAT THE OWNER SAW. On the Retouch A/Retouch B shelves the "Soft Film" tile rendered
   with a coarse regular polka-dot pattern across the whole face — the owner's
   phone showed it looking diseased — and every other tile looked soft next to
   the rest of the app. The reasonable assumption was bad artwork, and the
   request that arrived was for new photographs to replace it.

   IT WAS NOT THE ARTWORK. Every tile is a CANVAS, and a canvas does not get the
   screen's pixels for free: cv.width/height were hard-coded 76x96 on every
   device. Measured on a 390x844 viewport at devicePixelRatio 3, the browser was
   painting those 76x96 real pixels across 228x288 device pixels. Everything
   arrived at a third of the resolution it was displayed at, and stTileFx's
   grain dither — authored as 1px dots — landed as 3x3 blocks. Rendered at DPR 1
   the identical code reads as fine grain. No new photograph could have fixed
   this; the source art was never the problem.

   Pinned contracts:
   A) The backing store scales with devicePixelRatio: 76*DPR x 96*DPR.
   B) THE LAYOUT DOES NOT MOVE. The CSS box stays exactly 76x96 at every DPR,
      which is what makes (A) safe to ship — more pixels, same shelf.
   C) THE TILE IS NOT A 76px IMAGE IN A 228px BOX. Round-trip the rendered tile
      through a 76x96 downscale and back: if the canvas were merely an upscaled
      76px render, that trip would be nearly lossless. Measured, it must lose
      real detail — that is the proof the extra pixels carry real information
      rather than a bigger canvas holding the same blocky picture.
   D) THE GRAIN IS STILL THERE. Removing the blocks must not have removed the
      effect: Soft Film (grn:15) must still differ measurably from a look with
      no grain at all.
   E) The smoothing hint scales with the backing store, so a heavily smoothed
      look does not come out SHARPER on a retina phone than on a laptop — the
      one place where more resolution would otherwise mean less effect.
   F) Both shelves still render all 8 tiles, at every DPR, with no page errors.

   v4.96 note: the two shelves no longer share a page. Retouch A and Retouch B are
   #pgMeitu and #pgEvoto now, and only the ACTIVE suite's card sits in the shown
   page — the other one, plus the shared #stCols block, is parked in the hidden
   #stDock where everything measures 0x0. Every claim above is unchanged and
   every threshold is unchanged; the shelves are simply measured one page visit
   each instead of both in one view. See the comment at the visit loop.

   Usage: PORT=8931 node test/sweep_v470_upgrades.js  (serve docs/app first) */
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

const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

report("E) the smoothing blur radius is multiplied by the device pixel ratio",
  /blur\("\+\(0\.6\*dpr\)\.toFixed\(2\)\+"px\)"/.test(src));
report("E2) the tile DPR is clamped, so a 4x display cannot quadruple the paint cost",
  /Math\.max\(1, Math\.min\(3, d\|\|1\)\)/.test(src));

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const pageErrors = [];
  const byDpr = {};

  for (const dpr of [1, 2, 3]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true
    });
    const page = await ctx.newPage();
    page.on("pageerror", e => pageErrors.push(dpr + "x " + String(e).slice(0, 160)));
    await page.addInitScript(() => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);

    /* v4.96 — this used to reveal the shelf by hand: `.on` straight onto
       #pgStudio, both suite cards visible in the one page view. That page is
       gone, and hand-revealing #pgMeitu shows an EMPTY page: the shared #stCols
       block and the suite cards only leave #stDock inside stMountSuite(), which
       is reached through switchPage(). So each shelf is now measured while its
       own page is the mounted one — same rows, same numbers, two visits.

       Retouch A is visited FIRST on purpose. stArtWatch arms its IntersectionObserver
       on stActivePage(), which is #pgMeitu on fresh storage, so that visit is
       what wakes the look art and the sample photo the tiles are painted from.
       Land on Retouch B without it and both shelves stay on the gradient placeholder
       — smooth by construction, so C and D would be measuring nothing. */
    const measureRow = id => {
      const h = document.getElementById(id);
      if (!h) return { id, cards: 0 };
      const cards = Array.from(h.querySelectorAll(".pcard"));
      const cv = cards.length ? cards[0].querySelector("canvas") : null;
      const r = cv ? cv.getBoundingClientRect() : null;
      return {
        id, cards: cards.length,
        backing: cv ? cv.width + "x" + cv.height : null,
        cssBox: r ? Math.round(r.width) + "x" + Math.round(r.height) : null
      };
    };
    const showSuite = async pageId => {
      await page.evaluate(p => { switchPage(p); window.scrollTo(0, 0); }, pageId);
      await page.waitForTimeout(1400);
    };
    await showSuite("pgMeitu");
    const muRow = await page.evaluate(measureRow, "muPresetRow");
    await showSuite("pgEvoto");
    const evRow = await page.evaluate(measureRow, "evPresetRow");

    /* the pixel work below is all Retouch B tiles (Soft Film vs Natural Pro), so it
       runs while #pgEvoto is the mounted page */
    byDpr[dpr] = await page.evaluate(rows => {
      const out = { dpr: devicePixelRatio, rows };

      /* Find the tiles by their label so this does not silently measure the
         wrong look if the shelf is ever reordered. */
      function tileByName(rowId, name) {
        const h = document.getElementById(rowId);
        if (!h) return null;
        const c = Array.from(h.querySelectorAll(".pcard"))
          .filter(x => (x.title || "").indexOf(name) >= 0)[0];
        return c ? c.querySelector("canvas") : null;
      }
      const soft = tileByName("evPresetRow", "Soft Film");
      const clean = tileByName("evPresetRow", "Natural Pro");
      out.foundSoft = !!soft; out.foundClean = !!clean;

      function pixels(cv) {
        const c = document.createElement("canvas");
        c.width = cv.width; c.height = cv.height;
        c.getContext("2d").drawImage(cv, 0, 0);
        return c.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      }
      function meanAbs(a, b) {
        let s = 0, n = 0;
        for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]); n++; }
        return n ? s / n : 0;
      }

      if (soft) {
        /* C) round-trip through a 76x96 intermediate. A canvas that is really
              just a 76px render blown up loses almost nothing here. */
        const small = document.createElement("canvas");
        small.width = 76; small.height = 96;
        small.getContext("2d").drawImage(soft, 0, 0, 76, 96);
        const back = document.createElement("canvas");
        back.width = soft.width; back.height = soft.height;
        const bx = back.getContext("2d");
        bx.imageSmoothingEnabled = false;
        bx.drawImage(small, 0, 0, soft.width, soft.height);
        out.roundTripLoss = +meanAbs(pixels(soft), bx.getImageData(0, 0, back.width, back.height).data).toFixed(3);
        out.softBacking = soft.width + "x" + soft.height;
      }
      if (soft && clean && soft.width === clean.width) {
        /* D) the grain still separates Soft Film from a grain-free look */
        out.grainDelta = +meanAbs(pixels(soft), pixels(clean)).toFixed(3);
      }
      return out;
    }, [muRow, evRow]);
    await ctx.close();
  }

  const at = d => byDpr[d] || {};
  const DS = [1, 2, 3];

  report("A) the tile backing store scales with devicePixelRatio (76*DPR x 96*DPR)",
    DS.every(d => (at(d).rows || []).every(r => r.backing === (76 * d) + "x" + (96 * d))),
    DS.map(d => d + "x:" + JSON.stringify((at(d).rows || []).map(r => r.backing))).join(" | "));

  report("B) the CSS box stays exactly 76x96 at every DPR — the shelf does not move",
    DS.every(d => (at(d).rows || []).every(r => r.cssBox === "76x96")),
    DS.map(d => d + "x:" + JSON.stringify((at(d).rows || []).map(r => r.cssBox))).join(" | "));

  /* At DPR 1 the round trip IS lossless by definition — the canvas is 76x96, so
     there is nothing to lose. The claim only has content above 1x, which is
     exactly where the bug lived. A blocky 3x canvas scores near 0 here; a
     genuinely 3x-rendered one scores well clear of it. */
  const LOSS_FLOOR = 1.0;
  report("C) above 1x the tile carries real sub-block detail, not a blown-up 76px render",
    [2, 3].every(d => at(d).roundTripLoss > LOSS_FLOOR),
    DS.map(d => d + "x: loss=" + at(d).roundTripLoss + " backing=" + at(d).softBacking).join(" | "));

  report("D) the grain survives the fix — Soft Film still separates from a grain-free look",
    DS.every(d => at(d).grainDelta > 3),
    DS.map(d => d + "x: delta=" + at(d).grainDelta).join(" | "));

  report("F) both shelves render all 8 tiles at every DPR",
    DS.every(d => (at(d).rows || []).length === 2 && at(d).rows.every(r => r.cards === 8) &&
      at(d).foundSoft && at(d).foundClean),
    DS.map(d => d + "x:" + JSON.stringify((at(d).rows || []).map(r => r.cards))).join(" "));

  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("      (at DPR 3 the shelf now paints 228x288 real pixels per tile where it " +
    "painted 76x96 before — same 76x96 CSS box, 9x the information)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
