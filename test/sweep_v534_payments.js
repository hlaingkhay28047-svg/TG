/* v5.34.0 payments sweep — a payment the owner can actually verify.

   WHAT THE BUY FLOW DID BEFORE. A customer picked a plan chip, read some free
   text, uploaded a screenshot and typed six digits. Nothing recorded HOW MUCH
   they had sent, so the admin approving the request had a slip photo and a
   reference number and no way to tell a 10,000 from a 50,000 without opening
   the image and reading it. And the queue printed row.user_id — a raw UUID —
   so the owner could not tell WHO had paid either. Approving was matching a
   photograph to a string of hex.

   WHAT THE OWNER ASKED FOR, and what each part of it became:

     "tap transfer, choose QR or phone number"    two pay routes, both from
                                                  app_settings, neither in code
     "then show the slip back"                    unchanged, it already worked
     "admin knows who transferred"                name + email, from profiles
     "check the amount is right"                  amount_mmk, shown against the
                                                  price that was actually due
     "only unlocks when admin accepts"            unchanged — approval was
                                                  already the only path, and
                                                  this wave does not add another
     "a monthly fee I can set"                    app_settings default, and a
                                                  per-customer override that
                                                  wins over it
     "500,000 on the first purchase"              a join_first kind, priced
                                                  from app_settings
     "some students get the first one free"       an admin-filed GRANT that
                                                  goes through the same queue
                                                  and the same trigger

   THE ONE RULE THIS FILE EXISTS TO ENFORCE: no price is ever written in the
   code. Every number comes from the database, so the assertions below feed
   made-up prices through the fixture and check the UI quotes THOSE — a test
   that asserted "500,000" would be pinning a business decision into the repo,
   which is the same mistake verify_release_contract made with One-Tap 131.

   Pinned contracts:
   A) Before the joining fee is settled, join_first is the only plan on offer.
   B) Once it is settled, join_first disappears and the renewals appear.
   C) The amount due is quoted from app_settings, and a per-customer override
      beats it.
   D) The QR route appears only for an https URL; the number route only when a
      number is set; neither appears when the owner has set neither.
   E) The amount field is required, accepts a pasted "50,000 MMK", and a
      mismatch WARNS without blocking — a customer who underpaid must still be
      able to file, or the mistake never reaches the person who can fix it.
   F) The insert carries amount_mmk and never carries is_grant.
   G) Payment review is exposed only in the dedicated MFA Admin Control Center.
   H) VIP grants use the strict server API; no browser RLS grant exists.
   I) The schema forbids from the other side everything the client is trusted
      not to do here.
   J) No console error anywhere in the above.

   Usage: PORT=8931 node test/sweep_v534_payments.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8931;
const URL_ = "http://127.0.0.1:" + PORT + "/index.html";
const SQL = fs.readFileSync(path.join(__dirname, "..", "supabase", "schema.sql"), "utf8");
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, "..", "docs", "admin", "index.html"), "utf8");
const ADMIN_JS = fs.readFileSync(path.join(__dirname, "..", "docs", "admin", "admin.js"), "utf8");
const APP_HTML = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");

const UID = "11111111-2222-3333-4444-555555555555";
/* deliberately not round numbers, and deliberately not the owner's real ones:
   if any assertion below could pass against a hardcoded price, these would
   fail it */
const PRICE = { price_1m: 37000, price_3m: 91000, price_6m: 155000,
                price_extra_device: 12000, price_join_first: 480000 };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------------- I) the schema half, read straight off disk ---------------- */
const insertOwn = (SQL.match(/create policy payreq_insert_own[\s\S]*?\);/) || [""])[0];
report("I1) a customer may file the joining fee but may never mark a row a grant",
  /join_first/.test(insertOwn) && /is_grant.*=\s*false/s.test(insertOwn),
  { hasJoin: /join_first/.test(insertOwn), forbidsGrant: /is_grant/.test(insertOwn) });

const insertGrant = (SQL.match(/create policy payreq_insert_admin_grant[\s\S]*?\);/) || [""])[0];
report("I2) browser sessions cannot file cross-account grants",
  insertGrant.length === 0 &&
  /id="paymentGrantForm"/.test(ADMIN_HTML) &&
  /\/api\/v1\/admin\/payment-grants/.test(ADMIN_JS),
  { browserGrantPolicy:insertGrant.length > 0,
    strictAdminForm:/id="paymentGrantForm"/.test(ADMIN_HTML) });

const guard = (SQL.match(/create or replace function public\.hnk_guard_profile_plan[\s\S]*?\$\$;/) || [""])[0];
const guarded = ["joined_paid", "price_1m_override", "price_3m_override", "price_6m_override", "price_join_first_override"];
const unguarded = guarded.filter(c => !new RegExp("new\\." + c + "\\s*:=\\s*old\\." + c).test(guard));
report("I3) a customer cannot write their own price or mark themselves joined",
  unguarded.length === 0, { unguarded });

const applyFn = (SQL.match(/create or replace function public\.hnk_apply_payment[\s\S]*?\$\$;/) || [""])[0];
report("I4) approving the joining fee is what sets joined_paid, and nothing else does",
  /join_first/.test(applyFn) && /joined_paid\s*=\s*case when new\.kind = 'join_first'/.test(applyFn),
  { hasJoin: /join_first/.test(applyFn) });

