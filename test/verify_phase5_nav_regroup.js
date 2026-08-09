/* Regression test for v4.19.0's UI/UX audit Phase 5: the highest-risk
   phase — regrouping the flat 10-tab bottom nav into 4 top-level tabs
   (Workflow / Create / Library / Setup), each holding its related pages
   as second-level .subtabbar entries (Create: Freeform/Studio/Retouch/
   Text→Img/Video/VidUp — 6; Library: Reference/Gallery — 2). Every
   original page id is unchanged; only how you navigate there changed.
   This test exists specifically to catch the failure mode a nav regroup
   is most likely to introduce: a page silently becoming unreachable.
   Usage: PORT=8931 node test/verify_phase5_nav_regroup.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

const ALL_PAGES = [
  ["pgWf", "Workflow", null],
  ["pgCreate", "Create", 6],
  ["pgStudio", "Create", 6],
  ["pgRetouch", "Create", 6],
  ["pgText2Img", "Create", 6],
  ["pgVideo", "Create", 6],
  ["pgVideoUp", "Create", 6],
  ["pgLib", "Library", 2],
  ["pgGallery", "Library", 2],
  ["pgHome", "Setup", null]
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
    return { count: bar.children.length, scrollWidth: bar.scrollWidth, clientWidth: bar.clientWidth };
  });
  console.log("Top tabbar:", JSON.stringify(tabbarInfo));
  const tabbarOk = tabbarInfo.count === 4 && tabbarInfo.scrollWidth <= tabbarInfo.clientWidth + 2;
  console.log(tabbarOk ? "PASS (exactly 4 top-level tabs, no overflow at 390px)" : "FAIL (top tabbar regression)");

  const results = [];
  for (const [pid, expectTopLabel, expectSubCount] of ALL_PAGES) {
    const r = await page.evaluate((pid) => {
      switchPage(pid);
      const pageEl = document.getElementById(pid);
      const bar = document.getElementById("tabbar");
      const activeTop = Array.from(bar.children).filter(b => b.className.indexOf("on") >= 0);
      const sub = document.getElementById("subtabbar");
      const activeSub = Array.from(sub.children).filter(b => b.className.indexOf("on") >= 0);
      return {
        pageVisible: pageEl && getComputedStyle(pageEl).display !== "none",
        activeTopCount: activeTop.length,
        activeTopText: activeTop[0] ? activeTop[0].textContent : null,
        subVisible: sub.classList.contains("on"),
        subCount: sub.children.length,
        activeSubCount: activeSub.length
      };
    }, pid);
    results.push({ pid, expectTopLabel, expectSubCount, ...r });
  }
  console.log("Full 10-page reachability sweep:", JSON.stringify(results));

  let allOk = true;
  for (const r of results) {
    const wantSub = r.expectSubCount !== null;
    const ok = r.pageVisible && r.activeTopCount === 1 && r.activeTopText.indexOf(r.expectTopLabel) >= 0 &&
      (wantSub ? (r.subVisible && r.subCount === r.expectSubCount && r.activeSubCount === 1) : !r.subVisible);
    if (!ok) { allOk = false; console.log("MISMATCH for", r.pid, JSON.stringify(r)); }
  }
  console.log(allOk ? "PASS (all 10 original pages reachable; correct top+sub tab highlighted for each)" : "FAIL (page reachability regression)");

  // clicking a top-tab returns to the last-visited page within that group,
  // not always the first — a real usability regression if lost
  await page.evaluate(() => switchPage("pgVideo"));
  await page.waitForTimeout(100);
  const stillOnVideo = await page.evaluate(() => {
    const bar = document.getElementById("tabbar");
    const createBtn = Array.from(bar.children).find(b => b.textContent.indexOf("Create") >= 0);
    createBtn.click();
    return document.getElementById("pgVideo").className.indexOf("on") >= 0;
  });
  console.log("Create top-tab click after being on Video returns to Video:", stillOnVideo);
  console.log(stillOnVideo ? "PASS (last-visited-page-in-group memory works)" : "FAIL (group re-entry regression)");

  const overall = tabbarOk && allOk && stillOnVideo;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
