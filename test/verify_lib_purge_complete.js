/* Every file replaced under its own name in /lib/ must be purged by an entry
 * that a returning device has not run yet.
 *
 * THE BUG THIS EXISTS TO PREVENT, twice observed. Everything under /lib/ is
 * served cache-first and never revalidated — deliberately, so a customer does
 * not re-download ~52MB of thumbnails they paid mobile data for. The cost is
 * that a file REPLACED under its own name is invisible to a returning device
 * for ever. sw.js carries LIB_PURGES for exactly this, and states the rule
 * above the list: add a tag + pattern whenever files under /lib/ are replaced
 * under their own names.
 *
 * The rule was followed for four waves and then missed for three. The owner
 * opened the V→V page after 6.6.0 and saw ONE card carrying its new art —
 * vtHeadSwap, the tenth, whose filename no device had ever cached — while
 * nine cards re-shot across 6.4.0, 6.5.0 and 6.6.0 still showed pictures from
 * days earlier. Nothing was wrong with the files, the deploy or the release.
 *
 * WHY "IS IT COVERED BY A PATTERN" IS THE WRONG QUESTION. Looking for what
 * else had been missed turned up two workflow cards that DO match v4.64's
 * cards5 pattern — and are stale anyway, because that entry's marker was set
 * on every device back at v4.64 and can never fire again. Each entry owns its
 * own marker and runs at most once per device, so the question is not "does
 * some pattern match this path" but "does an entry that has not yet run on a
 * returning device match it".
 *
 * WHY A RECORDED HASH RATHER THAN GIT HISTORY. The first cut of this file
 * walked `git log` for in-place modifications. It passed locally and failed on
 * CI, which checks out at depth 1 — a guard that only works where the history
 * happens to be deep is not a guard. The shipped bytes of every replaced file
 * are recorded instead: the NEXT replacement changes the hash and fails here
 * until whoever made it adds a purge entry and updates the record. That is the
 * moment the rule needs enforcing, and it needs no history at all.
 *
 * Icons are exempt by design: LIB_ICON_RE routes them through the
 * network-first branch precisely because they get re-arted between releases.
 *
 * Usage: node test/verify_lib_purge_complete.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SW = fs.readFileSync(path.join(ROOT, "docs", "app", "sw.js"), "utf8");
const RECORD = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "fixtures", "lib-replacements.json"), "utf8"));
const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${detail}`}`);
  if (!ok) failures.push(label);
}

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

check("A3) the record names the replacements it is guarding",
  Array.isArray(RECORD.files) && RECORD.files.length >= 11,
  `the record holds ${(RECORD.files || []).length} entries`);

/* B — the shipped bytes. A replacement that skipped the purge rule lands here
   as a hash that no longer matches what was recorded. */
const drifted = [], missing = [];
for (const rec of RECORD.files) {
  const abs = path.join(ROOT, rec.path);
  if (!fs.existsSync(abs)) { missing.push(rec.path); continue; }
  const sha = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  if (sha !== rec.sha256) drifted.push(`${rec.path} is ${sha.slice(0, 12)}…, recorded ${rec.sha256.slice(0, 12)}…`);
}
check("B) every recorded file is still on disk",
  missing.length === 0, missing.join(", "));
check("B2) and still carries the bytes that were recorded with its purge entry",
  drifted.length === 0,
  drifted.slice(0, 6).join(" | ") +
  "  — a file under /lib/ was replaced under its own name. Add a NEW LIB_PURGES entry" +
  " (a new tag; an existing one has already run on every device and can never fire again)," +
  " restate it in sweep_v469_upgrades.js, then update test/fixtures/lib-replacements.json.");

/* C — each recorded file is actually reachable by the entry it names */
const unreached = [];
for (const rec of RECORD.files) {
  const url = "/app" + rec.path.replace(/^docs\/app/, "");
  if (ICON_RE.test(url)) continue;
  const entry = PURGES.find(p => p.tag === rec.tag);
  if (!entry) { unreached.push(`${rec.path} names ${rec.tag}, which is not in LIB_PURGES`); continue; }
  if (!entry.re.test(url)) unreached.push(`${rec.tag} does not match ${url}`);
}
check("C) every recorded file is matched by the entry it names",
  unreached.length === 0, unreached.slice(0, 6).join(" | "));

/* D — the precision rule the list documents: an entry must not sweep a whole
   folder when a handful of files changed, or a studio on mobile data
   re-downloads art it already has. Only entries added from here on are held
   to it; the historical ones are what they are. */
const broad = PURGES.filter(p => /v6-\d/.test(p.tag) && !/\(|\|/.test(String(p.re)));
check("D) new entries name the files they repair rather than sweeping a folder",
  broad.length === 0, broad.map(p => p.tag + " " + p.re).join(", "));

/* E — the trap that made the two workflow cards invisible: a recorded file
   whose ONLY match is an entry older than the one it names would be stale on
   every returning device. Each record must name an entry that appears AFTER
   every other entry matching that path, i.e. the newest one wins. */
const shadowed = [];
for (const rec of RECORD.files) {
  const url = "/app" + rec.path.replace(/^docs\/app/, "");
  const matching = PURGES.filter(p => p.re.test(url));
  if (!matching.length) continue;
  if (matching[matching.length - 1].tag !== rec.tag) {
    shadowed.push(`${rec.path} names ${rec.tag} but ${matching[matching.length - 1].tag} is listed after it`);
  }
}
check("E) each record names the LAST entry matching it, so the repair is the newest one",
  shadowed.length === 0, shadowed.slice(0, 6).join(" | "));

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${RECORD.files.length} in-place replacements, every one repaired by a purge a returning device has not run yet.`);
process.exit(failures.length ? 1 : 0);
