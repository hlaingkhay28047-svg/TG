/* Shared test fixture — a signed-in studio with an active plan.

   WHY EVERY SWEEP NEEDS THIS FROM v5.30.0. The app is now account + Premium
   only: with no session it shows the login wall, and with a lapsed plan the buy
   wall, and in both cases it hides the tab bar, every page except pgHome and
   every card except the Account card. A sweep that opens the app cold no longer
   reaches the feature it is testing — it reaches the wall. Twenty existing
   sweeps failed exactly that way the first time the wall shipped.

   This is a FIXTURE, not a bypass. It seeds the same two localStorage records a
   real sign-in writes and answers Supabase the way a live project would, so the
   app takes its ordinary signed-in path; nothing in the product knows or cares
   that a test put them there. Adding a "skip the wall when testing" flag to the
   app would have been the shortcut, and it would have shipped a way around the
   wall to production.

   SEEDING localStorage ALONE IS NOT ENOUGH, and the way that failed is worth
   keeping. The first cut of this file only wrote the two records. It passed
   every sweep locally and failed in CI, on a test that has nothing to do with
   accounts, with every element measuring 0px wide. The difference was the
   network: this sandbox cannot reach the Supabase host at all, so accBoot's
   profile fetch THREW, which the app correctly reads as "offline, keep the
   cached session" — the fixture's session survived and the app opened. A GitHub
   runner has real internet, so the fixture's made-up token reached the real
   project and came back 401; accRefreshOnce POSTed the made-up refresh token,
   got a real non-2xx, returned "dead", and accSignOutLocal("expired") cleared
   the session. Wall on, everything 0px. A fixture whose result depends on
   whether the runner has internet is not a fixture, so this one now intercepts
   the Supabase host and answers it itself. The tests no longer care about the
   network, about the live project's contents, or about it being up at all.

   Interception is at the CONTEXT level via route() rather than a window.fetch
   shim on purpose. Several of these sweeps install their own fetch shims, and
   two shims fighting over who wraps whom is a bug that only shows up in one
   ordering; route() sits underneath all of them and catches XHR and subresource
   loads a fetch shim would miss.

   USE (once per file, right after the browser is launched):

       const { withPremium } = require("./_seed_premium.js");
       const browser = await chromium.launch();
       withPremium(browser);          // every page from here is signed in

   withPremium wraps the browser rather than asking each call site to remember,
   because several sweeps open three or four pages and one forgotten call is a
   confusing failure a long way from its cause.

   It wraps BOTH newPage and newContext. Eleven of the twenty sweeps do not call
   browser.newPage() at all — they call browser.newContext({viewport}) and then
   ctx.newPage(), because they need a device-sized viewport or a
   deviceScaleFactor. A wrapper that only knew about newPage left every one of
   those still staring at the wall, which is exactly how sweep_v492_gridfit.js
   kept failing after the first pass of this fixture. */
const fs = require("fs");
const path = require("path");

/* The API now lives on the page's own origin under /api, so there is no host to
   read out of the app and no port to guess — each sweep serves on its own port.
   This is a glob, not a URL: every caller appends a trailing wildcard, and the
   result matches the full request URL whatever the port happens to be.
   (Deliberately not spelled out with asterisks here — a star-slash inside a
   block comment ends the comment, which is exactly how this line broke once.) */
const SB_URL = "**/api";

const UID = "u-test-fixture";
const EMAIL = "fixture@example.com";

/* Far enough out that the fixture does not rot, close enough that it is
   obviously a fixture. Computed at call time, not hardcoded, so it can never
   quietly become a date in the past. */
function premiumProfile() {
  return {
    id: UID,
    name: "Test Studio",
    email: EMAIL,
    created_at: "2025-01-01T00:00:00Z",
    plan_status: "active",
    plan_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    allowed_devices: 2,
    is_admin: false,
  };
}

function premiumSession() {
  return {
    access: "test-fixture-access",
    refresh: "test-fixture-refresh",
    exp: Math.floor(Date.now() / 1000) + 3600,
    uid: UID,
    email: EMAIL,
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

/* The live project's answers, for the handful of endpoints accBoot touches.
   Everything else on the host gets an empty list rather than an error: an
   unmocked endpoint must not be able to fail a sweep that is testing something
   else, and a 401 in particular would sign the fixture out again. */
function routeSupabase(route) {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  const json = (body, status) => route.fulfill({
    status: status || 200,
    contentType: "application/json",
    body: JSON.stringify(body === undefined ? null : body),
  });

  if (url.indexOf("/auth/v1/token") >= 0) {
    /* a refresh that succeeds — the app rotates its session and stays signed in */
    return json({
      access_token: "test-fixture-access",
      refresh_token: "test-fixture-refresh",
      expires_in: 3600,
      user: { id: UID, email: EMAIL },
    });
  }
  if (url.indexOf("/auth/v1/logout") >= 0) return route.fulfill({ status: 204, body: "" });
  if (url.indexOf("/auth/v1/user") >= 0) return json({ id: UID, email: EMAIL });
  /* accLoadProfile asks with Accept: application/vnd.pgrst.object+json, so the
     live project answers with a bare object, not a one-element array */
  if (url.indexOf("/rest/v1/profiles") >= 0) return json(premiumProfile());
  if (url.indexOf("/rest/v1/devices") >= 0) {
    if (method === "POST") return json([{ id: "dev-fixture", user_id: UID }], 201);
    if (method === "DELETE") return route.fulfill({ status: 204, body: "" });
    return json([]);
  }
  if (url.indexOf("/storage/v1/") >= 0) return json({ Key: "payment-proofs/fixture" });
  return json([]);
}

function seedArgs() {
  return { sess: premiumSession(), prof: premiumProfile() };
}

async function armContext(ctx) {
  ctx.__hnkPremiumSeeded = true;
  await ctx.addInitScript(seedScript, seedArgs());
  await ctx.route(SB_URL + "/**", routeSupabase);
}

/* Wrap a launched browser so every page it opens is already signed in, however
   it opens it. Returns the same browser for chaining. Idempotent — wrapping
   twice is harmless.

   browser.newPage() internally creates a throwaway context, so the two wrappers
   below would both fire for that one call; the guard keeps the seed from being
   installed twice. */
function withPremium(browser) {
  if (!browser || browser.__hnkPremiumWrapped) return browser;
  browser.__hnkPremiumWrapped = true;

  const origContext = browser.newContext.bind(browser);
  browser.newContext = async function (opts) {
    const ctx = await origContext(opts);
    await armContext(ctx);
    return ctx;
  };

  const origPage = browser.newPage.bind(browser);
  browser.newPage = async function (opts) {
    const page = await origPage(opts);
    const ctx = page.context();
    if (ctx && !ctx.__hnkPremiumSeeded) await armContext(ctx);
    return page;
  };

  return browser;
}

module.exports = { withPremium, seedScript, premiumSession, premiumProfile, SB_URL, routeSupabase };
