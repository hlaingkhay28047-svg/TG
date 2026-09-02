/* v5.83.0 — the admin console's Content-Security-Policy is real, and the one
 * inline script it allows is the one that is actually there.
 *
 * WHY THIS FILE EXISTS. docs/admin/ is the console that lists students,
 * approves accounts and resets computers, so it is the page an attacker most
 * wants a script on. It is hardened with a strict CSP: everything from
 * 'self', no object, no base-uri, and exactly ONE inline script allowed by
 * its SHA-256 hash.
 *
 * That hash is the trap. It is a 44-character base64 string that nothing
 * recomputes, and the failure it guards is silent in the worst direction: edit
 * that inline script by one character and the browser refuses to run it, with
 * no build error, no test failure and no message on the page — the admin just
 * lands on a console whose redirect never fires. The reverse is worse: widen
 * the policy to 'unsafe-inline' to make the symptom go away and the page's
 * whole defence is gone while every other check still passes.
 *
 * So this recomputes the hash from the file's own bytes, requires the policy
 * to name it, and requires the directives that make the policy worth having
 * to still be there.
 *
 * Usage: node test/verify_admin_csp.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const ADMIN = path.join(ROOT, "docs", "admin", "index.html");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

const html = fs.readFileSync(ADMIN, "utf8");

/* ---- the policy is declared at all ---- */
/* the value is full of single quotes ('self', 'none', 'sha256-…'), so the
   attribute has to be matched on its OWN quote character, not on "either
   quote" — the first cut captured up to the first apostrophe and reported
   every directive missing. */
const metaRe = /<meta[^>]+http-equiv=(["'])Content-Security-Policy\1[^>]*content=(["'])([\s\S]*?)\2/i;
const m = metaRe.exec(html);
report("the admin console declares a Content-Security-Policy", !!m, "no CSP <meta> found");
if (!m) {
  console.log("\n1 FAILURE — docs/admin/index.html must carry a CSP <meta>.");
  process.exit(1);
}
const csp = m[3];
const directives = {};
csp.split(";").forEach(function (part) {
  const bits = part.trim().split(/\s+/);
  if (bits[0]) directives[bits[0]] = bits.slice(1);
});

/* ---- the directives that make it worth having ----
   Each is here because dropping it re-opens a specific door: a default that
   is not 'self' lets any origin serve the console's code; an inline style or
   script keyword makes every injection executable; an <object> or a <base>
   rewrites where the page's own requests go. */
const MUST = [
  ["default-src", ["'self'"]],
  ["connect-src", ["'self'"]],
  ["style-src", ["'self'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'none'"]],
  ["form-action", ["'self'"]]
];
MUST.forEach(function (pair) {
  const got = directives[pair[0]];
  report("the policy still says " + pair[0] + " " + pair[1].join(" "),
    !!got && pair[1].every(function (v) { return got.indexOf(v) >= 0; }),
    got ? got.join(" ") : "directive missing");
});

/* ---- no escape hatch ----
   'unsafe-inline' or 'unsafe-eval' anywhere in the policy would make the hash
   below decorative, and a wildcard host would make the origin lock decorative.
   Both are the fix someone reaches for when the hash stops matching, which is
   exactly the moment this test exists to catch. */
report("the policy contains no unsafe-inline / unsafe-eval escape hatch",
  !/unsafe-inline|unsafe-eval/i.test(csp), csp);
report("the policy names no wildcard host",
  !/(^|[\s;])\*([\s;]|$)|https?:\/\/\*/.test(csp), csp);

/* ---- THE HASH. Recomputed from the file's own bytes. ---- */
const scripts = [];
const sre = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let s;
while ((s = sre.exec(html))) {
  const attrs = s[1] || "";
  if (!/\bsrc\s*=/i.test(attrs)) scripts.push(s[2]);
}
report("the console carries exactly one inline script", scripts.length === 1,
  scripts.length + " inline <script> blocks — the policy allows one hash");

const declared = (directives["script-src"] || []).filter(function (v) { return v.indexOf("'sha256-") === 0; });
report("script-src pins exactly one sha256 hash", declared.length === 1, declared.join(" "));

if (scripts.length === 1 && declared.length === 1) {
  const real = "'sha256-" + crypto.createHash("sha256").update(scripts[0], "utf8").digest("base64") + "'";
  report("the pinned hash is the hash of the inline script actually in the file",
    declared[0] === real,
    "policy says " + declared[0] + " but the script hashes to " + real +
    " — the browser will refuse to run it; update the CSP meta, never add 'unsafe-inline'");
}

/* ---- the assets the policy expects to be external really are ----
   style-src 'self' with no hash means every rule has to live in admin.css; a
   <style> block added later would be blocked and the console would render
   unstyled. */
report("the console has no inline <style> block (style-src allows none)",
  !/<style[\s>]/i.test(html), "an inline <style> would be blocked by style-src 'self'");

/* ---- the cache-busting the file's own comment promises ----
   admin.js binds against this markup, so a stale copy throws before boot. The
   comment in the file tells the next editor to bump both ?v= values; this
   checks they are at least present and identical, which is the part a person
   forgets. */
const vs = [...html.matchAll(/(?:admin\.css|admin\.js)\?v=([A-Za-z0-9]+)/g)].map(function (x) { return x[1]; });
report("admin.css and admin.js are both cache-busted, with the same stamp",
  vs.length === 2 && vs[0] === vs[1], vs.join(" vs ") || "no ?v= stamps found");

console.log(failures
  ? `\n${failures} FAILURE(S) — the admin console's CSP and its one allowed inline script have parted.`
  : "\nAll checks passed — the admin console's policy is strict and its one inline script is the one it allows.");
process.exit(failures ? 1 : 0);
