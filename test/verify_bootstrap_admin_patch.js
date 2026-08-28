/* Regression for the BOOTSTRAP_ADMIN_EMAIL spec patch.

   .github/scripts/set_bootstrap_admin.js edits the LIVE production App
   Platform spec. Everything the six security secrets live in is in the same
   envs array, and the incident this whole lane exists because of was a
   configuration that looked right and was not, so the properties asserted here
   are the ones whose failure would be invisible until a deploy died:

     * it writes exactly one BOOTSTRAP_ADMIN_EMAIL, RUN_TIME, holding the
       address given
     * it is GENERAL, not SECRET — an email is not a credential, and typing it
       SECRET would only hide it from the owner checking their own settings
     * every other variable survives, byte for byte, in its original order,
       with the six SECRET entries specifically unchanged
     * no other component is touched
     * a second run replaces in place rather than appending a duplicate
     * a key that is a truncated copy of the name is removed, because a stale
       BOOTSTRAP_ADMIN_EM beside the real one is exactly the confusion that
       cost five deploys
     * a malformed address is refused, and refused WITHOUT echoing it
     * nothing it prints carries a whole address, because the Actions log of a
       public repository is world-readable

   Usage: node test/verify_bootstrap_admin_patch.js */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join(__dirname, "..", ".github", "scripts", "set_bootstrap_admin.js");
const SERVICE = "hnk-api";
const EMAIL = "Hlaingkhay28047@gmail.com";
const MASKED = "Hl***47 [at] gmail.com";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-bootstrap-admin-"));

/* The shape of the real thing: two components, and the six secrets sitting in
   the array this script edits. */
function liveSpec(extraEnvs = []) {
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
        { key: "PANEL_LEASE_SECRET", value: "EV[1:abc:xyz]", scope: "RUN_TIME", type: "SECRET" },
        { key: "ALLOWED_ORIGIN", value: "https://hnkaistudio.com", scope: "RUN_TIME" },
        { key: "TRUST_DO_CONNECTING_IP", value: "1", scope: "RUN_TIME" },
        ...extraEnvs,
      ],
    }],
    static_sites: [{
      name: "hnk-web",
      github: { repo: "hlaingkhay28047-svg/TG", branch: "main" },
      envs: [{ key: "SOMETHING_ELSE", value: "kept", scope: "BUILD_TIME" }],
    }],
  };
}

let run = 0;
function patch(spec, email = EMAIL) {
  const inPath = path.join(tmp, `live-${++run}.json`);
  const outPath = path.join(tmp, `out-${run}.json`);
  fs.writeFileSync(inPath, JSON.stringify(spec));
  const child = spawnSync(process.execPath, [SCRIPT, inPath, outPath, SERVICE, email],
    { encoding: "utf8" });
  const out = fs.existsSync(outPath)
    ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
  return {
    status: child.status,
    stdout: (child.stdout || "").trim(),
    stderr: (child.stderr || "").trim(),
    spec: out,
  };
}
const envsOf = spec => spec.services.find(s => s.name === SERVICE).envs;

/* A — the write itself, and its type. GENERAL rather than SECRET is a
   deliberate choice, not an oversight: see the script's header. */
let r = patch(liveSpec());
const a = r.spec ? envsOf(r.spec).filter(e => e.key === "BOOTSTRAP_ADMIN_EMAIL") : [];
report("A writes exactly one BOOTSTRAP_ADMIN_EMAIL, RUN_TIME, GENERAL, holding the address",
  r.status === 0 && a.length === 1 && a[0].value === EMAIL &&
  a[0].scope === "RUN_TIME" && a[0].type === "GENERAL",
  { status: r.status, a, stderr: r.stderr });

/* B — THE ONE THAT MUST NEVER REGRESS. The six secrets live in the array this
   script edits, and losing one is a production outage that looks like nothing
   until the next boot. */
const original = envsOf(liveSpec());
const after = r.spec ? envsOf(r.spec) : [];
const survivors = after.filter(e => e.key !== "BOOTSTRAP_ADMIN_EMAIL");
report("B every pre-existing variable survives, in order, byte for byte",
  JSON.stringify(survivors) === JSON.stringify(original),
  { original, survivors });

