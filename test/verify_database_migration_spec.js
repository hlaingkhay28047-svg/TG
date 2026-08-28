/* verify_database_migration_spec — the phase editor that stages the
   dev-database -> managed-cluster migration must change EXACTLY what its
   phase means and nothing else. An App Platform spec update replaces the
   whole document, so "nothing else" is what keeps six encrypted secrets, the
   ingress and every other component alive through the migration.

   Pinned contracts:
   A) attach adds exactly two things — the cluster database component and the
      db-copy POST_DEPLOY job — and every pre-existing byte survives in order.
   B) attach is idempotent: run against a spec that already carries both, it
      changes nothing.
   C) switch repoints exactly the service's DATABASE_URL and DATABASE_CA_CERT
      to the cluster; it refuses a spec without the attach phase's work, and
      refuses to overwrite a binding it does not recognise.
   D) cleanup removes the dev database and the job ONLY once the service reads
      the cluster; while the service still reads the dev database it refuses.
   E) A spec whose SECRET values are not the platform's encrypted EV[...]
      forms is refused in every phase, as is a spec naming another app.

   Usage: node test/verify_database_migration_spec.js  (no server, no network) */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join(__dirname, "..", ".github", "scripts", "edit_database_spec.js");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-migrate-spec-"));

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const SECRETS = ["JWT_SECRET", "MFA_ENCRYPTION_KEY", "DEVICE_ID_HASH_SECRET",
  "SMTP_HOST", "SMTP_USER", "SMTP_PASS"];

function baseSpec() {
  return {
    name: "hnk-ai-tools-3",
    region: "sgp",
    services: [{
      name: "hnk-api",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main", deploy_on_push: true },
      source_dir: "/server",
      run_command: "node index.js",
      envs: [
        { key: "DATABASE_URL", scope: "RUN_TIME", value: "${hnk-db.DATABASE_URL}" },
        { key: "DATABASE_CA_CERT", scope: "RUN_TIME", value: "${hnk-db.CA_CERT}" },
        { key: "APP_ORIGIN", scope: "RUN_TIME", value: "https://example.test" },
        ...SECRETS.map((key, i) => ({ key, scope: "RUN_TIME", type: "SECRET", value: "EV[1:secret-" + i + "]" })),
      ],
    }],
    static_sites: [{
      name: "hnk-web",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main", deploy_on_push: true },
    }],
    databases: [{ name: "hnk-db", engine: "PG", production: false }],
    ingress: { rules: [{ match: { path: { prefix: "/" } } }] },
  };
}

function run(spec, phase) {
  const input = path.join(TMP, "in-" + phase + "-" + Math.random().toString(16).slice(2) + ".json");
  const output = input.replace("in-", "out-");
  fs.writeFileSync(input, JSON.stringify(spec, null, 2));
  const child = spawnSync("node", [SCRIPT, input, output, phase], { encoding: "utf8" });
  const patched = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null;
  return { status: child.status, out: (child.stdout || "") + (child.stderr || ""), patched };
}

function withoutAdded(spec) {
  const clone = JSON.parse(JSON.stringify(spec));
  clone.databases = (clone.databases || []).filter(d => d.name !== "hnk-pg");
  if (Array.isArray(clone.jobs)) {
    clone.jobs = clone.jobs.filter(j => j.name !== "db-copy");
    if (!clone.jobs.length) delete clone.jobs;
  }
  return clone;
}

