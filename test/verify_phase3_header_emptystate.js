/* Regression test for v4.17.0's UI/UX audit Phase 3: standardizing the
   section-header pattern (h2 title + separate .mut subtitle line, never
   an inline <span> crammed into the h2) and the empty-state component
   (a single shared .empty-state pattern — icon + message + optional CTA —
   replacing 3 independently hand-rolled versions with drifted icon sizes
   and an ad-hoc style.display toggle instead of the app's established
   .on convention).
   Usage: PORT=8931 node test/verify_phase3_header_emptystate.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const o = document.querySelector(".onb"); if (o) o.classList.remove("on"); });

  // --- Header pattern: no h2 should contain a full descriptive subtitle crammed
  // into an inline <span> (that content now lives in a separate .mut line below).
  // #rhOptTag/#oaOptTag are a deliberate, different case — a short "(optional)"
  // qualifier badge suffixed directly onto the title, not a subtitle — so they're
  // an intentional exception, not a miss.
  const badHeaders = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h2")).filter(h => {
      const span = h.querySelector("span");
      return span && span.id !== "rhOptTag" && span.id !== "oaOptTag";
    }).length);
  console.log("h2 elements still containing an inline-span subtitle:", badHeaders);
  console.log(badHeaders === 0 ? "PASS (no inline-span subtitles left in any h2, aside from the intentional (optional) badges)" : "FAIL (inline-span subtitle regression)");

  // --- Studio Tools header: title + separate .mut subtitle ---
  await page.evaluate(() => switchPage("pgStudio"));
  await page.waitForTimeout(200);
  const studio = await page.evaluate(() => {
    const h2 = document.querySelector("#pgStudio h2");
    const sub = h2 ? h2.nextElementSibling : null;
    return { h2Text: h2 && h2.textContent.trim(), subIsMut: sub && sub.classList.contains("mut"), subText: sub && sub.textContent.trim() };
  });
  console.log("Studio header:", JSON.stringify(studio));
  const studioOk = studio.h2Text === "🛠 STUDIO TOOLS" && studio.subIsMut && studio.subText.length > 0;
  console.log(studioOk ? "PASS (Studio header uses h2 + separate .mut subtitle)" : "FAIL (Studio header structure)");

  // --- Gallery empty-state: shown by default (icon + message + CTA), the reference pattern ---
  await page.evaluate(() => switchPage("pgGallery"));
  await page.waitForTimeout(200);
  const gallery = await page.evaluate(() => {
    const el = document.getElementById("galEmpty");
    return {
      hasEmptyStateClass: el.classList.contains("empty-state"),
      visible: getComputedStyle(el).display !== "none",
      hasIcon: !!el.querySelector(".ic"),
      hasCta: !!document.getElementById("galEmptyGo")
    };
  });
  console.log("Gallery empty-state:", JSON.stringify(gallery));
  const galleryOk = gallery.hasEmptyStateClass && gallery.visible && gallery.hasIcon && gallery.hasCta;
  console.log(galleryOk ? "PASS (Gallery empty-state visible with icon+message+CTA)" : "FAIL (Gallery empty-state)");

  // --- Library search empty-state: hidden by default, shown + shared class on no-match search ---
  await page.evaluate(() => switchPage("pgLib"));
  await page.waitForTimeout(200);
  const libBefore = await page.evaluate(() => {
    const el = document.getElementById("libEmpty");
    return { hasClass: el.classList.contains("empty-state"), visible: getComputedStyle(el).display !== "none" };
  });
  await page.fill("#libSearch", "zzzznonexistentqueryxyz");
  await page.waitForTimeout(400);
  const libAfter = await page.evaluate(() => {
    const el = document.getElementById("libEmpty");
    return { visible: getComputedStyle(el).display !== "none", hasIcon: !!el.querySelector(".ic"), text: document.getElementById("libEmptyTxt").textContent };
  });
  await page.fill("#libSearch", "");
  console.log("Library empty-state before/after:", JSON.stringify({ libBefore, libAfter }));
  const libOk = libBefore.hasClass && !libBefore.visible && libAfter.visible && libAfter.hasIcon && libAfter.text.length > 0;
  console.log(libOk ? "PASS (Library search empty-state: hidden by default, shown+populated on no-match)" : "FAIL (Library empty-state)");

  // --- Workflow search empty-state: same shared pattern, JS-built element ---
  await page.evaluate(() => switchPage("pgWf"));
  await page.waitForTimeout(200);
  const wfInput = await page.$("#wfSearch");
  let wfOk = false, wfState = null;
  if (wfInput) {
    await wfInput.fill("zzzznonexistentqueryxyz");
    await page.waitForTimeout(400);
    wfState = await page.evaluate(() => {
      const el = document.getElementById("wfEmpty");
      return el ? { hasClass: el.classList.contains("empty-state"), visible: getComputedStyle(el).display !== "none", hasIcon: !!el.querySelector(".ic") } : null;
    });
    wfOk = !!(wfState && wfState.hasClass && wfState.visible && wfState.hasIcon);
    await wfInput.fill("");
  }
  console.log("Workflow search empty-state:", JSON.stringify(wfState));
  console.log(wfOk ? "PASS (Workflow search empty-state uses shared .empty-state pattern)" : "FAIL (Workflow empty-state)");

  const overall = badHeaders === 0 && studioOk && galleryOk && libOk && wfOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
