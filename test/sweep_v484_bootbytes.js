/* v4.84.0 regression sweep — a launch pays only for the page it opens.

   WHAT WAS MEASURED. A returning customer whose last page was pgWf (Workflows,
   the ordinary case) fetched 38 images totalling 1,513,089 bytes before doing
   anything. Attributing them by destination:

     116 workflow cards      only the open group's 7 arrive — loading="lazy"
     6 Home tiles            0 bytes — loading="lazy", page is display:none
     10 Featured thumbnails  0 bytes — loading="lazy"
     12 Path look chips      206,180 bytes  ON A PAGE NOT OPENED
     16 Studio look photos   ~181,000 bytes ON A PAGE NOT OPENED
     1 Studio base sample    65,660 bytes   ON A PAGE NOT OPENED

   AND THE MEASUREMENT CORRECTED THE DIAGNOSIS, which is the reason this file
   exists. The first version of this fix deferred building the Home tiles,
   on the theory that loading="lazy" cannot help an <img> inside a
   display:none page because it has no layout box. Measuring the before-state
   killed that theory: the Home tiles cost nothing at boot precisely BECAUSE
   they carry loading="lazy", and Chrome does defer them. The look chips cost
   206KB because they were the only <img> in the app that had been left
   without it. The 30-line deferral came out and one line went in.

   That leaves the Studio shelf, which genuinely cannot use the attribute: it
   paints into a <canvas>, so its photographs arrive through `new Image()`, and
   a scripted Image fetches the instant its src is set no matter where its page
   is. Those needed an explicit gate — stArtWake(), opened by an
   IntersectionObserver on pgStudio. See G2 for why it is not switchPage.

   Result: 9 image requests, 1,060,159 bytes. 29 fewer requests, 452,930 fewer
   bytes, on every launch, on a Myanmar mobile-data plan.

   Pinned contracts:
   A) Boot on pgWf fetches nothing from /lib/looks/, /lib/wf/lookchips/,
      /lib/dash/, and does not fetch st-sample.jpg.
   B) Boot on pgWf stays under a byte ceiling — a floor-style budget, so this
      fails when a future release quietly re-eagers something, and does NOT
      fail merely because the app got better.
   C) Opening pgPath delivers all twelve look chips, decoded, in the rail.
   D) Opening pgStudio delivers the sample and all sixteen look photographs,
      and the shelf paints sixteen tiles.
   E) Re-entering pgStudio fetches NOTHING again — the gate is one-shot, not a
      re-download every time the customer walks back to the page.
   F) Landing DIRECTLY on a deferred page still delivers its art. This is the
      assertion that would have caught a gate that defers for ever.
   G) The look-chip <img> carries loading="lazy" in the source — the one line
      the whole 206KB turned on.
   H) No page errors anywhere in the walk.

   Usage: PORT=8931 node test/sweep_v484_bootbytes.js  (serve docs/app first) */
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

/* ---- G) the one line, in the source ---- */
const railImg = src.match(/var im=document\.createElement\("img"\); im\.alt="";[^\n]*/);
report("G) the Path look-chip <img> is created with loading=\"lazy\"",
  !!railImg && /im\.loading="lazy"/.test(railImg[0]),
  { line: railImg ? railImg[0].slice(0, 120) : null });

/* The Studio shelf cannot use the attribute, so it owns an explicit gate — and
   WHAT OPENS THAT GATE is pinned here, because the first version got it wrong
   in a way only the battery caught. It woke on switchPage("pgStudio"), which
   sweep_v470 and sweep_v473 walk straight past: they show the page by setting
   .on directly. A gate tied to one navigation function is silently bypassable
   by every other route into the page. An IntersectionObserver watches the
   thing that actually matters instead — the page having a box on screen — and
   no caller can miss it.

   It observes the PAGE, not the preset row, and that distinction is pinned
   because it is a real behaviour difference, not a detail: the row sits 1110px
   down a 4395px page, so a row-level observer would show a customer computed
   tiles on arrival and swap them for photographs a second later when they
   scrolled. The saving is "do not pay for a page you never open", not "do not
   pay for a section you have not scrolled to".

   The fallback is asserted too: no IntersectionObserver must mean "load it
   anyway", never "blank shelf". A deferral that can fail closed is worse than
   the bytes it saves. */
report("G2) the shelf's art wakes from an IntersectionObserver on the Studio page",
  /function stArtWake\(\)/.test(src) &&
  /new IntersectionObserver\(/.test(src) &&
  /io\.observe\(pg\)/.test(src) &&
  /typeof IntersectionObserver!=="function"\)\{ stArtWake\(\); return; \}/.test(src),
  { hasFn: /function stArtWake\(\)/.test(src),
    hasIO: /new IntersectionObserver\(/.test(src),
    hasFallback: /typeof IntersectionObserver!=="function"\)\{ stArtWake\(\); return; \}/.test(src) });

report("G3) nothing ties the wake to a single navigation function",
  !/id==="pgStudio"\s*&&\s*typeof stArtWake/.test(src));

/* Boot byte ceiling. Measured at 1,060,159 with 9 requests; the ceiling is set
   above it with room for one more open workflow group, because this must fail
   on a REGRESSION, not on the library growing. A ceiling pinned to the exact
   measured number is the "pinned state, not contract" mistake. */
