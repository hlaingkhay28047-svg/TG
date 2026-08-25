"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PATCHER = path.join(ROOT, ".github", "scripts", "patch_digitalocean_spec.js");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-do-spec-"));
let failures = 0;

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

function fixture() {
  return {
    name: "hnk-ai-tools-3",
    region: "sgp",
    envs: [
      { key: "APP_SECRET", scope: "RUN_TIME", type: "SECRET", value: "EV[1:app-ciphertext]" },
    ],
    ingress: { rules: [{ match: { path: { prefix: "/api" } }, component: { name: "hnk-api" } }] },
    services: [{
      name: "hnk-api",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main", deploy_on_push: true },
      health_check: { http_path: "/health", failure_threshold: 9 },
      envs: [
        { key: "JWT_SECRET", scope: "RUN_TIME", type: "SECRET", value: "EV[1:jwt-ciphertext]" },
        { key: "SMTP_PASS", scope: "RUN_TIME", type: "SECRET", value: "EV[1:smtp-ciphertext]" },
      ],
      routes: [{ path: "/api" }],
    }],
    static_sites: [{
      name: "hnk-web",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main", deploy_on_push: true },
      envs: [
        { key: "WEB_SECRET", scope: "RUN_TIME", type: "SECRET", value: "EV[1:web-ciphertext]" },
      ],
      routes: [{ path: "/" }],
    }],
    databases: [{ name: "hnk-db", engine: "PG", production: false }],
  };
}

function invoke(spec, suffix) {
  const input = path.join(temp, `${suffix}-in.json`);
  const output = path.join(temp, `${suffix}-out.json`);
  fs.writeFileSync(input, JSON.stringify(spec));
  const run = spawnSync(process.execPath,
    [PATCHER, input, output, "hnk-ai-tools-3", "hnk-api", "hnk-web",
      "hlaingkhay28047-svg/TG", "main"],
    { encoding: "utf8" });
  return { run, output, parsed: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : null };
}

try {
  const source = fixture();
  const good = invoke(source, "good");
  const api = good.parsed && good.parsed.services[0];
  report("the downloaded live spec is accepted and gains separate probes",
    good.run.status === 0 && api.health_check.http_path === "/ready" &&
    api.liveness_health_check.http_path === "/live", good.run.stderr);

  const expected = JSON.parse(JSON.stringify(source));
  expected.services[0].health_check.http_path = "/ready";
  expected.services[0].liveness_health_check = { http_path: "/live" };
  let unchanged = true;
  try { assert.deepStrictEqual(good.parsed, expected); } catch (_) { unchanged = false; }
  report("encrypted secrets, ingress, routes, database and source survive byte-for-field",
    unchanged && good.parsed.services[0].health_check.failure_threshold === 9 &&
    good.parsed.services[0].envs[0].value === "EV[1:jwt-ciphertext]");

  const plaintext = fixture();
  plaintext.services[0].envs[0].value = "plaintext-secret";
  const badSecret = invoke(plaintext, "plaintext");
  report("a plaintext or redacted JWT secret fails closed",
    badSecret.run.status !== 0 && !fs.existsSync(badSecret.output) &&
    !badSecret.run.stderr.includes("plaintext-secret"), badSecret.run.stderr);

  const missingSecret = fixture();
  missingSecret.static_sites[0].envs[0].value = "";
  const badMissingSecret = invoke(missingSecret, "missing-secret");
  report("every secret must retain an encrypted live-spec value",
    badMissingSecret.run.status !== 0 && !fs.existsSync(badMissingSecret.output),
    badMissingSecret.run.stderr);

  const workerSecret = fixture();
  workerSecret.workers = [{
    name: "background-worker",
    envs: [{ key: "WORKER_SECRET", type: "SECRET", value: "plaintext-worker-secret" }],
  }];
  const badWorkerSecret = invoke(workerSecret, "worker-secret");
  report("secrets in non-HTTP app components must also stay encrypted",
    badWorkerSecret.run.status !== 0 && !fs.existsSync(badWorkerSecret.output) &&
    !badWorkerSecret.run.stderr.includes("plaintext-worker-secret"),
    badWorkerSecret.run.stderr);

  const emptyIngress = fixture();
  emptyIngress.ingress = {};
  const badIngress = invoke(emptyIngress, "ingress");
  report("an empty top-level ingress fails closed before full-spec submission",
    badIngress.run.status !== 0 && !fs.existsSync(badIngress.output), badIngress.run.stderr);

  const emptyAuthority = fixture();
  emptyAuthority.ingress.rules[0].match.authority = {};
  const badAuthority = invoke(emptyAuthority, "authority");
  report("an empty nested ingress authority fails closed before full-spec submission",
    badAuthority.run.status !== 0 && !fs.existsSync(badAuthority.output), badAuthority.run.stderr);

  const wrongSource = fixture();
  wrongSource.services[0].github.branch = "other";
  const badSource = invoke(wrongSource, "source");
  report("a mismatched release source fails closed",
    badSource.run.status !== 0 && !fs.existsSync(badSource.output), badSource.run.stderr);

  const wrongStatic = fixture();
  wrongStatic.static_sites[0].name = "decoy-web";
  const badStatic = invoke(wrongStatic, "static-name");
  report("the exact release static site must be present",
    badStatic.run.status !== 0 && !fs.existsSync(badStatic.output), badStatic.run.stderr);

  const disabledPush = fixture();
  disabledPush.services[0].github.deploy_on_push = false;
  const badPush = invoke(disabledPush, "disabled-push");
  report("the API source binding must still deploy on push",
    badPush.run.status !== 0 && !fs.existsSync(badPush.output), badPush.run.stderr);

  const disabledStaticPush = fixture();
  disabledStaticPush.static_sites[0].github.deploy_on_push = false;
  const badStaticPush = invoke(disabledStaticPush, "disabled-static-push");
  report("the static source binding must still deploy on push",
    badStaticPush.run.status !== 0 && !fs.existsSync(badStaticPush.output),
    badStaticPush.run.stderr);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(`\n${failures ? `FAIL (${failures})` : "PASS — DigitalOcean live-spec patch is narrow and fail-closed"}`);
process.exit(failures ? 1 : 0);
