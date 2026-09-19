/* 6.113.0 — THE BRAND MODEL CHANGED FACE, and this is the test that holds the
 * three halves of that change together.
 *
 * The owner asked for one thing and then corrected it into a much harder thing:
 * replace the studio model's face in every card picture — but in each picture
 * change HER FACE AND NOTHING ELSE. The endpoint that does the work re-renders
 * the whole frame by design, so "nothing else" was not a promise the model
 * could keep; it was measured picture by picture and 17 of 518 were refused and
 * kept their old face rather than ship a groom with a new head.
 *
 * That measurement lives in the wave. What lives HERE is everything a future
 * release can silently break:
 *
 *   A) the panel's own copies of the studio's art are the app's bytes, and the
 *      tool that copies them is idempotent. Two of those three sets had drifted
 *      a whole release before this wave found them, precisely because they were
 *      copied by hand. A hand copy is a bug waiting for a release.
 *   B) every replaced picture carries a cache token AND a purge entry, and the
 *      six new purge patterns match EXACTLY the files they claim — not one file
 *      more. /lib/ is cache-first and never revalidated, so over-matching costs
 *      a studio on mobile data a re-download of art that did not change, and
 *      under-matching leaves the old face on a phone for ever.
 *   C) drop: true does what it says in the worker itself, run in a VM: it
 *      deletes, it does NOT refill, it does NOT tell the page, and it still
 *      marks itself done. Those four together are the entry's whole contract,
 *      and three of them are omissions — the kind of behaviour that is never
 *      noticed until it costs someone 40MB.
 *
 * Usage: node test/verify_face_wave_6113.js */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const bytes = (p) => fs.readFileSync(path.join(ROOT, p));
const SW = read("docs/app/sw.js");
const APP = read("docs/app/index.html");
const RECORD = JSON.parse(read("test/fixtures/lib-replacements.json"));

const failures = [];
function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) { failures.push(label); if (detail !== undefined) console.log("      " + JSON.stringify(detail).slice(0, 700)); }
}

/* the worker's purge list, evaluated rather than parsed */
const box = vm.createContext({});
vm.runInContext(SW.match(/var LIB_PURGES = \[[\s\S]*?\n\];/)[0] + "; globalThis.__P = LIB_PURGES;", box);
const PURGES = box.__P;
const FACE = PURGES.filter((p) => /__lib-purge-v6-113-0-face-/.test(p.tag));

/* ================= A) the panel's copies of the studio's art ================= */

const SETS = [
  { app: "docs/app/lib/wf/lookchips", panel: "panel/icons/lookchips", n: 12, what: "the Retouch A look chips" },
  { app: "docs/app/lib/looks", panel: "panel/icons/looks", n: 16, what: "the Retouch B look tiles" }
];
const artOf = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

const offSets = [];
for (const s of SETS) {
  const a = artOf(s.app), b = artOf(s.panel);
  if (a.length < s.n) { offSets.push(`${s.app} holds ${a.length}, expected at least ${s.n}`); continue; }
  for (const f of a) {
    if (b.indexOf(f) < 0) { offSets.push(`${s.panel}/${f} missing`); continue; }
    if (!bytes(path.join(s.app, f)).equals(bytes(path.join(s.panel, f)))) offSets.push(`${s.panel}/${f} differs from the app's`);
  }
}
report("A1) the panel's look chips and look tiles are the app's bytes, file for file — the two sets that had silently drifted a release behind",
  offSets.length === 0, offSets.slice(0, 6));

/* the bundled Smart Workflow cards: whatever the registry names, and nothing
   the app does not ship. The registry is the single place that decides. */
