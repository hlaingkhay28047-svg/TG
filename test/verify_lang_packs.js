/* v6.92.0 — THE PACKS LEFT THE SHELL.
 *
 * Eighteen languages carry a native dictionary of their own (v4.43 → v4.77:
 * hi bn ta te mr gu kn ml pa ur ne lo km ja ko, and the three Tai scripts
 * tdd kht khb). Until 6.91.0 all eighteen sat inline in docs/app/index.html —
 * 518 KB (121 KB gzipped) that every visitor downloaded on every release,
 * of which a Burmese or English student used none, and a Hindi student one
 * eighteenth. Now each pack is data/trl-<code>.js (window.HNK_TRL.<code> =
 * the dictionary, the Account Center Panel copy baked in) and a small loader
 * script in the shell, run before the main script, writes the <script src>
 * for the chosen language only — a link's ?lang= first, then the stored
 * choice, mirroring the app's own LANG rule — under the file's content tag,
 * so the service worker's data cache keeps it across releases. TR_L is the
 * very object the loader filled; the studio lifter and the tests that read
 * every language load all eighteen into it (test/lib/trl-packs.js). The
 * Imagine tables (250 KB) left the same way as data/imagine.js, inlined back
 * into the panel's copy of the module by its lifter.
 *
 * This file pins the packs and the shell (A), runs the loader in a VM over
 * every rule and every hostile code (B), boots the real app under seven
 * language states (C), pins the panel and the lifters (D), the release (E),
 * and proves the scans bite (F).
 *
 * Usage: PORT=8931 node test/verify_lang_packs.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const A = require("../tools/lib/app-data.js");

const ROOT = A.ROOT;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const SW = read("docs/app/sw.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const PANEL_SUITES = read("panel/js/hnk_studio_suites.js");
const PANEL_IM = read("panel/js/hnk_imagine.js");
const PANEL_WN = read("panel/js/hnk_whats_new.js");
const STUDIO_LIFTER = read("tools/build_panel_studio_suites.js");
const IMAGINE_LIFTER = read("tools/build_panel_imagine.js");
const HELPER = read("test/lib/trl-packs.js");
const BASE = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------------- A. the packs and the shell ---------------- */
const packs = A.readTrl(), tags = A.trlTags(), CODES = A.TRL_CODES;
const s0 = APP.indexOf('var LANG = "my";'), s1 = APP.indexOf("function L9(o){", s0);
const box = { localStorage: { getItem() { return null; } }, window: { HNK_TRL: {}, HNK_TRL_TAGS: tags } };
vm.runInNewContext(APP.slice(s0, s1), box);
const TR = box.TR;
/* the scan: a pack may carry only keys the nine full sets carry, every value a non-empty string */
function scanPacks(set) {
  const bad = [];
  Object.keys(set).forEach((c) => Object.keys(set[c]).forEach((k) => {
    if (!TR || TR[k] === undefined) bad.push(c + "." + k + " (no such key)");
    else if (typeof set[c][k] !== "string" || !set[c][k].trim()) bad.push(c + "." + k + " (blank)");
  }));
  return bad;
}
report("A1) eighteen packs, each a dictionary of 200+ keys the nine full sets carry, every value a non-empty string (" + CODES.map((c) => c + ":" + Object.keys(packs[c]).length).join(" ") + ")",
  CODES.length === 18 && TR && Object.keys(TR).length > 200 && CODES.every((c) => Object.keys(packs[c]).length >= 200) && scanPacks(packs).length === 0,
  { bad: scanPacks(packs).slice(0, 8), tr: TR && Object.keys(TR).length });
report("A2) every pack carries the Account Center Panel copy that TR_PANEL_L used to merge in at boot (acc_panel_h · acc_panel_p · acc_panel_dl), and the shell no longer carries that table or the merge",
  CODES.every((c) => ["acc_panel_h", "acc_panel_p", "acc_panel_dl"].every((k) => typeof packs[c][k] === "string" && packs[c][k].length > 3)) &&
  APP.indexOf("TR_PANEL_L") < 0 && APP.indexOf("\nvar TR_L={") < 0, null);
