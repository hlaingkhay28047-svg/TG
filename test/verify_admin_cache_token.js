/* v6.49.0 — A CHANGED ADMIN ASSET CANNOT SHIP BEHIND A STALE CACHE TOKEN.
 *
 * WHY THIS FILE EXISTS. docs/admin/index.html loads admin.css and admin.js
 * with a ?v= token. The rule was a comment: "bump both on every change".
 * 6.48.0 changed admin.js and did not bump it. Nothing failed — the markup was
 * untouched, so no browser threw — and the release's admin feature was simply
 * absent for every console that already held the old script. The teacher would
 * have reported a feature that shipped and is not there, and the deploy would
 * have said everything was fine.
 *
 * A rule that lives in a comment is a rule that gets forgotten, so the token is
 * now DERIVED: the first twelve hex of each file's SHA-256, written by
 * tools/build_admin_cache_token.js. This file is what makes that binding real —
 * it recomputes the hashes from the bytes on disk and fails if the HTML
 * disagrees, so a changed asset behind an old token cannot reach main.
 *
 * It also pins the deploy lane's half: production verifies the admin console
 * and its script byte-for-byte, the way it has verified landing and app since
 * the lane was written. Between the two, the console cannot be deployed stale
 * and cannot be cached stale.
 *
 * Usage: node test/verify_admin_cache_token.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) failures++;
}

const INDEX = read("docs/admin/index.html");
const DEPLOY = read(".github/workflows/deploy-digitalocean.yml");
const STAGING = read(".github/workflows/deploy-digitalocean-staging.yml");
const WORKFLOW = read(".github/workflows/test.yml");
const TOOL = read("tools/build_admin_cache_token.js");

/* ---- A) the token equals the file it points at ---- */
const ASSETS = ["admin.css", "admin.js"];
const wrong = [];
for (const asset of ASSETS) {
  const bytes = fs.readFileSync(path.join(ROOT, "docs/admin", asset));
  const want = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const found = INDEX.match(new RegExp(asset.replace(".", "\\.") + "\\?v=([0-9a-zA-Z]+)"));
  if (!found) wrong.push({ asset, problem: "no ?v= reference in the page" });
  else if (found[1] !== want) {
    wrong.push({ asset, inPage: found[1], fromBytes: want,
      fix: "node tools/build_admin_cache_token.js" });
  }
}
report("A) every admin asset's ?v= token is the first twelve hex of its own SHA-256",
  wrong.length === 0, wrong);

/* one reference each: a second, unbumped copy of the same URL elsewhere in the
   page would serve the stale file no matter what the first one says */
const counts = ASSETS.map(asset =>
  (INDEX.match(new RegExp(asset.replace(".", "\\.") + "\\?v=", "g")) || []).length);
report("A2) each asset is referenced exactly once, so there is one token to be right",
  counts.every(n => n === 1), { counts });
/* the old hand-bumped shape was a date like 20260908a. Any token that is not
   twelve lowercase hex is either hand-written or from a different scheme, and
   both are how this rots. */
const shapes = ASSETS.map(asset =>
  (INDEX.match(new RegExp(asset.replace(".", "\\.") + "\\?v=([0-9a-zA-Z]+)")) || [])[1]);
report("A3) no hand-written token shape survives — twelve lowercase hex, both of them",
  shapes.every(token => /^[0-9a-f]{12}$/.test(String(token))), { shapes });

/* ---- B) the tool that writes it ---- */
report("B) the tool derives the token from the bytes, writes both assets, and is idempotent",
  /crypto\.createHash\("sha256"\)/.test(TOOL) &&
  /\.digest\("hex"\)\.slice\(0, 12\)/.test(TOOL) &&
  /const ASSETS = \["admin\.css", "admin\.js"\];/.test(TOOL) &&
  /if \(html !== before\) fs\.writeFileSync\(INDEX, html\);/.test(TOOL), null);
