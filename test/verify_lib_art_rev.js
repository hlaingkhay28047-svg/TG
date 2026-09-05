/* A picture replaced under its own name is served under a NEW URL.
 *
 * WHY THIS FILE EXISTS, AFTER FOUR FIXES THAT DID NOT WORK. /lib/ is served
 * cache-first and never revalidated, so replacing a JPEG in place is invisible
 * to a returning device. Three releases tried to repair the caches:
 *
 *   6.6.1  purged the entry from the SERVICE WORKER cache
 *   6.6.2  told the page to re-request what had been purged
 *   6.7.3  refilled with cache:"reload" so the BROWSER cache could not answer
 *
 * and the owner was still looking at the old nine cards. The hole in the last
 * one is that a purge can only repair entries it FINDS: a device whose lib
 * cache had been emptied — by the app's own "Clear cache + restart", or by
 * eviction — has nothing to sweep, so the purge deletes nothing, refills
 * nothing, marks itself done, and the very next request is answered by the
 * browser's HTTP cache with the old bytes.
 *
 * Repairing caches is the wrong shape of fix. A new URL cannot be stale,
 * because no cache has ever seen it. LIB_ART_REV gives exactly the files that
 * were replaced a "?v=" token — nothing else, so the ~52MB of thumbnails a
 * customer paid mobile data for is not re-downloaded.
 *
 * THIS TEST IS THE RULE'S TEETH: every file recorded as replaced in place must
 * carry a revision, both surfaces must read one map, and the token must reach
 * the <img> rather than sit in a table nobody consults.
 *
 * Usage: node test/verify_lib_art_rev.js */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const APP = read("docs/app/index.html");
const PANEL = read("panel/main.js");
const REPL = JSON.parse(read("test/fixtures/lib-replacements.json"));
const failures = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${String(detail).slice(0, 400)}`}`);
  if (!ok) failures.push(label);
}

/* the app's own map and helper, run rather than parsed */
const src = APP.match(/var LIB_ART_REV = \{[\s\S]*?\n\};/)[0] +
  APP.match(/function libArt\([\s\S]*?\n\}/)[0] + "; return { REV: LIB_ART_REV, libArt: libArt };";
const { REV, libArt } = new Function(src)();

check("A) the app carries a revision map",
  REV && Object.keys(REV).length > 0, "LIB_ART_REV is missing or empty");

/* B — EVERY recorded in-place replacement carries one. This is the check that
   fails the next time somebody re-shoots a card and forgets. */
const recorded = REPL.files.map(f => f.path.replace(/^docs\/app\//, ""));
const missing = recorded.filter(p => !(p in REV));
check("B) every file recorded as replaced in place carries a revision",
  missing.length === 0,
  missing.join(", ") + " — replace the file, then bump it in LIB_ART_REV");

check("B2) and the map claims nothing that was never replaced",
  Object.keys(REV).every(k => recorded.indexOf(k) >= 0),
  Object.keys(REV).filter(k => recorded.indexOf(k) < 0).join(", "));

check("B3) every revision is an integer above 1 — a first version needs no token",
  Object.values(REV).every(v => Number.isInteger(v) && v >= 2),
  JSON.stringify(REV));

/* C — the helper itself. The expected token is READ from the map: a card that
   is re-arted again (6.10.0 took the video cards to 3) must not fail the
   helper's own check for carrying the number the rule demands. */
const RV = REV["lib/vid/vt-anime.jpg"];
check("C) a replaced file gets its token, and an untouched one is left alone",
  libArt("lib/vid/vt-anime.jpg") === "lib/vid/vt-anime.jpg?v=" + RV &&
  libArt("lib/vid/never-replaced.jpg") === "lib/vid/never-replaced.jpg",
  `${libArt("lib/vid/vt-anime.jpg")} | ${libArt("lib/vid/never-replaced.jpg")}`);

check("C2) a path that already carries a query keeps it",
  libArt("lib/vid/vt-anime.jpg?x=1") === "lib/vid/vt-anime.jpg?x=1&v=" + RV,
  libArt("lib/vid/vt-anime.jpg?x=1"));

check("C3) a leading ./ does not hide a file from the map",
  libArt("./lib/vid/vt-anime.jpg") === "./lib/vid/vt-anime.jpg?v=" + RV,
  libArt("./lib/vid/vt-anime.jpg"));

/* D — the token reaches the picture, on both surfaces */
check("D) every card the app paints goes through libArt",
  (APP.match(/im\.src=libArt\(w\.art\)/g) || []).length === 2 &&
  /art\.src=libArt\(wf\.cardImg\)/.test(APP) &&
  /* v6.14.0 — the video wizard's Guide step shows the card's picture too */
  /vis\.src=libArt\(w\.art\)/.test(APP) &&
  !/im\.src=w\.art;/.test(APP) && !/vis\.src=w\.art;/.test(APP),
  "a card still sets its src straight from the raw path");

check("D2) the panel reads the app's map rather than a second copy",
  /W\.libArt\(w\.art\)/.test(PANEL) && !/im\.src = VID_ART_BASE \+ w\.art;/.test(PANEL),
  "the panel still builds its card src from the raw path");

/* E — THE ORDERING RULE, learned from a crash that shipped in this very file.
   docs/app/index.html is ONE top-level script. ptSetWorkflow's restore path
   calls libArt() while that script is still running, so a `var LIB_ART_REV`
   declared further down is read as undefined: TypeError, and every line after
   it — state.st, the Studio module, APP_VER, the service worker — never runs.
   The app booted into a dead shell for anyone who reloaded with a workflow
   chosen. The map must be declared before the first line that can read it. */
const defAt = APP.indexOf("var LIB_ART_REV = {");
const callAt = Math.min.apply(null,
  ["libArt(w.art)", "libArt(wf.cardImg)"].map(x => APP.indexOf(x)).filter(i => i >= 0));
check("E) the map is declared BEFORE the first line that reads it",
  defAt >= 0 && callAt > 0 && defAt < callAt,
  `LIB_ART_REV at ${defAt}, first libArt() call at ${callAt} — a later var reads as undefined and kills the rest of the script`);

const LIFTED = read("panel/js/hnk_video_tool_wf.js");
check("D3) and that map is LIFTED from the app, not retyped",
  LIFTED === require("../tools/build_panel_video_tool_wf.js").build() &&
  LIFTED.indexOf("var LIB_ART_REV = {") >= 0,
  "panel/js/hnk_video_tool_wf.js is not what its lifter produces — re-run it");

console.log(failures.length
  ? `\n${failures.length} check(s) failed`
  : `\nAll checks passed — ${Object.keys(REV).length} replaced pictures are served under their own URL, on both surfaces.`);
process.exit(failures.length ? 1 : 0);