const loaderAt = APP.indexOf("window.HNK_TRL_TAGS="), mainAt = APP.indexOf("var LANG = \"my\";"), imAt = APP.indexOf('<script src="data/imagine.js?v=');
report("A3) the shell reads TR_L off window.HNK_TRL (the loader's object), names every pack in TR_L_CODES, carries the loader's table with each pack's own content tag today, and tests a link's language with hasOwnProperty",
  APP.split("window.HNK_TRL = window.HNK_TRL || {};\nvar TR_L = window.HNK_TRL;\nvar TR_L_CODES = window.HNK_TRL_TAGS || {};").length === 2 &&
  APP.indexOf(A.trlTagsLine()) === loaderAt && loaderAt > imAt && imAt > 0 && loaderAt < mainAt &&
  APP.indexOf("Object.prototype.hasOwnProperty.call(TR_L_CODES, _urlLang)") > mainAt && box.TR_L === box.window.HNK_TRL && Object.keys(box.TR_L_CODES).length === 18,
  { loaderAt, imAt, mainAt });
const loaderEnd = APP.indexOf("</script>", loaderAt);
const LOADER = APP.slice(loaderAt, loaderEnd);
report("A4) the loader: a fixed table, hasOwnProperty on it, the nine base codes need no pack, a two-or-three-letter code only, and the one document.write builds the address from the table — never from the link",
  /var T=window\.HNK_TRL_TAGS, has=function\(k\)\{ return Object\.prototype\.hasOwnProperty\.call\(T,k\); \};/.test(LOADER) &&
  /BASE=\/\^\(my\|en\|shn\|kac\|th\|zh\|vi\|id\|ms\)\$\//.test(LOADER) && /if\(has\(code\) && \/\^\[a-z\]\{2,3\}\$\/\.test\(code\)\) document\.write\('<script src="data\/trl-'\+code\+'\.js\?v='\+T\[code\]\+'"><\\\/script>'\);/.test(LOADER) &&
  (LOADER.match(/document\.write/g) || []).length === 1 && /localStorage\.getItem\("hnk_ws_lang"\)/.test(LOADER) && /get\("lang"\)/.test(LOADER), { loader: LOADER.slice(-420) });
