/* v5.30.0 regression sweep — the app is account + Premium only.

   WHAT THE OWNER ASKED FOR, verbatim: open the website -> require login;
   check Premium; no Premium -> send them to the buy page; has Premium -> let
   them in; and keep checking the session, so an expired plan or a stale login
   asks for a login again.

   HOW IT IS BUILT, and why it matters for this file. The wall is NOT an
   overlay with its own copy of the login form. accLogin() and accSignup() read
   #accEmail/#accPass directly and the buy flow owns a dozen more ids, all of
   them already translated into every language the app ships. A second form
   would be a second thing to keep in step forever. So the wall instead HIDES
   everything except the Account card the user already needs — which means the
   assertions below are mostly about what is NOT on screen.

   THE STATE MACHINE, all five branches asserted:
     no session .................. "login"
     session, profile not read ... "checking"   <- deliberately its own state
     session + active plan ....... ""           <- open, no wall
     session + expired plan ...... "buy"        <- "your Premium has ended"
     session + never bought ...... "buy"        <- "Premium required"

   "checking" exists because treating unknown as "buy" flashes a payment demand
   at a paying customer for the length of one round trip. And the last two
   differ in wording on purpose: telling a lapsed customer they have never paid
   is both insulting and false.

   OFFLINE IS NOT UNPAID. isPremium() reads the cached profile, so a paying
   studio on a bad Mandalay connection keeps working; only a profile that has
   actually been read and actually says lapsed closes the door. E asserts it.

   Pinned contracts:
   A) The five states resolve as above.
   B) When walled: the tab bar is gone, every non-Account card on pgHome is
      gone, every other page is gone, and the view is forced to pgHome — there
      is no way around it by navigating.
   C) When NOT walled the app is untouched: tab bar back, cards back. This is
      the no-regression half, and the one that would catch a wall that never
      lifts.
   D) Expired and never-bought say different things.
   E) A cached active profile with the network down still opens the app.
   F) The login stamp is what ages a session out, not sess.exp — refresh keeps
      pushing sess.exp forward forever, so it can never answer "how long since
      this person typed a password".
   G) No page errors in any state.

   Usage: PORT=8931 node test/sweep_v530_accesswall.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const { SB_URL } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APP, "index.html"), "utf8");

/* ---- F) source contract: the age stamp is its own thing ---- */
report("F) session age is measured from its own login stamp, not sess.exp",
  /var WALL_LS_SINCE = "hnk_acc_login_at";/.test(src) &&
  /function wallLoginAge\(\)/.test(src) &&
  /wallLoginAge\(\) > WALL_MAXAGE_MS/.test(src),
  { stamp: /WALL_LS_SINCE/.test(src), age: /function wallLoginAge/.test(src) });
