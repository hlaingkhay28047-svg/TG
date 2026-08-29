/* v5.33.0 legal-pages sweep — the privacy policy still describes this code.

   WHY THIS FILE EXISTS AT ALL. A paid product that stores accounts, device
   records and payment screenshots shipped no privacy policy, no terms, and no
   way whatsoever to contact the studio: before this release the only outbound
   links anywhere on the site were Telegram and Facebook SHARE buttons, which
   post about the product rather than reach it.

   WHY IT IS A TEST AND NOT JUST TWO HTML FILES. A privacy policy that has
   drifted from the code is worse than none: it is a false statement made to
   customers, in writing, on the strength of which they hand over payment
   screenshots. The claims below are the load-bearing ones, and each is checked
   against the shipped source rather than taken on trust:

     "no analytics, no tracker, no third-party script"
         -> the app and the landing really do load nothing off-origin
     "your photos never reach our servers"
         -> the client uploads images only to provider hosts, and the one
            upload to our own Supabase is the payment screenshot
     "the device id is a random number, not a fingerprint"
         -> deviceId() really does come from accRandomId()
     "your API keys stay in your browser"
         -> keys are read from localStorage and posted only to provider hosts
     "your results stay in your browser"
         -> the gallery is IndexedDB, with no server mirror

   If a future wave adds an analytics snippet or an image upload, one of these
   fails and the policy has to be rewritten before the wave can ship. That is
   the whole point.

   Pinned contracts:
   A) Both pages exist, render, and show exactly one language at a time.
   B) The toggle switches the whole document, including <html lang>.
   C) Both pages request nothing off-origin.
   D) The contact routes are identical on both legal pages, the landing footer
      and the app, so none can be updated and the others forgotten.
   E) Every factual claim listed above is still true of the shipped code.
   F) Both pages are reachable from the landing and from inside the app.
   G) 320px wide: no sideways scroll, every link clears 44px.
   H) The two pages were emitted from one shell — their <style> and <script>
      blocks are byte-identical.
   I) v5.39.0 — OPENING A LEGAL PAGE DOES NOT RESET THE APP'S LANGUAGE. These
      pages show two languages; the app ships 37 and reads the same
      localStorage key. show() used to write that key on every load with the
      value clamped to my/en, so a Gujarati or Urdu customer who tapped
      "Privacy Policy" in the About panel found the whole paid Web Studio in
      English the next time they opened it — and an Urdu customer lost
      right-to-left with it. The key is read here, never written; an explicit
      tap on the toggle is remembered under the pages' own key instead.

   Usage: node test/sweep_v533_legal.js   (no server needed) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const PRIVACY = read("docs/privacy/index.html");
const TERMS = read("docs/terms/index.html");
const LANDING = read("docs/index.html");
const APP = read("docs/app/index.html");
const ORIGIN = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------- H) one shell, two pages ---------- */
const styleOf = s => (s.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const scriptOf = s => (s.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
report("H) both legal pages carry a byte-identical shell",
  styleOf(PRIVACY).length > 400 && styleOf(PRIVACY) === styleOf(TERMS) &&
  scriptOf(PRIVACY).length > 200 && scriptOf(PRIVACY) === scriptOf(TERMS),
  { styleEqual: styleOf(PRIVACY) === styleOf(TERMS), scriptEqual: scriptOf(PRIVACY) === scriptOf(TERMS) });

/* ---------- C) nothing off-origin ---------- */
const offOrigin = [];
for (const [name, body] of [["privacy", PRIVACY], ["terms", TERMS]]) {
  for (const m of body.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)) {
    const u = m[1];
    if (!/^(https?:)?\/\//.test(u)) continue;
    /* the contact routes are supposed to point outward; a SUBRESOURCE is not */
    const isLink = new RegExp('href\\s*=\\s*"' + u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"').test(body);
    if (!isLink) offOrigin.push({ name, u });
  }
  if (/<script[^>]+src=/.test(body) || /<link[^>]+stylesheet/.test(body)) offOrigin.push({ name, u: "external subresource" });
}
report("C) neither legal page loads a script, style or font from anywhere",
  offOrigin.length === 0, offOrigin);

/* ---------- D) one set of contact routes, everywhere ---------- */
/* The landing also carries SHARE buttons — t.me/share/url?... and
   facebook.com/sharer/sharer.php — which post ABOUT the product rather than
   reach it. They are not contact routes and must not be counted as one, or
   this assertion would pass while the landing named a different set of ways
   to get help than the policy did. */
const CONTACT_RE = /(https:\/\/www\.facebook\.com\/share\/[A-Za-z0-9]+\/|https:\/\/t\.me\/(?!share\b)[A-Za-z0-9_]+|https:\/\/www\.tiktok\.com\/@[A-Za-z0-9_.]+|tel:\+?[0-9]{6,})/g;
function routesIn(body) {
  return [...new Set([...body.matchAll(CONTACT_RE)].map(m => m[1]))].sort();
}
const surfaces = { privacy: routesIn(PRIVACY), terms: routesIn(TERMS), landing: routesIn(LANDING), app: routesIn(APP) };
const ref = surfaces.privacy;
const mismatched = Object.entries(surfaces).filter(([, v]) => JSON.stringify(v) !== JSON.stringify(ref)).map(([k]) => k);
report("D) all four surfaces name the same contact routes",
  ref.length >= 5 && mismatched.length === 0, surfaces);

/* the tiktok link the owner supplied carried _r/_t analytics params; a page
   that asks people to trust it should not hand a tracker back to them */
const tracky = Object.values(surfaces).flat().filter(u => /[?&](_r|_t|fbclid|utm_)=/.test(u));
report("D2) no contact link carries tracking parameters",
  tracky.length === 0, tracky);

/* ---------- E) the claims are still true ---------- */
const ANALYTICS = /gtag\(|googletagmanager|google-analytics|hotjar|mixpanel|segment\.com|connect\.facebook\.net|fbq\(|plausible\.io|posthog/i;
report("E1) the claim \"no analytics, no tracker, no third-party script\" holds",
  !ANALYTICS.test(APP) && !ANALYTICS.test(LANDING) &&
  !/<script[^>]+src="https?:/i.test(APP) && !/<script[^>]+src="https?:/i.test(LANDING),
  { app: ANALYTICS.test(APP), landing: ANALYTICS.test(LANDING) });

/* every absolute URL the client POSTs a body to */
/* v5.50.0 — one engine: the key goes to RunningHub and NOWHERE else. The
   retired providers' hosts must now be ABSENT from the app, which is the
   same privacy claim in its strongest form. */
const PROVIDER_HOSTS = ["www.runninghub.ai"];
const RETIRED_HOSTS = ["generativelanguage.googleapis.com", "api.openai.com"];
const ourUploads = [...APP.matchAll(/\/storage\/v1\/object\/([a-z-]+)/g)].map(m => m[1]);
/* v5.45.0 — the payment-proof upload left with the dead payment flow, so the
   claim now holds in its strongest form: the app writes to NO bucket at all. */
report("E2) the claim \"your photos never reach our servers\" holds — the app uploads to no bucket of ours at all",
  [...new Set(ourUploads)].length === 0,
  { bucketsWrittenTo: [...new Set(ourUploads)] });

const devIdFn = (APP.match(/function deviceId\(\)\{[\s\S]{0,400}?\n\}/) || [])[0] || "";
report("E3) the claim \"the device id is a random number, not a fingerprint\" holds",
  /accRandomId\(\)/.test(devIdFn) && !/userAgent|canvas|webgl|screen\.|fonts/i.test(devIdFn),
  { body: devIdFn.replace(/\s+/g, " ").slice(0, 150) });

report("E4) the claim \"your API key stays in your browser\" holds — the one provider base is present and the retired hosts are gone",
  PROVIDER_HOSTS.every(h => APP.indexOf(h) > 0) &&
  RETIRED_HOSTS.every(h => APP.indexOf(h) < 0) &&
  !/apiKey|api_key/.test((APP.match(/accFetch\([\s\S]{0,200}?apikey[\s\S]{0,200}?\)/) || [""])[0].replace(/apikey/g, "")),
  { providers: PROVIDER_HOSTS.filter(h => APP.indexOf(h) > 0),
    retiredStillPresent: RETIRED_HOSTS.filter(h => APP.indexOf(h) > 0) });

report("E5) the claim \"your results stay in your browser\" holds — the gallery is IndexedDB with no server mirror",
  /indexedDB\.open\("hnk_web_studio"/.test(APP) && ourUploads.length === 0,
  { idb: /indexedDB\.open\("hnk_web_studio"/.test(APP) });

/* ---------- F) reachable ---------- */
report("F) both pages are linked from the landing footer and from inside the app",
  /href="privacy\/"/.test(LANDING) && /href="terms\/"/.test(LANDING) &&
  /href="\/privacy\/"/.test(APP) && /href="\/terms\/"/.test(APP),
  { landingPrivacy: /href="privacy\/"/.test(LANDING), appPrivacy: /href="\/privacy\/"/.test(APP) });

/* ---------- the browser half ---------- */
(async () => {
  const browser = await chromium.launch();
  for (const [name, body, otherHref] of [["privacy", PRIVACY, "/terms/"], ["terms", TERMS, "/privacy/"]]) {
    for (const width of [320, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      await ctx.route(ORIGIN + "/**", route =>
        route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body }));
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(ORIGIN + "/" + name + "/", { waitUntil: "load" });
      await page.waitForTimeout(250);

      /* I) — seed a third-party app language and prove the page leaves it
         alone, both on load and after a real toggle press. gu is deliberate:
         it is one of the 35 locales these pages cannot show, which is exactly
         the case that was being silently overwritten. */
      await page.evaluate(() => { try { localStorage.setItem("hnk_ws_lang", "gu"); } catch (e) {} });
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(200);
      const langAfterLoad = await page.evaluate(() => {
        try { return localStorage.getItem("hnk_ws_lang"); } catch (e) { return "(blocked)"; }
      });
      await page.click('.langbar button[data-set="en"]');
      await page.waitForTimeout(150);
      const langAfterTap = await page.evaluate(() => {
        try {
          return { shared: localStorage.getItem("hnk_ws_lang"),
                   own: localStorage.getItem("hnk_legal_lang") };
        } catch (e) { return { shared: "(blocked)", own: "(blocked)" }; }
      });
      if (width === 390) {
        report("I) " + name + " never rewrites the app's language, on load or on a toggle press",
          langAfterLoad === "gu" && langAfterTap.shared === "gu" && langAfterTap.own === "en",
          { langAfterLoad, langAfterTap });
      }
      /* back to a clean slate for the assertions below, which expect the
         Burmese default to be what opens */
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(200);

      const shown = await page.evaluate(() => {
        const secs = [...document.querySelectorAll("[data-lang]")];
        return {
          total: secs.length,
          on: secs.filter(s => s.className === "on").map(s => s.getAttribute("data-lang")),
          htmlLang: document.documentElement.lang,
          h1: (document.querySelector("[data-lang].on h1") || {}).textContent,
        };
      });
      if (width === 390) {
        report("A) " + name + " renders exactly one language at a time",
          shown.total === 2 && shown.on.length === 1 && !!shown.h1 && shown.h1.length > 0, shown);

        await page.click('.langbar button[data-set="en"]');
        await page.waitForTimeout(150);
        const en = await page.evaluate(() => ({
          on: [...document.querySelectorAll("[data-lang]")].filter(s => s.className === "on").map(s => s.getAttribute("data-lang")),
          htmlLang: document.documentElement.lang,
          h1: (document.querySelector("[data-lang].on h1") || {}).textContent,
          pressed: [...document.querySelectorAll(".langbar button")].map(b => b.getAttribute("data-set") + "=" + b.getAttribute("aria-pressed")),
        }));
        report("B) " + name + " toggles the whole document, <html lang> included",
          en.on.join() === "en" && en.htmlLang === "en" && en.h1 !== shown.h1 &&
          en.pressed.join() === "my=false,en=true", en);
      }

      const fit = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        small: [...document.querySelectorAll("a, .langbar button")]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44; })
          .map(e => e.textContent.trim().slice(0, 24)),
      }));
      report("G) " + name + " at " + width + "px: no sideways scroll, every control clears 44px",
        fit.scrollW <= fit.innerW && fit.small.length === 0, fit);
      report("G2) " + name + " at " + width + "px raised no console error", errors.length === 0, errors.slice(0, 3));
      await ctx.close();
    }
  }
  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
