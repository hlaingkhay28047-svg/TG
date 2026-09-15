"use strict";
/* test/lib/dead-lookups.js — v6.90.0
   The static "this control does not exist" finder.

   6.89.0's free-identifier scan found a Pipeline Chain Builder whose card had
   left panel/index.html in 6.51.0 while its code stayed. This is the same
   question one level up: every element id a script LOOKS UP by literal —
   $("id"), $$("id"), getElementById("id"), and the ids handed to the
   binders that look them up (bindToggle, bindCard, buildObjChips,
   paintChecks, bindChips) — must exist in the page's HTML or be CREATED by
   the scripts (id="…" in markup or template strings, id: "…", .id = "…", or
   a creator function that builds an element from its first argument). A
   lookup that can never resolve is a control that no longer exists, and the
   code behind it is dead — or, as with the Learn Mode switch, a control that
   was never rebuilt and quietly locked a setting at its default.

   Dictionary keys get the same treatment in both directions: a key the code
   reads must exist in every full language, and a key no code reads is dead
   weight (the panel's dictionaries carried 408 of 636 keys nothing read).

   scanIds({ html, sources, creators, computed }) → { dead: [{ id, sites }], created, htmlIds }
   scanDictionary({ dictSrc, readers, langs }) → { missing: [{key, langs}], unread: [key] } */

const LOOKUP_RE = /(?<![\w$.])(?:\$\$?|getElementById|byId)\(\s*"([A-Za-z0-9_-]+)"\s*\)/g;
const BINDERS = {
  bindToggle: [0], bindCard: [0, 1], buildObjChips: [0], bindChips: [0], bindSlider: [0], bindSel: [0], bindCheck: [0],
  bindNum: [0], bindText: [0], bindRange: [0], mkChips: [0], buildChips: [0]
};

function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")); }

/* every literal id a source looks up, with line numbers and the enclosing top-level function */
function lookups(src) {
  const s = stripComments(src); const out = []; const lines = s.split("\n"); let fn = "(top)";
  lines.forEach((ln, i) => {
    const m = ln.match(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/); if (m) fn = m[1];
    let mm; const r = new RegExp(LOOKUP_RE.source, "g");
    while ((mm = r.exec(ln))) out.push({ id: mm[1], line: i + 1, fn, via: "$" });
    for (const b of Object.keys(BINDERS)) {
      const rb = new RegExp("\\b" + b + "\\(([^;\\n]*)", "g"); let mb;
      while ((mb = rb.exec(ln))) {
        const args = mb[1];
        /* paintChecks([["id", "field"], …]) hands a list of pairs; the others take ids as leading string args */
        if (b === "paintChecks") { let mp; const rp = /\[\s*"([A-Za-z0-9_-]+)"\s*,/g; while ((mp = rp.exec(args))) out.push({ id: mp[1], line: i + 1, fn, via: b }); }
        else {
          const strs = [...args.matchAll(/^\s*"([A-Za-z0-9_-]+)"|,\s*"([A-Za-z0-9_-]+)"/g)].map(x => x[1] || x[2]);
          for (const k of BINDERS[b]) if (strs[k]) out.push({ id: strs[k], line: i + 1, fn, via: b });
        }
      }
    }
    /* paintChecks pairs */
    let mp; const rp = /paintChecks\(\s*\[\s*((?:\[\s*"[A-Za-z0-9_-]+"\s*,\s*"[^"]*"\s*\]\s*,?\s*)+)\]/g;
    while ((mp = rp.exec(ln))) { let q; const rq = /\[\s*"([A-Za-z0-9_-]+)"/g; while ((q = rq.exec(mp[1]))) out.push({ id: q[1], line: i + 1, fn, via: "paintChecks" }); }
  });
  return out;
}

/* ids the sources create: markup / template strings, object keys, property writes, creator builders */
function creations(sources, creators) {
  const out = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/\bid\s*[:=]\s*"([A-Za-z0-9_-]+)"/g)) out.add(m[1]);
    for (const m of src.matchAll(/\.id\s*=\s*"([A-Za-z0-9_-]+)"/g)) out.add(m[1]);
    for (const c of creators || []) for (const m of src.matchAll(new RegExp("\\b" + c + "\\(\\s*\"([A-Za-z0-9_-]+)\"", "g"))) out.add(m[1]);
  }
  return out;
}

function htmlIds(html) { return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])); }

