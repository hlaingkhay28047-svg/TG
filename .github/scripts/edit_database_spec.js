#!/usr/bin/env node
/* Stage the dev-database -> managed-cluster migration in a live App Platform
 * spec, one guarded phase at a time.
 *
 * WHY A PROGRAM. The six-secrets incident proved console input boxes truncate
 * silently, and the app spec is a full-document update: whatever is submitted
 * REPLACES what is live, so an edit that drops a component deletes it in
 * production. Every phase here therefore starts from the downloaded live
 * spec, changes only what its phase means, proves by deep comparison that
 * nothing else moved, and refuses specs whose SECRET values are not the
 * encrypted EV[...] forms the platform hands back.
 *
 * PHASES
 *   attach  — add the managed cluster component (production: true) and the
 *             db-copy POST_DEPLOY job that copies the dev database into it.
 *             The service keeps running on the dev database; nothing about
 *             live traffic changes.
 *   switch  — repoint the service's DATABASE_URL / DATABASE_CA_CERT bindings
 *             from the dev database to the cluster. The dev database stays
 *             attached, untouched, as the instant rollback: flipping the two
 *             bindings back is the whole undo.
 *   cleanup — remove the db-copy job and the dev database component. Run only
 *             after the owner has confirmed the cluster serves correctly;
 *             REMOVING THE DEV DATABASE COMPONENT DELETES IT AND ITS DATA.
 *
 * Usage: node edit_database_spec.js <live-spec.json> <out.json> <phase>
 */
"use strict";

const assert = require("assert");
const fs = require("fs");

const APP_NAME = "hnk-ai-tools-3";
const SERVICE = "hnk-api";
const DEV_DB = "hnk-db";
const CLUSTER = "hnk-pg";
const JOB = "db-copy";
const REPO = "hlaingkhay28047-svg/TG";
const BRANCH = "main";
/* NEVER doadmin. A bare cluster attachment binds DigitalOcean's doadmin,
 * which carries BYPASSRLS — and migrate() rightly refuses a BYPASSRLS
 * runtime user, because under it every FORCE RLS policy in the schema means
 * nothing. That refusal is exactly how the first attach failed: the db-copy
 * job exited non-zero on every deployment. The create-cluster phase creates
 * this plain NOSUPERUSER/NOBYPASSRLS user and grants it CREATE on the public
 * schema; every component binds through it. */
const RUNTIME_DB_USER = "hnk_runtime";
const RUNTIME_DB_NAME = "defaultdb";

function fail(message) {
  console.error("::error::" + message);
  process.exit(1);
}

const [inputPath, outputPath, phase] = process.argv.slice(2);
if (!inputPath || !outputPath || !["attach", "switch", "cleanup"].includes(phase)) {
  fail("usage: edit_database_spec.js <live-spec.json> <out.json> attach|switch|cleanup");
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

let spec;
try { spec = JSON.parse(fs.readFileSync(inputPath, "utf8")); }
catch (error) { fail("live spec is not readable JSON: " + error.message); }
if (!spec || typeof spec !== "object" || Array.isArray(spec)) fail("live spec is not an object");
if (spec.name !== APP_NAME) fail("live spec names the wrong app: " + spec.name);
if (!Array.isArray(spec.services)) fail("live spec has no services array");

const service = spec.services.find(s => s && s.name === SERVICE);
if (!service) fail("live spec has no " + SERVICE + " service");
if (!service.github || service.github.repo !== REPO || service.github.branch !== BRANCH) {
  fail(SERVICE + " is not bound to " + REPO + "@" + BRANCH);
}

/* Refuse any spec whose secrets are not the platform's encrypted forms —
   resubmitting anything else would overwrite real credentials. */
const componentLists = ["services", "static_sites", "workers", "jobs", "functions"]
  .flatMap(key => Array.isArray(spec[key]) ? spec[key] : []);
for (const envs of [spec.envs, ...componentLists.map(c => c && c.envs)]) {
  if (!Array.isArray(envs)) continue;
  for (const env of envs) {
    if (env && env.type === "SECRET" && !/^EV\[[^\]]+\]$/.test(String(env.value || ""))) {
      fail("secret " + (env.key || "<unnamed>") + " is not an encrypted live-spec value");
    }
  }
}

const databases = Array.isArray(spec.databases) ? spec.databases : [];
const devDb = databases.find(d => d && d.name === DEV_DB);
const clusterDb = databases.find(d => d && d.name === CLUSTER);
const jobs = Array.isArray(spec.jobs) ? spec.jobs : [];
const copyJob = jobs.find(j => j && j.name === JOB);

const patched = clone(spec);
const summary = [];

function bindingEnv(key, value) {
  return { key, scope: "RUN_TIME", value };
}

