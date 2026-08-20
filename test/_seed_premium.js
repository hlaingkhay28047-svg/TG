/* Shared test fixture — a signed-in studio with an active plan.

   WHY EVERY SWEEP NEEDS THIS FROM v5.30.0. The app is now account + Premium
   only: with no session it shows the login wall, and with a lapsed plan the buy
   wall, and in both cases it hides the tab bar, every page except pgHome and
   every card except the Account card. A sweep that opens the app cold no longer
   reaches the feature it is testing — it reaches the wall. Twenty existing
   sweeps failed exactly that way the first time the wall shipped.

   This is a FIXTURE, not a bypass. It seeds the same two localStorage records a
   real sign-in writes, so the app takes its ordinary signed-in path; nothing in
   the product knows or cares that a test put them there. Adding a
   "skip the wall when testing" flag to the app would have been the shortcut,
   and it would have shipped a way around the wall to production.

   USE (once per file, right after the browser is launched):

       const { withPremium } = require("./_seed_premium.js");
       const browser = await chromium.launch();
       withPremium(browser);          // every newPage() from here is signed in

   withPremium wraps the browser rather than asking each call site to remember,
   because several sweeps open three or four pages and one forgotten call is a
   confusing failure a long way from its cause.

   It wraps BOTH newPage and newContext. Eleven of the twenty sweeps do not call
   browser.newPage() at all — they call browser.newContext({viewport}) and then
   ctx.newPage(), because they need a device-sized viewport or a deviceScaleFactor.
   A wrapper that only knew about newPage left every one of those still staring at
   the wall, which is exactly how sweep_v492_gridfit.js kept failing after the
   first pass of this fixture. Seeding at the context level also covers pages the
   sweep never opens itself, such as popups. */

/* Far enough out that the fixture does not rot, close enough that it is
   obviously a fixture. Computed at require time, not hardcoded, so it can
   never quietly become a date in the past. */
function premiumProfile() {
  return {
    id: "u-test-fixture",
    name: "Test Studio",
    email: "fixture@example.com",
    created_at: "2025-01-01T00:00:00Z",
    plan_status: "active",
    plan_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    allowed_devices: 2,
  };
}

function premiumSession() {
  return {
    access: "test-fixture-access",
    refresh: "test-fixture-refresh",
    exp: Math.floor(Date.now() / 1000) + 3600,
    uid: "u-test-fixture",
    email: "fixture@example.com",
  };
}

/* Runs inside the page before any app script. Kept dependency-free and
   try/catch'd: a browser with storage disabled must not take the sweep down
   with it. */
function seedScript({ sess, prof }) {
  try {
    localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(sess));
    localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(prof));
    /* the login stamp the wall ages a session out against — without it the
       wall stamps "now" itself, which is fine, but being explicit keeps the
       fixture readable */
    localStorage.setItem("hnk_acc_login_at", String(Date.now()));
  } catch (e) {}
}

function seedArgs() {
  return { sess: premiumSession(), prof: premiumProfile() };
}

/* Wrap a launched browser so every page it opens is already signed in, however
   it opens it. Returns the same browser for chaining. Idempotent — wrapping
   twice is harmless.

   browser.newPage() internally creates a throwaway context, so the two wrappers
   below would both fire for that one call. addInitScript is additive, and
   running the seed twice writes the same three values twice, so the double is
   harmless — but it is guarded anyway so the page is not carrying a script it
   does not need. */
function withPremium(browser) {
  if (!browser || browser.__hnkPremiumWrapped) return browser;
  browser.__hnkPremiumWrapped = true;

  const origContext = browser.newContext.bind(browser);
  browser.newContext = async function (opts) {
    const ctx = await origContext(opts);
    ctx.__hnkPremiumSeeded = true;
    await ctx.addInitScript(seedScript, seedArgs());
    return ctx;
  };

  const origPage = browser.newPage.bind(browser);
  browser.newPage = async function (opts) {
    const page = await origPage(opts);
    const ctx = page.context();
    if (!ctx || !ctx.__hnkPremiumSeeded) {
      await page.addInitScript(seedScript, seedArgs());
    }
    return page;
  };

  return browser;
}

module.exports = { withPremium, seedScript, premiumSession, premiumProfile };
