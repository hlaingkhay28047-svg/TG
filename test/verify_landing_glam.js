/* v5.49.x landing glam — ghost wordmark, gold social dock, kick stagger.
 *
 * WHY THIS FILE EXISTS. Three decorative systems joined the landing page, and
 * each one has a way to rot into a real defect rather than a missing garnish:
 *
 *   * The social dock chips are LINKS. If their destinations drift from the
 *     text contact row above them, the prettiest button on the page starts
 *     sending customers to the wrong place — so the dock is checked against
 *     the text row, not against a copy of the URLs kept here.
 *   * The kick stagger splits a heading into per-letter spans. That is only
 *     safe for Latin; run it over Burmese or any complex script and the
 *     shaping breaks. The guard regex and the .lat class contract are the
 *     whole safety, so they are pinned, along with the aria-label that keeps
 *     the heading readable to screen readers.
 *   * All of it is decoration, so all of it must stand down under
 *     prefers-reduced-motion and never outrank the content (the ghost mark
 *     stays aria-hidden and stroke-only).
 *
 * Usage: node test/verify_landing_glam.js   (reads the repo, no browser) */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const landing = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail || "")));
  if (!ok) failures++;
}

/* ---- the dock mirrors the text contact row ---- */
const contactRow = (landing.match(/data-i18n="foot\.contact"[\s\S]{0,700}?<\/p>/) || [""])[0];
const rowLinks = [...contactRow.matchAll(/href="(https:\/\/[^"]+)"/g)].map(m => m[1]);
const dock = (landing.match(/<div class="socdock">[\s\S]*?<\/div>/) || [""])[0];
const dockLinks = [...dock.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
report("social dock exists with exactly the contact row's three destinations",
  rowLinks.length === 3 && dockLinks.length === 3 &&
  rowLinks.every(u => dockLinks.includes(u)),
  { rowLinks, dockLinks });
report("every dock chip opens safely in a new tab and carries a name",
  [...dock.matchAll(/<a class="soc"[^>]*>/g)].length === 3 &&
  [...dock.matchAll(/<a class="soc"[^>]*>/g)].every(m =>
    /rel="noopener noreferrer"/.test(m[0]) && /aria-label="/.test(m[0])));

/* ---- the ghost wordmark stays decoration ---- */
report("ghost wordmark is present, aria-hidden and stroke-only",
  /<div class="ghostwrap" aria-hidden="true"><div class="ghost">HNK<\/div><\/div>/.test(landing) &&
  /\.ghost\{[^}]*-webkit-text-stroke/.test(landing) &&
  /\.ghost\{[^}]*color:transparent/.test(landing));
report("footer clips the ghost so the page never scrolls sideways",
  /\.foot\{[^}]*overflow:hidden/.test(landing));

/* ---- the kick stagger's safety ---- */
report("kick stagger only ever splits pure-Latin text",
  /if\(!\/\^\[\\x20-\\x7E·\]\+\$\/\.test\(txt\)\)return;/.test(landing));
report("kick stagger targets only .kick.lat, inside the reveal observer",
  /querySelectorAll\("\.kick\.lat"\)\.forEach\(kickBurst\)/.test(landing));
report("split headings keep their text for screen readers",
  /el\.setAttribute\("aria-label",txt\);/.test(landing) &&
  /s\.setAttribute\("aria-hidden","true"\)/.test(landing));
report("stagger runs once per heading",
  /if\(el\.dataset\.kicked\)return; el\.dataset\.kicked="1";/.test(landing));

/* ---- everything stands down for reduced motion ---- */
report("ghost sheen and dock transitions stand down under reduced motion",
  /prefers-reduced-motion:reduce\)\{\.ghost\{animation:none\}\.soc,\.soc svg,\.soc span\{transition:none\}/.test(landing));
report("kick stagger lives inside the reduced-motion-guarded observer block",
  landing.indexOf("var kickBurst=function") > landing.indexOf("prefers-reduced-motion: reduce") &&
  /if\(!reduce&&"IntersectionObserver" in window\)\{[\s\S]{0,900}kickBurst/.test(landing));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nLanding glam contract verified.");
process.exit(failures ? 1 : 0);
