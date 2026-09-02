/* verify_panel_catalog_sync — the Photoshop panel's Visual Library must BE the
   web app's Visual Library, not a stale or re-derived snapshot. The panel
   ships metadata only (the CCX carries no plates) and resolves art from the
   deployed /app/lib tree, so its data file is the app's own hnkLibWf JSON
   copied byte-for-byte — the same 1850 items, the same six collections, the
   same featured dozen, the same group order, the same search haystacks.

   Pinned contracts:
   A) panel/js/hnk_library_compact_data.js carries the app's hnkLibWf JSON
      text verbatim (tools/build_panel_lib_catalog.js regenerates it), and it
      evaluates to that very object.
   B) Every catalog item has both live plates it will be served from
      (docs/app/lib/full/<id>.jpg and docs/app/lib/ui/<id>.jpg).
   C) Every live plate is a catalog item — nothing on the site is invisible
      to the panel, in full/ or in ui/.
   D) The catalog's self-description is arithmetic, not aspiration: ids are
      unique, items == live plates, every collection count equals its real
      membership and they sum back to the item count, featured ⊂ items, and
      every plate the web app's markup names is an item.
   E) The panel hero chip advertises the item total.

   Usage: node test/verify_panel_catalog_sync.js */
"use strict";

const fs = require("fs");
const path = require("path");
const gen = require("../tools/build_panel_lib_catalog.js");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const webHtml = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const appText = gen.appLibText(webHtml);
const panelSrc = fs.readFileSync(gen.OUT, "utf8");
const panelText = gen.panelLibText(panelSrc);
check("A) panel data file carries the app's hnkLibWf JSON byte-for-byte",
  typeof panelText === "string" && panelText === appText,
  { app: appText.length, panel: panelText ? panelText.length : null,
    firstDiff: panelText ? [...appText].findIndex((ch, i) => ch !== panelText[i]) : -1 });

let data = null;
try {
  data = require(gen.OUT);
} catch (error) {
  check("A) panel data file evaluates to the library object", false, error.message);
  process.exit(1);
}
const items = Array.isArray(data && data.items) ? data.items : [];
check("A) panel data file evaluates to the library object",
  items.length > 0 && JSON.stringify(data) === JSON.stringify(JSON.parse(appText)),
  { items: items.length });

const liveFull = new Set(fs.readdirSync(path.join(ROOT, "docs/app/lib/full")));
const liveUi = new Set(fs.readdirSync(path.join(ROOT, "docs/app/lib/ui")));
const missingLive = [];
for (const item of items) {
  if (!liveFull.has(item.id + ".jpg")) missingLive.push(item.id + ":full");
  if (!liveUi.has(item.id + ".jpg")) missingLive.push(item.id + ":ui");
}
check("B) every catalog item has its live full/ and ui/ plate",
  missingLive.length === 0, missingLive.slice(0, 10));

const itemIds = new Set(items.map(item => item.id));
const orphans = [];
for (const file of liveFull) if (!itemIds.has(file.replace(/\.jpg$/, ""))) orphans.push("full/" + file);
for (const file of liveUi) if (!itemIds.has(file.replace(/\.jpg$/, ""))) orphans.push("ui/" + file);
check("C) every live plate is a catalog item",
  orphans.length === 0, orphans.slice(0, 10));

const collections = (data && data.collections) || {};
const membership = {};
for (const item of items) {
  const cs = Array.isArray(item.c) ? item.c : [item.c];
  for (const c of cs) membership[c] = (membership[c] || 0) + 1;
}
const collectionSum = Object.values(collections).reduce((a, b) => a + b, 0);
const countMismatch = Object.keys(Object.assign({}, collections, membership))
  .filter(c => collections[c] !== membership[c]);
const featured = Array.isArray(data && data.featured) ? data.featured : [];
const webIds = new Set(webHtml.match(/user-ref-\d+/g) || []);
const missingFromPanel = [...webIds].filter(id => !itemIds.has(id));
check("D) catalog totals are arithmetic",
  itemIds.size === items.length &&
  items.length === liveFull.size && items.length === liveUi.size &&
  countMismatch.length === 0 && collectionSum === items.length &&
  featured.length > 0 && featured.every(id => itemIds.has(id)) &&
  webIds.size > 0 && missingFromPanel.length === 0,
  { items: items.length, unique: itemIds.size, liveFull: liveFull.size, liveUi: liveUi.size,
    collectionSum, countMismatch, featured: featured.length, missingFromPanel: missingFromPanel.slice(0, 10) });

const panelHtml = fs.readFileSync(path.join(ROOT, "panel/index.html"), "utf8");
check("E) the panel hero chip advertises the catalog total",
  panelHtml.includes(`${items.length} Visual Library`),
  `expected "${items.length} Visual Library" in panel/index.html`);

if (failures) { console.error(`\n${failures} contract(s) failed`); process.exit(1); }
console.log("\nPASS — the panel Visual Library is the web app's Visual Library exactly");
