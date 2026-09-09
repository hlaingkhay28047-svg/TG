/* v6.45.0 — THE NUMBER THE TEACHER SETS IS THE NUMBER THE STUDENT GETS.

   profiles.allowed_devices is the account's seat count. devices.js claimSlot
   has enforced it as a TOTAL since the seat model landed (2026-08-30) — one
   advisory lock, one count of active slots, refuse at the limit — and
   admin-api.js prices a renewal on it (allowed_devices x per-device). But the
   number never reached the student's app: /v1/me/entitlement returned only
   `devices.phone` and `devices.computer`, the Account card drew the two boxes
   its HTML happened to contain with "1/1" hard-coded into both, and the two
   Register buttons hid themselves the moment a device of that kind existed.

   So an account set to four could register two, and the owner met exactly that
   on 2026-09-09: his own account showed "စက် ၄ လုံးအနက် ၁ လုံး သုံးထားပါတယ်" and
   would not take a second computer. Four seats paid for, two seats given.

   A) the entitlement carries the ceiling and what stands on it
   B) a free seat shows the Register button on this browser
   C) a full account does not
   D) neither does a browser that is already registered
   E) the card counts what is really there, in the running language
   F) a second device of the same kind is shown, not hidden
   G) CI runs this test
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

/* ---- A) the server side, driven directly ---- */
const { publicEntitlement } = require(path.join(ROOT, "server/lib/entitlements.js"));
const state = {
  account: { id:"u1",name:"S",email:"s@x",status:"active",isAdmin:false },
  allowedDevices: 4,
  license: { status:"active",startsAt:"2026-01-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z" },
  permissions: { webAppEnabled:true,ccxDownloadEnabled:true,panelEnabled:true },
  device: null,
  panelVersion: { installedVersion:"",minimumSupportedVersion:"",latestVersion:"" },
};
const decisions = { web:{allowed:true,reason:"allowed"},download:{allowed:true,reason:"allowed"},
  panel:{allowed:true,reason:"allowed"} };
const slots = [
  { id:"s1",type:"phone",status:"active",registered:true,label:"Android · Chrome" },
  { id:"s2",type:"computer",status:"reset",registered:false,label:"Old PC" },
];
const ent = publicEntitlement(state, decisions, slots);
report("A) the entitlement carries the seat ceiling and the seats in use",
  ent.devices && ent.devices.allowed === 4 && ent.devices.used === 1 &&
    Array.isArray(ent.devices.slots) && ent.devices.slots.length === 2,
  ent.devices);
report("A2) a reset slot does not count against the ceiling",
  ent.devices.used === 1, { used: ent.devices.used, slots: slots.map(s => s.status) });

