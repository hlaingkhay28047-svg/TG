/* Mocked regression sweep for the v4.30 "Accounts + Premium" wave.

   Every Supabase call is intercepted by a window.fetch shim that records the
   exact wire shape ({url, method, headers, body}) into window.__sb, so the
   assertions below inspect what actually went on the wire, not just the UI
   outcome. Outbound network to the real backend is blocked from CI and from
   the authoring sandbox — nothing here has ever touched live infrastructure.

   Checks, in spec §10 order:
     1  signup            wire shape, no client-side profiles insert, confirm branch
     2  login             session persisted, signed-in view, bad creds store nothing
     3  refresh once      one refresh, replay with the new bearer, no logged-out flash
     4  concurrent 401s   the _accRefreshing coalesce holds under three at once
     5  logout            session cleared, DEVICE ID SURVIVES (never burn a slot)
     6  days-left math    the Math.ceil rule and the expired-but-"active" case
     7  buy -> upload     multipart to payment-proofs/<uid>/, no app-set Content-Type
     8  buy -> insert     exactly four fields; status/reviewed_* never sent
     9  txn validation    digits-only, clamp to 6, submit gating, pay_shot_need
     10 device limit      a rejection NEVER fails the login, and never leaks P0001
     11 gates all off     free path untouched, zero account calls during a generate
     12 offline           a dead backend cannot block, degrade or sign anyone out
     13 SW                still refuses to cache a cross-origin (bearer) response
     14 320/390           no overflow with every accordion + the paywall open
     15 44px              every visible account control clears the touch target
     16 i18n zero-miss    85 keys x 9 languages, placeholders intact, no emoji
     17 no secrets        the anon key ships in code but is never RENDERED
     18 console           zero console errors / pageerrors across the whole sweep

   Run order follows the house rule from sweep_v428_upgrades.js: the
   viewport-mutating checks (14, 15) sit at the end and the viewport is reset
   after. 9 runs just before 7/8 because they share one buy-panel session.
   Usage: PORT=8931 node test/sweep_account.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;

/* 1x1 PNG — the payment screenshot */
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const UID = "11111111-2222-3333-4444-555555555555";

