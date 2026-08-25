/* v5.30.1 regression sweep — the wall doesn't leave orphaned UI standing next
   to it, and the admin panel's own success message actually translates.

   THREE DEFECTS, all found by an adversarial QC pass run AFTER v5.30.0 was
   already live in production — the wall's own tests were green, because none
   of them looked at anything outside the wall.

   1) #keyBanner ("add your API key") is a sibling of the .page stack — it
      lives in <main class="wrap"> before the first page div, so a visitor can
      add a key without opening a specific page. None of the wall's hiding
      rules (.tabbar, .page:not(#pgHome), #pgHome>.card, .fab-top) ever
      touched it, and it is driven purely by state.key, a BYOK localStorage
      value with no relation to login/Premium. Every walled visitor with no
      saved key — virtually everyone on a first visit — saw this gold,
      clickable-looking banner floating next to the login form. Tapping it
      scrolled toward #cardKey, which the wall hides: a silent no-op next to
      the one screen a new visitor is actually looking at.

   2) The first-run onboarding tour (#onb) is a fixed, 96%-opaque, full-
      viewport dialog shown unconditionally to anyone without
      localStorage.hnk_ws_onboarded. It carried no wall check at all, so a
      walled first-time visitor saw a 3-step app tour ("add your key", "pick a
      photo", "tap a workflow card") stacked ON TOP OF the login form the wall
      had just rendered — before they even have an account. Its own "add your
      key" button reused the identical dead scrollIntoView-to-a-hidden-card
      pattern as #keyBanner's.

   3) admReview()'s success path called t("acc_saved") — a key that was never
      defined anywhere in TR, TR_NEW or TR_L. t() returns the raw key on a
      miss, so every admin, in every language, saw the literal text
      "acc_saved" after approving or rejecting a payment, instead of any kind
      of confirmation.

   THE FIX, in each case:
   1) `body.wall .keybanner{display:none}` — hidden at the source, the same
      way `.fab-top` already was. state.key/updateKeyBanner() were left alone;
      they have nothing to do with login or Premium and should not learn about
      either.
   2) The boot-time onboarding trigger now also checks
      `!document.body.classList.contains("wall")`. A new helper,
      appWallShowOnboardingIfDue(), runs from every "wall just came down"
      branch in appWallApply() and shows the tour exactly once, at the point
      #cardKey is actually visible again — so the CTA works when it fires.
   3) admReview() now calls admL({...}) with the same nine languages the rest
      of the admin panel already uses (my/en/shn/kac/th/zh/vi/id/ms), wording
      matched to the already-shipped pt_saved_gal "saved" translations rather
      than inventing new vocabulary.

   Pinned contracts:
   A) Walled, no key saved: #keyBanner never becomes visible.
   B) Not walled (Premium, active): #keyBanner behaves exactly as before —
      visible when no key is saved. This is the no-regression half; it is the
      one that would catch "fixed" by always hiding the banner.
   C) Walled, never onboarded: the onboarding tour does not appear.
   D) The wall comes down for a never-onboarded visitor: the tour appears
      then, at a point where #cardKey is actually reachable.
   E) admReview's success message is real, human text — never the literal
      string "acc_saved" — checked in three of the nine admin-panel languages
      (en, my, th) so a single accidentally-correct language cannot hide a
      broken fourth.
   F) No page errors in any state.

   Usage: PORT=8931 node test/sweep_v5301_wallqc.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const { SB_URL, withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* ---- source contracts, so a later refactor that deletes the guard fails
   loudly here rather than only in a browser run ---- */
report("source: body.wall hides #keyBanner",
  /body\.wall \.keybanner\{display:none\}/.test(src), { found: /\.keybanner\{display:none\}/.test(src) });
