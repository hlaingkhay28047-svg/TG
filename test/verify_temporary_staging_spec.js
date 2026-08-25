"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, ".github", "scripts", "temporary_staging_spec.js");
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, ".github", "workflows", "temporary-staging-validation.yml"), "utf8");
const CONTAINED_DOCKERFILE = fs.readFileSync(
  path.join(ROOT, "server", "Dockerfile.staging-contained"), "utf8");
const CONTAINED_START = fs.readFileSync(
  path.join(ROOT, "server", "start-contained-staging.sh"), "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-temp-staging-"));
const args = ["hnk-ai-tools-2", "hnk-api", "hnk-tmp-run328", "hnk-web",
  "hlaingkhay28047-svg/TG", "upgrade-safe-wave",
  "https://hnk-ai-tools-2-gibhz.ondigitalocean.app", "run-328-test"];
const secret = "a".repeat(64);
let failures = 0;

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

function fixture({ ingress = true } = {}) {
  const spec = {
    name: "hnk-ai-tools-2",
    region: "sgp",
    domains: [{ domain: "staging.example.test", type: "ALIAS" }],
    alerts: [{ rule: "DEPLOYMENT_FAILED" }],
    envs: [{ key: "EXISTING_SECRET", type: "SECRET", scope: "RUN_TIME", value: "EV[1:existing]" }],
    static_sites: [{
      name: "hnk-web",
      environment_slug: "html",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "upgrade-safe-wave", deploy_on_push: true },
      source_dir: "/docs",
      routes: [{ path: "/" }],
    }],
  };
  if (ingress) {
    spec.ingress = {
      rules: [{ match: { path: { prefix: "/" } }, component: { name: "hnk-web" } }],
    };
  }
  return spec;
}

function invoke(mode, spec, suffix, env = {}) {
  const input = path.join(temp, `${suffix}-in.json`);
  const output = path.join(temp, `${suffix}-out.json`);
  fs.writeFileSync(input, JSON.stringify(spec));
  const run = spawnSync(process.execPath, [SCRIPT, mode, input, output, ...args], {
    encoding: "utf8",
    env: Object.assign({}, process.env, { TEMP_STAGING_DATABASE_MODE: "managed" }, env),
  });
  return { run, output, parsed: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null };
}

