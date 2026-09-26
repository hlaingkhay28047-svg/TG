/* 6.138.0 / panel 6.209.0 — THE WHOLE BOOK AT ONCE, AND THE DEVICE'S PROMISE TO KEEP IT.
 *
 * TWO THINGS THE STUDIO WAS DOING BY HAND, OR NOT BEING TOLD.
 *
 * (a) THE BOOK, FRAME BY FRAME. The overlay, the background, the ornaments, the logo, the design
 *     and the template have each had an "on every page" button for releases — alb_ovl_all,
 *     alb_bg_all, alb_orn_all, alb_logo_all, alb_design_all, alb_tpl_all. The frame's own
 *     treatment never did. 6.121.0 gave a frame six looks and 6.137.0 gave it an exposure and a
 *     contrast, and a studio who wanted the book black and white, or the book a stop brighter,
 *     pressed forty frames one at a time. One button now carries the selected frame's look, its
 *     exposure and its contrast to every photograph on every page — the three together, because
 *     they ARE the frame's treatment and "make them all like this one" means this one.
 *
 * (b) A PROMISE NOBODY READ. The app has called navigator.storage.persist() since the storage
 *     work and thrown the answer away, which made it a wish rather than a fact. Chrome and an
 *     installed Android app are granted it almost always; Safari on iPhone commonly refuses —
 *     and a refused promise means the browser may evict a wedding album when the phone runs
 *     short of room. The answer is kept now, asked again when Setup opens, and the Storage card
 *     says in words which of the two is true. The panel has no counterpart: a plugin writes real
 *     files into a real data folder and nothing evicts them.
 *
 * A) source pins   B) lookAll over a real album in a real browser   C) the Storage card's line
 * D) the words, in every language both surfaces speak   E) release pins
 * Usage: PORT=8931 node test/verify_album_all_6138.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const MOD = read("docs/app/data/album-module.js");
const APP = read("docs/app/index.html");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const PANELMOD = read("panel/js/hnk_album.js");
const PARITY = read("test/verify_panel_page_parity.js");
const A = require(path.join(ROOT, "tools", "lib", "app-data.js"));
const VER = "6.138.0", PVER = "6.209.0";
const COUNT = 280;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const READERS = ["bn", "gu", "hi", "ja", "km", "kn", "ko", "lo", "ml", "mr", "ne", "pa", "ta", "te", "ur"];
const ALB_KEYS = ["alb_fx_all", "alb_fx_all_done", "alb_fx_all_none"];
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}

/* ===================== A) source pins ===================== */

