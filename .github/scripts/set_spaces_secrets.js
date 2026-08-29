#!/usr/bin/env node
/* Write the four Spaces settings into a live App Platform spec.
 *
 * The runtime read credential is born in the setup lane (from the
 * DigitalOcean API), arrives ONLY through the environment, is written
 * straight into the spec handed to doctl, and is never printed. The summary
 * names keys and byte lengths, nothing more — the same posture as
 * set_smtp_secrets.js, pinned the same way.
 *
 * Values through the environment:
 *   SPACES_REGION_VALUE   e.g. sgp1
 *   SPACES_BUCKET_VALUE   the private bucket name
 *   SPACES_KEY_ID_VALUE   the runtime read access key
 *   SPACES_SECRET_VALUE   its secret
 *
 * Usage: node set_spaces_secrets.js <live-spec.json> <out.json> <service>
 */
"use strict";

const fs = require("fs");

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

const [, , livePath, outPath, serviceName] = process.argv;
if (!livePath || !outPath || !serviceName) {
  fail("usage: set_spaces_secrets.js <live-spec.json> <out.json> <service>");
}

const region = String(process.env.SPACES_REGION_VALUE || "").trim();
const bucket = String(process.env.SPACES_BUCKET_VALUE || "").trim();
const keyId = String(process.env.SPACES_KEY_ID_VALUE || "").trim();
const secret = String(process.env.SPACES_SECRET_VALUE || "").trim();

if (!region) fail("SPACES_REGION_VALUE is empty");
if (!bucket) fail("SPACES_BUCKET_VALUE is empty");
if (!keyId) fail("SPACES_KEY_ID_VALUE is empty — the setup lane must create the runtime read key first");
if (!secret) fail("SPACES_SECRET_VALUE is empty — the setup lane must create the runtime read key first");
if (!/^[a-z0-9]{2,24}$/.test(region)) fail("SPACES_REGION_VALUE is not a region slug");
if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket)) fail("SPACES_BUCKET_VALUE is not a bucket name");
if (/\s/.test(keyId) || keyId.length < 8) fail("SPACES_KEY_ID_VALUE does not look like an access key");
if (/\s/.test(secret) || secret.length < 20) fail("SPACES_SECRET_VALUE does not look like a secret key");

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

/* Region and bucket are plain configuration the owner may read in their own
 * console; the credential pair is SECRET. */
const ENTRIES = [
  { key: "SPACES_REGION", value: region, scope: "RUN_TIME", type: "GENERAL" },
  { key: "SPACES_BUCKET", value: bucket, scope: "RUN_TIME", type: "GENERAL" },
  { key: "SPACES_KEY_ID", value: keyId, scope: "RUN_TIME", type: "SECRET" },
  { key: "SPACES_SECRET", value: secret, scope: "RUN_TIME", type: "SECRET" },
];
const KEYS = ENTRIES.map(e => e.key);

/* Drop any key that differs from ours only by truncation — the console
 * failure mode the six-secrets lane exists because of. */
const truncated = service.envs.filter(env =>
  env && typeof env.key === "string" &&
  !KEYS.includes(env.key) &&
  env.key.length >= 8 &&
  KEYS.some(name => name.startsWith(env.key)));
service.envs = service.envs.filter(env => !truncated.includes(env));

for (const entry of ENTRIES) {
  const at = service.envs.findIndex(env => env && env.key === entry.key);
  if (at === -1) service.envs.push({ ...entry });
  else service.envs[at] = { ...entry };
}

for (const entry of ENTRIES) {
  const found = service.envs.filter(env => env && env.key === entry.key);
  if (found.length !== 1) fail(`${entry.key} appears ${found.length} times after patching`);
  if (found[0].type !== entry.type) fail(`${entry.key} is not typed ${entry.type}`);
  if (found[0].scope !== "RUN_TIME") fail(`${entry.key} is not scoped RUN_TIME`);
}

fs.writeFileSync(outPath, JSON.stringify(spec), { mode: 0o600 });

console.log(`Wrote ${ENTRIES.length} Spaces settings to ${serviceName}:`);
for (const entry of ENTRIES) {
  console.log(`  ${entry.key}  (${entry.type}, ${Buffer.byteLength(entry.value, "utf8")} bytes)`);
}
if (truncated.length) {
  console.log("Removed keys that were truncated copies of a Spaces name:");
  for (const env of truncated) console.log(`  ${env.key}`);
}
console.log(`Other environment variables left untouched: ${service.envs.length - ENTRIES.length}`);
