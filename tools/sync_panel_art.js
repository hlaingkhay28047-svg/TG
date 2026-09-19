#!/usr/bin/env node
"use strict";
/* Copy the studio's own art into the panel, byte for byte.

   Three sets of pictures live on both surfaces and have to be the same picture
   on both — until 6.113.0 two of them were copied by hand at release time and
   drifted silently (the face wave found panel/icons/lookchips and
   panel/icons/looks a whole release behind docs/app/lib/, and the nine bundled
   Smart Workflow cards a downscale of art that had since been replaced):

     docs/app/lib/wf/lookchips/*      -> panel/icons/lookchips/   (Retouch A look chips)
     docs/app/lib/looks/*             -> panel/icons/looks/       (Retouch B look tiles)
     docs/app/lib/wf/cards5/<named>   -> panel/icons/cards/       (the cards the panel bundles)

   The third set is not a directory copy: the panel bundles only the handful of
   Smart Workflow cards that must paint with no network (panel/src/ui/remote-art.js
   fetches the rest from the studio). Which ones those are is not written down
   twice — this tool reads the "icons/cards/<file>" visuals out of
   panel/src/workflows/workflow-registry.js, so adding or dropping a bundled card
   there is the only edit needed. A name the registry asks for that the app does
   not ship is an error, not a silent skip.

   panel/icons/imagine/ is NOT here: tools/build_panel_imagine.js copies it beside
   the module it lifts, and that is the right place for it.

   Idempotent: running it on a clean tree changes nothing (the pre-commit check
   and test/verify_panel_art_sync.js rely on that).
   Usage: node tools/sync_panel_art.js
*/
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const APP_LIB = path.join(ROOT, "docs", "app", "lib");
const ICONS = path.join(ROOT, "panel", "icons");
const REGISTRY = path.join(ROOT, "panel", "src", "workflows", "workflow-registry.js");

/* the two whole-directory sets: every picture the app ships, copied as it is */
const DIRS = [
  { src: path.join(APP_LIB, "wf", "lookchips"), dst: path.join(ICONS, "lookchips") },
  { src: path.join(APP_LIB, "looks"), dst: path.join(ICONS, "looks") }
];
const CARDS_SRC = path.join(APP_LIB, "wf", "cards5");
const CARDS_DST = path.join(ICONS, "cards");
const ART = /\.(jpe?g|png|webp)$/i;

let DRY = false;   /* sync({ dry: true }) only reports what differs — the test's drift check */
function writeIfChanged(file, buf) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (cur && cur.equals(buf)) return false;
  if (DRY) return true;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return true;
}

/* the bundled cards, named by the registry itself — visual: "icons/cards/<file>" */
function bundledCards() {
  const src = fs.readFileSync(REGISTRY, "utf8");
  const names = [];
  const re = /["']icons\/cards\/([A-Za-z0-9._-]+)["']/g;
  let m;
  while ((m = re.exec(src))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
  return names.sort();
}

function sync(opts) {
  DRY = !!(opts && opts.dry);
  const changed = [];
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
  DIRS.forEach(function (d) {
    if (!fs.existsSync(d.src)) throw new Error("sync_panel_art: missing " + rel(d.src));
    fs.readdirSync(d.src).sort().forEach(function (f) {
      const s = path.join(d.src, f);
      if (!ART.test(f) || fs.statSync(s).isDirectory()) return;
      if (writeIfChanged(path.join(d.dst, f), fs.readFileSync(s))) changed.push(rel(path.join(d.dst, f)));
    });
  });
  const cards = bundledCards();
  if (!cards.length) throw new Error("sync_panel_art: the registry names no icons/cards/ visual — did the path change?");
  cards.forEach(function (f) {
    const s = path.join(CARDS_SRC, f);
    if (!fs.existsSync(s)) throw new Error("sync_panel_art: the panel bundles " + f + " but docs/app/lib/wf/cards5/" + f + " does not exist");
    if (writeIfChanged(path.join(CARDS_DST, f), fs.readFileSync(s))) changed.push(rel(path.join(CARDS_DST, f)));
  });
  return { changed: changed, cards: cards };
}
module.exports = { sync: sync, bundledCards: bundledCards };
if (require.main === module) {
  const r = sync();
  console.log("sync_panel_art: " + r.cards.length + " bundled cards; " +
    (r.changed.length ? "wrote " + r.changed.length + " file(s): " + r.changed.slice(0, 6).join(", ") + (r.changed.length > 6 ? ", …" : "") : "nothing changed"));
}
