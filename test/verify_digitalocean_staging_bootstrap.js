"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BOOTSTRAP = path.join(ROOT, ".github", "scripts",
  "bootstrap_digitalocean_staging_spec.js");
const PATCHER = path.join(ROOT, ".github", "scripts", "patch_digitalocean_spec.js");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-do-staging-bootstrap-"));
const SECRET = "ab".repeat(64);
let failures = 0;

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

function fixture() {
  return {
    name: "hnk-ai-tools-2",
    region: "sgp",
    domains: [{ domain: "staging.example.test", type: "PRIMARY" }],
    alerts: [{ rule: "DEPLOYMENT_FAILED" }],
    envs: [
      { key: "EXISTING_APP_SECRET", scope: "RUN_TIME", type: "SECRET", value: "EV[1:app-ciphertext]" },
    ],
    static_sites: [{
      name: "hnk-web",
      github: {
        repo: "hlaingkhay28047-svg/TG",
        branch: "upgrade-safe-wave",
        deploy_on_push: true,
      },
      source_dir: "/docs",
    }],
  };
}

function invoke(spec, suffix, secret = SECRET) {
  const input = path.join(temp, `${suffix}-in.json`);
  const output = path.join(temp, `${suffix}-out.json`);
  const jwt = path.join(temp, `${suffix}-jwt`);
  fs.writeFileSync(input, JSON.stringify(spec));
  fs.writeFileSync(jwt, secret, { mode: 0o600 });
  const run = spawnSync(process.execPath, [
    BOOTSTRAP, input, output, jwt,
    "hnk-ai-tools-2", "hnk-api", "hnk-web",
    "hlaingkhay28047-svg/TG", "upgrade-safe-wave",
    "hnk-ai-tools-2-gibhz.ondigitalocean.app",
  ], { encoding: "utf8" });
  return {
    run,
    output,
    parsed: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null,
  };
}

function invokePatcher(spec, suffix) {
  const input = path.join(temp, `${suffix}-roundtrip-in.json`);
  const output = path.join(temp, `${suffix}-roundtrip-out.json`);
  fs.writeFileSync(input, JSON.stringify(spec));
  const run = spawnSync(process.execPath, [
    PATCHER, input, output,
    "hnk-ai-tools-2", "hnk-api", "hnk-web",
    "hlaingkhay28047-svg/TG", "upgrade-safe-wave",
  ], { encoding: "utf8" });
  return { run, output };
}

