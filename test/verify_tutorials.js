/* verify_tutorials.js — 6.88.0 / panel 6.159.0
   TUTORIALS: TEN LESSONS IN NINE LANGUAGES, ON THE APP AND THE PANEL.

   The app's Tutorials page carried three English cards in its markup, in
   every locale, and the panel's screen carried a hand-typed copy of them.
   Now the app keeps ONE table — TUT_HERO + TUTORIALS, ten lessons (Dashboard
   · Phone + Computer · Install the Panel · Freeform · Smart Workflow · Video
   Lab · Retouch A/B · Imagine · Gallery & History · Your key & balance) in
   nine languages — painted by renderTutorials() at boot and on every language
   switch; every card's button opens the page it teaches. The panel lifts the
   same table (tools/build_panel_tutorials.js → panel/js/hnk_tutorials.js) and
   its screen paints it in the panel's language (HNK.i18n.pick), mapping the
   app's page ids to its own route keys.

   Fault-injected while writing: a lesson dropped from TUTORIALS fails A1/B1;
   the lifter not re-run fails A2; a PAGE entry removed fails A3/C2;
   renderTutorials() taken out of applyLang fails B3.
   Usage: PORT=8931 node test/verify_tutorials.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { withPremium } = require("./_seed_premium.js");   /* the app shows its wall to a signed-out visitor; this seeds a signed-in studio */
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PHTML = read("panel/index.html");
const SCREEN = read("panel/src/ui/screens/tutorials-screen.js");
const LIFTER = read("tools/build_panel_tutorials.js");
const GEN = read("panel/js/hnk_tutorials.js");
const WHATS = read("panel/js/hnk_whats_new.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const PORT = process.env.PORT || 8931;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* the app's tables, evaluated from its own source */
const dataSrc = APP.slice(APP.indexOf("var TUT_HERO = {"), APP.indexOf("function renderTutorials(){"));
const DATA = new Function(dataSrc + "; return { HERO: TUT_HERO, TUTORIALS: TUTORIALS };")();
const nine = (o) => !!o && LANGS.every(l => typeof o[l] === "string" && o[l].trim().length > 0);
const PAGE_IDS = new Set((APP.match(/id="pg[A-Za-z0-9]+"/g) || []).map(x => x.slice(4, -1)));

(async () => {
  /* ---------------- A. source pins ---------------- */
  const L = DATA.TUTORIALS;
  report("A1) the app's TUTORIALS table: ten lessons numbered 01–10, each with a title, a body and a button in nine languages, each opening a page the app has; lesson 03 still opens Setup with \"Open Setup\"; the hero h1 + lede in nine languages; renderTutorials paints #tutGrid / #tutH1 / #tutLede from the table, applyLang calls it, the markup carries no static card, and #tutGrid delegates its clicks",
    Array.isArray(L) && L.length === 10 && L.map(x => x.n).join() === "01,02,03,04,05,06,07,08,09,10" &&
    L.every(x => nine(x.t) && nine(x.p) && nine(x.b) && PAGE_IDS.has(x.page)) &&
    L[2].page === "pgHome" && L[2].b.en === "Open Setup" && L[0].page === "pgDash" && L[1].page === "pgAccount" &&
    ["pgCreate", "pgWf", "pgVideo", "pgMeitu", "pgImagine", "pgGallery"].every(p => L.some(x => x.page === p)) &&
    nine(DATA.HERO.h1) && nine(DATA.HERO.lede) && DATA.HERO.h1.en === "Tutorials" &&
    /function renderTutorials\(\)\{\n\s*var g=\$\("tutGrid"\); if\(!g\) return;/.test(APP) && /h\.textContent=L9\(TUT_HERO\.h1\)/.test(APP) && /l\.textContent=L9\(TUT_HERO\.lede\)/.test(APP) &&
    /b\.setAttribute\("data-tutorial-page",x\.page\); b\.textContent=L9\(x\.b\);/.test(APP) &&
    /a11yApplyLang\(\);\n\s*renderTutorials\(\);/.test(APP) && APP.indexOf("var TUTORIALS = [") < APP.indexOf("\napplyLang();\n") &&
    APP.includes('<section class="tutorial-grid" id="tutGrid" aria-label="Tutorial topics"></section>') && APP.includes('<h1 id="tutH1">Tutorials</h1><p id="tutLede">') &&
    !APP.includes('<article class="tutorial-card">') &&
    /var tg=\$\("tutGrid"\); if\(tg\) tg\.addEventListener\("click",function\(ev\)\{ var b=ev\.target && ev\.target\.closest \? ev\.target\.closest\("\[data-tutorial-page\]"\) : null; if\(b\) switchPage\(b\.getAttribute\("data-tutorial-page"\)\); \}\);/.test(APP) &&
    !APP.includes('querySelectorAll("[data-unified-page],[data-tutorial-page]")'),
    { n: L && L.length, pages: L && L.map(x => x.page) });

  const gen = require(path.join(ROOT, "tools", "build_panel_tutorials.js"));
  const lifted = require(path.join(PANEL, "js", "hnk_tutorials.js"));
  report("A2) the panel lifts the same table: tools/build_panel_tutorials.js runs the glyph pass and its output IS panel/js/hnk_tutorials.js byte for byte; the lifted file carries the ten lessons in the app's order with the app's titles and buttons (en + my) and the hero",
    /uxpSafeCode\(/.test(LIFTER) && /uxp_safe_text/.test(LIFTER) && gen.build() === GEN && GEN.includes("LIFTED, do not edit by hand") &&
    lifted.TUTORIALS.length === 10 && lifted.TUTORIALS.map(x => x.n + ":" + x.page).join() === L.map(x => x.n + ":" + x.page).join() &&
    lifted.TUTORIALS.every((x, i) => x.t.en === L[i].t.en && x.b.en === L[i].b.en && x.b.my === L[i].b.my && x.t.my === L[i].t.my) &&
    lifted.HERO.h1.my === DATA.HERO.h1.my && lifted.HERO.lede.en === DATA.HERO.lede.en, { n: lifted.TUTORIALS.length });

  const PAGE_MAP = (SCREEN.match(/var PAGE = \{[\s\S]*?\};/) || [""])[0];
  const PAGE = PAGE_MAP ? new Function(PAGE_MAP + " return PAGE;")() : {};
  const panelKeys = new Set((MAIN.match(/\{ key: "([a-z0-9]+)",\s+page: "page/g) || []).map(s => s.match(/"([a-z0-9]+)"/)[1]));
  report("A3) the panel's screen paints the lifted table — reads HNK.tutorials (or requires js/hnk_tutorials.js in Node), picks the language through HNK.i18n.pick (main.js exposes it over ff9), carries no lessons of its own, and its PAGE map sends every lesson's app page to a real panel route (Home → the AI Tools stack); the lifted script loads before the screen",
    /require\("\.\.\/\.\.\/\.\.\/js\/hnk_tutorials\.js"\)/.test(SCREEN) && /globalThis\.HNK\.tutorials/.test(SCREEN) && /b\.pick\(m\)/.test(SCREEN) && !/var LESSONS = \[/.test(SCREEN) &&
    /pick: function \(m\) \{ return ff9\(m\); \}/.test(MAIN) &&
    L.every(x => typeof PAGE[x.page] === "string") && Object.keys(PAGE).every(k => PAGE_IDS.has(k)) &&
    Object.values(PAGE).every(v => v === "aitools" || panelKeys.has(v)) && PAGE.pgDash === "aitools" && PAGE.pgHome === "setup" && PAGE.pgCreate === "prompt" && PAGE.pgMeitu === "meitu" &&
    /go\.setAttribute\("data-tutorial-page", l\.page\);/.test(SCREEN) && /var key = PAGE\[l\.page\] \|\| "aitools";/.test(SCREEN) &&
    PHTML.indexOf('<script src="js/hnk_tutorials.js"></script>') > 0 && PHTML.indexOf('<script src="js/hnk_tutorials.js"></script>') < PHTML.indexOf('<script src="src/ui/screens/tutorials-screen.js"></script>') &&
    PHTML.indexOf('<script src="js/hnk_tutorials.js"></script>') > PHTML.indexOf('<script src="js/hnk_whats_new.js"></script>'),
    { page: PAGE, keys: [...panelKeys] });

  const wn = WN.appRow("6.88.0", "pgTutorials");
  const wnP = WN.panelRow("6.88.0", "pgTutorials");
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  report("A4) CI runs this test right after verify_panel_video_takes_persist; the landing counts at least 223 tests; What's New carries the 6.88.0 Tutorials row in nine languages on the app and the panel",
    CI.indexOf("node test/verify_tutorials.js") > CI.indexOf("node test/verify_panel_video_takes_persist.js") && CI.indexOf("node test/verify_panel_video_takes_persist.js") > 0 && tests >= 223 &&
    !!wn && LANGS.every(l => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, wn: wn.slice(0, 60), panelRow: !!wnP });

  /* ---------------- B. the web app ---------------- */
  const browser = await chromium.launch();
  withPremium(browser);
  let app;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); localStorage.removeItem("hnk_ws_lang"); } catch (e) { } });
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    app = await page.evaluate(async () => {
      const out = {};
      const settle = () => new Promise(r => setTimeout(r, 60));
      const cards = () => [...document.querySelectorAll("#pgTutorials .tutorial-card")];
      const texts = (sel) => cards().map(c => (c.querySelector(sel) || {}).textContent);
      out.lang = LANG;
      switchPage("pgTutorials"); await settle();
      out.first = { n: cards().length, chips: texts(".chip"), titles: texts("h2"), bodies: texts("p"), buttons: texts(".btn"),
        pages: cards().map(c => c.querySelector(".btn").getAttribute("data-tutorial-page")), h1: document.getElementById("tutH1").textContent, lede: document.getElementById("tutLede").textContent,
        want: { titles: TUTORIALS.map(x => L9(x.t)), bodies: TUTORIALS.map(x => L9(x.p)), buttons: TUTORIALS.map(x => L9(x.b)), pages: TUTORIALS.map(x => x.page), h1: L9(TUT_HERO.h1), lede: L9(TUT_HERO.lede) },
        onPage: document.getElementById("pgTutorials").classList.contains("on") };
      /* every button lands on the page it names */
      out.clicks = [];
      for (let i = 0; i < TUTORIALS.length; i++) {
        switchPage("pgTutorials"); await settle();
        cards()[i].querySelector(".btn").click(); await settle();
        out.clicks.push({ want: TUTORIALS[i].page, got: curPage, on: document.getElementById(TUTORIALS[i].page).classList.contains("on") });
      }
      /* the language switch repaints the cards */
      LANG = "en"; applyLang(); switchPage("pgTutorials"); await settle();
      out.en = { n: cards().length, titles: texts("h2"), buttons: texts(".btn"), h1: document.getElementById("tutH1").textContent,
        want: { titles: TUTORIALS.map(x => x.t.en), buttons: TUTORIALS.map(x => x.b.en) } };
      cards()[2].querySelector(".btn").click(); await settle();
      out.en.card3 = { page: curPage, word: out.en.buttons[2] };
      LANG = "zh"; applyLang(); switchPage("pgTutorials"); await settle();
      out.zh = { titles: texts("h2"), want: TUTORIALS.map(x => x.t.zh), h1: document.getElementById("tutH1").textContent, wantH1: TUT_HERO.h1.zh };
      LANG = "my"; applyLang(); switchPage("pgTutorials"); await settle();
      out.back = { titles: texts("h2"), want: TUTORIALS.map(x => x.t.my) };
      return out;
    });
    app.errs = errs;
  } finally { await browser.close(); }
  const F = app.first;
  report("B1) app · Tutorials paints ten cards from the table in the app's language (Burmese by default): chips 01–10, the table's titles · bodies · buttons, the hero h1 + lede, every button carrying its page",
    app.lang === "my" && F.onPage && F.n === 10 && F.chips.join() === "01,02,03,04,05,06,07,08,09,10" && F.titles.join("|") === F.want.titles.join("|") && F.bodies.join("|") === F.want.bodies.join("|") &&
    F.buttons.join("|") === F.want.buttons.join("|") && F.pages.join() === F.want.pages.join() && F.h1 === F.want.h1 && F.lede === F.want.lede && F.h1 === "သင်ခန်းစာများ", F);
  report("B2) app · every card's button opens the page it teaches (Dashboard · Account · Setup · Freeform · Workflows · Video · Retouch A · Imagine · Gallery · Setup)",
    app.clicks.length === 10 && app.clicks.every(c => c.got === c.want && c.on), app.clicks);
  report("B3) app · a language switch repaints the cards — English titles and buttons, h1 \"Tutorials\", card 03 \"Open Setup\" landing on Setup; Chinese titles and h1; Burmese back",
    app.en.n === 10 && app.en.titles.join("|") === app.en.want.titles.join("|") && app.en.buttons.join("|") === app.en.want.buttons.join("|") && app.en.h1 === "Tutorials" &&
    app.en.card3.page === "pgHome" && app.en.card3.word === "Open Setup" && app.zh.titles.join("|") === app.zh.want.join("|") && app.zh.h1 === app.zh.wantH1 &&
    app.back.titles.join("|") === app.back.want.join("|"), { en: app.en, zh: app.zh.h1, back: app.back.titles[0] });
  report("B4) app · no page error", app.errs.length === 0, app.errs.slice(0, 3));

  /* ---------------- C. the panel ---------------- */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const pb = await chromium.launch();
  let pan;
  try {
    const page = await pb.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image")
        return r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.addInitScript(UXP_STUB);
    await page.goto("http://127.0.0.1:" + port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.waitForFunction(() => {
      try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); } catch (e) { return false; }
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });
    pan = await page.evaluate(async (want) => {
      const out = {};
      const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const open = async () => { switchPage("aitools"); await settle(); window.HNK.aiToolsApp.navigate("tutorials"); await settle(); };
      const cards = () => [...document.querySelectorAll("#pageAiTools .tutorial-card")];
      const texts = (sel) => cards().map(c => (c.querySelector(sel) || {}).textContent);
      out.lang = state.lang;
      await open();
      out.first = { n: cards().length, chips: texts(".chip"), titles: texts("h2"), bodies: texts("p"), buttons: texts(".btn"),
        pages: cards().map(c => c.querySelector(".btn").getAttribute("data-tutorial-page")),
        h1: document.querySelector("#pageAiTools .unified-hero h1").textContent, lede: document.querySelector("#pageAiTools .unified-hero p").textContent,
        kick: document.querySelector("#pageAiTools .unified-kick").textContent, screen: window.HNK.aiToolsApp.current() };
      const PAGE = window.HNK.tutorialsScreen.PAGE;
      out.clicks = [];
      const N = cards().length;   /* the click leaves the screen, so the count is taken once */
      for (let i = 0; i < N; i++) {
        await open();
        const pg = cards()[i].querySelector(".btn").getAttribute("data-tutorial-page");
        cards()[i].querySelector(".btn").click(); await settle(); await settle();
        out.clicks.push({ page: pg, want: PAGE[pg], got: state.page, screen: window.HNK.aiToolsApp.current() });
      }
      /* the panel's language switch re-mounts the AI Tools stack (REFRESHERS) */
      await open();
      state.lang = "en"; applyI18n(); await settle();
      out.en = { n: cards().length, titles: texts("h2"), buttons: texts(".btn"), h1: document.querySelector("#pageAiTools .unified-hero h1").textContent, screen: window.HNK.aiToolsApp.current() };
      state.lang = "th"; applyI18n(); await settle();
      out.th = { titles: texts("h2"), h1: document.querySelector("#pageAiTools .unified-hero h1").textContent };
      state.lang = "my"; applyI18n(); await settle();
      out.back = { titles: texts("h2") };
      return out;
    }, { my: { titles: L.map(x => x.t.my), bodies: L.map(x => x.p.my), buttons: L.map(x => x.b.my), h1: DATA.HERO.h1.my, lede: DATA.HERO.lede.my },
         en: { titles: L.map(x => x.t.en), buttons: L.map(x => x.b.en) }, th: { titles: L.map(x => x.t.th), h1: DATA.HERO.h1.th }, pages: L.map(x => x.page) });
    pan.errs = errs;
  } finally { await pb.close(); server.close(); }

  const P = pan.first;
  const wantMy = { titles: L.map(x => x.t.my), bodies: L.map(x => x.p.my), buttons: L.map(x => x.b.my) };
  report("C1) panel · Home ▸ Tutorials paints the same ten cards in the same words as the app (Burmese): chips, titles, bodies, buttons, the hero h1 + lede, HNK LEARNING kicker, every button carrying the app's page id",
    pan.lang === "my" && P.screen === "tutorials" && P.n === 10 && P.chips.join() === "01,02,03,04,05,06,07,08,09,10" &&
    P.titles.join("|") === wantMy.titles.join("|") && P.bodies.join("|") === wantMy.bodies.join("|") && P.buttons.join("|") === wantMy.buttons.join("|") &&
    P.pages.join() === L.map(x => x.page).join() && P.h1 === DATA.HERO.h1.my && P.lede === DATA.HERO.lede.my && P.kick === "HNK LEARNING", P);
  report("C2) panel · every card's button lands on the panel page the app's page maps to (Dashboard → the AI Tools Home, Account / Setup → Setup, Freeform → prompt, Workflows → wf, Video → video, Retouch A → meitu, Imagine → imagine, Gallery → gallery)",
    pan.clicks.length === 10 && pan.clicks.every(c => c.got === c.want) && pan.clicks[0].screen === "home" && pan.clicks.filter(c => c.got === "setup").length === 3, pan.clicks);
  report("C3) panel · the language switch repaints the screen — English titles and buttons, h1 \"Tutorials\"; Thai titles and h1; Burmese back",
    pan.en.n === 10 && pan.en.screen === "tutorials" && pan.en.titles.join("|") === L.map(x => x.t.en).join("|") && pan.en.buttons.join("|") === L.map(x => x.b.en).join("|") && pan.en.h1 === "Tutorials" &&
    pan.th.titles.join("|") === L.map(x => x.t.th).join("|") && pan.th.h1 === DATA.HERO.h1.th && pan.back.titles.join("|") === wantMy.titles.join("|"), { en: pan.en, th: pan.th.h1 });
  report("C4) panel · no page error", pan.errs.length === 0, pan.errs.slice(0, 3));

  console.log(failures ? "\n" + failures + " check(s) failed." : "\nALL PASS — ten lessons, nine languages, one table on both surfaces.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
