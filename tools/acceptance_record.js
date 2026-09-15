#!/usr/bin/env node
/* tools/acceptance_record.js — 6.94.0 / panel 6.165.0
   THE PUBLISH LEDGER: one honest line per panel release in PANEL_RELEASE_SECURITY.md.

   The "Acceptance record" section carries a paragraph for the handful of builds that were
   photographed in real Photoshop, and nothing at all for the twenty releases since v6.144.0 that
   shipped on the pins-match publish lane alone. A reader could not tell, per release, whether the
   in-Photoshop checklist ever ran. This tool keeps a ledger between two HTML-comment markers, one
   line per release, written from panel/release-manifest.json — the only facts the release session
   can honestly claim: version, date, the SHA-256 and byte size the publish lane must match, and the
   manifest's adobe_acceptance. A line marked `pending` says in words that the checklist did NOT run.
   `accepted` is refused unless the manifest carries acceptance_evidence { date, tester, host }.
   A version with its own paragraph below the ledger (`**vX.Y.Z**`) is marked "recorded below" — the
   paragraph, not the ledger, says whether that build was photographed in real Photoshop.

     node tools/acceptance_record.js             upsert the line for the manifest's version
     node tools/acceptance_record.js --backfill  also add a line for every older manifest git knows (>= 6.102.0)
     node tools/acceptance_record.js --check     exit 1 unless the manifest version has a line whose facts agree

   Idempotent: a second run changes nothing. Run it after every version bump AND after the CCX pin
   (the SHA-256 is unknown before the build; the line says so until then, and --check refuses it once
   the manifest knows the hash). test/verify_release_contract.js runs --check. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DOC = path.join(ROOT, "PANEL_RELEASE_SECURITY.md");
const MANIFEST = path.join(ROOT, "panel", "release-manifest.json");
const START = "<!-- publish-ledger:start -->";
const END = "<!-- publish-ledger:end -->";
const FIRST_RECORDED = "6.102.0";   /* the first entry of the acceptance record — the owner's go-ahead */
const STATUSES = ["pending", "accepted"];

const semver = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function readManifest(text, where) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error(where + ": not JSON — " + e.message); }
  if (!/^\d+\.\d+\.\d+$/.test(String(d.version || ""))) throw new Error(where + ": no version");
  if (STATUSES.indexOf(d.adobe_acceptance) < 0) throw new Error(where + ": adobe_acceptance must be one of " + STATUSES.join(" | ") + ", got " + JSON.stringify(d.adobe_acceptance));
  if (d.adobe_acceptance === "accepted") {
    const ev = d.acceptance_evidence || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ev.date || "")) || !String(ev.tester || "").trim() || !String(ev.host || "").trim())
      throw new Error(where + ": adobe_acceptance \"accepted\" needs acceptance_evidence { date: YYYY-MM-DD, tester, host } — the record is kept honest");
  }
  return d;
}

/* the ledger line for one manifest — every fact from the manifest, the words fixed */
function ledgerLine(d, recorded) {
  const sha = /^[0-9a-f]{64}$/.test(String(d.sha256 || "")) ? "SHA-256 `" + d.sha256.slice(0, 12) + "…`" : "SHA-256 pending build";
  const bytes = d.bytes > 0 ? thousands(d.bytes) + " bytes" : "size pending build";
  let tail;
  if (d.adobe_acceptance === "accepted") {
    const ev = d.acceptance_evidence;
    tail = "adobe_acceptance **accepted** — in-Photoshop checklist passed " + ev.date + " by " + String(ev.tester).trim() + " on " + String(ev.host).trim();
  } else {
    tail = "adobe_acceptance **pending** — no in-Photoshop checklist on this build; published only if a panel-release run matched this SHA-256 byte for byte";
  }
  return "- v" + d.version + " · " + (d.released || "date pending") + " · " + sha + " · " + bytes + " · " + tail + (recorded ? " · recorded below (see the **v" + d.version + "** paragraph)" : "");
}
const LINE_RE = /^- v(\d+\.\d+\.\d+) · /;

