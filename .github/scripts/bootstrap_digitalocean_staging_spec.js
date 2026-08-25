#!/usr/bin/env node
"use strict";

/* One-time repair for the staging app that predates the API component.
 *
 * Start with the DOWNLOADED live spec so domains, alerts, encrypted values and
 * every other setting survive.  This script is deliberately staging-only: it
 * accepts only an app with no services, validates the exact static source, and
 * adds one hnk-api service plus a development database only when none exists.
 * The JWT value comes from a mode-0600 runner file and is never printed.  On
 * the next workflow run DigitalOcean returns it as EV[...] and the ordinary
 * fail-closed live-spec patcher takes over. */
const assert = require("assert");
const fs = require("fs");

const [inputPath, outputPath, jwtPath, appName, serviceName, staticSiteName,
  repo, branch, host] = process.argv.slice(2);
if (![inputPath, outputPath, jwtPath, appName, serviceName, staticSiteName,
  repo, branch, host].every(Boolean)) {
  console.error("usage: bootstrap_digitalocean_staging_spec.js INPUT OUTPUT JWT_FILE APP SERVICE STATIC_SITE REPO BRANCH HOST");
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

function validateIngress(spec) {
  if (!Object.prototype.hasOwnProperty.call(spec, "ingress")) return false;
  if (!isObject(spec.ingress) || Object.keys(spec.ingress).length === 0 ||
      !Array.isArray(spec.ingress.rules) || spec.ingress.rules.length === 0) {
    fail("downloaded staging spec contains malformed or empty ingress");
  }
  for (const rule of spec.ingress.rules) {
    if (!isObject(rule)) fail("downloaded staging spec contains a malformed ingress rule");
    const match = rule.match;
    if (isObject(match) && Object.prototype.hasOwnProperty.call(match, "authority") &&
        (!isObject(match.authority) || Object.keys(match.authority).length === 0)) {
      fail("downloaded staging spec contains an empty ingress rule authority");
    }
  }
  return true;
}

function validateExistingSecrets(spec) {
  const componentGroups = ["services", "static_sites", "workers", "jobs", "functions"];
  const envGroups = [];
  if (Object.prototype.hasOwnProperty.call(spec, "envs")) {
    if (!Array.isArray(spec.envs)) fail("downloaded staging spec has malformed top-level envs");
    envGroups.push(spec.envs);
  }
  for (const key of componentGroups) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
    if (!Array.isArray(spec[key])) fail(`downloaded staging spec has malformed ${key}`);
    for (const component of spec[key]) {
      if (!component || !Object.prototype.hasOwnProperty.call(component, "envs")) continue;
      if (!Array.isArray(component.envs)) fail("downloaded staging component has malformed envs");
      envGroups.push(component.envs);
    }
  }
  for (const envs of envGroups) {
    for (const env of envs) {
      if (!env || env.type !== "SECRET") continue;
      if (typeof env.value !== "string" || !/^EV\[[^\]]+\]$/.test(env.value)) {
        fail(`existing secret ${env.key || "<unnamed>"} is not an encrypted live-spec value`);
      }
    }
  }
}

