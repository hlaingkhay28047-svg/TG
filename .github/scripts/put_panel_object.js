#!/usr/bin/env node
/* Mirror one verified panel artifact into the private Space, and prove it.
 *
 * The object key is content-addressed — ccx/<sha256>/<artifact-file> — so a
 * key can never point at different bytes across releases. The artifact is
 * read from disk, its digest re-measured against the declared expectation,
 * uploaded through the tested Spaces client, downloaded back, and measured
 * again: only a byte-identical round trip prints the object key for the
 * caller to record in the release row. Credentials arrive only through the
 * SPACES_* environment and are never printed.
 *
 * Environment: SPACES_REGION/BUCKET/KEY_ID/SECRET (a readwrite credential),
 *              ARTIFACT_PATH, EXPECTED_SHA, EXPECTED_BYTES
 * Stdout on success: the object key, alone on the final line.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const spaces = require(path.join(__dirname, "..", "..", "server", "lib", "spaces.js"));

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

const artifactPath = String(process.env.ARTIFACT_PATH || "");
const expectedSha = String(process.env.EXPECTED_SHA || "").toLowerCase();
const expectedBytes = Number(process.env.EXPECTED_BYTES || 0);

if (!spaces.spacesConfigured()) fail("SPACES_* is not configured for the upload");
if (!artifactPath || !fs.existsSync(artifactPath)) fail("ARTIFACT_PATH does not exist");
if (!/^[0-9a-f]{64}$/.test(expectedSha)) fail("EXPECTED_SHA is not 64-hex");
if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1) fail("EXPECTED_BYTES is not a positive integer");

const data = fs.readFileSync(artifactPath);
const measured = crypto.createHash("sha256").update(data).digest("hex");
if (measured !== expectedSha || data.length !== expectedBytes) {
  fail("the artifact on disk does not equal the declared SHA-256/size — refusing to upload");
}

const objectKey = spaces.assertKey(`ccx/${expectedSha}/${path.basename(artifactPath)}`);

(async () => {
  const existing = await spaces.headObject(objectKey);
  if (!existing.exists) {
    await spaces.putObject(objectKey, data, "application/octet-stream");
  }
  const back = await spaces.getObject(objectKey, { maxBytes: expectedBytes });
  const backSha = crypto.createHash("sha256").update(back).digest("hex");
  if (back.length !== expectedBytes || backSha !== expectedSha) {
    fail("the stored object failed round-trip SHA-256/size verification");
  }
  console.error(existing.exists
    ? `Object already present and verified round-trip (${expectedBytes} bytes).`
    : `Object stored and verified round-trip (${expectedBytes} bytes).`);
  console.log(objectKey);
})().catch(error => fail(error.message));
