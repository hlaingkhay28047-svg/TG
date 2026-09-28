/* 6.144.0 / panel 6.215.0 — THE ACCOUNT PAGE SPEAKS THE STUDIO'S LANGUAGE; THE ALBUM'S TILES LOAD LAZILY.
 *
 * The page-by-page audit after 6.142.0 (every page on a phone and a desktop: untranslated text, dead
 * controls, clipped text, eager images below the fold) found two real gaps. pgAccount showed 21 English
 * sentences in a Burmese app — the hero, the seven stat labels, the device rows, the download note and
 * every state its renderer writes (signed out · checking · compatibility · the live tiles). pgAlbum drew
 * 36 of its 37 images eagerly — the tray, the shelf, the ornaments, the library, the backgrounds, the logo.
 *
 * A) the source: ACC_UI (49 keys, nine languages), every static node of the page carries data-acc,
 *    unifiedApplyLang paints them from applyLang and repaints the renderer's states, no English literal is
 *    left in unifiedRender; the Album's seven img sites load lazily on both surfaces, the lift in sync
 * B) the web app: the page in Burmese with no untranslated sentence, every static node in each of the nine
 *    languages, the four renderer states in Burmese and English, the Album's images lazy, and no page of
 *    the app with an eager image below the fold   C) What's New   D) release pins
 * Usage: PORT=8931 node test/verify_account_lang_6144.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const WN = require("./lib/whats-new.js");
const albumLifter = require("../tools/build_panel_album.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const ALBUM = read("docs/app/data/album-module.js");
const PANEL_ALBUM = read("panel/js/hnk_album.js");
const MAIN = read("panel/main.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.149.0", PVER = "6.220.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.144.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 291;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PURE = () => STATIC_KEYS.filter((k) => RENDERED.indexOf(k) < 0);
/* five of the static nodes are the renderer's to overwrite (the banner's first words, the two slot rows, the download note):
   painted from the table until unifiedRender speaks, checked through its states in B3 */
const RENDERED = ["chk_title", "chk_text0", "phone_chk", "comp_chk", "dl_note0"];
const STATIC_KEYS = ["kick", "h1", "lede", "chk_title", "chk_text0", "st_account", "st_license", "st_expiry", "st_panelver", "st_web", "st_dl", "st_panel", "dev_h2", "dev_note", "phone_h3", "phone_chk", "enroll_phone", "phone_note", "comp_h3", "comp_chk", "enroll_comp", "comp_note", "secure_h2", "dl_note0", "open_setup", "logout"];

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 700)));
  if (!ok) failures++;
}
/* the table as the page has it, read from the source */
function readAccUi() {
  const i = APP.indexOf("var ACC_UI = {"), j = APP.indexOf("\n};\n", i);
  const m = {}; new Function("window", APP.slice(i, j + 3) + " window.ACC_UI = ACC_UI;")(m); return m.ACC_UI;
}