const dataRe = new RegExp(SW.match(/var DATA_RE = \/(.*)\/;/)[1]);
report("A5) sw.js's data branch matches every pack and the Imagine file by path and asks for a content tag in the query",
  CODES.every((c) => dataRe.test("/data/trl-" + c + ".js")) && dataRe.test("/data/imagine.js") && !dataRe.test("/data/trl-hi.json") && /\/\(\^\|\[\?&\]\)v=\[0-9a-f\]\+\//.test(SW), null);

/* ---------------- B. the loader in a VM ---------------- */
function runLoader(stored, search, table, opts) {
  const writes = [];
  const ctx = {
    window: {}, location: { search: search || "" }, URLSearchParams,
    localStorage: { getItem(k) { if (opts && opts.throwStorage) throw new Error("blocked"); return k === "hnk_ws_lang" ? stored : null; } },
    document: { write(s) { writes.push(s); } }
  };
  let code = LOADER;
  if (table) code = code.replace(/window\.HNK_TRL_TAGS=\{[^}]*\};/, "window.HNK_TRL_TAGS=" + JSON.stringify(table) + ";");
  vm.runInNewContext(code, ctx);
  return writes;
}
const matrix = [
  ["", "", null, "a first visit loads nothing"], ["my", "", null, "Burmese needs no pack"], ["en", "?lang=en", null, "English needs no pack"],
  ["hi", "", "hi", "the stored choice"], ["hi", "?lang=ta", "ta", "a link's language wins"], ["hi", "?lang=en", null, "a link to a base language wins and needs no pack"],
  ["mnw", "", null, "a retired shell code has no pack"], ["hi", "?lang=xx", "hi", "an unknown link code falls back to the stored choice"],
  ["hi", "?lang=constructor", "hi", "a prototype name is not a pack"], ["hi", "?lang=__proto__", "hi", "nor is __proto__"], ["hi", "?lang=hasOwnProperty", "hi", "nor is hasOwnProperty"],
  ["constructor", "", null, "a stored prototype name loads nothing"], ["../x", "", null, "a stored path loads nothing"], ["kht", "?lang=khb", "khb", "a Tai link over a Tai choice"]
];
const b1 = matrix.map((m) => { const w = runLoader(m[0], m[1]); const got = w.length === 0 ? null : (w[0].match(/data\/trl-([a-z]{2,3})\.js/) || [])[1]; return { case: m[3], stored: m[0], search: m[1], want: m[2], got, writes: w.length, tagOk: !w.length || w[0] === '<script src="data/trl-' + got + '.js?v=' + tags[got] + '"></script>' }; });
report("B1) the loader, run in a VM over fourteen (stored, link) states, writes exactly the pack the app's LANG rule will use — one <script> under that pack's tag — and nothing for the base languages, a retired code, a prototype name or a path",
  b1.every((r) => r.got === r.want && r.writes <= 1 && r.tagOk), b1.filter((r) => !(r.got === r.want && r.writes <= 1 && r.tagOk)));
report("B2) a blocked localStorage (private window) loads nothing and throws nothing; a table without the stored code loads nothing (the table decides, never the code alone)",
  runLoader("hi", "", null, { throwStorage: true }).length === 0 && runLoader("hi", "", { ta: tags.ta }).length === 0 && runLoader("ta", "", { ta: tags.ta }).length === 1, null);

