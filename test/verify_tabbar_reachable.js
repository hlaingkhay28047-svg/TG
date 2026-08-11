/* Regression test for a real bug found via manual phone testing after
   v4.14.0 added a 10th bottom-tab-bar item (Retouch): the tab bar used
   flex:1 with no overflow handling, so on a real phone width the tabs
   overflowed the viewport and pushed "Setup" (which holds the user's
   saved Gemini/RunningHub API keys) completely off-screen with no way to
   reach it — visually indistinguishable from "my settings disappeared".
   v4.15.1 fixed it by letting .tabbar scroll horizontally. v4.19.0's
   Phase 5 nav regroup fixed the same class of bug more fundamentally
   with few, short top-level tabs. v4.27.0 reshapes the bar to 5 groups
   (Home/Workflows/Edit/Media Lab/Library) and moves Setup off the bar
   entirely, onto a permanent header gear button — which must therefore
   now carry the same guarantee: the user's saved keys are ALWAYS one
   visible, adequately-sized tap away, at every viewport width. The
   horizontal-scroll fallback stays in the CSS as a safety net.
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
  const overflowOk = overflowResult.tabCount === 5 && !overflowResult.overflowsAtThisWidth && overflowResult.canScroll;
  console.log(overflowOk ? "PASS (5 top-level tabs fit a real phone width with no overflow; scroll fallback still present)" : "FAIL (top tab bar regression)");

  // Setup left the tab bar in v4.27.0 — the header gear button is now the
  // only always-visible route to the user's saved API keys, so it gets the
  // same scrutiny the Setup tab used to: present, visible, 44px target,
  // labelled for assistive tech, and actually routing to the key fields.
  const gearResult = await page.evaluate(() => {
    const gear = document.getElementById("btnGearSetup");
    if (!gear) return { present: false };
    const r = gear.getBoundingClientRect();
    const vis = r.width > 0 && r.height > 0 &&
      r.left >= 0 && r.right <= document.documentElement.clientWidth;
    gear.click();
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          present: true,
          visible: vis,
          bigEnough: r.width >= 44 && r.height >= 44,
          ariaLabel: gear.getAttribute("aria-label") || "",
          onSetup: document.getElementById("pgHome").className.indexOf("on") >= 0,
          gearHighlighted: gear.className.indexOf("on") >= 0,
          apiKeyFieldPresent: !!document.getElementById("apiKey")
        });
      }, 300);
    });
  });
  console.log("Setup reachability via header gear:", JSON.stringify(gearResult));
  const reachOk = gearResult.present && gearResult.visible && gearResult.bigEnough &&
    /setup/i.test(gearResult.ariaLabel) && gearResult.onSetup &&
    gearResult.gearHighlighted && gearResult.apiKeyFieldPresent;
  console.log(reachOk ? "PASS (header gear is a visible 44px labelled control that opens Setup with the key fields)" : "FAIL (Setup/gear reachability)");

  // the gear must stay reachable at the narrowest supported width too
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(200);
  const narrow = await page.evaluate(() => {
    const gear = document.getElementById("btnGearSetup");
    const r = gear.getBoundingClientRect();
    return {
      visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= document.documentElement.clientWidth,
      bigEnough: r.width >= 44 && r.height >= 44,
      noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    };
  });
  console.log("gear at 320px:", JSON.stringify(narrow));
  const narrowOk = narrow.visible && narrow.bigEnough && narrow.noPageOverflow;
  console.log(narrowOk ? "PASS (gear stays fully visible and 44px at 320px, no horizontal overflow)" : "FAIL (narrow-width gear reachability)");

  const overall = overflowOk && reachOk && narrowOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
