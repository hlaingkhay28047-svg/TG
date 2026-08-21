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
   G) Switching writes the URL, and the default language leaves it clean.
   H) The choice carries into the app, which reads the same storage key.
   I) No hreflang is emitted while every locale serves the same document.
   J) No console error in any of it.

   Usage: PORT=8931 SITE_PORT=8933 node test/sweep_v535_rtl_lang.js
          (serve docs/app on PORT and docs on SITE_PORT) */
const { chromium } = require("playwright-core");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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

  const browser = await chromium.launch();
  const errs = [];

  async function open(url, width, lang) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    await ctx.addInitScript(l => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        if (l) localStorage.setItem("hnk_ws_lang", l);
      } catch (e) {}
    }, lang || "");
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
    if (q === "?lang=th") report("H) the choice is stored where the app reads it", r.stored === "th", r);
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

  report("J) no console error or uncaught exception anywhere above",
    errs.length === 0, errs.slice(0, 4));

  await browser.close();
  try { server.kill(); } catch (e) {}
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
