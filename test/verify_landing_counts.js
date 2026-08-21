/* v5.32.0 count-parity check — every number the landing advertises is a number
   some shipped artifact can actually produce.

   WHY THIS FILE EXISTS. The landing page said "One-Tap 131" in 28 places
   across 27 locales. The app said 138. The app was right: tapTotal is computed
   at boot from the shipped data —

       D.presets.length + wedding sets + D.lighting.lights.length
       + PROMPT_LIB.length + staged LW.workflows + the 16 Studio preset cards

   — so every wave that added a preset, a light or a prompt moved the real
   number and left the landing behind. Seven had accumulated. Nothing in 87
   test scripts noticed, because no test knew what the number was supposed to
   be. The same sweep found the carousel's Studio caption still promising
   "Meitu ၁၅၈ · Evoto ၂၁၀" while the app shipped 162 and 213.

   WHY IT IS NOT JUST ANOTHER PINNED NUMBER. Writing `assert tap === 138` here
   would fix today's drift and rebuild the same trap for the next wave: the
   author who adds a preset gets a red test naming a literal, edits the
   literal, and the landing stays stale exactly as before. So this file pins
   nothing. It BOOTS THE APP and UNZIPS THE PANEL, reads what each one reports
   about itself, and demands the landing agree. Add a preset and this test
   names every file still carrying the old number.

   WHY THE NUMBERS ARE BUCKETED BY i18n KEY, which is the subtle part. The
   landing describes TWO products in two columns, and both use the words
   "Smart Workflow":

       duo1.* / meta ..... the web app ......... Smart Workflow 131
       duo2.* / s5.* ..... the Photoshop panel .. Smart Workflow 9

   They are different counts of different things, and for a while the web
   app's One-Tap total was ALSO 131 — a pure coincidence that would make a
   careless find-and-replace corrupt the correct string while fixing the wrong
   one. So every occurrence is attributed to the i18n key it lives under and
   checked against that product's own source. The collision is then harmless.

   Pinned contracts:
   A) The app renders a One-Tap, Visual Library, Smart Workflow, Meitu and
      Evoto count at runtime.
   B) docs/app/index.html's static statline fallbacks equal those runtime
      values, so the pre-JS paint never flashes a number about to change.
   C) Every labelled number on the landing — visible copy, the two meta/OG
      descriptions a link preview shows, and all 27 locale dictionaries —
      matches the runtime value for the product it describes.
   D) Myanmar-numeral spellings (၁၆၂) are checked the same as ASCII ones; the
      original stale caption was in Myanmar digits and a naive ASCII grep
      walked straight past it.
   E) The panel's advertised Smart Workflow count equals the number of
      workflows in the shipped .ccx's registry.
   F) The nine workflow names the landing lists are the nine the .ccx defines,
      so a panel wave cannot add a workflow the site never mentions.
   G) The app's share-sheet fallback count agrees too.

   Usage: PORT=8931 node test/verify_landing_counts.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const seed = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* Myanmar digits ၀-၉ are the same numbers, and the stale caption this file was
   written for was spelled in them */
const MY_DIGITS = "၀၁၂၃၄၅၆၇၈၉";
function toAscii(s) {
  return s.replace(/[၀-၉]/g, c => String(MY_DIGITS.indexOf(c)));
}

