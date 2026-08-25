#!/usr/bin/env node
"use strict";

/* Add or remove the test-only API + database harness used to validate one release
 * on the otherwise static-only staging app. The input is always a downloaded
 * live spec so domains, encrypted secrets, alerts and site settings survive.
 * Cleanup is marker-bound to the same workflow run that created the resources. */
const crypto = require("crypto");
const fs = require("fs");

const [mode, inputPath, outputPath, appName, serviceName, databaseName,
  staticSiteName, repo, branch, origin, marker] = process.argv.slice(2);
const databaseMode = process.env.TEMP_STAGING_DATABASE_MODE || "managed";

if (![mode, inputPath, outputPath, appName, serviceName, databaseName,
  staticSiteName, repo, branch, origin, marker].every(Boolean) ||
  !["bootstrap", "cleanup"].includes(mode)) {
  console.error("usage: temporary_staging_spec.js bootstrap|cleanup INPUT OUTPUT APP SERVICE DATABASE STATIC_SITE REPO BRANCH ORIGIN MARKER");
  process.exit(2);
}
if (!["managed", "contained"].includes(databaseMode)) {
  console.error("TEMP_STAGING_DATABASE_MODE must be managed or contained");
  process.exit(2);
}

const fail = message => { throw new Error(message); };
const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const arrayAt = (spec, key) => {
  if (!Object.prototype.hasOwnProperty.call(spec, key)) return [];
  if (!Array.isArray(spec[key])) fail(`downloaded app spec has malformed ${key}`);
  return spec[key];
};

function validateSecrets(spec, allowBootstrapSecrets) {
  const groups = [];
  if (Object.prototype.hasOwnProperty.call(spec, "envs")) groups.push(arrayAt(spec, "envs"));
  for (const key of ["services", "static_sites", "workers", "jobs", "functions"]) {
    for (const component of arrayAt(spec, key)) {
      if (component && Object.prototype.hasOwnProperty.call(component, "envs")) {
        if (!Array.isArray(component.envs)) fail(`downloaded ${key} component has malformed envs`);
        groups.push(component.envs);
      }
    }
  }
  for (const envs of groups) {
    for (const env of envs) {
      if (!env || env.type !== "SECRET") continue;
      const isBootstrapSecret = allowBootstrapSecrets &&
        ["JWT_SECRET", "HNK_CONTAINED_PG_PASSWORD"].includes(env.key) &&
        typeof env.value === "string" && /^[a-f0-9]{64}$/.test(env.value);
      if (!isBootstrapSecret &&
          (typeof env.value !== "string" || !/^EV\[[^\]]+\]$/.test(env.value))) {
        fail(`secret ${env.key || "<unnamed>"} is not an encrypted live-spec value`);
      }
    }
  }
}

function validateCommon(spec) {
  if (!isObject(spec)) fail("downloaded app spec is not a JSON object");
  if (spec.name !== appName) fail("downloaded app spec names the wrong app");
  for (const name of [serviceName, databaseName, staticSiteName]) {
    if (!/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(name)) fail("temporary component name is invalid");
  }
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) fail("staging origin is not a bare HTTPS origin");
  if (!/^[A-Za-z0-9._-]{6,128}$/.test(marker)) fail("temporary resource marker is malformed");

  const sites = arrayAt(spec, "static_sites");
  const releaseSites = sites.filter(site => site && site.name === staticSiteName &&
    isObject(site.github) && site.github.repo === repo && site.github.branch === branch &&
    site.github.deploy_on_push === true);
  if (releaseSites.length !== 1) fail("the exact staging static site source is not present once");

  if (Object.prototype.hasOwnProperty.call(spec, "ingress")) {
    if (!isObject(spec.ingress) || !Array.isArray(spec.ingress.rules) ||
        spec.ingress.rules.length === 0) {
      fail("downloaded app spec contains malformed or empty ingress");
    }
    for (const rule of spec.ingress.rules) {
      const authority = rule && rule.match && rule.match.authority;
      if (authority !== undefined && (!isObject(authority) || Object.keys(authority).length === 0)) {
        fail("downloaded app spec contains an empty ingress rule authority");
      }
    }
  }
}

