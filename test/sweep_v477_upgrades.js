/* v4.77.0 regression sweep — six languages stop being decoration.

   WHAT WAS MEASURED FIRST. TR_L carries a per-language dictionary for the
   extended language set. Nine of them held 244 keys. Six — Japanese, Korean,
   Khmer, Lao, Nepali and Urdu — held 19:

     btn_show btn_savekey lib_all lib_more lib_img1 lib_img2 result_h2
     gal_del wiz_start wiz_next wiz_back wiz_req wiz_opt wiz_pick wiz_clear
     wiz_ready st_done st_needkey spin_gen

   Nineteen strings out of 244. Picking Japanese changed nine buttons and left
   the entire rest of the app in English, which is worse than not offering the
   language: the picker promises a translated app and delivers a broken one.
   Those six are now full dictionaries.

   Pinned contracts:
   A) Every language in TR_L carries the full key set. No starter packs left.
   B) PLACEHOLDERS SURVIVE. {N} {S} {T} {B} {D} {M} are substituted with live
      numbers at runtime; a dropped or renamed one ships a literal "{N}" to a
      customer, or loses the number entirely.
   C) MARKUP SURVIVES. The twelve strings carrying HTML keep their tags and
      attributes — a mangled <a href> is a dead link on the key-setup screen.
   D) The text is really in the target script, checked by Unicode range. A
      dictionary that is 244 keys of English would satisfy A and B and still
      be worthless.
   E) The app actually renders them: switching language moves the visible text
      on screen, which is the only assertion here that exercises the real
      lookup chain rather than the data.
   F) No page errors.

   Usage: PORT=8931 node test/sweep_v477_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* Which Unicode block each language must actually be written in. Urdu shares
   the Arabic block with Persian/Arabic, which is the correct test here — the
   point is that it is not Latin. */
