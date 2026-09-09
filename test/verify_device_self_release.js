/* v6.47.0 — AND THEIR OWN PHONE. 6.35.0 left the Phone with the administrator
   because the Phone is not what blocks a machine from Photoshop. It blocks
   something just as real: since 6.45.0 the seats are ONE TOTAL COUNT, so a
   phone that was lost, sold or wiped holds a seat the student paid for and
   cannot reach. The policy, the route, the cooldown and the record are the
   same; the list of releasable slot types is now two long, and a type that is
   on neither is still refused. Each type keeps its own seven-day cooldown, so
   freeing a dead phone never costs the Computer release.

   v6.35.0 / panel 6.104.0 — A STUDENT CAN CLAIM THEIR OWN COMPUTER.
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
/* v6.47.0 — the releasable list is DATA, exported and asserted here, so a later
   wave that widens it (or narrows it back) has to say so in this file rather
   than in a buried string comparison. */
report("A1) exactly two slot types are releasable by the student — the computer and the phone",
  Array.isArray(devices.RELEASABLE_SLOT_TYPES) &&
  devices.RELEASABLE_SLOT_TYPES.slice().sort().join(",") === "computer,phone",
  devices.RELEASABLE_SLOT_TYPES);

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
  { why: "v6.47.0 — the phone slot is the student's to release too", input:
      { clientType: "web", slotType: "phone", lastSelfReleaseAt: null, now: NOW },
    allowed: true, code: "allowed" },
  { why: "a PANEL session may not release the phone either", input:
      { clientType: "panel", slotType: "phone", lastSelfReleaseAt: null, now: NOW },
    allowed: false, code: "web_session_required" },
  { why: "the phone carries the same seven-day cooldown", input:
      { clientType: "web", slotType: "phone", lastSelfReleaseAt: new Date(NOW - 3 * DAY).toISOString(), now: NOW },
    allowed: false, code: "release_cooldown" },
  { why: "an unnamed slot is not releasable either", input: { clientType: "web", now: NOW },
    allowed: false, code: "slot_not_releasable" },
  { why: "a slot type that is on neither list is still refused", input:
      { clientType: "web", slotType: "tablet", lastSelfReleaseAt: null, now: NOW },
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
/* v6.47.0 — the sentences name the slot the student pressed. slotWord is
   derived from the request's own slot_type, so a Phone release never tells a
   student about a Computer. */
report("B4b) every message the route writes names the slot the student actually pressed",
  /const slotWord = slotType === "phone" \? "Phone" : "Computer";/.test(V1) &&
  (releaseFn.match(/\+slotWord\+/g) || []).length >= 3 &&
  /"Only the Computer or the Phone slot can be released from here","slot_not_releasable"/.test(releaseFn), null);
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
report("C) both controls exist in the markup, start hidden, and are wired to the release action with their own slot named",
  /<button class="btn" id="unifiedReleaseComputer" type="button" hidden>Release this Computer<\/button>/.test(APP) &&
  /<button class="btn" id="unifiedReleasePhone" type="button" hidden>Release this Phone<\/button>/.test(APP) &&
  /var rlc=\$\("unifiedReleaseComputer"\); if\(rlc\) rlc\.onclick=function\(\)\{ unifiedRelease\("computer"\); \};/.test(APP) &&
  /var rlp=\$\("unifiedReleasePhone"\); if\(rlp\) rlp\.onclick=function\(\)\{ unifiedRelease\("phone"\); \};/.test(APP), null);
/* v6.47.0 — both buttons read the COUNTED seats (phoneN / compN), not
   devices.phone / devices.computer: an entitlement payload that carries the
   slot list without the pair hid a control over a plainly registered device. */
report("C2) each control is shown only while a slot of its kind is actually taken, counted from the slot list, and its label is translated on every render",
  /relBtn\.hidden = !compN; relBtn\.textContent = L9\(REL_TXT\.btn\);/.test(APP) &&
  /relPhoneBtn\.hidden = !phoneN; relPhoneBtn\.textContent = L9\(REL_PHONE_TXT\.btn\);/.test(APP), null);
report("C3) the press is confirmed first — it signs another device out — and posts the typed route with the slot the student pressed, not a hard-coded one",
  /if \(!confirm\(L9\(TX\.q\)\)\) return;/.test(APP) &&
  /var slot = kind === "phone" \? "phone" : "computer";/.test(APP) &&
  /var TX = slot === "phone" \? REL_PHONE_TXT : REL_TXT;/.test(APP) &&
  /accFetch\("\/v1\/devices\/release", \{method:"POST",body:JSON\.stringify\(\{slot_type:slot\}\)\}\)/.test(APP), null);
report("C4) the two refusals a student can actually hit are read from the server and answered in words, from whichever pack is in play: the cooldown names the date, an empty slot says so",
  /if \(r\.status === 429 \|\| code === "release_cooldown"\)\{/.test(APP) &&
  /L9\(TX\.wait\)\.replace\("\{D\}", when \? accFmtDate\(when\) : "\\u2014"\)/.test(APP) &&
  /if \(r\.status === 409 \|\| code === "slot_not_registered"\)\{/.test(APP), null);
report("C5) a registration refused because another machine holds the slot now names the control instead of ending the conversation",
  /if \(\/computer_slot_occupied\|panel_slot_occupied\/\.test\(rc\)\)\{\n\s*accSetInline\("unifiedStatus", L9\(REL_TXT\.taken\), "err"\); return;/.test(APP), null);

/* Executed, not matched: the copy object is lifted out of the page and evaluated, so a
   missing language is a failure here rather than a Burmese sentence on a Thai student's
   screen. */
function liftPack(name) {
  const start = APP.indexOf("var " + name + " = {");
  if (start < 0) return { pack: null, err: "not found" };
  const end = APP.indexOf("\n};", start);
  try { return { pack: new Function("return " + APP.slice(start + ("var " + name + " = ").length, end + 2))(), err: "" }; }
  catch (e) { return { pack: null, err: String(e && e.message) }; }
}
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const relKeys = ["btn", "q", "busy", "ok", "wait", "none", "taken"];
const PACKS = { REL_TXT: liftPack("REL_TXT"), REL_PHONE_TXT: liftPack("REL_PHONE_TXT") };
const REL = PACKS.REL_TXT.pack;
const relMissing = [];
Object.keys(PACKS).forEach(name => {
  const p = PACKS[name].pack;
  if (!p) { relMissing.push(name + ": " + PACKS[name].err); return; }
  relKeys.forEach(k => LANGS.forEach(l => {
    const v = p[k] && p[k][l];
    if (typeof v !== "string" || !v.trim()) relMissing.push(name + "." + k + "." + l);
  }));
});
report("C6) every self-release line exists in all nine languages, in BOTH packs (2 x " + relKeys.length +
  " keys x " + LANGS.length + ")",
  !!PACKS.REL_TXT.pack && !!PACKS.REL_PHONE_TXT.pack && relMissing.length === 0, { relMissing });
const noPlaceholder = [];
Object.keys(PACKS).forEach(name => {
  const p = PACKS[name].pack;
  if (p) LANGS.forEach(l => { if (!String(p.wait[l]).includes("{D}")) noPlaceholder.push(name + "." + l); });
});
report("C7) the cooldown line carries its {D} placeholder in every language of both packs, so no pack silently drops the date",
  !!PACKS.REL_PHONE_TXT.pack && noPlaceholder.length === 0, noPlaceholder);
/* The two packs must not be the same object with a word swapped at runtime and
   must not be identical text: a student reads the sentence, not the noun. And
   a phone never opens Photoshop, so the Photoshop clause the Computer pack
   carries must be gone from every line of the Phone one. */
const phonePack = PACKS.REL_PHONE_TXT.pack;
const sameText = phonePack && REL && relKeys.filter(k => LANGS.some(l => phonePack[k][l] === REL[k][l]));
const photoshopLines = phonePack ? relKeys.flatMap(k => LANGS
  .filter(l => /Photoshop/.test(phonePack[k][l])).map(l => k + "." + l)) : ["no pack"];
report("C7b) the Phone pack is its own nine languages — no line is the Computer's, and none of them sends a phone to Photoshop",
  !!phonePack && sameText.length === 0 && photoshopLines.length === 0,
  { sameText, photoshopLines });
/* The device list badged every other machine with an English string in a nine-language app.
   "Admin reset only" survives exactly once — as the English member of the new key. */
const badgeLiterals = (APP.match(/"Admin reset only"/g) || []).length;
report("C8) the device list's badge is translated — dev_admin_only in all nine languages, and the hardcoded English is gone from the renderer",
  !/textContent = "Admin reset only"/.test(APP) && badgeLiterals === 1 &&
  /locked\.textContent = t\("dev_admin_only"\);/.test(APP) &&
  LANGS.every(l => new RegExp("dev_admin_only:\\{[^}]*\\b" + l + ":\"").test(APP)), { badgeLiterals });
report("C9) the card no longer tells students they cannot do this — for either slot",
  !/Students cannot reset a registered slot/.test(APP) &&
  !/The Phone slot is still reset by an HNK administrator/.test(APP) &&
  /You can release your own Computer slot and your own Phone slot once every 7 days each/.test(APP), null);
/* phone_slot_occupied is the refusal that had nowhere to go: the server has
   always been able to say it and, until 6.47.0, the app had no control to name
   in reply. It is answered from the Phone pack, and separately from the
   computer/panel pair so the student is not sent to the wrong button. */
report("C10) a Phone registration refused because another phone holds the seat now names the Phone control",
  /if \(\/phone_slot_occupied\/\.test\(rc\)\)\{\n\s*accSetInline\("unifiedStatus", L9\(REL_PHONE_TXT\.taken\), "err"\); return;/.test(APP), null);

/* ---- D) the panel ---- */
report("D) the panel's two slot refusals send the student to the control, not to the teacher — and no longer name Reset Computer",
  /panel_slot_occupied: "[^"]*hnkaistudio\.com[^"]*Account[^"]*"/.test(PANEL) &&
  /computer_slot_occupied: "[^"]*hnkaistudio\.com[^"]*Account[^"]*"/.test(PANEL) &&
  !/(panel|computer)_slot_occupied: "[^"]*Reset Computer/.test(PANEL), null);

/* ---- E) CI ---- */
report("E) CI runs this test", CI.includes("node test/verify_device_self_release.js"), null);

console.log(failures ? "\nFAIL (" + failures + ")"
  : "\nPASS — a student releases their own Computer slot and their own Phone slot: policy executed, only that slot's sessions end, recorded, two packs of nine languages");
process.exit(failures ? 1 : 0);