const BYTE_CEILING = 1350000;
const REQ_CEILING = 14;

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);

  async function session(seedPage, walk) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const req = [], errs = [];
    page.on("response", r => {
      try { req.push({ u: new URL(r.url()).pathname, n: +(r.headers()["content-length"] || 0) }); } catch (e) {}
    });
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript((pg) => {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_ws_seen", "1");
      if (pg) localStorage.setItem("hnk_web_studio_page", pg);
    }, seedPage);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    const count = s => req.filter(r => r.u.indexOf(s) >= 0).length;
    const imgs = () => req.filter(r => /\.(jpg|png)$/.test(r.u));
    const out = { req, count, imgs, page, errs };
    if (walk) await walk(out);
    return out;
  }

  /* ---- A + B) the ordinary launch ---- */
  const boot = await session("pgWf");
  const bootImgs = boot.imgs();
  const bootBytes = bootImgs.reduce((a, x) => a + x.n, 0);

  report("A) boot on pgWf fetches nothing belonging to a page it did not open",
    boot.count("/lib/looks/") === 0 &&
    boot.count("/lib/wf/lookchips/") === 0 &&
    boot.count("/lib/dash/") === 0 &&
    boot.count("st-sample") === 0,
    { looks: boot.count("/lib/looks/"), chips: boot.count("/lib/wf/lookchips/"),
      dash: boot.count("/lib/dash/"), sample: boot.count("st-sample") });

  report("B) boot image payload stays inside its budget",
    bootBytes <= BYTE_CEILING && bootImgs.length <= REQ_CEILING,
    { bytes: bootBytes, ceiling: BYTE_CEILING, requests: bootImgs.length, reqCeiling: REQ_CEILING });

  /* ---- C + D + E) the art arrives when the page does, once ---- */
  await boot.page.evaluate(async () => { switchPage("pgPath"); await new Promise(r => setTimeout(r, 1800)); });
  await boot.page.waitForTimeout(1200);
  const railImgs = await boot.page.evaluate(() =>
    [...document.querySelectorAll("#ptLookRail img")].filter(i => i.naturalWidth > 0).length);
  report("C) opening pgPath delivers all twelve look chips, decoded",
    boot.count("/lib/wf/lookchips/") === 12 && railImgs === 12,
    { fetched: boot.count("/lib/wf/lookchips/"), decoded: railImgs });

  await boot.page.evaluate(async () => { switchPage("pgStudio"); await new Promise(r => setTimeout(r, 2500)); });
  await boot.page.waitForTimeout(1500);
  const st = await boot.page.evaluate(() => ({
    tiles: document.querySelectorAll("#muPresetRow canvas,#evPresetRow canvas").length,
    decoded: Object.keys(ST_LOOK_ART).filter(k => ST_LOOK_ART[k] && ST_LOOK_ART[k].nodeName).length
  }));
  const looksAfter = boot.count("/lib/looks/"), sampleAfter = boot.count("st-sample");
  report("D) opening pgStudio delivers the sample and all sixteen look photographs",
    looksAfter === 16 && sampleAfter === 1 && st.tiles === 16 && st.decoded === 16,
    { looks: looksAfter, sample: sampleAfter, ...st });

  await boot.page.evaluate(async () => {
    switchPage("pgWf"); await new Promise(r => setTimeout(r, 400));
    switchPage("pgStudio"); await new Promise(r => setTimeout(r, 1200));
  });
  await boot.page.waitForTimeout(800);
  report("E) re-entering pgStudio fetches nothing a second time",
    boot.count("/lib/looks/") === looksAfter && boot.count("st-sample") === sampleAfter,
    { looksBefore: looksAfter, looksNow: boot.count("/lib/looks/"),
      sampleBefore: sampleAfter, sampleNow: boot.count("st-sample") });

  /* ---- F) landing DIRECTLY on a deferred page ---- */
  const direct = [];
  for (const seed of ["pgStudio", "pgPath", "pgDash", null]) {
    const s = await session(seed);
    direct.push({
      seed: seed || "(first ever)",
      onPage: await s.page.evaluate(() => curPage),
      looks: s.count("/lib/looks/"), sample: s.count("st-sample"),
      chips: s.count("/lib/wf/lookchips/"), dash: s.count("/lib/dash/"),
      railImgs: await s.page.evaluate(() =>
        [...document.querySelectorAll("#ptLookRail img")].filter(i => i.naturalWidth > 0).length),
      stDecoded: await s.page.evaluate(() =>
        Object.keys(ST_LOOK_ART).filter(k => ST_LOOK_ART[k] && ST_LOOK_ART[k].nodeName).length),
      errs: s.errs
    });
  }
  const dStudio = direct[0], dPath = direct[1], dDash = direct[2], dFirst = direct[3];
  report("F) landing straight on pgStudio still gets the whole shelf",
    dStudio.looks === 16 && dStudio.sample === 1 && dStudio.stDecoded === 16 &&
    dStudio.chips === 0, dStudio);
  report("F2) landing straight on pgPath still gets all twelve chips",
    dPath.chips === 12 && dPath.railImgs === 12 && dPath.looks === 0, dPath);
  report("F3) landing straight on pgDash gets its six tiles and nothing else",
    dDash.dash === 6 && dDash.looks === 0 && dDash.chips === 0, dDash);
  report("F4) a first-ever launch lands on Home and pays for Home only",
    dFirst.onPage === "pgDash" && dFirst.dash === 6 &&
    dFirst.looks === 0 && dFirst.chips === 0, dFirst);

  /* ---- H ---- */
  const allErrs = boot.errs.concat(...direct.map(d => d.errs));
  report("H) no page errors anywhere in the walk", allErrs.length === 0, allErrs);

  console.log("      (before: 38 image requests / 1,513,089 B on a pgWf launch — " +
    "after: " + bootImgs.length + " / " + bootBytes.toLocaleString("en-US") + " B)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
