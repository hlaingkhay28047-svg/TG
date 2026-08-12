/* Visual Library sweep — the set-browse row and the additive image wave.

   The Library grew from 366 to 408 items in v4.33.0 and the collections it
   ships (Reference alone is 246) are far too broad to browse, so a second
   chip row filters by set. This sweep locks in both halves:

     1. every count the UI shows comes from the data, not a literal
     2. the set row hides on Featured and appears once a collection is chosen
     3. picking a set narrows the grid to exactly that set's item count
     4. changing collection clears the set (no impossible collection×set pair)
     5. search still reaches the newly added items
     6. every item the data claims has a real /ui/ thumb and /full/ image
     7. the pre-existing ids are all still present — this wave was additive

   Usage: PORT=8931 node test/sweep_library.js   (serve docs/app on $PORT) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

let failures = 0;
function check(ok, label, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + label + (ok ? "" : "  " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", e => { console.log("PAGEERROR:", String(e).slice(0, 300)); failures++; });
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => { switchPage("pgLib"); });
  await page.waitForTimeout(300);

  /* ---- 1) counts come from the data ---- */
  const counts = await page.evaluate(() => {
    const sum = Object.keys(LW.collections).reduce((a, k) => a + LW.collections[k], 0);
    return {
      items: LW.items.length,
      libTotal: (document.getElementById("libTotal") || {}).textContent,
      stLib: (document.getElementById("stLibCount") || {}).textContent,
      collSum: sum,
      /* Prose counts drifted twice before this check existed, so rather than
         chasing one stale literal it reads every phrase that claims a library
         size — in all nine languages, Burmese numerals included — and asserts
         each one equals the shipped item count. A future wave that forgets to
         update the copy fails here without anyone editing this test. */
      staleProse: (function(){
        var MY = "\u1040\u1041\u1042\u1043\u1044\u1045\u1046\u1047\u1048\u1049";
        var txt = document.body.innerText + " " +
          Array.from(document.querySelectorAll("meta[name=description],meta[property='og:description']"))
            .map(function(m){ return m.content; }).join(" ");
        var west = txt.replace(new RegExp("[" + MY + "]", "g"), function(d){ return String(MY.indexOf(d)); });
        var pats = [/Visual Library\s+(\d+)/g, /Library\s+(\d+)/g, /(\d+)\s*-?\s*image Library/g,
                    /Look\s+(\d+)/g, /(\d+)\s+curated looks/g, /(\d+)\s+look/gi];
        var bad = [];
        pats.forEach(function(re){
          var m; while ((m = re.exec(west))) if (m[1] !== String(LW.items.length)) bad.push(m[0].trim());
        });
        return bad;
      })()
    };
  });
  check(String(counts.items) === String(counts.libTotal) &&
        String(counts.items) === String(counts.stLib) &&
        counts.collSum === counts.items && counts.staleProse.length === 0,
    "every library count is runtime, and every phrase claiming a library size — nine languages, Burmese numerals included — matches the shipped count",
    counts);

  /* ---- 2) the set row hides on Featured, shows on a collection ---- */
  const rowFeatured = await page.evaluate(() => ({
    filter: lib.filter,
    display: getComputedStyle(document.getElementById("libGroups")).display,
    chips: document.getElementById("libGroups").children.length
  }));
  check(rowFeatured.filter === "featured" && rowFeatured.display === "none",
    "set row is hidden while Featured (a hand-picked list, not a slice of the data) is active",
    rowFeatured);

  const rowColl = await page.evaluate(() => {
    lib.filter = "Lighting"; lib.group = ""; lib.shown = 0;
    renderLibFilters(); renderLibGroups(); renderLibGrid(true);
    const host = document.getElementById("libGroups");
    return {
      display: getComputedStyle(host).display,
      labels: Array.from(host.children).map(b => b.textContent),
      firstOn: host.children[0].className.indexOf("on") >= 0
    };
  });
  check(rowColl.display !== "none" && rowColl.labels.length > 2 && rowColl.firstOn &&
        rowColl.labels.some(l => /^Snoot Lighting \(\d+\)$/.test(l)),
    "choosing a collection reveals its sets, 'all sets' selected, each chip carrying its own count",
    rowColl);

  /* ---- 3) picking a set narrows the grid to exactly that set ---- */
  const narrowed = await page.evaluate(() => {
    const expected = LW.items.filter(it => it.c === "Lighting" && it.g === "Snoot Lighting").length;
    const host = document.getElementById("libGroups");
    const chip = Array.from(host.children).find(b => b.textContent.indexOf("Snoot Lighting") === 0);
    chip.click();
    return {
      expected,
      listed: lib.list.length,
      group: lib.group,
      allInSet: lib.list.every(it => it.g === "Snoot Lighting"),
      chipOn: Array.from(document.getElementById("libGroups").children)
        .filter(b => b.className.indexOf("on") >= 0).length
    };
  });
  check(narrowed.listed === narrowed.expected && narrowed.expected >= 26 &&
        narrowed.allInSet && narrowed.chipOn === 1,
    "picking a set filters the grid to exactly that set (and exactly one chip reads selected)",
    narrowed);

  /* ---- 4) changing collection clears the set ---- */
  const cleared = await page.evaluate(() => {
    const chip = Array.from(document.getElementById("libFilters").children)
      .find(b => b.textContent.indexOf("Reference") === 0);
    chip.click();
    return {
      filter: lib.filter, group: lib.group,
      listed: lib.list.length,
      expected: LW.items.filter(it => it.c === "Reference").length
    };
  });
  check(cleared.filter === "Reference" && cleared.group === "" &&
        cleared.listed === cleared.expected,
    "switching collection clears the set, so no impossible collection×set pair can be selected",
    cleared);

  /* ---- 5) search reaches the new items ---- */
  const searched = await page.evaluate(() => {
    lib.filter = "all"; lib.group = ""; document.getElementById("libSearch").value = "snoot";
    document.getElementById("libSearch").dispatchEvent(new Event("input"));
    const snoot = lib.list.length;
    document.getElementById("libSearch").value = "newborn";
    document.getElementById("libSearch").dispatchEvent(new Event("input"));
    const newborn = lib.list.length;
    document.getElementById("libSearch").value = "";
    document.getElementById("libSearch").dispatchEvent(new Event("input"));
    return { snoot, newborn, cleared: lib.list.length, total: LW.items.length };
  });
  check(searched.snoot >= 26 && searched.newborn >= 4 && searched.cleared === searched.total,
    "search finds the newly added sets by name and clearing it restores the full list", searched);

  /* ---- 6) every item resolves to real files ---- */
  const ids = await page.evaluate(() => LW.items.map(it => it.id));
  const missing = [];
  for (const id of ids) {
    for (const dir of ["ui", "full"]) {
      const r = await page.evaluate(async u => (await fetch(u, { method: "HEAD" })).status,
        `lib/${dir}/${id}.jpg`);
      if (r !== 200) missing.push(`${dir}/${id}:${r}`);
    }
  }
  check(missing.length === 0, `all ${ids.length} items have a thumb and a full image on disk`,
    missing.slice(0, 10));

  /* ---- 7) the wave was additive ---- */
  const additive = await page.evaluate(() => {
    const nums = LW.items.map(it => parseInt(it.id.split("-").pop(), 10)).sort((a, b) => a - b);
    const firstGap = nums.findIndex((n, i) => n !== i + 1);
    return { total: nums.length, min: nums[0], max: nums[nums.length - 1], firstGap };
  });
  check(additive.min === 1 && additive.firstGap === -1 && additive.max === additive.total,
    "ids run 1..N with no gaps — nothing was removed or renumbered by the additive wave",
    additive);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
