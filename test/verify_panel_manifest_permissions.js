"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const manifestPath = path.join(ROOT, "panel", "manifest.json");
const rationalePath = path.join(ROOT, "panel", "PERMISSIONS.md");
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures++;
}

check("tracked panel manifest exists", fs.existsSync(manifestPath), manifestPath);
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const permissions = manifest.requiredPermissions || {};
  const domains = permissions.network && permissions.network.domains;
  check("network access is an explicit allowlist, never all",
    Array.isArray(domains) && domains.length > 0 && !domains.includes("all"),
    JSON.stringify(domains));
  check("the unified HNK API is in the network allowlist",
    Array.isArray(domains) && domains.includes("https://hnk-ai-tools-3-s4nnu.ondigitalocean.app"),
    JSON.stringify(domains));
  check("manifest never names the retired Supabase backend",
    !JSON.stringify(manifest).includes("vmtwuuybnalefpgvrast"), "retired host found");
}
check("sensitive UXP permissions have a tracked least-privilege rationale",
  fs.existsSync(rationalePath) && /fullAccess[\s\S]+reference|reference[\s\S]+fullAccess/i.test(fs.readFileSync(rationalePath, "utf8")),
  rationalePath);

if (failures) process.exit(1);
console.log("\nPanel manifest least-privilege contract verified.");
