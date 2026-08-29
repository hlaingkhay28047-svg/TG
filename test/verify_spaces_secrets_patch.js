/* Regression for the Spaces spec patch and its guarded setup lane.

   .github/scripts/set_spaces_secrets.js edits the LIVE production App
   Platform spec with a credential born from the DigitalOcean API, and
   .github/workflows/setup-spaces.yml is the only lane allowed to run it —
   creating paid storage, so its guards are part of the contract:

     * the script writes exactly SPACES_REGION/SPACES_BUCKET (GENERAL) and
       SPACES_KEY_ID/SPACES_SECRET (SECRET), all RUN_TIME, values ONLY from
       the environment
     * every other variable survives byte for byte in its original order,
       the six security secrets specifically unchanged, no other component
       touched, and a second run replaces in place
     * a missing or malformed value is refused by name, and no output path
       carries the credential
     * the lane is dispatch-only behind the typed word SPACES with read-only
       permissions and the shared production concurrency group; the
       ephemeral fullaccess key is deleted on every exit path; both
       credentials are masked; the read key is proven against the bucket
       BEFORE production receives it; and the lane only finishes when
       /api/health reports artifactStore "spaces"

   Usage: node test/verify_spaces_secrets_patch.js */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, ".github", "scripts", "set_spaces_secrets.js");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github", "workflows", "setup-spaces.yml"), "utf8");
const SERVICE = "hnk-api";
const KEY_ID = "SPACESRUNTIMEKEYPROBE";
const SECRET = "spaces-runtime-secret-probe-1234567890";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-spaces-patch-"));

function liveSpec() {
  return {
    name: "hnk-ai-tools-3",
    services: [{
      name: SERVICE,
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main" },
      envs: [
        { key: "DATABASE_URL", value: "EV[1:abc:def]", scope: "RUN_TIME", type: "SECRET" },
        { key: "JWT_SECRET", value: "EV[1:ghi:jkl]", scope: "RUN_TIME", type: "SECRET" },
        { key: "MFA_ENCRYPTION_KEY", value: "EV[1:mno:pqr]", scope: "RUN_TIME", type: "SECRET" },
        { key: "DEVICE_ID_HASH_SECRET", value: "EV[1:stu:vwx]", scope: "RUN_TIME", type: "SECRET" },
        { key: "DEVICE_PAIRING_SECRET", value: "EV[1:yz1:234]", scope: "RUN_TIME", type: "SECRET" },
        { key: "CCX_DOWNLOAD_SECRET", value: "EV[1:567:890]", scope: "RUN_TIME", type: "SECRET" },
        { key: "PANEL_LEASE_SECRET", value: "EV[1:aaa:bbb]", scope: "RUN_TIME", type: "SECRET" },
        { key: "SMTP_PASS", value: "EV[1:ccc:ddd]", scope: "RUN_TIME", type: "SECRET" },
        { key: "APP_ORIGIN", value: "https://hnkaistudio.com", scope: "RUN_TIME", type: "GENERAL" },
      ],
    }],
    static_sites: [{ name: "hnk-site", github: { repo: "hlaingkhay28047-svg/TG", branch: "main" } }],
  };
}

function run(spec, env, outName) {
  const livePath = path.join(tmp, outName + "-live.json");
  const outPath = path.join(tmp, outName + "-out.json");
  fs.writeFileSync(livePath, JSON.stringify(spec));
  const child = spawnSync("node", [SCRIPT, livePath, outPath, SERVICE], {
    env: Object.assign({}, process.env, env), encoding: "utf8",
  });
  const output = (child.stdout || "") + (child.stderr || "");
  const patched = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
  return { status: child.status, output, patched };
}

const GOOD_ENV = {
  SPACES_REGION_VALUE: "sgp1", SPACES_BUCKET_VALUE: "hnk-panel-0a1b2c3d",
  SPACES_KEY_ID_VALUE: KEY_ID, SPACES_SECRET_VALUE: SECRET,
};

/* ---- the happy path ---- */
const first = run(liveSpec(), GOOD_ENV, "first");
report("a valid credential set patches the spec and exits 0", first.status === 0, first.output.slice(0, 300));
const envs = first.patched ? first.patched.services[0].envs : [];
const byKey = key => envs.filter(e => e.key === key);
report("region and bucket are GENERAL runtime configuration",
  byKey("SPACES_REGION").length === 1 && byKey("SPACES_REGION")[0].type === "GENERAL" &&
  byKey("SPACES_BUCKET").length === 1 && byKey("SPACES_BUCKET")[0].type === "GENERAL" &&
  byKey("SPACES_BUCKET")[0].value === "hnk-panel-0a1b2c3d",
  envs.map(e => e.key));
