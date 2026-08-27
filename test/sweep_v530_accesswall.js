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

   UNIFIED ACCESS FAILS CLOSED. The legacy profile cache remains available for
   account copy, but it cannot authorize AI Tools when the authoritative
   entitlement endpoint is unreachable. E asserts that the wall closes while
   the secure session survives for a retry.

   Pinned contracts:
   A) The five states resolve as above.
   B) When walled: the tab bar is gone, every non-Account card on pgHome is
      gone, every other page is gone, and the view is forced to pgHome — there
      is no way around it by navigating.
   C) When NOT walled the app is untouched: tab bar back, cards back. This is
      the no-regression half, and the one that would catch a wall that never
      lifts.
   D) Expired and never-bought say different things.
   E) A cached active profile cannot bypass an unavailable unified verdict.
   F) The login stamp is what ages a session out, not sess.exp — refresh keeps
      pushing sess.exp forward forever, so it can never answer "how long since
      this person typed a password".
   G) No page errors in any state.
   W) v5.39.0 — THE WALLED DOOR HAS A HANDLE. Every outbound human route in
      the app lives inside #cardAbout, which the wall hides, so a customer who
      had paid and was waiting on an admin saw a payment demand above a shut
      door with the studio's own Telegram and phone numbers display:none on
      the same page. #wallHelp carries those links in every wall state, and it
      CLONES them from the About card so a phone number still has one home.
   W3) The "checking" wall says something and offers a way to act on it. It
      used to be a heading with an empty paragraph under it and no control.

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
    /* Legacy wall-state probes deliberately opt out of v5.43 enforcement.
       Dedicated tests below cover unified verdicts; a 404 is the supported
       compatibility response, while a 200 [] would be a malformed verdict. */
    if (url.indexOf("/api/v1/") >= 0) {
      return route.fulfill({ status: 404, contentType: "application/json",
                             body: JSON.stringify({ error: "not_found" }) });
    }
    /* v5.37.0 — two failure shapes the old three modes could not express, both
       of which the app used to read as a verdict rather than an outage:
         tokenBoom     the token endpoint ANSWERS 503
         profileOnce   the FIRST profile read is dropped, later ones succeed */
    if (mode === "tokenBoom" && url.indexOf("/auth/v1/token") >= 0) {
      return route.fulfill({ status: 503, contentType: "application/json",
                             body: JSON.stringify({ error: "service unavailable" }) });
    }
    /* v5.39.0 — the first profile read never settles, later ones answer. That
       is the state the retry button exists for: the app is stuck on
       "checking" and only a NEW request can move it. */
    if (mode === "hangThenOk" && url.indexOf("/rest/v1/profiles") >= 0) {
      if (!page.__hangHit) { page.__hangHit = 1; return; }
      return json(prof);
    }
    if (mode === "profileOnce" && url.indexOf("/rest/v1/profiles") >= 0) {
      if (!page.__profileHit) { page.__profileHit = 1; return route.abort("connectionreset"); }
      return json(prof);
    }
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
      /* v5.39.0 — the contact + legal routes, as they render behind the wall */
      help: (function(){
        var box = document.getElementById("wallHelp");
        var out = { count: 0, visible: 0, hrefs: [] };
        if (!box) return out;
        var a = box.getElementsByTagName("a"), i;
        out.count = a.length;
        var docW = document.documentElement.clientWidth, r;
        out.small = 0; out.outside = 0;
        for (i = 0; i < a.length; i++){
          out.hrefs.push(a[i].getAttribute("href") || "");
          if (a[i].getClientRects().length > 0) out.visible++;
          r = a[i].getBoundingClientRect();
          /* a contact route nobody can hit is not a contact route */
          if (r.height < 44) out.small++;
          if (r.left < 0 || r.right > docW + 1) out.outside++;
        }
        return out;
      })(),
      /* ...and the single source they are supposed to be copies of */
      aboutHrefs: (function(){
        var ids = ["aboutLegal", "aboutContacts"], out = [], k, i, el, a;
        for (k = 0; k < ids.length; k++){
          el = document.getElementById(ids[k]); if (!el) continue;
          a = el.getElementsByTagName("a");
          for (i = 0; i < a.length; i++) out.push(a[i].getAttribute("href") || "");
        }
        return out;
      })(),
      noteP: ((document.getElementById("wallP") || {}).textContent || "").trim(),
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

  /* ---- W: the door has a handle ---- */
  const wantedRoutes = [/^\/privacy\/$/, /^\/terms\/$/, /t\.me\//, /^tel:/];
  const doorless = walled.filter(k => {
    const h = out[k].help;
    if (!h || h.count < 5 || h.visible !== h.count) return true;
    if (h.small > 0 || h.outside > 0) return true;
    return wantedRoutes.some(re => !h.hrefs.some(x => re.test(x)));
  });
  report("W) every wall state offers privacy, terms, Telegram and a phone number, all rendered",
    doorless.length === 0,
    doorless.map(k => ({ state: k, help: out[k].help })));

  const drifted = walled.filter(k => {
    const a = (out[k].help.hrefs || []).slice().sort().join("|");
    const b = (out[k].aboutHrefs || []).slice().sort().join("|");
    return !a || a !== b;
  });
  report("W2) the wall's routes are the About card's routes, not a second copy",
    drifted.length === 0,
    drifted.map(k => ({ state: k, wall: out[k].help.hrefs, about: out[k].aboutHrefs })));

  report("W3) the 'checking' wall says something under its heading",
    out.checking.noteP.length > 10, { noteP: out.checking.noteP });

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

  /* ---- E: an unavailable unified verdict is fail-closed ---- */
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
  const off = await offlinePage.evaluate(() => ({
    wall: document.body.classList.contains("wall"),
    state: (typeof appWallState === "function") ? appWallState() : "(no wall)",
    page: (document.querySelector(".page.on") || {}).id,
    session: !!localStorage.getItem("hnk_acc_sess_v1"),
    enforced: !!(window.unified && unified.enforced),
    error: !!(window.unified && unified.error),
    web: typeof unifiedCanWeb === "function" ? unifiedCanWeb() : true,
  }));
  await offlinePage.context().setOffline(false);
  await offlinePage.close();
  report("E) a missing unified verdict closes licensed routes without deleting the secure session",
    off.wall === true && off.state === "checking" && off.page === "pgHome" && off.session && off.enforced && off.error && !off.web, off);

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

  /* ---- K: Student App never becomes an administration client ---- */
  const adminCard = (src.match(/<section class="card" id="cardAdmin"[\s\S]*?<\/section>/) || [""])[0];
  report("K) the Student App hands administrators to the MFA Control Center",
    /id="openAdminCenter" href="\.\.\/admin\/"/.test(adminCard) &&
    !/btnAdmReload|btnAdmGrant|admList/.test(adminCard) &&
    !/if \(admIsAdmin\(\)\) admLoad\(\)/.test(src),
    { linked:/id="openAdminCenter" href="\.\.\/admin\/"/.test(adminCard),
      legacyControls:/btnAdmReload|btnAdmGrant|admList/.test(adminCard) });

  /* ---- L: the half that is not in this repo at runtime ---- */
  const sqlPath = path.join(__dirname, "..", "supabase", "schema.sql");
  const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, "utf8") : "";
  const servicePolicy = (sql.match(
    /create policy payreq_service_all[\s\S]*?;/) || [""])[0];
  const noBrowserReview =
    !/create policy payreq_update_admin_only/.test(sql) &&
    /revoke update, delete on public\.payment_requests from authenticated/.test(sql) &&
    /request_role\(\) = 'service_role'/.test(servicePolicy);
  report("L) payment review is service-only; no browser-admin RLS path ships",
    noBrowserReview &&
    /create trigger hnk_apply_payment/.test(sql) &&
    /security definer/.test(sql),
    { found: !!sql, noBrowserReview,
      trigger: /hnk_apply_payment/.test(sql) });

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

  /* ---- Q/R: the buy panel must be OPEN, and must STAY open ----

     Two defects, one line apart, both shipped in v5.30.0 and both on the only
     path a customer has to pay:

     Q) accOpenGrp is an EXCLUSIVE accordion — its first act is to collapse
        every other group in ACC_GRPS, and the group the wall opens is in that
        list. The wall's branch called it twice, so the second call closed the
        panel the first had just opened, and the wall rendered its instruction
        directly above a shut panel. Measured before the fix: the panel's
        contents invisible on every boot into that state. Assertion H already covered the sign-out half of that
        same block, which is exactly why this went unnoticed — it asserted the
        door was open and never that the till was.

     R) appWallApply ran the accordion block unconditionally, and wallRecheck
        calls appWallApply from visibilitychange, window focus AND a 5-minute
        interval. accOpenGrp ends in scrollIntoView({block:"start"}), so the
        panel re-collapsed and the page jumped to the top of the Account card
        every time the customer came back from the OS photo picker or their
        bank app — mid-payment — and unprompted every five minutes.

     Both are asserted against the visibility of the actual controls, not the
     class names, because the class is not what a customer can or cannot tap. */
  {
    const q = await browser.newPage({ viewport: { width: 412, height: 900 } });
    q.on("pageerror", e => errs.push("buypanel: " + String(e).slice(0, 160)));
    const lapsed = { id: "u-test", name: "T", email: "t@example.com", plan_status: "none",
                     plan_expires_at: new Date(Date.now() - 86400000).toISOString(), allowed_devices: 2 };
    await armSupabase(q, lapsed, "normal");
    await q.addInitScript(l => { try {
      localStorage.setItem("hnk_ws_onboarded", "1");
      localStorage.setItem("hnk_acc_sess_v1", JSON.stringify({ access: "a", refresh: "r",
        uid: "u-test", email: "t@example.com", exp: Math.floor(Date.now() / 1000) + 3600 }));
      localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(l));
    } catch (e) {} }, lapsed);
    await q.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await q.waitForTimeout(1400);
    const look = () => q.evaluate(() => {
      const vis = id => { const e = document.getElementById(id);
        return !!(e && e.getClientRects().length && getComputedStyle(e).display !== "none"); };
      const g = document.getElementById("accGrpPlan");
      return { state: typeof appWallState === "function" ? appWallState() : "?",
               planOpen: !!g && g.className.indexOf("open") >= 0,
               pending: vis("accPending"),
               logout: vis("btnAccLogout"), scrollY: Math.round(window.scrollY) };
    });
    const atBoot = await look();
    report("Q) the wall opens the panel it points the customer at — v5.44.0 there is nothing to buy, so that panel is the plan group carrying the approval notice",
      atBoot.state === "buy" && atBoot.planOpen === true && atBoot.pending === true,
      atBoot);
    /* sign-out has to survive the reordering — this is assertion H's concern,
       re-checked here because the fix touches the same two lines */
    report("Q2) ...without closing the only way back out",
      atBoot.logout === true, atBoot);

    /* leaving for the photo picker and coming back is a focus event */
    await q.evaluate(() => window.scrollTo(0, 300));
    await q.waitForTimeout(150);
    const before = await look();
    await q.evaluate(() => { window.dispatchEvent(new Event("focus"));
                             document.dispatchEvent(new Event("visibilitychange")); });
    await q.waitForTimeout(700);
    const after = await look();
    report("R) coming back from another app does not collapse the panel the wall opened",
      after.planOpen === before.planOpen && after.pending === before.pending &&
      after.planOpen === true && Math.abs(after.scrollY - before.scrollY) < 40,
      { before, after });
    await q.close();
  }

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


  /* ---- Z) a signed-in user with no profiles row is not stuck forever ----
     accLoadProfile asks PostgREST for a single object, so zero rows answers
     406 — which was read as a failed read, leaving acc.profile null and the
     app on "Checking your account…" permanently, because the row was never
     going to appear on its own. Whose row is missing? Anybody who signed up
     while the trigger that creates profiles rows was absent or broken, and
     THAT TRIGGER IS NOT IN THIS REPOSITORY: supabase/schema.sql says it
     assumes the trigger exists. profiles_insert_self grants exactly this
     insert and had no caller. */
  {
    const zp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    zp.on("pageerror", e => errs.push("Z: " + String(e).slice(0, 160)));
    let created = null;
    await zp.route(SB_URL + "/**", route => {
      const req = route.request(), url = req.url();
      const json = (b, st) => route.fulfill({ status: st || 200, contentType: "application/json",
                                              body: JSON.stringify(b) });
      if (url.indexOf("/api/v1/") >= 0) return json({ error: "not_found" }, 404);
      if (url.indexOf("/auth/v1/token") >= 0) {
        return json({ access_token: "test.jwt", refresh_token: "test-refresh",
                      expires_in: 3600, user: { id: "u-test", email: "t@example.com" } });
      }
      if (url.indexOf("/rest/v1/profiles") >= 0) {
        if (req.method() === "POST") {
          try { created = JSON.parse(req.postData() || "{}"); } catch (e) { created = {}; }
          /* what the guard trigger would hand back: a free-tier row */
          return json([{ id: "u-test", email: "t@example.com", plan_status: "none",
                         plan_expires_at: null, allowed_devices: 2, is_admin: false,
                         joined_paid: false }], 201);
        }
        if (created) {
          return json({ id: "u-test", email: "t@example.com", plan_status: "none",
                        plan_expires_at: null, allowed_devices: 2, is_admin: false,
                        joined_paid: false });
        }
        /* the single-object Accept header with no matching row */
        return json({ code: "PGRST116", message: "0 rows" }, 406);
      }
      return json([]);
    });
    await zp.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
    }, SESS);
    await zp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await zp.waitForTimeout(2000);
    const z = await zp.evaluate(() => ({
      state: (typeof appWallState === "function") ? appWallState() : "(no wall)",
      hasProfile: !!acc.profile,
    }));
    report("Z) a 406 (no profiles row) creates the row instead of hanging on 'checking'",
      !!created && Object.keys(created).length === 1 && created.id === "u-test" &&
      z.hasProfile && z.state === "buy",
      { created, ...z });
    await zp.close();
  }

  /* ---- X) a transient outage is not a verdict (v5.37.0) ----
     accRefreshOnce returned "dead" for ANY non-2xx and both callers treat
     "dead" as a logout: accSignOutLocal deletes the session, the cached
     profile and the login stamp. Measured before the fix: 500, 503 and 429
     all produced the same "session expired" as a real 400, so a paying
     customer opening the app during a Supabase blip was put back at the login
     form with their offline cache gone. */
  {
    const gp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    gp.on("pageerror", e => errs.push("X: " + String(e).slice(0, 160)));
    await armSupabase(gp, { plan_status: "active", plan_expires_at: future }, "tokenBoom");
    await gp.addInitScript(({ s, p }) => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        /* already expired, so accBoot does the proactive refresh */
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(
          Object.assign({}, s, { exp: Math.floor(Date.now() / 1000) - 60 })));
        localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(p));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
    }, { s: SESS, p: { plan_status: "active", plan_expires_at: future } });
    await gp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await gp.waitForTimeout(2500);
    const g = await gp.evaluate(() => ({
      sess: !!localStorage.getItem("hnk_acc_sess_v1"),
      prof: !!localStorage.getItem("hnk_acc_profile_v1"),
      state: (typeof appWallState === "function") ? appWallState() : "(no wall)",
    }));
    report("X) a 503 from the token endpoint keeps the session and the cached profile",
      g.sess && g.prof && g.state !== "login", g);
    await gp.close();

    /* ...and the other half of the same rule, which nothing covered: a real
       credential verdict must STILL end the session. Without this, "return
       offline for everything" would pass X and leave a revoked token alive
       forever. 400/401/403/422 are the four the panel's gateRefresh uses, so
       the two codebases now answer the same response the same way. */
    for (const st of [400, 401, 403, 422]) {
      const vp = await browser.newPage({ viewport: { width: 412, height: 900 } });
      vp.on("pageerror", e => errs.push("X2: " + String(e).slice(0, 160)));
      await vp.route(SB_URL + "/**", route => {
        const url = route.request().url();
        if (url.indexOf("/api/v1/") >= 0) {
          return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' });
        }
        if (url.indexOf("/auth/v1/token") >= 0) {
          return route.fulfill({ status: st, contentType: "application/json",
                                 body: JSON.stringify({ error: "boom" }) });
        }
        return route.fulfill({ status: 200, contentType: "application/json",
                               body: JSON.stringify({ plan_status: "active", plan_expires_at: future }) });
      });
      await vp.addInitScript(({ s, p }) => {
        try {
          localStorage.setItem("hnk_ws_onboarded", "1");
          localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(
            Object.assign({}, s, { exp: Math.floor(Date.now() / 1000) - 60 })));
          localStorage.setItem("hnk_acc_profile_v1", JSON.stringify(p));
          localStorage.setItem("hnk_acc_login_at", String(Date.now()));
        } catch (e) {}
      }, { s: SESS, p: { plan_status: "active", plan_expires_at: future } });
      await vp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
      await vp.waitForTimeout(2000);
      const v = await vp.evaluate(() => ({ sess: !!localStorage.getItem("hnk_acc_sess_v1") }));
      report("X2." + st + ") a " + st + " from the token endpoint IS a verdict and ends the session",
        !v.sess, { status: st, sess: v.sess });
      await vp.close();
    }
  }

  /* ---- Y) one dropped profile read must not latch the app forever ----
     wallRecheck used to early-return on `!acc.online`, and acc.online is set
     false by any failed account request and true again only by a successful
     one -- so the retry that would clear it could never run. The decisive
     measurement is not the rendered state (which can recover for other
     reasons) but whether a recheck ISSUES A REQUEST while acc.online is
     false: with the old gate it issues none, ever. */
  {
    const hp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    hp.on("pageerror", e => errs.push("Y: " + String(e).slice(0, 160)));
    await armSupabase(hp, { plan_status: "active", plan_expires_at: future }, "profileOnce");
    await hp.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
    }, SESS);
    let profileCalls = 0;
    hp.on("request", r => { if (r.url().indexOf("/rest/v1/profiles") >= 0) profileCalls++; });
    await hp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await hp.waitForTimeout(1200);
    const before = { calls: profileCalls,
                     online: await hp.evaluate(() => acc.online) };
    await hp.evaluate(() => { try { wallRecheck(true); } catch (e) {} });
    await hp.waitForTimeout(1500);
    const after = await hp.evaluate(() => ({
      state: (typeof appWallState === "function") ? appWallState() : "(no wall)",
      walled: document.body.classList.contains("wall"),
    }));
    report("Y) a recheck re-reads the profile even after a failed one, instead of latching",
      before.online === false && profileCalls > before.calls &&
      after.state === "" && !after.walled,
      { before, calls: profileCalls, after });
    await hp.close();
  }

  /* ---- W4: the retry control, end to end ----
     Armed on a 4s delay on purpose (a button that flashes on every healthy
     boot teaches people to ignore it), so this waits past it. The first
     profile read never settles; the tap issues a second one, which answers,
     and the wall comes down without a reload. */
  {
    const rp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    rp.on("pageerror", e => errs.push("retry: " + String(e).slice(0, 160)));
    await armSupabase(rp, { id: "u-test", plan_status: "active", plan_expires_at: future }, "hangThenOk");
    await rp.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
      /* Sample the button from INSIDE the page, one second after the document
         starts. Sampling from the harness after goto() measured wall-clock
         that included however long networkidle took with a request deliberately
         left hanging — which is not the clock the 4s arming delay runs on. */
      try {
        setTimeout(function(){
          var b = document.getElementById("wallRetry");
          window.__retryEarly = !!b && b.getClientRects().length > 0;
        }, 1000);
      } catch (e) {}
    }, SESS);
    await rp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });
    await rp.waitForTimeout(1600);
    const early = await rp.evaluate(() => {
      const b = document.getElementById("wallRetry");
      return { state: appWallState(), shown: window.__retryEarly,
               nowShown: !!b && b.getClientRects().length > 0 };
    });
    await rp.waitForTimeout(4200);
    const armed = await rp.evaluate(() => {
      const b = document.getElementById("wallRetry");
      return { state: appWallState(), shown: !!b && b.getClientRects().length > 0,
               label: (b && b.textContent || "").trim() };
    });
    if (armed.shown) await rp.click("#wallRetry");
    await rp.waitForTimeout(2000);
    const done = await rp.evaluate(() => ({
      state: appWallState(), walled: document.body.classList.contains("wall")
    }));
    report("W4) 'checking' arms a retry after a delay, and the tap clears the wall",
      early.state === "checking" && early.shown === false &&
      armed.shown === true && armed.label.length > 0 &&
      done.state === "" && done.walled === false,
      { early, armed, done });
    await rp.close();
  }

  /* ---- W7: ONE RECONNECT COSTS ONE PROFILE READ ----
     The first cut of the reconnect fix called wallRecheck(true) from the
     window "online" handler. wallRecheck awaits accLoadProfile(), and the
     handler already called accLoadProfile() itself four lines later, with no
     in-flight dedupe — so every reconnect fired two identical profile GETs in
     the same tick. On a flaky connection the "online" event repeats, so that
     is a doubling of account traffic; and for the customer whose profiles row
     does not exist yet (v5.38.0's 406 self-heal) it is two concurrent INSERTs
     of the same row rather than one. */
  {
    const rc = await browser.newPage({ viewport: { width: 412, height: 900 } });
    rc.on("pageerror", e => errs.push("reconnect: " + String(e).slice(0, 160)));
    let gets = 0, posts = 0;
    await rc.route(SB_URL + "/**", route => {
      const u = route.request().url(), m = route.request().method();
      const json = (b, st) => route.fulfill({ status: st || 200, contentType: "application/json", body: JSON.stringify(b) });
      if (u.indexOf("/api/v1/") >= 0) return json({ error: "not_found" }, 404);
      if (u.indexOf("/rest/v1/profiles") >= 0) {
        if (m === "GET") { gets++; return route.fulfill({ status: 200, contentType: "application/json", body: "null" }); }
        if (m === "POST") { posts++; return json([], 201); }
      }
      if (u.indexOf("/auth/v1/token") >= 0)
        return json({ access_token: "test.jwt", refresh_token: "test-refresh", expires_in: 3600,
                      user: { id: "u-test", email: "t@example.com" } });
      return json([]);
    });
    await rc.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
    }, SESS);
    await rc.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });
    await rc.waitForTimeout(2500);
    await rc.evaluate(() => window.dispatchEvent(new Event("offline")));
    await rc.waitForTimeout(300);
    gets = 0; posts = 0;
    await rc.evaluate(() => window.dispatchEvent(new Event("online")));
    await rc.waitForTimeout(1800);
    report("W7) one reconnect issues exactly one profile read, not two",
      gets === 1 && posts <= 1, { profileGETs: gets, profilePOSTs: posts });
    await rc.close();
  }

  /* ---- W6: NO DEAD CONTROL ON A DISCONNECTED PHONE ----
     v5.39.0 armed the retry on state alone. wallRecheck's first gate is
     `if (!navigator.onLine) return;`, so on a phone with no data the button
     was gold, enabled, and completely inert — measured zero requests and zero
     visible change on tap, on a screen with nothing else on it. It also
     borrowed acc_offline, whose text is "showing your last known status", for
     the one state that is defined by having no known status.

     THIS DRIVES A REAL TRANSITION, not a stubbed navigator. The first cut of
     both the fix and this check only covered a page that was ALREADY offline
     when appWallApply last ran: the 4s arming timer did not re-test
     connectivity when it fired, and the window "offline" event never repainted
     the wall. So a customer whose data dropped inside that window — a lift, a
     tunnel — still got the dead button the release claims to have removed. */
  {
    const octx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const op = await octx.newPage();
    op.on("pageerror", e => errs.push("offline: " + String(e).slice(0, 160)));
    await armSupabase(op, null, "hangProfile");
    await op.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
    }, SESS);
    await op.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });
    /* armed while still online */
    await op.waitForTimeout(5200);
    const armedOnline = await op.evaluate(() => {
      const b = document.getElementById("wallRetry");
      return { online: navigator.onLine, state: appWallState(),
               shown: !!b && b.getClientRects().length > 0 };
    });
    /* now lose the connection for real */
    await octx.setOffline(true);
    await op.waitForTimeout(900);
    const afterDrop = await op.evaluate(() => {
      const b = document.getElementById("wallRetry");
      return { online: navigator.onLine, state: appWallState(),
               shown: !!b && b.getClientRects().length > 0,
               para: ((document.getElementById("wallP") || {}).textContent || "").trim() };
    });
    /* and a page that boots offline must never arm it in the first place.
       navigator.onLine is STUBBED here rather than emulated: Playwright's
       context.setOffline blocks loopback too, so a genuinely offline context
       cannot fetch the page under test at all. The transition above is the
       real one; this is the boot state. */
    const bctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const bp = await bctx.newPage();
    bp.on("pageerror", e => errs.push("offline-boot: " + String(e).slice(0, 160)));
    await armSupabase(bp, null, "hangProfile");
    await bp.addInitScript(s => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_acc_sess_v1", JSON.stringify(s));
        localStorage.setItem("hnk_acc_login_at", String(Date.now()));
      } catch (e) {}
      try { Object.defineProperty(navigator, "onLine", { get: function(){ return false; }, configurable: true }); } catch (e) {}
    }, SESS);
    await bp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });
    await bp.waitForTimeout(5200);
    const bootOffline = await bp.evaluate(() => {
      const b = document.getElementById("wallRetry");
      return { online: navigator.onLine, state: appWallState(),
               shown: !!b && b.getClientRects().length > 0,
               para: ((document.getElementById("wallP") || {}).textContent || "").trim() };
    });
    const noStaleStatus = p => p.length > 8 && !/last known status|နောက်ဆုံး သိထားတဲ့/.test(p);
    report("W6) losing the connection disarms the retry and repaints the copy, and booting offline never arms it",
      armedOnline.shown === true && armedOnline.state === "checking" &&
      afterDrop.online === false && afterDrop.shown === false && noStaleStatus(afterDrop.para) &&
      bootOffline.online === false && bootOffline.shown === false && noStaleStatus(bootOffline.para),
      { armedOnline, afterDrop, bootOffline });
    await op.close(); await octx.close();
    await bp.close(); await bctx.close();
  }

  /* ---- W5: THE WALL SPEAKS THE LANGUAGE THE CUSTOMER PICKED ----
     v5.39.0 memoised the wall copy so a polite live region would stop
     re-announcing identical text every five minutes. The memo key carried
     state, connectivity and lapsed-ness — and not the language — and
     applyLang() does not call appWallApply(), so a customer who switched
     language behind the paywall kept reading the old language's heading and
     pay instructions permanently, while the help links beside them switched.
     Measured on the shipped v5.39.0 build. This is the regression guard. */
  {
    const lp = await browser.newPage({ viewport: { width: 412, height: 900 } });
    lp.on("pageerror", e => errs.push("lang: " + String(e).slice(0, 160)));
    await armSupabase(lp, null, "hangProfile");
    await lp.addInitScript(() => {
      try {
        localStorage.setItem("hnk_ws_onboarded", "1");
        localStorage.setItem("hnk_ws_lang", "my");
      } catch (e) {}
    });
    await lp.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
    await lp.waitForTimeout(1200);
    const swap = await lp.evaluate(async () => {
      const read = () => ({
        head: ((document.getElementById("wallH") || {}).textContent || "").trim(),
        para: ((document.getElementById("wallP") || {}).textContent || "").trim(),
        help: Array.from(document.querySelectorAll("#wallHelp a")).map(a => a.textContent.trim()).slice(0, 2),
      });
      const before = read();
      LANG = "en"; applyLang();
      await new Promise(r => setTimeout(r, 300));
      const after = read();
      /* and it must survive the repaints that run on focus/interval */
      appWallApply(); appWallApply();
      await new Promise(r => setTimeout(r, 200));
      const settled = read();

      /* THE MEMO KEY, ON ITS OWN. The check above is satisfied by the repaint
         call in a11yApplyLang alone: it clears _wallCopyKey, so the key could
         omit the language entirely and this would still pass — which it did,
         measured, on a build with only the LANG term reverted. So exercise the
         key directly: change the language WITHOUT clearing the memo, the way
         any other appWallApply caller would, and require the copy to follow. */
      LANG = "my"; applyLang();
      await new Promise(r => setTimeout(r, 200));
      const backToMy = read();
      LANG = "en";                 /* no applyLang(), so the memo is NOT cleared */
      appWallApply();
      await new Promise(r => setTimeout(r, 150));
      const keyOnly = read();
      return { before, after, settled, backToMy, keyOnly };
    });
    const latin = h => /[A-Za-z]/.test(h) && !/[\u1000-\u109F]/.test(h);
    report("W5) switching language repaints the wall's own copy, not just the links",
      swap.before.head.length > 0 && swap.after.head !== swap.before.head &&
      swap.after.para !== swap.before.para &&
      swap.settled.head === swap.after.head && latin(swap.after.head),
      swap);
    report("W5b) ...and the memo key alone is enough — it carries the language",
      swap.backToMy.head === swap.before.head && latin(swap.keyOnly.head),
      { backToMy: swap.backToMy.head, keyOnly: swap.keyOnly.head });
    await lp.close();
  }

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
