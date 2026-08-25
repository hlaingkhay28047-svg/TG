/* v5.35.0 — Urdu reads right to left, and a language can be shared.

   TWO DEFECTS, both shipped since v4.41 when the language set grew.

   1. URDU WAS LAID OUT LEFT TO RIGHT. `ur` has been in the picker for
      thirteen releases and neither surface ever set `dir`. That is not a
      styling preference: an RTL language rendered LTR puts the start of every
      sentence where the eye finishes, and reverses the reading order of every
      list, form and button row on the page. It is the difference between a
      translated app and an unusable one.

   2. THE LANGUAGE COULD NOT BE SHARED. The only route to the Thai copy of the
      landing page was to open it and change a picker, so a studio could not
      send a Thai client a link that arrived in Thai — in a product whose whole
      pitch is 37 languages.

   WHAT FIXING (1) IMMEDIATELY EXPOSED, which is the reason C exists: under
   dir="rtl" the landing scrolled sideways. `.sec-head::before`, a decorative
   glow, hangs 24px past the inline start of every section heading. In LTR that
   is the left edge and browsers do not count overflow past it toward
   scrollWidth; flipped, the same physical `left` became the trailing edge and
   each section added 24px to the document. A logical property fixed it, and
   this file measures the result rather than trusting the rule.

   WHAT WAS DELIBERATELY NOT DONE. No hreflang tags accompany ?lang=.
   hreflang tells a crawler that separate documents exist per language, and
   they do not: every ?lang= URL serves byte-identical HTML and the language is
   applied by script afterwards. Emitting 37 alternates would be a false
   statement about the site's structure and reads as duplication, not
   translation. Assertion I holds the line so a later wave has to serve real
   per-language documents before claiming them.

   Pinned contracts:
   A) ur is RTL on both surfaces; every other shipped language is LTR.
   B) dir follows the language in both directions, not just on the way in.
   C) In RTL neither surface scrolls sideways, at 320 or at 390.
   D) The skip link mirrors to the trailing edge — it is pinned to a side.
   E) Prices, versions and ids keep an explicit LTR direction, so bidi does not
      reorder "30,000 MMK" inside an RTL sentence.
   F) ?lang= applies a valid code, ignores an unknown one, and beats the stored
      preference for that visit.
   G) A PICK writes the URL back, and the default language leaves it clean —
      but a LINK's parameter is left exactly as it arrived (v5.40.0: once a
      shared language stopped being stored, the parameter became its only
      carrier, so normalising /?lang=my away broke the share).
   H) A shared link is shown and never stored, on either key (v5.39.0); an
      explicit pick still follows the visitor into the app; opening a page is
      not a choice; and the shared language rides the outbound app links so the
      journey does not die at the door (v5.40.0).
   I) No hreflang is emitted while every locale serves the same document.
   J) No console error in any of it.

   Usage: PORT=8931 SITE_PORT=8933 node test/sweep_v535_rtl_lang.js
          (serve docs/app on PORT and docs on SITE_PORT) */
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const seed = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const SITE_PORT = process.env.SITE_PORT || 8934;
const ROOT = path.join(__dirname, "..");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------------- I) no hreflang while the documents are identical ---------------- */
/* the TAG, not the word — the decision is written down in a comment right
   next to the code that would have carried it, and matching the word would
   fail on the explanation itself */
const hreflangTags = (LANDING.match(/<link[^>]+hreflang\s*=/gi) || []).length;
report("I) no hreflang alternate TAG is emitted while every locale serves the same document",
  hreflangTags === 0 && /searchParams|URLSearchParams/.test(LANDING),
  { hreflangTags, hasLangParam: /URLSearchParams/.test(LANDING) });

