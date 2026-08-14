/* v4.68.0 regression sweep — the replaced card art actually reaches the phone.

   THE BUG THE OWNER HIT. v4.64 replaced all 116 workflow cards under their own
   filenames. Everything under /lib/ is served cache-first and NEVER
   revalidated — the fetch handler returns `hit` and stops — so a returning
   customer kept being served the OLD art out of hnk-lib-v1 for ever. The files
   were on the server, the deploy was green, and the phone still showed the old
   pictures. Nothing in the repo was wrong; the cache was.

   WHY LIB_CACHE WAS NOT SIMPLY RENAMED. That cache holds up to ~52MB of library
   thumbnails a studio owner already paid mobile data for. Renaming it fixes the
   116 cards by throwing away 600+ images that were never stale. The worker now
   purges exactly the replaced paths, once per device, guarded by a marker
   written into the cache itself.

   THIS FILE DRIVES A REAL SERVICE WORKER. It poisons hnk-lib-v1 with a
   deliberately wrong response at a real card URL, loads the app, waits for the
   worker to activate, and then asks the page to fetch that card again. A test
   that only read sw.js as text would have passed against the broken version
   too, because the broken version was also perfectly valid code.

   Pinned contracts:
   A) A poisoned entry at a replaced path is gone after activation, and the
      card fetches its real bytes from the network.
   B) A library thumbnail that was NOT replaced survives — the purge is
      surgical, not a cache wipe. This is the whole reason for the design.
   C) The purge marker is written, so the second activation is a no-op and a
      customer is not made to re-download the cards on every single release.
   D) LIB_CACHE keeps its name, so nobody "fixes" this later by renaming it.
   E) The app-shell cache still carries the version, so shell updates arrive.

   Usage: PORT=8931 node test/sweep_v468_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const sw = fs.readFileSync(path.join(__dirname, "..", "docs", "app", "sw.js"), "utf8");

report("D) LIB_CACHE keeps its name — the fix must not be a 52MB cache wipe",
  /var LIB_CACHE = "hnk-lib-v1"/.test(sw));
report("E) the app-shell cache still carries the app version",
  /var CACHE = "hnk-web-studio-v4-68-0"/.test(sw));
report("D2) a purge tag and pattern are declared, and the purge runs on activate",
  /var LIB_PURGE_TAG =/.test(sw) && /var LIB_PURGE_RE =/.test(sw) &&
  /\.then\(purgeReplacedLibArt\)/.test(sw));

(async () => {
  /* A service worker needs a secure context; 127.0.0.1 counts as one. */
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });

  const CARD = "lib/wf/cards5/subject-face.jpg";
  const KEEP = "lib/ui/user-ref-001.jpg";
  const POISON = "STALE-OLD-ART";

  /* 1) first load: get a worker registered and poison the lib cache exactly the
        way a returning customer's phone is poisoned — a real entry at a real
        card URL, holding the wrong bytes. */
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const seeded = await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    await c.put(o.CARD, new Response(o.POISON, { headers: { "Content-Type": "image/jpeg" } }));
    await c.put(o.KEEP, new Response(o.POISON, { headers: { "Content-Type": "image/jpeg" } }));
    /* remove any marker so this run exercises a first-time purge */
    await c.delete("./__lib-purge-v4-64-cards5");
    const hitCard = await c.match(o.CARD), hitKeep = await c.match(o.KEEP);
    return { card: hitCard ? await hitCard.text() : null, keep: hitKeep ? await hitKeep.text() : null };
  }, { CARD, KEEP, POISON });

  report("setup: the lib cache really is poisoned at both paths before the purge",
    seeded.card === POISON && seeded.keep === POISON, seeded);

  /* 2) Make a genuinely NEW worker activate over the poisoned cache.
        registration.update() is not enough here: the worker registered on the
        first load already IS the current sw.js, so update() finds identical
        bytes, installs nothing and never fires activate — which is exactly how
        an earlier version of this test recorded a false failure. Unregistering
        and reloading forces a real install+activate cycle, which is the
        sequence a returning customer actually goes through: old cache present,
        new worker arriving. */
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const after = await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    const card = await c.match(o.CARD);
    const keep = await c.match(o.KEEP);
    const mark = await c.match("./__lib-purge-v4-64-cards5");
    /* and prove the page now receives REAL bytes for the card, not the poison */
    let served = null, bytes = 0;
    try {
      const r = await fetch(o.CARD, { cache: "no-store" });
      const b = await r.blob();
      bytes = b.size;
      served = bytes > 5000 ? "real-image" : await b.text();
    } catch (e) { served = "fetch-failed:" + e; }
    return {
      cardStillCached: card ? await card.text() : null,
      keepStillCached: keep ? await keep.text() : null,
      markerWritten: !!mark,
      served, bytes
    };
  }, { CARD, KEEP });

  report("A) the poisoned card entry is purged and the real image is served",
    after.cardStillCached !== POISON && after.served === "real-image" && after.bytes > 5000,
    after);

  report("B) an unrelated library thumbnail survives — the purge is surgical, not a wipe",
    after.keepStillCached === POISON,
    { keep: after.keepStillCached });

  report("C) the purge marker is written, so later activations are a no-op",
    after.markerWritten === true);

  /* 4) second pass must not re-purge: re-poison the card, activate again, and
        the poison should now REMAIN, proving the marker is honoured and the
        customer is not made to re-download on every release. */
  await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    await c.put(o.CARD, new Response(o.POISON, { headers: { "Content-Type": "image/jpeg" } }));
  }, { CARD, POISON });
  await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.unregister()));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const second = await page.evaluate(async (o) => {
    const c = await caches.open("hnk-lib-v1");
    const card = await c.match(o.CARD);
    return { stillPoisoned: card ? (await card.text()) === o.POISON : false };
  }, { CARD, POISON });

  report("C2) the marker is honoured — the second activation does not purge again",
    second.stillPoisoned === true, second);

  report("no page errors", errs.length === 0, errs);

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
