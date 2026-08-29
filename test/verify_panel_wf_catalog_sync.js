/* v6.27.0 — the panel's Smart Workflow catalog tracks the web app EXACTLY.
 *
 * WHY THIS FILE EXISTS. The owner's requirement is one catalog, everywhere:
 * the 131 workflows the web app composes for its Workflows page (core
 * definitions + preset/cleanup/wedding-derived one-taps, prompts included)
 * must be the same 131 the CCX shows and runs. The panel carries them in a
 * GENERATED data file; the only way that file rots is silently — the app
 * gains, renames or reworks a workflow and the panel keeps serving the old
 * text. So this test re-extracts the app's own composed catalog
 * (window.HNK_WF_CATALOG, the exact object its grid renders from) and
 * requires the panel data file to match id-for-id, prompt-for-prompt.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_panel_wf_catalog_sync.js */
"use strict";
const path = require("path");
const { extract } = require("../tools/build_panel_wf_catalog.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

(async () => {
  const live = await extract();
  const stored = require(path.join(__dirname, "..", "panel", "js", "hnk_wf_catalog_data.js"));

  report("the app composes a non-trivial catalog (100+ workflows)",
    live.total >= 100, live.total);
  report("panel data file carries the same totals",
    stored && stored.total === live.total && stored.categories.length === live.categories.length,
    JSON.stringify({ stored: stored && stored.total, live: live.total }));

  const flat = c => c.categories.flatMap(cat => cat.items.map(w => ({ ...w, category: cat.category })));
  const liveBy = {}, storedBy = {};
  flat(live).forEach(w => { liveBy[w.id] = w; });
  flat(stored).forEach(w => { storedBy[w.id] = w; });

  const missing = Object.keys(liveBy).filter(id => !storedBy[id]);
  const extra = Object.keys(storedBy).filter(id => !liveBy[id]);
  report("no app workflow is missing from the panel", missing.length === 0, missing.join(","));
  report("the panel carries no workflow the app has retired", extra.length === 0, extra.join(","));

  const drift = [];
  for (const id of Object.keys(liveBy)) {
    const a = liveBy[id], b = storedBy[id];
    if (!b) continue;
    for (const f of ["title", "summary", "prompt", "negative", "category"]) {
      if (String(a[f]) !== String(b[f])) { drift.push(id + "." + f); break; }
    }
    if (JSON.stringify(a.req) !== JSON.stringify(b.req) || JSON.stringify(a.opt) !== JSON.stringify(b.opt)) {
      drift.push(id + ".inputs");
    }
  }
  report("every workflow's title, summary, prompt, negative, category and inputs match the app",
    drift.length === 0, drift.slice(0, 12).join(","));

  console.log(failures
    ? `\n${failures} FAILURE(S) — regenerate with: node tools/build_panel_wf_catalog.js`
    : "\nThe panel workflow catalog tracks the web app exactly (" + live.total + " workflows).");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + String(e)); process.exit(1); });