/* the RTL set is declared once in each surface and they must agree */
const appSet = (APP.match(/var RTL_LANGS\s*=\s*\[([^\]]*)\]/) || [])[1] || "";
const siteSet = (LANDING.match(/\[\s*'ur'\s*,[^\]]*\]\s*\.indexOf\(l\)/) || [])[0] || "";
report("I2) both surfaces name the same right-to-left languages",
  /['"]ur['"]/.test(appSet) && /['"]ar['"]/.test(appSet) &&
  /'ur'/.test(siteSet) && /'ar'/.test(siteSet),
  { app: appSet.slice(0, 60), site: siteSet.slice(0, 60) });

(async () => {
  /* the landing needs docs/ served, which the workflow does not do for the
     other sweeps — start one rather than depend on an ambient server */
  const server = spawn("python3", ["-m", "http.server", String(SITE_PORT), "--directory",
                                   path.join(ROOT, "docs")], { stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const SITE = "http://127.0.0.1:" + SITE_PORT + "/";
  const APPURL = "http://127.0.0.1:" + PORT + "/";

  /* Premium-seeded, and this is load-bearing rather than convenience. Without a
     session the access wall hides every card except the account one, so a page
     sweep against an unseeded app measures thirteen nearly EMPTY pages and
     reports them all clean — which it did, right up until a deliberately
     broken element failed to fail it. A layout test has to be looking at the
     layout. */
  const browser = seed.withPremium(await chromium.launch());
  const errs = [];

  async function open(url, width, lang, siteLang) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addInitScript(seed => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        if (seed.app) localStorage.setItem("hnk_ws_lang", seed.app);
        /* the landing reads hnk_site_lang, NOT hnk_ws_lang, so a test that
           seeds only the app key cannot express "what the recipient had
           stored" — which is how H4 shipped three-quarters tautological */
        if (seed.site) localStorage.setItem("hnk_site_lang", seed.site);
      } catch (e) {}
    }, { app: lang || "", site: siteLang || "" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errs.push(String(e).slice(0, 140)));
    page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(url === APPURL ? 2200 : 500);
    return { ctx, page };
  }
  const setLang = (page, l) => page.evaluate(x => {
    if (window.hnkSetLang) window.hnkSetLang(x);
    else { window.LANG = x; try { localStorage.setItem("hnk_ws_lang", x); } catch (e) {} applyLang(); }
  }, l);
  const read = page => page.evaluate(() => ({
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    bodyDir: getComputedStyle(document.body).direction,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));

  /* ---------- A + B) the direction follows the language, both ways ---------- */
  for (const [what, url] of [["landing", SITE], ["app", APPURL]]) {
    const { ctx, page } = await open(url, 390);
    const seen = {};
    /* in and back out again — a one-way check passes on code that sets rtl and
       never clears it, which is the more common bug */
    for (const L of ["en", "ur", "my", "ur", "th"]) {
      await setLang(page, L);
      await page.waitForTimeout(180);
      seen[L + (seen[L] ? "2" : "")] = await read(page);
    }
    report("A) " + what + ": ur is right-to-left and nothing else is",
      seen.ur.dir === "rtl" && seen.ur.bodyDir === "rtl" &&
      seen.en.dir === "ltr" && seen.my.dir === "ltr" && seen.th.dir === "ltr",
      Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.dir])));
    report("B) " + what + ": leaving Urdu clears it again",
      seen.ur2.dir === "rtl" && seen.th.dir === "ltr" && seen.my.dir === "ltr", seen.my);
    await ctx.close();
  }

  /* ---------- C) no sideways scroll in RTL ---------- */
  for (const [what, url] of [["landing", SITE], ["app", APPURL]]) {
    for (const width of [320, 390]) {
      const { ctx, page } = await open(url, width, "ur");
      await setLang(page, "ur");
      await page.waitForTimeout(250);
      const r = await read(page);
      report("C) " + what + " at " + width + "px in RTL does not scroll sideways",
        r.dir === "rtl" && r.scrollW <= r.innerW, r);
      await ctx.close();
    }
  }

  /* ---------- C2) EVERY page, not just the one that was easy to reach ----------
     dir is set on <html>, so turning it on turns it on for all thirteen pages
     at once — Studio, Gallery, the Library grid, the sliders. Measuring the
     one page the app happens to open on would have been a check of the boot
     screen, not of the change. The landing needed a fix for exactly this class
     of bug (a decorative element pinned with a physical `left`), so the app
     deserved the same measurement rather than the assumption that it was fine. */
  {
    const { ctx, page } = await open(APPURL, 390, "ur");
    await setLang(page, "ur");
    await page.waitForTimeout(300);
    const ids = await page.evaluate(() => PAGES.map(x => x[0]));
    const bad = [];
    for (const id of ids) {
      const r = await page.evaluate(async pid => {
        window.scrollTo = function () {};
        Element.prototype.scrollIntoView = function () {};
        switchPage(pid);
        await new Promise(r => setTimeout(r, 300));
        const W = document.documentElement.clientWidth;
        /* content inside a scroller is meant to exceed it; only elements that
           widen the DOCUMENT are a defect */
        const scrolls = e => {
          for (let n = e; n && n !== document.body; n = n.parentElement) {
            const o = getComputedStyle(n).overflowX;
            if (o === "auto" || o === "scroll" || o === "hidden") return true;
          }
          return false;
        };
        const off = [];
        document.querySelectorAll("#" + pid + " *").forEach(e => {
          const q = e.getBoundingClientRect();
          if (q.width && (q.right > W + 0.5 || q.left < -0.5) && !scrolls(e)) {
            off.push((e.id || e.tagName) + "." + String(e.className).split(" ")[0].slice(0, 20));
          }
        });
        return { id: pid, sw: document.documentElement.scrollWidth, W: window.innerWidth,
                 off: [...new Set(off)].slice(0, 3) };
      }, id);
      if (r.sw > r.W || r.off.length) bad.push(r);
    }
    report("C2) all " + ids.length + " app pages hold their width in RTL, and nothing is pinned to the wrong side",
      ids.length >= 10 && bad.length === 0, bad.slice(0, 4));
    await ctx.close();
  }

  /* ---------- D + E) the pieces that are pinned to a side ---------- */
  {
    const { ctx, page } = await open(APPURL, 390, "ur");
    await setLang(page, "ur");
    await page.waitForTimeout(250);
    const pinned = await page.evaluate(() => {
      const cs = id => { const e = document.getElementById(id); return e ? getComputedStyle(e) : null; };
      const sk = cs("skipLink");
      const dir = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).direction : null; };
      return {
        skipRight: sk && sk.right, skipLeft: sk && sk.left,
        payDue: dir("payDue"), payNum: dir("payNum"),
      };
    });
    report("D) the skip link mirrors to the trailing edge in RTL",
      pinned.skipRight === "8px" && pinned.skipLeft !== "8px", pinned);
    report("E) prices and numbers keep an explicit left-to-right run inside RTL text",
      pinned.payDue === "ltr" && pinned.payNum === "ltr", pinned);
    await ctx.close();
  }

  /* ---------- F + G + H) the shareable language ---------- */
  for (const [q, want, wantSearch] of [
    ["?lang=th", "th", "?lang=th"],
    ["?lang=ur", "ur", "?lang=ur"],
    ["?lang=zz", "my", ""],          /* unknown code is ignored, not obeyed */
    ["", "my", ""],
  ]) {
    const { ctx, page } = await open(SITE + q, 390);
    const r = await page.evaluate(() => ({
      lang: document.documentElement.lang, dir: document.documentElement.dir,
      search: location.search,
      stored: (() => { try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return null; } })(),
    }));
    report("F) " + (q || "(no parameter)") + " opens in " + want,
      r.lang === want && r.search === wantSearch, r);
    if (q === "?lang=ur") report("F2) a shared Urdu link arrives right-to-left", r.dir === "rtl", r);
    /* H moved below — v5.39.0 changed what ?lang= is allowed to do to
       storage, and "the choice is stored" is no longer the contract. */
    await ctx.close();
  }

  /* the parameter beats a different stored preference for this visit */
  {
    const { ctx, page } = await open(SITE + "?lang=ko", 390, "th");
    const r = await page.evaluate(() => document.documentElement.lang);
    report("F3) a shared link wins over the visitor's stored preference for that visit",
      r === "ko", { lang: r });
    await ctx.close();
  }

  /* ---- H) ...FOR THAT VISIT, and no longer than that ----
     v5.39.0. apply() persisted on every call and the ?lang= branch calls it,
     so opening a colleague's /?lang=th link silently rewrote hnk_site_lang AND
     hnk_ws_lang — the second of which is what the paid app reads for all 37 of
     its locales, so the visitor discovered it the next time they opened
     /app/. The comment beside the feature has always promised the parameter
     wins "for this visit" and that "the stored value still decides on a bare
     visit afterwards"; this pins that promise instead of the old behaviour,
     which pinned the bug. H2 is the other half: a real pick still persists,
     because there the visitor actually chose. */
  {
    const { ctx, page } = await open(SITE + "?lang=th", 390, "ko");
    const r = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      shared: (() => { try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return null; } })(),
      site: (() => { try { return localStorage.getItem("hnk_site_lang"); } catch (e) { return null; } })(),
    }));
    report("H) a shared ?lang= link is shown but never stored, on either key",
      r.lang === "th" && r.shared === "ko" && r.site !== "th", r);
    await ctx.close();
  }
  {
    const { ctx, page } = await open(SITE, 390, "ko");
    await setLang(page, "th");
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      shared: (() => { try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return null; } })(),
      site: (() => { try { return localStorage.getItem("hnk_site_lang"); } catch (e) { return null; } })(),
    }));
    report("H2) an explicit pick from the picker still follows the visitor into the app",
      r.shared === "th" && r.site === "th", r);
    await ctx.close();
  }

  {
    const { ctx, page } = await open(SITE, 390);
    await setLang(page, "ko");
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => location.search);
    await setLang(page, "my");
    await page.waitForTimeout(200);
    const back = await page.evaluate(() => location.search);
    report("G) switching writes the URL, and the default language leaves it clean",
      after === "?lang=ko" && back === "", { afterKo: after, backToDefault: back });
    await ctx.close();
  }

  /* ---- H3) OPENING A PAGE IS NOT A CHOICE ----
     v5.39.0 marked only the ?lang= branch transient, so the automatic startup
     apply() still persisted. A customer using the paid app in Gujarati who
     tapped the app's own "visit the site" link had hnk_ws_lang rewritten to
     the landing's default on arrival, because they had never used the
     landing's picker and so had nothing under hnk_site_lang to restore. This
     is the same harm the wave set out to fix, on the highest-traffic path. */
  {
    const { ctx, page } = await open(SITE, 390, "gu");
    const r = await page.evaluate(() => ({
      shown: document.documentElement.lang,
      shared: (() => { try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return null; } })(),
      site: (() => { try { return localStorage.getItem("hnk_site_lang"); } catch (e) { return null; } })(),
    }));
    report("H3) a bare visit leaves the app's stored language alone",
      r.shared === "gu" && r.site === null, r);
    await ctx.close();
  }

  /* ---- H4) A SHARED LINK IN THE DEFAULT LANGUAGE IS STILL A SHARED LINK ----
     apply() normalised the address bar by DELETING ?lang= whenever the
     language was the default. Once v5.39.0 stopped storing a shared language,
     the parameter became its only carrier — so /?lang=my arrived Burmese, was
     rewritten to "/", and a reload fell back to whatever the RECIPIENT had
     stored. Every other language kept working, which is why it hid. */
  {
    /* the recipient's OWN stored site language must differ from the link's, or
       the reload falls back to DEF — which is the value being asserted, and the
       assertion cannot fail */
    const { ctx, page } = await open(SITE + "?lang=my", 390, "en", "en");
    const first = await page.evaluate(() => ({ lang: document.documentElement.lang, search: location.search }));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const again = await page.evaluate(() => ({ lang: document.documentElement.lang, search: location.search }));
    report("H4) a shared link in the default language survives a reload",
      first.lang === "my" && first.search === "?lang=my" &&
      again.lang === "my" && again.search === "?lang=my",
      { first, again });
    await ctx.close();
  }

  /* ---- H5) THE SHARE SURVIVES THE DOOR ----
     ?lang= exists so a studio can send a Thai client a link that arrives in
     Thai. Until v5.39.0 that worked because the landing WROTE hnk_ws_lang —
     the wrong mechanism, since merely opening the site then reset the language
     of the paid app. v5.39.0 removed the write and, with it, the journey:
     measured on both v5.39.0 and the first cut of v5.40.0, /?lang=th rendered
     a fully Thai landing whose own gold button opened the app in Burmese, for
     36 of 37 locales. The language rides the outbound link now and the app
     applies it for that visit only — so the share works AND nothing is stored. */
  for (const want of ["th", "ur"]) {
    const { ctx, page } = await open(SITE + "?lang=" + want, 390);
    const cta = await page.evaluate(() => {
      const a = document.querySelector('a[href^="app/"]');
      return { href: a && a.getAttribute("href"), siteLang: document.documentElement.lang };
    });
    await page.click('a[href^="app/"]');
    await page.waitForTimeout(2200);
    const app = await page.evaluate(() => ({
      lang: typeof LANG !== "undefined" ? LANG : "?",
      dir: document.documentElement.dir,
      stored: (() => { try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return "(blocked)"; } })(),
    }));
    report("H5) a shared ?lang=" + want + " link opens the APP in " + want + ", and still stores nothing",
      cta.siteLang === want && /lang=/.test(cta.href || "") &&
      app.lang === want && app.stored === null &&
      (want !== "ur" || app.dir === "rtl"),
      { cta, app });
    await ctx.close();
  }
  {
    /* and the default language must not put a redundant parameter on the link */
    const { ctx, page } = await open(SITE, 390);
    const href = await page.evaluate(() => {
      const a = document.querySelector('a[href^="app/"]');
      return a && a.getAttribute("href");
    });
    report("H6) the default language leaves the app links clean",
      href === "app/", { href });
    await ctx.close();
  }

  report("J) no console error or uncaught exception anywhere above",
    errs.length === 0, errs.slice(0, 4));

  await browser.close();
  try { server.kill(); } catch (e) {}
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
