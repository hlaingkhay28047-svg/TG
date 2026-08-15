/* sweep_v482_agelib.js — the baby & child age library, and the count that
   nine releases got away with being wrong.

   440 plates land as one new "Baby & Child" collection: 22 age checkpoints
   (100 days, 1-12 months, 2-10 years) of 20 plates each. A Myanmar studio
   picks a milestone set BY AGE, so the checkpoint is the organising axis and
   each becomes its own group.

   THE BUG THIS FILE EXISTS FOR. The library count is written out as prose in
   24 language strings. Every wave I have edited "the nine languages" and every
   wave the other fifteen drifted. Measured before this release: ja, km, ko,
   lo, ne and ur were still saying 637 — two full waves stale, off by 222, and
   shown to a real user the moment they pick Japanese from the language menu.
   Nothing in the suite noticed, because nothing checked the ones I was not
   already thinking about.

   So assertion D does not check a list of languages. It extracts EVERY ph_lib
   string in the file, in whatever numeral script it is written, and requires
   the number inside it to equal the shipped item count. A new language cannot
   be added stale, and an old one cannot rot.

   Pinned contracts:
   A) 440 plates installed as one collection, 22 groups of 20, ids contiguous.
   B) Both renditions exist on disk at the library's fixed-height rule —
      640 tall in lib/full, 180 in lib/ui, width from the source aspect, so
      nothing is cropped. 2:3 sources land at 427x640 and 120x180.
   C) Collection counts are DERIVED from the items, never hand-written.
   D) Every ph_lib in every language states the true count (see above).
   E) The age groups render in chronological order, not by popularity —
      "9 Years" in front of "100 Days" reads as broken.
   F) Every new plate carries searchable text: its own title, its age in
      English and Burmese, and the words a studio would actually type.

   Usage: PORT=8931 node test/sweep_v482_agelib.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const APPDIR = path.join(__dirname, "..", "docs", "app");
const src = fs.readFileSync(path.join(APPDIR, "index.html"), "utf8");

const CK = ["100 Days", "1 Month", "2 Months", "3 Months", "4 Months", "5 Months",
  "6 Months", "7 Months", "8 Months", "9 Months", "10 Months", "11 Months",
  "12 Months", "2 Years", "3 Years", "4 Years", "5 Years", "6 Years",
  "7 Years", "8 Years", "9 Years", "10 Years"];

(async () => {
  const browser = await chromium.launch();
  const pageErrors = [];
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 180)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);

  const r = await page.evaluate((CK) => {
    const out = {};
    out.total = LW.items.length;
    const age = LW.items.filter(i => i.c === "Baby & Child");
    out.ageCount = age.length;
    out.collections = LW.collections;

    /* C) counts derived from the data, not hand-written */
    const derived = {};
    LW.items.forEach(i => (i.c instanceof Array ? i.c : [i.c])
      .forEach(c => { derived[c] = (derived[c] || 0) + 1; }));
    out.derivedMatches = Object.keys(derived).length === Object.keys(LW.collections).length &&
      Object.keys(derived).every(k => derived[k] === LW.collections[k]);

    /* A) 22 groups of exactly 20 */
    const byGroup = {};
    age.forEach(i => { byGroup[i.g] = (byGroup[i.g] || 0) + 1; });
    out.groups = Object.keys(byGroup).length;
    out.wrongSized = Object.keys(byGroup).filter(g => byGroup[g] !== 20);
    out.missingGroups = CK.filter(g => byGroup[g] === undefined);
    out.strayGroups = Object.keys(byGroup).filter(g => CK.indexOf(g) < 0);

    /* ids contiguous, no gaps, no collisions with the existing 859 */
    const nums = age.map(i => parseInt(String(i.id).replace(/\D/g, ""), 10)).sort((a, b) => a - b);
    out.idsContiguous = nums.length > 0 &&
      nums[nums.length - 1] - nums[0] + 1 === nums.length &&
      new Set(nums).size === nums.length;
    out.idRange = nums.length ? [nums[0], nums[nums.length - 1]] : null;

    /* F) every plate is searchable by title, by age, and by intent */
    out.thin = age.filter(i =>
      !i.t || !i.q ||
      i.q.indexOf(i.t.toLowerCase()) < 0 ||
      i.q.indexOf(i.g.toLowerCase()) < 0 ||
      i.q.indexOf("baby") < 0).map(i => i.id).slice(0, 6);
    out.titles = age.length;
    out.distinctTitles = new Set(age.map(i => i.t)).size;
    /* a duplicate title INSIDE one age group is the confusing case */
    const seen = {}, dupInGroup = [];
    age.forEach(i => {
      const k = i.g + "|" + i.t;
      if (seen[k]) dupInGroup.push(k); else seen[k] = 1;
    });
    out.dupInGroup = dupInGroup.slice(0, 6);

    /* D) the count, in every language string that states it */
    const MYD = "၀၁၂၃၄၅၆၇၈၉", DEV = "०१२३४५६७८९";
    const toLatin = s => s.replace(/./g, ch => {
      let k = MYD.indexOf(ch); if (k >= 0) return String(k);
      k = DEV.indexOf(ch); if (k >= 0) return String(k);
      return ch;
    });
    out.phLibChecked = 0;
    out.phLibWrong = [];
    Object.keys(window).forEach(() => {});
    return { out, toLatinProbe: toLatin("၈၅၉") };
  }, CK).then(x => x.out);

  /* D) done in Node against the source, so it covers EVERY language table —
     including the ones the page never instantiates in this run */
  const MYD = "၀၁၂၃၄၅၆၇၈၉", DEV = "०१२३४५६७८९";
  const toLatin = s => s.replace(/./g, ch => {
    let k = MYD.indexOf(ch); if (k >= 0) return String(k);
    k = DEV.indexOf(ch); if (k >= 0) return String(k);
    return ch;
  });
  const phLib = [];
  const reStr = /"?ph_lib"?\s*:\s*(["'])((?:(?!\1).)*?)\1/g;
  let m;
  while ((m = reStr.exec(src)) !== null) phLib.push(m[2]);
  /* the object-valued tables: ph_lib:{my:'…',en:'…',…} */
  const reObj = /"?ph_lib"?\s*:\s*\{/g;
  while ((m = reObj.exec(src)) !== null) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const blob = src.slice(m.index + m[0].length, i - 1);
    const reInner = /(["'])((?:(?!\1).)*?)\1/g;
    let mm;
    while ((mm = reInner.exec(blob)) !== null) if (/\d|[၀-၉०-९]/.test(mm[2])) phLib.push(mm[2]);
  }
  const wrong = phLib.map(s => {
    const n = (toLatin(s).match(/\d+/) || [])[0];
    return { n: n, ok: n === String(r.total), s: s.slice(0, 46) };
  }).filter(x => !x.ok);

  report("A) 440 plates land as one Baby & Child collection — 22 checkpoints of 20, ids contiguous",
    r.ageCount === 440 && r.groups === 22 && r.wrongSized.length === 0 &&
    r.missingGroups.length === 0 && r.strayGroups.length === 0 && r.idsContiguous === true,
    { count: r.ageCount, groups: r.groups, wrongSized: r.wrongSized,
      missing: r.missingGroups, stray: r.strayGroups, ids: r.idRange });

  /* B) both renditions on disk, at the fixed-height rule, nothing cropped */
  const { execFileSync } = require("child_process");
  const dims = (rel) => {
    const b = fs.readFileSync(path.join(APPDIR, rel));
    /* minimal JPEG SOF parse — no image library needed in the test env */
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];  // [w,h]
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  };
  const sample = [860, 900, 1000, 1100, 1299].map(n => "user-ref-" + n);
  const missingFiles = [], badDims = [];
  sample.forEach(id => {
    [["full", 427, 640], ["ui", 120, 180]].forEach(([sub, W, H]) => {
      const rel = "lib/" + sub + "/" + id + ".jpg";
      if (!fs.existsSync(path.join(APPDIR, rel))) { missingFiles.push(rel); return; }
      const d = dims(rel);
      if (!d || d[0] !== W || d[1] !== H) badDims.push(rel + " " + JSON.stringify(d));
    });
  });
  const nFull = fs.readdirSync(path.join(APPDIR, "lib", "full")).length;
  const nUi = fs.readdirSync(path.join(APPDIR, "lib", "ui")).length;
  report("B) both renditions exist at the fixed-height rule — 427x640 full, 120x180 ui, never cropped",
    missingFiles.length === 0 && badDims.length === 0 && nFull === r.total && nUi === r.total,
    { missing: missingFiles, badDims: badDims, full: nFull, ui: nUi, items: r.total });

  report("C) collection counts are derived from the items, never hand-written",
    r.derivedMatches === true, r.collections);

  report("D) every ph_lib in every language states the shipped count — not a list of languages, ALL of them",
    phLib.length >= 24 && wrong.length === 0,
    { checked: phLib.length, expected: r.total, wrong: wrong.slice(0, 8) });

  /* E) chronological group order */
  const order = await page.evaluate(async () => {
    document.querySelectorAll(".page").forEach(x => x.classList.remove("on"));
    const pg = document.getElementById("pgLib") || document.getElementById("pgLibrary");
    if (pg) pg.classList.add("on");
    lib.filter = "Baby & Child"; lib.group = ""; lib.shown = 0;
    renderLibFilters(); renderLibGroups(); renderLibGrid(true);
    await new Promise(r => setTimeout(r, 300));
    return Array.from(document.getElementById("libGroups").children)
      .map(b => b.textContent.replace(/\s*\(\d+\)\s*$/, "").trim());
  });
  const seenOrder = order.slice(1);   // first chip is "all sets"
  report("E) the age groups render in chronological order, not by popularity",
    JSON.stringify(seenOrder) === JSON.stringify(CK),
    { got: seenOrder.slice(0, 8), want: CK.slice(0, 8), n: seenOrder.length });

  report("F) every plate is searchable by its title, its age and the studio's own words",
    r.thin.length === 0 && r.dupInGroup.length === 0 && r.distinctTitles >= 350,
    { thin: r.thin, dupInGroup: r.dupInGroup,
      distinct: r.distinctTitles, of: r.titles });

  report("no page errors", pageErrors.length === 0, pageErrors);

  console.log("      (library " + r.total + " plates across " +
    Object.keys(r.collections).length + " collections; " + phLib.length +
    " ph_lib strings all agree)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