if (phase === "attach") {
  if (!devDb) fail("the dev database " + DEV_DB + " is not in the live spec; nothing to migrate from");
  if (!clusterDb) {
    patched.databases = [...(patched.databases || []), {
      name: CLUSTER, engine: "PG", production: true, cluster_name: CLUSTER,
      db_user: RUNTIME_DB_USER, db_name: RUNTIME_DB_NAME,
    }];
    summary.push("attached managed cluster " + CLUSTER + " as " + RUNTIME_DB_USER);
  } else {
    const patchedCluster = patched.databases.find(d => d && d.name === CLUSTER);
    if (patchedCluster.db_user !== RUNTIME_DB_USER || patchedCluster.db_name !== RUNTIME_DB_NAME) {
      patchedCluster.db_user = RUNTIME_DB_USER;
      patchedCluster.db_name = RUNTIME_DB_NAME;
      summary.push("repointed the cluster binding to the " + RUNTIME_DB_USER + " runtime user");
    } else summary.push("cluster " + CLUSTER + " already attached");
  }
  if (!copyJob) {
    patched.jobs = [...(patched.jobs || []), {
      name: JOB,
      kind: "POST_DEPLOY",
      environment_slug: "node-js",
      github: { repo: REPO, branch: BRANCH, deploy_on_push: true },
      source_dir: "/server",
      run_command: "node copy-database.js",
      instance_count: 1,
      instance_size_slug: "apps-s-1vcpu-0.5gb",
      envs: [
        bindingEnv("SOURCE_DATABASE_URL", "${" + DEV_DB + ".DATABASE_URL}"),
        bindingEnv("SOURCE_DATABASE_CA_CERT", "${" + DEV_DB + ".CA_CERT}"),
        bindingEnv("DATABASE_URL", "${" + CLUSTER + ".DATABASE_URL}"),
        bindingEnv("DATABASE_CA_CERT", "${" + CLUSTER + ".CA_CERT}"),
      ],
    }];
    summary.push("added " + JOB + " POST_DEPLOY job");
  } else summary.push("job " + JOB + " already present");
}

if (phase === "switch") {
  if (!clusterDb) fail("cluster " + CLUSTER + " is not attached; run the attach phase first");
  if (clusterDb.db_user !== RUNTIME_DB_USER) {
    fail("the cluster is still bound as " + (clusterDb.db_user || "doadmin") +
      " — the service would boot LOCKED on a BYPASSRLS user; run the attach phase first");
  }
  if (!copyJob) fail("the " + JOB + " job is not present; run the attach phase first");
  const patchedService = patched.services.find(s => s.name === SERVICE);
  const envs = Array.isArray(patchedService.envs) ? patchedService.envs : [];
  const rewrites = { DATABASE_URL: "${" + CLUSTER + ".DATABASE_URL}", DATABASE_CA_CERT: "${" + CLUSTER + ".CA_CERT}" };
  for (const key of Object.keys(rewrites)) {
    const env = envs.find(e => e && e.key === key);
    if (!env) fail(SERVICE + " has no " + key + " binding to repoint");
    if (env.value === rewrites[key]) { summary.push(key + " already points at " + CLUSTER); continue; }
    if (env.value !== "${" + DEV_DB + "." + (key === "DATABASE_URL" ? "DATABASE_URL" : "CA_CERT") + "}") {
      fail(key + " does not carry the expected dev-database binding; refusing to guess (found a different value)");
    }
    env.value = rewrites[key];
    summary.push("repointed " + key + " to " + CLUSTER);
  }
}

if (phase === "cleanup") {
  if (!clusterDb) fail("cluster " + CLUSTER + " is not attached; cleanup would leave the app with no database");
  const patchedService = patched.services.find(s => s.name === SERVICE);
  const dbUrl = (patchedService.envs || []).find(e => e && e.key === "DATABASE_URL");
  if (!dbUrl || dbUrl.value !== "${" + CLUSTER + ".DATABASE_URL}") {
    fail("the service still reads the dev database; run the switch phase and verify before cleanup");
  }
  patched.databases = (patched.databases || []).filter(d => !(d && d.name === DEV_DB));
  patched.jobs = (patched.jobs || []).filter(j => !(j && j.name === JOB));
  if (Array.isArray(patched.jobs) && patched.jobs.length === 0) delete patched.jobs;
  summary.push("removed dev database " + DEV_DB + " (its data is deleted) and the " + JOB + " job");
}

/* Prove the phase changed only what it means. */
const expected = clone(spec);
if (phase === "attach") {
  if (!clusterDb) expected.databases = [...(expected.databases || []), clone(patched.databases[patched.databases.length - 1])];
  else {
    const expectedCluster = expected.databases.find(d => d && d.name === CLUSTER);
    expectedCluster.db_user = RUNTIME_DB_USER;
    expectedCluster.db_name = RUNTIME_DB_NAME;
  }
  if (!copyJob) expected.jobs = [...(expected.jobs || []), clone(patched.jobs[patched.jobs.length - 1])];
}
if (phase === "switch") {
  const expectedService = expected.services.find(s => s.name === SERVICE);
  for (const env of expectedService.envs) {
    if (env.key === "DATABASE_URL") env.value = "${" + CLUSTER + ".DATABASE_URL}";
    if (env.key === "DATABASE_CA_CERT") env.value = "${" + CLUSTER + ".CA_CERT}";
  }
}
if (phase === "cleanup") {
  expected.databases = (expected.databases || []).filter(d => !(d && d.name === DEV_DB));
  expected.jobs = (expected.jobs || []).filter(j => !(j && j.name === JOB));
  if (Array.isArray(expected.jobs) && expected.jobs.length === 0) delete expected.jobs;
}
try { assert.deepStrictEqual(patched, expected); }
catch (_) { fail("the " + phase + " transform changed fields outside its own scope"); }

fs.writeFileSync(outputPath, JSON.stringify(patched, null, 2) + "\n", { mode: 0o600 });
console.log("edit_database_spec " + phase + ": " + summary.join("; "));