const src = fs.readFileSync(path.join(ROOT, "server/lib/entitlements.js"), "utf8");
report("A3) the ceiling is read from profiles.allowed_devices, not invented",
  /coalesce\(p\.allowed_devices,2\) as allowed_devices/.test(src) &&
  /allowedDevices: Math\.max\(1, Number\(row\.allowed_devices\) \|\| 2\)/.test(src), null);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_lang", "my"); } catch (e) {} });
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof unifiedRender === "function", null, { timeout: 30000 });

  const R = await page.evaluate(() => {
    const base = allowed => ({
      account: { account_status:"active", effective_status:"active", approved:true },
      license: { status:"active", active:true, expires_at:"2027-01-01" },
      permissions: { web_app:true, ccx_download:true, panel:true },
      devices: { phone:null, computer:null, slots:[], allowed, used:0 },
      reasons: { web_app:"allowed" }, allowed: { web_app:true },
    });
    /* the app decides on the device type it observes, so pin it to a computer */
    window.unifiedDeviceType = function(){ return "computer"; };
    window.acc = window.acc || {}; acc.sess = { access:"a" };
    const draw = d => {
      window.unified = window.unified || {};
      unified.entitlement = d; unified.enforced = true;
      unified.loading = false; unified.error = false; unified.last = Date.now();
      unifiedRender();
      return {
        computerBtnHidden: document.getElementById("unifiedEnrollComputer").hidden,
        phoneBtnHidden: document.getElementById("unifiedEnrollPhone").hidden,
        computerText: document.getElementById("unifiedComputer").textContent,
        phoneText: document.getElementById("unifiedPhone").textContent,
      };
    };
    const out = {};

    /* B) four seats, one used, this browser not registered */
    let d = base(4);
    d.devices.slots = [{ id:"s1", type:"phone", status:"active", registered:true, label:"Android" }];
    d.devices.phone = d.devices.slots[0];
    d.devices.used = 1;
    d.reasons.web_app = "device_required"; d.allowed.web_app = false;
    out.freeSeat = draw(d);

    /* B2) THE CASE THE WHOLE WAVE IS ABOUT, and the one the first draft of this
       file missed: a computer is ALREADY registered — on some other machine —
       a seat is still free, and this browser wants to be the second. The old
       rule hid the button on `!!devices.computer` alone, so the answer was no
       however many seats the teacher had sold. */
    d = base(4);
    d.devices.slots = [
      { id:"s1", type:"phone", status:"active", registered:true, label:"Android" },
      { id:"s2", type:"computer", status:"active", registered:true, label:"Studio PC" },
    ];
    d.devices.phone = d.devices.slots[0]; d.devices.computer = d.devices.slots[1];
    d.devices.used = 2;
    d.reasons.web_app = "device_required"; d.allowed.web_app = false;
    out.secondComputer = draw(d);

    /* C) four seats, all four used */
    d = base(4);
    d.devices.slots = ["phone","computer","computer","phone"].map((t, i) =>
      ({ id:"s"+i, type:t, status:"active", registered:true, label:t }));
    d.devices.phone = d.devices.slots[0]; d.devices.computer = d.devices.slots[1];
    d.devices.used = 4;
    d.reasons.web_app = "device_required"; d.allowed.web_app = false;
    out.full = draw(d);

    /* D) a free seat, but this browser is already the registered one */
    d = base(4);
    d.devices.slots = [{ id:"s1", type:"computer", status:"active", registered:true, label:"This PC" }];
    d.devices.computer = d.devices.slots[0];
    d.devices.used = 1;
    out.alreadyMine = draw(d);

    /* F) two computers registered */
    d = base(4);
    d.devices.slots = [
      { id:"s1", type:"computer", status:"active", registered:true, label:"Studio PC" },
      { id:"s2", type:"computer", status:"active", registered:true, label:"Laptop" },
    ];
    d.devices.computer = d.devices.slots[0];
    d.devices.used = 2;
    out.twoComputers = draw(d);
    return out;
  });

  report("B) a free seat offers Register on this browser",
    R.freeSeat.computerBtnHidden === false, R.freeSeat);
  report("B2) a SECOND computer is offered while a seat is free, even though one is registered",
    R.secondComputer.computerBtnHidden === false, R.secondComputer);
  report("C) an account with every seat taken does not",
    R.full.computerBtnHidden === true, R.full);
  report("D) neither does a browser that is already registered",
    R.alreadyMine.computerBtnHidden === true, R.alreadyMine);
  report("E) the card names the ceiling and the count, in the running language",
    /4/.test(R.freeSeat.computerText) && /1/.test(R.freeSeat.computerText) &&
    hasBurmese(R.freeSeat.computerText) && !/1\/1/.test(R.freeSeat.computerText),
    R.freeSeat.computerText);
  report("F) a second device of the same kind is shown, not swallowed",
    /\+1/.test(R.twoComputers.computerText) && /2/.test(R.twoComputers.computerText),
    R.twoComputers.computerText);
  report("no page error while the device card was drawn", errs.length === 0, errs.slice(0, 3));

  await browser.close();

  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("G) CI runs this test", wf.indexOf("verify_device_seats.js") >= 0, null);

  console.log(failures ? failures + " FAILURE(S) — the seats the teacher sells are not the seats the student gets."
    : "All checks passed — allowed_devices is what the student can actually register.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