try {
  report("temporary and normal deploys share one non-canceling staging lock",
    /concurrency:\s*\n\s*group:\s*digitalocean-staging\s*\n\s*cancel-in-progress:\s*false/.test(WORKFLOW),
    "temporary workflow concurrency must match the normal staging lane");
  report("an independent always-run cleanup job follows validation",
    /\n  cleanup:\n[\s\S]*?needs:\s*validate\n\s*if:\s*\$\{\{ always\(\) \}\}/.test(WORKFLOW),
    "missing job-level cleanup guard");
  report("orphan recovery is followed by a fresh validation instead of a green cleanup-only rerun",
    !WORKFLOW.includes("if: steps.recover.outputs.recovered != 'true'"),
    "recovery must not skip create/verify");
  report("workflow compares canonical JSON rather than raw downloaded formatting",
    (WORKFLOW.match(/jq -S \. /g) || []).length >= 4 &&
    !WORKFLOW.includes('cmp -s "$CURRENT_SPEC" "$CLEANED_SPEC"'),
    "semantic comparisons must canonicalize both specs");
  report("both cleanup paths force and attest an active deployment after desired-spec deletion",
    (WORKFLOW.match(/doctl apps create-deployment/g) || []).length >= 2 &&
    (WORKFLOW.match(/active_deployment\.services/g) || []).length >= 2 &&
    (WORKFLOW.match(/active_deployment\.id == \$cleanup/g) || []).length >= 2 &&
    (WORKFLOW.match(/in_progress_deployment == null/g) || []).length >= 2 &&
    (WORKFLOW.match(/pending_deployment == null/g) || []).length >= 2 &&
    (WORKFLOW.match(/--force-rebuild/g) || []).length >= 2 &&
    (WORKFLOW.match(/doctl apps get-deployment/g) || []).length >= 2 &&
    !/doctl apps create-deployment[\s\S]{0,180}--(?:update-sources|wait)/.test(WORKFLOW),
    "desired spec or an older active deployment cannot prove a pending API was replaced");
  report("contained image is built and failure-injected before any remote mutation",
    /Build and smoke-test the contained database image[\s\S]*docker build --pull[\s\S]*docker run --detach/.test(WORKFLOW) &&
    /kill -TERM[\s\S]*docker wait/.test(WORKFLOW) &&
    WORKFLOW.indexOf("Build and smoke-test the contained database image") <
      WORKFLOW.indexOf("Prepare and validate the temporary full spec"),
    "workflow must prove build, migrations, health and PostgreSQL-death supervision locally first");
  report("contained runtime pins both base images and runs Node without root",
    (CONTAINED_DOCKERFILE.match(/FROM [^\n]+@sha256:[a-f0-9]{64}/g) || []).length === 2 &&
    CONTAINED_START.includes("gosu postgres node /app/index.js") &&
    CONTAINED_START.includes('kill -0 "$postgres_pid"') &&
    CONTAINED_START.includes('kill -0 "$node_pid"') &&
    !CONTAINED_START.includes("fsync=off") &&
    !CONTAINED_START.includes("full_page_writes=off"),
    "runtime must be reproducible, non-root, durable and fail closed if either child dies");

  const source = fixture();
  const boot = invoke("bootstrap", source, "bootstrap", { TEMP_STAGING_JWT_SECRET: secret });
  const service = boot.parsed && boot.parsed.services && boot.parsed.services[0];
  report("bootstrap adds one marker-bound API and one dev database",
    boot.run.status === 0 && service && service.name === "hnk-api" &&
    service.envs.some(env => env.key === "HNK_EPHEMERAL_STAGING_RUN" && env.value === "run-328-test") &&
    boot.parsed.databases.length === 1 && boot.parsed.databases[0].production === false,
    boot.run.stderr);
  report("bootstrap uses separate readiness/liveness probes and exact source",
    service.health_check.http_path === "/ready" &&
    service.liveness_health_check.http_path === "/live" &&
    service.github.branch === "upgrade-safe-wave" && service.github.deploy_on_push === true,
    service);
  report("modern ingress places /api before the unchanged static root",
    boot.parsed.ingress.rules[0].component.name === "hnk-api" &&
    boot.parsed.ingress.rules[0].match.path.prefix === "/api" &&
    boot.parsed.ingress.rules[1].component.name === "hnk-web",
    boot.parsed.ingress.rules);
  report("domains, alerts, static site and encrypted live secret are preserved",
    JSON.stringify(boot.parsed.domains) === JSON.stringify(source.domains) &&
    JSON.stringify(boot.parsed.alerts) === JSON.stringify(source.alerts) &&
    JSON.stringify(boot.parsed.static_sites) === JSON.stringify(source.static_sites) &&
    boot.parsed.envs[0].value === "EV[1:existing]",
    boot.parsed);

  const contained = invoke("bootstrap", fixture(), "contained", {
    TEMP_STAGING_DATABASE_MODE: "contained",
    TEMP_STAGING_JWT_SECRET: secret,
    TEMP_STAGING_PG_PASSWORD: "b".repeat(64),
  });
  const containedService = contained.parsed && contained.parsed.services && contained.parsed.services[0];
  const containedPassword = containedService && containedService.envs
    .find(env => env.key === "HNK_CONTAINED_PG_PASSWORD");
  report("contained mode uses the exact Docker staging harness and no managed database",
    contained.run.status === 0 && containedService &&
    containedService.dockerfile_path === "server/Dockerfile.staging-contained" &&
    containedService.source_dir === "/server" &&
    !Object.prototype.hasOwnProperty.call(containedService, "environment_slug") &&
    !Object.prototype.hasOwnProperty.call(containedService, "run_command") &&
    containedPassword && containedPassword.type === "SECRET" &&
    containedPassword.value === "b".repeat(64) &&
    contained.parsed.databases.length === 0 &&
    !contained.run.stdout.includes(containedPassword.value), contained.run.stderr);

  contained.parsed.services[0].envs.find(env => env.key === "JWT_SECRET").value = "EV[1:jwt]";
  contained.parsed.services[0].envs
    .find(env => env.key === "HNK_CONTAINED_PG_PASSWORD").value = "EV[1:pg]";
  const cleanContained = invoke("cleanup", contained.parsed, "contained-clean", {
    TEMP_STAGING_DATABASE_MODE: "contained",
  });
  report("cleanup removes a contained API without requiring a managed database",
    cleanContained.run.status === 0 && cleanContained.parsed.services.length === 0 &&
    cleanContained.parsed.databases.length === 0 &&
    cleanContained.parsed.ingress.rules.every(rule => rule.component.name !== "hnk-api"),
    cleanContained.run.stderr);

  const containedWithManagedDatabase = JSON.parse(JSON.stringify(contained.parsed));
  containedWithManagedDatabase.databases = [{
    name: "hnk-tmp-run328", engine: "PG", production: false, version: "16",
  }];
  const unsafeContainedClean = invoke("cleanup", containedWithManagedDatabase,
    "contained-managed-database", { TEMP_STAGING_DATABASE_MODE: "contained" });
  report("contained cleanup refuses a managed database it never created",
    unsafeContainedClean.run.status !== 0 && !fs.existsSync(unsafeContainedClean.output),
    unsafeContainedClean.run.stderr);

  /* Simulate App Platform encrypting the first-submission JWT before spec get. */
  boot.parsed.services[0].envs.find(env => env.key === "JWT_SECRET").value = "EV[1:jwt]";
  const clean = invoke("cleanup", boot.parsed, "cleanup");
  report("cleanup removes only the marker-bound service, dev database and API rule",
    clean.run.status === 0 && clean.parsed.services.length === 0 &&
    clean.parsed.databases.length === 0 && clean.parsed.ingress.rules.length === 1 &&
    clean.parsed.ingress.rules[0].component.name === "hnk-web" &&
    JSON.stringify(clean.parsed.static_sites) === JSON.stringify(source.static_sites) &&
    JSON.stringify(clean.parsed.domains) === JSON.stringify(source.domains),
    clean.run.stderr);

  const legacySource = fixture({ ingress: false });
  const legacy = invoke("bootstrap", legacySource, "legacy", { TEMP_STAGING_JWT_SECRET: secret });
  report("legacy route-based live specs remain supported",
    legacy.run.status === 0 && legacy.parsed.services[0].routes[0].path === "/api" &&
    legacy.parsed.static_sites[0].routes[0].path === "/",
    legacy.run.stderr);

  const generatedSecret = invoke("bootstrap", fixture(), "generated-secret");
  const generatedJwt = generatedSecret.parsed && generatedSecret.parsed.services[0].envs
    .find(env => env.key === "JWT_SECRET");
  report("bootstrap generates its JWT secret inside the transform when none is supplied",
    generatedSecret.run.status === 0 && generatedJwt.type === "SECRET" &&
    /^[a-f0-9]{64}$/.test(generatedJwt.value) &&
    !generatedSecret.run.stdout.includes(generatedJwt.value), generatedSecret.run.stderr);

  const badSecret = invoke("bootstrap", fixture(), "bad-secret", { TEMP_STAGING_JWT_SECRET: "short" });
  report("bootstrap refuses a malformed test override without writing output",
    badSecret.run.status !== 0 && !fs.existsSync(badSecret.output), badSecret.run.stderr);

  const existingService = fixture();
  existingService.services = [{ name: "other-api" }];
  const collision = invoke("bootstrap", existingService, "collision", { TEMP_STAGING_JWT_SECRET: secret });
  report("bootstrap refuses any pre-existing staging service",
    collision.run.status !== 0 && !fs.existsSync(collision.output), collision.run.stderr);

  const existingApiRoute = fixture();
  existingApiRoute.ingress.rules.unshift({
    match: { path: { prefix: "/api" } },
    component: { name: "other-api" },
  });
  const apiCollision = invoke("bootstrap", existingApiRoute, "api-collision",
    { TEMP_STAGING_JWT_SECRET: secret });
  report("bootstrap refuses an existing API route owned by another component",
    apiCollision.run.status !== 0 && !fs.existsSync(apiCollision.output), apiCollision.run.stderr);

  const existingServiceTarget = fixture();
  existingServiceTarget.ingress.rules.unshift({
    match: { path: { prefix: "/other" } },
    component: { name: "hnk-api" },
  });
  const targetCollision = invoke("bootstrap", existingServiceTarget, "target-collision",
    { TEMP_STAGING_JWT_SECRET: secret });
  report("bootstrap refuses any ingress target using the temporary service name",
    targetCollision.run.status !== 0 && !fs.existsSync(targetCollision.output),
    targetCollision.run.stderr);

  const wrongMarker = JSON.parse(JSON.stringify(boot.parsed));
  wrongMarker.services[0].envs.find(env => env.key === "HNK_EPHEMERAL_STAGING_RUN").value = "other-run";
  const unsafeClean = invoke("cleanup", wrongMarker, "wrong-marker");
  report("cleanup refuses resources not owned by the current run",
    unsafeClean.run.status !== 0 && !fs.existsSync(unsafeClean.output), unsafeClean.run.stderr);

  const serviceOnly = JSON.parse(JSON.stringify(boot.parsed));
  delete serviceOnly.databases;
  const cleanServiceOnly = invoke("cleanup", serviceOnly, "service-only");
  report("cleanup recovers when only the marked service and API route remain",
    cleanServiceOnly.run.status === 0 && cleanServiceOnly.parsed.services.length === 0 &&
    cleanServiceOnly.parsed.databases.length === 0 &&
    cleanServiceOnly.parsed.ingress.rules.every(rule => rule.component.name !== "hnk-api"),
    cleanServiceOnly.run.stderr);

  const databaseOnly = JSON.parse(JSON.stringify(boot.parsed));
  delete databaseOnly.services;
  databaseOnly.ingress.rules = databaseOnly.ingress.rules.filter(rule => rule.component.name !== "hnk-api");
  const cleanDatabaseOnly = invoke("cleanup", databaseOnly, "database-only");
  report("cleanup recovers when only the run-unique development database remains",
    cleanDatabaseOnly.run.status === 0 && cleanDatabaseOnly.parsed.services.length === 0 &&
    cleanDatabaseOnly.parsed.databases.length === 0,
    cleanDatabaseOnly.run.stderr);

  const routeOnly = JSON.parse(JSON.stringify(boot.parsed));
  delete routeOnly.services;
  delete routeOnly.databases;
  const cleanRouteOnly = invoke("cleanup", routeOnly, "route-only");
  report("cleanup recovers when only the exact temporary API route remains",
    cleanRouteOnly.run.status === 0 &&
    cleanRouteOnly.parsed.ingress.rules.every(rule => rule.component.name !== "hnk-api"),
    cleanRouteOnly.run.stderr);

  const noRoute = JSON.parse(JSON.stringify(boot.parsed));
  noRoute.ingress.rules = noRoute.ingress.rules.filter(rule => rule.component.name !== "hnk-api");
  const cleanNoRoute = invoke("cleanup", noRoute, "no-route");
  report("cleanup recovers when the marked service and database exist without a route",
    cleanNoRoute.run.status === 0 && cleanNoRoute.parsed.services.length === 0 &&
    cleanNoRoute.parsed.databases.length === 0,
    cleanNoRoute.run.stderr);

  const productionDatabase = JSON.parse(JSON.stringify(databaseOnly));
  productionDatabase.databases[0].production = true;
  const unsafeProductionClean = invoke("cleanup", productionDatabase, "production-database");
  report("cleanup refuses a production database even when its name matches",
    unsafeProductionClean.run.status !== 0 && !fs.existsSync(unsafeProductionClean.output),
    unsafeProductionClean.run.stderr);

  const extraService = JSON.parse(JSON.stringify(boot.parsed));
  extraService.services.push({ name: "other-api" });
  extraService.databases.push({ name: "other-db", engine: "PG", production: false });
  const preservedExtraClean = invoke("cleanup", extraService, "extra-components");
  report("cleanup preserves unrelated services and databases while removing only owned resources",
    preservedExtraClean.run.status === 0 && preservedExtraClean.parsed.services.length === 1 &&
    preservedExtraClean.parsed.services[0].name === "other-api" &&
    preservedExtraClean.parsed.databases.length === 1 &&
    preservedExtraClean.parsed.databases[0].name === "other-db" &&
    preservedExtraClean.parsed.ingress.rules.every(rule => rule.component.name !== "hnk-api"),
    preservedExtraClean.run.stderr);

  const wrongApiRoute = JSON.parse(JSON.stringify(routeOnly));
  wrongApiRoute.ingress.rules[0].component.name = "other-api";
  const unsafeRouteClean = invoke("cleanup", wrongApiRoute, "wrong-api-route");
  report("cleanup refuses an API route that belongs to another component",
    unsafeRouteClean.run.status !== 0 && !fs.existsSync(unsafeRouteClean.output),
    unsafeRouteClean.run.stderr);

  const plaintext = fixture();
  plaintext.envs[0].value = "plaintext-existing-secret";
  const unsafeSecret = invoke("bootstrap", plaintext, "plaintext", { TEMP_STAGING_JWT_SECRET: secret });
  report("bootstrap refuses to resubmit a plaintext or redacted existing secret",
    unsafeSecret.run.status !== 0 && !fs.existsSync(unsafeSecret.output) &&
    !unsafeSecret.run.stderr.includes("plaintext-existing-secret"), unsafeSecret.run.stderr);

  const alreadyClean = invoke("cleanup", fixture(), "already-clean");
  report("cleanup is idempotent when no temporary resource was ever applied",
    alreadyClean.run.status === 0 && JSON.stringify(alreadyClean.parsed) === JSON.stringify(fixture()),
    alreadyClean.run.stderr);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(`\n${failures ? `FAIL (${failures})` : "PASS — temporary staging spec changes are marker-bound and reversible"}`);
process.exit(failures ? 1 : 0);