function componentNames(spec) {
  const names = [];
  for (const key of ["services", "static_sites", "workers", "jobs", "functions", "databases"]) {
    for (const component of arrayAt(spec, key)) {
      if (component && component.name) names.push(component.name);
    }
  }
  return names;
}

function markerValue(service) {
  const matches = (Array.isArray(service && service.envs) ? service.envs : [])
    .filter(env => env && env.key === "HNK_EPHEMERAL_STAGING_RUN");
  return matches.length === 1 ? matches[0].value : null;
}

function apiIngressRule() {
  return {
    match: { path: { prefix: "/api" } },
    component: { name: serviceName },
  };
}

function isApiIngressRule(rule) {
  return !!rule && isObject(rule.component) && rule.component.name === serviceName &&
    isObject(rule.match) && isObject(rule.match.path) && rule.match.path.prefix === "/api";
}

function targetsTemporaryService(rule) {
  return !!rule && isObject(rule.component) && rule.component.name === serviceName;
}

function targetsApiPrefix(rule) {
  return !!rule && isObject(rule.match) && isObject(rule.match.path) &&
    rule.match.path.prefix === "/api";
}

function makeService(jwtSecret, containedPgPassword) {
  const service = {
    name: serviceName,
    github: { repo, branch, deploy_on_push: true },
    source_dir: "/server",
    http_port: 8080,
    instance_count: 1,
    instance_size_slug: "apps-s-1vcpu-0.5gb",
    health_check: {
      http_path: "/ready",
      initial_delay_seconds: 60,
      period_seconds: 10,
      timeout_seconds: 5,
      failure_threshold: 30,
      success_threshold: 1,
    },
    liveness_health_check: {
      http_path: "/live",
      initial_delay_seconds: 90,
      period_seconds: 10,
      timeout_seconds: 5,
      failure_threshold: 6,
      success_threshold: 1,
    },
    envs: [
      { key: "JWT_SECRET", scope: "RUN_TIME", type: "SECRET", value: jwtSecret },
      { key: "ALLOWED_ORIGIN", scope: "RUN_TIME", value: origin },
      { key: "APP_ORIGIN", scope: "RUN_TIME", value: origin },
      { key: "HNK_EPHEMERAL_STAGING_RUN", scope: "RUN_TIME", value: marker },
    ],
  };
  if (databaseMode === "contained") {
    service.dockerfile_path = "server/Dockerfile.staging-contained";
    service.envs.push({
      key: "HNK_CONTAINED_PG_PASSWORD",
      scope: "RUN_TIME",
      type: "SECRET",
      value: containedPgPassword,
    });
  } else {
    service.environment_slug = "node-js";
    service.run_command = "node index.js";
    service.envs.unshift({
      key: "DATABASE_URL",
      scope: "RUN_TIME",
      value: `\${${databaseName}.DATABASE_URL}`,
    });
  }
  return service;
}

