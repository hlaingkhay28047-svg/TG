/* v4.76.0 regression sweep — the Exact-Skin plates, and the tones left out.

   The owner supplied a 30-plate skin-reference pack and asked for the dark
   tones to be left out. The pack labels its own tone ladder in every filename
   — Pale, Fair, Light, LightMedium, Medium, MediumDeep, Deep, Rich, VeryDeep —
   so the whole Deep / Rich / VeryDeep tier (plates 19-25) was skipped and the
   other 23 installed as user-ref-638..660.

   That rule uses the PACK'S declared tier rather than a measurement of the
   pixels, and the reason is worth writing down: median skin luminance ranks
   plates 09 and 10 (both labelled LightMedium) BELOW plate 22 (labelled Rich),
   because 09 and 10 are lit low-key and 22 is lit bright. Brightness conflates
   tone with exposure. The label is the more honest key.

   Pinned contracts:
   A) All 23 plates exist at both sizes, uncropped — fixed height, width
      following the source aspect, which is what every other plate does.
   B) They sit in the Exact Skin collection, which is where a skin pack
      belongs — not in Reference, where they landed on the first attempt.
   C) THE EXCLUSION HOLDS. No shipped plate title carries a Deep / Rich /
      VeryDeep tone word. This is the assertion that stops a later re-import
      of the same pack from quietly putting the skipped seven back.
   D) The collection counts are derived from the data, so the chip totals and
      the catalogue cannot drift apart.

   Usage: PORT=8931 node test/sweep_v476_skinlib.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const APP = path.join(__dirname, "..", "docs", "app");
const IDS = [];
for (let n = 638; n <= 660; n++) IDS.push("user-ref-" + n);

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcb].indexOf(m) >= 0) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xda) break;
    i += 2 + len;
  }
  return null;
}

const odd = [];
let bytes = 0;
IDS.forEach(id => {
  /* The library's convention is a FIXED HEIGHT with the width following the
     source aspect — 640 tall in full, 180 tall in ui — so a plate is never
     cropped. The first cut of this import center-cropped 2:3 sources into
     512x640 and silently cut 17% off the bottom of all 23; the makeup plates
     next door, from the same 1024x1536 shape, are 427x640. These sources are
     2:3, so 427x640 and 120x180 are the shapes that keep the whole frame. */
  [["full", 427, 640], ["ui", 120, 180]].forEach(([sub, w, h]) => {
    const p = path.join(APP, "lib", sub, id + ".jpg");
    if (!fs.existsSync(p)) { odd.push("missing " + sub + "/" + id); return; }
    bytes += fs.statSync(p).size;
    const d = jpegSize(fs.readFileSync(p));
    if (!d || d.w !== w || d.h !== h) odd.push(sub + "/" + id + "=" + (d ? d.w + "x" + d.h : "unreadable"));
  });
});
report("A) all 23 plates keep the source aspect at the library's fixed heights",
  odd.length === 0, { odd: odd.slice(0, 5), kb: Math.round(bytes / 1000) });

/* The tone words the owner asked to leave out, checked against the SHIPPED
   titles so the rule keeps holding whatever a later import contains.
   The leading [^-\w] matters: without it this also fires on "Medium-deep",
   which is a tone that was deliberately KEPT — plates 16, 17 and 18. Verified
   against the pack's own tone column: this pattern matches exactly the seven
   skipped plates and none of the twenty-three installed. */
const EXCLUDED = /(^|[^-\w])(deep|rich|espresso|cocoa)\b/i;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const out = await page.evaluate((ids) => {
    const byId = {}; LW.items.forEach(i => byId[i.id] = i);
    const mine = ids.map(id => byId[id]).filter(Boolean);
    const derived = {};
    LW.items.forEach(i => {
      (Array.isArray(i.c) ? i.c : [i.c]).forEach(c => derived[c] = (derived[c] || 0) + 1);
    });
    return {
      found: mine.length,
      collections: mine.map(i => i.c),
      titles: mine.map(i => i.t),
      group: [...new Set(mine.map(i => i.g))],
      declared: LW.collections,
      derived,
      searchable: mine.filter(i => (i.q || "").indexOf("skin") >= 0).length
    };
  }, IDS);

  report("A2) all 23 are in the catalogue and carry skin search terms",
    out.found === 23 && out.searchable === 23,
    { found: out.found, searchable: out.searchable });

  report("B) they sit in the Exact Skin collection, under one group",
    out.collections.every(c => c === "Exact Skin") && out.group.length === 1 && out.group[0] === "Skin Reference",
    { collections: [...new Set(out.collections)], group: out.group });

  const leaked = out.titles.filter(t => EXCLUDED.test(t));
  report("C) the exclusion holds — no Deep / Rich / Espresso / Cocoa tone shipped",
    leaked.length === 0, { leaked });

  const drift = Object.keys(out.derived).filter(k => out.declared[k] !== out.derived[k]);
  report("D) every collection count matches the items actually in it",
    drift.length === 0, { drift, declared: out.declared, derived: out.derived });

  report("no page errors", errs.length === 0, errs);

  console.log("      (skipped from the pack: plates 19-25, the Deep / Rich / VeryDeep tier)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
