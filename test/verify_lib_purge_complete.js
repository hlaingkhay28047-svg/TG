/* Every file replaced under its own name in /lib/ must be purged by an entry
   that is NEWER than the replacement.
 *
 * THE BUG THIS EXISTS TO PREVENT, twice observed. Everything under /lib/ is
 * served cache-first and never revalidated — deliberately, so a customer does
 * not re-download ~52MB of library thumbnails they paid mobile data for. The
 * cost is that a file REPLACED under its own name is invisible to a returning
 * device for ever. sw.js carries LIB_PURGES for exactly this, and its own
 * comment states the maintenance rule: add a tag + pattern whenever files
 * under /lib/ are replaced under their own names.
 *
 * The rule was followed for four waves and then quietly missed for three. The
 * owner opened the V→V page after 6.6.0 and saw ONE card carrying its new art
 * — vtHeadSwap, the tenth, whose filename no device had ever cached — while
 * nine cards re-shot across 6.4.0, 6.5.0 and 6.6.0 still showed pictures from
 * days earlier. Nothing was wrong with the files, the deploy or the release.
 *
 * WHY "IS IT COVERED BY A PATTERN" IS THE WRONG QUESTION, and this file's
 * whole reason for existing. Looking for what else had been missed turned up
 * two workflow cards that DO match v4.64's cards5 pattern — and are stale
 * anyway, because that entry's marker was set on every device back at v4.64
 * and can never fire again. Each entry owns its own marker and runs at most
 * once per device, so the question a guard must ask is not "does some pattern
 * match this path" but "does an entry that has not yet run on a returning
 * device match it" — which means an entry introduced into sw.js at or after
 * the commit that replaced the file.
 *
 * Icons are exempt by design: LIB_ICON_RE routes them through the
 * network-first branch precisely because they get re-arted between releases.
 *
 * Usage: node test/verify_lib_purge_complete.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SW = fs.readFileSync(path.join(ROOT, "docs", "app", "sw.js"), "utf8");
const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures.push(label);
}
const git = args => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* the worker's own two tables, evaluated rather than parsed */
const box = vm.createContext({});
vm.runInContext(SW.match(/var LIB_PURGES = \[[\s\S]*?\n\];/)[0] + "; globalThis.__P = LIB_PURGES;", box);
const PURGES = box.__P;
const ICON_RE = new RegExp(SW.match(/var LIB_ICON_RE = \/(.+?)\/;/)[1]);

check("A) the worker still carries a purge list and runs it",
  Array.isArray(PURGES) && PURGES.length > 0 && /\.then\(purgeReplacedLibArt\)/.test(SW),
  "LIB_PURGES is missing or never invoked");

check("A2) every entry owns its own marker — one tag, never shared",
  new Set(PURGES.map(p => p.tag)).size === PURGES.length,
  "two entries share a tag, so adding one would skip devices the other already visited");

/* When each tag first entered sw.js. `git log -S` finds the commit that
   introduced the string; the LAST line is the oldest, which is the one that
   added it. */
const tagAdded = new Map();
for (const p of PURGES) {
  const marker = String(p.tag).replace("./", "");
  const out = git(["log", "-S", marker, "--format=%H %ct", "--", "docs/app/sw.js"]).trim();
  const lines = out ? out.split("\n") : [];
  tagAdded.set(p.tag, lines.length ? Number(lines[lines.length - 1].split(" ")[1]) : Infinity);
}

/* Files under docs/app/lib MODIFIED in place (never added, never deleted),
   with the timestamp of the most recent such modification. */
const replaced = new Map();
const log = git(["log", "--diff-filter=M", "--name-only", "--pretty=format:@%ct", "--", "docs/app/lib"]);
let when = 0;
for (const raw of log.split("\n")) {
  const line = raw.trim();
  if (!line) continue;
  if (line.startsWith("@")) { when = Number(line.slice(1)); continue; }
  if (!replaced.has(line)) replaced.set(line, when);   /* newest first */
}

const live = [...replaced.entries()].filter(([f]) => fs.existsSync(path.join(ROOT, f)));
check("B) the audit actually found the in-place replacements to judge",
  live.length >= 10, `only ${live.length} replaced files are still on disk`);

const stale = [];
for (const [file, modifiedAt] of live) {
  const url = "/app" + file.replace(/^docs\/app/, "");
  if (ICON_RE.test(url)) continue;                     /* network-first by design */
  /* nothing fetches a README; it has no live URL in the app */
  if (/\/README\.txt$/i.test(url)) continue;
  const covers = PURGES.filter(p => p.re.test(url) && tagAdded.get(p.tag) >= modifiedAt);
  if (!covers.length) {
    const matched = PURGES.filter(p => p.re.test(url)).map(p => p.tag);
    stale.push(`${url} replaced ${new Date(modifiedAt * 1000).toISOString().slice(0, 10)}` +
      (matched.length ? ` — only older entries match (${matched.join(", ")})` : " — no entry matches at all"));
  }
}
check("C) every file replaced under its own name is purged by an entry newer than the replacement",
  stale.length === 0, stale.slice(0, 10).join(" | "));

/* D — the precision rule the list documents: an entry must not sweep the
   whole folder when a handful of files changed, or a studio on mobile data
   re-downloads art it already has. Only the entries added from here on are
   held to it; the historical ones are what they are. */
const RECENT = PURGES.filter(p => /v6-\d/.test(p.tag));
const broad = RECENT.filter(p => {
  const src = String(p.re);
  return !/\(|\|/.test(src);          /* no alternation == a folder sweep */
});
check("D) new entries name the files they repair rather than sweeping a folder",
  broad.length === 0, broad.map(p => p.tag + " " + p.re).join(", "));

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${live.length} in-place replacements, every one reachable by a purge a returning device has not run yet.`);
process.exit(failures.length ? 1 : 0);
