/* v4.69.0 regression sweep — the stale-/lib/ bug is closed as a CLASS.

   WHAT v4.68 FIXED, AND WHAT IT MISSED. v4.68 purged the 116 replaced workflow
   cards out of the never-revalidated library cache, which was the thing the
   owner could see. It did not ask the obvious follow-up question: what ELSE
   under /lib/ has ever been replaced under its own name? The answer came from
   walking every commit that touched docs/app/lib and keeping only files
   MODIFIED rather than added. 121 files, and after removing the 116 cards, the
   icons (already network-first via LIB_ICON_RE) and three files under the long
   deleted lib/wf/cards/, exactly one live path was left:

     lib/styles880/catalog.json

   That one is worse than stale art, because nothing looks broken. v4.48 added
   a `q` search field; the search reads `rec.q || ""`, so a customer holding
   the pre-v4.48 copy gets no error and no missing image — just quietly
   emptier search results, for ever.

   AND WRITING THIS TEST FOUND A SECOND THING. The first draft asserted that
   all 880 records carry `q`, on the assumption that v4.48 had filled them all
   in. It failed at 800. Fifty skin_type and thirty eyelash records had shipped
   with no search keywords at all, on main, for every customer — so a lash
   could not be found by "c-curl" and a skin type could not be found by its
   finish. v4.69 backfills all eighty from each record's own instruction text,
   and this release is also the one that purges the stale catalogue, so the
   repair and its delivery ship together.

   THE SHAPE OF THE FIX MATTERS AS MUCH AS THE FIX. v4.68 carried ONE marker,
   which made its own stated maintenance rule ("add a new tag + pattern here")
   impossible to follow: widening the pattern under the old tag skips every
   device that already purged, and renaming the tag re-purges the cards on
   devices that already paid for them. Each entry now owns its marker.

   Pinned contracts:
   A) The catalogue purge entry exists and names the styles880 catalogue.
   B) A poisoned catalogue is purged on activation and the real 880-record
      JSON is served — measured by parsing what the page actually receives.
   C) MARKERS ARE INDEPENDENT. With the cards marker already present and the
      catalogue marker absent, activation purges the catalogue and leaves the
      cards alone. This is the whole reason for the list, and a single-marker
      implementation fails exactly here.
   D) Every declared purge pattern still matches something real on disk. A
      pattern that has stopped matching is dead weight that reads like cover.
   E) The catalogue on disk really does carry `q` on every record — the field
      whose absence is the damage being repaired.
   F) No pattern can match the purge markers themselves, which would make the
      purge delete its own bookkeeping and re-run on every single release.

   Usage: PORT=8931 node test/sweep_v469_upgrades.js  (serve docs/app first) */
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
const sw = fs.readFileSync(path.join(APP, "sw.js"), "utf8");

/* ---- A) the entry exists ---- */
const CARDS_TAG = "./__lib-purge-v4-64-cards5";
const CAT_TAG = "./__lib-purge-v4-69-styles880-catalog";
/* Read the list block itself. "styles880" also appears in the LIB_MAX_ENTRIES
   note far above, so a whole-file search would pass on the wrong sentence. */
const listStart = sw.indexOf("var LIB_PURGES = [");
const listBlock = listStart < 0 ? "" : sw.slice(listStart, sw.indexOf("\n];", listStart));
report("A) the styles880 catalogue has its own purge entry inside the purge list",
  listStart >= 0 &&
  listBlock.indexOf(CAT_TAG) >= 0 &&
  /re: \/\\\/lib\\\/styles880\\\/catalog\\\.json\$\//.test(listBlock),
  { hasList: listStart >= 0, tagInList: listBlock.indexOf(CAT_TAG) >= 0 });

/* ---- D + F) the declared patterns, checked against the real tree ---- */
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push("/" + path.relative(APP, p).split(path.sep).join("/"));
  });
  return out;
}
const libFiles = walk(path.join(APP, "lib"), []);

/* Re-create the declared patterns here rather than eval'ing sw.js: this file
   is asserting what the worker declares, so it has to state it independently
   or it is only checking sw.js against itself. */
