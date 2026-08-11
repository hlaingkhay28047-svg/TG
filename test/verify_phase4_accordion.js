/* Regression test for the .grp accordion convention (Phase 4), updated for
   v4.23.0's Studio rebuild: pgStudio now hosts the MEITU STUDIO suite
   (12 .grp groups in #muHost) and the EVOTO PRO suite (11 .grp groups in
   #evHost), all closed by default, opening on header click to reveal the
   live-preview controls (.st-ctl slider rows / .chips picks). Setup's
   accordion checks (RunningHub advanced config + 4-platform guide) are
   unchanged from the original Phase-4 test.
   Usage: PORT=8931 node test/verify_phase4_accordion.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const o = document.querySelector(".onb"); if (o) o.classList.remove("on"); });

  // --- Studio: MEITU 15 + EVOTO 16 .grp groups (pgStudio v2 upgrade), every one closed by default ---
  await page.evaluate(() => switchPage("pgStudio"));
  await page.waitForTimeout(200);
  const suiteGroups = await page.evaluate(() => {
    const grab = id => Array.from(document.querySelectorAll("#" + id + " > .grp")).map(g => ({
      open: g.classList.contains("open"),
      bodyVisible: getComputedStyle(g.querySelector(".grp-b")).display !== "none"
    }));
    return { mu: grab("muHost"), ev: grab("evHost") };
  });
  console.log("Studio suite groups:", "mu=" + suiteGroups.mu.length, "ev=" + suiteGroups.ev.length);
  const addonsOk = suiteGroups.mu.length === 15 && suiteGroups.ev.length === 16 &&
    suiteGroups.mu.concat(suiteGroups.ev).every(g => !g.open && !g.bodyVisible);
  console.log(addonsOk ? "PASS (15 Meitu + 16 Evoto groups, all closed by default)" : "FAIL (Studio suite accordion structure regression)");

  const clickResult = await page.evaluate(() => {
    const g = document.querySelector("#muHost > .grp");
    g.querySelector(".grp-h").click();
    return {
      open: g.classList.contains("open"),
      bodyVisible: getComputedStyle(g.querySelector(".grp-b")).display !== "none",
      hasControls: !!(g.querySelector(".st-ctl") || g.querySelector(".chips"))
    };
  });
  console.log("First Meitu group after click:", JSON.stringify(clickResult));
  const clickOk = clickResult.open && clickResult.bodyVisible && clickResult.hasControls;
  console.log(clickOk ? "PASS (clicking header opens group + reveals live controls)" : "FAIL (accordion click regression)");

  // --- Setup: RunningHub advanced config + 4 platform groups, all closed by default ---
  await page.evaluate(() => switchPage("pgHome"));
  await page.waitForTimeout(200);
  const setupState = await page.evaluate(() => {
    const rh = document.getElementById("rhGrpAdvanced");
    const plat = ["platGrpAndroid", "platGrpIos", "platGrpDesktop", "platGrpPs"].map(id => {
      const g = document.getElementById(id);
      return { open: g.classList.contains("open"), bodyVisible: getComputedStyle(g.querySelector(".grp-b")).display !== "none" };
    });
    return {
      rhAdvanced: { open: rh.classList.contains("open"), bodyVisible: getComputedStyle(rh.querySelector(".grp-b")).display !== "none" },
      plat
    };
  });
  console.log("Setup accordion state:", JSON.stringify(setupState));
  const setupClosedOk = !setupState.rhAdvanced.open && !setupState.rhAdvanced.bodyVisible && setupState.plat.every(p => !p.open && !p.bodyVisible);
  console.log(setupClosedOk ? "PASS (RunningHub advanced + all 4 platform groups closed by default)" : "FAIL (Setup accordion structure regression)");

  // opening reveals the underlying controls (key input row stays untouched/always visible)
  const rhKeyAlwaysVisible = await page.evaluate(() => document.getElementById("rhKey").offsetParent !== null);
  const rhAfter = await page.evaluate(() => {
    document.querySelector("#rhGrpAdvanced .grp-h").click();
    return document.getElementById("rhModelSel").offsetParent !== null;
  });
  const platAfter = await page.evaluate(() => {
    document.querySelector("#platGrpAndroid .grp-h").click();
    return document.getElementById("platP1").offsetParent !== null && document.getElementById("platP1").textContent.length > 0;
  });
  console.log("rhKey always visible:", rhKeyAlwaysVisible, "| rhModelSel reachable after click:", rhAfter, "| platP1 reachable after click:", platAfter);
  const reachOk = rhKeyAlwaysVisible && rhAfter && platAfter;
  console.log(reachOk ? "PASS (required key field stays visible; advanced/platform controls reachable after expanding)" : "FAIL (Setup accordion reachability regression)");

  const overall = addonsOk && clickOk && setupClosedOk && reachOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