try {
  const spec = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  validateCommon(spec);

  if (mode === "bootstrap") {
    validateSecrets(spec, false);
    if (arrayAt(spec, "services").length !== 0) fail("staging already has a service; refusing temporary bootstrap");
    if (arrayAt(spec, "databases").length !== 0) fail("staging already has a database; refusing temporary bootstrap");
    const names = componentNames(spec);
    if (names.includes(serviceName) || names.includes(databaseName)) {
      fail("a staging component already uses a temporary resource name");
    }

    const suppliedSecret = process.env.TEMP_STAGING_JWT_SECRET;
    const jwtSecret = suppliedSecret === undefined
      ? crypto.randomBytes(32).toString("hex")
      : suppliedSecret;
    if (!/^[a-f0-9]{64}$/.test(jwtSecret)) fail("temporary JWT secret was not generated safely");
    let containedPgPassword;
    if (databaseMode === "contained") {
      const suppliedPgPassword = process.env.TEMP_STAGING_PG_PASSWORD;
      containedPgPassword = suppliedPgPassword === undefined
        ? crypto.randomBytes(32).toString("hex")
        : suppliedPgPassword;
      if (!/^[a-f0-9]{64}$/.test(containedPgPassword)) {
        fail("temporary contained PostgreSQL password was not generated safely");
      }
    }

    const patched = clone(spec);
    const service = makeService(jwtSecret, containedPgPassword);
    if (Object.prototype.hasOwnProperty.call(patched, "ingress")) {
      if (patched.ingress.rules.some(targetsApiPrefix) ||
          patched.ingress.rules.some(targetsTemporaryService)) {
        fail("staging ingress already contains an API route or temporary service target");
      }
      patched.ingress.rules.unshift(apiIngressRule());
    } else {
      const site = patched.static_sites.find(candidate => candidate.name === staticSiteName);
      const hasRoot = Array.isArray(site.routes) && site.routes.some(route => route && route.path === "/");
      if (!hasRoot) fail("legacy staging spec has no static-site root route");
      service.routes = [{ path: "/api" }];
    }
    patched.services = [service];
    patched.databases = databaseMode === "managed"
      ? [{ name: databaseName, engine: "PG", production: false, version: "16" }]
      : [];
    validateSecrets(patched, true);
    fs.writeFileSync(outputPath, JSON.stringify(patched, null, 2) + "\n", { mode: 0o600 });
    console.log(databaseMode === "managed"
      ? "Prepared marker-bound temporary staging API and development database."
      : "Prepared marker-bound temporary staging API with contained PostgreSQL 16.");
  } else {
    validateSecrets(spec, false);
    const services = arrayAt(spec, "services");
    const databases = arrayAt(spec, "databases");
    const namedServices = services.filter(service => service && service.name === serviceName);
    if (namedServices.length > 1) fail("staging service inventory contains a duplicate temporary service");
    if (namedServices.length === 1 && markerValue(namedServices[0]) !== marker) {
      fail("temporary service is not owned by this workflow run");
    }

    const namedDatabases = databases.filter(database => database && database.name === databaseName);
    if (namedDatabases.length > 1) fail("staging database inventory contains a duplicate temporary database");
    if (databaseMode === "contained" && namedDatabases.length !== 0) {
      fail("contained mode does not own a managed staging database");
    }
    if (namedDatabases.length === 1 &&
        (namedDatabases[0].engine !== "PG" || namedDatabases[0].production === true)) {
      fail("temporary database is not the expected non-production PostgreSQL database");
    }

    let apiRules = [];
    if (Object.prototype.hasOwnProperty.call(spec, "ingress")) {
      const rules = spec.ingress.rules;
      apiRules = rules.filter(isApiIngressRule);
      if (apiRules.length > 1 ||
          rules.some(rule => targetsTemporaryService(rule) && !isApiIngressRule(rule)) ||
          rules.some(rule => targetsApiPrefix(rule) && !isApiIngressRule(rule))) {
        fail("staging ingress contains an ambiguous or unowned API rule");
      }
    }

    const hasOwnedPart = namedServices.length === 1 || namedDatabases.length === 1 ||
      apiRules.length === 1;
    if (!hasOwnedPart) {
      fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2) + "\n", { mode: 0o600 });
      console.log("Temporary staging resources are already absent.");
      process.exit(0);
    }

    const cleaned = clone(spec);
    cleaned.services = services.filter(service => !service || service.name !== serviceName).map(clone);
    cleaned.databases = databases.filter(database => !database || database.name !== databaseName).map(clone);
    if (Object.prototype.hasOwnProperty.call(cleaned, "ingress")) {
      cleaned.ingress.rules = cleaned.ingress.rules.filter(rule => !isApiIngressRule(rule));
      if (cleaned.ingress.rules.length === 0) fail("cleanup would remove every staging ingress rule");
    }
    validateCommon(cleaned);
    validateSecrets(cleaned, false);
    fs.writeFileSync(outputPath, JSON.stringify(cleaned, null, 2) + "\n", { mode: 0o600 });
    console.log("Removed only this run's marker-bound temporary API, database and /api route.");
  }
} catch (err) {
  console.error("Refusing temporary staging spec change:", err && err.message ? err.message : err);
  process.exit(1);
}
