/* v4.61.0 regression sweep — five more languages, and the guard that stops a
   translation pack from smuggling a shipped bug back in.

   mr / gu / kn / ml / pa were translated months ago and never integrated: they
   sat in the repo's scratchpad at 19 starter keys each while hi/bn/ta/te ran
   at 244. Integrating them turned up two things worth pinning forever.

   1. The artifacts carried 847 keys, but only 244 of those are app keys — the
      other 603 are WEBSITE keys (page.title, nav.cta, hero.kick…). Splicing
      them whole would have put 3,000 dead strings into a 2MB single-file app.

   2. The artifacts predate v4.51.0. That release replaced a hardcoded "30" in
      pt_cap / pt_intro / pt_empty with a {N} the render site substitutes,
      because PT_MAX is device-dependent and a phone that can only do 12 was
      promising 30. The packs still carried the literal. Integrating them as
      shipped would have reintroduced the exact bug v4.51 fixed — in five more
      languages at once, and silently, because nothing tested for it.

   So the contract this file pins is not "the packs exist". It is:

   A) Every string in every TR_L pack carries EXACTLY the placeholders its
      English source carries. Not more, not fewer. A sentence that lost its
      {N} renders a promise with the number missing.
   B) No pack contains a key the app does not have. A key TR has never heard of
      is either a website string or a typo, and both are dead weight that no
      amount of testing will otherwise surface.
   C) Every pack really is full. This assertion used to read "the nine full
      packs are full and the six starters are still starters", which pinned a
      STATE rather than a contract: when ur/ne/lo/km/ja/ko were finished in
      v4.77 it failed for the right thing happening. The contract worth
      keeping is that no pack is partial — a half-integrated language must not
      be able to masquerade as done, in either direction.
   D) The parameterised keys actually render with a number substituted, in
      every full language, at the device cap the app computed.

   G) v5.39.0 — NO PACK PUTS MYANMAR SCRIPT IN A LANGUAGE THAT DOES NOT USE
      IT. The gu pack shipped `"unit":" ခု"` — the Burmese counter word — and
      t() prefers the TR_L starter pack over everything else, so every counter
      in the app rendered Burmese script for Gujarati customers at seven render
      sites. Nothing caught it: A only compares placeholders, B only compares
      key names, C only counts. A wrong-script string is complete, correctly
      keyed, correctly parameterised and completely unreadable. my, shn and kht
      are the three languages here that are actually written in that block.

   Usage: PORT=8931 node test/sweep_v461_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const FULL = ["hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa",
              /* v4.77 — these six left their 19-key starter packs behind */
              "ur", "ne", "lo", "km", "ja", "ko",
              /* v5.7 — real Tai Le + Khamti dictionaries; v5.8 adds Tai Lue */
              "tdd", "kht", "khb"];
