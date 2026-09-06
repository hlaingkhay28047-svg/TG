/* Regression test for the bottom-nav grouping. Originally written for
   v4.19.0's Phase 5 (10 flat tabs -> 4 top-level groups); updated for
   v4.27.0's Home + IA re-architecture, which reshapes the groups to
   HOME[pgDash] / WORKFLOWS[pgWf] / EDIT[pgCreate,pgStudio,pgRetouch,pgPath] /
   MEDIA LAB[pgText2Img,pgVideo,pgVideoUp,pgV2V,pgTalk] / LIBRARY[pgLib,pgGallery] and
   demotes Setup (pgHome) from the bar to the header gear button. The Edit
   group gained a 4th page in the v4.28.x wave (pgPath — Path Retouch, the
   batch-look sibling of Retouch), and a 5th in v4.96 when the one Studio
   page split into two real pages: pgMeitu (#stMuCard) and pgEvoto
   (#stEvCard). pgStudio is gone from PAGES entirely — it survives only as a
   legacy id that stNormalizePage() resolves to the last-used suite, which is
   its own assertion below. Every other original page id is unchanged; only
   how you navigate there changed.
   This test exists specifically to catch the failure mode a nav regroup
   is most likely to introduce: a page silently becoming unreachable.
   Usage: PORT=8931 node test/verify_phase5_nav_regroup.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;

// [pageId, expected top-tab label (null = no tab highlights: Setup lives on
//  the header gear since v4.27.0), expected subtab count (null = no subtabs)]
// v4.96: the single ["pgStudio","Edit",4] row became two rows — the Retouch A and
// Retouch B suites are separate pages now — so every Edit page shows 5 subtabs.
// 6.29.0 wave: Imagine (one-tap AI tools) joins Edit after Freeform — six subtabs.
const ALL_PAGES = [
  ["pgDash", "Home", null],
  ["pgWf", "Workflows", null],
  ["pgCreate", "Edit", 6],
  ["pgImagine", "Edit", 6],
  ["pgMeitu", "Edit", 6],
  ["pgEvoto", "Edit", 6],
  ["pgRetouch", "Edit", 6],
  ["pgPath", "Edit", 6],
  /* v6.2.0 — Media Lab gained a fourth page. Every tool that takes a video IN
     and gives a video BACK moved off VidUp onto its own pgV2V, so VidUp is
     Upscale and nothing else; the count here is the whole point of the test,
     so it moves with the group rather than being loosened. */
  /* v6.5.0 — and a fifth: Talking Photo, the one page in the app with an
     AUDIO slot, which is what the lip-sync endpoints require. */
  ["pgText2Img", "Media Lab", 5],
  ["pgVideo", "Media Lab", 5],
  ["pgVideoUp", "Media Lab", 5],
  ["pgV2V", "Media Lab", 5],
  ["pgTalk", "Media Lab", 5],
  ["pgLib", "Library", 2],
  ["pgGallery", "Library", 2],
  ["pgHome", null, null]
];
// the two halves of the old pgStudio — the legacy id must still land on one
const ST_SUITE_PAGES = ["pgMeitu", "pgEvoto"];

