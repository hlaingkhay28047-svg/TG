/* Regression test for the update-available toast: it must only fire when the
   fetched version.json is genuinely NEWER than the running build, never on
   "different" (a stale/CDN-cached version.json can serve an OLDER value, and
   that must not be mistaken for "a new version shipped").
   Usage: PORT=8931 node test/verify_version_check.js */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  const cases = await page.evaluate(() => {
    return [
      { label: "older (stale cache) vs current -> false", got: verNewer("3.8.0", APP_VER) },
      { label: "same as current -> false", got: verNewer(APP_VER, APP_VER) },
      { label: "genuinely newer patch -> true", got: verNewer("99.0.1", APP_VER) },
      { label: "older major vs newer current -> false", got: verNewer("4.7.0", "4.7.2") },
      { label: "newer minor -> true", got: verNewer("4.8.0", "4.7.2") },
    ];
  });

  let ok = true;
  const expected = [false, false, true, false, true];
  cases.forEach((c, i) => {
    const pass = c.got === expected[i];
    if (!pass) ok = false;
    console.log((pass ? "PASS" : "FAIL") + " - " + c.label + " (got " + c.got + ")");
  });

  console.log("\n" + (ok ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
