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
check("offline access and the seven-day grace path are removed",
  !/GATE_GRACE_DAYS|gateGraceOk|gateOffline\(\)[\s\S]{0,600}gateUnlock\(/.test(main),
  "offline grace can still unlock the panel");
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