const STARTER = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const r = await page.evaluate((cfg) => {
    const out = {};
    const ph = s => (String(s).match(/\{[A-Z]\}/g) || []).sort().join(",");
    const langs = Object.keys(TR_L);

    /* A) placeholder parity against the English source */
    out.A_bad = [];
    langs.forEach(l => {
      Object.keys(TR_L[l]).forEach(k => {
        const en = TR[k] && TR[k].en;
        if (typeof en !== "string" || typeof TR_L[l][k] !== "string") return;
        if (ph(en) !== ph(TR_L[l][k])) {
          out.A_bad.push(l + "." + k + " want[" + ph(en) + "] got[" + ph(TR_L[l][k]) + "]");
        }
      });
    });

    /* B) no key the app does not have */
    out.B_orphans = [];
    langs.forEach(l => {
      Object.keys(TR_L[l]).forEach(k => { if (TR[k] === undefined) out.B_orphans.push(l + "." + k); });
    });

    /* C) full packs are full, starters are starters */
    out.C_counts = {};
    langs.forEach(l => { out.C_counts[l] = Object.keys(TR_L[l]).length; });
    out.C_fullShort = cfg.FULL.filter(l => (out.C_counts[l] || 0) < 244);
    out.C_starterGrew = cfg.STARTER.filter(l => (out.C_counts[l] || 0) !== 19);
    out.C_unknown = langs.filter(l => cfg.FULL.indexOf(l) < 0 && cfg.STARTER.indexOf(l) < 0);

    /* also: nothing in a pack may be blank — a blank wins over the fallback
       chain in t() and renders as nothing at all */
    out.C_blank = [];
    langs.forEach(l => Object.keys(TR_L[l]).forEach(k => {
      if (typeof TR_L[l][k] !== "string" || !TR_L[l][k].trim()) out.C_blank.push(l + "." + k);
    }));

    /* D) the parameterised keys render a real number in every full language */
    const save = LANG;
    out.D_bad = [];
    cfg.FULL.forEach(l => {
      LANG = l;
      ["pt_cap", "pt_intro", "pt_empty"].forEach(k => {
        const raw = t(k);
        if (raw.indexOf("{N}") < 0) { out.D_bad.push(l + "." + k + " has no {N}: " + raw.slice(0, 40)); return; }
        const rendered = raw.replace("{N}", String(PT_MAX));
        if (rendered.indexOf(String(PT_MAX)) < 0) out.D_bad.push(l + "." + k + " did not substitute");
        /* and it must not ALSO carry a stale hardcoded 30 next to the token */
        if (PT_MAX !== 30 && /\b30\b/.test(rendered)) out.D_bad.push(l + "." + k + " still carries a literal 30");
      });
    });
    LANG = save;
    out.D_ptMax = PT_MAX;

    /* G) wrong-script detection. The Myanmar block plus the two extension
       blocks Shan and Khamti draw from — a stray character from any of them in
       a Gujarati or Japanese string is a paste accident, not a translation. */
    const isMm = ch => {
      const c = ch.codePointAt(0);
      return (c >= 0x1000 && c <= 0x109F) || (c >= 0xAA60 && c <= 0xAA7F) || (c >= 0xA9E0 && c <= 0xA9FF);
    };
    const mmIn = str => Array.from(String(str)).filter(isMm).join("");
    out.G_bad = [];
    const scan = (tableName, table, langOf) => {
      Object.keys(table || {}).forEach(k => {
        const rec = table[k];
        if (!rec || typeof rec !== "object") return;
        Object.keys(rec).forEach(inner => {
          const lang = langOf ? langOf(k) : inner;
          const val = langOf ? rec[inner] : rec[inner];
          if (typeof val !== "string") return;
          if (cfg.MM_OK.indexOf(lang) >= 0) return;
          const found = mmIn(val);
          if (found) out.G_bad.push(tableName + "." + lang + "." + (langOf ? inner : k) + " [" + found + "] " + val.slice(0, 30));
        });
      });
    };
    /* TR / TR_MORE / TR_L10 are key -> {lang: string}; TR_L is lang -> {key: string} */
    scan("TR", typeof TR !== "undefined" ? TR : {}, null);
    scan("TR_MORE", typeof TR_MORE !== "undefined" ? TR_MORE : {}, null);
    scan("TR_L10", typeof TR_L10 !== "undefined" ? TR_L10 : {}, null);
    scan("TR_L", typeof TR_L !== "undefined" ? TR_L : {}, k => k);

    /* the five newly integrated languages must actually be selectable */
    out.E_options = Array.from(document.querySelectorAll("#selLang option")).map(o => o.value);
    out.E_missing = ["mr", "gu", "kn", "ml", "pa"].filter(l => out.E_options.indexOf(l) < 0);

    /* and switching to one must change visible text away from the default */
    LANG = "mr"; applyLang();
    out.F_mrHero = ($("heroH1") || {}).textContent || "";
    LANG = save; applyLang();
    return out;
  }, { FULL, STARTER,
       /* the only three languages in this app actually written in the Myanmar
          block: Burmese, Shan, and Khamti (which draws from the extensions) */
       MM_OK: ["my", "shn", "kht"] });

  report("A) every TR_L string carries exactly its English source's placeholders",
    r.A_bad.length === 0, r.A_bad.slice(0, 12));
  report("B) no pack carries a key the app does not have",
    r.B_orphans.length === 0, r.B_orphans.slice(0, 12));
  report("C) every language pack is complete — none is partial",
    r.C_fullShort.length === 0 && r.C_starterGrew.length === 0 && r.C_unknown.length === 0,
    { short: r.C_fullShort, grew: r.C_starterGrew, unknown: r.C_unknown, counts: r.C_counts });
  report("C) no pack contains a blank string, which would beat the fallback chain",
    r.C_blank.length === 0, r.C_blank.slice(0, 12));
  report("D) the parameterised Path keys substitute a real number in every full language",
    r.D_bad.length === 0, { ptMax: r.D_ptMax, bad: r.D_bad.slice(0, 12) });
  report("G) no language pack carries Myanmar script in a language that does not use it",
    r.G_bad.length === 0, r.G_bad.slice(0, 12));

  /* ...and the same rule over the raw source, which also covers the inline
     L9({my:…,shn:…}) records that never reach a table object. */
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
    const MM = /[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/;
    const srcBad = [];
    for (const lang of ["en", "kac", "th", "zh", "vi", "id", "ms"]) {
      const re = new RegExp(lang + ':"([^"]*)"', "g");
      let m;
      while ((m = re.exec(src))) if (MM.test(m[1])) srcBad.push(lang + ": " + m[1].slice(0, 40));
    }
    report("G2) ...and no inline L9 record does either",
      srcBad.length === 0, srcBad.slice(0, 12));
  }

  report("E) the five new languages are selectable",
    r.E_missing.length === 0, { missing: r.E_missing, options: r.E_options.length });
  report("F) switching to a new language actually changes the page",
    !!r.F_mrHero && /[ऀ-ॿ]/.test(r.F_mrHero), { hero: r.F_mrHero.slice(0, 60) });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
