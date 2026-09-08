/* v6.35.0 / panel 6.104.0 — A STUDENT CAN CLAIM THEIR OWN COMPUTER.
   Until this release exactly one thing could free a taken Computer slot: an administrator
   pressing Reset Computer. A student who bought a machine, reinstalled Windows or had a
   laptop repaired was locked out of the Photoshop Panel until the teacher was awake — and
   the panel's own refusal told them to go and ask. The slot limit is a sharing control, not
   a penalty for buying a computer, so the student may now release their OWN Computer slot,
   from their OWN web session, once every seven days, and every release is recorded with
   their name on it.

   A) the policy is EXECUTED, every branch, against the real module
   B) the route wires that policy to exactly three effects and to no fourth one — in
      particular it must NOT delete the account's refresh tokens the way the admin path
      does, and must not revoke the session that asked
   C) the web app: the control, its confirm, its nine languages, and the English-only badge
      the device list used to carry
   D) the panel points at the control instead of at the teacher
   E) CI runs this test */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const devices = require("../server/lib/devices.js");
const V1 = read("server/lib/v1.js");
const APP = read("docs/app/index.html");
const PANEL = read("panel/main.js");
const SCHEMA = read("server/sql/schema.sql");
const ADMIN = read("server/lib/admin-api.js");
const CI = read(".github/workflows/test.yml");
const DAY = 24 * 60 * 60 * 1000;

/* ---- A) the policy, executed ---- */
const ev = devices.evaluateSelfRelease;
report("A) the policy is exported as a pure function with the seven-day cooldown beside it",
  typeof ev === "function" && devices.SELF_RELEASE_COOLDOWN_DAYS === 7, {
    type: typeof ev, days: devices.SELF_RELEASE_COOLDOWN_DAYS });

const NOW = Date.parse("2026-09-08T06:00:00.000Z");
const cases = [
  { why: "a web session, the computer slot, never released before", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: null, now: NOW },
    allowed: true, code: "allowed" },
  { why: "a PANEL session may not take the slot from the machine holding it", input:
      { clientType: "panel", slotType: "computer", lastSelfReleaseAt: null, now: NOW },
    allowed: false, code: "web_session_required" },
  { why: "no session type at all", input: { slotType: "computer", now: NOW },
    allowed: false, code: "web_session_required" },
  { why: "the phone slot stays with the administrator", input:
      { clientType: "web", slotType: "phone", lastSelfReleaseAt: null, now: NOW },
    allowed: false, code: "slot_not_releasable" },
  { why: "an unnamed slot is not releasable either", input: { clientType: "web", now: NOW },
    allowed: false, code: "slot_not_releasable" },
  { why: "three days after the last release", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: new Date(NOW - 3 * DAY).toISOString(), now: NOW },
    allowed: false, code: "release_cooldown" },
  { why: "one minute short of seven days", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: new Date(NOW - 7 * DAY + 60000).toISOString(), now: NOW },
    allowed: false, code: "release_cooldown" },
  { why: "exactly seven days later", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: new Date(NOW - 7 * DAY).toISOString(), now: NOW },
    allowed: true, code: "allowed" },
  { why: "eight days later", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: new Date(NOW - 8 * DAY).toISOString(), now: NOW },
    allowed: true, code: "allowed" },
  { why: "a Date object reads the same as its string", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: new Date(NOW - 2 * DAY), now: NOW },
    allowed: false, code: "release_cooldown" },
  { why: "unreadable history is not a lock-out", input:
      { clientType: "web", slotType: "computer", lastSelfReleaseAt: "not a date", now: NOW },
    allowed: true, code: "allowed" },
  { why: "no input at all is refused, not thrown", input: undefined,
    allowed: false, code: "web_session_required" },
];
const wrong = cases.filter(c => {
  let v; try { v = ev(c.input); } catch (e) { return true; }
  return !v || v.allowed !== c.allowed || v.code !== c.code;
}).map(c => c.why);
report("A2) every branch of the policy answers as designed (" + cases.length + " executed cases)",
  wrong.length === 0, { wrong });

const cool = ev({ clientType: "web", slotType: "computer",
  lastSelfReleaseAt: new Date(NOW - 3 * DAY).toISOString(), now: NOW });