const REG = read("panel/src/workflows/workflow-registry.js");
const bundled = [...new Set([...REG.matchAll(/["']icons\/cards\/([A-Za-z0-9._-]+)["']/g)].map((m) => m[1]))].sort();
const offCards = [];
for (const f of bundled) {
  const src = path.join("docs/app/lib/wf/cards5", f);
  if (!fs.existsSync(path.join(ROOT, src))) { offCards.push(`${f} is bundled but docs/app/lib/wf/cards5/${f} does not exist`); continue; }
  if (!bytes(src).equals(bytes(path.join("panel/icons/cards", f)))) offCards.push(`panel/icons/cards/${f} differs from the app's`);
}
report("A2) every Smart Workflow card the panel bundles for a no-network paint is the app's own picture, and the registry is the only place that says which",
  bundled.length >= 9 && offCards.length === 0, { bundled: bundled.length, off: offCards.slice(0, 6) });

const before = SETS.concat([{ panel: "panel/icons/cards" }]).map((s) => artOf(s.panel).map((f) => crypto.createHash("sha256").update(bytes(path.join(s.panel, f))).digest("hex")).join("")).join("");
const sync = spawnSync(process.execPath, [path.join(ROOT, "tools", "sync_panel_art.js")], { encoding: "utf8" });
const after = SETS.concat([{ panel: "panel/icons/cards" }]).map((s) => artOf(s.panel).map((f) => crypto.createHash("sha256").update(bytes(path.join(s.panel, f))).digest("hex")).join("")).join("");
report("A3) tools/sync_panel_art.js is idempotent on a built tree — it reports nothing changed and writes nothing",
  sync.status === 0 && /nothing changed/.test(sync.stdout) && before === after,
  { status: sync.status, out: (sync.stdout || sync.stderr || "").slice(-200) });

/* ================= B) the wave's 501 pictures ================= */

const LIB_REV = (() => {
  const b = vm.createContext({});
  vm.runInContext(APP.match(/var LIB_ART_REV = \{[\s\S]*?\n\};/)[0] + "; globalThis.__M = LIB_ART_REV;", b);
  return b.__M;
})();
const faceRecs = RECORD.files.filter((r) => /__lib-purge-v6-113-0-face-/.test(r.tag));

report("B1) the record holds all 501 replaced pictures under the six face tags",
  faceRecs.length === 501 && FACE.length === 6, { records: faceRecs.length, entries: FACE.length });

const noToken = faceRecs.filter((r) => !(LIB_ART_REV_KEY(r.path) in LIB_REV));
function LIB_ART_REV_KEY(p) { return p.replace(/^docs\/app\//, ""); }
report("B2) and every one of them carries a cache token — the token is what actually delivers the new face to a phone",
  noToken.length === 0, noToken.slice(0, 6).map((r) => r.path));

/* the exactness rule: each pattern matches the files it claims and NO OTHER
   file on disk under docs/app/lib. Over-matching is not harmless here — it
   charges a returning device a re-download of a picture that did not change. */
function walk(dir, out) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + e.name;
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}
const LIB_FILES = walk("docs/app/lib", []).map((p) => "/app" + p.replace(/^docs\/app/, ""));
const claimed = new Set(faceRecs.map((r) => "/app" + r.path.replace(/^docs\/app/, "")));
const over = [], under = [];
for (const e of FACE) {
  for (const url of LIB_FILES) if (e.re.test(url) && !claimed.has(url)) over.push(e.tag + " also matches " + url);
}
for (const url of claimed) if (!FACE.some((e) => e.re.test(url))) under.push(url + " is recorded but no face entry matches it");
report("B3) the six patterns match exactly the 501 files they repair and not one file more — the 17 the gate refused and every /lib/vid/vw-* card stay out",
  over.length === 0 && under.length === 0, { over: over.slice(0, 4), under: under.slice(0, 4) });

report("B4) each face entry is the LAST in the list matching its files, so it is the repair a returning device runs",
  faceRecs.every((r) => {
    const url = "/app" + r.path.replace(/^docs\/app/, "");
    const m = PURGES.filter((p) => p.re.test(url));
    return m.length && m[m.length - 1].tag === r.tag;
  }), "an older entry is listed after a face entry");

/* the seventeen refusals are a fact of this wave, and they must stay honest:
   a refused picture has no token and no face entry, so it is served unchanged */
const REFUSED = ["wf/cards5/blue-silk.jpg", "wf/cards5/editorial-caption.jpg", "wf/cards5/fairy-wings.jpg",
  "wf/cards5/look-gold-parasol.jpg", "wf/cards5/manga-panel.jpg", "wf/cards5/pr-repFamily.jpg",
  "wf/cards5/pr-roFaceSwap.jpg", "wf/cards5/studio-look-copy.jpg", "wf/cards5/wed-veil-3.jpg",
  "wf/cards5/white-balance-fix.jpg", "wf/imagine/th/background-gardenPath.jpg",
  "wf/imagine/th/colortone-midnightLaceMood.jpg", "wf/imagine/th/faceclear-lowRes.jpg",
  "wf/imagine/th/hairmakeup-softGlam.jpg", "wf/imagine/th/portrait-beach.jpg",
  "wf/imagine/th/portrait-flowerGarden.jpg", "wf/imagine/th/surface-naturalFlowers.jpg"];
const wrongRefusal = REFUSED.filter((rel) => {
  const url = "/app/lib/" + rel;
  return !fs.existsSync(path.join(ROOT, "docs/app/lib", rel)) || FACE.some((e) => e.re.test(url));
});
report("B5) the seventeen pictures the acceptance gate refused are on disk and are matched by NO face entry — they keep the old face rather than ship a wrong one",
  REFUSED.length === 17 && wrongRefusal.length === 0, wrongRefusal);

/* ================= C) drop: true, in the worker itself ================= */

report("C1) all six face entries declare drop: true, and no earlier entry does — the refill is still the default",
  FACE.every((p) => p.drop === true) && PURGES.filter((p) => p.drop === true).length === FACE.length,
  PURGES.filter((p) => p.drop === true).map((p) => p.tag));

function swBox() {
  const handlers = {}, stores = {}, log = { fetch: [], posted: [] };
  const keyOf = (r) => typeof r === "string" ? r : r.url;
  function mkCache() {
    const m = new Map();
    return {
      match: (r) => Promise.resolve(m.get(keyOf(r))),
      put: (r, res) => { m.set(keyOf(r), res); return Promise.resolve(); },
      keys: () => Promise.resolve([...m.keys()].map((u) => ({ url: u }))),
      delete: (r) => Promise.resolve(m.delete(keyOf(r))),
      add: () => Promise.resolve(), addAll: () => Promise.resolve(), _m: m
    };
  }
  const caches = {
    open: (n) => Promise.resolve(stores[n] || (stores[n] = mkCache())),
    keys: () => Promise.resolve(Object.keys(stores)),
    delete: (n) => { const had = !!stores[n]; delete stores[n]; return Promise.resolve(had); },
    match: () => Promise.resolve(undefined)
  };
  const self = {
    addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: () => {},
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve([{ postMessage: (m) => log.posted.push(m) }])
    },
    location: { origin: "https://hnkaistudio.com" }
  };
  const ctx = {
    self, caches, location: self.location, URL, Promise, console, setTimeout, clearTimeout,
    fetch: (r) => { log.fetch.push(keyOf(r)); return Promise.resolve({ ok: true, status: 200, url: keyOf(r), clone() { return this; } }); },
    Response: class { constructor(b, i) { this.body = b; this.status = (i && i.status) || 200; this.ok = this.status < 400; } clone() { return this; } },
    Request: class { constructor(u, i) { this.url = u; this.method = "GET"; this.cache = i && i.cache; } }
  };
  ctx.globalThis = ctx; ctx.self.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(SW, ctx, { filename: "sw.js" });
  return { handlers, stores, log, caches, ctx };
}

/* One url from a drop set and one from a refill set, both in the cache as a
   returning device would hold them: no token, the bytes from before the wave.

   The drop url is CHOSEN rather than written down, and it has to be: several
   older entries are folder sweeps over cards5, and on a real device their
   markers were spent years of releases ago while in a fresh VM every entry
   runs. A url matched by exactly one entry — the face entry — is the only one
   that measures the drop branch instead of an older refill racing it. */
const ORIGIN = "https://hnkaistudio.com";
const soleFace = faceRecs
  .map((r) => ORIGIN + "/app" + r.path.replace(/^docs\/app/, ""))
  .find((u) => PURGES.filter((p) => p.re.test(new URL(u).pathname)).length === 1);
const DROP_URL = soleFace;
const KEEP_URL = ORIGIN + "/app/lib/st-sample.jpg";   /* v4.73, a refill entry */
report("C1b) at least one replaced picture is matched by the face entry alone, so the drop branch can be measured without an older sweep racing it",
  !!DROP_URL, { candidates: 0 });

(async function () {
  const b = swBox();
  const lib = await b.caches.open("hnk-lib-v1");
  await lib.put(DROP_URL, { ok: true, clone() { return this; } });
  await lib.put(KEEP_URL, { ok: true, clone() { return this; } });
  const ev = { waitUntil: (p) => { ev._p = p; } };
  b.handlers.activate(ev);
  await ev._p;
  await new Promise((r) => setTimeout(r, 20));

  const stillThere = await lib.match(DROP_URL);
  report("C2) a drop entry deletes the stale picture from the library cache",
    !stillThere, { present: !!stillThere });

  report("C3) and does NOT refetch it — the page asks for the new ?v= url instead, so refilling the old one would spend a phone's data for nothing",
    b.log.fetch.indexOf(DROP_URL) < 0, { fetched: b.log.fetch.slice(0, 6) });

  report("C4) the refill entries are untouched by the change — st-sample.jpg is still deleted AND refetched with cache:\"reload\"",
    b.log.fetch.indexOf(KEEP_URL) >= 0, { fetched: b.log.fetch.slice(0, 6) });

  const urls = b.log.posted.filter((m) => m && m.type === "hnk-lib-purged").reduce((a, m) => a.concat(m.urls || []), []);
  report("C5) the page is told about the refilled url and NOT about the dropped one — a repaint would bust a card that is already correct on screen",
    urls.indexOf(KEEP_URL) >= 0 && urls.indexOf(DROP_URL) < 0, { urls: urls.slice(0, 6) });

  const marked = await lib.match(FACE[0].tag);
  report("C6) a drop entry still marks itself done, so it runs once per device and never again",
    !!marked, { tag: FACE[0].tag });

  /* fault injection: strip the drop flag and the same run must refill and
     report — proof that C3 and C5 are reading the flag, not an accident */
  const noDrop = swBox();
  const patched = SW.replace(/if \(p\.drop\) return;/, "if (false) return;");
  const ctx2 = noDrop.ctx;
  vm.runInContext(patched.match(/function purgeReplacedLibArt\(\)[\s\S]*?\n\}/)[0] + "; globalThis.__purge = purgeReplacedLibArt;", ctx2);
  const lib2 = await noDrop.caches.open("hnk-lib-v1");
  await lib2.put(DROP_URL, { ok: true, clone() { return this; } });
  await ctx2.__purge();
  await new Promise((r) => setTimeout(r, 20));
  const urls2 = noDrop.log.posted.filter((m) => m && m.type === "hnk-lib-purged").reduce((a, m) => a.concat(m.urls || []), []);
  report("C7) fault injection — with the drop branch removed the SAME worker refetches the old url and reports it, so C3 and C5 measure the flag",
    noDrop.log.fetch.indexOf(DROP_URL) >= 0 && urls2.indexOf(DROP_URL) >= 0,
    { fetched: noDrop.log.fetch.slice(0, 4), posted: urls2.slice(0, 4) });

  console.log(failures.length
    ? `\n${failures.length} check(s) failed`
    : `\nAll checks passed — 501 pictures on the new face, ${FACE.length} drop entries, the panel's copies byte-identical.`);
  process.exit(failures.length ? 1 : 0);
})();
