/* v5.49.0 launch splash + work-in-progress restore — the two halves of
 * "the app remembers you".
 *
 * WHY THIS FILE EXISTS. Both features live at the exact points where a
 * mistake is invisible in a quick manual check and expensive in the field:
 *
 *   * The splash is an OVERLAY over the whole app. If its guards drift — the
 *     standalone check, the once-per-session latch, the failsafe timer — the
 *     failure mode is a customer staring at a gold ring that never leaves,
 *     on every launch, with the working app painted underneath it.
 *   * The snapshot writes user photos into IndexedDB on background/pagehide.
 *     If the restore stops validating shape or expiry, a corrupt or ancient
 *     record replaces the picker's state at boot, silently, for everyone.
 *
 * So this file pins the guards themselves, plus the upgrade path of the
 * shared database the gallery also lives in — version 2 must create BOTH
 * stores on a fresh install and only the missing one on a v1 upgrade.
 *
 * Usage: node test/verify_splash_wip.js   (reads the repo, no browser) */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail || "")));
  if (!ok) failures++;
}

/* ---- the splash and its guards ---- */
report("splash markup and inline style precede the icon sprite (paint-first)",
  app.indexOf('<div id="splash"') > -1 &&
  app.indexOf('<div id="splash"') < app.indexOf("HNK shared icon sprite"));
report("splash shows only for installed-app launches",
  /matchMedia\("\(display-mode: standalone\)"\)\.matches \|\| window\.navigator\.standalone === true/.test(app));
report("splash respects prefers-reduced-motion",
  /reduce = matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(app) &&
  /if \(!standalone \|\| reduce\) return;/.test(app));
report("splash runs once per session",
  /sessionStorage\.getItem\("hnk_splashed"\)/.test(app) &&
  /sessionStorage\.setItem\("hnk_splashed", "1"\)/.test(app));
report("splash can never outstay its welcome (6s failsafe + load path)",
  /setTimeout\(drop, 6000\);/.test(app) &&
  /window\.addEventListener\("load", hide\)/.test(app));
report("splash teardown removes the html class both ways",
  (app.match(/documentElement\.classList\.remove\("splashing"\)/g) || []).length >= 2);

/* ---- the launch chime (v5.85.0): silent unless a student asked ----
 *
 * The owner's decision was "off by default, switchable". Off has to mean the
 * ABSENCE of the key, not a stored "0": a stored default would have to be
 * written by something, and every phone that already has this app installed
 * has never run that something. Reading for the string "1" is what makes an
 * untouched device silent, including every device already in the field.
 *
 * The rest of this block is the failure a studio would actually feel: a
 * sound going off in front of a client because a guard drifted. So the play
 * call must sit behind the key, the volume must stay under the ceiling the
 * decision was made at, and the switch must live where a student can find it. */
report("the splash sounds only when the device asked for it",
  /localStorage\.getItem\("hnk_splash_chime"\) === "1"/.test(app) &&
  app.indexOf('localStorage.getItem("hnk_splash_chime") === "1"') <
  app.indexOf('new Audio("lib/snd/splash-chime.mp3")'));
report("off is the absence of the key, so an untouched device stays silent",
  /localStorage\.removeItem\(CHIME_KEY\)/.test(app) &&
  !/setItem\(CHIME_KEY, ?"0"\)/.test(app));
report("the chime is played at half volume, never full",
  (app.match(/\.volume = 0\.5;/g) || []).length >= 2);
report("a rejected play is swallowed — a blocked chime is never an error",
  (app.match(/if \(pr && pr\.catch\) pr\.catch\(function\(\)\{\}\);/g) || []).length >= 1 &&
  (app.match(/if \(p && p\.catch\) p\.catch\(function\(\)\{\}\);/g) || []).length >= 1);
report("the switch is in Setup, with a label, a state and a note",
  /id="chimeTgl"/.test(app) && /id="chimeK"/.test(app) && /id="chimeNote"/.test(app) &&
  /aria-pressed/.test(app.slice(app.indexOf('id="chimeTgl"') - 120, app.indexOf('id="chimeTgl"') + 120)));
report("turning it on plays it once, from the tap that turned it on",
  /if \(next\) chimePlay\(\);/.test(app));
report("the chime file the page names is really in the build",
  fs.existsSync(path.join(ROOT, "docs", "app", "lib", "snd", "splash-chime.mp3")));

/* ---- the shared database upgrade ---- */
report("gallery database moves to version 3",
  /indexedDB\.open\("hnk_web_studio",3\)/.test(app));
report("upgrade creates whichever store is missing, never assumes",
  /if\(!d\.objectStoreNames\.contains\("gal"\)\) d\.createObjectStore\("gal",\{keyPath:"id",autoIncrement:true\}\)/.test(app) &&
  /if\(!d\.objectStoreNames\.contains\("kv"\)\) d\.createObjectStore\("kv"\)/.test(app));

/* ---- the snapshot's write side ---- */
report("snapshot writes on the last events a reclaimed tab sees",
  /window\.addEventListener\("pagehide", wipSave\)/.test(app) &&
  /if \(document\.visibilityState === "hidden"\) wipSave\(\);/.test(app));
report("an emptied picker clears the stored snapshot",
  /else kvDel\("wip"\)\.catch\(function\(\)\{\}\);/.test(app));

/* ---- the restore side's four refusals ---- */
report("restore validates shape before touching state",
  /if \(!w \|\| !Array\.isArray\(w\.refs\)\) return;/.test(app) &&
  /typeof r\.mime === "string" && typeof r\.b64 === "string"/.test(app));
report("restore expires after 72 hours and deletes what it refuses",
  /WIP_TTL_MS = 72\*3600\*1000/.test(app) &&
  /if \(!\(Date\.now\(\) - \(w\.t\|\|0\) < WIP_TTL_MS\)\)\{ kvDel\("wip"\)\.catch\(function\(\)\{\}\); return; \}/.test(app));
report("restore never overwrites photos already in the session",
  /if \(state\.refs\.some\(function\(r\)\{ return r && r\.b64; \}\)\) return;/.test(app));
report("restore runs at boot, after the page restore",
  app.indexOf("try { wipRestore(); } catch(e){}") >
  app.indexOf('localStorage.getItem("hnk_web_studio_page")'));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nSplash + work-in-progress contract verified.");
process.exit(failures ? 1 : 0);