/* v5.37.0 — identity. profiles_update_own_or_admin is a whole-row grant and the
   guard restored every plan and price column while leaving email and name
   writable, yet three things key on them: the approval queue prints
   `name · email` as who filed a payment, the strict admin grant endpoint
   resolves the target by normalized email, and this project's own instructions hand out admin and per-customer
   prices with `where email = '...'`. */
report("I6) a customer cannot rewrite the identity the owner approves payments against",
  /new\.email\s*:=\s*old\.email/.test(guard) && /new\.name\s*:=\s*old\.name/.test(guard),
  { restoresEmail: /new\.email\s*:=\s*old\.email/.test(guard),
    restoresName: /new\.name\s*:=\s*old\.name/.test(guard) });
/* ...and on INSERT it is TAKEN FROM auth.users rather than blanked. The first
   version of this nulled the column, which rested on an assumption about the
   signup trigger -- a trigger that lives in the owner's Supabase project and
   nowhere in this repository. If that trigger ran with a non-null auth.uid(),
   every new customer would have arrived with no email at all. */
report("I6b) a self-inserted profile takes its email from auth.users, not from the payload",
  /new\.email\s*:=\s*coalesce\(\(select[^)]*from auth\.users/i.test(guard) &&
  !/new\.email\s*:=\s*null/.test(guard),
  { authoritative: /from auth\.users/i.test(guard) });
report("I7) the database refuses two profiles claiming one address",
  /create unique index if not exists profiles_email_uniq[\s\S]{0,120}lower\(email\)/.test(SQL), {});

report("I5) a grant has no reference and no slip, so those columns accept their absence",
  /alter column txn_last6 drop not null/.test(SQL) &&
  /alter column screenshot_path drop not null/.test(SQL), {});

/* ---------------- the browser half ---------------- */
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  /* The QR fixture is an https URL because the client refuses anything else,
     and an https URL is a REAL REQUEST the moment it lands in an <img src>.
     Left alone, the runner tries to resolve example.supabase.co, fails, and
     Chromium logs ERR_NAME_NOT_RESOLVED — which assertion J then reports as a
     console error. It passed here and failed on CI, which is the signature of
     a fixture that depends on the machine's network rather than on the code.
     Serving the bytes from the interceptor makes the outcome the same
     everywhere, which is the only thing a fixture is for. */
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  await page.route("https://example.supabase.co/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }));

  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + String(e).slice(0, 200)));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 160)); });

  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
    localStorage.setItem("hnk_ws_lang", "en");
  });

  /* the Supabase mock, configured per phase through localStorage so it is in
     place before accBoot runs */
  await page.addInitScript(`(function(){
    window.__sb = [];
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("__cfg") || "{}"); } catch(e){}
    window.__cfg = cfg;
    function J(o, status){
      return new Response(JSON.stringify(o === undefined ? null : o),
        { status: status || 200, headers: { "Content-Type": "application/json" } });
    }
    var realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url); opts = opts || {};
      if (!/\\/auth\\/v1\\/|\\/rest\\/v1\\/|\\/storage\\/v1\\//.test(u)) return realFetch.apply(this, arguments);
      var isFD = (typeof FormData !== "undefined") && (opts.body instanceof FormData);
      window.__sb.push({ url: u, method: (opts.method || "GET").toUpperCase(),
                         body: isFD ? null : (typeof opts.body === "string" ? opts.body : null) });
      var C = window.__cfg;
      if (u.indexOf("grant_type=password") >= 0) return Promise.resolve(J(C.login, 200));
      if (u.indexOf("/auth/v1/logout") >= 0) return Promise.resolve(new Response("", { status: 204 }));
      if (u.indexOf("/storage/v1/object/") >= 0) return Promise.resolve(J({ Key: "payment-proofs/x" }, 200));
      if (u.indexOf("/rest/v1/app_settings") >= 0) return Promise.resolve(J(C.settings || [], 200));
      if (u.indexOf("/rest/v1/devices") >= 0){
        var drows = C.devices || [];
        var dm = u.match(/user_id=eq\.([^&]+)/);
        if (dm) drows = drows.filter(function(x){ return x && x.user_id === decodeURIComponent(dm[1]); });
        return Promise.resolve(J(drows, 200));
      }
      if (u.indexOf("/rest/v1/profiles") >= 0){
        /* three different profile reads, and they must not answer each other:
           the signed-in user's own row, the admin's id=in.() batch, and the
           grant form's email lookup */
        if (u.indexOf("email=eq.") >= 0) return Promise.resolve(J(C.byEmail || [], 200));
        if (u.indexOf("id=in.") >= 0)   return Promise.resolve(J(C.who || [], 200));
        return Promise.resolve(J(C.profile || null, 200));
      }
      if (u.indexOf("/rest/v1/payment_requests") >= 0){
        if ((opts.method || "GET").toUpperCase() === "POST"){
          var b = {}; try { b = JSON.parse(opts.body); } catch(e){}
          window.__inserted = Object.assign({ id: "req-1", status: "pending", created_at: "2026-08-21T00:00:00Z" }, b);
          return Promise.resolve(J([window.__inserted], 201));
        }
        /* PostgREST honours user_id=eq.<uid>; so must this, or a client-side
           scoping fix is untestable — the mock would hand back every row
           whatever the query said, and the assertion would measure the mock. */
        var rows = C.requests || [];
        var m = u.match(/user_id=eq\.([^&]+)/);
        if (m) rows = rows.filter(function(x){ return x && x.user_id === decodeURIComponent(m[1]); });
        return Promise.resolve(J(rows, 200));
      }
      return Promise.resolve(J([], 200));
    };
  })();`);

  async function boot(cfg) {
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate(c => {
      localStorage.setItem("__cfg", JSON.stringify(c || {}));
      ["hnk_acc_sess_v1", "hnk_acc_profile_v1", "hnk_acc_settings_v1"].forEach(k => localStorage.removeItem(k));
    }, cfg);
    await page.goto(URL_, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.scrollTo = function(){};
      Element.prototype.scrollIntoView = function(){};
      switchPage("pgHome");
    });
  }
  const session = { access_token: "A1", refresh_token: "R1", expires_in: 3600, user: { id: UID, email: "hla@example.com" } };
  function profile(extra) {
    return Object.assign({ id: UID, name: "Hla Hla", email: "hla@example.com",
      plan_status: "active", plan_expires_at: "2099-01-01T00:00:00Z",
      allowed_devices: 2, is_admin: false, joined_paid: false }, extra || {});
  }
  async function login() {
    await page.fill("#accEmail", "hla@example.com");
    await page.fill("#accPass", "secret123");
    await page.click("#btnAccLogin");
    await page.waitForTimeout(500);
    await page.evaluate(() => { try { accOpenGrp("accGrpBuy"); } catch(e){} });
    await page.waitForTimeout(250);
  }
  /* login() above opens accGrpBuy, which is the ONLY thing that ever loaded
     acc.settings — so every admin assertion in this file was measuring a
     session that had been through the customer buy panel first. A real owner
     on a phone has not. */
  async function loginPlain() {
    await page.fill("#accEmail", "hla@example.com");
    await page.fill("#accPass", "secret123");
    await page.click("#btnAccLogin");
    await page.waitForTimeout(500);
  }
  const chips = () => page.evaluate(() =>
    ["payKindJoin", "payKind1m", "payKind3m", "payKind6m", "payKindDev"].map(id => {
      const e = document.getElementById(id);
      return { id, shown: !!(e && e.getClientRects().length), label: e ? e.textContent.trim() : null,
               on: !!(e && e.className.indexOf("on") >= 0) };
    }));

  /* ---------- A) a genuinely new customer ----------
     "New" means never paid: no plan, no expiry, joined_paid false. Giving this
     fixture an active plan would have made it indistinguishable from the
     upgrade case below, and the first draft of this file did exactly that. */
  const NEVER = { plan_status: "none", plan_expires_at: null, joined_paid: false };
  await boot({ login: session, profile: profile(NEVER), settings: [PRICE] });
  await login();
  let c = await chips();
  const joinChip = c.find(x => x.id === "payKindJoin");
  report("A) before the joining fee is settled, join_first is the only plan on offer",
    joinChip.shown && joinChip.label.indexOf(PRICE.price_join_first.toLocaleString("en-US")) >= 0 &&
    !c.find(x => x.id === "payKind1m").shown &&
    !c.find(x => x.id === "payKind3m").shown &&
    !c.find(x => x.id === "payKind6m").shown,
    c);
  report("A0) a never-joined customer cannot buy an extra-device add-on before the base bundle",
    !c.find(x => x.id === "payKindDev").shown, c);

  let due = await page.evaluate(() => (document.getElementById("payDue").textContent || "").trim());
  report("C1) the amount due is quoted from app_settings, not from the code",
    due.indexOf(PRICE.price_join_first.toLocaleString("en-US")) >= 0, { due });

  /* ---------- B) joined ---------- */
  await boot({ login: session, profile: profile({ joined_paid: true }), settings: [PRICE] });
  await login();
  c = await chips();
  report("B) once it is settled, join_first is gone for good and the renewals appear",
    !c.find(x => x.id === "payKindJoin").shown &&
    c.find(x => x.id === "payKind1m").shown &&
    c.find(x => x.id === "payKind1m").label.indexOf(PRICE.price_1m.toLocaleString("en-US")) >= 0 &&
    c.find(x => x.id === "payKindDev").shown,
    c);

  /* ---------- B2) THE UPGRADE CASE ----------
     joined_paid is a new column defaulting to false, so on release morning
     every existing customer carries joined_paid = false while plainly having
     paid before. Without this rule they would each be quoted the joining fee
     again — the most expensive possible way to greet a paying customer, and
     the exact regression the wider suite caught in this wave.

     An expired plan is used deliberately: the joining fee is paid once, not
     once per lapse, so someone whose plan ran out last month is renewing, not
     re-joining. */
  await boot({ login: session,
               profile: profile({ joined_paid: false, plan_status: "none",
                                  plan_expires_at: "2020-01-01T00:00:00Z" }),
               settings: [PRICE] });
  await login();
  c = await chips();
  report("B2) a customer who paid BEFORE this column existed is never re-charged the joining fee",
    !c.find(x => x.id === "payKindJoin").shown && c.find(x => x.id === "payKind1m").shown &&
    c.find(x => x.id === "payKindDev").shown, c);

  /* ---------- A2) an unconfigured joining fee means no joining fee ----------
     price_join_first is a new column. A project that upgrades and sets
     price_1m but forgets it must NOT show every new customer an unpriced
     "First purchase" chip with the monthly plans hidden behind it — that
     leaves them unable to buy anything at all, which is worse than the
     behaviour before the feature existed. Unconfigured means the owner is not
     charging one, and the old flow continues untouched. */
  const NO_JOIN_FEE = Object.assign({}, PRICE);
  delete NO_JOIN_FEE.price_join_first;
  await boot({ login: session, profile: profile(NEVER), settings: [NO_JOIN_FEE] });
  await login();
  c = await chips();
  report("A2) with no joining fee configured, a new customer sees the ordinary plans and no unpriced chip",
    !c.find(x => x.id === "payKindJoin").shown &&
    c.find(x => x.id === "payKind1m").shown &&
    c.find(x => x.id === "payKind1m").label.indexOf(PRICE.price_1m.toLocaleString("en-US")) >= 0 &&
    c.find(x => x.id === "payKindDev").shown,
    c);

  /* zero is the same statement as absent — an owner who writes 0 is saying
     they do not charge one, not that it is free-but-mandatory */
  await boot({ login: session, profile: profile(NEVER),
               settings: [Object.assign({}, PRICE, { price_join_first: 0 })] });
  await login();
  c = await chips();
  report("A3) a joining fee of zero is treated the same as none at all",
    !c.find(x => x.id === "payKindJoin").shown && c.find(x => x.id === "payKind1m").shown &&
    c.find(x => x.id === "payKindDev").shown, c);

  /* ---------- A4/A5/A6) device-tiered lifetime pricing (v5.41.0) ----------
     Deliberately NOT the owner's real numbers, deliberately not round, and
     deliberately WITHOUT price_join_first — the whole point of this block is
     that tiers are a separate opt-in, and a project that has only configured
     them must behave as if it configured a joining fee, not as if it forgot
     one (that used to be accJoinFeeSet()'s exact foot-gun). */
  const TIERS = { price_device_1: 511000, price_device_2: 819000, price_device_3: 1003000,
                  price_device_4: 1207000, price_device_5: 1411000, price_device_step: 213000,
                  price_1m: 11000, price_3m: 29000, price_6m: 55000 };
  await boot({ login: session, profile: profile(NEVER), settings: [TIERS] });
  await login();
  c = await chips();
  report("A4) tiers alone (no price_join_first) still offer the first-purchase chip",
    c.find(x => x.id === "payKindJoin").shown && !c.find(x => x.id === "payKind1m").shown, c);

  let devWrap = await page.evaluate(() => {
    const w = document.getElementById("payDeviceWrap");
    return w && w.getClientRects().length > 0;
  });
  due = await page.evaluate(() => (document.getElementById("payDue").textContent || "").trim());
  report("A5) the device picker appears for a 1-device default, quoting price_device_1",
    devWrap && due.indexOf(TIERS.price_device_1.toLocaleString("en-US")) >= 0, { devWrap, due });

  await page.selectOption("#payDeviceCount", "3");
  await page.waitForTimeout(150);
  let tierQuote = await page.evaluate(() => ({
    chip: (document.getElementById("payKindJoin").textContent || "").trim(),
    due: (document.getElementById("payDue").textContent || "").trim(),
  }));
  due = tierQuote.due;
  report("A6) picking 3 devices quotes price_device_3 — a bundle rate, not price_device_1 × 3",
    due.indexOf(TIERS.price_device_3.toLocaleString("en-US")) >= 0 &&
    due.indexOf((TIERS.price_device_1 * 3).toLocaleString("en-US")) < 0 &&
    tierQuote.chip.indexOf(TIERS.price_device_3.toLocaleString("en-US")) >= 0, tierQuote);

  /* A configured flat price is normal upgrade state: owners add the tier
     columns; they do not first erase the old joining fee. The chip and the due
     line must still quote the SAME tier, never one legacy amount and one tier. */
  const TIER_UPGRADE = Object.assign({}, PRICE, TIERS);
  await boot({ login: session, profile: profile(NEVER), settings: [TIER_UPGRADE] });
  await login();
  const upgradeOne = await page.evaluate(() => ({
    chip: (document.getElementById("payKindJoin").textContent || "").trim(),
    due: (document.getElementById("payDue").textContent || "").trim(),
  }));
  await page.selectOption("#payDeviceCount", "3");
  await page.waitForTimeout(120);
  const upgradeThree = await page.evaluate(() => ({
    chip: (document.getElementById("payKindJoin").textContent || "").trim(),
    due: (document.getElementById("payDue").textContent || "").trim(),
  }));
  report("A6b) an upgraded flat+tiers project quotes the selected tier consistently on chip and due",
    upgradeOne.chip.indexOf(TIERS.price_device_1.toLocaleString("en-US")) >= 0 &&
    upgradeOne.due.indexOf(TIERS.price_device_1.toLocaleString("en-US")) >= 0 &&
    upgradeOne.chip.indexOf(PRICE.price_join_first.toLocaleString("en-US")) < 0 &&
    upgradeThree.chip.indexOf(TIERS.price_device_3.toLocaleString("en-US")) >= 0 &&
    upgradeThree.due.indexOf(TIERS.price_device_3.toLocaleString("en-US")) >= 0 &&
    upgradeThree.chip.indexOf(PRICE.price_join_first.toLocaleString("en-US")) < 0,
    { one: upgradeOne, three: upgradeThree });

  /* a renewal bills PER DEVICE once tiers are on — the account already has 4
     devices from a past purchase, so plan_1m's due is price_1m × 4, not the
     flat price_1m every non-tiered project still quotes. */
  await boot({ login: session, profile: profile({ joined_paid: true, allowed_devices: 4 }), settings: [TIERS] });
  await login();
  const renewalQuote = await page.evaluate(() => ({
    chip: (document.getElementById("payKind1m").textContent || "").trim(),
    due: (document.getElementById("payDue").textContent || "").trim(),
  }));
  due = renewalQuote.due;
  report("A7) once joined, a renewal is priced per device — price_1m × allowed_devices",
    due.indexOf((TIERS.price_1m * 4).toLocaleString("en-US")) >= 0 &&
    renewalQuote.chip.indexOf((TIERS.price_1m * 4).toLocaleString("en-US")) >= 0 &&
    renewalQuote.chip.indexOf(TIERS.price_1m.toLocaleString("en-US")) < 0, renewalQuote);

  await boot({ login: session, profile: profile({ joined_paid: true, allowed_devices: 9 }), settings: [TIERS] });
  await login();
  const belowCap = (await chips()).find(x => x.id === "payKindDev");
  await boot({ login: session, profile: profile({ joined_paid: true, allowed_devices: 10 }), settings: [TIERS] });
  await login();
  const atCap = await page.evaluate(() => ({
    chipShown: !!document.getElementById("payKindDev").getClientRects().length,
    allowed: accKindAllowed("extra_device"),
    before: accPayKind,
  }));
  await page.evaluate(() => accPayPick("extra_device"));
  atCap.after = await page.evaluate(() => accPayKind);
  await boot({ login: session, profile: profile({ joined_paid: true, allowed_devices: 10 }), settings: [PRICE] });
  await login();
  const flatAtCap = (await chips()).find(x => x.id === "payKindDev");
  report("A7b) tier mode offers add-ons below the cap and refuses them at the cap, while flat mode keeps its legacy add-on",
    belowCap.shown && !atCap.chipShown && !atCap.allowed && atCap.after === atCap.before && flatAtCap.shown,
    { belowCap, atCap, flatAtCap });

  /* the picker must not survive into a kind it does not apply to */
  devWrap = await page.evaluate(() => {
    const w = document.getElementById("payDeviceWrap");
    return w && w.getClientRects().length > 0;
  });
  report("A8) the device picker is gone once the selected chip is a renewal, not join_first",
    !devWrap, { devWrap });

  /* A settings refresh may remove a tier that was selected moments earlier.
     Rendering must clamp that stale count, and the final submit guard must
     still stop a tampered count before either proof upload or request insert. */
  const PARTIAL_TIERS = { price_device_1: 577000, price_1m: 13000, price_3m: 33000, price_6m: 61000 };
  await boot({ login: session, profile: profile(NEVER), settings: [PARTIAL_TIERS] });
  await login();
  const clamped = await page.evaluate(() => {
    accPayDeviceCount = 3;
    accRenderPay();
    return {
      count: accPayDeviceCount,
      value: document.getElementById("payDeviceCount").value,
      due: (document.getElementById("payDue").textContent || "").trim(),
    };
  });
  await page.fill("#payTxn", "482913");
  await page.fill("#payAmt", String(PARTIAL_TIERS.price_device_1));
  const refused = await page.evaluate(async () => {
    accPayBlob = new Blob(["x"], { type: "image/jpeg" });
    accPayDeviceCount = 3;                  /* bypass the select, as a stale/tampered caller can */
    window.__sb.length = 0;
    accPayValidate();
    const disabled = document.getElementById("btnPaySubmit").disabled;
    await accSubmitPayment();
    return {
      disabled,
      uploads: window.__sb.filter(x => x.url.indexOf("/storage/v1/object/") >= 0).length,
      posts: window.__sb.filter(x => x.url.indexOf("/rest/v1/payment_requests") >= 0 && x.method === "POST").length,
    };
  });
  const reset = await page.evaluate(() => {
    accPayDeviceCount = 3;
    accSignOutLocal("quiet");
    return accPayDeviceCount;
  });
  report("A9) render clamps an unavailable tier and submit refuses a stale/tampered tier before upload",
    clamped.count === 1 && clamped.value === "1" &&
    clamped.due.indexOf(PARTIAL_TIERS.price_device_1.toLocaleString("en-US")) >= 0 &&
    refused.disabled && refused.uploads === 0 && refused.posts === 0 && reset === 1,
    { clamped, refused, reset });

  /* ---------- C2) a per-customer price beats the default ---------- */
  await boot({ login: session, profile: profile({ joined_paid: true, price_1m_override: 9000 }), settings: [PRICE] });
  await login();
  const ovr = await page.evaluate(() => ({
    chip: document.getElementById("payKind1m").textContent.trim(),
    due: (document.getElementById("payDue").textContent || "").trim(),
  }));
  report("C2) a per-customer override beats the app_settings default everywhere it is shown",
    ovr.chip.indexOf("9,000") >= 0 && ovr.due.indexOf("9,000") >= 0 &&
    ovr.chip.indexOf(PRICE.price_1m.toLocaleString("en-US")) < 0, ovr);

  /* ---------- D) the two pay routes ---------- */
  for (const [label, settings, wantQr, wantNum] of [
    ["both configured", Object.assign({}, PRICE, { payment_qr_url: "https://example.supabase.co/x/qr.jpg", payment_phone: "09688200680" }), true, true],
    ["number only", Object.assign({}, PRICE, { payment_phone: "09688200680" }), false, true],
    ["an http:// QR is refused", Object.assign({}, PRICE, { payment_qr_url: "http://insecure.example/qr.jpg" }), false, false],
    ["neither configured", Object.assign({}, PRICE), false, false],
  ]) {
    await boot({ login: session, profile: profile({ joined_paid: true }), settings: [settings] });
    await login();
    const r = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return !!(e && e.getClientRects().length); };
      const img = document.getElementById("payQrImg");
      return { qr: vis("payRouteQr"), num: vis("payRouteNum"), routes: vis("payRoutes"),
               src: img ? (img.getAttribute("src") || "") : "",
               number: (document.getElementById("payNum").textContent || "").trim() };
    });
    report("D) pay routes — " + label,
      r.qr === wantQr && r.num === wantNum && r.routes === (wantQr || wantNum) &&
      (!wantQr ? r.src.indexOf("http://") < 0 : true) &&
      (wantNum ? r.number === "09688200680" : true), r);
  }

  /* ---------- D2) the QR is a scannable square, and a broken one withdraws ----------
     Two things a person actually holding a phone depends on.

     A QR is square. Sizing it with height:auto meant the box had no reserved
     height until the bytes arrived, so the panel jumped when they did and — as
     this was being measured — a QR that never arrived rendered 26px tall under
     a heading reading "Scan the QR". A customer was being told to scan an
     empty box.

     The URL is typed by the owner into a database field, which makes it the
     likeliest thing here to be wrong: a stale object, a bucket never made
     public, a typo. When the bytes do not arrive the whole route is now
     withdrawn and the phone number carries the payment instead. */
  {
    const QR = "https://example.supabase.co/x/qr.jpg";
    await boot({ login: session, profile: profile({ joined_paid: true }),
                 settings: [Object.assign({}, PRICE, { payment_qr_url: QR, payment_phone: "09688200680" })] });
    await login();
    await page.waitForTimeout(500);
    const good = await page.evaluate(() => {
      const i = document.getElementById("payQrImg");
      const r = i.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               loaded: i.complete && i.naturalWidth > 0,
               routeShown: document.getElementById("payRouteQr").style.display !== "none" };
    });
    report("D2) a QR that loads is a square big enough to scan",
      good.loaded && good.routeShown && good.h >= 180 && Math.abs(good.w - good.h) <= 2, good);

    /* D2b) the square must be reserved BEFORE the bytes arrive, and this is
       the assertion that actually distinguishes aspect-ratio from height:auto.
       Measured with a loaded square image the two are indistinguishable — the
       first draft of D2 passed either way, which is why it is not the whole
       check. With the image still in flight, height:auto collapses the box to
       nothing and the entire buy panel jumps down the moment the QR lands. */
    await page.unroute("https://example.supabase.co/**");
    let releaseQr;
    const held = new Promise(res => { releaseQr = res; });
    await page.route("https://example.supabase.co/**", async r => {
      await held;
      return r.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    await page.evaluate(() => {
      document.getElementById("payQrImg").removeAttribute("src");
      accRenderPay();
    });
    await page.waitForTimeout(400);
    const pending = await page.evaluate(() => {
      const i = document.getElementById("payQrImg");
      const r = i.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
               loaded: i.complete && i.naturalWidth > 0 };
    });
    releaseQr();
    await page.waitForTimeout(400);
    report("D2b) the square is reserved while the QR is still loading, so the panel does not jump when it lands",
      pending.loaded === false && pending.h >= 180 && Math.abs(pending.w - pending.h) <= 2, pending);

    /* now make the same URL fail, exactly as a wrong one would */
    await page.unroute("https://example.supabase.co/**");
    await page.route("https://example.supabase.co/**", r => r.fulfill({ status: 404, body: "" }));
    await page.evaluate(() => {
      const i = document.getElementById("payQrImg");
      i.removeAttribute("src");          /* force a fresh fetch of the same URL */
      accRenderPay();
    });
    await page.waitForTimeout(700);
    const bad = await page.evaluate(() => ({
      qrShown: !!document.getElementById("payRouteQr").getClientRects().length,
      numShown: !!document.getElementById("payRouteNum").getClientRects().length,
      number: (document.getElementById("payNum").textContent || "").trim(),
    }));
    report("D3) a QR that fails to load withdraws its route, leaving the number to carry the payment",
      bad.qrShown === false && bad.numShown === true && bad.number === "09688200680", bad);

    /* put the good route back for anything after this block */
    await page.unroute("https://example.supabase.co/**");
    await page.route("https://example.supabase.co/**", r =>
      r.fulfill({ status: 200, contentType: "image/png", body: PNG }));

    /* D3 made a request fail ON PURPOSE, so the 404 it produced is expected
       output rather than a defect. Exactly the errors that name a failed load
       are dropped — anything else raised in this block still reaches J, and J
       stays strict about the rest of the file. Excusing the whole block, or
       clearing the array, would have hidden a real error raised alongside. */
    for (let i = errs.length - 1; i >= 0; i--) {
      if (/Failed to load resource/.test(errs[i]) && /404/.test(errs[i])) errs.splice(i, 1);
    }
  }

  /* ---------- E + F) the amount ---------- */
  await boot({ login: session, profile: profile({ joined_paid: true }), settings: [Object.assign({}, PRICE, { payment_phone: "09688200680" })] });
  await login();
  await page.evaluate(() => accPayPick("plan_1m"));
  await page.waitForTimeout(150);

  const e1 = await page.evaluate(() => ({ disabled: document.getElementById("btnPaySubmit").disabled }));
  await page.fill("#payTxn", "482913");
  await page.evaluate(() => {
    /* the screenshot, without a real file picker */
    accPayBlob = new Blob(["x"], { type: "image/jpeg" });
    accPayValidate();
  });
  await page.waitForTimeout(120);
  const e2 = await page.evaluate(() => ({ disabled: document.getElementById("btnPaySubmit").disabled }));
  report("E1) submit stays disabled until an amount is given, even with a slip and a reference",
    e1.disabled === true && e2.disabled === true, { before: e1, withSlipAndTxn: e2 });

  await page.fill("#payAmt", "50,000 MMK");
  await page.waitForTimeout(150);
  const e3 = await page.evaluate(() => ({
    value: document.getElementById("payAmt").value,
    disabled: document.getElementById("btnPaySubmit").disabled,
    warn: (document.getElementById("payAmtWarn").textContent || "").trim(),
    warnShown: document.getElementById("payAmtWarn").style.display !== "none",
  }));
  report("E2) a pasted \"50,000 MMK\" becomes 50,000 and enables submit",
    e3.value === "50,000" && e3.disabled === false, e3);
  report("E3) over-paying warns, naming both the difference and what was due — and does NOT block",
    e3.warnShown && e3.warn.indexOf("13,000") >= 0 &&
    e3.warn.indexOf(PRICE.price_1m.toLocaleString("en-US")) >= 0 && e3.disabled === false, e3);

  await page.fill("#payAmt", "1000");
  await page.waitForTimeout(150);
  const e4 = await page.evaluate(() => ({
    warn: (document.getElementById("payAmtWarn").textContent || "").trim(),
    disabled: document.getElementById("btnPaySubmit").disabled,
  }));
  report("E4) under-paying warns too, and still lets the request through to the admin",
    e4.warn.indexOf("36,000") >= 0 && e4.disabled === false, e4);

  await page.fill("#payAmt", "37000");
  await page.waitForTimeout(150);
  const e5 = await page.evaluate(() => ({ warnShown: document.getElementById("payAmtWarn").style.display !== "none" }));
  report("E5) the exact amount raises no warning at all", e5.warnShown === false, e5);

  /* E6) TYPED, not filled — and the distinction is the whole assertion.
     page.fill sets the value in one go, which sails past a maxlength; a
     customer presses one key at a time and does not. The field formats with
     thousands separators and maxlength counted the commas, so at "1,234,567"
     the input was already nine characters and the browser silently swallowed
     the eighth digit. Someone entering 12,345,678 watched it stay 1,234,567 —
     an order of magnitude wrong, in a money field, with no message, and then
     submitted as their claimed amount. Every check above passed while that was
     true, because every one of them used fill. */
  const typed = {};
  for (const digits of ["500000", "12345678", "123456789"]) {
    await page.fill("#payAmt", "");
    await page.click("#payAmt");
    for (const ch of digits) await page.type("#payAmt", ch, { delay: 4 });
    typed[digits] = await page.evaluate(() =>
      (document.getElementById("payAmt").value || "").replace(/[^0-9]/g, ""));
  }
  report("E6) typing a long amount keeps every digit — the separators must not eat the value",
    Object.keys(typed).every(d => typed[d] === d), typed);
  await page.fill("#payAmt", "37000");
  await page.waitForTimeout(120);

  await page.click("#btnPaySubmit");
  await page.waitForTimeout(500);
  const posted = await page.evaluate(() => {
    const p = window.__sb.filter(x => x.url.indexOf("/rest/v1/payment_requests") >= 0 && x.method === "POST").pop();
    return p ? JSON.parse(p.body) : null;
  });
  report("F) the insert carries the amount, and never carries is_grant",
    !!posted && posted.amount_mmk === 37000 && posted.kind === "plan_1m" &&
    posted.txn_last6 === "482913" && !("is_grant" in posted) &&
    !("status" in posted) && !("reviewed_at" in posted),
    { keys: posted && Object.keys(posted).sort(), amount: posted && posted.amount_mmk });

  /* ---------- F2) nothing on offer means nothing filable (v5.37.0) ----------
     v5.37.0 made accKindAllowed return false while the profile is unread, so a
     backend blip could not quote the wrong price. That hid every chip — and
     accPayKind is initialised to "plan_1m" and survives a render in which
     nothing was offered, while accSubmitPayment guarded only on sess+settings.
     A customer who owed the 500,000 joining fee could therefore fill in a
     reference, an amount and a screenshot and file a MONTHLY payment instead.
     Hiding the chips made the gate look enforced while leaving it open. */
  await boot({
    login: session,
    profile: null,                       /* the profile read never lands */
    settings: [PRICE],
    requests: [],
  });
  await login();
  const noOffer = await page.evaluate(async () => {
    const chips = ["payKindJoin", "payKind1m", "payKind3m", "payKind6m", "payKindDev"]
      .filter(id => { const e = document.getElementById(id); return !!(e && e.getClientRects().length); });
    /* fill the form as completely as a customer can */
    document.getElementById("payTxn").value = "123456";
    document.getElementById("payAmt").value = "10000";
    accPayBlob = new Blob(["x"], { type: "image/png" });
    try { accPayValidate(); } catch (e) {}
    const before = window.__sb.filter(x => x.url.indexOf("/rest/v1/payment_requests") >= 0 &&
                                           x.method === "POST").length;
    await accSubmitPayment();
    return {
      chips,
      formShown: !!(document.getElementById("payForm") || {}).getClientRects &&
                 document.getElementById("payForm").getClientRects().length > 0,
      notice: (document.getElementById("payNoOffer").textContent || "").trim(),
      submitDisabled: !!document.getElementById("btnPaySubmit").disabled,
      posted: window.__sb.filter(x => x.url.indexOf("/rest/v1/payment_requests") >= 0 &&
                                      x.method === "POST").length - before,
    };
  });
  /* The notice is deliberately EMPTY. v5.37.0 put t("acc_unreachable") here,
     which ends "the app still works as normal" — true where that string was
     written, false here, because this branch is only reached with the access
     wall up. The wall's own heading is the accurate message. Asserting the
     notice is empty pins that decision rather than leaving the next author to
     re-add a reassuring sentence. */
  report("F2) with nothing on offer the form is shut, files nothing, and claims nothing",
    noOffer.chips.length === 0 && !noOffer.formShown && noOffer.notice === "" &&
    noOffer.submitDisabled && noOffer.posted === 0,
    noOffer);

  /* Cross-account review and VIP grants moved out of the Student App. The
     dedicated admin contract below stays active in every run, while the
     server-level suite exercises authorization, validation and transactions. */
  report("G/H) payments and VIP grants live only in the MFA Admin Control Center",
    /id="panel-payments"/.test(ADMIN_HTML) &&
    /id="paymentGrantForm"/.test(ADMIN_HTML) &&
    /\/api\/v1\/admin\/payment-requests/.test(ADMIN_JS) &&
    /\/api\/v1\/admin\/payment-grants/.test(ADMIN_JS) &&
    /id="openAdminCenter" href="\.\.\/admin\/"/.test(APP_HTML) &&
    !/btnAdmReload|btnAdmGrant|admList/.test(
      (APP_HTML.match(/<section class="card" id="cardAdmin"[\s\S]*?<\/section>/) || [""])[0]),
    { adminPanel:/id="panel-payments"/.test(ADMIN_HTML),
      appHandoff:/id="openAdminCenter" href="\.\.\/admin\/"/.test(APP_HTML) });

  /* ---- K) an approved DEVICE SLOT is not an approved PLAN ----
     accPollOnce toasted acc_plan_active on any approved row, so a customer
     with no plan who paid for one extra device slot was congratulated with
     "Premium active — 0 days left" and dropped on a panel reading "No Premium
     yet". schema.sql's extra_device branch bumps allowed_devices and
     deliberately never touches plan_expires_at, so the slot really was
     granted; only the sentence was wrong. The replacement needs no new
     translation — pay_extra and req_approved already ship in every locale. */
  await boot({ login: session, profile: profile({ plan_status: "none", plan_expires_at: null }),
               requests: [], devices: [] });
  await login();
  const slot = await page.evaluate(async () => {
    const said = [];
    const realToast = window.toast;
    window.toast = function (msg, kind) { said.push(String(msg)); };
    acc.pending = { id: "req-dev", user_id: acc.sess.uid, kind: "extra_device", status: "pending" };
    window.__cfg.requests = [{ id: "req-dev", user_id: acc.sess.uid, kind: "extra_device",
                               status: "approved", amount_mmk: 5000 }];
    await accPollOnce();
    window.toast = realToast;
    const cls = id => { const e = document.getElementById(id); return e ? e.className : "(none)"; };
    return { said, planGrp: cls("accGrpPlan"), devGrp: cls("accGrpDev"),
             planLabel: (typeof t === "function") ? t("acc_plan_active") : "",
             extraLabel: (typeof accKindLabel === "function") ? accKindLabel("extra_device") : "" };
  });
  report("K) approving an extra device slot names the slot, not a plan the customer never bought",
    slot.said.length === 1 &&
    slot.said[0].indexOf(slot.extraLabel) === 0 &&
    !/0/.test(slot.said[0]) &&
    slot.devGrp.indexOf("open") >= 0 && slot.planGrp.indexOf("open") < 0,
    slot);

  report("J) none of the above raised a console error", errs.length === 0, errs.slice(0, 4));

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
