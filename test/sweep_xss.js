/* XSS sweep — hostile text from the database renders as text.

   WHY THIS FILE EXISTS. docs/app/index.html builds most of its DOM with
   innerHTML — 206 assignments — and since v5.30 it also renders strings that
   did not come from the repository: a display name the customer typed at
   sign-up, an admin's free-text note, the owner's payment instructions, a
   device label, and from v5.34 a customer's name and email inside the admin
   approval queue. Any one of those rendered as markup is script execution in
   the session of whoever is looking, and the person looking at the admin queue
   is the account that can approve payments.

   Nothing in 92 test scripts drove a payload through any of them.

   WHAT IT DOES. Two halves, and the second is the one that matters.

   The STATIC half reads the file: every innerHTML assignment that interpolates
   anything must route that value through escH() (or esc(), the HSL picker's
   local equivalent), and no interpolation may land inside a single-quoted
   attribute — escH deliberately does not escape the apostrophe, which is safe
   only for as long as that stays true.

   The LIVE half boots the app against a Supabase mock that returns attack
   strings in every field a server can control, then checks that nothing
   executed and that the text is still readable. A test that only proved
   "nothing ran" would pass on a page that silently dropped the customer's
   name; both properties matter.

   Pinned contracts:
   A) No payload executes, in any surface, at any point.
   B) The hostile text is still RENDERED — escaped, not swallowed. A name of
      `<b>Hla</b>` must appear as those characters.
   C) No <script>, no event-handler attribute and no injected element with the
      marker id exists anywhere in the document afterwards.
   D) payment_qr_url cannot become a javascript:, data: or http: image source.
   E) Every interpolating innerHTML sink routes through an escaper.
   F) Nothing interpolates into a single-quoted attribute, because escH does
      not escape the apostrophe.
   G) escH escapes the four characters it claims to, verified by running it.

   Usage: PORT=8931 node test/sweep_xss.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8931;
const URL_ = "http://127.0.0.1:" + PORT + "/index.html";
const APP = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "index.html"), "utf8");
const UID = "11111111-2222-3333-4444-555555555555";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------------- E) every interpolating sink has an escaper ---------------- */
const sinks = [];
const reSink = /(\w[\w.$\[\]"']*)\.innerHTML\s*=\s*([^;\n]{0,240})/g;
let m;
while ((m = reSink.exec(APP))) {
  const val = m[2];
  /* a bare string or template literal with no substitution is a constant */
  if (/^\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`${]*`)\s*$/.test(val)) continue;
  if (!/\+|\$\{|`/.test(val)) continue;
  sinks.push({ line: APP.slice(0, m.index).split("\n").length, target: m[1], expr: val.trim() });
}
/* icn() and tile() emit fixed SVG from a table keyed by name; L9()/t() return
   shipped dictionary strings. Those are repository constants, not input. */
const SAFE = /escH\(|esc\(|icn\(|tile\(|iconFor\(|mono\(|L9\(|\bt\(/;
const unescaped = sinks.filter(s => !SAFE.test(s.expr));
report("E) every innerHTML assignment that interpolates routes through an escaper",
  sinks.length > 20 && unescaped.length === 0,
  { sinks: sinks.length, unescaped: unescaped.slice(0, 5) });

/* ---------------- F) no single-quoted attribute takes an interpolation ----------------
   escH escapes & < > " and NOT '. Inside a double-quoted attribute that is
   correct and complete. Inside a SINGLE-quoted one it is a hole, so the rule
   is that single-quoted attributes never carry interpolated values. */
const singleQuoted = [];
for (const s of sinks) {
  /* ='  immediately followed by a concatenation is the shape that breaks */
  if (/=\s*\\?'\s*\+|\+\s*[^+]*?=\s*'\s*$|='"\s*\+/.test(s.expr)) singleQuoted.push(s);
  if (/'[^']*=\s*'\s*"\s*\+/.test(s.expr)) singleQuoted.push(s);
}
report("F) no interpolated value lands inside a single-quoted attribute (escH does not escape ')",
  singleQuoted.length === 0, singleQuoted.slice(0, 4));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  /* the accepted-https QR case below puts a real URL in a real <img src>; the
     bytes are served here so the result does not depend on the runner having
     DNS, which is how the same check passed locally and failed on CI */
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  await page.route("https://example.supabase.co/**", route =>
    route.fulfill({ status: 200, contentType: "image/png", body: PNG }));

  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 160)));

  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_lang", "en");
    window.__xss = 0;
    /* any of these firing is the failure this file is looking for */
    window.alert = function(){ window.__xss++; };
    window.__origWrite = document.write;
    document.write = function(){ window.__xss++; };
  });

  /* G) escH, run rather than read */
  const escCheck = await (async () => {
    await page.goto(URL_, { waitUntil: "load" });
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const out = escH('<img src=x onerror="a">&\'"');
      return { out, lt: out.indexOf("<") < 0, gt: out.indexOf(">") < 0,
               amp: /&amp;/.test(out), quot: out.indexOf('"') < 0,
               apos: out.indexOf("'") >= 0 };
    });
  })();
  report("G) escH escapes < > \" and &, and (documented) leaves ' alone",
    escCheck.lt && escCheck.gt && escCheck.amp && escCheck.quot && escCheck.apos, escCheck);

  /* ---------------- the live half ---------------- */
  const HOSTILE = '<img src=x id="xssmark" onerror="window.__xss=1"><script>window.__xss=1<\/script>"><svg onload="window.__xss=1">';
  const NAME = '<b>Hla</b> <img src=x onerror="window.__xss=1">';

  await page.addInitScript(`(function(){
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem("__xcfg") || "{}"); } catch(e){}
    function J(o, status){
      return new Response(JSON.stringify(o === undefined ? null : o),
        { status: status || 200, headers: { "Content-Type": "application/json" } });
    }
    var realFetch = window.fetch;
    window.fetch = function(url, opts){
      var u = String(url); opts = opts || {};
      if (!/\\/auth\\/v1\\/|\\/rest\\/v1\\/|\\/storage\\/v1\\//.test(u)) return realFetch.apply(this, arguments);
      if (u.indexOf("grant_type=password") >= 0) return Promise.resolve(J(cfg.login, 200));
      if (u.indexOf("/rest/v1/app_settings") >= 0) return Promise.resolve(J(cfg.settings || [], 200));
      if (u.indexOf("/rest/v1/devices") >= 0) return Promise.resolve(J(cfg.devices || [], 200));
      if (u.indexOf("/rest/v1/profiles") >= 0){
        if (u.indexOf("id=in.") >= 0) return Promise.resolve(J(cfg.who || [], 200));
        return Promise.resolve(J(cfg.profile || null, 200));
      }
      if (u.indexOf("/rest/v1/payment_requests") >= 0) return Promise.resolve(J(cfg.requests || [], 200));
      if (u.indexOf("/storage/v1/object/") >= 0) return Promise.resolve(J({}, 404));
      return Promise.resolve(J([], 200));
    };
  })();`);

  const cfg = {
    login: { access_token: "A1", refresh_token: "R1", expires_in: 3600, user: { id: UID, email: "hla@example.com" } },
    profile: { id: UID, name: NAME, email: HOSTILE, plan_status: "active",
               plan_expires_at: "2099-01-01T00:00:00Z", allowed_devices: 2,
               is_admin: true, joined_paid: true },
    settings: [{ price_1m: 30000, price_3m: 85000, price_6m: 160000, price_extra_device: 15000,
                 price_join_first: 500000,
                 payment_instructions_my: HOSTILE,
                 payment_phone: HOSTILE,
                 payment_qr_url: 'javascript:window.__xss=1' }],
    devices: [{ id: "d1", user_id: UID, device_id: "dev-1", label: HOSTILE, created_at: "2026-01-01T00:00:00Z" }],
    who: [{ id: "99999999-8888-7777-6666-555555555555", name: NAME, email: HOSTILE }],
    requests: [{ id: "r1", user_id: "99999999-8888-7777-6666-555555555555", kind: "plan_1m",
                 txn_last6: HOSTILE, amount_mmk: 30000, status: "rejected",
                 note: HOSTILE, created_at: "2026-08-21T00:00:00Z", is_grant: false }],
  };

  await page.goto(URL_, { waitUntil: "load" });
  await page.evaluate(c => {
    localStorage.setItem("__xcfg", JSON.stringify(c));
    ["hnk_acc_sess_v1", "hnk_acc_profile_v1", "hnk_acc_settings_v1"].forEach(k => localStorage.removeItem(k));
  }, cfg);
  await page.goto(URL_, { waitUntil: "load" });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.scrollTo = function(){};
    Element.prototype.scrollIntoView = function(){};
    switchPage("pgHome");
  });
  await page.fill("#accEmail", "hla@example.com");
  await page.fill("#accPass", "secret123");
  await page.click("#btnAccLogin");
  await page.waitForTimeout(800);
  /* Open every customer accordion so each Student App surface is rendered.
     Cross-account admin payment markup now lives in the separately tested
     Admin Control Center. */
  await page.evaluate(async () => {
    ["accGrpPlan", "accGrpDev"].forEach(g => { try { accOpenGrp(g); } catch(e){} });
    try { await accLoadRequests(); } catch(e){}
    try { accRenderPay(); accRender(); } catch(e){}
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => { try { switchPage("pgDash"); } catch(e){} });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => ({
    xss: window.__xss,
    marks: document.querySelectorAll("#xssmark").length,
    scripts: [...document.querySelectorAll("script")].filter(s => /__xss/.test(s.textContent || "")).length,
    svgOnload: document.querySelectorAll("svg[onload]").length,
    imgOnerror: document.querySelectorAll("img[onerror]").length,
    anyHandler: [...document.querySelectorAll("*")]
      .filter(e => [...e.attributes].some(a => /^on/i.test(a.name) && /__xss/.test(a.value))).length,
    /* B) the text is still there, escaped rather than dropped */
    bodyText: document.body.innerText,
    qrSrc: (document.getElementById("payQrImg") || {}).getAttribute
      ? (document.getElementById("payQrImg").getAttribute("src") || "") : "",
    qrShown: !!(document.getElementById("payRouteQr") &&
                document.getElementById("payRouteQr").getClientRects().length),
  }));

  report("A) no payload executed anywhere",
    result.xss === 0, { xssCounter: result.xss });
  report("C) nothing was injected — no marker element, no handler attribute, no script",
    result.marks === 0 && result.scripts === 0 && result.svgOnload === 0 &&
    result.imgOnerror === 0 && result.anyHandler === 0, result);
  report("B) the hostile text still RENDERS, escaped rather than silently dropped",
    result.bodyText.indexOf("<img src=x") >= 0 || result.bodyText.indexOf("<b>Hla</b>") >= 0,
    { sample: result.bodyText.replace(/\s+/g, " ").slice(0, 200) });
  report("D) a javascript: payment_qr_url never becomes an image source",
    result.qrShown === false && result.qrSrc.indexOf("javascript:") < 0,
    { qrShown: result.qrShown, src: result.qrSrc.slice(0, 60) });

  /* v5.44.0 — the per-scheme payment_qr_url cases that used to follow are
     gone with the panel that rendered them. There is no <img> in the app whose
     src an owner-supplied setting can reach any more, so what those cases
     guarded is now structural rather than filtered. Assert THAT, which is the
     stronger statement, instead of leaving three checks pointed at elements
     that no longer exist and would pass on absence alone. */
  await page.evaluate(() => {
    try { switchPage("pgHome"); accOpenGrp("accGrpPlan"); } catch(e){}
  });
  await page.waitForTimeout(300);
  const qrSurface = await page.evaluate(() => {
    acc.settings = acc.settings || {};
    acc.settings.payment_qr_url = "data:text/html,<script>window.__xss=1<\/script>";
    try { accRenderPay(); accRender(); } catch(e){}
    return {
      qrImg: !!document.getElementById("payQrImg"),
      qrRoute: !!document.getElementById("payRouteQr"),
      dataSrc: Array.from(document.images).filter(i =>
        (i.getAttribute("src") || "").slice(0, 5) === "data:" &&
        (i.getAttribute("src") || "").indexOf("text/html") >= 0).length,
      xss: window.__xss,
    };
  });
  report("D) an owner-supplied payment_qr_url has no image left to reach: the QR surface is gone from the document and nothing rendered a text/html data: source",
    qrSurface.qrImg === false && qrSurface.qrRoute === false &&
    qrSurface.dataSrc === 0 && qrSurface.xss === 0,
    qrSurface);

  report("H) no uncaught exception while rendering any of it",
    errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