const SAMPLE_TAG = "./__lib-purge-v4-73-st-sample";
const DECLARED = [
  { tag: CARDS_TAG, re: /\/lib\/wf\/cards5\// },
  { tag: CAT_TAG, re: /\/lib\/styles880\/catalog\.json$/ },
  /* v4.73 — the Studio base sample, replaced under its own name when the
     commissioned look pack landed. This list is deliberately restated here
     rather than read out of sw.js: the point of D0 is that a new entry cannot
     be added to the worker without a human also stating it here. */
  { tag: SAMPLE_TAG, re: /\/lib\/st-sample\.jpg$/ },
  /* v4.79 — two cards and the Scene banner, redrawn and replaced in place.
     Targeted by filename: cards5 is 13MB and re-purging the folder to deliver
     two files would cost a studio on mobile data the other 114. */
  { tag: "./__lib-purge-v4-79-cards5-refresh", re: /\/lib\/wf\/cards5\/(mx-light|pl-5)\.jpg$/ },
  { tag: "./__lib-purge-v4-79-dash-scene", re: /\/lib\/dash\/scene\.jpg$/ },
  /* v4.83 — the six real video cards, the twelve Path look chips and the one
     Library plate that carried the feather-in-the-mouth motif. Three markers,
     because one marker fires once: folding them together would mean a device
     that took the first replacement never receives the other two. */
  { tag: "./__lib-purge-v4-83-vid-cards", re: /\/lib\/vid\// },
  { tag: "./__lib-purge-v4-83-lookchips", re: /\/lib\/wf\/lookchips\// },
  { tag: "./__lib-purge-v4-83-ref413", re: /\/lib\/(full|ui)\/user-ref-413\.jpg$/ }
];
const declaredInSw = (listBlock.match(/\{ tag: "([^"]+)"/g) || []).map(s => s.replace(/^\{ tag: "|"$/g, ""));
report("D0) this test's copy of the purge list matches the worker's, entry for entry",
  declaredInSw.length === DECLARED.length &&
  DECLARED.every((d, i) => declaredInSw[i] === d.tag),
  { inSw: declaredInSw, inTest: DECLARED.map(d => d.tag) });

const matchCounts = DECLARED.map(d => ({
  tag: d.tag, n: libFiles.filter(f => d.re.test(f)).length
}));
report("D) every declared purge pattern still matches real files on disk",
  matchCounts.every(m => m.n > 0), matchCounts);

report("F) no purge pattern matches a purge marker — the bookkeeping survives",
  DECLARED.every(d => DECLARED.every(o => !d.re.test(o.tag.replace("./", "/")))),
  DECLARED.map(d => d.tag));

/* ---- E) the field whose absence is the damage ---- */
const cat = JSON.parse(fs.readFileSync(path.join(APP, "lib", "styles880", "catalog.json"), "utf8"));
const noQ = cat.filter(r => typeof r.q !== "string" || !r.q.length);
report("E) all 880 catalogue records carry the `q` search field",
  cat.length === 880 && noQ.length === 0,
  { records: cat.length, missingQ: noQ.length, sample: noQ.slice(0, 3).map(r => r.id) });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });

  const CAT = "lib/styles880/catalog.json";
  const CARD = "lib/wf/cards5/subject-face.jpg";
  const POISON = "STALE-OLD-COPY";

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  /* Set up the ONE state that separates a list of markers from a single
     marker: the cards purge has already run on this device, the catalogue
     purge has not, and both paths hold poison. */
  const seeded = await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    await c.put(o.CAT, new Response(o.POISON, { headers: { "Content-Type": "application/json" } }));
    await c.put(o.CARD, new Response(o.POISON, { headers: { "Content-Type": "image/jpeg" } }));
    await c.put(o.CARDS_TAG, new Response("1"));      /* cards: already done here */
    await c.delete(o.CAT_TAG);                        /* catalogue: never run here */
    return {
      cat: await (await c.match(o.CAT)).text(),
      card: await (await c.match(o.CARD)).text(),
      cardsMarker: !!(await c.match(o.CARDS_TAG)),
      catMarker: !!(await c.match(o.CAT_TAG))
    };
  }, { CAT, CARD, POISON, CARDS_TAG, CAT_TAG });

  report("setup: both paths poisoned, cards marker present, catalogue marker absent",
    seeded.cat === POISON && seeded.card === POISON &&
    seeded.cardsMarker === true && seeded.catMarker === false, seeded);

  /* Force a genuine install+activate. registration.update() finds identical
     bytes and never fires activate — the same trap that produced a false
     failure in the v4.68 suite. */
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const after = await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    const cat = await c.match(o.CAT);
    const card = await c.match(o.CARD);
    let records = -1, withQ = -1, err = null;
    try {
      const r = await fetch(o.CAT, { cache: "no-store" });
      const j = await r.json();
      records = j.length;
      withQ = j.filter(x => typeof x.q === "string" && x.q.length).length;
    } catch (e) { err = String(e).slice(0, 120); }
    return {
      catStillCached: cat ? (await cat.text()).slice(0, 40) : null,
      cardStillCached: card ? (await card.text()).slice(0, 40) : null,
      catMarker: !!(await c.match(o.CAT_TAG)),
      records, withQ, err
    };
  }, { CAT, CARD, CAT_TAG });

  report("B) the poisoned catalogue is purged and the real 880-record JSON is served",
    after.catStillCached !== POISON && after.records === 880 && after.withQ === 880,
    after);

  report("C) markers are independent — the already-purged cards are left alone",
    after.cardStillCached === POISON,
    { card: after.cardStillCached });

  report("C2) the catalogue's own marker is now written",
    after.catMarker === true);

  report("no page errors", errs.length === 0, errs);

  console.log("      (history scan: 121 files under docs/app/lib were ever modified in " +
    "place — 116 cards, styles880/catalog.json, icon-512.png and 3 under the deleted " +
    "lib/wf/cards/; the /lib/{ui,full,banners}/ plates are add-only, which is what " +
    "makes cache-first safe for them)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