report("F2) a pre-v5.30 session is stamped rather than logged straight out",
  /if \(!v\)\{[\s\S]{0,140}wallStampLogin\(\); return 0;/.test(src), {});

const SESS = { access: "test.jwt", refresh: "test-refresh",
               exp: Math.floor(Date.now() / 1000) + 3600, uid: "u-test", email: "t@example.com" };
const future = new Date(Date.now() + 20 * 86400000).toISOString();
const past = new Date(Date.now() - 3 * 86400000).toISOString();

const errs = [];

/* Answer Supabase inside the test instead of letting the request leave the
   machine. This is not tidiness — without it this file passes or fails
   depending on whether the runner has internet, and it would fail on CI. The
   sessions below carry a made-up token; a sandbox with no route to the host
   makes the fetch THROW, which the app reads as "offline, keep the cached
   session", so every state resolves as seeded. A GitHub runner reaches the real
   project, gets a real 401, POSTs the made-up refresh token, gets a real
   non-2xx, and accSignOutLocal("expired") clears the session — so `open`,
   `expired` and `never` would all collapse into `login` and four assertions
   would fail for a reason that has nothing to do with the wall.

   The three modes are the three things the app can actually be told:
     normal      the profile comes back and says what the test seeded
     hangProfile the request never settles — which is precisely what
                 "signed in, profile not read yet" IS, so the `checking`
                 state is modelled rather than raced
     offline     the request fails outright, the dropped-connection case E
                 exists to pin */
async function armSupabase(page, prof, mode) {
  await page.route(SB_URL + "/**", route => {
    const url = route.request().url();
    const json = body => route.fulfill({ status: 200, contentType: "application/json",
                                         body: JSON.stringify(body === undefined ? null : body) });
    if (mode === "offline") return route.abort("internetdisconnected");
    if (url.indexOf("/auth/v1/token") >= 0) {
      return json({ access_token: "test.jwt", refresh_token: "test-refresh",
                    expires_in: 3600, user: { id: "u-test", email: "t@example.com" } });
    }
    if (url.indexOf("/rest/v1/profiles") >= 0) {
      /* deliberately never settled: an in-flight profile read is the state */
      if (mode === "hangProfile") return;
      return json(prof);
    }
    return json([]);
  });
}

async function look(browser, sess, prof, label) {
  const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
  page.on("pageerror", e => errs.push(label + ": " + String(e).slice(0, 160)));
  await armSupabase(page, prof, prof ? "normal" : "hangProfile");
  await page.addInitScript(({ s, p }) => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      if (s) localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
      if (p) localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(p));
    } catch (e) {}
  }, { s: sess, p: prof });
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const vis = sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== "none"; };
    const otherPagesShown = Array.from(document.querySelectorAll(".page"))
      .filter(e => e.id !== "pgHome" && getComputedStyle(e).display !== "none").map(e => e.id);
    const otherCardsShown = Array.from(document.querySelectorAll("#pgHome > .card"))
      .filter(e => e.id !== "cardAccount" && getComputedStyle(e).display !== "none").map(e => e.id);
    return {
      wall: document.body.classList.contains("wall"),
      state: (typeof appWallState === "function") ? appWallState() : "(no wall)",
      head: ((document.getElementById("wallH") || {}).textContent || "").trim(),
      tabbar: vis(".tabbar"),
      account: vis("#cardAccount"),
      note: vis("#wallNote"),
      otherPagesShown, otherCardsShown,
      page: (document.querySelector(".page.on") || {}).id,
      /* the one door out of the wall */
      logoutReachable: (function(){ var e = document.getElementById("btnAccLogout");
        return !!e && e.getClientRects().length > 0; })(),
      adminCard: (function(){ var e = document.getElementById("cardAdmin");
        return !!e && getComputedStyle(e).display !== "none"; })(),
      isAdmin: (typeof admIsAdmin === "function") ? admIsAdmin() : "(none)",
    };
  });
  await page.close();
  return r;
}