const fresh = ev({ clientType: "web", slotType: "computer", lastSelfReleaseAt: null, now: NOW });
report("A3) a refusal names the exact moment the student may try again, and an allowance names the next one — both seven days out, neither a bare boolean",
  cool.nextAllowedAt === new Date(NOW + 4 * DAY).toISOString() &&
  fresh.nextAllowedAt === new Date(NOW + 7 * DAY).toISOString() &&
  ev({ clientType: "panel", slotType: "computer", now: NOW }).nextAllowedAt === null,
  { cool: cool.nextAllowedAt, fresh: fresh.nextAllowedAt });

/* ---- B) the route ---- */
const routeStart = V1.indexOf("async function releaseDevice(");
const releaseFn = routeStart < 0 ? "" : V1.slice(routeStart, V1.indexOf("\n}\n", routeStart) + 3);
report("B) POST /v1/devices/release exists, sits behind requireIdentity with the other typed routes, and is the only new route",
  /if \(pathname==="\/v1\/devices\/release"&&method==="POST"\) return releaseDevice\(identity,body\);/.test(V1) &&
  V1.indexOf("requireIdentity(identity);") < V1.indexOf('pathname==="/v1/devices/release"') &&
  releaseFn.length > 200, { hasFn: releaseFn.length });
report("B2) the route decides nothing itself — it asks evaluateSelfRelease, passing the SESSION's own client type, and imports it from the devices module",
  /const \{ createPgDeviceRepository, evaluateSelfRelease \} = require\("\.\/devices"\);/.test(V1) &&
  /const verdict = evaluateSelfRelease\(\{\s*\n\s*clientType: identity\.clientType, slotType,/.test(releaseFn) &&
  /lastSelfReleaseAt: previous\.rows\.length \? previous\.rows\[0\]\.created_at : null,/.test(releaseFn), null);
report("B3) the cooldown is read from the student's own recorded self-releases, not from a column or a cache",
  /event_type='reset' and actor_user_id=\$1\n\s*and details->>'self'='true' and details->>'slot_type'=\$2/.test(releaseFn) &&
  /order by created_at desc limit 1/.test(releaseFn), null);
report("B4) each refusal answers with its own status and code — 429 with the moment to retry, 403 for a panel session, 409 when there is nothing registered",
  /throw new ApiError\(429,[^\n]*"release_cooldown",\n\s*\{next_allowed_at:verdict\.nextAllowedAt,cooldown_days:7\}\);/.test(releaseFn) &&
  /throw new ApiError\(403,[^\n]*"web_session_required"\);/.test(releaseFn) &&
  /throw new ApiError\(400,[^\n]*"slot_not_releasable"\);/.test(releaseFn) &&
  /if \(!count\) throw new ApiError\(409,[^\n]*"slot_not_registered"\);/.test(releaseFn), null);
/* The admin's Reset Computer deletes every refresh token the account owns — it is meant to
   throw the student out everywhere. Doing that here would sign them out of the browser they
   pressed the button in, so the release ends the released slot's sessions and nothing else. */
report("B5) only the released slot's sessions end: the account's refresh tokens are NOT deleted, and the session that asked is excluded — while the admin path still does both",
  !/hnk_auth_refresh_tokens/.test(releaseFn) &&
  /where user_id=\$1 and id<>\$4 and device_installation_id in/.test(releaseFn) &&
  /identity\.sessionId\]\);/.test(releaseFn) &&
  /delete from public\.hnk_auth_refresh_tokens where user_id=\$1/.test(ADMIN), null);
report("B6) the release is recorded under the student's own name, on the existing 'reset' event with details.self — so the device_history CHECK, and the deploy's schema fingerprint, are untouched",
  /insert into public\.device_history \(user_id,actor_user_id,event_type,client_type,details\)\n\s*values \(\$1,\$1,'reset','web',\$2::jsonb\)/.test(releaseFn) &&
  /JSON\.stringify\(\{slot_type:slotType,count,self:true\}\)/.test(releaseFn) &&
  SCHEMA.includes("check (event_type in ('registered','paired','seen','reset','blocked','limit'))") &&
  !/self_release/.test(SCHEMA), null);
report("B7) the slot itself is reset through the repository the admin path uses, not by hand-written SQL",
  /await createPgDeviceRepository\(client\)\.resetSlot\(identity\.uid,slotType,new Date\(\)\.toISOString\(\)\)/.test(releaseFn), null);

/* ---- C) the web app ---- */
report("C) the control exists in the markup, starts hidden, and is wired to the release action",
  /<button class="btn" id="unifiedReleaseComputer" type="button" hidden>Release this Computer<\/button>/.test(APP) &&
  /var rlc=\$\("unifiedReleaseComputer"\); if\(rlc\) rlc\.onclick=function\(\)\{ unifiedRelease\(\); \};/.test(APP), null);