const SCRIPTS = {
  ja: /[぀-ヿ一-鿿]/,   /* kana or kanji */
  ko: /[가-힯ᄀ-ᇿ]/,   /* hangul */
  km: /[ក-៿]/,                /* khmer */
  lo: /[຀-໿]/,                /* lao */
  ne: /[ऀ-ॿ]/,                /* devanagari */
  ur: /[؀-ۿ]/                 /* arabic */
};
const NEW = Object.keys(SCRIPTS);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const data = await page.evaluate((newLangs) => {
    const langs = Object.keys(TR_L);
    /* Baseline is TR itself, not a sibling pack: pack-vs-pack fullness let
       every pack drift 64 keys behind TR in lockstep while still passing. */
    const full = Object.keys(TR);
    const counts = {}; langs.forEach(l => counts[l] = Object.keys(TR_L[l]).length);
    const drift = {}; langs.forEach(l => { const miss = full.filter(k => !(k in TR_L[l])); if (miss.length) drift[l] = miss.length; });

    const placeholderMisses = [], markupMisses = [], stillEnglish = [];
    const PH = /\{[A-Za-z0-9_]+\}/g;
    const TAG = /<[^>]+>/g;

    newLangs.forEach(l => {
      const d = TR_L[l] || {};
      full.forEach(k => {
        const en = (TR[k] && TR[k].en !== undefined) ? String(TR[k].en) : null;
        const tr = d[k];
        if (en === null || tr === undefined) return;
        const want = (en.match(PH) || []).slice().sort().join("|");
        const got = (String(tr).match(PH) || []).slice().sort().join("|");
        if (want !== got) placeholderMisses.push(l + ":" + k + " want[" + want + "] got[" + got + "]");
        const wantT = (en.match(TAG) || []).join("");
        const gotT = (String(tr).match(TAG) || []).join("");
        if (wantT !== gotT) markupMisses.push(l + ":" + k);
        /* identical to English AND long enough that it is not a proper noun
           or a bare symbol */
        if (String(tr) === en && en.replace(/[^A-Za-z]/g, "").length > 12) stillEnglish.push(l + ":" + k);
      });
    });
    return { langs, fullCount: full.length, counts, placeholderMisses, markupMisses, stillEnglish };
  }, NEW);

  const short = Object.keys(data.counts).filter(l => data.counts[l] < data.fullCount);
  report("A) every language in TR_L carries the full key set — no starter packs left",
    data.fullCount >= 308 && short.length === 0,
    { fullKeySet: data.fullCount, shortLanguages: short.map(l => l + "=" + data.counts[l]) });

  report("B) every {N}-style placeholder survives translation",
    data.placeholderMisses.length === 0,
    { misses: data.placeholderMisses.slice(0, 8), total: data.placeholderMisses.length });

  report("C) HTML tags and their attributes survive translation",
    data.markupMisses.length === 0,
    { misses: data.markupMisses.slice(0, 8), total: data.markupMisses.length });

  report("D0) nothing was left sitting in English",
    data.stillEnglish.length === 0,
    { left: data.stillEnglish.slice(0, 8), total: data.stillEnglish.length });

  /* D) the text is really in the language it claims to be */
  const scriptStats = await page.evaluate((pairs) => {
    const out = {};
    pairs.forEach(([l, srcRe]) => {
      const re = new RegExp(srcRe, "u");
      const d = TR_L[l] || {};
      const keys = Object.keys(d);
      const hits = keys.filter(k => re.test(String(d[k])));
      out[l] = { keys: keys.length, inScript: hits.length };
    });
    return out;
  }, NEW.map(l => [l, SCRIPTS[l].source]));

  const weak = Object.keys(scriptStats).filter(l => {
    const s = scriptStats[l];
    return !s.keys || s.inScript / s.keys < 0.8;
  });
  report("D) each dictionary is really written in its own script",
    weak.length === 0,
    { weak, stats: scriptStats });

  /* E) the real lookup chain.

     The first version of this sampled every button/h1/h2/label on the page and
     asked how many changed. It scored 2 of 40 for the new languages — and then
     2 of 40 for Burmese, Thai, Chinese and Hindi too, including the app's own
     primary language. A probe that says Burmese does not work is measuring
     itself, not the app: most of that chrome is drawn by render functions from
     inline L9 maps, not by applyLang.

     So sample the elements applyLang ACTUALLY writes from t(). Those are the
     ones a full TR_L dictionary is supposed to move, and they are the honest
     test of whether the new packs reach the screen. */
  const live = await page.evaluate(async (newLangs) => {
    const IDS = ["heroH1", "heroLede", "keyNote", "btnShowKey", "btnSaveKey", "refsH2",
                 "refsNote", "libToImg1", "libToImg2", "libMore", "resultH2", "galNote",
                 "galEmptyTxt", "optFlash", "optPro", "platH2", "platP1", "platP2",
                 "platP3", "platP4", "siteLink", "onb1", "onb2"];
    function sample() {
      return IDS.map(id => { const n = document.getElementById(id); return n ? (n.textContent || "").trim() : null; });
    }
    LANG = "en"; applyLang();
    await new Promise(r => setTimeout(r, 120));
    const base = sample();
    const present = base.filter(x => x !== null && x !== "").length;
    const out = {};
    for (const l of newLangs) {
      LANG = l; applyLang();
      await new Promise(r => setTimeout(r, 120));
      const a = sample();
      let changed = 0;
      for (let i = 0; i < base.length; i++) if (base[i] && a[i] && a[i] !== base[i]) changed++;
      out[l] = { changed, of: present };
    }
    LANG = "en"; applyLang();
    return out;
  }, NEW);

  const inert = Object.keys(live).filter(l => !live[l].of || live[l].changed / live[l].of < 0.9);
  report("E) switching to each language moves every string applyLang draws from t()",
    inert.length === 0, { inert, live });

  report("no page errors", errs.length === 0, errs);

  console.log("      (before: ja/ko/km/lo/ne/ur each carried 19 of 244 keys — picking one " +
    "changed nine buttons and left the rest of the app in English)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