/* ---- the panel, read out of the artifact that actually ships ---- */
const panelVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "download", "panel-version.json"), "utf8")).v;
const ccx = path.join(ROOT, "docs", "download", "HNK_Ai_Panel_v" + panelVersion + ".ccx");
const registry = execFileSync("unzip", ["-p", ccx, "src/workflows/workflow-registry.js"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const wfBlock = (registry.match(/var\s+WORKFLOWS\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || "";
const panelWorkflows = [...wfBlock.matchAll(/\bid:\s*"([^"]+)",\s*title:\s*"([^"]+)"/g)].map(m => ({ id: m[1], title: m[2] }));

(async () => {
  const browser = seed.withPremium(await chromium.launch());
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "networkidle" });
  /* the statline is written by the dash builder, after the data blobs parse;
     wait for the element to hold a number rather than for a fixed delay */
  await page.waitForFunction(() => {
    const e = document.getElementById("stTapCount");
    return e && /^\d+$/.test(e.textContent.trim());
  }, null, { timeout: 15000 }).catch(() => {});

  const live = await page.evaluate(() => {
    const g = id => {
      const e = document.getElementById(id);
      return e ? e.textContent.trim() : null;
    };
    return {
      tap: g("stTapCount"), lib: g("stLibCount"), wf: g("stWfCount"),
      meitu: g("stMeituCount"), evoto: g("stEvotoCount"),
    };
  });
  await browser.close();

  report("A) the app renders every statline count at runtime",
    Object.values(live).every(v => /^\d+$/.test(v || "")), live);

  /* ---- B) the app's own pre-JS fallbacks ---- */
  const FB_IDS = { stTapCount: "tap", stLibCount: "lib", stWfCount: "wf", stMeituCount: "meitu", stEvotoCount: "evoto" };
  const staleFb = [];
  for (const [id, key] of Object.entries(FB_IDS)) {
    const m = APP.match(new RegExp('<b id="' + id + '">(\\d*)</b>'));
    const html = m ? m[1] : null;
    /* an empty fallback is a deliberate choice, not staleness */
    if (html && html !== live[key]) staleFb.push({ id, html, runtime: live[key] });
  }
  report("B) the app's static statline fallbacks match what it renders",
    staleFb.length === 0, staleFb);

  /* ---- E) the panel is self-describing too ---- */
  report("E) the shipped .ccx defines a readable workflow registry",
    panelWorkflows.length >= 5, { version: panelVersion, count: panelWorkflows.length });

  /* ---- C/D) every labelled number on the landing ----

     Each hit is attributed to the nearest preceding i18n key, which is how the
     two products are told apart. Keys are matched in the same pass for both
     dictionary shapes the page uses: the shared block spells a key once with a
     per-language object, the per-locale packs spell it with a plain string. */
  const WEB = { "One-Tap": "tap", "Visual Library": "lib", "Meitu": "meitu", "Evoto": "evoto" };
  const PANEL_KEY = /^(duo2\.|s5\.|wf\.)/;

  const labelRe = /(One-Tap|Smart Workflows?|Visual Library|Meitu(?: Controls| Studio)?|Evoto(?: Pro)?)\s*([0-9၀-၉]+)|([0-9၀-၉]+)\s+(Smart Workflows?|One-Tap|Visual Library)/g;
  /* Two markers name a key, and the page uses both: the dictionaries write
     "duo2.li2": …, while the static HTML that paints before i18n runs writes
     data-i18n="duo2.li2" on the element. Reading only the first would leave
     every pre-JS string unattributed — and the pre-JS strings are exactly the
     ones that go stale, because nobody re-reads them. */
  const keyRe = /"([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)"\s*:|data-i18n="([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)"/g;

  /* one linear pass so "nearest preceding key" costs nothing */
  const keyAt = [];
  let k;
  while ((k = keyRe.exec(LANDING))) keyAt.push([k.index, k[1] || k[2]]);
  function bucketFor(idx) {
    let lo = 0, hi = keyAt.length - 1, best = "(static html)";
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (keyAt[mid][0] < idx) { best = keyAt[mid][1]; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }

  const mismatches = [];
  let checked = 0;
  let m;
  while ((m = labelRe.exec(LANDING))) {
    const label = (m[1] || m[4]).replace(/s$/, "").replace(/ (Controls|Pro)$/, "");
    const got = toAscii(m[2] || m[3]);
    const key = bucketFor(m.index);
    let want;
    if (label === "Smart Workflow") want = PANEL_KEY.test(key) ? String(panelWorkflows.length) : live.wf;
    else want = live[WEB[label]];
    if (!want) continue;
    checked++;
    if (got !== want) mismatches.push({ key, label, got, want, at: LANDING.slice(0, m.index).split("\n").length });
  }
  report("C) every labelled count on the landing matches its product's runtime value",
    checked >= 150 && mismatches.length === 0, { checked, mismatches: mismatches.slice(0, 12), total: mismatches.length });

  /* D) the Myanmar-numeral path is exercised, not merely available — if the
     page ever stops spelling a count in Myanmar digits this assertion says so
     rather than passing vacuously on an untested code path */
  const myNumeric = [...LANDING.matchAll(/(One-Tap|Smart Workflows?|Visual Library|Meitu|Evoto)[^0-9၀-၉]{0,4}[၀-၉]+/g)];
  report("D) Myanmar-numeral counts exist on the page and were checked above",
    myNumeric.length > 0, { myanmarNumeralCounts: myNumeric.length });

  /* ---- C2) the app's OWN meta/OG/Twitter descriptions ----

     The same drift lived here: docs/app/index.html's three link-preview
     descriptions each said "One-Tap 131" while the page they describe
     rendered 138. Nobody re-reads a <meta> tag, so nobody saw it. Only the
     web-app labels are checked in this file — the app never advertises the
     panel's count. */
  const appMeta = [...APP.matchAll(/<meta[^>]+(?:name|property)="(description|og:description|twitter:description)"[^>]*content="([^"]*)"/g)];
  const appMetaBad = [];
  for (const [, which, content] of appMeta) {
    let mm;
    const re = new RegExp(labelRe.source, "g");
    while ((mm = re.exec(content))) {
      const label = (mm[1] || mm[4]).replace(/s$/, "").replace(/ (Controls|Pro|Studio)$/, "");
      const got = toAscii(mm[2] || mm[3]);
      const want = label === "Smart Workflow" ? live.wf : live[WEB[label]];
      if (want && got !== want) appMetaBad.push({ which, label, got, want });
    }
  }
  report("C2) the app's own link-preview descriptions quote its runtime counts",
    appMeta.length >= 3 && appMetaBad.length === 0, { descriptions: appMeta.length, bad: appMetaBad });

  /* ---- F) the panel's workflow names ---- */
  const landingWf = [...LANDING.matchAll(/"wf\.(\d+)"\s*:\s*\{\s*"my"\s*:\s*"([^"]*)"/g)].map(x => x[2]);
  const panelTitles = panelWorkflows.map(w => w.title);
  const missing = panelTitles.filter(t => landingWf.indexOf(t) < 0);
  const extra = landingWf.filter(t => panelTitles.indexOf(t) < 0);
  report("F) the landing lists exactly the workflows the .ccx defines",
    landingWf.length === panelTitles.length && missing.length === 0 && extra.length === 0,
    { landing: landingWf.length, panel: panelTitles.length, missing, extra });

  /* ---- G) the share sheet ---- */
  const shareFb = (APP.match(/shareTapCount\s*=\s*\([^)]*\)\s*\|\|\s*"(\d+)"/) || [])[1];
  report("G) the share-sheet fallback count matches the runtime value",
    !shareFb || shareFb === live.tap, { shareFb, runtime: live.tap });

  console.log("\n      app runtime: One-Tap " + live.tap + " · Visual Library " + live.lib +
    " · Smart Workflow " + live.wf + " · Meitu " + live.meitu + " · Evoto " + live.evoto);
  console.log("      panel v" + panelVersion + ": " + panelWorkflows.length + " Smart Workflows (" +
    panelWorkflows.map(w => w.id).join(", ") + ")");
  console.log("      " + checked + " labelled numbers on docs/index.html attributed and checked");
  console.log("      (nothing here is a literal — change the shipped data or the .ccx and this " +
    "test reports the new number, naming every file that still carries the old one)");

  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
