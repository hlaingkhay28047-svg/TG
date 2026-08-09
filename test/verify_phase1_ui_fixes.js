/* Regression test for two v4.15.3 UI/UX-audit fixes found via real-browser
   testing at a 390px phone width:
   1) Retouch Studio's One-Tap mode hid the Generate button but left its
      wrapping card (spinner/status/Retry row) visible and empty between
      the presets and the result on every first visit. Fix: rsGenCard is
      hidden while idle in One-Tap mode and shown once busy or a Retry is
      pending (rsSyncGenCardVisibility()).
   2) #genOpts/#vidOpts/#vuOpts/#t2iOpts select dropdowns lost a
      min-width tug-of-war to a higher-specificity ".inp" class rule,
      letting 3 dropdowns squeeze onto one row and clip their labels.
      Fix: select.inp now carries equal-or-higher specificity.
   Usage: PORT=8931 node test/verify_phase1_ui_fixes.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // --- Fix 1: rsGenCard hidden while idle in One-Tap, shown in Sliders ---
  await page.evaluate(() => switchPage("pgRetouch"));
  await page.waitForTimeout(300);
  const onetapIdle = await page.evaluate(() => {
    const card = document.getElementById("rsGenCard");
    return { found: !!card, display: card ? getComputedStyle(card).display : null, mode: typeof rsMode !== "undefined" ? rsMode : null };
  });
  console.log("rsGenCard (One-Tap, idle):", JSON.stringify(onetapIdle));
  const onetapOk = onetapIdle.found && onetapIdle.mode === "onetap" && onetapIdle.display === "none";
  console.log(onetapOk ? "PASS (empty gen card hidden in idle One-Tap)" : "FAIL (rsGenCard should be hidden while idle in One-Tap)");

  const slidersShown = await page.evaluate(() => {
    rsSetMode("sliders");
    return getComputedStyle(document.getElementById("rsGenCard")).display;
  });
  console.log("rsGenCard (Sliders):", slidersShown);
  const slidersOk = slidersShown !== "none";
  console.log(slidersOk ? "PASS (gen card visible in Sliders mode)" : "FAIL (rsGenCard should be visible in Sliders mode)");

  // --- Fix 2: Create-page dropdowns keep a stable min-width, no clipping ---
  await page.evaluate(() => switchPage("pgCreate"));
  await page.waitForTimeout(300);
  const selectInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("#genOpts select.inp")).map(s => ({
      id: s.id,
      offsetWidth: s.offsetWidth,
      scrollWidth: s.scrollWidth
    }));
  });
  console.log("genOpts selects:", JSON.stringify(selectInfo));
  const selectsOk = selectInfo.length > 0 && selectInfo.every(s => s.offsetWidth >= 130 && s.scrollWidth <= s.offsetWidth + 2);
  console.log(selectsOk ? "PASS (dropdowns keep >=130px min-width, no label clipping)" : "FAIL (dropdown min-width/clipping regression)");

  const overall = onetapOk && slidersOk && selectsOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
