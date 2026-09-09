/* v6.49.0 — THE ADMIN CACHE TOKEN IS THE FILE'S OWN CONTENT.
 *
 * docs/admin/index.html loads its stylesheet and script with a ?v= token, and
 * the file's own comment said to bump it by hand on every admin.css/admin.js
 * change. 6.48.0 changed admin.js and did not: the markup was unchanged so
 * nothing threw, and the release's admin feature simply was not there for any
 * browser that already held the old script. A rule that depends on remembering
 * is a rule that will be forgotten again.
 *
 * So the token IS the content now: the first twelve hex of the file's SHA-256.
 * Change the file and the URL changes with it; change nothing and the URL is
 * byte-identical, so this tool is a no-op and safe to run at any time.
 * test/verify_admin_cache_token.js asserts the same thing in CI, which is what
 * makes it impossible to merge a changed admin.js behind a stale token.
 *
 * Usage: node tools/build_admin_cache_token.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ADMIN = path.join(__dirname, "..", "docs", "admin");
const INDEX = path.join(ADMIN, "index.html");
const ASSETS = ["admin.css", "admin.js"];

function token(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ADMIN, file))).digest("hex").slice(0, 12);
}

let html = fs.readFileSync(INDEX, "utf8");
const before = html;
const written = [];
for (const asset of ASSETS) {
  const want = token(asset);
  /* the asset is referenced exactly once, with a token; anything else is a
     shape this tool must not guess at */
  const pattern = new RegExp(asset.replace(".", "\\.") + "\\?v=[0-9a-zA-Z]+", "g");
  const found = html.match(pattern) || [];
  if (found.length !== 1) {
    console.error("FAIL — expected exactly one " + asset + "?v= reference, found " + found.length);
    process.exit(1);
  }
  html = html.replace(pattern, asset + "?v=" + want);
  written.push(asset + "?v=" + want);
}
if (html !== before) fs.writeFileSync(INDEX, html);
console.log((html === before ? "unchanged: " : "updated:   ") + written.join("  "));