try {
  const live = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!isObject(live)) fail("downloaded staging spec is not a JSON object");
  if (live.name !== appName) fail("downloaded staging spec names the wrong app");

  if (Object.prototype.hasOwnProperty.call(live, "services") && !Array.isArray(live.services)) {
    fail("downloaded staging spec has malformed services");
  }
  const existingServices = Array.isArray(live.services) ? live.services : [];
  if (existingServices.length !== 0) {
    fail("staging bootstrap is allowed only when the live spec has no services");
  }

  const sites = live.static_sites;
  if (!Array.isArray(sites) || sites.length !== 1) {
    fail("staging bootstrap requires exactly one existing static site");
  }
  const site = sites[0];
  if (!site || site.name !== staticSiteName || !isObject(site.github) ||
      site.github.repo !== repo || site.github.branch !== branch ||
      site.github.deploy_on_push !== true || site.source_dir !== "/docs") {
    fail("the staging static site source does not match the release lane");
  }

  validateExistingSecrets(live);
  const hasIngress = validateIngress(live);

  if (hasIngress) {
    if (live.ingress.rules.length !== 1) {
      fail("staging bootstrap refuses an ambiguous multi-rule ingress");
    }
    const webRoots = live.ingress.rules.filter(rule =>
      rule && rule.component && rule.component.name === staticSiteName &&
      rule.match && rule.match.path && rule.match.path.prefix === "/");
    if (webRoots.length !== 1) {
      fail("staging bootstrap requires one existing root ingress rule for the static site");
    }
  } else if (Object.prototype.hasOwnProperty.call(site, "routes")) {
    if (!Array.isArray(site.routes)) fail("the staging static site has malformed routes");
    const webRoots = site.routes.filter(route => route && route.path === "/");
    if (site.routes.length !== 0 && webRoots.length !== 1) {
      fail("the staging static site does not own the expected root route");
    }
  }

  const databases = Object.prototype.hasOwnProperty.call(live, "databases")
    ? live.databases : [];
  if (!Array.isArray(databases)) fail("downloaded staging spec has malformed databases");
  if (databases.length > 1) fail("staging bootstrap refuses an ambiguous database layout");
  if (databases.length === 1 &&
      (!databases[0] || !["hnk-db", "db"].includes(databases[0].name) ||
       databases[0].engine !== "PG")) {
    fail("the existing staging database is not the expected PostgreSQL component");
  }

  const appJwt = (Array.isArray(live.envs) ? live.envs : [])
    .filter(env => env && env.key === "JWT_SECRET");
  if (appJwt.length > 1) fail("downloaded staging spec has duplicate app-level JWT secrets");
  const jwtMode = fs.statSync(jwtPath).mode & 0o777;
  if ((jwtMode & 0o077) !== 0) fail("the generated JWT secret file is not owner-only");
  const jwt = fs.readFileSync(jwtPath, "utf8").trim();
  if (appJwt.length === 0 && !/^[a-f0-9]{128}$/.test(jwt)) {
    fail("the generated JWT secret has an invalid shape");
  }

  const service = {
    name: serviceName,
    environment_slug: "node-js",
    github: { repo, branch, deploy_on_push: true },
    source_dir: "/server",
    run_command: "node index.js",
    http_port: 8080,
    instance_count: 1,
    instance_size_slug: "apps-s-1vcpu-0.5gb",
    health_check: { http_path: "/ready" },
    liveness_health_check: { http_path: "/live" },
    envs: [
      { key: "DATABASE_URL", scope: "RUN_TIME", value: "${hnk-db.DATABASE_URL}" },
      { key: "DATABASE_URL_IF_COMPONENT_IS_NAMED_DB", scope: "RUN_TIME", value: "${db.DATABASE_URL}" },
      { key: "DATABASE_CA_CERT", scope: "RUN_TIME", value: "${hnk-db.CA_CERT}" },
      { key: "DATABASE_CA_CERT_IF_COMPONENT_IS_NAMED_DB", scope: "RUN_TIME", value: "${db.CA_CERT}" },
      { key: "ALLOWED_ORIGIN", scope: "RUN_TIME", value: `https://${host}` },
      { key: "APP_ORIGIN", scope: "RUN_TIME", value: `https://${host}` },
    ],
  };
  if (appJwt.length === 0) {
    service.envs.splice(4, 0,
      { key: "JWT_SECRET", scope: "RUN_TIME", type: "SECRET", value: jwt });
  }

  const patched = clone(live);
  patched.services = [service];
  if (databases.length === 0) {
    patched.databases = [{ name: "hnk-db", engine: "PG", production: false }];
  }

  if (hasIngress) {
    const conflicts = patched.ingress.rules.filter(rule => {
      const prefix = rule && rule.match && rule.match.path && rule.match.path.prefix;
      const component = rule && rule.component && rule.component.name;
      return component === serviceName || prefix === "/api" ||
        (typeof prefix === "string" && prefix.startsWith("/api/"));
    });
    if (conflicts.length) fail("the existing staging ingress already claims the API route or service");
    const rootMatch = patched.ingress.rules[0].match;
    const apiMatch = clone(rootMatch);
    apiMatch.path = { prefix: "/api" };
    patched.ingress.rules.unshift({
      match: apiMatch,
      component: { name: serviceName },
    });
  } else {
    if (!Array.isArray(patched.static_sites[0].routes) ||
        patched.static_sites[0].routes.length === 0) {
      patched.static_sites[0].routes = [{ path: "/" }];
    }
    service.routes = [{ path: "/api" }];
  }

  /* Remove only the fields this bootstrap is allowed to add/change and prove
     that every downloaded live value is otherwise byte-for-field identical. */
  const preserved = clone(patched);
  if (Object.prototype.hasOwnProperty.call(live, "services")) {
    preserved.services = clone(live.services);
  } else {
    delete preserved.services;
  }
  if (databases.length === 0) {
    if (Object.prototype.hasOwnProperty.call(live, "databases")) {
      preserved.databases = clone(live.databases);
    } else {
      delete preserved.databases;
    }
  }
  if (hasIngress) preserved.ingress = clone(live.ingress);
  if (!hasIngress) preserved.static_sites = clone(live.static_sites);
  try {
    assert.deepStrictEqual(preserved, live);
  } catch (_) {
    fail("staging bootstrap changed fields outside the approved service, database, or API route");
  }

  fs.writeFileSync(outputPath, JSON.stringify(patched, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);
  console.log(`Validated static-only ${appName}; prepared one ${serviceName} service and its required staging database binding.`);
} catch (err) {
  console.error("Refusing to bootstrap DigitalOcean staging spec:",
    err && err.message ? err.message : err);
  process.exit(1);
}