report("C2) it is shown only while a Computer slot is actually taken, and its label is translated on every render",
  /relBtn\.hidden = !devices\.computer; relBtn\.textContent = L9\(REL_TXT\.btn\);/.test(APP), null);
report("C3) the press is confirmed first — it signs another machine out of Photoshop — and posts the typed route with the slot named",
  /if \(!confirm\(L9\(REL_TXT\.q\)\)\) return;/.test(APP) &&
  /accFetch\("\/v1\/devices\/release", \{method:"POST",body:JSON\.stringify\(\{slot_type:"computer"\}\)\}\)/.test(APP), null);
report("C4) the two refusals a student can actually hit are read from the server and answered in words: the cooldown names the date, an empty slot says so",
  /if \(r\.status === 429 \|\| code === "release_cooldown"\)\{/.test(APP) &&
  /L9\(REL_TXT\.wait\)\.replace\("\{D\}", when \? accFmtDate\(when\) : "\\u2014"\)/.test(APP) &&
  /if \(r\.status === 409 \|\| code === "slot_not_registered"\)\{/.test(APP), null);
report("C5) a registration refused because another machine holds the slot now names the control instead of ending the conversation",
  /if \(\/computer_slot_occupied\|panel_slot_occupied\/\.test\(rc\)\)\{\n\s*accSetInline\("unifiedStatus", L9\(REL_TXT\.taken\), "err"\); return;/.test(APP), null);

/* Executed, not matched: the copy object is lifted out of the page and evaluated, so a
   missing language is a failure here rather than a Burmese sentence on a Thai student's
   screen. */
const relStart = APP.indexOf("var REL_TXT = {");
const relEnd = APP.indexOf("\n};", relStart);
let REL = null, relErr = "";
try { REL = new Function("return " + APP.slice(relStart + "var REL_TXT = ".length, relEnd + 2))(); }
catch (e) { relErr = String(e && e.message); }
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const relKeys = ["btn", "q", "busy", "ok", "wait", "none", "taken"];
const relMissing = [];
if (REL) relKeys.forEach(k => LANGS.forEach(l => {
  const v = REL[k] && REL[k][l];
  if (typeof v !== "string" || !v.trim()) relMissing.push(k + "." + l);
}));
report("C6) every self-release line exists in all nine languages (" + relKeys.length + " keys x " + LANGS.length + ")",
  !!REL && relKeys.every(k => REL[k]) && relMissing.length === 0, { relErr, relMissing });
report("C7) the cooldown line carries its {D} placeholder in every language, so no pack silently drops the date",
  !!REL && LANGS.every(l => String(REL.wait[l]).includes("{D}")),
  REL ? LANGS.filter(l => !String(REL.wait[l]).includes("{D}")) : null);
/* The device list badged every other machine with an English string in a nine-language app.
   "Admin reset only" survives exactly once — as the English member of the new key. */
const badgeLiterals = (APP.match(/"Admin reset only"/g) || []).length;
report("C8) the device list's badge is translated — dev_admin_only in all nine languages, and the hardcoded English is gone from the renderer",
  !/textContent = "Admin reset only"/.test(APP) && badgeLiterals === 1 &&
  /locked\.textContent = t\("dev_admin_only"\);/.test(APP) &&
  LANGS.every(l => new RegExp("dev_admin_only:\\{[^}]*\\b" + l + ":\"").test(APP)), { badgeLiterals });
report("C9) the card no longer tells students they cannot do this",
  !/Students cannot reset a registered slot/.test(APP) &&
  /You can release your own Computer slot once every 7 days/.test(APP), null);

/* ---- D) the panel ---- */
report("D) the panel's two slot refusals send the student to the control, not to the teacher — and no longer name Reset Computer",
  /panel_slot_occupied: "[^"]*hnkaistudio\.com[^"]*Account[^"]*"/.test(PANEL) &&
  /computer_slot_occupied: "[^"]*hnkaistudio\.com[^"]*Account[^"]*"/.test(PANEL) &&
  !/(panel|computer)_slot_occupied: "[^"]*Reset Computer/.test(PANEL), null);

/* ---- E) CI ---- */
report("E) CI runs this test", CI.includes("node test/verify_device_self_release.js"), null);

console.log(failures ? "\nFAIL (" + failures + ")"
  : "\nPASS — a student releases their own Computer slot: policy executed, only that slot's sessions end, recorded, nine languages");
process.exit(failures ? 1 : 0);
