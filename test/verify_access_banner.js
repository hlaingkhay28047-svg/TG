/* v6.42.0 — THE ACCESS BANNER NAMES THE REASON, IN THE STUDENT'S LANGUAGE.

   THE DEFECT, photographed by the owner on his own laptop (2026-09-09): every
   line of the account card in Burmese except this banner, which read

       Access blocked
       The server is not authorizing Web App access for this session.

   Two faults in one box. Every string in unifiedMessage was a bare English
   literal in a file where every other line goes through L9. And the wording hid
   the fix: the chain runs account status -> licence -> web_app permission ->
   allowed -> device, so reaching the "allowed" line PROVES the first three
   passed, and after those three server/lib/authorization.js can only refuse
   `web` for device_required or device_mismatch. The very next line already held
   the right words for the first — "Choose this device" — and never ran, because
   the generic refusal fired first. A student opening the app on a new machine
   was told the server had blocked them when one button was all they needed.

   This file drives unifiedMessage in the browser with entitlements built to
   order, rather than reading the source.

   A) a refusal whose reason is device_required offers the device chooser
   B) a refusal whose reason is device_mismatch says another machine holds it,
      and points at Account > Devices
   C) a reason nobody has seen before still NAMES itself
   D) every branch answers in the running language, not English
   E) the granted state is unchanged, and the earlier gates still win over the
      device branches (a suspended account is suspended, not "choose a device")
   F) CI runs this test
*/
"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8931;
const APP = "http://127.0.0.1:" + PORT + "/index.html";
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const hasBurmese = s => /[က-႟]/.test(String(s || ""));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_lang", "my"); } catch (e) {} });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof unifiedMessage === "function"
    && typeof unifiedAccountStatus === "function", null, { timeout: 30000 });

  const R = await page.evaluate(() => {
    const base = {
      account: { account_status: "active", effective_status: "active", approved: true },
      license: { status: "active", active: true, expires_at: "2027-01-01" },
      permissions: { web_app: true },
      devices: { phone: null, computer: null, slots: [] },
      reasons: {}, allowed: { web_app: false },
    };
    const run = mut => {
      const d = JSON.parse(JSON.stringify(base));
      mut(d);
      window.unified = window.unified || {};
      unified.entitlement = d;
      return unifiedMessage(unifiedAccountStatus(d), d);
    };
    const withComputer = d => { d.devices.computer = { registered: true }; };
    return {
      required: run(d => { d.reasons.web_app = "device_required"; }),
      mismatch: run(d => { d.reasons.web_app = "device_mismatch"; withComputer(d); }),
      novel: run(d => { d.reasons.web_app = "quota_exhausted"; withComputer(d); }),
      granted: run(d => { d.allowed.web_app = true; withComputer(d); }),
      disabled: run(d => { d.permissions.web_app = false; }),
      suspended: run(d => {
        d.account.account_status = "suspended"; d.account.effective_status = "suspended";
        d.reasons.web_app = "device_required";
      }),
      expiredLicence: run(d => {
        d.license.active = false; d.license.status = "expired";
        d.reasons.web_app = "device_required";
      }),
    };
  });

  /* A) device_required is a button away, not a wall */
  report("A) a refusal for device_required offers the device chooser, not a blocked wall",
    Array.isArray(R.required) && hasBurmese(R.required[0]) &&
    !/Access blocked|ခွင့်မပြုပါ/.test(R.required[0]) &&
    /browser/i.test(R.required[1]), R.required);

  /* B) device_mismatch says which machine and where to go */
  report("B) a refusal for device_mismatch names the other machine and points at Account > Devices",
    Array.isArray(R.mismatch) && hasBurmese(R.mismatch[0]) &&
    R.mismatch[1].indexOf("▸") >= 0 && R.mismatch[0] !== R.required[0], R.mismatch);

  /* C) a reason the app has never seen still names itself */
  report("C) an unfamiliar reason is printed rather than hidden behind \"not authorizing\"",
    Array.isArray(R.novel) && R.novel[1].indexOf("quota_exhausted") >= 0, R.novel);

  /* D) the banner speaks the running language in every branch */
  const branches = ["required", "mismatch", "novel", "granted", "disabled", "suspended", "expiredLicence"];
  const english = branches.filter(k => !hasBurmese(R[k][0]) || !hasBurmese(R[k][1]));
  report("D) every branch answers in the running language, not English",
    english.length === 0, { english, sample: english.map(k => R[k]) });

  /* E) the earlier gates still win, and the granted state is unchanged */
  report("E) account status and licence still outrank the device branches",
    R.suspended[0] !== R.required[0] && R.expiredLicence[0] !== R.required[0] &&
    R.disabled[0] !== R.required[0] && hasBurmese(R.granted[0]),
    { suspended: R.suspended[0], expired: R.expiredLicence[0], disabled: R.disabled[0], granted: R.granted[0] });

  report("no page error while the banner was built", errs.length === 0, errs.slice(0, 3));

  await browser.close();

  /* F) the lane runs it */
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("F) CI runs this test", wf.indexOf("verify_access_banner.js") >= 0, null);

  console.log(failures ? failures + " FAILURE(S) — the banner would not tell a student what to do."
    : "All checks passed — the banner names the reason, in the student's language.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