try {
  const source = fixture();
  const good = invoke(source, "good");
  const api = good.parsed && good.parsed.services && good.parsed.services[0];
  report("a static-only staging app gains exactly one API service and development database",
    good.run.status === 0 && good.parsed.services.length === 1 &&
    api.name === "hnk-api" && api.routes[0].path === "/api" &&
    good.parsed.static_sites[0].routes[0].path === "/" &&
    api.health_check.http_path === "/ready" &&
    api.liveness_health_check.http_path === "/live" &&
    good.parsed.databases.length === 1 && good.parsed.databases[0].name === "hnk-db",
    good.run.stderr);

  const jwt = api && api.envs.find(env => env.key === "JWT_SECRET");
  report("the generated signing key is injected only as the new encrypted-at-submit JWT value",
    jwt && jwt.type === "SECRET" && jwt.value === SECRET &&
    !good.run.stdout.includes(SECRET) && !good.run.stderr.includes(SECRET),
    good.run.stderr);

  const preserved = JSON.parse(JSON.stringify(good.parsed));
  delete preserved.services;
  delete preserved.databases;
  const expectedPreserved = JSON.parse(JSON.stringify(source));
  expectedPreserved.static_sites[0].routes = [{ path: "/" }];
  let unchanged = true;
  try { assert.deepStrictEqual(preserved, expectedPreserved); } catch (_) { unchanged = false; }
  report("all downloaded fields survive and the previously implicit web root becomes explicit",
    unchanged && good.parsed.envs[0].value === "EV[1:app-ciphertext]", good.parsed);

  report("the generated owner-only spec is not readable by group or other users",
    (fs.statSync(good.output).mode & 0o077) === 0, fs.statSync(good.output).mode & 0o777);

  const encryptedRoundtrip = JSON.parse(JSON.stringify(good.parsed));
  encryptedRoundtrip.services[0].envs.find(env => env.key === "JWT_SECRET").value =
    "EV[1:jwt-ciphertext]";
  const roundtrip = invokePatcher(encryptedRoundtrip, "good");
  report("the normal fail-closed patcher accepts DigitalOcean's encrypted bootstrap roundtrip",
    roundtrip.run.status === 0 && fs.existsSync(roundtrip.output), roundtrip.run.stderr);

  const inheritedJwt = fixture();
  inheritedJwt.envs.push({
    key: "JWT_SECRET", scope: "RUN_TIME", type: "SECRET", value: "EV[1:existing-jwt]",
  });
  const withInheritedJwt = invoke(inheritedJwt, "existing-app-jwt");
  const inheritedRoundtrip = withInheritedJwt.parsed
    ? invokePatcher(withInheritedJwt.parsed, "existing-app-jwt") : null;
  report("an encrypted app-level signing key is inherited rather than rotated",
    withInheritedJwt.run.status === 0 &&
    withInheritedJwt.parsed.envs.find(env => env.key === "JWT_SECRET").value ===
      "EV[1:existing-jwt]" &&
    !withInheritedJwt.parsed.services[0].envs.some(env => env.key === "JWT_SECRET") &&
    inheritedRoundtrip && inheritedRoundtrip.run.status === 0,
    withInheritedJwt.run.stderr);

  const existingDb = fixture();
  existingDb.databases = [{
    name: "db", engine: "PG", production: true, cluster_name: "staging-cluster",
  }];
  const withDb = invoke(existingDb, "existing-db");
  report("an existing expected PostgreSQL component is preserved instead of recreated",
    withDb.run.status === 0 &&
    JSON.stringify(withDb.parsed.databases) === JSON.stringify(existingDb.databases),
    withDb.run.stderr);

  const ingress = fixture();
  ingress.ingress = {
    rules: [{
      match: { path: { prefix: "/" }, authority: { exact: "staging.example.test" } },
      component: { name: "hnk-web" },
    }],
  };
  const withIngress = invoke(ingress, "ingress");
  report("modern ingress receives one API rule while its existing authority remains unchanged",
    withIngress.run.status === 0 &&
    withIngress.parsed.ingress.rules[0].match.path.prefix === "/api" &&
    withIngress.parsed.ingress.rules[0].match.authority.exact === "staging.example.test" &&
    withIngress.parsed.ingress.rules[1].match.authority.exact === "staging.example.test" &&
    !Object.prototype.hasOwnProperty.call(withIngress.parsed.services[0], "routes"),
    withIngress.run.stderr);

  const existingService = fixture();
  existingService.services = [{ name: "unexpected-service" }];
  const badService = invoke(existingService, "existing-service");
  report("the bootstrap fails closed when any live service already exists",
    badService.run.status !== 0 && !fs.existsSync(badService.output), badService.run.stderr);

  const wrongSource = fixture();
  wrongSource.static_sites[0].github.branch = "main";
  const badSource = invoke(wrongSource, "wrong-source");
  report("a mismatched static release source fails closed",
    badSource.run.status !== 0 && !fs.existsSync(badSource.output), badSource.run.stderr);

  const plaintext = fixture();
  plaintext.envs[0].value = "plaintext-existing-secret";
  const badSecret = invoke(plaintext, "plaintext");
  report("a plaintext or redacted existing secret fails without being printed",
    badSecret.run.status !== 0 && !fs.existsSync(badSecret.output) &&
    !badSecret.run.stderr.includes("plaintext-existing-secret"), badSecret.run.stderr);

  const wrongDb = fixture();
  wrongDb.databases = [{ name: "customer-data", engine: "PG", production: true }];
  const badDb = invoke(wrongDb, "wrong-db");
  report("an unexpected database layout is never overwritten",
    badDb.run.status !== 0 && !fs.existsSync(badDb.output), badDb.run.stderr);

  const emptyIngress = fixture();
  emptyIngress.ingress = {};
  const badIngress = invoke(emptyIngress, "empty-ingress");
  report("an empty live ingress fails closed before a full-spec update",
    badIngress.run.status !== 0 && !fs.existsSync(badIngress.output), badIngress.run.stderr);

  const routeConflict = fixture();
  routeConflict.ingress = {
    rules: [{ match: { path: { prefix: "/api" } }, component: { name: "hnk-web" } }],
  };
  const badRoute = invoke(routeConflict, "route-conflict");
  report("an already-claimed API ingress route is not silently replaced",
    badRoute.run.status !== 0 && !fs.existsSync(badRoute.output), badRoute.run.stderr);

  const shortJwt = invoke(fixture(), "short-jwt", "too-short");
  report("a weak or malformed generated signing key fails closed",
    shortJwt.run.status !== 0 && !fs.existsSync(shortJwt.output), shortJwt.run.stderr);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(`\n${failures ? `FAIL (${failures})` : "PASS — DigitalOcean staging bootstrap is narrow and fail-closed"}`);
process.exit(failures ? 1 : 0);