(async () => {
  const browser = await chromium.launch();
  /* v5.30 — the app is account + Premium only; without a session every page
     below opens on the login wall instead of the feature under test. */
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const o = document.querySelector(".onb"); if (o) o.classList.remove("on"); });

  const tabbarInfo = await page.evaluate(() => {
    const bar = document.getElementById("tabbar");
    return {
      count: bar.children.length,
      labels: Array.from(bar.children).map(b => b.textContent),
      scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth
    };
  });
  console.log("Top tabbar:", JSON.stringify(tabbarInfo));
  const tabbarOk = tabbarInfo.count === 5 &&
    tabbarInfo.labels.join("|") === "Home|Workflows|Edit|Media Lab|Library" &&
    tabbarInfo.scrollWidth <= tabbarInfo.clientWidth + 2;
  console.log(tabbarOk ? "PASS (exactly 5 top-level tabs in HOME/WORKFLOWS/EDIT/MEDIA LAB/LIBRARY order, no overflow at 390px)" : "FAIL (top tabbar regression)");

  const results = [];
  for (const [pid, expectTopLabel, expectSubCount] of ALL_PAGES) {
    const r = await page.evaluate((pid) => {
      switchPage(pid);
      const pageEl = document.getElementById(pid);
      const bar = document.getElementById("tabbar");
      const activeTop = Array.from(bar.children).filter(b => b.className.indexOf("on") >= 0);
      const sub = document.getElementById("subtabbar");
      const activeSub = Array.from(sub.children).filter(b => b.className.indexOf("on") >= 0);
      const gear = document.getElementById("btnGearSetup");
      return {
        pageVisible: pageEl && getComputedStyle(pageEl).display !== "none",
        activeTopCount: activeTop.length,
        activeTopText: activeTop[0] ? activeTop[0].textContent : null,
        subVisible: sub.classList.contains("on"),
        subCount: sub.children.length,
        activeSubCount: activeSub.length,
        gearOn: gear ? gear.className.indexOf("on") >= 0 : false
      };
    }, pid);
    results.push({ pid, expectTopLabel, expectSubCount, ...r });
  }
  console.log("Full " + ALL_PAGES.length + "-page reachability sweep:", JSON.stringify(results));

  let allOk = true;
  for (const r of results) {
    const wantSub = r.expectSubCount !== null;
    let ok;
    if (r.expectTopLabel === null) {
      // Setup: page shows, NO bar tab highlights, the header gear does instead
      ok = r.pageVisible && r.activeTopCount === 0 && !r.subVisible && r.gearOn;
    } else {
      ok = r.pageVisible && r.activeTopCount === 1 && r.activeTopText.indexOf(r.expectTopLabel) >= 0 &&
        (wantSub ? (r.subVisible && r.subCount === r.expectSubCount && r.activeSubCount === 1) : !r.subVisible) &&
        !r.gearOn;
    }
    if (!ok) { allOk = false; console.log("MISMATCH for", r.pid, JSON.stringify(r)); }
  }
  // page count is derived, not hardcoded — it was already stale at 11 once
  console.log(allOk ? "PASS (all " + ALL_PAGES.length + " pages reachable; correct top+sub tab — or gear, for Setup — highlighted for each)" : "FAIL (page reachability regression)");

  // v4.96 replaced the old ["pgStudio","Edit",4] sweep row. pgStudio can no
  // longer be asserted as a page — it isn't one — but the id is still baked
  // into returning users' saved page and their bookmarks, so the thing that
  // must not silently become unreachable is now "switchPage('pgStudio')
  // lands on a live suite page", exactly as strictly as the old row asserted
  // it landed on pgStudio itself.
  const legacyStudio = await page.evaluate(() => {
    switchPage("pgStudio");
    const bar = document.getElementById("tabbar");
    const activeTop = Array.from(bar.children).filter(b => b.className.indexOf("on") >= 0);
    const sub = document.getElementById("subtabbar");
    const activeSub = Array.from(sub.children).filter(b => b.className.indexOf("on") >= 0);
    const landed = ["pgMeitu", "pgEvoto"].find(p => {
      const el = document.getElementById(p);
      return el && el.className.indexOf("on") >= 0;
    }) || null;
    return {
      landed,
      studioStillAPage: !!document.getElementById("pgStudio"),
      pageVisible: landed ? getComputedStyle(document.getElementById(landed)).display !== "none" : false,
      activeTopCount: activeTop.length,
      activeTopText: activeTop[0] ? activeTop[0].textContent : null,
      subVisible: sub.classList.contains("on"),
      subCount: sub.children.length,
      activeSubCount: activeSub.length
    };
  });
  console.log("Legacy pgStudio id resolves to:", JSON.stringify(legacyStudio));
  const legacyOk = ST_SUITE_PAGES.indexOf(legacyStudio.landed) >= 0 && !legacyStudio.studioStillAPage &&
    legacyStudio.pageVisible && legacyStudio.activeTopCount === 1 &&
    legacyStudio.activeTopText.indexOf("Edit") >= 0 &&
    legacyStudio.subVisible && legacyStudio.subCount === 6 && legacyStudio.activeSubCount === 1;   /* 6.29.0 wave: Imagine joined Edit */
  console.log(legacyOk ? "PASS (legacy pgStudio deep link still reaches a live suite page under Edit)" : "FAIL (legacy pgStudio id became a dead end)");

  // clicking a top-tab returns to the last-visited page within that group,
  // not always the first — a real usability regression if lost. Exercise it
  // on BOTH halves of the old Create group split (Media Lab and Edit).
  await page.evaluate(() => switchPage("pgVideo"));
  await page.waitForTimeout(100);
  const stillOnVideo = await page.evaluate(() => {
    const bar = document.getElementById("tabbar");
    switchPage("pgDash");
    const mediaBtn = Array.from(bar.children).find(b => b.textContent.indexOf("Media Lab") >= 0);
    mediaBtn.click();
    return document.getElementById("pgVideo").className.indexOf("on") >= 0;
  });
  console.log("Media Lab top-tab click after being on Video returns to Video:", stillOnVideo);
  console.log(stillOnVideo ? "PASS (last-visited-page-in-group memory works for Media Lab)" : "FAIL (group re-entry regression)");

  // v4.96: this used to be one check on pgStudio. Split per rule — Studio is
  // two pages now, and Edit's group memory has to bring you back to the exact
  // suite you left, not merely "a studio page", so each suite gets the same
  // check at the same strictness.
  const stillOnSuite = {};
  for (const suite of ST_SUITE_PAGES) {
    stillOnSuite[suite] = await page.evaluate((suite) => {
      const bar = document.getElementById("tabbar");
      switchPage(suite);
      switchPage("pgDash");
      const editBtn = Array.from(bar.children).find(b => b.textContent.indexOf("Edit") >= 0);
      editBtn.click();
      return document.getElementById(suite).className.indexOf("on") >= 0;
    }, suite);
    console.log("Edit top-tab click after being on " + suite + " returns to " + suite + ":", stillOnSuite[suite]);
  }
  const editMemOk = ST_SUITE_PAGES.every(p => stillOnSuite[p]);
  console.log(editMemOk ? "PASS (last-visited-page-in-group memory works for Edit, both suites)" : "FAIL (group re-entry regression)");

  const overall = tabbarOk && allOk && legacyOk && stillOnVideo && editMemOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