function parseLedger(doc) {
  const i = doc.indexOf(START), j = doc.indexOf(END);
  if (i < 0 || j < 0 || j < i) throw new Error("PANEL_RELEASE_SECURITY.md has no publish ledger markers (" + START + " … " + END + ")");
  const inner = doc.slice(i + START.length, j);
  const lines = inner.split("\n").filter((l) => l.trim());
  const map = new Map();
  lines.forEach((l) => { const m = l.match(LINE_RE); if (!m) throw new Error("ledger line without a version: " + l.slice(0, 80)); map.set(m[1], l); });
  return { head: doc.slice(0, i + START.length), tail: doc.slice(j), map };
}
function writeLedger(parts) {
  const versions = [...parts.map.keys()].sort((a, b) => cmp(b, a));   /* newest first */
  return parts.head + "\n" + versions.map((v) => parts.map.get(v)).join("\n") + "\n" + parts.tail;
}
/* a version is "recorded below" when the acceptance record under the ledger opens a paragraph for it */
function hasParagraph(doc, version) {
  const j = doc.indexOf(END);
  return new RegExp("\\n- \\*\\*v" + version.replace(/\./g, "\\.") + "\\*\\*").test(doc.slice(j));
}

function gitManifests() {
  let hashes = [];
  try { hashes = execFileSync("git", ["log", "--format=%H", "--", "panel/release-manifest.json"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { throw new Error("--backfill needs git history: " + e.message); }
  const seen = new Map();
  hashes.forEach((h) => {   /* newest first: the first manifest seen for a version is its final, pinned one */
    let d;
    try { d = JSON.parse(execFileSync("git", ["show", h + ":panel/release-manifest.json"], { cwd: ROOT, encoding: "utf8" })); } catch (e) { return; }
    if (!d || !/^\d+\.\d+\.\d+$/.test(String(d.version || "")) || seen.has(d.version)) return;
    if (cmp(d.version, FIRST_RECORDED) < 0) return;
    if (STATUSES.indexOf(d.adobe_acceptance) < 0) d.adobe_acceptance = "pending";   /* older manifests spelled nothing else */
    seen.set(d.version, d);
  });
  return seen;
}

function main(argv) {
  const check = argv.indexOf("--check") >= 0, backfill = argv.indexOf("--backfill") >= 0;
  const doc = fs.readFileSync(DOC, "utf8");
  const current = readManifest(fs.readFileSync(MANIFEST, "utf8"), "panel/release-manifest.json");
  const parts = parseLedger(doc);
  const want = ledgerLine(current, hasParagraph(doc, current.version));
  if (check) {
    const have = parts.map.get(current.version);
    if (!have) { console.error("LEDGER MISSING: no line for v" + current.version + " — run node tools/acceptance_record.js"); return 1; }
    if (have !== want) { console.error("LEDGER STALE for v" + current.version + "\n  have: " + have + "\n  want: " + want + "\n  run node tools/acceptance_record.js"); return 1; }
    console.log("publish ledger ok: v" + current.version + " · " + current.adobe_acceptance + " · " + parts.map.size + " lines");
    return 0;
  }
  let added = 0, changed = 0;
  if (backfill) {
    gitManifests().forEach((d, v) => {
      if (v === current.version || parts.map.has(v)) return;   /* never rewrite a line that exists — the record is a record */
      parts.map.set(v, ledgerLine(d, hasParagraph(doc, v))); added++;
    });
  }
  const before = parts.map.get(current.version);
  if (before !== want) { parts.map.set(current.version, want); if (before) changed++; else added++; }
  const next = writeLedger(parts);
  if (next !== doc) fs.writeFileSync(DOC, next);
  console.log("publish ledger: v" + current.version + " " + (before === want ? "unchanged" : (before ? "updated" : "added")) + (backfill ? " · backfilled " + (added - (before === want || before ? 0 : 1)) + " older release(s)" : "") + " · " + parts.map.size + " line(s)" + (next === doc ? " · file unchanged" : ""));
  return 0;
}

if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); }
  catch (e) { console.error("acceptance_record: " + (e && e.message || e)); process.exit(1); }
}
module.exports = { ledgerLine, parseLedger, readManifest, hasParagraph, START, END, FIRST_RECORDED };