/* it must refuse rather than guess when the page's shape is not what it expects */
report("B2) the tool fails loudly if an asset is not referenced exactly once",
  /if \(found\.length !== 1\) \{/.test(TOOL) && /process\.exit\(1\)/.test(TOOL), null);

/* ---- C) the deploy verifies the admin console itself ---- */
report("C) production verifies the admin page and its script byte-for-byte, beside landing and app",
  /EXPECTED_ADMIN_SHA="\$\(sha256sum docs\/admin\/index\.html \| awk '\{print \$1\}'\)"/.test(DEPLOY) &&
  /EXPECTED_ADMIN_JS_SHA="\$\(sha256sum docs\/admin\/admin\.js \| awk '\{print \$1\}'\)"/.test(DEPLOY), null);
report("C2) it fetches them from the live host, with caching defeated like every other probe",
  /ADMIN_URL="https:\/\/\$\{DO_APP_HOST\}\/admin\/\?sha=\$\{GITHUB_SHA\}/.test(DEPLOY) &&
  /ADMIN_JS_URL="https:\/\/\$\{DO_APP_HOST\}\/admin\/admin\.js\?sha=\$\{GITHUB_SHA\}/.test(DEPLOY) &&
  (DEPLOY.match(/-H 'Cache-Control: no-cache' "\$ADMIN(_JS)?_URL"/g) || []).length === 2, null);
/* the success gate is the one that matters: a lane that fetches the page and
   then does not compare it would be theatre */
const gate = DEPLOY.slice(DEPLOY.indexOf("SOURCE_SHA_MATCH=\"true\" ]; then"));
report("C3) both admin digests are in the gate that decides the deploy passed, and in the failure line",
  /\[ "\$ACTUAL_ADMIN_SHA" = "\$EXPECTED_ADMIN_SHA" \]/.test(DEPLOY) &&
  /\[ "\$ACTUAL_ADMIN_JS_SHA" = "\$EXPECTED_ADMIN_JS_SHA" \]/.test(DEPLOY) &&
  (DEPLOY.match(/\[ "\$ACTUAL_ADMIN_SHA" = "\$EXPECTED_ADMIN_SHA" \]/g) || []).length === 2 &&
  /admin='\$\{ACTUAL_ADMIN_SHA:-unavailable\}'/.test(DEPLOY) &&
  /adminjs='\$\{ACTUAL_ADMIN_JS_SHA:-unavailable\}'/.test(DEPLOY), null);
report("C4) the success line says the admin console was verified, so the log is not misleading",
  /exact landing, app and admin console/.test(DEPLOY), null);
/* a check that only production runs is a check that first fails on production.
   Staging is the rehearsal host: it carries the identical pair so a stale or
   missing console is caught where a failure costs nothing. */
report("C5) staging verifies the same two files, gates on them, and keeps its own temp names",
  /EXPECTED_ADMIN_SHA="\$\(sha256sum docs\/admin\/index\.html \| awk '\{print \$1\}'\)"/.test(STAGING) &&
  /EXPECTED_ADMIN_JS_SHA="\$\(sha256sum docs\/admin\/admin\.js \| awk '\{print \$1\}'\)"/.test(STAGING) &&
  (STAGING.match(/\[ "\$ACTUAL_ADMIN_SHA" = "\$EXPECTED_ADMIN_SHA" \]/g) || []).length === 2 &&
  (STAGING.match(/\[ "\$ACTUAL_ADMIN_JS_SHA" = "\$EXPECTED_ADMIN_JS_SHA" \]/g) || []).length === 2 &&
  /exact landing, app and admin console/.test(STAGING) &&
  /ADMIN_FILE="\$RUNNER_TEMP\/staging-admin-index\.html"/.test(STAGING), null);

/* ---- D) CI ---- */
report("D) CI runs this test", WORKFLOW.indexOf("verify_admin_cache_token.js") >= 0, null);
/* the deploy half is also pinned by the file that owns the deploy contract, and
   that file is the one CLAUDE.md says to run after any workflow change; if it
   ever stops covering the console, this line says so here too. */
report("D2) the deploy-contract test covers the admin console as well",
  read("test/verify_digitalocean_deploy.js").indexOf("sha256sum docs/admin/admin.js") >= 0, null);

console.log(failures
  ? "\nFAIL (" + failures + ")"
  : "\nPASS — the admin cache token is the file itself, and production verifies the console it serves");
process.exit(failures ? 1 : 0);
