/* Regression test for a real bug found via manual phone testing after
   v4.14.0 added a 10th bottom-tab-bar item (Retouch): the tab bar used
   flex:1 with no overflow handling, so on a real phone width the tabs
   overflowed the viewport and pushed "Setup" (which holds the user's
   saved Gemini/RunningHub API keys) completely off-screen with no way to
   reach it — visually indistinguishable from "my settings disappeared".
   v4.15.1 fixed it by letting .tabbar scroll horizontally. v4.19.0's
   Phase 5 nav regroup (10 flat tabs -> 4 top-level tabs, each holding
   its pages as second-level .subtabbar entries) fixes the same class of
   bug more fundamentally: 4 short tabs fit a real phone width without
   ever needing to scroll, so the original failure mode can't recur. The
   horizontal-scroll fallback stays in the CSS as a safety net (and is
   exercised for real by the 6-item Create .subtabbar), but the primary
   nav no longer depends on it.
   Usage: PORT=8931 node test/verify_tabbar_reachable.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  // a narrow real-phone width (iPhone 12/13/14-class) is what actually
  // exposed the bug — a wide desktop viewport would never overflow
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const overflowResult = await page.evaluate(() => {
    const bar = document.getElementById("tabbar");
    const cs = getComputedStyle(bar);
    return {
      tabCount: bar.children.length,
      scrollWidth: bar.scrollWidth,
      clientWidth: bar.clientWidth,
      overflowsAtThisWidth: bar.scrollWidth > bar.clientWidth,
      canScroll: cs.overflowX === "auto" || cs.overflowX === "scroll"
    };
  });
  console.log("tabbar overflow:", JSON.stringify(overflowResult));
  const overflowOk = overflowResult.tabCount === 4 && !overflowResult.overflowsAtThisWidth && overflowResult.canScroll;
  console.log(overflowOk ? "PASS (4 top-level tabs fit a real phone width with no overflow; scroll fallback still present)" : "FAIL (top tab bar regression)");

  const reachResult = await page.evaluate(() => {
    switchPage("pgHome");
    return new Promise(resolve => {
      setTimeout(() => {
        const bar = document.getElementById("tabbar");
        const active = Array.from(bar.children).find(b => b.className.indexOf("on") >= 0);
        const barRect = bar.getBoundingClientRect();
        const btnRect = active.getBoundingClientRect();
        resolve({
          isSetupTab: /Setup/.test(active.textContent),
          fullyVisible: btnRect.left >= barRect.left - 1 && btnRect.right <= barRect.right + 1,
          apiKeyFieldPresent: !!document.getElementById("apiKey")
        });
      }, 500); // let the smooth scrollIntoView finish
    });
  });
  console.log("Setup reachability after switchPage:", JSON.stringify(reachResult));
  const reachOk = reachResult.isSetupTab && reachResult.fullyVisible && reachResult.apiKeyFieldPresent;
  console.log(reachOk ? "PASS (switching to Setup scrolls its tab fully into view)" : "FAIL (Setup tab reachability)");

  const overall = overflowOk && reachOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
