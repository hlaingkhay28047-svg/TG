/* v6.51.0 — the panel's Retouch A / Retouch B studio IS the web app's.
 *
 * WHY THIS FILE EXISTS. The owner's requirement is one studio, everywhere:
 * every group, every slider, every chip, every label in every language, the
 * presets, the recipes, the 880-style pack and the prompt composer must be
 * the same in Photoshop as on the web. The panel carries them in a GENERATED
 * module sliced verbatim out of docs/app/index.html, so the only way it rots
 * is silently — the app gains a control or rewrites a label and the CCX keeps
 * shipping last month's studio. This test re-runs the same extraction against
 * the live app and requires the committed file to match it exactly.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_panel_studio_sync.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { generate, OUT } = require("../tools/build_panel_studio_suites.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

(async () => {
  report("the generated studio module is committed", fs.existsSync(OUT), OUT);
  if (!fs.existsSync(OUT)) { console.log("\n1 FAILURE — build it with: node tools/build_panel_studio_suites.js"); process.exit(1); }

  const stored = fs.readFileSync(OUT, "utf8");
  const live = await generate({});

  report("the panel module is byte-for-byte what the app's source produces today",
    stored === live.text, firstDiff(stored, live.text));

  /* the slices themselves: an app edit that moves a boundary must be seen */
  const storedMeta = JSON.parse(/^var META=(\{[^\n]*\});$/m.exec(stored)[1]);
  report("every slice still lands on its anchor",
    storedMeta.slices.length === live.meta.slices.length &&
    storedMeta.slices.every((s, i) => s.name === live.meta.slices[i].name && s.lines === live.meta.slices[i].lines),
    storedMeta.slices.filter((s, i) => !live.meta.slices[i] || s.lines !== live.meta.slices[i].lines).map(s => s.name).join(", "));

  const api = require(OUT);
  report("the module exposes build() plus its captured data",
    typeof api.build === "function" && api.DATA && api.DATA.counts && api.DATA.tr, Object.keys(api || {}).join(","));

  /* the studio's shape — the numbers the two pages print in their own headers */
  report("Retouch A carries the app's control count",
    api.DATA.ST_MEITU_COUNT === live.data.ST_MEITU_COUNT && api.DATA.ST_MEITU_COUNT > 100,
    api.DATA.ST_MEITU_COUNT + " vs " + live.data.ST_MEITU_COUNT);
  report("Retouch B carries the app's control count",
    api.DATA.ST_EVOTO_COUNT === live.data.ST_EVOTO_COUNT && api.DATA.ST_EVOTO_COUNT > 100,
    api.DATA.ST_EVOTO_COUNT + " vs " + live.data.ST_EVOTO_COUNT);
  report("both suites carry every group the app builds, in order",
    JSON.stringify(api.DATA.counts) === JSON.stringify(live.data.counts),
    api.DATA.counts.length + " groups stored, " + live.data.counts.length + " live");
  report("no group was captured mid-load",
    api.DATA.counts.every(c => !/…/.test(c.cnt)),
    api.DATA.counts.filter(c => /…/.test(c.cnt)).map(c => c.title).join(", "));

  /* the labels: the panel must speak every language the app speaks */
  report("the studio's t() strings cover every app language",
    api.DATA.langs.length >= 20 && api.DATA.langs.indexOf("my") >= 0 && api.DATA.langs.indexOf("en") >= 0,
    api.DATA.langs.join(","));
  const trHoles = Object.keys(api.DATA.tr).filter(k => !api.DATA.tr[k] || typeof api.DATA.tr[k].my !== "string" || typeof api.DATA.tr[k].en !== "string");
  report("every captured string resolved in every language", trHoles.length === 0, trHoles.join(","));

  /* the UXP contract: what the panel cannot run must not be in the file */
  const banned = [
    [/document\.createElement\("canvas"\)/, "canvas element"],
    [/\.getContext\(/, "canvas 2d context"],
    [/<svg\b/, "inline SVG"],
    [/type="color"/, "colour input"],
    [/new FileReader\(/, "FileReader"]
  ];
  const bodyOnly = stripAppOnly(stored);
  banned.forEach(([re, what]) => {
    const m = re.exec(bodyOnly);
    report("the panel module reaches for no " + what, !m, m && context(bodyOnly, m.index));
  });

  console.log(failures
    ? `\n${failures} FAILURE(S) — regenerate with: node tools/build_panel_studio_suites.js`
    : "\nAll checks passed — the panel's studio is the app's studio.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });

/* the `_app`-suffixed functions are the app originals the runtime layer
   shadows; they never run in Photoshop, so their browser APIs are not a
   contract breach — everything else is */
function stripAppOnly(text) {
  const lines = text.split("\n");
  const keep = [];
  let skipping = false;
  for (const l of lines) {
    const f = /^function ([\w$]+)\(/.exec(l);
    if (f) skipping = /_app$/.test(f[1]);
    keep.push(skipping ? "" : l);
  }
  return keep.join("\n");
}

function context(text, idx) {
  const start = text.lastIndexOf("\n", idx) + 1;
  const line = text.slice(0, idx).split("\n").length;
  return line + ": " + text.slice(start, text.indexOf("\n", idx)).trim().slice(0, 160);
}

function firstDiff(a, b) {
  if (a === b) return "";
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const line = a.slice(0, i).split("\n").length;
  return "first difference at line " + line + "\n  stored: " + a.slice(i, i + 120).split("\n")[0] +
    "\n  app:    " + b.slice(i, i + 120).split("\n")[0];
}