function partA() {
  report("A1) the frame's treatment joins the six controls that already reach every page, and it carries all three parts — a studio thinking \"all like this one\" means the look AND the light",
    has(MOD, "function lookAll(){") &&
    has(MOD, "ps[j].fx = fx; ps[j].ev = ev; ps[j].ct = ct;") &&
    has(MOD, 'var fx = (FX_LIST.indexOf(o.fx || "") >= 0) ? (o.fx || "") : "";') &&
    has(MOD, "lookAll: function(){ return lookAll(); },") &&
    ["alb_ovl_all", "alb_bg_all", "alb_orn_all", "alb_logo_all", "alb_design_all", "alb_tpl_all"].every((k) => has(MOD, k)));

  report("A2) it reaches pages and stops there: the tray is the source list, and a photograph nobody has placed has not been given a look to keep",
    has(MOD, "for (i = 0; i < DOC.pages.length; i++){") &&
    !/lookAll[\s\S]{0,600}DOC\.pool/.test(MOD),
    { poolTouched: /lookAll[\s\S]{0,600}DOC\.pool/.test(MOD) });

  report("A3) the button is on the frame's own bar, under the two light rows, and says what it will do before it does it",
    has(MOD, 'fxAll.id = "albFxAll";') && has(MOD, 'farow.id = "albSelFxAll";') &&
    MOD.indexOf('farow.id = "albSelFxAll"') > MOD.indexOf('crow.id = "albSelCt"') &&
    has(MOD, 'L(n ? "alb_fx_all_done" : "alb_fx_all_none").replace("{N}", String(n))'));

  report("A4) persist() keeps its answer now — read first, asked once if it was never granted, remembered either way, and asked again when the studio opens Setup",
    has(APP, "var PERSIST = { known: false, on: false };") &&
    has(APP, "function persistAsk(){") &&
    has(APP, "navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false)") &&
    /PERSIST\.known = true; PERSIST\.on = !!yes;/.test(APP) &&
    has(APP, "  try { persistAsk(); } catch(e){}") &&
    has(APP, "  try{ persistAsk(); }catch(e){}") &&
    !/navigator\.storage\.persist\(\);\s*\} catch\(e\)\{\}/.test(APP),
    { oldFireAndForget: /navigator\.storage\.persist\(\);\s*\} catch\(e\)\{\}/.test(APP) });

  report("A5) the card says nothing until the browser has actually answered — a line that guesses about a studio's albums is worse than no line",
    has(APP, '$("storeKeep").textContent = PERSIST.known ? L9(PERSIST.on ? STORE_W.keepYes : STORE_W.keepNo) : "";') &&
    has(APP, '<p class="mut" id="storeKeep"></p>'));

  report("A6) the promise is the app's alone and the parity walk is told so by name: a plugin writes real files into a real folder and nothing evicts them",
    !has(PANELMOD, "storeKeep") && !has(read("panel/index.html"), "storeKeep") &&
    /6\.138\.0 — whether the browser has promised not to evict/.test(PARITY));
}

/* ===================== the browser ===================== */

async function openAlbum(page) {
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(BASE + "/index.html?page=pgAlbum", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => typeof ALBUM !== "undefined" && document.getElementById("albCanvas"), null, { timeout: 25000 });
  await page.evaluate(async () => {
    function mk(w, h, c1, c2) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const x = cv.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2);
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      return cv.toDataURL("image/jpeg", 0.9);
    }
    /* enough photographs to fill more than one spread, so "every page" means something */
    const shots = [];
    const pairs = [["#8a5a2a", "#28406a"], ["#3a7a6a", "#7a2222"], ["#5a3a7a", "#2a6a3a"],
      ["#7a5a2a", "#2a4a7a"], ["#2a7a7a", "#7a2a5a"], ["#4a4a2a", "#2a2a6a"],
      ["#6a2a2a", "#2a6a6a"], ["#3a3a7a", "#7a6a2a"]];
    for (let i = 0; i < pairs.length; i++) shots.push(mk(1200 + i, 1600, pairs[i][0], pairs[i][1]));
    await ALBUM.accept(shots, "album");
  });
  await page.waitForTimeout(1200);
}

/* ===================== B) lookAll over a real album ===================== */