/* opts: { html, sources: [{name, code}], creators: [names], computed: (id, ids) => bool } */
function scanIds(opts) {
  const ids = htmlIds(opts.html || "");
  const created = creations(opts.sources.map(s => s.code), opts.creators);
  const dead = {};
  for (const src of opts.sources) {
    for (const l of lookups(src.code)) {
      const id = l.id;
      if (ids.has(id) || created.has(id)) continue;
      if (opts.computed && opts.computed(id, ids, created)) continue;
      (dead[id] = dead[id] || []).push({ file: src.name, line: l.line, fn: l.fn, via: l.via });
    }
  }
  return { dead: Object.keys(dead).sort().map(id => ({ id, sites: dead[id] })), created, htmlIds: ids };
}

/* The nine-language dictionary: `const I18N = { en: {…}, my: {…}, … };` with one `    key: "…",` per line.
   readers: text where a key may be read (code outside the block, HTML, sibling modules). */
function scanDictionary(opts) {
  const lines = opts.dictSrc.split("\n");
  const langs = opts.langs; const per = {}; let cur = null;
  for (const ln of lines) {
    const ml = ln.match(/^  ([a-z]{2,3}): \{$/); if (ml) { cur = ml[1]; per[cur] = per[cur] || new Set(); continue; }
    if (/^  \},?$/.test(ln)) { cur = null; continue; }
    const mk = ln.match(/^    ([a-z][a-z0-9_]*): /); if (mk && cur) per[cur].add(mk[1]);
  }
  const all = new Set(); for (const l of langs) for (const k of per[l] || []) all.add(k);
  const hay = opts.readers;
  const missing = [], unread = [];
  const readKeys = new Set([...hay.matchAll(/["']([a-z][a-z0-9_]*)["']/g)].map(m => m[1]));
  const attrKeys = new Set([...hay.matchAll(/data-i18n(?:-[a-z]+)?="([a-z][a-z0-9_]*)"/g)].map(m => m[1]));
  const dotKeys = new Set([...hay.matchAll(/\.([a-z][a-z0-9_]*)\b/g)].map(m => m[1]));
  /* a key built by concatenation — "rh_err_" + code, "wf_exp_" + id — is read by every key
     that carries the prefix; the literal never appears, so the prefix is the evidence
     (v6.161.0: six refusal lines and nine workflow explanations were dropped as unread
     before this rule existed) */
  const prefixes = [...new Set([...hay.matchAll(/["']([a-z][a-z0-9_]*_)["']\s*\+/g)].map(m => m[1]))].sort();
  const byPrefix = (k) => prefixes.some(p => k.length > p.length && k.slice(0, p.length) === p);
  for (const k of [...all].sort()) {
    const absent = langs.filter(l => !(per[l] && per[l].has(k)));
    if (absent.length) missing.push({ key: k, langs: absent });
    if (!readKeys.has(k) && !attrKeys.has(k) && !dotKeys.has(k) && !byPrefix(k)) unread.push(k);
  }
  /* keys the code reads by literal through t("…") that no language carries */
  const readOnly = [...hay.matchAll(/\bt\(\s*"([a-z][a-z0-9_]*)"\s*\)/g)].map(m => m[1]).filter(k => !all.has(k));
  return { per, missing, unread, readButUndefined: [...new Set(readOnly)].sort(), prefixes };
}

module.exports = { lookups, creations, htmlIds, scanIds, scanDictionary, stripComments, BINDERS };
