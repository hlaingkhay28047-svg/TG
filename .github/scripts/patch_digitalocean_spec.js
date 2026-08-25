#!/usr/bin/env node
"use strict";

/* Patch only hnk-api's readiness/liveness paths in a DOWNLOADED live spec.
 *
 * App Platform requires a full-spec update, and encrypted values from the live
 * spec must be submitted unchanged. Refusing malformed ingress, plaintext or
 * missing JWT secrets, and source drift is safer than replacing a working app
 * with a partial `doctl apps spec get` response. */
const assert = require("assert");
const fs = require("fs");

const [inputPath, outputPath, appName, serviceName, staticSiteName, repo, branch] = process.argv.slice(2);
if (![inputPath, outputPath, appName, serviceName, staticSiteName, repo, branch].every(Boolean)) {
  console.error("usage: patch_digitalocean_spec.js INPUT OUTPUT APP SERVICE STATIC_SITE REPO BRANCH");
  process.exit(2);
}

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serviceNamed(spec, name) {
  return spec.services.filter(service => service && service.name === name);
}

try {
  const spec = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!isObject(spec)) fail("downloaded app spec is not a JSON object");
  if (spec.name !== appName) fail("downloaded app spec names the wrong app");
  if (!Array.isArray(spec.services)) fail("downloaded app spec has no services array");

  const matches = serviceNamed(spec, serviceName);
  if (matches.length !== 1) fail(`expected exactly one ${serviceName} service; found ${matches.length}`);
  const service = matches[0];
  if (!isObject(service.github) || service.github.repo !== repo ||
      service.github.branch !== branch || service.github.deploy_on_push !== true) {
    fail("API source or deploy-on-push binding does not match the release lane");
  }
  const sites = Array.isArray(spec.static_sites) ? spec.static_sites : [];
  const releaseSites = sites.filter(site => site && site.name === staticSiteName &&
      isObject(site.github) && site.github.repo === repo &&
      site.github.branch === branch && site.github.deploy_on_push === true);
  if (releaseSites.length !== 1) {
    fail("the exact static site source does not match the release lane");
  }

  /* doctl issue #1782 documents a spec-get response with an empty ingress
     authority. Resubmitting that full spec can erase working routes. Absence is
     allowed for older route-based specs; a present-but-empty ingress is not. */
  if (Object.prototype.hasOwnProperty.call(spec, "ingress")) {
    if (!isObject(spec.ingress) || Object.keys(spec.ingress).length === 0 ||
        !Array.isArray(spec.ingress.rules) || spec.ingress.rules.length === 0) {
      fail("downloaded app spec contains malformed or empty ingress");
    }
    for (const rule of spec.ingress.rules) {
      const match = rule && rule.match;
      if (isObject(match) && Object.prototype.hasOwnProperty.call(match, "authority")) {
        if (!isObject(match.authority) || Object.keys(match.authority).length === 0) {
          fail("downloaded app spec contains an empty ingress rule authority");
        }
      }
    }
  }

  /* A full App Platform spec can carry secrets on more than HTTP components.
     Validate every component family that supports envs before resubmitting the
     whole document; silently ignoring a worker/job/function would turn a
     redacted or plaintext value there into an unsafe full-spec update. */
  const componentGroups = ["services", "static_sites", "workers", "jobs", "functions"];
  const components = [];
  for (const key of componentGroups) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
    if (!Array.isArray(spec[key])) fail(`downloaded app spec has malformed ${key}`);
    components.push(...spec[key]);
  }
  const envGroups = [];
  if (Object.prototype.hasOwnProperty.call(spec, "envs")) {
    if (!Array.isArray(spec.envs)) fail("downloaded app spec has malformed top-level envs");
    envGroups.push(spec.envs);
  }
  for (const component of components) {
    if (!component || !Object.prototype.hasOwnProperty.call(component, "envs")) continue;
    if (!Array.isArray(component.envs)) fail("downloaded app component has malformed envs");
    envGroups.push(component.envs);
  }
  for (const envs of envGroups) {
    for (const env of envs) {
      if (!env || env.type !== "SECRET") continue;
      if (typeof env.value !== "string" || !/^EV\[[^\]]+\]$/.test(env.value)) {
        fail(`secret ${env.key || "<unnamed>"} is not an encrypted live-spec value`);
      }
    }
  }
  /* App Platform makes app-level envs available to every component. Accept one
     encrypted signing key at either level, but never duplicates or a fallback
     plaintext value. The bootstrap prefers an existing app-level key so a
     staging repair does not rotate established sessions. */
  const jwt = [
    ...(Array.isArray(spec.envs) ? spec.envs : []),
    ...(Array.isArray(service.envs) ? service.envs : []),
  ].filter(env => env && env.key === "JWT_SECRET");
  if (jwt.length !== 1 || jwt[0].type !== "SECRET" ||
      typeof jwt[0].value !== "string" || !/^EV\[[^\]]+\]$/.test(jwt[0].value)) {
    fail("JWT_SECRET is missing or is not preserved as an encrypted live-spec value");
  }

  const patched = clone(spec);
  const patchedService = serviceNamed(patched, serviceName)[0];
  patchedService.health_check = Object.assign({}, patchedService.health_check,
    { http_path: "/ready" });
  patchedService.liveness_health_check = Object.assign({}, patchedService.liveness_health_check,
    { http_path: "/live" });

  /* Prove the transform did not touch secrets, ingress, routes, databases, or
     any other live setting before allowing the full spec to be written. */
  const expected = clone(spec);
  const expectedService = serviceNamed(expected, serviceName)[0];
  expectedService.health_check = Object.assign({}, expectedService.health_check,
    { http_path: "/ready" });
  expectedService.liveness_health_check = Object.assign({}, expectedService.liveness_health_check,
    { http_path: "/live" });
  try {
    assert.deepStrictEqual(patched, expected);
  } catch (_) {
    fail("probe transform changed fields outside the two approved HTTP paths");
  }

  fs.writeFileSync(outputPath, JSON.stringify(patched, null, 2) + "\n", { mode: 0o600 });
  console.log(`Validated ${appName} (${serviceName} + ${staticSiteName}); patched only readiness and liveness paths.`);
} catch (err) {
  console.error("Refusing to update DigitalOcean app spec:", err && err.message ? err.message : err);
  process.exit(1);
}