/* C — the other component is not collateral. */
report("C no other component is touched",
  r.spec && JSON.stringify(r.spec.static_sites) === JSON.stringify(liveSpec().static_sites),
  r.spec && r.spec.static_sites);

/* D — idempotent. The owner will run this twice, or change the address. */
let r2 = patch(r.spec, "someone.else@example.com");
const d = r2.spec ? envsOf(r2.spec).filter(e => e.key === "BOOTSTRAP_ADMIN_EMAIL") : [];
report("D a second run replaces in place rather than appending a duplicate",
  r2.status === 0 && d.length === 1 && d[0].value === "someone.else@example.com" &&
  envsOf(r2.spec).length === envsOf(r.spec).length,
  { d, count: r2.spec && envsOf(r2.spec).length });

/* E — a truncated copy is removed. This is the incident, in miniature. */
r = patch(liveSpec([{ key: "BOOTSTRAP_ADMIN_EM", value: "stale", scope: "RUN_TIME" }]));
const e = r.spec ? envsOf(r.spec) : [];
report("E a truncated copy of the name is removed, and named in the output",
  r.status === 0 &&
  !e.some(x => x.key === "BOOTSTRAP_ADMIN_EM") &&
  e.filter(x => x.key === "BOOTSTRAP_ADMIN_EMAIL").length === 1 &&
  /BOOTSTRAP_ADMIN_EM\b/.test(r.stdout),
  { keys: e.map(x => x.key), stdout: r.stdout });

/* F — an unrelated variable that merely starts with the same letters is NOT a
   truncated copy and must survive. */
r = patch(liveSpec([{ key: "BOOTSTRAP", value: "unrelated", scope: "RUN_TIME" }]));
report("F a short unrelated key is not mistaken for a truncated copy",
  r.status === 0 && r.spec && envsOf(r.spec).some(x => x.key === "BOOTSTRAP"),
  r.spec && envsOf(r.spec).map(x => x.key));

/* G — refusal, and refusal without echoing what was rejected. A malformed
   value is the likeliest to be a paste of something that is not an address at
   all, and this output is a public log. */
for (const bad of ["not-an-email", "", "  ", "a@b", "x".repeat(400) + "@y.com"]) {
  r = patch(liveSpec(), bad);
  const refused = r.status !== 0 && r.spec === null;
  const quiet = !r.stderr.includes(bad.trim()) || bad.trim() === "";
  report(`G refuses ${JSON.stringify(bad.slice(0, 20))} and does not echo it`,
    refused && quiet, { status: r.status, stderr: r.stderr.slice(0, 120) });
}

/* H — a whitespace-padded paste is normal and must work. */
r = patch(liveSpec(), "  " + EMAIL + "  ");
report("H a whitespace-padded address is trimmed, not refused",
  r.status === 0 && r.spec &&
  envsOf(r.spec).some(x => x.key === "BOOTSTRAP_ADMIN_EMAIL" && x.value === EMAIL),
  { status: r.status, stderr: r.stderr });

/* I — nothing it prints carries a whole address. */
r = patch(liveSpec());
report("I the output masks the address it wrote",
  r.stdout.includes(MASKED) && !r.stdout.includes(EMAIL),
  r.stdout);

/* J — a spec that is not the shape expected is refused rather than guessed at. */
for (const [label, spec] of [
  ["no services array", { name: "x" }],
  ["two services of the same name", {
    name: "x",
    services: [{ name: SERVICE, envs: [] }, { name: SERVICE, envs: [] }],
  }],
  ["no matching service", { name: "x", services: [{ name: "other", envs: [] }] }],
]) {
  r = patch(spec);
  report(`J refuses a spec with ${label}`, r.status !== 0 && r.spec === null,
    { status: r.status, stderr: r.stderr.slice(0, 120) });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? "FAIL" : "PASS");
process.exit(failures ? 1 : 0);
