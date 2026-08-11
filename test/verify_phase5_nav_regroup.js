/* Regression test for the bottom-nav grouping. Originally written for
   v4.19.0's Phase 5 (10 flat tabs -> 4 top-level groups); updated for
   v4.27.0's Home + IA re-architecture, which reshapes the groups to
   HOME[pgDash] / WORKFLOWS[pgWf] / EDIT[pgCreate,pgStudio,pgRetouch] /
   MEDIA LAB[pgText2Img,pgVideo,pgVideoUp] / LIBRARY[pgLib,pgGallery] and
   demotes Setup (pgHome) from the bar to the header gear button. Every
   original page id is unchanged; only how you navigate there changed.
   This test exists specifically to catch the failure mode a nav regroup
   is most likely to introduce: a page silently becoming unreachable.
   Usage: PORT=8931 node test/verify_phase5_nav_regroup.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

// [pageId, expected top-tab label (null = no tab highlights: Setup lives on
//  the header gear since v4.27.0), expected subtab count (null = no subtabs)]
const ALL_PAGES = [
  ["pgDash", "Home", null],
  ["pgWf", "Workflows", null],
  ["pgCreate", "Edit", 3],
  ["pgStudio", "Edit", 3],
  ["pgRetouch", "Edit", 3],
  ["pgText2Img", "Media Lab", 3],
  ["pgVideo", "Media Lab", 3],
  ["pgVideoUp", "Media Lab", 3],
  ["pgLib", "Library", 2],
  ["pgGallery", "Library", 2],
  ["pgHome", null, null]
];

(async () => {
  const browser = await chromium.launch();
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
  console.log("Full 11-page reachability sweep:", JSON.stringify(results));

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
  console.log(allOk ? "PASS (all 11 pages reachable; correct top+sub tab — or gear, for Setup — highlighted for each)" : "FAIL (page reachability regression)");

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

  const stillOnStudio = await page.evaluate(() => {
    const bar = document.getElementById("tabbar");
    switchPage("pgStudio");
    switchPage("pgDash");
    const editBtn = Array.from(bar.children).find(b => b.textContent.indexOf("Edit") >= 0);
    editBtn.click();
    return document.getElementById("pgStudio").className.indexOf("on") >= 0;
  });
  console.log("Edit top-tab click after being on Studio returns to Studio:", stillOnStudio);
  console.log(stillOnStudio ? "PASS (last-visited-page-in-group memory works for Edit)" : "FAIL (group re-entry regression)");

  const overall = tabbarOk && allOk && stillOnVideo && stillOnStudio;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