async function partB(page) {
  const b0 = await page.evaluate(() => {
    const d = ALBUM.doc();
    return { pages: d.pages.length, photos: d.pages.reduce((a, p) => a + (p.photos || []).length, 0), cur: d.cur };
  });
  report("B0) the fixture is a real book: more than one page, and photographs on more than one of them",
    b0.pages >= 2 && b0.photos >= 4, b0);

  const b1 = await page.evaluate(async () => {
    ALBUM.select("photo", 0);
    await new Promise((r) => setTimeout(r, 300));
    const id = (s) => document.getElementById(s);
    id("albFx_bw").click(); await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 3; i++) { id("albEvUp").click(); await new Promise((r) => setTimeout(r, 80)); }
    for (let i = 0; i < 2; i++) { id("albCtDn").click(); await new Promise((r) => setTimeout(r, 80)); }
    await new Promise((r) => setTimeout(r, 300));
    const d = ALBUM.doc(), cur = d.pages[d.cur].photos[0];
    const others = [];
    d.pages.forEach((p, pi) => (p.photos || []).forEach((ph, i) => { if (!(pi === d.cur && i === 0)) others.push({ fx: ph.fx || "", ev: ph.ev || 0, ct: ph.ct || 0 }); }));
    return { one: { fx: cur.fx, ev: cur.ev, ct: cur.ct }, others: others, hasAll: !!id("albFxAll") };
  });
  report("B1) one frame is given a whole treatment — black and white, +3 of light, −2 of contrast — and every other frame in the book is still untouched",
    b1.one.fx === "bw" && b1.one.ev === 3 && b1.one.ct === -2 && b1.hasAll &&
    b1.others.length >= 3 && b1.others.every((o) => o.fx === "" && o.ev === 0 && o.ct === 0), b1);

  const b2 = await page.evaluate(async () => {
    document.getElementById("albFxAll").click();
    await new Promise((r) => setTimeout(r, 900));
    const d = ALBUM.doc();
    const all = [];
    d.pages.forEach((p) => (p.photos || []).forEach((ph) => all.push({ fx: ph.fx || "", ev: ph.ev || 0, ct: ph.ct || 0 })));
    const pool = (d.pool || []).map((ph) => ({ fx: ph.fx || "", ev: ph.ev || 0, ct: ph.ct || 0 }));
    const toast = (document.querySelector(".toast, #albToast, [role=status]") || {}).textContent || "";
    return { all: all, pool: pool, n: all.length, toast: toast };
  });
  report("B2) one press and the whole book wears it: every photograph on every page carries the same look, the same exposure and the same contrast",
    b2.n >= 4 && b2.all.every((o) => o.fx === "bw" && o.ev === 3 && o.ct === -2), b2);

  report("B3) and it stops at the pages — the tray keeps its photographs as they arrived, so placing one later is not a surprise",
    b2.pool.length === 0 || b2.pool.every((o) => o.fx === "" && o.ev === 0 && o.ct === 0),
    { pool: b2.pool.slice(0, 4) });

  const b4 = await page.evaluate(async () => {
    /* the book keeps it across a record round trip, and one frame can still differ afterwards */
    const copy = JSON.parse(JSON.stringify(ALBUM.doc()));
    ALBUM.setDoc(copy);
    await new Promise((r) => setTimeout(r, 500));
    const d = ALBUM.doc();
    const kept = d.pages.every((p) => (p.photos || []).every((ph) => ph.fx === "bw" && ph.ev === 3 && ph.ct === -2));
    ALBUM.select("photo", 0);
    await new Promise((r) => setTimeout(r, 250));
    document.getElementById("albEvZero").click();
    await new Promise((r) => setTimeout(r, 400));
    const d2 = ALBUM.doc(), one = d2.pages[d2.cur].photos[0];
    const rest = [];
    d2.pages.forEach((p, pi) => (p.photos || []).forEach((ph, i) => { if (!(pi === d2.cur && i === 0)) rest.push(ph.ev); }));
    return { kept: kept, one: one.ev, rest: rest };
  });
  report("B4) the book keeps it through a save and a reload, and afterwards a single frame can still be taken back on its own — \"all like this one\" is a move, not a lock",
    b4.kept === true && b4.one === 0 && b4.rest.every((v) => v === 3), b4);
}

/* ===================== C) the Storage card's line ===================== */

async function partC(page) {
  const c = await page.evaluate(async () => {
    switchPage("pgHome");
    await new Promise((r) => setTimeout(r, 400));
    await persistAsk();
    await new Promise((r) => setTimeout(r, 200));
    const el = document.getElementById("storeKeep");
    const said = el ? el.textContent : null;
    /* and the other answer, forced, so both sentences are proved to reach the card */
    const was = PERSIST.on;
    PERSIST.on = !was; renderStorageW();
    const other = document.getElementById("storeKeep").textContent;
    PERSIST.known = false; renderStorageW();
    const silent = document.getElementById("storeKeep").textContent;
    PERSIST.known = true; PERSIST.on = was; renderStorageW();
    return { said: said, other: other, silent: silent, known: PERSIST.known, on: PERSIST.on };
  });
  report("C1) the card says one of the two sentences once the browser has answered, the other one when the answer is the other way, and nothing at all while it does not know yet",
    typeof c.said === "string" && c.said.length > 10 && c.other.length > 10 && c.said !== c.other &&
    c.silent === "" && /^[✓⚠]/.test(c.said) && /^[✓⚠]/.test(c.other), c);

  report("C2) whichever answer this browser gave, the sentence that warns names the way out — export the album that matters — because a warning with no move is just worry",
    (function () {
      const warn = /^⚠/.test(c.said) ? c.said : c.other;
      return /Album|album/.test(warn) && warn.length > 40;
    })(), { said: c.said, other: c.other });
}