report("the credential pair is SECRET runtime configuration",
  byKey("SPACES_KEY_ID").length === 1 && byKey("SPACES_KEY_ID")[0].type === "SECRET" &&
  byKey("SPACES_SECRET").length === 1 && byKey("SPACES_SECRET")[0].type === "SECRET" &&
  byKey("SPACES_SECRET")[0].value === SECRET,
  envs.map(e => ({ key: e.key, type: e.type })));

const original = liveSpec().services[0].envs;
report("every pre-existing variable survives byte for byte, in order",
  JSON.stringify(envs.slice(0, original.length)) === JSON.stringify(original),
  envs.map(e => e.key));
report("no other component is touched",
  first.patched && JSON.stringify(first.patched.static_sites) === JSON.stringify(liveSpec().static_sites));
report("nothing printed carries the credential",
  !first.output.includes(SECRET) && !first.output.includes(KEY_ID), first.output.slice(0, 200));

const second = run(first.patched, GOOD_ENV, "second");
report("a second run replaces in place rather than appending duplicates",
  second.status === 0 && second.patched.services[0].envs.length === envs.length);

/* ---- refusals ---- */
const cases = [
  ["a missing secret is refused", Object.assign({}, GOOD_ENV, { SPACES_SECRET_VALUE: "" }), /SPACES_SECRET_VALUE is empty/],
  ["a malformed bucket is refused", Object.assign({}, GOOD_ENV, { SPACES_BUCKET_VALUE: "Bad_Bucket!" }), /not a bucket name/],
  ["a malformed region is refused", Object.assign({}, GOOD_ENV, { SPACES_REGION_VALUE: "SGP 1" }), /not a region slug/],
  ["a short secret is refused", Object.assign({}, GOOD_ENV, { SPACES_SECRET_VALUE: "short" }), /does not look like a secret key/],
];
for (const [name, env, expect] of cases) {
  const refused = run(liveSpec(), env, name.replace(/\W+/g, "-"));
  report(name,
    refused.status !== 0 && refused.patched === null && expect.test(refused.output) &&
    !refused.output.includes(SECRET),
    { status: refused.status, out: refused.output.slice(0, 160) });
}

/* ---- the lane around the script ---- */
report("the lane runs only on workflow_dispatch",
  /on:\s*\n\s+workflow_dispatch:/.test(WORKFLOW) && !/\bpush:|\bpull_request:|\bschedule:/.test(WORKFLOW));
report("the typed confirmation SPACES gates the paid creation",
  WORKFLOW.includes('"$CONFIRM_INPUT" != "SPACES"'));
report("the lane's repository permissions are read-only",
  /permissions:\s*\n\s+contents: read/.test(WORKFLOW) && !/contents: write/.test(WORKFLOW));
report("production lanes stay serialized through one concurrency group",
  WORKFLOW.includes("group: digitalocean-production-secrets"));
report("the only dispatch input is the confirmation",
  !/inputs\.(?!confirm\b)[a-z_]+/i.test(WORKFLOW));
report("the ephemeral fullaccess key is deleted on every exit path",
  WORKFLOW.includes("trap cleanup_spaces EXIT") && WORKFLOW.includes("/v2/spaces/keys/$EPHEMERAL_ACCESS"));
report("both credentials are masked the moment they exist",
  WORKFLOW.includes('echo "::add-mask::$EPHEMERAL_SECRET"') &&
  WORKFLOW.includes('echo "::add-mask::$RUNTIME_SECRET"'));
report("the runtime read key is proven against the bucket before production gets it",
  WORKFLOW.includes("runtime read key probe failed"));
report("the spec is patched through the tested script",
  WORKFLOW.includes(".github/scripts/set_spaces_secrets.js"));
report("the lane only finishes when the service serves from the Space",
  WORKFLOW.includes(".artifactStore") && WORKFLOW.includes('"$STORE" = "spaces"') &&
  WORKFLOW.includes("/api/health"));

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
console.log("\nPASS — the Spaces lane creates once, rotates cleanly, and never echoes a key");
