/* v6.53.0 — the panel's text-to-image shelf IS the web app's.
 *
 * WHY THIS FILE EXISTS. The panel's Text to Image page offers the app's own
 * 49 models. Retyping that table is how the two surfaces drift, and inventing
 * an endpoint is forbidden outright — a RunningHub apiPath that does not
 * exist fails at the student's machine, not here. So the table is EXTRACTED
 * from docs/app/index.html by tools/build_panel_t2i_models.js, and this test
 * re-runs that extraction and requires the committed file to match it.
 *
 * It also proves the two halves agree: every model the shelf offers has an
 * endpoint in the panel's own provider config, and that endpoint is the one
 * the app uses. A picker entry the panel cannot actually run is worse than
 * one it does not offer.
 *
 * Usage: node test/verify_panel_t2i_catalog.js */
"use strict";
const fs = require("fs");
const path = require("path");
const gen = require("../tools/build_panel_t2i_models.js");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

report("the lifted catalog is committed", fs.existsSync(gen.OUT), gen.OUT);
if (!fs.existsSync(gen.OUT)) {
  console.log("\n1 FAILURE — build it with: node tools/build_panel_t2i_models.js");
  process.exit(1);
}

const stored = fs.readFileSync(gen.OUT, "utf8");
const live = gen.generate();
report("the catalog is byte-for-byte what the app's table produces today",
  stored === live.text,
  (function () {
    for (let i = 0; i < Math.max(stored.length, live.text.length); i++) {
      if (stored[i] !== live.text[i]) {
        return "first difference at " + i + ": stored " + JSON.stringify(stored.slice(i, i + 60)) +
          " vs live " + JSON.stringify(live.text.slice(i, i + 60));
      }
    }
    return "";
  })());

const models = require(gen.OUT);
report("the shelf carries every model the app offers, in the app's order",
  Array.isArray(models) && models.length === live.models.length &&
  models.every((m, i) => m.id === live.models[i].id && m.label === live.models[i].label),
  (models || []).length + " stored vs " + live.models.length + " live");

report("every model names an endpoint", models.every(m => m.apiPath && m.apiPath.indexOf("/") > 0),
  models.filter(m => !m.apiPath).map(m => m.id).join(", "));

/* the provider config is where a request body is actually built; a picker
   entry with no config entry would fail at the student's machine */
const cfg = fs.readFileSync(path.join(ROOT, "panel/src/providers/runninghub-config.js"), "utf8");
const byId = new Map(), byPath = new Map();
const re = /"([a-z0-9-]+)":\s*\{\s*apiPath:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(cfg))) { byId.set(m[1], m[2]); byPath.set(m[2], m[1]); }
const orphan = models.filter(x => !byId.has(x.id) && !byPath.has(x.apiPath));
report("every model on the shelf has an endpoint the panel can actually run",
  orphan.length === 0, orphan.map(x => x.id + " (" + x.apiPath + ")").join(", "));

const mismatched = models.filter(x => byId.has(x.id) && byId.get(x.id) !== x.apiPath);
report("no model's endpoint drifted from the app's",
  mismatched.length === 0,
  mismatched.map(x => x.id + ": app " + x.apiPath + " vs panel " + byId.get(x.id)).join("; "));

/* THE PICKER'S OWN CONTRACT, as the app states it. A model shows a ratio
   picker when it has its own list, or when the size table that drives it is
   keyed by ratio (wan-2.5's fixed sizes, wan-2.7's width/height pairs,
   qwen3's map). A model driven only by a resolution tier — the eight
   Seedream/Jimeng entries — shows none, in the app as here. What this test
   pins is that the two agree, model for model. */
const showsRatios = x => !!(x.ratios || x.sizeMap === "wan25" || x.whField || x.sizeField);
const wrong = models.filter(x => showsRatios(x) !== !!(x.ratios || x.uiRatios));
report("a ratio picker appears for exactly the models the app shows one for",
  wrong.length === 0,
  wrong.map(x => x.id + (showsRatios(x) ? " should offer ratios" : " should not")).join(", "));

console.log(failures
  ? `\n${failures} FAILURE(S) — regenerate with: node tools/build_panel_t2i_models.js`
  : "\nAll checks passed — the panel's text-to-image shelf is the app's.");
process.exit(failures ? 1 : 0);
