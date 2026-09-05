/* When the worker throws away a replaced picture, the page in front of the
 * student repaints it — on THIS launch, not the next one.
 *
 * WHY. Library art is cached first and never revalidated, so a picture
 * replaced under its own name is only corrected when LIB_PURGES deletes the
 * stale copy on activate. But activation happens after the page has already
 * painted from that copy: the owner opened the app on the very release that
 * fixed nine cards and saw all nine still wrong, because the repair landed a
 * moment too late and only the NEXT launch looked right. Being told "open it
 * twice" is not a fix.
 *
 * The worker now names the URLs it deleted and the page re-requests exactly
 * those. Nothing reloads — a student halfway through a prompt keeps it — and
 * a picture that was not purged is left untouched, which is the half that
 * keeps this from being a blunt cache-buster.
 *
 * Usage: PORT=8931 node test/verify_lib_art_repaint.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "docs", "app", "sw.js"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  /* ---- A) the worker's half: it collects what it deleted and tells clients ---- */
  /* ---- A0) THE ROOT CAUSE THIS FILE MISSED TWICE ----
     6.6.1 deleted the stale entry from the SERVICE WORKER cache and 6.6.2 made
     the page re-request it — and the owner still saw the old art three
     releases later, on 6.7.0, with the repair marked done. Both fixes ended in
     a plain fetch(), and a plain fetch is answered by the BROWSER'S OWN HTTP
     cache, which was still holding the same JPEG under the same URL. The
     purge deleted a copy and immediately put the identical old bytes back.
     Deleting is only half a repair: the refill has to bypass that cache, and
     the marker must not be spent when it did not. */
  report("A0) the refill bypasses the browser's HTTP cache, or it is not a repair",
    /new Request\(url, \{[^}]*cache:\s*"reload"/.test(SW) &&
    /function purgeRefill\(/.test(SW) && /purgeRefill\(c, url\)/.test(SW),
    "purgeReplacedLibArt refills with a plain fetch — the HTTP cache will hand the old bytes back");

  report("A0b) a refill that failed leaves the marker unset, so the next launch retries",
    /if \(failed\) return;/.test(SW) && /failed = true/.test(SW),
    "an offline activation burns the one chance this entry had and the picture stays old for ever");

  report("A) the purge records the URLs it deletes",
    /removed\.push\(url\)/.test(SW) && /var url = k\.url;/.test(SW),
    "purgeReplacedLibArt drops the deleted keys on the floor");
  report("A2) and hands them to every open window, uncontrolled ones included",
    /clients\.matchAll\(\{[^}]*includeUncontrolled:\s*true/.test(SW) &&
    /type:\s*"hnk-lib-purged"/.test(SW),
    "the worker never posts the purge to its clients");
  report("A3) it stays silent when nothing was actually removed",
    /if\s*\(!removed\.length\)\s*return;/.test(SW),
    "an empty purge would still wake every client");

  /* ---- B) the page's half, driven for real ---- */
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);

    const B = await page.evaluate(() => {
      switchPage("pgV2V");
      const imgs = [...document.querySelectorAll("#vtWfRow img")];
      const before = imgs.map(i => i.getAttribute("src"));
      /* exactly the shape the worker posts: absolute URLs */
      const purged = before.slice(0, 3).map(s => new URL(s, location.href).href);
      const untouched = before.slice(3);
      navigator.serviceWorker.dispatchEvent(new MessageEvent("message", {
        data: { type: "hnk-lib-purged", urls: purged }
      }));
      const after = [...document.querySelectorAll("#vtWfRow img")].map(i => i.getAttribute("src"));
      return {
        cards: before.length,
        repainted: after.filter(s => /[?&]_p=\d+/.test(s)).length,
        wanted: purged.length,
        untouchedStayed: untouched.every(s => after.includes(s)),
        stillPointAtSameFile: after.every((s, i) => s.split("?")[0] === before[i].split("?")[0])
      };
    });

    report("B) the deck is actually on screen to repaint",
      B.cards >= 10, `only ${B.cards} cards rendered`);
    report("B2) exactly the purged pictures are re-requested",
      B.repainted === B.wanted, B);
    report("B3) every other picture is left alone",
      B.untouchedStayed, "a picture that was not purged was re-requested too");
    report("B4) a repainted picture still points at its own file",
      B.stillPointAtSameFile, "the refresh changed which file a card shows");

    /* an unrelated message must do nothing */
    const C = await page.evaluate(() => {
      const before = [...document.querySelectorAll("#vtWfRow img")].map(i => i.getAttribute("src"));
      navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "something-else" } }));
      navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "hnk-lib-purged", urls: [] } }));
      const after = [...document.querySelectorAll("#vtWfRow img")].map(i => i.getAttribute("src"));
      return before.join("|") === after.join("|");
    });
    report("C) an unrelated or empty message repaints nothing",
      C, "the page reacted to a message that was not a purge");

    report("Z) no page error while the repaint ran",
      errs.length === 0, errs.slice(0, 3));
  } finally {
    await browser.close();
  }

  console.log(failures ? "\n" + failures + " check(s) failed"
    : "\nAll checks passed — a replaced picture corrects itself on the launch that ships it.");
  process.exit(failures ? 1 : 0);
})();
