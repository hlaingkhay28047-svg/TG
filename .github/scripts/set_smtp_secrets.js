#!/usr/bin/env node
/* Write the four SMTP settings into a live App Platform spec.
 *
 * WHY THIS EXISTS. The signup-notice and password-reset mailer
 * (server/lib/email.js) is complete and waiting on four environment
 * variables. The repository is public, so the app password must never be a
 * workflow input, a commit, or a log line: the values arrive ONLY through
 * the environment (the workflow maps them from GitHub repository secrets),
 * are written straight into the spec file handed to doctl, and are never
 * printed. The summary names keys and byte lengths, nothing more.
 *
 * Gmail displays an app password in four spaced groups; the real credential
 * has no spaces, so spaces are stripped before length validation — pasting
 * it exactly as Google shows it works.
 *
 * Values through the environment:
 *   SMTP_USER_VALUE   the sending mailbox (looks like an email address)
 *   SMTP_PASS_VALUE   the app password (>= 16 chars once spaces are removed)
 *   SMTP_HOST_VALUE   optional, default smtp.gmail.com
 *   SMTP_PORT_VALUE   optional, default 465 (implicit TLS)
 *
 * Usage: node set_smtp_secrets.js <live-spec.json> <out.json> <service>
 */
"use strict";

const fs = require("fs");

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

const [, , livePath, outPath, serviceName] = process.argv;
if (!livePath || !outPath || !serviceName) {
  fail("usage: set_smtp_secrets.js <live-spec.json> <out.json> <service>");
}

const user = String(process.env.SMTP_USER_VALUE || "").trim();
const pass = String(process.env.SMTP_PASS_VALUE || "").replace(/ /g, "");
const host = String(process.env.SMTP_HOST_VALUE || "smtp.gmail.com").trim();
const port = String(process.env.SMTP_PORT_VALUE || "465").trim();

/* Refusals never echo a value: the Actions log of a public repository is
 * world-readable, and the mailbox address is the owner's to publish, not
 * this script's. */
if (!user) fail("SMTP_USER_VALUE is empty — add the SMTP_USER repository secret first");
if (!pass) fail("SMTP_PASS_VALUE is empty — add the SMTP_PASS repository secret first");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)) fail("SMTP_USER_VALUE does not look like an email address");
if (/\s/.test(pass)) fail("SMTP_PASS_VALUE still contains whitespace after normalization");
if (pass.length < 16) fail("SMTP_PASS_VALUE is shorter than an app password (16 characters)");
if (!/^[a-z0-9.-]+$/i.test(host) || !host.includes(".")) fail("SMTP_HOST_VALUE is not a hostname");
const portNumber = Number(port);
if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) fail("SMTP_PORT_VALUE is not a port");

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

/* The credential pair is SECRET; the host and port are plain configuration —
 * typing them SECRET would only hide them from the owner checking their own
 * settings. The mailbox address is SECRET deliberately: it is also the
 * signup-notice recipient's default sender identity and this repo's logs and
 * console screenshots are public. */
const ENTRIES = [
  { key: "SMTP_HOST", value: host, scope: "RUN_TIME", type: "GENERAL" },
  { key: "SMTP_PORT", value: port, scope: "RUN_TIME", type: "GENERAL" },
  { key: "SMTP_USER", value: user, scope: "RUN_TIME", type: "SECRET" },
  { key: "SMTP_PASS", value: pass, scope: "RUN_TIME", type: "SECRET" },
];
const KEYS = ENTRIES.map(e => e.key);

/* Drop any key that differs from ours only by truncation — the same console
 * failure mode the six-secrets lane exists because of. */
const truncated = service.envs.filter(env =>
  env && typeof env.key === "string" &&
  !KEYS.includes(env.key) &&
  env.key.length >= 8 &&
  KEYS.some(name => name.startsWith(env.key)));
service.envs = service.envs.filter(env => !truncated.includes(env));

/* Replace in place where the key already exists so its position is kept. */
for (const entry of ENTRIES) {
  const at = service.envs.findIndex(env => env && env.key === entry.key);
  if (at === -1) service.envs.push({ ...entry });
  else service.envs[at] = { ...entry };
}

/* Prove the spec about to be submitted says what it is meant to say. */
for (const entry of ENTRIES) {
  const found = service.envs.filter(env => env && env.key === entry.key);
  if (found.length !== 1) fail(`${entry.key} appears ${found.length} times after patching`);
  if (found[0].type !== entry.type) fail(`${entry.key} is not typed ${entry.type}`);
  if (found[0].scope !== "RUN_TIME") fail(`${entry.key} is not scoped RUN_TIME`);
}

/* The mailer refuses to send a signup notice without a recipient; that key is
 * someone else's to write, so only WARN when neither source of one exists. */
const hasRecipient = service.envs.some(env => env &&
  (env.key === "SIGNUP_NOTICE_EMAIL" || env.key === "BOOTSTRAP_ADMIN_EMAIL"));
if (!hasRecipient) {
  console.log("::warning::Neither SIGNUP_NOTICE_EMAIL nor BOOTSTRAP_ADMIN_EMAIL is set — signup notices have no recipient until one is.");
}

fs.writeFileSync(outPath, JSON.stringify(spec), { mode: 0o600 });

console.log(`Wrote ${ENTRIES.length} SMTP settings to ${serviceName}:`);
for (const entry of ENTRIES) {
  console.log(`  ${entry.key}  (${entry.type}, ${Buffer.byteLength(entry.value, "utf8")} bytes)`);
}
if (truncated.length) {
  console.log("Removed keys that were truncated copies of an SMTP name:");
  for (const env of truncated) console.log(`  ${env.key}`);
}
console.log(`Other environment variables left untouched: ${service.envs.length - ENTRIES.length}`);
