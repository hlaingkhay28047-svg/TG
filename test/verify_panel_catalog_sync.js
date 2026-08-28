/* verify_panel_catalog_sync — the Photoshop panel's compact visual-library
   catalog must track the live library, not a stale snapshot. The panel ships
   metadata only (the CCX stays ~0.5 MB) and resolves art from the deployed
   /app/lib tree, so a plate that exists on the site but not in the catalog
   is invisible to every panel install — exactly the 1811-era gap this test
   retires.

   Pinned contracts:
   A) Every live library file is reachable from the panel catalog: its
      basename is referenced by an item's paths, or it is an alias whose
      target is referenced.
   B) Every path the catalog references exists in the live tree it will be
      served from (full/ for originals, ui/ for previews and thumbs).
   C) The catalog's self-description is arithmetic, not aspiration:
      items == uniqueAssets, uniqueAssets + aliases == sourceRecords ==
      live file count, and collectionCounts sums back to the item count.
   D) Every plate the web app catalogs is a panel item or a recorded alias —
      the two surfaces advertise the same library.
   E) The panel hero chip advertises the sourceRecords total.

   Usage: node test/verify_panel_catalog_sync.js */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const raw = fs.readFileSync(path.join(ROOT, "panel/js/hnk_library_compact_data.js"), "utf8");
const jsonStart = raw.indexOf("{");
let data = null;
try {
  const sandbox = {};
  data = JSON.parse(raw.slice(jsonStart, raw.lastIndexOf("}") + 1));
  void sandbox;
} catch (error) {
  check("panel compact catalog parses as JSON", false, error.message);
  process.exit(1);
}
check("panel compact catalog parses as JSON", true);

const items = data.items || [];
const aliases = data.aliases || {};
const liveFull = new Set(fs.readdirSync(path.join(ROOT, "docs/app/lib/full")));
const liveUi = new Set(fs.readdirSync(path.join(ROOT, "docs/app/lib/ui")));

const referenced = new Set();
const missingLive = [];
for (const item of items) {
  const paths = item.paths || {};
  for (const key of Object.keys(paths)) {
    const base = path.basename(String(paths[key]));
    referenced.add(base);
    const pool = key === "full" ? liveFull : liveUi;
    if (!pool.has(base)) missingLive.push(`${item.id}:${key}:${base}`);
  }
}
check("B) every catalog path exists in the live library tree",
  missingLive.length === 0, missingLive.slice(0, 5));

const unreachable = [];
for (const file of liveFull) {
  if (referenced.has(file)) continue;
  const id = file.replace(/\.[a-z0-9]+$/i, "");
  const target = aliases[id];
  if (target && referenced.has(`${target}.jpg`)) continue;
  unreachable.push(file);
}
check("A) every live library file is reachable from the panel catalog",
  unreachable.length === 0, unreachable.slice(0, 10));

const collectionSum = Object.values(data.collectionCounts || {}).reduce((a, b) => a + b, 0);
check("C) catalog totals are arithmetic",
  items.length === data.uniqueAssets &&
  data.uniqueAssets + Object.keys(aliases).length === data.sourceRecords &&
  data.sourceRecords === liveFull.size &&
  collectionSum === items.length,
  { items: items.length, uniqueAssets: data.uniqueAssets, aliases: Object.keys(aliases).length,
    sourceRecords: data.sourceRecords, live: liveFull.size, collectionSum });

const webHtml = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const webIds = new Set(webHtml.match(/user-ref-\d+/g) || []);
const itemIds = new Set(items.map(item => item.id));
const missingFromPanel = [...webIds].filter(id => !itemIds.has(id) && !aliases[id]);
check("D) every web-app plate is a panel item or a recorded alias",
  webIds.size > 0 && missingFromPanel.length === 0, missingFromPanel.slice(0, 10));

const panelHtml = fs.readFileSync(path.join(ROOT, "panel/index.html"), "utf8");
check("E) the panel hero chip advertises the catalog total",
  panelHtml.includes(`${data.sourceRecords} Visual Library`),
  `expected "${data.sourceRecords} Visual Library" in panel/index.html`);

if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
console.log("\nPASS — the panel catalog tracks the live visual library exactly");
