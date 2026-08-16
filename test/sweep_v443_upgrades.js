/* v4.43 language-upgrade sweep — pins the wave's contracts:
   1. picker: 35 languages in 3 optgroups (base 9 + Myanmar ethnic 11 +
      India 10 + Asia 5: ne/lo/km/ja/ko), every code present
   2. native starter packs (TR_L): Indic + Asia languages get their own
      script for the high-visibility short strings — checked in the language's
      OWN script, not the fallback's
   3. fallback layering: keys NOT in a pack fall through exactly as before —
      Hindi long-form -> English, Lao long-form -> Thai (closest readable),
      Myanmar ethnic -> Burmese (no machine-guessed low-resource text)
   4. version lockstep 4.43.0 */
const { chromium } = require("playwright-core");
const BASE = "http://localhost:8931/index.html";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS — " : "FAIL — ") + name + (ok ? "" : "  " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  page.on("pageerror", e => report("no page error", false, e.message));
  await page.goto(BASE);
  await page.waitForTimeout(1000);

  /* ---- 1) 35-language picker in 3 groups ---- */
  const picker = await page.evaluate(() => {
    const sel = document.getElementById("selLang");
    const values = Array.from(sel.querySelectorAll("option")).map(o => o.value);
    const asia = ["ne", "lo", "km", "ja", "ko"];
    const labels = {};
    asia.forEach(c => {
      const o = Array.from(sel.querySelectorAll("option")).find(x => x.value === c);
      labels[c] = o ? o.textContent : null;
    });
    return {
      total: values.length,
      groups: sel.querySelectorAll("optgroup").length,
      asiaMissing: asia.filter(c => values.indexOf(c) < 0),
      endonyms: labels.ne === "नेपाली" && labels.lo === "ລາວ" && labels.km === "ខ្មែរ" && labels.ja === "日本語" && labels.ko === "한국어"
    };
  });
  report("1) 35 languages, 3 optgroups, Asia endonyms", picker.total === 35 && picker.groups === 3 && picker.asiaMissing.length === 0 && picker.endonyms, picker);

  /* ---- 2) native starter packs render in the language's own script ---- */
  const packs = await page.evaluate(() => {
    const keep = LANG;
    const got = {};
    const expect = {
      hi: "दिखाएँ", bn: "দেখান", ta: "காட்டு", te: "చూపించు", mr: "दाखवा",
      gu: "બતાવો", kn: "ತೋರಿಸಿ", ml: "കാണിക്കുക", pa: "ਦਿਖਾਓ", ur: "دکھائیں",
      ne: "देखाउनुहोस्", lo: "ສະແດງ", km: "បង្ហាញ", ja: "表示", ko: "보기"
    };
    const bad = [];
    Object.keys(expect).forEach(code => {
      LANG = code;
      got[code] = t("btn_show");
      if (got[code] !== expect[code]) bad.push(code + "=" + got[code]);
    });
    LANG = keep;
    return { bad, count: Object.keys(expect).length };
  });
  report("2) 15 native starter packs answer in their own script", packs.bad.length === 0 && packs.count === 15, packs);

  /* ---- 3) fallback layering for keys outside the packs ---- */
  const fb = await page.evaluate(() => {
    const keep = LANG;
    /* The fall-through layer has to be demonstrated with a language that
       genuinely has no pack. This used ur (falling to English) and lo (falling
       to Thai), which only held while those two were starter packs — v4.77
       gave both a full dictionary, so the assertion failed for the right thing
       happening. Same mistake as sweep_v461's assertion C: it pinned a state
       rather than a contract.

       Kayah (kyu) is the honest probe: an ethnic-language code with no pack of
       its own and an explicit LANG_FB entry to Burmese, and no plan to give it
       one. The packed languages are now checked for what they should do —
       answer natively, each in its own script. */
    LANG = "hi"; const hiLong = t("gal_note");    // full dict -> native Hindi
    LANG = "ur"; const urLong = t("gal_note");    // v4.77 -> native Urdu
    LANG = "lo"; const loLong = t("gal_note");    // v4.77 -> native Lao
    LANG = "en"; const enLong = t("gal_note");
    LANG = "kyu"; const kyuShort = t("btn_show"); // no pack at all -> Burmese
    LANG = "my"; const myShort = t("btn_show");
    LANG = keep;
    return {
      hiIsNative: hiLong !== enLong && /[ऀ-ॿ]/.test(hiLong),
      urIsNative: urLong !== enLong && /[؀-ۿ]/.test(urLong),
      loIsNative: loLong !== enLong && /[຀-໿]/.test(loLong),
      kyuFallsToMy: kyuShort === myShort
    };
  });
  report("3) every packed language answers in its own script (hi, ur, lo); an unpacked one still falls through (kyu->my)",
    fb.hiIsNative && fb.urIsNative && fb.loIsNative && fb.kyuFallsToMy, fb);

  /* ---- 4) version lockstep ---- */
  const ver = await page.evaluate(async () => {
    const vj = await (await fetch("version.json")).json();
    return { app: APP_VER, json: vj.v };
  });
  report("4) version lockstep 4.98.2", ver.app === "4.98.2" && ver.json === "4.98.2", ver);

  /* ---- 5) marketing site mirrors the 35-language set (file-based — the
     site root isn't served in CI, docs/app is) ---- */
  const fs = require("fs"), path = require("path");
  const site = fs.readFileSync(path.resolve(__dirname, "..", "docs", "index.html"), "utf8");
  const siteOk = {
    optgroups: (site.match(/<optgroup/g) || []).length === 3,
    options: (site.match(/<option value="/g) || []).length === 35,
    fb: site.indexOf("var SITE_FB=") >= 0 && site.indexOf("lo:'th'") >= 0,
    /* v4.50: the packs grew from starter subsets into full dictionaries for
       the languages the translation wave completed, so the pin checks that
       every language block exists and still defines the CTA, not that the
       CTA happens to be its first key */
    packs: site.indexOf("var SITE_L=") >= 0 &&
      ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ne", "lo", "km", "ja", "ko"]
        .every(c => new RegExp("\\n" + c + ":\\{").test(site)) &&
      (site.match(/"nav\.cta":/g) || []).length >= 15,
    keyThreaded: site.indexOf("pick(rec,l,k)") >= 0
  };
  report("5) site: 35-language picker, SITE_FB/SITE_L, key-threaded pick()",
    siteOk.optgroups && siteOk.options && siteOk.fb && siteOk.packs && siteOk.keyThreaded, siteOk);

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
