/* Regression test for v4.16.0's UI/UX audit Phase 2: introducing a
   spacing/type/radius CSS design-token scale and sweeping the core shared
   components (.card, .chip, .btn, .subh, h2, .grp, .mut, .status, h1)
   onto it, per the audit finding that these values had drifted into
   dozens of ad-hoc near-duplicate numbers with no shared source of truth.
   Usage: PORT=8931 node test/verify_phase2_design_tokens.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const o = document.querySelector(".onb"); if (o) o.classList.remove("on"); });

  const tokensDefined = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = ["--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-5", "--sp-6",
      "--r-sm", "--r-md", "--r-lg", "--r-pill",
      "--fs-2xs", "--fs-xs", "--fs-sm", "--fs-base", "--fs-md", "--fs-xl"];
    return names.every(n => cs.getPropertyValue(n).trim().length > 0);
  });
  console.log("all 16 design tokens defined on :root:", tokensDefined);
  console.log(tokensDefined ? "PASS (token set present)" : "FAIL (missing tokens)");

  // spot-check a few pages to confirm the core components still render
  // with the expected resolved values (i.e. the token swap didn't silently
  // change the visual language) and nothing throws
  const pageChecks = [];
  for (const pg of ["pgWf", "pgStudio", "pgHome", "pgRetouch", "pgCreate"]) {
    await page.evaluate((id) => switchPage(id), pg);
    await page.waitForTimeout(150);
    const vals = await page.evaluate(() => {
      const card = document.querySelector(".page.on .card");
      /* .gen (the big CTA button) carries its own pre-existing 12px
         radius override that legitimately wins the cascade — exclude it
         so this check targets a plain, token-driven .btn */
      const btn = document.querySelector(".page.on .btn:not(.gen)");
      const chip = document.querySelector(".page.on .chip");
      const cs = el => el && getComputedStyle(el);
      const c = cs(card), b = cs(btn), h = cs(chip);
      return {
        cardRadius: c && c.borderRadius,
        btnRadius: b && b.borderRadius,
        chipRadius: h && h.borderRadius
      };
    });
    pageChecks.push({ pg, vals });
  }
  console.log("per-page computed values:", JSON.stringify(pageChecks));
  const valuesOk = pageChecks.every(({ vals }) =>
    (!vals.cardRadius || vals.cardRadius === "14px") &&
    (!vals.btnRadius || vals.btnRadius === "9px") &&
    (!vals.chipRadius || vals.chipRadius === "999px"));
  console.log(valuesOk ? "PASS (card/btn/chip radii resolve to the pre-token visual values on every page)" : "FAIL (a page resolved an unexpected radius)");

  const overall = tokensDefined && valuesOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