/* ===================== D) the words ===================== */

function partD() {
  const shell = (function () {
    const i = APP.indexOf("\nvar TR_PH={"); const j = APP.indexOf("\n};", i);
    return new Function("return " + APP.slice(i + 1, j + 3).replace(/^var TR_PH=/, "").replace(/;$/, ""))();
  })();
  const l14 = A.readTrMore().l14 || {};
  const gaps = [];
  ALB_KEYS.forEach((k) => LANGS.forEach((l) => {
    const v = (shell[k] && shell[k][l]) || (l14[k] && l14[k][l]) || "";
    if (typeof v !== "string" || !v) gaps.push(k + "." + l);
  }));
  report("D1) the album's three new lines exist in all nine languages the panel speaks",
    gaps.length === 0, gaps.slice(0, 6));

  const trl = A.readTrl();
  const rgaps = [];
  READERS.forEach((c) => ALB_KEYS.forEach((k) => { if (!trl[c] || !trl[c][k]) rgaps.push(c + "." + k); }));
  report("D2) and in all fifteen reader packs, so no studio meets an English button in the middle of their own language",
    rgaps.length === 0, rgaps.slice(0, 6));

  const ps = (function () {
    const i = PANELMOD.indexOf("globalThis.HNK.albumStrings = ");
    const j = PANELMOD.indexOf("\n", i);
    return JSON.parse(PANELMOD.slice(i + "globalThis.HNK.albumStrings = ".length, j).replace(/;\s*$/, ""));
  })();
  report("D3) the panel's lifted copy carries the button and the code, so the plugin gets the same move on the same day",
    ALB_KEYS.every((k) => ps[k] && LANGS.every((l) => ps[k][l])) &&
    has(PANELMOD, "function lookAll(){") && has(PANELMOD, 'fxAll.id = "albFxAll";'));

  const keep = ["keepYes", "keepNo"];
  const sw = (function () {
    const i = APP.indexOf("var STORE_W = {");
    let j = APP.indexOf("{", i), d = 0, k = j;
    for (; k < APP.length; k++) { const c = APP[k]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { k++; break; } } }
    return eval("(" + APP.slice(j, k) + ")");
  })();
  report("D4) both storage sentences are written in all nine languages too — the phone that refuses is not only an English-speaking phone",
    keep.every((k) => sw[k] && LANGS.every((l) => typeof sw[k][l] === "string" && sw[k][l].length > 5)),
    keep.filter((k) => !sw[k] || LANGS.some((l) => !sw[k] || !sw[k][l])));
}

/* ===================== E) release pins ===================== */

function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the album-light check it follows",
    steps === COUNT && has(CI, "node test/verify_album_all_6138.js") &&
    CI.indexOf("verify_album_all_6138.js") > CI.indexOf("verify_album_light_6137.js"), { steps: steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(read("panel/main.js"), 'const PANEL_VERSION = "' + PVER + '";') &&
    has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(MOD, 'var APP_MARK = "' + VER + '";'));
  const WN = read("docs/app/data/whatsnew.js");
  const i = WN.indexOf('"' + VER + '"');
  report("E3) What's New leads with the " + VER + " row and the landing counts " + COUNT + " tests",
    i > 0 && i < 4000 && has(LANDING, COUNT + " tests") &&
    new RegExp('data-count="tests">' + COUNT + '<').test(LANDING), { at: i });
}

/* ===================== run ===================== */

(async function main() {
  partA();
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    await openAlbum(page);
    await partB(page);
    await partC(page);
    report("C3) none of that raised an error on the page", errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})();
