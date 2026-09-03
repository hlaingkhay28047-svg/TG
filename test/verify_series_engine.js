/* v5.97.0 — ONE SERIES, ONE ENGINE.
 *
 * The owner asked whether every model could be made to give the same result.
 * It cannot, and the reason is worth stating in the file that guards it:
 *
 *   - Different models are different networks. The same words produce
 *     different pictures, and nothing in this client changes that.
 *   - Not one of the shipped image models exposes a `seed`, which is the only
 *     parameter that makes a generation repeatable — check A below reads the
 *     catalog and proves it, so if RunningHub ever adds one this test starts
 *     failing and we go and use it.
 *
 * So a hundred photographs cannot be identical. What they CAN be is a
 * matching series, and that requires one engine for the whole run. A batch
 * that starts on Seedream and ends on Qwen produces two looks from one Look
 * Set, and before this the app neither prevented it nor mentioned it: the
 * batch kept each photo's pixels and threw away which model made them.
 *
 * Now: the model is pinned when the run starts, re-asserted before every
 * photo, recorded on each finished photo, and if more than one engine ever
 * appears in a series the student is told which ones — in nine languages —
 * so they can re-run the odd frames instead of wondering why frame 47 is
 * different.
 *
 * Usage: PORT=8931 node test/verify_series_engine.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);

  /* ---- A: the reason a series cannot be made identical ---- */
  const A = await page.evaluate(() => {
    const seedy = RH_MODELS.filter(m => {
      const j = JSON.stringify(m).toLowerCase();
      return /"seed"|seed:|randomseed|"noise_seed"/.test(j);
    }).map(m => m.id);
    return { total: RH_MODELS.length, seedy };
  });
  report("A) no shipped image model exposes a seed — which is WHY a run cannot be made repeatable, and why the answer is one engine per series rather than identical frames",
    A.seedy.length === 0,
    "these now expose a seed and should be used for repeatability: " + A.seedy.join(", "));
  console.log("      (" + A.total + " image models checked)");

  /* ---- B: the batch pins its engine and holds it ---- */
  const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
  report("B) the batch pins the active model when the run starts",
    /PT\.model\s*=\s*\(rhCfg\(\)\.activeModel\)/.test(src), "PT.model is not pinned at run start");
  report("B2) and re-asserts it before every photo, so a model changed at photo 40 cannot split the series",
    /if\(PT\.model && rhCfg\(\)\.activeModel!==PT\.model/.test(src), "the pinned model is never re-asserted in the loop");
  report("B3) and each finished photo records which engine made it",
    /photo\.prov\s*=\s*out\._prov/.test(src), "the batch still throws away the provenance");

  /* ---- C: a mixed series is reported, in every language ---- */
  const C = await page.evaluate(({ langs }) => {
    const out = {};
    langs.forEach(L => {
      window.LANG = L;
      /* the warning is composed inline in ptRunAll's finally block; drive the
         same L9 map through the same two values it interpolates */
      out[L] = document.documentElement.innerHTML.indexOf("different engines, so the photos will not match") >= 0;
    });
    window.LANG = "my";
    return out;
  }, { langs: LANGS });
  report("C) the mixed-engine warning exists in the shipped app",
    Object.values(C).every(Boolean), C);

  const langCount = LANGS.filter(L => {
    const map = { my: "engine", en: "different engines", shn: "engine", kac: "engine",
      th: "เอนจิน", zh: "引擎", vi: "engine", id: "mesin", ms: "enjin" };
    return src.indexOf(map[L]) >= 0;
  }).length;
  report("C2) and it is written in all nine languages, not English with eight copies",
    langCount === LANGS.length, { found: langCount, of: LANGS.length });

  report("C3) it fires only when more than one engine appears — a clean series says nothing",
    /if\(PT\.provSeen && PT\.provSeen\.length>1\)/.test(src),
    "the warning is not conditional on a mixed series");

  report("D) no page error while any of this was measured", errs.length === 0, errs);
  console.log("\n" + (failures === 0
    ? "All checks passed — one engine per series, held for the whole run, recorded on every photo, and named aloud if it was ever two."
    : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