/* ---- A) attach ---- */
const attach = run(baseSpec(), "attach");
const cluster = attach.patched && attach.patched.databases.find(d => d.name === "hnk-pg");
const job = attach.patched && (attach.patched.jobs || []).find(j => j.name === "db-copy");
const jobEnv = key => job && (job.envs || []).find(e => e.key === key);
report("A) attach adds the production cluster and the POST_DEPLOY copy job, nothing else",
  attach.status === 0 && cluster && cluster.production === true && cluster.cluster_name === "hnk-pg" &&
    job && job.kind === "POST_DEPLOY" && job.run_command === "node copy-database.js" &&
    jobEnv("SOURCE_DATABASE_URL") && jobEnv("SOURCE_DATABASE_URL").value === "${hnk-db.DATABASE_URL}" &&
    jobEnv("DATABASE_URL") && jobEnv("DATABASE_URL").value === "${hnk-pg.DATABASE_URL}" &&
    JSON.stringify(withoutAdded(attach.patched)) === JSON.stringify(baseSpec()),
  { status: attach.status, out: attach.out.slice(0, 200) });

/* ---- B) attach is idempotent ---- */
const again = run(attach.patched, "attach");
report("B) attach against an already-attached spec changes nothing",
  again.status === 0 && JSON.stringify(again.patched) === JSON.stringify(attach.patched),
  { status: again.status });

/* ---- C) switch ---- */
const switched = run(attach.patched, "switch");
const envOf = (spec, key) => spec.services[0].envs.find(e => e.key === key);
const expectSwitched = JSON.parse(JSON.stringify(attach.patched));
envOf(expectSwitched, "DATABASE_URL").value = "${hnk-pg.DATABASE_URL}";
envOf(expectSwitched, "DATABASE_CA_CERT").value = "${hnk-pg.CA_CERT}";
report("C) switch repoints exactly the two database bindings",
  switched.status === 0 &&
    JSON.stringify(switched.patched) === JSON.stringify(expectSwitched),
  { status: switched.status, out: switched.out.slice(0, 200) });

const noAttach = run(baseSpec(), "switch");
const oddBinding = (() => { const s = JSON.parse(JSON.stringify(attach.patched)); envOf(s, "DATABASE_URL").value = "postgres://typed-by-hand"; return run(s, "switch"); })();
report("C2) switch refuses an unattached spec and refuses to overwrite an unrecognised binding",
  noAttach.status === 1 && oddBinding.status === 1 &&
    /attach phase/.test(noAttach.out) && /refusing to guess/.test(oddBinding.out),
  { noAttach: noAttach.status, oddBinding: oddBinding.status });

/* ---- D) cleanup ---- */
const early = run(attach.patched, "cleanup");
const cleaned = run(switched.patched, "cleanup");
report("D) cleanup refuses while the service reads the dev database, and afterwards removes exactly it and the job",
  early.status === 1 && /still reads the dev database/.test(early.out) &&
    cleaned.status === 0 &&
    !cleaned.patched.databases.some(d => d.name === "hnk-db") &&
    !(cleaned.patched.jobs || []).some(j => j.name === "db-copy") &&
    cleaned.patched.databases.some(d => d.name === "hnk-pg") &&
    JSON.stringify(cleaned.patched.services) === JSON.stringify(switched.patched.services),
  { early: early.status, cleaned: cleaned.status });

/* ---- E) refusals ---- */
const plaintext = (() => { const s = baseSpec(); s.services[0].envs.find(e => e.key === "JWT_SECRET").value = "not-encrypted"; return run(s, "attach"); })();
const wrongApp = (() => { const s = baseSpec(); s.name = "someone-elses-app"; return run(s, "attach"); })();
const secretsSurvive = [attach, switched, cleaned].every(result =>
  SECRETS.every(key => {
    const env = result.patched.services[0].envs.find(e => e.key === key);
    return env && env.type === "SECRET" && /^EV\[1:secret-\d\]$/.test(env.value);
  }));
report("E) plaintext secrets and foreign apps are refused; the six encrypted secrets survive every phase byte-for-byte",
  plaintext.status === 1 && /not an encrypted live-spec value/.test(plaintext.out) &&
    wrongApp.status === 1 && /wrong app/.test(wrongApp.out) && secretsSurvive,
  { plaintext: plaintext.status, wrongApp: wrongApp.status, secretsSurvive });

fs.rmSync(TMP, { recursive: true, force: true });
console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
process.exit(failures === 0 ? 0 : 1);
