#!/usr/bin/env node
/* Build panel/js/hnk_wf_catalog_data.js from the web app's OWN composed
   Smart Workflow catalog (window.HNK_WF_CATALOG — every category and item
   exactly as the app's Workflows page shows them, prompts included).
   Usage: serve docs/app on PORT (default 8931), then
     node tools/build_panel_wf_catalog.js            (writes the data file)
     node tools/build_panel_wf_catalog.js --print    (JSON to stdout only) */
"use strict";
const { chromium } = require("playwright-core");
const { withPremium } = require("../test/_seed_premium.js");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;

async function extract() {
  const browser = withPremium(await chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  const cats = await page.evaluate(() => {
    const src = window.HNK_WF_CATALOG;
    if (!src) return null;
    return src.map(c => ({
      category: c.t, icon: c.ic || "",
      /* v6.51.0 — the app's list renderer also needs each group's intro line,
         which group starts open, and per-card badge / wedding sub-group */
      desc: String(c.desc || ""), open: !!c.open,
      items: c.items.map(w => ({
        id: w.id, title: w.title || "", summary: String(w.summary || ""),
        explanation: String(w.explanation || ""), prompt: String(w.prompt || ""),
        negative: String(w.negative || ""), req: (w.req || []).map(String), opt: (w.opt || []).map(String),
        fields: (w.fields || []),
        badge: String(w.badge || ""), wedGroup: String(w.wedGroup || ""), hasCard: !!w.cardImg
      }))
    }));
  });
  await browser.close();
  if (!cats) throw new Error("window.HNK_WF_CATALOG is not exposed by the served app");
  const all = cats.flatMap(c => c.items);
  const bad = all.filter(w => !w.id || !w.title || !w.prompt);
  const dupes = all.map(w => w.id).filter((id, i, a) => a.indexOf(id) !== i);
  if (bad.length) throw new Error("items missing id/title/prompt: " + bad.map(w => w.id).join(","));
  if (dupes.length) throw new Error("duplicate ids: " + dupes.join(","));
  return { total: all.length, categories: cats };
}

module.exports = { extract };

if (require.main === module) (async () => {
  const cat = await extract();
  const json = JSON.stringify(cat);
  if (process.argv.includes("--print")) { process.stdout.write(json); return; }
  const out = "/* ============================================================\n" +
    "   HNK Smart Workflow catalog — GENERATED, do not edit by hand.\n" +
    "   Source of truth: the web app's own composed catalog\n" +
    "   (window.HNK_WF_CATALOG). Regenerate with:\n" +
    "     node tools/build_panel_wf_catalog.js   (docs/app served on 8931)\n" +
    "   test/verify_panel_wf_catalog_sync.js pins this file to the app.\n" +
    "   ============================================================ */\n" +
    "(function(){\n\"use strict\";\nvar CATALOG = " + json + ";\n" +
    "if (typeof module !== \"undefined\" && module.exports) module.exports = CATALOG;\n" +
    "else { globalThis.HNK = globalThis.HNK || {}; globalThis.HNK.WF_CATALOG = CATALOG; }\n})();\n";
  fs.writeFileSync(path.join(__dirname, "..", "panel", "js", "hnk_wf_catalog_data.js"), out);
  console.log("wrote panel/js/hnk_wf_catalog_data.js — total", cat.total, "workflows in", cat.categories.length, "categories");
})().catch(e => { console.error(String(e)); process.exit(1); });