/* Mock fixtures live in ONE object so a backend change is a one-place edit. */
const SB_FIX = {
  token: { access_token:"ACC1", refresh_token:"REF1", token_type:"bearer", expires_in:3600,
           expires_at: Math.floor(Date.now()/1000) + 3600,
           user: { id: UID, email: "hla@example.com" } },
  refresh: { access_token:"ACC2", refresh_token:"REF2", token_type:"bearer", expires_in:3600,
             expires_at: Math.floor(Date.now()/1000) + 3600,
             user: { id: UID, email: "hla@example.com" } },
  /* confirmation ON: a 200 with no access_token is NOT an error */
  signupNoSession: { id: UID, email: "hla@example.com", confirmation_sent_at: "2026-08-12T00:00:00Z" },
  /* v5.34 — joined_paid true, and the value is load-bearing rather than
     incidental. This fixture is a LAPSED customer: they have paid before, so
     the buy panel offers them renewals, which is what the 9/7/8 block below
     exercises when it buys three months. A customer who has never paid is
     offered the one-time joining fee INSTEAD of the renewals — correctly, and
     that path has its own coverage in sweep_v534_payments.js. Leaving this
     false made the renewal chips vanish and the block click a hidden button. */
  profileFree: { id: UID, name: "Hla Hla", email: "hla@example.com", created_at: "2025-01-15T00:00:00Z",
                 plan_status: "none", plan_expires_at: null, allowed_devices: 2, joined_paid: true },
  settings: [{ id: 1, price_1m: 15000, price_3m: 40000, price_6m: 70000, price_extra_device: 10000,
               payment_instructions_my: "KBZPay 09-xxx\nWave 09-yyy" }],
  devices: [{ id:"d1", user_id:UID, device_id:"other-device", label:"Android · Chrome", created_at:"2025-06-01T00:00:00Z" }],
  deviceLimit: { code: "P0001", message: "devices limit exceeded for user", details: null, hint: null },
  requests: []
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const errs = [];
  page.on("pageerror", e => { errs.push("pageerror: " + String(e).slice(0, 300)); console.log("PAGEERROR:", String(e).slice(0, 300)); });
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_ws_lang", "en");     /* assert on the English strings */
  });

  /* The Supabase mock. Per-phase configuration rides in localStorage so it is
     in place BEFORE the page's own scripts (and accBoot) run. */
  await page.addInitScript(`(function(){
    window.__sb = [];
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("__sbcfg") || "{}"); } catch(e){}
    window.__sbCfg = cfg;
    function J(o, status){
      return new Response(JSON.stringify(o === undefined ? null : o),
        { status: status || 200, headers: { "Content-Type": "application/json" } });
    }
    var realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url); opts = opts || {};
      if (!/\\/auth\\/v1\\/|\\/rest\\/v1\\/|\\/storage\\/v1\\//.test(u)) return realFetch.apply(this, arguments);
      var isFD = (typeof FormData !== "undefined") && (opts.body instanceof FormData);
      var rec = { url: u, method: (opts.method || "GET").toUpperCase(),
                  headers: Object.assign({}, opts.headers || {}),
                  body: isFD ? null : (typeof opts.body === "string" ? opts.body : null),
                  isFormData: isFD, formKeys: [], fileName: null };
      if (isFD) {
        try {
          rec.formKeys = Array.from(opts.body.keys());
          var f = opts.body.get("file");
          rec.fileName = (f && f.name) || null;
        } catch(e){}
      }
      window.__sb.push(rec);
      if (window.__sbCfg.throwAll) return Promise.reject(new TypeError("Failed to fetch"));

      var C = window.__sbCfg;
      if (u.indexOf("/auth/v1/signup") >= 0) return Promise.resolve(J(C.signup, C.signupStatus || 200));
      if (u.indexOf("grant_type=refresh_token") >= 0) {
        window.__refreshN = (window.__refreshN || 0) + 1;
        return Promise.resolve(J(C.refresh, C.refreshStatus || 200));
      }
      if (u.indexOf("grant_type=password") >= 0) return Promise.resolve(J(C.login, C.loginStatus || 200));
      if (u.indexOf("/auth/v1/logout") >= 0) return Promise.resolve(new Response("", { status: 204 }));
      if (u.indexOf("/auth/v1/user") >= 0) return Promise.resolve(J({}, C.userStatus || 200));
      if (u.indexOf("/auth/v1/recover") >= 0) return Promise.resolve(J({}, 200));
      if (u.indexOf("/storage/v1/object/") >= 0) return Promise.resolve(J({ Key: "payment-proofs/x" }, 200));
      if (u.indexOf("/rest/v1/profiles") >= 0) {
        if (window.__sbCfg.profile401 > 0) { window.__sbCfg.profile401--; return Promise.resolve(J({ message: "JWT expired" }, 401)); }
        return Promise.resolve(J(C.profile || null, 200));
      }
      if (u.indexOf("/rest/v1/app_settings") >= 0) return Promise.resolve(J(C.settings || [], 200));
      if (u.indexOf("/rest/v1/devices") >= 0) {
        if (rec.method === "POST") return Promise.resolve(J(C.devicesPost, C.devicesPostStatus || 201));
        if (rec.method === "DELETE") return Promise.resolve(new Response("", { status: 204 }));
        return Promise.resolve(J(C.devices || [], 200));
      }
      if (u.indexOf("/rest/v1/payment_requests") >= 0) {
        if (rec.method === "POST") {
          var b = {}; try { b = JSON.parse(opts.body); } catch(e){}
          window.__inserted = Object.assign({ id: "req-1", status: "pending", created_at: "2026-08-12T00:00:00Z" }, b);
          return Promise.resolve(J([window.__inserted], 201));
        }
        if (u.indexOf("id=eq.") >= 0) return Promise.resolve(J([C.pollRow || window.__inserted || null], 200));
        return Promise.resolve(J(C.requests || [], 200));
      }
      if (window.__sbCfg.anyRestStatus) return Promise.resolve(J({ message: "nope" }, window.__sbCfg.anyRestStatus));
      return Promise.resolve(J([], 200));
    };
  })();`);

  const URL_ = `http://127.0.0.1:${PORT}/index.html`;
  async function boot(cfg) {
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate(c => {
      localStorage.setItem("__sbcfg", JSON.stringify(c || {}));
      localStorage.removeItem("hnk_acc_sess_v1");
      localStorage.removeItem("hnk_acc_profile_v1");
      localStorage.removeItem("hnk_acc_settings_v1");
    }, cfg);
    await page.goto(URL_, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      state.key = "TEST_KEY";
      window.scrollTo = function(){};
      Element.prototype.scrollIntoView = function(){};
      switchPage("pgHome");
    });
  }
  const sb = () => page.evaluate(() => window.__sb.map(x => x));
  const hasAnonAuth = h => {
    const a = h["Authorization"] || h["authorization"] || "";
    return /^Bearer .+/.test(a);
  };

  // ---------------------------------------------------------------- 1) signup
  await boot({ signup: SB_FIX.signupNoSession, signupStatus: 200 });
  await page.evaluate(() => { accShowForm("signup"); });
  await page.fill("#accName", "Hla Hla");
  await page.fill("#accEmail2", "hla@example.com");
  await page.fill("#accPass2", "secret123");
  await page.click("#btnAccSignup");
  await page.waitForTimeout(300);
  const c1calls = await sb();
  const su = c1calls.filter(c => c.url.indexOf("/auth/v1/signup") >= 0)[0] || {};
  let suBody = {}; try { suBody = JSON.parse(su.body); } catch(e) {}
  const c1ui = await page.evaluate(() => ({
    st: (document.getElementById("stAcc").textContent || "").trim(),
    loggedOut: document.getElementById("accOut").style.display !== "none" &&
               document.getElementById("accIn").style.display === "none",
    sess: localStorage.getItem("hnk_acc_sess_v1")
  }));
  const c1ProfInsert = c1calls.filter(c => /\/rest\/v1\/profiles/.test(c.url) && c.method === "POST").length;
  report("1 signup: POST /auth/v1/signup carries {email,password,data.name} + apikey + anon bearer; the client never inserts into profiles; a session-less 200 renders acc_confirm_email and leaves the panel logged out",
    su.method === "POST" && suBody.email === "hla@example.com" && suBody.password === "secret123" &&
    suBody.data && suBody.data.name === "Hla Hla" && !!su.headers.apikey && hasAnonAuth(su.headers) &&
    c1ProfInsert === 0 && /confirmation link/i.test(c1ui.st) && c1ui.loggedOut && !c1ui.sess,
    JSON.stringify({ profileInserts: c1ProfInsert, st: c1ui.st, loggedOut: c1ui.loggedOut }));

  /* 1b) the §2.2 "already registered" branch. Guard, not decoration: the panel
     auto-switches to the login sub-form, and accShowForm() ends with
     setSt("stAcc",""), so writing acc_exists BEFORE the switch wipes it in the
     same tick — the user watched the sign-up form vanish with no explanation
     at all. Reordering the two statements makes this FAIL. */
  await boot({ signup: { msg: "User already registered" }, signupStatus: 400 });
  await page.evaluate(() => { accShowForm("signup"); });
  await page.fill("#accName", "Hla Hla");
  await page.fill("#accEmail2", "taken@example.com");
  await page.fill("#accPass2", "hunter2secret");
  await page.click("#btnAccSignup");
  await page.waitForTimeout(300);
  const c1b = await page.evaluate(() => ({
    st: (document.getElementById("stAcc").textContent || "").trim(),
    onLogin: document.getElementById("accFormLogin").style.display !== "none" &&
             document.getElementById("accFormSignup").style.display === "none",
    prefilled: document.getElementById("accEmail").value,
    pass2: document.getElementById("accPass2").value
  }));
  report("1b signup -> already registered: acc_exists is actually VISIBLE alongside the auto-switch to the login sub-form (accShowForm clears #stAcc, so the message must be written after it), the email is prefilled, and the typed password is not left behind in the hidden sign-up field",
    /already exists/i.test(c1b.st) && c1b.onLogin &&
    c1b.prefilled === "taken@example.com" && c1b.pass2 === "",
    JSON.stringify(c1b));

  // ---------------------------------------------------------------- 2) login
  await boot({ login: SB_FIX.token, profile: SB_FIX.profileFree, devices: [], devicesPost: { id: "d9" } });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "secret123");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(400);
  const c2calls = await sb();
  const lg = c2calls.filter(c => c.url.indexOf("grant_type=password") >= 0)[0] || {};
  const c2 = await page.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem("hnk_acc_sess_v1")); } catch(e) {}
    return { s, inView: document.getElementById("accIn").style.display !== "none",
             email: (document.getElementById("accInfoEmail").textContent || "").trim(),
             name: (document.getElementById("accInfoName").textContent || "").trim() };
  });
  await boot({ login: { error: "invalid_grant", error_description: "Invalid login credentials" }, loginStatus: 400 });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "wrongpass");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(300);
  const c2bad = await page.evaluate(() => ({
    st: (document.getElementById("stAcc").textContent || "").trim(),
    sess: localStorage.getItem("hnk_acc_sess_v1")
  }));
  report("2 login: POST /auth/v1/token?grant_type=password persists access/refresh/uid to hnk_acc_sess_v1 and renders the signed-in view; a 400 Invalid login credentials renders acc_bad_creds and stores nothing",
    lg.method === "POST" && c2.s && c2.s.access === "ACC1" && c2.s.refresh === "REF1" && c2.s.uid === UID &&
    c2.inView && c2.name === "Hla Hla" && c2.email === "hla@example.com" &&
    /Wrong email or password/i.test(c2bad.st) && !c2bad.sess,
    JSON.stringify({ stored: !!c2.s, name: c2.name, badSt: c2bad.st, badStored: !!c2bad.sess }));

  // ---------------------------------------------------------------- 3) refresh once
  await boot({ login: SB_FIX.token, profile: SB_FIX.profileFree, refresh: SB_FIX.refresh, devices: [], devicesPost: {} });
  const c3 = await page.evaluate(async (fix) => {
    acc.sess = { access: "ACC1", refresh: "REF1", exp: Math.floor(Date.now()/1000) + 3600, uid: fix.uid, email: "hla@example.com" };
    accRender();
    /* watch for a logged-out flash across the whole refresh dance */
    window.__states = [];
    const orig = accRender;
    accRender = function(){ window.__states.push(!!acc.sess); return orig.apply(this, arguments); };
    window.__sb = []; window.__refreshN = 0;
    window.__sbCfg.profile401 = 1;             /* one 401, then the real row */
    await accLoadProfile();
    const okPhase = { refreshes: window.__refreshN, states: window.__states.slice(),
                      calls: window.__sb.map(c => ({ u: c.url, a: c.headers.Authorization })) };
    /* now kill the refresh token itself */
    window.__sb = []; window.__refreshN = 0; window.__states = [];
    window.__sbCfg.profile401 = 99; window.__sbCfg.refreshStatus = 401;
    await accLoadProfile();
    accRender = orig;
    return { okPhase, deadRefreshes: window.__refreshN,
             sess: localStorage.getItem("hnk_acc_sess_v1"),
             toast: (document.getElementById("toast").textContent || "").trim(),
             loggedOut: document.getElementById("accOut").style.display !== "none" };
  }, { uid: UID });
  const c3prof = c3.okPhase.calls.filter(c => /\/rest\/v1\/profiles/.test(c.u));
  report("3 refresh once: a single 401 triggers exactly one grant_type=refresh_token, the original read replays with the NEW bearer and the panel never flashes logged-out; a dead refresh token signs out locally with acc_session_expired and never retries",
    c3.okPhase.refreshes === 1 && c3prof.length === 2 && c3prof[1].a === "Bearer ACC2" &&
    c3.okPhase.states.every(s => s === true) &&
    c3.deadRefreshes === 1 && !c3.sess && /session expired/i.test(c3.toast) && c3.loggedOut,
    JSON.stringify({ refreshes: c3.okPhase.refreshes, replayBearer: c3prof[1] && c3prof[1].a,
                     flashes: c3.okPhase.states.filter(s => !s).length, deadRefreshes: c3.deadRefreshes, toast: c3.toast }));

  // ---------------------------------------------------------------- 4) concurrent 401s
  await boot({ profile: SB_FIX.profileFree, refresh: SB_FIX.refresh });
  const c4 = await page.evaluate(async (uid) => {
    acc.sess = { access: "ACC1", refresh: "REF1", exp: Math.floor(Date.now()/1000) + 3600, uid: uid };
    window.__sb = []; window.__refreshN = 0;
    window.__sbCfg.profile401 = 99;            /* every profile read 401s */
    await Promise.all([accFetch("/rest/v1/profiles?select=*&id=eq.a", { method: "GET" }),
                       accFetch("/rest/v1/profiles?select=*&id=eq.b", { method: "GET" }),
                       accFetch("/rest/v1/profiles?select=*&id=eq.c", { method: "GET" })]);
    return { refreshes: window.__refreshN,
             reads: window.__sb.filter(c => /\/rest\/v1\/profiles/.test(c.url)).length };
  }, UID);
  report("4 concurrent 401s: three authenticated reads that all 401 fire exactly ONE refresh — the _accRefreshing coalesce holds, so three rotated refresh tokens are never burned",
    c4.refreshes === 1, JSON.stringify(c4));

  // ---------------------------------------------------------------- 5) logout
  await boot({ login: SB_FIX.token, profile: SB_FIX.profileFree, devices: [], devicesPost: { id: "d9" } });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "secret123");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__sb = []; });
  await page.click("#btnAccLogout");
  await page.waitForTimeout(300);
  const c5calls = await sb();
  const lo = c5calls.filter(c => c.url.indexOf("/auth/v1/logout") >= 0)[0] || {};
  const c5 = await page.evaluate(() => ({
    sess: localStorage.getItem("hnk_acc_sess_v1"),
    prof: localStorage.getItem("hnk_acc_profile_v1"),
    dev:  localStorage.getItem("hnk_acc_device_v1"),
    loginForm: document.getElementById("accOut").style.display !== "none" &&
               document.getElementById("accFormLogin").style.display !== "none"
  }));
  report("5 logout: POST /auth/v1/logout goes out with the access bearer, the session + profile caches are dropped, the login form returns, and hnk_acc_device_v1 SURVIVES so logging back in never burns a second device slot",
    lo.method === "POST" && /^Bearer ACC1$/.test(lo.headers.Authorization || "") &&
    !c5.sess && !c5.prof && !!c5.dev && c5.loginForm,
    JSON.stringify({ logoutBearer: lo.headers && lo.headers.Authorization, deviceIdKept: !!c5.dev, loginForm: c5.loginForm }));

  // ---------------------------------------------------------------- 6) days-left math
  await boot({});
  const c6 = await page.evaluate((uid) => {
    acc.sess = { access: "ACC1", refresh: "REF1", exp: Math.floor(Date.now()/1000) + 3600, uid: uid };
    const D = h => new Date(Date.now() + h * 3600000).toISOString();
    const probe = (status, iso) => {
      acc.profile = { id: uid, name: "x", email: "x@y.z", plan_status: status, plan_expires_at: iso, allowed_devices: 2 };
      accRender();
      return { days: planDaysLeft(acc.profile), premium: isPremium(),
               line: (document.getElementById("accPlanLine").textContent || "").trim() };
    };
    return { d30: probe("active", D(24 * 30)), d7: probe("active", D(24 * 7)),
             h6: probe("active", D(6)), past: probe("active", D(-24)), none: probe("none", null),
             /* the shipped label itself, so the assertion below compares the
                rendered line against the string the app actually holds rather
                than against a copy hardcoded in this file */
             freeLabel: t("acc_plan_free") };
  }, UID);
  /* v5.31.0 — the last clause used to be /^Free/i, pinning the no-plan label as
     "Free — no Premium yet". That was true while there WAS a free tier. Since
     the v5.30.0 wall there is none: an account with no plan has no access at
     all, and that label was rendering on #cardAccount, one of the only two
     cards the buy wall leaves on screen — so the paywall demanding payment sat
     directly above the word "Free". Asserting the old copy would now pin the
     defect in place.
     It asserts two stronger things instead: the line really does render the
     acc_plan_free string the app ships (compared against t() rather than
     against a copy typed here, so a wrong key or an empty render still fails),
     and that string does not call the account free in any of the words the app
     used for it. */
  const FREE_WORDS = /^(Free|အခမဲ့|လၢႆလၢႆ|ฟรี|免费|Miễn phí|Gratis|Percuma)/i;
  report("6 days-left math: +30d -> 30 / acc_plan_active, +7d -> 7 / acc_plan_soon, +6h -> 1 NOT 0 (the Math.ceil rule), a passed date with plan_status still \"active\" -> acc_plan_expired and isPremium() false, plan_status none -> acc_plan_free and it no longer calls the account free",
    c6.d30.days === 30 && /Premium active/i.test(c6.d30.line) && c6.d30.premium === true &&
    c6.d7.days === 7 && /expires in 7 days/i.test(c6.d7.line) &&
    c6.h6.days === 1 &&
    c6.past.days === 0 && /has expired/i.test(c6.past.line) && c6.past.premium === false &&
    typeof c6.freeLabel === "string" && c6.freeLabel.length > 0 &&
    c6.none.line.indexOf(c6.freeLabel) >= 0 &&
    !FREE_WORDS.test(c6.freeLabel) && c6.none.premium === false,
    JSON.stringify({ d30: c6.d30.days, d7: c6.d7.days, sixHours: c6.h6.days, pastPremium: c6.past.premium, none: c6.none.line, label: c6.freeLabel }));

  // ------------------------------------------------- 9 / 7 / 8) the buy panel
  await boot({ login: SB_FIX.token, profile: SB_FIX.profileFree, settings: SB_FIX.settings,
               devices: [], devicesPost: { id: "d9" }, requests: [] });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "secret123");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(400);
  /* v5.32.0 — this used to click the accordion header to open the buy group.
     It no longer may. Before v5.32.0 appWallApply's buy branch called
     accOpenGrp("accGrpBuy") and then accOpenGrp("accGrpAuth"); accOpenGrp is
     an EXCLUSIVE accordion whose first act is to collapse every other group,
     so the second call shut the buy panel again and a customer who had just
     been told to pay was left staring at a collapsed group. The header click
     here quietly papered over that: it opened what the wall should have opened
     itself, so the defect could not fail this test.
     The fix makes the wall leave the buy group open, which turns the same
     click into a TOGGLE-CLOSED. So the click is gone and the guarantee is
     asserted instead — strictly more than this block checked before. */
  const buyGroupOpen = await page.evaluate(() => {
    const g = document.getElementById("accGrpBuy");
    const k = document.getElementById("payKind3m");
    return { open: !!g && g.className.indexOf("open") >= 0,
             kindVisible: !!(k && k.getClientRects().length) };
  });
  report("9a buy wall: being told to pay leaves the payment group OPEN, so the only path to paying is on screen without hunting for it (pre-v5.32.0 the exclusive accordion re-collapsed it)",
    buyGroupOpen.open && buyGroupOpen.kindVisible, JSON.stringify(buyGroupOpen));
  await page.click("#payKind3m");

  const v9 = {};
  async function txn(val) {
    await page.fill("#payTxn", val);
    await page.waitForTimeout(60);
    return page.evaluate(() => ({ value: document.getElementById("payTxn").value,
                                  disabled: document.getElementById("btnPaySubmit").disabled,
                                  st: (document.getElementById("stPay").textContent || "").trim() }));
  }
  v9.noShot = await txn("482913");                       /* valid txn, no screenshot yet */
  v9.short = await txn("12345");
  await page.focus("#payTxn");
  await page.evaluate(() => document.getElementById("payTxn").blur());
  await page.waitForTimeout(60);
  v9.shortBlur = await page.evaluate(() => ({ st: (document.getElementById("stPay").textContent || "").trim() }));
  await page.setInputFiles("#payShot", { name: "shot.png", mimeType: "image/png", buffer: Buffer.from(B64, "base64") });
  await page.waitForTimeout(400);
  v9.long = await txn("1234567");
  v9.mixed = await txn("4a8b2c");
  v9.good = await txn("482913");
  /* v5.34 — the amount is now part of the gate, so "enabled on exactly 6
     digits" is only true once an amount is present. Filling it here rather
     than relaxing the assertion keeps the txn rules exactly as strict as they
     were AND records the new requirement: the two v9.*Amt reads below prove
     the button really is held by the amount and released by it. */
  v9.noAmt = await page.evaluate(() => ({ disabled: document.getElementById("btnPaySubmit").disabled }));
  await page.fill("#payAmt", "91000");
  await page.waitForTimeout(120);
  v9.withAmt = await page.evaluate(() => ({
    value: document.getElementById("payAmt").value,
    disabled: document.getElementById("btnPaySubmit").disabled,
  }));

  report("9 txn validation: non-digits are stripped, >6 clamps to 6, a valid txn with no screenshot keeps submit disabled showing pay_shot_need, and (v5.34) the amount is required too — six good digits and a slip are not enough on their own",
    v9.noShot.disabled === true && /screenshot/i.test(v9.noShot.st) &&
    v9.short.value === "12345" && v9.short.disabled === true &&
    /exactly 6 digits/i.test(v9.shortBlur.st) &&
    v9.long.value === "123456" &&
    v9.mixed.value === "482" && v9.mixed.disabled === true &&
    v9.good.value === "482913" &&
    v9.noAmt.disabled === true &&
    v9.withAmt.value === "91,000" && v9.withAmt.disabled === false,
    JSON.stringify({ noShotSt: v9.noShot.st, blurSt: v9.shortBlur.st, clamp: v9.long.value,
                     stripped: v9.mixed.value, heldByAmount: v9.noAmt.disabled, amount: v9.withAmt.value }));

  await page.evaluate(() => { window.__sb = []; });
  await page.click("#btnPaySubmit");
  await page.waitForTimeout(700);
  const c78 = await sb();
  const up = c78.filter(c => c.url.indexOf("/storage/v1/object/") >= 0)[0] || { headers: {} };
  const upHdrKeys = Object.keys(up.headers || {}).map(k => k.toLowerCase());
  const upPath = (up.url || "").split("/storage/v1/object/payment-proofs/")[1] || "";
  report("7 buy -> upload: the proof goes to POST /storage/v1/object/payment-proofs/<uid>/plan_3m-<ts>.(jpg|png) as multipart FormData with a `file` field, carrying apikey + the access bearer + x-upsert, and the app sets NO Content-Type (the browser owns the boundary)",
    up.method === "POST" && new RegExp("^" + UID + "/plan_3m-\\d+\\.(jpg|png)$").test(upPath) &&
    up.isFormData === true && up.formKeys.indexOf("file") >= 0 &&
    upHdrKeys.indexOf("apikey") >= 0 && /^Bearer ACC1$/.test(up.headers.Authorization || "") &&
    upHdrKeys.indexOf("x-upsert") >= 0 && upHdrKeys.indexOf("content-type") < 0,
    JSON.stringify({ path: upPath, isFormData: up.isFormData, formKeys: up.formKeys, headers: upHdrKeys }));

  const ins = c78.filter(c => /\/rest\/v1\/payment_requests/.test(c.url) && c.method === "POST")[0] || { headers: {} };
  let insBody = {}; try { insBody = JSON.parse(ins.body); } catch(e) {}
  const insKeys = Object.keys(insBody).sort();
  const c8ui = await page.evaluate(() => ({
    pending: (document.getElementById("payPendingH").textContent || "").trim(),
    formHidden: document.getElementById("payForm").style.display === "none"
  }));
  /* v5.34 adds amount_mmk — what the customer says they sent — and the exact
     key list stays pinned rather than loosened. is_grant is deliberately NOT
     in it: only an admin filing a free period sends that, and a customer's
     insert carrying it is exactly the forged-VIP-grant shape the schema's
     insert policy refuses. status / reviewed_* / note remain the admin's. */
  report("8 buy -> insert: the payment_requests body is exactly {user_id,kind,txn_last6,amount_mmk,screenshot_path} matching the uploaded path, with Prefer: return=representation; status / reviewed_at / reviewed_by / note / is_grant are ABSENT (they are the admin's fields); then the pending card renders",
    ins.method === "POST" && JSON.stringify(insKeys) === JSON.stringify(["amount_mmk","kind","screenshot_path","txn_last6","user_id"]) &&
    insBody.kind === "plan_3m" && insBody.txn_last6 === "482913" && insBody.user_id === UID &&
    insBody.amount_mmk === 91000 &&
    insBody.screenshot_path === upPath && /return=representation/.test(ins.headers.Prefer || "") &&
    /Waiting for admin approval/i.test(c8ui.pending) && c8ui.formHidden,
    JSON.stringify({ keys: insKeys, amount: insBody.amount_mmk, path: insBody.screenshot_path, prefer: ins.headers.Prefer, pending: c8ui.pending }));
  await page.evaluate(() => { accPollStop(); });

  // ---------------------------------------------------------------- 10) device limit
  await boot({ login: SB_FIX.token, profile: SB_FIX.profileFree, devices: [],
               devicesPost: SB_FIX.deviceLimit, devicesPostStatus: 400 });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "secret123");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(600);
  const c10 = await page.evaluate(() => ({
    signedIn: document.getElementById("accIn").style.display !== "none",
    sess: !!localStorage.getItem("hnk_acc_sess_v1"),
    limitTxt: (document.getElementById("stAccDev").textContent || "").trim(),
    limitVisible: document.getElementById("stAccDev").offsetParent !== null,
    buyExtra: !!document.getElementById("btnDevBuyExtra") &&
              document.getElementById("btnDevBuyExtra").offsetParent !== null,
    manage: !!document.getElementById("btnDevManage"),
    body: document.body.innerText || ""
  }));
  report("10 device-limit: the trigger's rejection NEVER fails the login — the signed-in view renders and the session is stored — while dev_limit shows inline with {M} substituted from allowed_devices, #btnDevBuyExtra is offered, and the raw Postgres message (\"P0001\", \"exceeded\") appears nowhere in the DOM",
    c10.signedIn && c10.sess && /Device limit reached/i.test(c10.limitTxt) &&
    /allows 2 devices/i.test(c10.limitTxt) && c10.limitVisible && c10.buyExtra && c10.manage &&
    c10.body.indexOf("P0001") < 0 && !/exceeded/i.test(c10.body),
    JSON.stringify({ signedIn: c10.signedIn, limitTxt: c10.limitTxt.slice(0, 80),
                     leakP0001: c10.body.indexOf("P0001") >= 0, leakExceeded: /exceeded/i.test(c10.body) }));

  // ---------------------------------------------------------------- 11) gates all off
  await boot({});
  const c11 = await page.evaluate(async (b64) => {
    const gatesOff = Object.values(PREMIUM_GATES).every(v => v === false);
    const loggedOut = !acc.sess;
    const allow = { video: gate("video"), v2: gate("v2_retouch"), t2i: gate("text2img"), batch: gate("batch") };
    const wizBefore = document.getElementById("wizPay").className;
    /* a real, logged-out generate run on #pgRetouch */
    switchPage("pgRetouch");
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    if (typeof renderRefs === "function") renderRefs();
    if (typeof renderV2Hero === "function") renderV2Hero();
    window.__sb = []; window.__gemN = 0;
    const realFetch = window.fetch;
    window.fetch = function(u, o){
      if (String(u).indexOf(":generateContent") >= 0) {
        window.__gemN++;
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [
          { inlineData: { mimeType: "image/png", data: b64 } }] } }] }), { status: 200 }));
      }
      return realFetch.apply(this, arguments);
    };
    await document.getElementById("btnV2Start").onclick();
    const out = { gatesOff, loggedOut, allow, wizBefore,
                  wizAfter: document.getElementById("wizPay").className,
                  gemCalls: window.__gemN, sbDuringRun: window.__sb.length,
                  gotResult: !!state.result };
    switchPage("pgHome");
    return out;
  }, B64);
  report("11 gates all off: every PREMIUM_GATES value is false, gate() returns true while logged out, a full logged-out V2 generate on #pgRetouch runs to a result exactly as before, ZERO account calls fire during it, and #wizPay never gains class \"on\"",
    c11.gatesOff && c11.loggedOut && c11.allow.video === true && c11.allow.v2 === true &&
    c11.allow.t2i === true && c11.allow.batch === true &&
    c11.gemCalls >= 1 && c11.gotResult && c11.sbDuringRun === 0 &&
    c11.wizBefore === "wiz" && c11.wizAfter === "wiz",
    JSON.stringify(c11));

  // ---------------------------------------------------------------- 12) offline never blocks
  {
    const exp = new Date(Date.now() + 30 * 86400000).toISOString();
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate((d) => {
      localStorage.setItem("__sbcfg", JSON.stringify({ throwAll: true }));
      localStorage.setItem("hnk_acc_sess_v1", JSON.stringify({ access: "ACC1", refresh: "REF1", exp: d.exp, uid: d.uid, email: "hla@example.com" }));
      localStorage.setItem("hnk_acc_profile_v1", JSON.stringify({ id: d.uid, name: "Hla Hla", email: "hla@example.com",
        created_at: "2025-01-15T00:00:00Z", plan_status: "active", plan_expires_at: d.iso, allowed_devices: 2 }));
      localStorage.setItem("hnk_web_studio_page", "pgLib");
    }, { uid: UID, iso: exp, exp: Math.floor(Date.now() / 1000) + 3600 });
    const errsBefore = errs.length;
    await page.goto(URL_, { waitUntil: "load" });
    await page.waitForTimeout(900);
    const c12 = await page.evaluate(() => {
      const before = curPage;
      switchPage("pgCreate");
      const moved = curPage === "pgCreate";
      switchPage("pgHome");
      const g = document.getElementById("accGrpPlan");
      if (g) g.className = "grp open";
      return { restored: before, moved, premium: isPremium(),
               sess: !!localStorage.getItem("hnk_acc_sess_v1"),
               offlineTxt: (document.getElementById("accPlanOffline").textContent || "").trim(),
               offlineShown: document.getElementById("accPlanOffline").style.display !== "none",
               /* the account layer must not shout at anyone on boot. setSt()
                  toasts whenever its target is off-screen, so a passive state
                  written into a collapsed accordion (#stPay lives inside the
                  collapsed accGrpBuy) used to surface as a red error toast on
                  every cold start. The toast lasts 2.6s and we are ~0.9s in. */
               bootToast: (document.getElementById("toast").className.indexOf("on") >= 0)
                          ? document.getElementById("toast").textContent : "",
               signedIn: document.getElementById("accIn").style.display !== "none" };
    });
    report("12 offline never blocks: with EVERY Supabase fetch throwing, the app still boots to its restored page, switchPage keeps working, the plan card reads from cache and shows acc_offline, isPremium() stays true for a paying user, the session is NOT cleared, nothing throws, and no unsolicited error toast is raised at boot",
      errs.length === errsBefore && c12.restored === "pgLib" && c12.moved && c12.premium === true &&
      c12.sess && c12.signedIn && c12.offlineShown && /Offline/i.test(c12.offlineTxt) &&
      c12.bootToast === "",
      JSON.stringify({ newErrors: errs.length - errsBefore, restored: c12.restored, premium: c12.premium,
                       sessKept: c12.sess, offline: c12.offlineTxt, bootToast: c12.bootToast }));
  }

  // ---------------------------------------------------------------- 13) SW leaves Supabase alone
  {
    const swSrc = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "sw.js"), "utf8");
    const fetchIdx = swSrc.indexOf('addEventListener("fetch"');
    /* Pin the cache name to APP_VER rather than to one release literal: the
       bug worth catching is "CACHE went out of lockstep with the shipped
       version", not "CACHE is not this exact string" — which goes stale on
       the next patch release and fails a correct build. */
    const appHtml = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
    const verM = appHtml.match(/var APP_VER\s*=\s*"([\d.]+)"/);
    const wantCache = verM && ("hnk-web-studio-v" + verM[1].replace(/\./g, "-"));
    const swCacheOk = !!wantCache && swSrc.indexOf('var CACHE = "' + wantCache + '"') >= 0;

    const head = swSrc.slice(fetchIdx, fetchIdx + 400);
    report("13 SW leaves Supabase alone: the fetch handler still bails out on any cross-origin request before it can reach a cache, so no auth / REST / storage response carrying a bearer token is ever stored",
      fetchIdx > 0 && head.indexOf("url.origin !== location.origin") >= 0 && /\|\|\s*url\.origin\s*!==\s*location\.origin\s*\)\s*return;/.test(head) &&
      swCacheOk,
      JSON.stringify({ guard: /url\.origin !== location\.origin\) return;/.test(head), cacheBumped: swCacheOk, want: wantCache }));
  }

  // ---------------------------------------------------------------- 16) i18n zero-miss
  await boot({});
  const c16 = await page.evaluate(() => {
    const codes = ["my","en","shn","kac","th","zh","vi","id","ms"];
    const keys = Object.keys(TR_V430);
    /* Pictographic emoji only. U+2713 "✓" is a text-presentation dingbat that
       spec §8 ships verbatim in several my/en values — it is not an emoji and
       is deliberately not matched here. */
    const emoji = /[\u{1F000}-\u{1FAFF}]|[\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{200D}/u;
    const missing = [], emojis = [], unresolved = [], badPlace = [];
    const before = LANG;
    keys.forEach(k => {
      const e = TR_V430[k];
      codes.forEach(L => {
        if (!Object.prototype.hasOwnProperty.call(e, L) || typeof e[L] !== "string" || !e[L].trim()) missing.push(k + "." + L);
        else {
          if (emoji.test(e[L])) emojis.push(k + "." + L);
          const want = (e.en.match(/\{[NMDT]\}/g) || []).sort().join(",");
          const got = (e[L].match(/\{[NMDT]\}/g) || []).sort().join(",");
          if (want !== got) badPlace.push(k + "." + L);
        }
      });
    });
    codes.forEach(L => { LANG = L; keys.forEach(k => { const v = t(k); if (!v || v === k) unresolved.push(k + "." + L); }); });
    LANG = before;
    return { total: keys.length, missing, emojis, unresolved, badPlace };
  });
  report("16 i18n zero-miss: TR_V430 holds exactly 85 keys, every one carries all 9 language codes as own non-empty properties, t() resolves each to something other than the key itself in every language, {N}/{M}/{D}/{T} survive every translation, and no value carries an emoji",
    c16.total === 85 && c16.missing.length === 0 && c16.unresolved.length === 0 &&
    c16.emojis.length === 0 && c16.badPlace.length === 0,
    JSON.stringify({ total: c16.total, missing: c16.missing.length, unresolved: c16.unresolved.length,
                     emoji: c16.emojis, placeholderDrift: c16.badPlace }));

  // ---------------------------------------------------------------- 17) no secrets in the DOM
  const c17 = await page.evaluate(() => {
    const txt = document.body.innerText || "";
    const attrs = [];
    document.querySelectorAll("[href],[title],[value],input").forEach(n => {
      attrs.push(String(n.getAttribute("href") || ""), String(n.getAttribute("title") || ""),
                 String(n.getAttribute("value") || ""), String(n.value == null ? "" : n.value));
    });
    const blob = attrs.join("\n");
    return { jwtInText: txt.indexOf("eyJ") >= 0, anonInText: txt.indexOf(SB_ANON) >= 0,
             anonInAttrs: blob.indexOf(SB_ANON) >= 0,
             tokenInAttrs: blob.indexOf("ACC1") >= 0 || blob.indexOf("eyJ") >= 0,
             urlInText: txt.indexOf(SB_URL) >= 0, anonLen: SB_ANON.length > 0, urlOk: /^https:\/\//.test(SB_URL) };
  });
  report("17 no secrets in the DOM: the anon key ships in code (that is its design) but is never RENDERED — no JWT prefix and no key material in body text, and no access token leaks into any href / title / value",
    c17.anonLen && c17.urlOk && !c17.jwtInText && !c17.anonInText && !c17.anonInAttrs && !c17.tokenInAttrs,
    JSON.stringify(c17));

  // ------------------------------------- 14) 320 / 390 no overflow (viewport-mutating)
  const openAll = () => page.evaluate(() => {
    switchPage("pgHome");
    ["accGrpAuth","accGrpPlan","accGrpBuy","accGrpDev","accGrpReq"].forEach(id => {
      const g = document.getElementById(id); if (g) g.className = "grp open";   /* force, incl. the hidden plan group */
    });
    showPaywall("video");
    return true;
  });
  const measure = () => page.evaluate(() => {
    const nav = document.querySelector(".nav-in");
    const name = document.querySelector(".nav-name");
    const wordmark = document.querySelector(".hnk-wordmark") || name;
    const wordmarkStyle = getComputedStyle(wordmark);
    const wordmarkLh = parseFloat(wordmarkStyle.lineHeight) || parseFloat(wordmarkStyle.fontSize) * 1.2;
    return { scrollW: document.scrollingElement.scrollWidth, innerW: window.innerWidth,
             navH: Math.round(nav.getBoundingClientRect().height),
             wordmarkLines: Math.round(wordmark.getBoundingClientRect().height / wordmarkLh),
             logoW: Math.round(document.querySelector(".nav-logo").getBoundingClientRect().width),
             wizOn: document.getElementById("wizPay").className.indexOf("on") >= 0 };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openAll();
  await page.waitForTimeout(200);
  const m390 = await measure();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(200);
  const m320 = await measure();
  report("14 320/390 no overflow: with every account accordion expanded AND the paywall forced open, neither width scrolls sideways; the header row does not grow between 390 and 320, the visible HNK wordmark stays on one line, and the logo mark is still rendered",
    m390.scrollW <= m390.innerW + 1 && m320.scrollW <= m320.innerW + 1 &&
    m390.navH === m320.navH && m390.wordmarkLines === 1 && m320.wordmarkLines === 1 &&
    m390.logoW > 0 && m320.logoW > 0 && m390.wizOn && m320.wizOn,
    JSON.stringify({ w390: m390, w320: m320 }));

  // ---------------------------------------------------------------- 15) 44px targets
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const c15 = await page.evaluate(() => {
    const bad = [];
    let n = 0;
    const scan = () => {
      const nodes = Array.from(document.querySelectorAll("#cardAccount button, #cardAccount .chip, #cardAccount input"))
        .concat(Array.from(document.querySelectorAll("#wizPay .wiz-nav .btn")));
      nodes.forEach(el => {
        if (el.offsetParent === null) return;            /* hidden controls have no touch target */
        n++;
        const h = el.getBoundingClientRect().height;
        if (h < 44) bad.push((el.id || el.className) + "=" + Math.round(h));
      });
    };
    /* logged out, both sub-forms */
    accShowForm("login"); scan();
    accShowForm("signup"); scan();
    /* signed in, with the pending card and the device-limit block on screen */
    acc.sess = { access: "ACC1", refresh: "REF1", exp: Math.floor(Date.now()/1000) + 3600, uid: "u" };
    acc.profile = { name: "Hla Hla", email: "a@b.c", created_at: "2025-01-15T00:00:00Z",
                    plan_status: "active", plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), allowed_devices: 2 };
    acc.settings = { price_1m: 15000, payment_instructions_my: "x" };
    acc.devices = [{ id: "d1", device_id: "zz", label: "Android · Chrome" }];
    acc.requests = [{ id: "r1", kind: "plan_3m", txn_last6: "482913", status: "rejected",
                      created_at: "2026-08-01T00:00:00Z", note: "wrong amount" }];
    accRender(); accRenderPay(); accRenderDevices(); accRenderRequests(); accShowDeviceLimit();
    ["accGrpAuth","accGrpPlan","accGrpBuy","accGrpDev","accGrpReq"].forEach(id => {
      document.getElementById(id).className = "grp open";
    });
    scan();
    return { n, bad };
  });
  report("15 44px targets: every VISIBLE button, chip and input inside #cardAccount — across the logged-out login form, the sign-up form, the signed-in view, the device list, the request list and the pending card — plus both #wizPay actions, clears a 44px touch target",
    c15.n > 20 && c15.bad.length === 0, JSON.stringify(c15));

  await page.evaluate(() => { document.getElementById("wizPay").className = "wiz"; });

  // ---------------------------------------------------------------- 18) console
  await page.waitForTimeout(300);
  report("18 zero console errors: no console error and no uncaught pageerror was emitted anywhere across the whole sweep, including every failure path exercised above",
    errs.length === 0, errs.length ? JSON.stringify(errs.slice(0, 6)) : "clean");

  // ---------------------------------------------------------------- 19) every gate is really wired
  // The comment above PREMIUM_GATES tells the owner that flipping a value is
  // the whole change. That promise is only true while every key has a real
  // call site — a key with none locks NOTHING while looking identical to one
  // that works. Assert it from the source, and prove each newly wired gate
  // actually blocks by flipping it live.
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
  const gateKeys = await page.evaluate(() => Object.keys(PREMIUM_GATES));
  const unwired = gateKeys.filter(k => {
    const calls = (appSrc.match(new RegExp('gate(?:Allows)?\\("' + k + '"\\)', "g")) || []).length;
    return calls === 0;
  });

  const c19 = await page.evaluate(() => {
    const $ = id => document.getElementById(id);
    const on = () => $("wizPay").className.indexOf("on") >= 0;
    const shut = () => { $("wizPay").className = "wiz"; };
    const o = {};
    /* earlier checks leave a Premium profile behind, and a Premium account is
       exactly who a gate must NOT stop — clear it so we are testing the lock
       rather than the entitlement */
    acc.profile = null; acc.sess = null;

    // hd_finish blocks the tier choice, and skips silently mid-run
    PREMIUM_GATES.hd_finish = true;
    switchPage("pgPath");
    const hd = Array.from(document.querySelectorAll("#ptTierChips .chip")).find(c => /HD/i.test(c.textContent));
    const tier0 = state.pt.tier;
    if (hd) { hd.disabled = false; hd.click(); }
    o.hdBlocks = on() && state.pt.tier === tier0;
    shut();
    o.hdSilentAtRun = gateAllows("hd_finish") === false && !on();
    PREMIUM_GATES.hd_finish = false;
    o.hdOpensAgain = gateAllows("hd_finish") === true;

    // path_export blocks bulk AI delivery but never the free bake
    PREMIUM_GATES.path_export = true;
    $("btnPtZipAll").click(); o.exportBlocks = on(); shut();
    $("btnPtBake").click();   o.freeBakeOpen = !on(); shut();
    PREMIUM_GATES.path_export = false;

    // studio suites are attributed per queued feature, not per page
    switchPage("pgStudio");
    const muEl = ST.groups.filter(g => g.host === "mu")[0].el;
    const evEl = ST.groups.filter(g => g.host === "ev")[0].el;
    const muId = Object.keys(ST.grpOf).find(k => ST.grpOf[k] === muEl);
    const evId = Object.keys(ST.grpOf).find(k => ST.grpOf[k] === evEl);
    o.attribution = stSuiteOf(muId) === "mu" && stSuiteOf(evId) === "ev";
    ST.srcBitmap = ST.srcBitmap || { width: 10, height: 10 };

    PREMIUM_GATES.studio_meitu = true;
    state.st.pend = [{ id: muId, label: "x", params: {} }];
    $("btnStGen").click(); o.meituBlocks = on(); shut();
    PREMIUM_GATES.studio_meitu = false;

    PREMIUM_GATES.studio_evoto = true;
    state.st.pend = [{ id: evId, label: "x", params: {} }];
    $("btnStGen").click(); o.evotoBlocks = on(); shut();
    // the other suite's work must still go through
    state.st.pend = [{ id: muId, label: "x", params: {} }];
    $("btnStGen").click(); o.evotoLockLeavesMeituAlone = !on(); shut();
    PREMIUM_GATES.studio_evoto = false;
    state.st.pend = [];

    o.allOffAfter = Object.values(PREMIUM_GATES).every(v => v === false);
    return o;
  });
  report("19 every PREMIUM_GATES key has a real call site, each newly wired gate actually blocks its own feature, HD skips silently mid-run instead of interrupting with a paywall, Path's free canvas bake is never gated, and locking one Studio suite leaves the other one working",
    unwired.length === 0 && Object.values(c19).every(v => v === true),
    JSON.stringify({ unwired, ...c19 }));

  await browser.close();
  console.log(allOk ? "\nPASS" : "\nFAIL");
  process.exit(allOk ? 0 : 1);
})();
