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
      refused: (() => {
        window.accEnrollReason = "computer_slot_occupied";
        const d = JSON.parse(JSON.stringify(base));
        d.reasons.web_app = "device_required";
        window.unified = window.unified || {}; unified.entitlement = d;
        const out = unifiedMessage(unifiedAccountStatus(d), d);
        window.accEnrollReason = "";
        return out;
      })(),
      /* v6.44.0 — the two named refusals that replaced a raw SQLSTATE */
      elsewhere: (() => {
        window.accEnrollReason = "device_registered_elsewhere";
        const d = JSON.parse(JSON.stringify(base));
        d.reasons.web_app = "device_required";
        window.unified = window.unified || {}; unified.entitlement = d;
        const out = unifiedMessage(unifiedAccountStatus(d), d);
        window.accEnrollReason = "";
        return out;
      })(),
      idConflict: (() => {
        window.accEnrollReason = "installation_id_conflict";
        const d = JSON.parse(JSON.stringify(base));
        d.reasons.web_app = "device_required";
        window.unified = window.unified || {}; unified.entitlement = d;
        const out = unifiedMessage(unifiedAccountStatus(d), d);
        window.accEnrollReason = "";
        return out;
      })(),
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
  const branches = ["required", "refused", "mismatch", "novel", "granted", "disabled", "suspended", "expiredLicence"];
  const english = branches.filter(k => !hasBurmese(R[k][0]) || !hasBurmese(R[k][1]));
  report("D) every branch answers in the running language, not English",
    english.length === 0, { english, sample: english.map(k => R[k]) });

  /* G) a browser that ASKED for a slot and was refused is told the refusal,
     not "choose a device" — the chooser would send it back to a button that
     had already failed, which is what the owner's laptop was doing */
  report("G) an enroll the server refused is reported as the refusal, with the server's own word",
    Array.isArray(R.refused) && R.refused[1].indexOf("computer_slot_occupied") >= 0 &&
    R.refused[0] !== R.required[0] && hasBurmese(R.refused[0]), R.refused);

  /* H) v6.44.0 — A SQLSTATE IS NOT A SENTENCE.

     6.42.0 made this banner print the server's reason, and on 2026-09-09 the
     owner photographed his own laptop reading

         ဒီစက်ကို မှတ်ပုံတင်လို့ မရပါ
         Server က ငြင်းလိုက်တဲ့ အကြောင်းရင်း: 23505

     23505 is PostgreSQL's unique_violation: device_installations_active_hash_uniq
     fired because another account still held that machine, registerWebDevice
     had no catch, and fail() published err.code verbatim. The server answered
     device_registered_elsewhere from 6.44.0, and these two prove the student is
     told what that means and what to do — with the code itself gone from the
     text, because a student cannot act on it.

     v6.48.0 — THE SERVER NO LONGER SAYS IT AT ALL. The global hash index is
     gone (schema.sql), so a machine another account holds is simply
     registered. The sentence is KEPT and still checked for one reason: an app
     and an API do not deploy in the same instant, and a browser holding the
     new page against the previous API must not meet a bare code in the window
     between them. It is the fallback for a reason that should not arrive, not
     copy for a rule that still exists — and H2 below covers the conflict that
     genuinely remains. */
  report("H) 'another account holds this machine' is a sentence with a way out, not a code",
    hasBurmese(R.elsewhere[0]) && hasBurmese(R.elsewhere[1]) &&
    R.elsewhere[1].indexOf("device_registered_elsewhere") < 0 &&
    R.elsewhere[1].indexOf("23505") < 0 &&
    /စက်များ|HNK Studio/.test(R.elsewhere[1]), R.elsewhere);
  report("H2) the web/panel id clash is named too, and says who can clear it",
    hasBurmese(R.idConflict[0]) && R.idConflict[0] !== R.elsewhere[0] &&
    R.idConflict[1].indexOf("installation_id_conflict") < 0 &&
    /HNK Studio/.test(R.idConflict[1]), R.idConflict);

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