(async () => {
  /* ---------------- C. real boots ---------------- */
  const { chromium } = require("playwright-core");
  const PORT = process.env.PORT || 8931;
  const browser = await chromium.launch();
  const errs = [];
  async function boot(stored, search) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    /* the seed is written once per tab (sessionStorage survives a reload) — C4 reloads through the picker and must see the picker's choice, not the seed again */
    await ctx.addInitScript((s) => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1");
      if (s && !sessionStorage.getItem("hnk_test_seeded")) { localStorage.setItem("hnk_ws_lang", s); sessionStorage.setItem("hnk_test_seeded", "1"); } }, stored);
    const page = await ctx.newPage(); const reqs = [];
    page.on("pageerror", (e) => errs.push(stored + search + ": " + String(e).slice(0, 160)));
    page.on("request", (r) => { const u = r.url(); if (u.indexOf("/data/trl-") >= 0) reqs.push(u.slice(u.indexOf("/data/"))); });
    await page.goto(`http://127.0.0.1:${PORT}/index.html` + search, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => ({ LANG, keys: Object.keys(TR_L), same: TR_L === window.HNK_TRL, show: t("btn_show"), panelH: t("acc_panel_h"), lang: document.documentElement.lang,
      picker: Array.from(document.querySelectorAll("#selLang option")).map((o) => o.value) }));
    return { ctx, page, reqs, r };
  }
  const c1 = await boot("", "");
  report("C1) a Burmese boot fetches no pack — TR_L is the loader's empty object, t() answers in Burmese, <html lang=\"my\">",
    c1.reqs.length === 0 && c1.r.keys.length === 0 && c1.r.same && c1.r.LANG === "my" && c1.r.lang === "my" && c1.r.show === TR.btn_show.my, { reqs: c1.reqs, r: c1.r });
  report("C2) the picker still offers every pack language beside the nine full sets",
    BASE.every((c) => c1.r.picker.indexOf(c) >= 0) && CODES.every((c) => c1.r.picker.indexOf(c) >= 0), { picker: c1.r.picker });
  await c1.ctx.close();
  const c3 = await boot("hi", "");
  report("C3) a Hindi boot fetches trl-hi.js once under its content tag and nothing else — TR_L holds hi alone, t() answers from the pack (a full key and the baked Panel copy), <html lang=\"hi\">",
    c3.reqs.length === 1 && c3.reqs[0] === "/data/trl-hi.js?v=" + tags.hi && c3.r.keys.join() === "hi" && c3.r.same && c3.r.LANG === "hi" && c3.r.lang === "hi" &&
    c3.r.show === packs.hi.btn_show && c3.r.panelH === packs.hi.acc_panel_h && /[ऀ-ॿ]/.test(c3.r.show), { reqs: c3.reqs, r: c3.r });
  /* the picker's own handler: choose Khmer → stored + reload → the reload fetches trl-km only */
  const reqs2 = []; c3.page.on("request", (r) => { const u = r.url(); if (u.indexOf("/data/trl-") >= 0) reqs2.push(u.slice(u.indexOf("/data/"))); });
  try { await c3.page.evaluate(() => { const s = document.getElementById("selLang"); s.value = "km"; s.onchange(); }); } catch (e) { /* the reload tears the context down */ }
  await c3.page.waitForLoadState("domcontentloaded"); await c3.page.waitForTimeout(1800);
  const c4 = await c3.page.evaluate(() => ({ LANG, keys: Object.keys(TR_L), show: t("btn_show"), stored: localStorage.getItem("hnk_ws_lang") }));
  report("C4) choosing Khmer in the picker stores the choice and reloads; the reload fetches trl-km.js only and t() answers in Khmer",
    c4.stored === "km" && c4.LANG === "km" && c4.keys.join() === "km" && c4.show === packs.km.btn_show && reqs2.length === 1 && reqs2[0] === "/data/trl-km.js?v=" + tags.km, { c4, reqs2 });
  await c3.ctx.close();
  const c5 = await boot("hi", "?lang=ta");
  report("C5) a link's ?lang=ta over a stored Hindi choice fetches trl-ta.js only and renders Tamil for this visit",
    c5.reqs.length === 1 && c5.reqs[0] === "/data/trl-ta.js?v=" + tags.ta && c5.r.LANG === "ta" && c5.r.keys.join() === "ta" && c5.r.show === packs.ta.btn_show, { reqs: c5.reqs, r: c5.r });
  await c5.ctx.close();
  const c6 = await boot("hi", "?lang=en");
  report("C6) a link's ?lang=en over a stored Hindi choice fetches no pack and renders English",
    c6.reqs.length === 0 && c6.r.LANG === "en" && c6.r.keys.length === 0 && c6.r.show === "Show", { reqs: c6.reqs, r: c6.r });
  await c6.ctx.close();
  const c7 = await boot("mnw", "");
  const c8 = await boot("hi", "?lang=constructor");
  report("C7) a retired shell code (mnw) boots Burmese with no pack; a link naming a prototype property keeps the stored Hindi and fetches only trl-hi.js",
    c7.reqs.length === 0 && c7.r.LANG === "my" && c8.reqs.length === 1 && c8.reqs[0] === "/data/trl-hi.js?v=" + tags.hi && c8.r.LANG === "hi", { c7: [c7.reqs, c7.r.LANG], c8: [c8.reqs, c8.r.LANG] });
  await c7.ctx.close(); await c8.ctx.close();
  await browser.close();
  report("C8) no page error across the seven boots", errs.length === 0, errs.slice(0, 4));

  /* ---------------- D. the panel and the lifters ---------------- */
  const langs = JSON.parse((PANEL_SUITES.match(/"langs":(\[[^\]]*\])/) || [])[1] || "[]");
  report("D1) the panel's lifted studio table still carries every pack language (" + langs.length + " codes) — the lifter loads all eighteen into the page before it walks t()",
    CODES.every((c) => langs.indexOf(c) >= 0) && BASE.slice(0, 2).every((c) => langs.indexOf(c) >= 0) &&
    STUDIO_LIFTER.indexOf('require("./lib/app-data.js").readTrl()') > 0 && STUDIO_LIFTER.indexOf("readTrl()") < STUDIO_LIFTER.indexOf("out.langs = Object.keys(TR_L)"), { langs });
  const imLine = "var IMAGINE_DATA = window.HNK_IMAGINE;";
  report("D2) the Imagine module reads its tables off window.HNK_IMAGINE exactly once in the app, and the panel's copy carries the same JSON inlined where that line stands (the lifter refuses a module without the line)",
    APP.split(imLine).length === 2 && PANEL_IM.indexOf("var IMAGINE_DATA = " + A.imagineText() + ";") > 0 && PANEL_IM.indexOf("= window.HNK_IMAGINE;") < 0 &&
    /throw new Error\("build_panel_imagine: the IMAGINE module must read its tables with exactly one/.test(IMAGINE_LIFTER) && IMAGINE_LIFTER.indexOf("A.imagineText()") > 0, null);
  const readers = ["sweep_v443_upgrades", "sweep_v450_upgrades", "sweep_v451_upgrades", "sweep_v461_upgrades", "sweep_v477_upgrades"];
  report("D3) test/lib/trl-packs.js loads all eighteen into window.HNK_TRL, the five sweeps that read TR_L for every language call it, and the release contract reads the packs through app-data.js",
    /window\.HNK_TRL\[c\] = packs\[c\]/.test(HELPER) && /A\.readTrl\(\)/.test(HELPER) && readers.every((t) => read("test/" + t + ".js").indexOf('require("./lib/trl-packs.js").loadAll(page)') > 0) &&
    /HNK_TRL: appData\.readTrl\(\), HNK_TRL_TAGS: appData\.trlTags\(\)/.test(read("test/verify_release_contract.js")), null);

  /* ---------------- E. release pins ---------------- */
  const appVer = APP.match(/var APP_VER="([^"]+)"/)[1];
  const packBytes = CODES.reduce((n, c) => n + Buffer.byteLength(A.wrapperText("trl-" + c), "utf8"), 0);
  report("E1) CI runs this test right after verify_app_data_files; the landing counts at least 228 tests; What's New carries the " + appVer + " row on the app and the panel; the packs weigh " + Math.round(packBytes / 1024) + " KB that the shell no longer carries",
    /verify_app_data_files\.js\n      - name: [^\n]*\n        run: PORT=8931 node test\/verify_lang_packs\.js/.test(CI) &&
    (parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10) >= 228) && APP.indexOf('{ v:"' + appVer + '"') > 0 && PANEL_WN.indexOf('{ v:"' + appVer + '"') >= 0 && packBytes > 400000, { packBytes });

  /* ---------------- F. the scans bite ---------------- */
  const hostile = JSON.parse(JSON.stringify({ hi: packs.hi })); hostile.hi.zz_no_such_key = "x"; hostile.hi.btn_show = "  ";
  const f1 = scanPacks(hostile);
  report("F1) a pack key the nine full sets lack, and a blank value, are each named by the scan",
    f1.length === 2 && f1.indexOf("hi.zz_no_such_key (no such key)") >= 0 && f1.indexOf("hi.btn_show (blank)") >= 0, f1);
  const f2 = runLoader("hi", "", Object.assign({}, tags, { hi: "0123456789ab" }));
  report("F2) the loader writes whatever tag its table carries — so a stale table would name a stale file, which is why A3 pins the table to the files' own tags today",
    f2.length === 1 && f2[0].indexOf("?v=0123456789ab") > 0, f2);

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — eighteen languages, one file each, and the shell loads only the one that was chosen.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