report("source: the boot onboarding trigger checks the wall before showing",
  /hnk_ws_onboarded"\) && !document\.body\.classList\.contains\("wall"\)/.test(src),
  { found: /hnk_ws_onboarded"\)\s*&&\s*!document\.body\.classList\.contains\("wall"\)/.test(src) });
report("source: appWallShowOnboardingIfDue exists and runs from the wall-lifted branch",
  /function appWallShowOnboardingIfDue\(\)/.test(src) && /if \(!on\) appWallShowOnboardingIfDue\(\);/.test(src),
  { fn: /function appWallShowOnboardingIfDue/.test(src), wired: /if \(!on\) appWallShowOnboardingIfDue/.test(src) });
report("source: admReview no longer calls the undefined t(\"acc_saved\") key",
  /* the call SITE, not the word — this file's own comment above explains the
     history and legitimately contains the string "acc_saved" in prose */
  !/setSt\("stAdm",\s*t\("acc_saved"\)/.test(src),
  { stillPresent: /setSt\("stAdm",\s*t\("acc_saved"\)/.test(src) });
report("source: admReview's save confirmation goes through admL()",
  /setSt\("stAdm", admL\(\{my:"[^"]*✓",en:"Saved ✓"/.test(src),
  { found: /admL\(\{my:"[^"]*✓",en:"Saved ✓"/.test(src) });

/* Every Supabase call answered locally — signed-out boot still fires an anon
   settings/price read, and this file has no business depending on whether the
   sandbox it runs in has internet (see _seed_premium.js's own postmortem). */
async function armSupabase(page, mode, prof) {
  await page.route(SB_URL + "/**", route => {
    const url = route.request().url();
    const json = body => route.fulfill({ status: 200, contentType: "application/json",
                                         body: JSON.stringify(body === undefined ? null : body) });
    if (url.indexOf("/auth/v1/token") >= 0) {
      return json({ access_token: "test.jwt", refresh_token: "test-refresh",
                    expires_in: 3600, user: { id: "u-test", email: "t@example.com" } });
    }
    if (url.indexOf("/rest/v1/profiles") >= 0) return json(prof || null);
    return json([]);
  });
}

const errs = [];
const future = new Date(Date.now() + 30 * 86400000).toISOString();

(async () => {
  /* TWO browsers, deliberately. withPremium() wraps browser.newPage/newContext
     for the lifetime of the browser instance it is given — that is the whole
     point of it (see _seed_premium.js), but it means calling it once makes
     EVERY later newPage() on that same browser sign in as Premium, including
     ones that are supposed to be testing a signed-OUT first visit. A first
     draft of this file called withPremium(browser) for assertion B and then
     could not reproduce the wall at all in C/D — not an app bug, a test bug:
     every "signed-out" page after that call was quietly already signed in. */
  const browser = await chromium.launch();
  const premiumBrowser = withPremium(await chromium.launch());

  /* ---- A) walled, no key: the banner must never show ---- */
  {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
    page.on("pageerror", e => errs.push("A: " + String(e).slice(0, 160)));
    await armSupabase(page, "login", null);
    await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
    await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const el = document.getElementById("keyBanner");
      return {
        wall: document.body.classList.contains("wall"),
        hasKey: !!(window.state && state.key),
        bannerVisible: !!(el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0),
      };
    });
    report("A) #keyBanner never shows while walled, even with no key saved",
      r.wall === true && r.hasKey === false && r.bannerVisible === false, r);
    await page.close();
  }

  /* ---- B) not walled (Premium): the banner behaves as it always did ---- */
  {
    const page = await premiumBrowser.newPage({ viewport: { width: 412, height: 900 } });
    page.on("pageerror", e => errs.push("B: " + String(e).slice(0, 160)));
    await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
    await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const el = document.getElementById("keyBanner");
      return {
        wall: document.body.classList.contains("wall"),
        hasKey: !!(window.state && state.key),
        bannerVisible: !!(el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0),
      };
    });
    report("B) not walled: #keyBanner still shows with no key saved (no regression)",
      r.wall === false && r.hasKey === false && r.bannerVisible === true, r);
    await page.close();
  }

  /* ---- C) walled, never onboarded: the tour must not appear ---- */
  {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
    page.on("pageerror", e => errs.push("C: " + String(e).slice(0, 160)));
    await armSupabase(page, "login", null);
    /* deliberately no hnk_ws_onboarded — a genuine first-ever visit */
    await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const el = document.getElementById("onb");
      return {
        wall: document.body.classList.contains("wall"),
        onbOn: !!(el && el.className.indexOf(" on") >= 0),
      };
    });
    report("C) the onboarding tour does not appear over a walled first visit",
      r.wall === true && r.onbOn === false, r);
    await page.close();
  }

  /* ---- D) the wall lifts for a never-onboarded visitor: the tour appears
     then, and #cardKey is actually reachable at that point ---- */
  {
    const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
    page.on("pageerror", e => errs.push("D: " + String(e).slice(0, 160)));
    await armSupabase(page, "login", null);
    await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const before = await page.evaluate(() => {
      const el = document.getElementById("onb");
      return { wall: document.body.classList.contains("wall"), onbOn: !!(el && el.className.indexOf(" on") >= 0) };
    });
    /* simulate a successful sign-in with an active plan, the same way
       sweep_v530_accesswall.js's own "wall lifts" assertion does */
    const after = await page.evaluate(() => {
      acc.sess = { access: "a", refresh: "r", uid: "u-test", email: "t@example.com",
                   exp: Math.floor(Date.now() / 1000) + 3600 };
      acc.profile = { id: "u-test", plan_status: "active",
                       plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() };
      appWallApply();
      const el = document.getElementById("onb");
      const card = document.getElementById("cardKey");
      return {
        wall: document.body.classList.contains("wall"),
        onbOn: !!(el && el.className.indexOf(" on") >= 0),
        cardKeyVisible: !!(card && getComputedStyle(card).display !== "none"),
      };
    });
    report("D) the deferred tour appears once the wall actually lifts, with its target reachable",
      before.wall === true && before.onbOn === false &&
      after.wall === false && after.onbOn === true && after.cardKeyVisible === true,
      { before, after });
    await page.close();
  }

  /* ---- E) admReview's success message is real text in three languages ---- */
  {
    const results = {};
    for (const lang of ["en", "my", "th"]) {
      const page = await premiumBrowser.newPage({ viewport: { width: 412, height: 900 } });
      page.on("pageerror", e => errs.push("E:" + lang + ": " + String(e).slice(0, 160)));
      await page.addInitScript(l => { try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_ws_lang", l);
      } catch (e) {} }, lang);
      await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      /* drive admReview() directly with a synthetic row — this pins the
         translated text itself, independent of the RLS 403 path (see
         sweep_v530_accesswall.js assertion K for that half) */
      const text = await page.evaluate(async () => {
        acc.profile = acc.profile || {};
        acc.profile.is_admin = true;
        const origFetch = window.fetch;
        window.fetch = function (u, o) {
          if (String(u).indexOf("/rest/v1/payment_requests") >= 0) {
            return Promise.resolve(new Response(JSON.stringify([{ id: "r1", status: "approved" }]),
              { status: 200, headers: { "Content-Type": "application/json" } }));
          }
          return origFetch.apply(this, arguments);
        };
        await admReview({ id: "r1" }, "approved", "", null);
        window.fetch = origFetch;
        const st = document.getElementById("stAdm");
        return st ? st.textContent : "(no #stAdm)";
      });
      results[lang] = text;
      await page.close();
    }
    const bad = Object.entries(results).filter(([, t]) => !t || t.indexOf("acc_saved") >= 0 || t.trim() === "");
    report("E) the admin save confirmation is real translated text, not the raw key",
      bad.length === 0, results);
  }

  report("F) no page errors in any state", errs.length === 0, errs.slice(0, 5));

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  await premiumBrowser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
