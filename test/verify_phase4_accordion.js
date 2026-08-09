/* Regression test for v4.18.0's UI/UX audit Phase 4: converting Studio's
   Add-ons wall (8 permanently-expanded subh+chips sections stacked on one
   page) and Setup's two densest blocks (RunningHub's advanced model
   config, and the 4-platform install guide) to the same .grp
   collapsible-accordion component already proven on the Workflow page
   and Scene Builder/Retouch Pro cards.
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

  // --- Studio Add-ons: exactly 4 .grp groups, all closed by default ---
  await page.evaluate(() => switchPage("pgStudio"));
  await page.waitForTimeout(200);
  const addonGroups = await page.evaluate(() => {
    const host = document.getElementById("addonHost");
    return Array.from(host.querySelectorAll(":scope > .grp")).map(g => ({
      open: g.classList.contains("open"),
      bodyVisible: getComputedStyle(g.querySelector(".grp-b")).display !== "none"
    }));
  });
  console.log("Studio addonHost groups:", JSON.stringify(addonGroups));
  const addonsOk = addonGroups.length === 4 && addonGroups.every(g => !g.open && !g.bodyVisible);
  console.log(addonsOk ? "PASS (4 add-on groups, all closed by default)" : "FAIL (add-on accordion structure regression)");

  const clickResult = await page.evaluate(() => {
    const g = document.querySelector("#addonHost > .grp");
    g.querySelector(".grp-h").click();
    return { open: g.classList.contains("open"), bodyVisible: getComputedStyle(g.querySelector(".grp-b")).display !== "none", hasChips: !!g.querySelector(".chips") };
  });
  console.log("First add-on group after click:", JSON.stringify(clickResult));
  const clickOk = clickResult.open && clickResult.bodyVisible && clickResult.hasChips;
  console.log(clickOk ? "PASS (clicking header opens group + reveals chips)" : "FAIL (accordion click regression)");

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
