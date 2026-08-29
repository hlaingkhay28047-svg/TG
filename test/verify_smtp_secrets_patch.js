/* Regression for the SMTP spec patch and its guarded lane.

   .github/scripts/set_smtp_secrets.js edits the LIVE production App Platform
   spec, in the same envs array the six security secrets live in, and the
   repository is public — so the properties pinned here are the ones whose
   failure would either kill a deploy invisibly or put a credential where the
   world can read it:

     * it writes exactly SMTP_HOST/SMTP_PORT (GENERAL) and
       SMTP_USER/SMTP_PASS (SECRET), all RUN_TIME, values taken ONLY from the
       environment — never from argv, never from a dispatch input
     * a Gmail-style spaced app password is normalized to the real credential
     * every other variable survives, byte for byte, in its original order,
       with the six SECRET entries specifically unchanged; no other component
       is touched
     * a second run replaces in place rather than appending duplicates
     * a missing value, a malformed address, and a too-short password are each
       refused with a named reason — and nothing printed on any path, success
       or refusal, ever contains the password or the mailbox address
     * the lane itself is dispatch-only, demands the typed word SMTP, maps the
       values from repository secrets, masks them, and keeps contents: read

   Usage: node test/verify_smtp_secrets_patch.js */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, ".github", "scripts", "set_smtp_secrets.js");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github", "workflows", "set-smtp-secrets.yml"), "utf8");
const SERVICE = "hnk-api";
const USER = "owner-mail-probe@gmail.com";
const PASS_SPACED = "abcd efgh ijkl mnop";
const PASS_REAL = "abcdefghijklmnop";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-smtp-patch-"));

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
        { key: "BOOTSTRAP_ADMIN_EMAIL", value: "owner@example.com", scope: "RUN_TIME", type: "GENERAL" },
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
  return { status: child.status, output, patched, outPath };
}

const GOOD_ENV = { SMTP_USER_VALUE: USER, SMTP_PASS_VALUE: PASS_SPACED };

/* ---- the happy path ---- */
const first = run(liveSpec(), GOOD_ENV, "first");
report("a valid pair patches the spec and exits 0", first.status === 0, first.output.slice(0, 300));
const envs = first.patched ? first.patched.services[0].envs : [];
const byKey = key => envs.filter(e => e.key === key);
report("SMTP_HOST/SMTP_PORT are GENERAL runtime configuration",
  byKey("SMTP_HOST").length === 1 && byKey("SMTP_HOST")[0].value === "smtp.gmail.com" &&
  byKey("SMTP_HOST")[0].type === "GENERAL" && byKey("SMTP_HOST")[0].scope === "RUN_TIME" &&
  byKey("SMTP_PORT").length === 1 && byKey("SMTP_PORT")[0].value === "465" &&
  byKey("SMTP_PORT")[0].type === "GENERAL",
  envs.map(e => e.key));
report("SMTP_USER/SMTP_PASS are SECRET runtime credentials",
  byKey("SMTP_USER").length === 1 && byKey("SMTP_USER")[0].type === "SECRET" &&
  byKey("SMTP_USER")[0].value === USER &&
  byKey("SMTP_PASS").length === 1 && byKey("SMTP_PASS")[0].type === "SECRET",
  envs.map(e => ({ key: e.key, type: e.type })));
report("the Gmail-spaced app password is stored without spaces",
  byKey("SMTP_PASS").length === 1 && byKey("SMTP_PASS")[0].value === PASS_REAL, "spacing survived");

const original = liveSpec().services[0].envs;
const survived = envs.slice(0, original.length);
report("every pre-existing variable survives byte for byte, in order",
  JSON.stringify(survived) === JSON.stringify(original),
  survived.map(e => e.key));
report("no other component is touched",
  first.patched && JSON.stringify(first.patched.static_sites) === JSON.stringify(liveSpec().static_sites),
  "static_sites changed");
report("nothing printed carries the password or the mailbox address",
  !first.output.includes(PASS_REAL) && !first.output.includes("abcd") && !first.output.includes(USER) &&
  !first.output.includes("owner-mail-probe"),
  first.output.slice(0, 200));

/* ---- idempotence ---- */
const second = run(first.patched, GOOD_ENV, "second");
const envs2 = second.patched ? second.patched.services[0].envs : [];
report("a second run replaces in place rather than appending duplicates",
  second.status === 0 && envs2.length === envs.length &&
  envs2.filter(e => e.key.startsWith("SMTP_")).length === 4,
  { first: envs.length, second: envs2.length });

/* ---- refusals, each without echoing ---- */
const cases = [
  ["a missing user is refused", { SMTP_USER_VALUE: "", SMTP_PASS_VALUE: PASS_SPACED }, /SMTP_USER_VALUE is empty/],
  ["a missing password is refused", { SMTP_USER_VALUE: USER, SMTP_PASS_VALUE: "" }, /SMTP_PASS_VALUE is empty/],
  ["a malformed address is refused", { SMTP_USER_VALUE: "not an email", SMTP_PASS_VALUE: PASS_SPACED }, /does not look like an email/],
  ["a short password is refused", { SMTP_USER_VALUE: USER, SMTP_PASS_VALUE: "abc def" }, /shorter than an app password/],
];
for (const [name, env, expect] of cases) {
  const refused = run(liveSpec(), env, name.replace(/\W+/g, "-"));
  report(name,
    refused.status !== 0 && refused.patched === null && expect.test(refused.output) &&
    !refused.output.includes(PASS_REAL) && !refused.output.includes(USER),
    { status: refused.status, out: refused.output.slice(0, 160) });
}

const missingService = run({ name: "x", services: [{ name: "other", envs: [] }] }, GOOD_ENV, "svc");
report("an absent service is refused rather than invented",
  missingService.status !== 0 && /expected exactly one/.test(missingService.output), missingService.output.slice(0, 160));

/* ---- the lane around the script ---- */
report("the lane runs only on workflow_dispatch",
  /on:\s*\n\s+workflow_dispatch:/.test(WORKFLOW) && !/\bpush:|\bpull_request:|\bschedule:/.test(WORKFLOW),
  "trigger set changed");
report("the typed confirmation SMTP gates every run",
  WORKFLOW.includes('"$CONFIRM_INPUT" != "SMTP"'), "typed confirmation missing");
report("the values come from repository secrets, never dispatch inputs",
  WORKFLOW.includes("${{ secrets.SMTP_USER }}") && WORKFLOW.includes("${{ secrets.SMTP_PASS }}") &&
  !/inputs\.(?!confirm\b)[a-z_]+/i.test(WORKFLOW),
  "an input could carry a credential into a public run log");
report("both values are masked before any other step runs",
  WORKFLOW.includes('echo "::add-mask::$SMTP_USER_VALUE"') &&
  WORKFLOW.includes('echo "::add-mask::$SMTP_PASS_VALUE"'), "masking missing");
report("the lane's repository permissions are read-only",
  /permissions:\s*\n\s+contents: read/.test(WORKFLOW) && !/contents: write/.test(WORKFLOW), "permissions widened");
report("production lanes stay serialized through one concurrency group",
  WORKFLOW.includes("group: digitalocean-production-secrets"), "concurrency group changed");
report("the lane proves the mailer live rather than trusting the submit",
  WORKFLOW.includes("smtpConfigured") && WORKFLOW.includes("/api/health"), "health verification missing");

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
console.log("\nPASS — the SMTP lane writes four names, keeps every secret, and never echoes one");