/* ---------------- A) the source ---------------- */
function partA() {
  const T = readAccUi();
  const keys = Object.keys(T).filter((k) => k !== "status");
  report("A1) ACC_UI: " + keys.length + " keys and " + Object.keys(T.status).length + " server status words, every one in all nine base languages",
    keys.length >= 48 && keys.every((k) => all9(T[k])) && Object.keys(T.status).length >= 9 && Object.keys(T.status).every((k) => all9(T.status[k])) &&
    T.on.en === "ON" && T.off.en === "OFF" && T.comp_only.en === "Computer only" && T.shared_slot.en === "shared slot" && T.status.active.en === "Active",
    { missing: keys.filter((k) => !all9(T[k])) });

  const page = APP.slice(APP.indexOf('<div class="page" id="pgAccount">'), APP.indexOf("<!-- /pgAccount -->"));
  const accs = (page.match(/data-acc="([a-z0-9_]+)"/g) || []).map((s) => s.slice(10, -1));
  report("A2) every static node of the page carries data-acc — " + STATIC_KEYS.length + " of them, each a key of the table — and the summary grid's aria-label follows too; the two release buttons stay the renderer's (REL_TXT)",
    accs.length === STATIC_KEYS.length && STATIC_KEYS.every((k) => accs.indexOf(k) >= 0) && accs.every((k) => !!T[k]) &&
    has(page, 'data-acc-aria="grid_aria"') && has(page, 'id="unifiedReleaseComputer" type="button" hidden>Release this Computer</button>') && !has(page, 'id="unifiedReleaseComputer" data-acc'),
    { accs, missing: STATIC_KEYS.filter((k) => accs.indexOf(k) < 0) });

  const render = APP.slice(APP.indexOf("function unifiedRender(){"), APP.indexOf("function unifiedForget(){"));
  const english = (render.match(/textContent = "[^"]*[A-Za-z]{3,}[^"]*"/g) || []).concat(render.match(/\? "[A-Z][a-z]+" : "[A-Z]/g) || []);
  report("A3) unifiedApplyLang paints the data-acc nodes and repaints the renderer, applyLang calls it after the names, unifiedStatusWord speaks the server's status words, and no English literal is left in unifiedRender (the tiles, the rows, the download notes)",
    has(APP, "function unifiedApplyLang(){") && has(APP, 'var nodes = document.querySelectorAll("#pgAccount [data-acc]");') && has(APP, "try { unifiedRender(); } catch(e){}") &&
    /a11yApplyLang\(\);\n\s*renderTutorials\(\);[^\n]*\n\s*unifiedApplyLang\(\);/.test(APP) && has(APP, "function unifiedStatusWord(v){") && (render.match(/unifiedStatusWord\(/g) || []).length === 2 &&
    has(render, "return unifiedComputerOnly(reason) ? L9(ACC_UI.comp_only) : L9(ACC_UI.off);") === false && has(APP, "return unifiedComputerOnly(reason) ? L9(ACC_UI.comp_only) : L9(ACC_UI.off);") &&
    has(render, '? L9(ACC_UI.dl_ok)') && has(render, '" · " + L9(ACC_UI.shared_slot)') && (render.match(/L9\(ACC_UI\.registered\)/g) || []).length === 2 && (render.match(/L9\(ACC_UI\.available\)/g) || []).length === 2 &&
    english.length === 0, { english });

  const lazy = (ALBUM.match(/\.loading = "lazy"; \w+\.decoding = "async";/g) || []).length;
  const lazyPanel = (PANEL_ALBUM.match(/\.loading = "lazy"; \w+\.decoding = "async";/g) || []).length;
  report("A4) the Album's seven img sites (the photo tiles, the tray, the shelf, the ornaments, the library, the backgrounds, the logo) load lazily with async decode, the panel's lift carries the same seven, and the lift reports no drift",
    lazy === 7 && lazyPanel === 7 && (ALBUM.match(/createElement\("img"\)/g) || []).length === 7 && albumLifter.build({ dry: true }).changed.length === 0, { lazy, lazyPanel, drift: albumLifter.build({ dry: true }).changed });
  const SCREEN = read("panel/src/ui/screens/retouch-studio-screen.js");
  report("A5) the page-switch budget (verify_ux_wave_6118, 900ms cold at 4x CPU) had drifted to its edge on Meitu and Album; the causes, measured with the profiler, are gone: the studio block is built in the page on the first visit (no move, no second layout pass) and its columns are measured one frame later; the Album reads one width per render pass and draws once on entry (the first drawing waits a frame for the store; the panel's host asks for it outright)",
    has(SCREEN, "function stTwoColSoon() {") && has(SCREEN, "stTwoColBind(); stTwoColSoon();") && has(SCREEN, 'if (!API && (pageKey === "meitu" || pageKey === "evoto")) {') && has(SCREEN, "if (mnt0 && cols0 && cols0.parentNode !== mnt0) { try { mnt0.appendChild(cols0); } catch (e0) { } }") &&
    has(ALBUM, "var w0 = albWidth(); BUCKET = widthBucket(w0);") && has(ALBUM, "if (ALB_W_NOW > 0) return ALB_W_NOW;") && has(ALBUM, "} finally { ALB_W_NOW = 0; }") &&
    has(ALBUM, "if (!DRAWN || !MOUNTED || !wantsDraw()) return;") && has(ALBUM, 'try { render(); } catch(eDraw){ if (H && typeof H.onDrawError === "function") H.onDrawError(eDraw); else throw eDraw; }') && has(MAIN, '    onDrawError: function (e) { hwarn("album:draw", e); },') && has(ALBUM, "if (DRAWN || wantsDraw()) render();") && has(ALBUM, "drawn: function(){ return DRAWN || FIRST_PENDING; },") &&
    has(PANEL_ALBUM, "if (ALB_W_NOW > 0) return ALB_W_NOW;") && has(PANEL_ALBUM, "FIRST_PENDING = true;") && has(MAIN, "    drawOnInit: true,"));
}

/* ---------------- B) the web app ---------------- */
async function partB(browser) {
  const T = readAccUi();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; switchPage("pgAccount"); });
  await page.waitForTimeout(400);

  /* the readers live on the page (its CSP forbids string eval) */
  await page.evaluate(() => {
    window.__accStatic = () => { const o = {}; document.querySelectorAll("#pgAccount [data-acc]").forEach((n) => { o[n.getAttribute("data-acc")] = n.textContent.trim(); }); return o; };
    window.__accEnglish = () => {
      const root = document.getElementById("pgAccount"), vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const eng = []; let n;
      while ((n = walker.nextNode())) { const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t.length < 14) continue; if (/[က-႟]/.test(t)) continue; if (!/[a-zA-Z]{4}/.test(t)) continue; if (!n.parentElement || !vis(n.parentElement)) continue; if (/^(Photoshop Panel|Web App)$/.test(t)) continue; eng.push(t.slice(0, 70)); }   /* the two product names are the same in every language */
      return eng;
    };
    window.__eagerBelow = (id) => { const root = document.getElementById(id); return [...root.querySelectorAll("img")].filter((i) => { const r = i.getBoundingClientRect(); const cs = getComputedStyle(i); return r.width > 0 && r.height > 0 && cs.display !== "none" && r.top > 900 && !i.getAttribute("loading"); }).map((i) => (i.className || i.id || i.getAttribute("src") || "").slice(0, 60)); };
  });

  const b1 = await page.evaluate(() => ({ lang: LANG, page: curPage, st: window.__accStatic(), aria: document.querySelector("#pgAccount .unified-grid").getAttribute("aria-label"), eng: window.__accEnglish(), title: document.getElementById("unifiedAccessTitle").textContent }));
  report("B1) in Burmese the page shows no untranslated sentence: every static node reads the table's Burmese, the grid's aria-label too, and the banner has its words",
    b1.lang === "my" && b1.page === "pgAccount" && PURE().every((k) => b1.st[k] === T[k].my) && b1.aria === T.grid_aria.my && b1.eng.length === 0 && /[က-႟]/.test(b1.title),
    { eng: b1.eng, off: PURE().filter((k) => b1.st[k] !== T[k].my), title: b1.title });

  const b2 = await page.evaluate((langs) => {
    const was = LANG, out = {};
    for (const l of langs) { LANG = l; applyLang(); out[l] = { st: window.__accStatic(), aria: document.querySelector("#pgAccount .unified-grid").getAttribute("aria-label") }; }
    LANG = was; applyLang(); out.back = window.__accStatic().h1;
    return out;
  }, LANGS);
  report("B2) each of the nine languages paints every static node and the aria-label from the table through applyLang; Burmese comes back",
    LANGS.every((l) => PURE().every((k) => b2[l].st[k] === T[k][l]) && b2[l].aria === T.grid_aria[l]) && b2.back === T.h1.my,
    { off: LANGS.filter((l) => !PURE().every((k) => b2[l].st[k] === T[k][l])) });

  const b3 = await page.evaluate((langs) => {
    const was = LANG, out = {}, t = (id) => document.getElementById(id).textContent.trim();
    const granted = () => ({ account: { account_status: "active", effective_status: "active", approved: true }, license: { status: "active", active: true, expires_at: "2027-01-01" },
      permissions: { web_app: true, ccx_download: true, panel: true }, devices: { phone: { registered: true, label: "Pixel" }, computer: { installation_id: "c1", label: "Windows · Chrome" }, slots: [] }, reasons: {}, allowed: { web_app: true } });
    const sess = acc.sess; acc.sess = acc.sess || { access_token: "t", user: { id: "u" } };
    const keep = { ent: unified.entitlement, loading: unified.loading, error: unified.error, enforced: unified.enforced, last: unified.last };
    for (const l of langs) {
      LANG = l; const o = {};
      acc.sess = null; unifiedRender(); o.signedOut = { title: t("unifiedAccessTitle"), text: t("unifiedAccessText"), account: t("unifiedAccountStatus") }; acc.sess = sess || { access_token: "t", user: { id: "u" } };
      unifiedApplyLang(); o.painted = { phone: t("unifiedPhone"), computer: t("unifiedComputer") };   /* the slot rows painted from the table before the renderer speaks */
      unified.entitlement = null; unified.loading = true; unified.error = false; unifiedRender();
      o.checking = { title: t("unifiedAccessTitle"), text: t("unifiedAccessText"), tile: t("unifiedAccountStatus") };
      unified.error = true; unifiedRender(); o.unavailable = t("unifiedAccessTitle"); unified.error = false;
      unified.loading = false; unified.enforced = false; unifiedRender();
      o.compat = { title: t("unifiedAccessTitle"), text: t("unifiedAccessText"), web: t("unifiedWebPermission") };
      unified.entitlement = granted(); unified.last = Date.now(); unified.enforced = true; unifiedRender();
      o.live = { account: t("unifiedAccountStatus"), license: t("unifiedLicenseStatus"), web: t("unifiedWebPermission"), computer: t("unifiedComputer"), phone: t("unifiedPhone"), note: t("unifiedDownloadNote") };
      unified.entitlement.permissions.web_app = false; unifiedRender(); o.webOff = t("unifiedWebPermission");
      unified.entitlement.devices = { phone: null, computer: null, slots: [] }; unifiedRender(); o.free = { phone: t("unifiedPhone"), computer: t("unifiedComputer") };
      out[l] = o;
    }
    LANG = was; unified.entitlement = keep.ent; unified.loading = keep.loading; unified.error = keep.error; unified.enforced = keep.enforced; unified.last = keep.last; acc.sess = sess; unifiedRender(); applyLang();
    return out;
  }, ["my", "en"]);
  const ok3 = ["my", "en"].every((l) => { const o = b3[l], W = (k) => T[k][l];
    return o.signedOut.title === W("signin_title") && o.signedOut.text === W("signin_text") && o.signedOut.account === W("signed_out") &&
      o.checking.title === W("chk_title") && o.checking.text === W("locked_text") && o.checking.tile === W("checking") && o.unavailable === W("verify_unav") &&
      o.compat.title === W("compat_title") && o.compat.text === W("compat_text") && o.compat.web === W("legacy") &&
      o.live.account === T.status.active[l] && o.live.license === T.status.active[l] && o.live.web === W("on") && o.live.computer.indexOf("Windows · Chrome · " + W("shared_slot")) === 0 && o.live.phone.indexOf("Pixel") === 0 && o.live.note === W("dl_ok") &&
      o.webOff === W("off") && o.free.phone.indexOf(W("available")) === 0 && o.free.computer.indexOf(W("available")) === 0; });
  report("B3) the renderer's states in Burmese and English: signed out (title, text, tile), checking (title, locked text, tiles), verification unavailable, compatibility mode (title, text, Legacy tiles), live (Active tiles, ON, the device labels with the shared-slot word, the verified download note), OFF, and Available rows",
    ok3, { my: b3.my, en: b3.en });

  const b4 = await page.evaluate(async () => {
    switchPage("pgAlbum");
    for (let i = 0; i < 100 && !(typeof ALBUM !== "undefined" && document.getElementById("albCanvas")); i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 600));
    const imgs = [...document.querySelectorAll("#pgAlbum img")];
    const drawn = imgs.filter((i) => /alb-(tileimg|ornimg|logopv)/.test(i.className));
    return { imgs: imgs.length, drawn: drawn.length, eager: drawn.filter((i) => i.getAttribute("loading") !== "lazy").length, below: window.__eagerBelow("pgAlbum") };
  });
  report("B4) the Album page draws its tiles with loading=lazy — none of the album's own images is eager, and none below the fold lacks the attribute",
    b4.drawn >= 20 && b4.eager === 0 && b4.below.length === 0, b4);

  const b5 = await page.evaluate(async () => {
    const out = {};
    for (const pg of [...document.querySelectorAll(".page[id^=pg]")].map((n) => n.id)) { try { switchPage(pg); } catch (e) {} await new Promise((r) => setTimeout(r, 350)); const e = window.__eagerBelow(pg); if (e.length) out[pg] = e; }
    return out;
  });
  report("B5) no page of the app has an eager image below the fold on a phone", Object.keys(b5).length === 0, b5);
  report("B6) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) What's New · D) pins ---------------- */
function partC() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgAccount");
  report("C1) What's New carries the " + WAVE_V + " row for the Account page in nine languages, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgAccount") === WN.panelRow(WAVE_V, "pgAccount") && WN.appRow(WAVE_V, "pgAccount").length > 200, { row: !!row });
}
function partD() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("D1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the occasion-sets check",
    steps === COUNT && has(CI, "node test/verify_account_lang_6144.js") && CI.indexOf("verify_account_lang_6144.js") > CI.indexOf("verify_pstyle_sets_6143.js"), { steps });
  report("D2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("D3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

(async function main() {
  partA();
  partC();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    await partB(browser);
  } finally { await browser.close(); }
  partD();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
