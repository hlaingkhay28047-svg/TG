#!/usr/bin/env node
/* Write BOOTSTRAP_ADMIN_EMAIL into a live App Platform spec.
 *
 * WHY THIS EXISTS. The first administrator cannot be created through the
 * product — schema.sql defaults profiles.is_admin to false and its trigger
 * forces it back to false on any insert carrying a JWT — so server/lib/
 * bootstrap-admin.js grants it on boot from the value of this variable. Setting
 * it means typing a twenty-two character key into a console input box that
 * shows about half of it, which is exactly how six security secrets were
 * silently truncated and five production deploys failed. A name written once
 * by a program cannot be truncated by the width of a box.
 *
 * THE ADDRESS COMES FROM THE DISPATCH, NOT THE REPOSITORY. It is a person's
 * email and this repository is public, so it is never committed, and this
 * script prints only a masked form of it — the same masking the service itself
 * applies before anything reaches a log.
 *
 * IT TOUCHES ONE VARIABLE. Every other environment variable, and every other
 * component, is left exactly where it is. The six SECRET entries in particular
 * are never read, rewritten or reordered by this script.
 *
 * IT IS NOT A SECRET, deliberately. An email address is not a credential, and
 * typing it SECRET would only make it unreadable to the owner checking their
 * own configuration while protecting nothing. It is RUN_TIME, like every other
 * variable the service reads at boot.
 *
 * Usage: node set_bootstrap_admin.js <live-spec.json> <out.json> <service> <email>
 */
"use strict";

const fs = require("fs");

const KEY = "BOOTSTRAP_ADMIN_EMAIL";
const MAX_EMAIL_LENGTH = 320;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

/* The same shape server/lib/bootstrap-admin.js prints, for the same reason:
   this output is a public GitHub Actions log. " [at] " rather than "@" keeps
   it out of reach of anything that redacts addresses, and out of reach of
   anything that harvests them. */
function maskEmail(value) {
  const email = String(value || "");
  const at = email.lastIndexOf("@");
  if (at < 1) return "<address withheld>";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = local.length <= 4
    ? local.slice(0, 1) + "***"
    : local.slice(0, 2) + "***" + local.slice(-2);
  return shown + " [at] " + domain;
}

const [, , livePath, outPath, serviceName, rawEmail] = process.argv;
if (!livePath || !outPath || !serviceName || !rawEmail) {
  fail("usage: set_bootstrap_admin.js <live-spec.json> <out.json> <service> <email>");
}

const email = String(rawEmail).trim();
if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
  /* Named without echoing it: a rejected value is still someone's address, and
     a malformed one is the likeliest to be a paste of something else. */
  fail("the address given is not a valid email address; nothing was written");
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(livePath, "utf8"));
} catch (err) {
  fail("could not read the downloaded spec: " + err.message);
}

if (!Array.isArray(spec.services)) fail("downloaded app spec has no services array");
const services = spec.services.filter(s => s && s.name === serviceName);
if (services.length !== 1) {
  fail(`expected exactly one ${serviceName} service, found ${services.length}`);
}
const service = services[0];
if (!Array.isArray(service.envs)) service.envs = [];

const before = service.envs.length;

/* Drop any key that differs from this one only by truncation, so a stale
   BOOTSTRAP_ADMIN_EM cannot sit beside the real name and preserve exactly the
   confusion this script exists to prevent.
 *
 * A PREFIX IS NOT ENOUGH. This deletes production configuration, so the rule
 * has to distinguish a truncation from an unrelated name that merely starts
 * the same way — a variable actually called BOOTSTRAP is not a truncated copy
 * of anything and losing it would be this script causing the class of outage
 * it exists to prevent. The truncations that started all this dropped two to
 * five characters (MFA_ENCRYPTION_K of MFA_ENCRYPTION_KEY, DEVICE_ID_HASH_S of
 * DEVICE_ID_HASH_SECRET), because a console input box renders a fixed width
 * and cuts the tail. Eight is comfortably past that and still nowhere near
 * short enough to catch a real name. */
const MAX_TRUNCATION = 8;
const truncated = service.envs.filter(env =>
  env && typeof env.key === "string" &&
  env.key !== KEY &&
  KEY.startsWith(env.key) &&
  KEY.length - env.key.length <= MAX_TRUNCATION);
service.envs = service.envs.filter(env => !truncated.includes(env));

/* Replace in place where it already exists so its position is kept. */
const entry = { key: KEY, value: email, scope: "RUN_TIME", type: "GENERAL" };
const at = service.envs.findIndex(env => env && env.key === KEY);
if (at === -1) service.envs.push(entry);
else service.envs[at] = entry;

/* Prove the spec about to be submitted says what it is meant to say, BEFORE it
   is submitted. A silent no-op here would be reported to the owner as a fix. */
const found = service.envs.filter(env => env && env.key === KEY);
if (found.length !== 1) fail(`${KEY} appears ${found.length} times after patching`);
if (found[0].scope !== "RUN_TIME") fail(`${KEY} is not scoped RUN_TIME`);
if (found[0].value !== email) fail(`${KEY} did not take the address given`);

/* Nothing else may have moved. The six SECRET entries live in this same array
   and a mistake here would be indistinguishable from the truncation incident
   this whole lane exists because of. */
const expected = before - truncated.length + (at === -1 ? 1 : 0);
if (service.envs.length !== expected) {
  fail(`env count is ${service.envs.length}, expected ${expected}`);
}

fs.writeFileSync(outPath, JSON.stringify(spec), { mode: 0o600 });

console.log(`Wrote ${KEY} to ${serviceName}: ${maskEmail(email)}`);
if (truncated.length) {
  console.log("Removed keys that were truncated copies of that name:");
  for (const env of truncated) console.log(`  ${env.key}`);
}
console.log(`Other environment variables left untouched: ${service.envs.length - 1}`);
