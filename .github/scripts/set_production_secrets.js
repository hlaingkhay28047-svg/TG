#!/usr/bin/env node
/* Write the six security secrets into a live App Platform spec.
 *
 * WHY THIS EXISTS. Setting them by hand truncated their names. The console
 * renders a key in a fixed-width box, so MFA_ENCRYPTION_KEY and a key that
 * really is called MFA_ENCRYPTION_K look identical there — and the service
 * reported all six missing while the console showed all six present and
 * encrypted. A name written once by a program cannot be truncated by the width
 * of an input box.
 *
 * THE VALUES ARE BORN HERE AND GO NOWHERE ELSE. Each is 64 random bytes from
 * the system CSPRNG, generated in the runner, written only into the spec file
 * handed to doctl, and never printed, returned or logged. Nothing is read from
 * the repository, so no secret can be committed by accident. The summary names
 * keys and reports byte lengths; it never shows a value.
 *
 * ROTATION IS THE POINT, not a side effect. Secrets that may have been stored
 * under truncated names have been half-configured for hours; replacing all six
 * is the only state that can be reasoned about afterwards. Rotating JWT_SECRET
 * signs out every existing session, which is the correct treatment of a
 * credential whose disposition is uncertain.
 *
 * Usage: node set_production_secrets.js <live-spec.json> <out.json> <service>
 */
"use strict";

const fs = require("fs");
const crypto = require("crypto");

const REQUIRED = Object.freeze([
  "JWT_SECRET", "MFA_ENCRYPTION_KEY", "DEVICE_ID_HASH_SECRET",
  "DEVICE_PAIRING_SECRET", "CCX_DOWNLOAD_SECRET", "PANEL_LEASE_SECRET",
]);

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

const [, , livePath, outPath, serviceName] = process.argv;
if (!livePath || !outPath || !serviceName) {
  fail("usage: set_production_secrets.js <live-spec.json> <out.json> <service>");
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

/* 64 bytes each, and required to be distinct: entitlements.js rejects the set
   when any two share a digest, so a collision here would be indistinguishable
   from the misconfiguration this exists to fix. base64url keeps the value free
   of characters a shell or a .env parser would treat specially. */
const values = new Map();
const seen = new Set();
while (values.size < REQUIRED.length) {
  const value = crypto.randomBytes(64).toString("base64url");
  if (seen.has(value)) continue;
  seen.add(value);
  values.set(REQUIRED[values.size], value);
}

/* Drop any key that differs from a required one only by truncation. A stale
   MFA_ENCRYPTION_K sitting beside the real MFA_ENCRYPTION_KEY is exactly the
   confusion that started this, and leaving it would preserve it. Eight
   characters is the shortest prefix that cannot collide with an unrelated
   name in this spec. */
const truncated = service.envs.filter(env =>
  env && typeof env.key === "string" &&
  !REQUIRED.includes(env.key) &&
  env.key.length >= 8 &&
  REQUIRED.some(name => name.startsWith(env.key)));
service.envs = service.envs.filter(env => !truncated.includes(env));

/* Replace in place where the key already exists so its position is kept. */
for (const name of REQUIRED) {
  const entry = { key: name, value: values.get(name), scope: "RUN_TIME", type: "SECRET" };
  const at = service.envs.findIndex(env => env && env.key === name);
  if (at === -1) service.envs.push(entry);
  else service.envs[at] = entry;
}

/* Prove the spec about to be submitted says what it is meant to say, BEFORE it
   is submitted. A silent no-op here would be reported to the owner as a fix. */
for (const name of REQUIRED) {
  const found = service.envs.filter(env => env && env.key === name);
  if (found.length !== 1) fail(`${name} appears ${found.length} times after patching`);
  if (found[0].type !== "SECRET") fail(`${name} is not typed SECRET`);
  if (found[0].scope !== "RUN_TIME") fail(`${name} is not scoped RUN_TIME`);
  if (Buffer.byteLength(String(found[0].value), "utf8") < 32) fail(`${name} is under 32 bytes`);
}

fs.writeFileSync(outPath, JSON.stringify(spec), { mode: 0o600 });

console.log(`Wrote ${REQUIRED.length} security secrets to ${serviceName}:`);
for (const name of REQUIRED) {
  console.log(`  ${name}  (${Buffer.byteLength(values.get(name), "utf8")} bytes)`);
}
if (truncated.length) {
  console.log("Removed keys that were truncated copies of a required name:");
  for (const env of truncated) console.log(`  ${env.key}`);
}
console.log(`Other environment variables left untouched: ${service.envs.length - REQUIRED.length}`);
