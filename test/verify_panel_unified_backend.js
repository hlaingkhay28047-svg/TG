"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures++;
}

function read(relative) {
  const full = path.join(ROOT, relative);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

const main = read("panel/main.js");
const index = read("panel/index.html");
const bootstrap = read("panel/src/app/bootstrap.js");
const productionApi = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/api";

check("the panel has a tracked authoritative source tree", !!main && !!index,
  "panel/main.js or panel/index.html is missing");
check("the panel uses the unified production API", main.includes(productionApi),
  "unified API base missing");
check("the retired Supabase project and embedded publishable key are absent",
  !/vmtwuuybnalefpgvrast|GATE_SB_ANON|sb_publishable_/i.test(main + index),
  "retired backend credential remains");
check("panel authentication remains password-token compatible",
  main.includes("/auth/v1/token?grant_type=password") &&
  main.includes("/auth/v1/token?grant_type=refresh_token"),
  "login or refresh route missing");
/* 2026-08-30 owner instruction: the pairing-code step is retired. Enrollment
   stays mandatory; the code input and pairing_code field must stay GONE. */
check("computer enrollment is required and the retired pairing step stays gone",
  main.includes("/v1/devices/enroll") && !main.includes("pairing_code") &&
  !/id="gatePairCode"/.test(index),
  "device enrollment missing, or the pairing UI came back");
check("the panel obtains a server authorization lease",
  main.includes("/v1/panel/validate") && /gateS\.lease/.test(main) &&
  /gateLeaseValid\s*\(/.test(main),
  "server lease contract missing");
/* v6.73.0 — THIS CHECK USED TO BE A NAME BLACKLIST, AND A NAME BLACKLIST IS
   THE WRONG SHAPE. It forbade GATE_GRACE_DAYS and gateGraceOk, which stops the
   retired seven-day path coming back under its own name and stops nothing else:
   the same code under a different name passed. The owner asked (2026-09-12) for
   the panel to get the web app's six-hour cold-boot grace, so the retired path
   staying dead is no longer the whole requirement — what has to hold is the
   PROPERTY the retired path violated, and every clause below is that property.

   THE PROPERTY: the offline path may open the overlay and may never hand out a
   lease. gateRequireLease is the choke point every provider operation crosses;
   if the grace could satisfy it, the panel would be generating without a live
   server verdict, which is exactly what the seven-day path did. */
check("the seven-day offline path stays gone by name",
  !/GATE_GRACE_DAYS|gateGraceOk|7\s*\*\s*GATE_DAY[\s\S]{0,200}gateUnlock\(/.test(main),
  "the retired seven-day grace is back");
check("the offline grace never writes a lease — the choke point is untouched",
  /function gateGraceOpen\s*\(/.test(main) &&
  !/function gateGraceOpen[\s\S]{0,900}?gateS\.lease\s*=/.test(main) &&
  !/function gateGraceLeft[\s\S]{0,900}?gateS\.lease\s*=/.test(main) &&
  /async function gateRequireLease\s*\(\)\s*\{\s*const ok = await gateValidate\(true\);/.test(main),
  "the grace can grant a lease, or the provider choke point moved");
check("the grace is bounded by six hours, not seven days",
  /const GATE_GRACE_MS = 6 \* 3600000;/.test(main) &&
  /GATE_GRACE_MS - \(now - seen\)/.test(main),
  "the grace window is missing or is not six hours from the last success");
check("every refusal the server actually sent deletes the remembered verdict",
  (main.match(/gateGraceForget\(\)/g) || []).length >= 2 &&
  /j\.ok === false[\s\S]{0,600}?gateGraceForget\(\)/.test(main) &&
  /gateGraceForget\(\);[\s\S]{0,140}?gateT\("gate_no_lease"\)/.test(main) &&
  /state\.accSeenUid = ""; state\.accSeenDev = "";/.test(main),
  "a refusal the server sent can be survived by relaunching Photoshop");
/* Scoped to gateGraceLeft's OWN body. Both binding lines also appear in
   gateGraceRemember, so an unscoped search passed with the guards deleted:
   injection removed each of them in turn and this check stayed green until it
   was anchored here. */
const graceLeft = (() => {
  const i = main.indexOf("function gateGraceLeft()");
  if (i < 0) return "";
  const j = main.indexOf("\n}", i);
  return j > i ? main.slice(i, j) : "";
})();
check("the remembered verdict is bound to the account, the installation and the plan's own expiry",
  graceLeft.length > 200 &&
  /state\.accSeenUid !== gateS\.sess\.uid\) return 0;/.test(graceLeft) &&
  /state\.accSeenDev !== gateS\.devId\) return 0;/.test(graceLeft) &&
  /function gateGraceExpiry/.test(main) &&
  /if \(!exp \|\| exp <= now\) return 0;/.test(graceLeft) &&
  /if \(gateS\.updateRequired\) return 0;/.test(graceLeft) &&
  /seen > now \+ 60000\) return 0;/.test(graceLeft),
  "the grace is not bound to account, device, expiry, clock and update state");
check("the remembered verdict never travels in a backup file",
  /BACKUP_SKIP = \{[\s\S]{0,400}?accSeenUid: 1[\s\S]{0,60}?accSeenDev: 1/.test(main),
  "accSeenUid/accSeenDev can be carried to another machine in a backup");
check("minimum-version failures hard-lock with Update Required",
  /426|UPDATE_REQUIRED/.test(main) && /Update Required/i.test(main),
  "hard minimum-version handling missing");
check("the lease refreshes on focus or visibility and at most every three minutes",
  /(?:focus|visibilitychange)/.test(main) &&
  /GATE_LEASE_REFRESH_MS\s*=\s*(?:1[0-7]\d{3,4}|180000)/.test(main),
  "focus refresh or <=3-minute interval missing");
check("every provider image operation crosses the lease choke point",
  /async function gateRequireLease\s*\(/.test(main) &&
  /async function callImageAPI\s*\([^)]*\)\s*\{\s*await gateRequireLease\(/.test(main),
  "provider choke point does not require a live lease");
check("modular RunningHub/OpenAI generation also requires the shared lease",
  /panelAuth\.requireLease\(\)/.test(bootstrap) && /HNK\.panelAuth/.test(main),
  "modular provider path bypasses the panel lease");
check("password input is erased after successful authentication",
  /gatePass[\s\S]{0,120}(?:value\s*=\s*""|\.value\s*=\s*"")/.test(main),
  "password clear missing");

if (failures) process.exit(1);
console.log("\nUnified panel authorization contract verified.");
