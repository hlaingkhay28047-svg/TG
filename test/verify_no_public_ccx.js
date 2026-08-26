"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
let failures = 0;

function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures++;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function gitFiles(...pathspecs) {
  const output = execFileSync("git", ["ls-files", "--", ...pathspecs], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output.trim().split(/\r?\n/).filter(Boolean);
}

/* A public repository has no private directory. This is deliberately based on
   Git's index rather than fs.existsSync(): an ignored local CCX is allowed, but
   a committed CCX (including a Git LFS pointer) is a publication failure. */
const trackedArchives = gitFiles("*.ccx");
const trackedPackageTemps = gitFiles(
  "server/private/zi*",
  "server/private/*.ccx.tmp.*",
  "panel/.package-*",
);

const published = walk(DOCS);
const publicArchives = published.filter(file => file.toLowerCase().endsWith(".ccx"));
const publicReferences = published
  .filter(file => /\.(?:html?|js|mjs|json|xml|txt|md|css)$/i.test(file))
  .flatMap(file => {
    const source = fs.readFileSync(file, "utf8");
    /* Match a URL/path or a versioned release filename, not an ordinary member
       access such as `permissions.ccx`. */
    return [...source.matchAll(/(?:https?:\/\/[^\s"'<>]+|(?:\.\.?\/|\/)[^\s"'<>]+|HNK_Ai_Panel_v\d+\.\d+\.\d+)\.ccx(?:[?#][^\s"'<>]*)?/gi)]
      .map(match => `${path.relative(ROOT, file)}: ${match[0]}`);
  });

check("the public Git index tracks no CCX artifact",
  trackedArchives.length === 0,
  trackedArchives.join(", ") || "none");
check("the public Git index tracks no package scratch file",
  trackedPackageTemps.length === 0,
  trackedPackageTemps.join(", ") || "none");
check("the static site publishes no CCX artifact",
  publicArchives.length === 0,
  publicArchives.map(file => path.relative(ROOT, file)).join(", ") || "none");
check("no static document contains a permanent CCX URL",
  publicReferences.length === 0,
  publicReferences.join("; ") || "none");

if (failures) process.exit(1);
console.log("\nPrivate CCX repository boundary verified.");