(async () => {
  const browser = await chromium.launch();

  const out = {
    login:    await look(browser, null, null, "login"),
    checking: await look(browser, SESS, null, "checking"),
    open:     await look(browser, SESS, { id: "u-test", plan_status: "active", plan_expires_at: future }, "open"),
    expired:  await look(browser, SESS, { id: "u-test", plan_status: "active", plan_expires_at: past }, "expired"),
    never:    await look(browser, SESS, { id: "u-test", plan_status: "none", plan_expires_at: null }, "never"),
  };

  /* ---- A ---- */
  report("A) all five account states resolve to the right wall state",
    out.login.state === "login" && out.checking.state === "checking" &&
    out.open.state === "" && out.expired.state === "buy" && out.never.state === "buy",
    Object.keys(out).reduce((a, k) => (a[k] = out[k].state, a), {}));

  /* ---- B: walled means there is no way round it ---- */
  const walled = ["login", "checking", "expired", "never"];
  const leaks = walled.filter(k => {
    const r = out[k];
    return !r.wall || r.tabbar || !r.account || !r.note ||
           r.otherPagesShown.length || r.otherCardsShown.length || r.page !== "pgHome";
  });
  report("B) a walled app hides the tab bar, every other page and every other card",
    leaks.length === 0,
    leaks.map(k => ({ state: k, tabbar: out[k].tabbar, pages: out[k].otherPagesShown, cards: out[k].otherCardsShown, page: out[k].page })));

  /* ---- C: the no-regression half ---- */
  report("C) an active plan leaves the app completely untouched",
    out.open.wall === false && out.open.tabbar === true &&
    out.open.otherCardsShown.length > 0 && out.open.note === false,
    out.open);

  /* ---- D ---- */
  report("D) 'your Premium ended' and 'Premium required' are different messages",
    !!out.expired.head && !!out.never.head && out.expired.head !== out.never.head,
    { expired: out.expired.head, never: out.never.head });

  /* ---- H: the way out must stay open ----
     Sign-out lives inside accGrpAuth, which accBoot collapses the moment there
     IS a session. The first cut of this wall opened only accGrpBuy, so a
     signed-in-but-unpaid user faced a wall whose only exit had just been hidden
     by the wall itself — anyone who signed into the wrong account was stuck.
     sweep_account.js caught it by failing to click a button that was no longer
     visible; this pins the behaviour rather than the symptom. */
  const stranded = ["expired", "never"].filter(k => !out[k].logoutReachable);
  report("H) a signed-in user behind the wall can always sign out",
    stranded.length === 0,
    stranded.map(k => ({ state: k, logoutReachable: out[k].logoutReachable })));

  /* ---- E: offline is not unpaid ---- */
  const offlinePage = await browser.newPage({ viewport: { width: 412, height: 900 } });
  offlinePage.on("pageerror", e => errs.push("offline: " + String(e).slice(0, 160)));
  /* every Supabase call fails outright — a studio whose connection dropped */
  await armSupabase(offlinePage, null, "offline");
  await offlinePage.addInitScript(({ s, p }) => {
    try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
      localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(p));
    } catch (e) {}
  }, { s: SESS, p: { id: "u-test", plan_status: "active", plan_expires_at: future } });
  await offlinePage.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  await offlinePage.waitForTimeout(1200);
  await offlinePage.context().setOffline(true);
  await offlinePage.evaluate(() => { window.dispatchEvent(new Event("offline")); });
  await offlinePage.waitForTimeout(600);
  const off = await offlinePage.evaluate(() => ({ wall: document.body.classList.contains("wall"), state: (typeof appWallState === "function") ? appWallState() : "(no wall)" }));
  await offlinePage.context().setOffline(false);
  await offlinePage.close();
  report("E) a paying studio whose connection drops keeps working",
    off.wall === false && off.state === "", off);

  /* ---- I: the admin panel ---- */
  const adminOpen   = await look(browser, SESS, { id: "u-test", plan_status: "active", plan_expires_at: future, is_admin: true }, "adminOpen");
  const adminLapsed = await look(browser, SESS, { id: "u-test", plan_status: "none", plan_expires_at: null, is_admin: true }, "adminLapsed");

  report("I) the admin panel is admin-only",
    out.open.adminCard === false && out.open.isAdmin === false &&
    adminOpen.adminCard === true && adminOpen.isAdmin === true,
    { nonAdmin: out.open.adminCard, admin: adminOpen.adminCard });

  /* The trap this catches: the wall hides every card on pgHome except the
     Account card, and an admin whose own plan lapsed would otherwise be locked
     out of the one panel that can approve their own renewal. It took two goes —
     `body.wall #pgHome>#cardAdmin{display:block}` LOSES to
     `...:not(#cardAccount)`, because the id inside :not() counts. */
  report("J) an admin whose own plan lapsed can still reach the panel",
    adminLapsed.wall === true && adminLapsed.adminCard === true,
    { wall: adminLapsed.wall, adminCard: adminLapsed.adminCard });

  /* ---- K: the client must not extend the plan itself ---- */
  report("K) approving writes only the review fields — the plan is the trigger's job",
    /var body = \{ status: status, reviewed_at: new Date\(\)\.toISOString\(\),\s*reviewed_by: acc\.sess\.uid, note: note \|\| null \};/.test(src) &&
    /* the colon matters: admReview's own comment NAMES plan_expires_at to
       explain who owns it, and a bare-word search flags that prose as a write */
    !/admReview[\s\S]{0,1200}plan_expires_at\s*:/.test(src) &&
    !/admReview[\s\S]{0,1200}plan_status\s*:/.test(src),
    { onlyReviewFields: /reviewed_by: acc\.sess\.uid, note: note \|\| null \};/.test(src) });

  /* ---- L: the half that is not in this repo at runtime ---- */
  const sqlPath = path.join(__dirname, "..", "supabase", "schema.sql");
  const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, "utf8") : "";
  report("L) the RLS that actually enforces any of this ships with the repo",
    /create policy payreq_update_admin_only/.test(sql) &&
    /using \(public\.hnk_is_admin\(\)\)/.test(sql) &&
    /create trigger hnk_apply_payment/.test(sql) &&
    /security definer/.test(sql),
    { found: !!sql, adminOnlyUpdate: /payreq_update_admin_only/.test(sql), trigger: /hnk_apply_payment/.test(sql) });

  /* ---- M/N/O: the wall has to be a REDIRECT, not just a set of hide rules ----

     Found by an adversarial review after this file was already green, which is
     the point of running one. The wall hides every page but #pgHome. It does
     NOT stop anything from making another page the active one — and #wallNote
     and #cardAccount live inside #pgHome, so the moment .on moves off #pgHome
     the login form the wall exists to show goes invisible with it. The target
     page is hidden by the wall's !important rule and #pgHome by the plain
     .page{display:none}: a completely blank app.

     This is not a corner. docs/index.html's six feature cards link to
     app/?page=pgRetouch and friends, and manifest.webmanifest ships three PWA
     shortcuts in the same form, so it is the first thing a new customer sees.
     Measured on the tree before the fix: 0 visible elements below the header.
     Nothing re-applied the wall for up to five minutes either, because accBoot
     returns early when there is no session.

     M pins the deep link, N pins Android Back (popstate has the same power to
     move .on), and O pins the other half of the fix — being sent to Home
     instead of the page you clicked is only acceptable if signing in then takes
     you there. */
  const DEEP = ["pgWf", "pgRetouch", "pgCreate"];
  const deep = [];
  for (const target of DEEP) {
    const dp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    dp.on("pageerror", e => errs.push("deep:" + target + ": " + String(e).slice(0, 160)));
    await armSupabase(dp, null, "normal");
    await dp.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); } catch (e) {} });
    await dp.goto("http://127.0.0.1:" + PORT + "/?page=" + target, { waitUntil: "networkidle" });
    await dp.waitForTimeout(1200);
    const seen = sel => dp.evaluate(x => {
      const e = document.querySelector(x);
      return !!e && getComputedStyle(e).display !== "none" && e.getClientRects().length > 0;
    }, sel);
    deep.push({
      target,
      page: await dp.evaluate(() => (typeof curPage !== "undefined" ? curPage : "(none)")),
      wall: await dp.evaluate(() => document.body.classList.contains("wall")),
      wallNote: await seen("#wallNote"),
      loginBtn: await seen("#btnAccLogin"),
      /* the measurement that actually caught it: is ANYTHING on screen? */
      visibleInMain: await dp.evaluate(() => Array.from(document.querySelectorAll(".page.on *"))
        .filter(e => getComputedStyle(e).display !== "none" && e.getClientRects().length).length),
    });

    /* N — Back, from the same page. popstate calls switchPage(pg, true), which
       before the guard moved .on exactly the way the deep link did. */
    await dp.evaluate(() => { try { history.pushState({ pg: "pgCreate" }, ""); } catch (e) {} });
    await dp.goBack().catch(() => {});
    await dp.waitForTimeout(400);
    deep[deep.length - 1].afterBack = {
      page: await dp.evaluate(() => (typeof curPage !== "undefined" ? curPage : "(none)")),
      loginBtn: await seen("#btnAccLogin"),
    };

    /* O — the wall comes down. The customer must land on what they clicked. */
    const landed = await dp.evaluate(t => {
      try {
        acc.profile = { id: "u-test", plan_status: "active",
                        plan_expires_at: new Date(Date.now() + 86400000 * 30).toISOString() };
        acc.sess = acc.sess || { access: "a", refresh: "r", uid: "u-test", email: "t@example.com",
                                 exp: Math.floor(Date.now() / 1000) + 3600 };
        appWallApply();
      } catch (e) { return "(threw) " + e; }
      return curPage;
    }, target);
    deep[deep.length - 1].afterUnlock = landed;
    await dp.close();
  }

  const blank = deep.filter(d => !(d.page === "pgHome" && d.wall === true && d.wallNote &&
                                   d.loginBtn && d.visibleInMain > 0));
  report("M) a deep link into a walled app still shows the login form, not a blank page",
    blank.length === 0, blank);

  const backBroken = deep.filter(d => !(d.afterBack.page === "pgHome" && d.afterBack.loginBtn));
  report("N) Back behind the wall cannot blank the app either",
    backBroken.length === 0, deep.map(d => ({ target: d.target, afterBack: d.afterBack })));

  /* Both halves, deliberately: without the redirect the app never left the
     target page, so "landed on the target" would be trivially true and O would
     pass on the broken tree while M and N failed. Requiring that it was parked
     on pgHome FIRST is what makes this assertion able to fail on its own. */
  const lost = deep.filter(d => !(d.page === "pgHome" && d.afterUnlock === d.target));
  report("O) once the wall lifts they land on the page they originally asked for",
    lost.length === 0,
    deep.map(d => ({ asked: d.target, parkedOn: d.page, landedOn: d.afterUnlock })));

  /* ---- P: the INSERT half of the plan guard ----
     Section 3's insert policy checks only `id = auth.uid()`, so without a
     BEFORE INSERT guard a user whose profile row does not exist yet can create
     it with is_admin = true and hand themselves the approval panel. The shipped
     client only ever SELECTs from profiles, but the policy grants the right
     whatever the client chooses to do with it. */
  report("P) a self-inserted profile cannot arrive pre-approved or pre-admin",
    /create trigger hnk_guard_profile_insert/.test(sql) &&
    /before insert on public\.profiles/.test(sql) &&
    /tg_op = 'INSERT'/.test(sql),
    { insertTrigger: /hnk_guard_profile_insert/.test(sql), branch: /tg_op = 'INSERT'/.test(sql) });

  /* ---- G ---- */
  report("G) no page errors in any state", errs.length === 0, errs.slice(0, 5));

  /* Measured, not asserted from memory: docs/app/index.html at c7e519b served on
     its own port, this file run against it. A/B/D/E/H/I/J fail because none of
     the wall exists — appWallState is undefined so every state reads
     "(no wall)", the tab bar and pgDash stay on screen for a signed-out
     visitor, both buy headings are empty, logout is unreachable in both unpaid
     states, and the admin card is absent for admin and non-admin alike.
     M/N/O fail differently and are worth reading: on v5.29.0 the deep link
     lands on a page that renders perfectly well (322 visible elements on pgWf),
     because with no wall there is nothing to be blank behind — they fail on the
     login form not being there, which is the v5.29.0 defect this whole wave
     exists to fix. F/F2/C/K/L/P/G pass on the old tree: F/F2 because
     wallLoginAge stamps a missing key rather than trusting one, C because an
     active plan is supposed to change nothing, and K/L/P because they read
     supabase/schema.sql out of the repo rather than the running app. */
  console.log("      (on the v5.29.0 tree at c7e519b this file reports 10 failures: " +
    "A B D E H I J M N O)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
