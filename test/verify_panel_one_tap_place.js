/* verify_panel_one_tap_place.js — 6.99.0 / panel 6.170.0
   ONE TAP RUNS · AN EMPTY SLOT IS STILL A SLOT · A RESULT FILLS THE DOCUMENT.

   Three things the owner photographed in real Photoshop, in one wave.

   (1) "Freeform မှာ ဒီလို ၁၂၃ ပြီးမှ Generate လုပ်တဲ့ဟာက မထည့်သင့်ပါဘူး အလုပ်ရှုပ်ပါတယ်"
       — in Freeform this 1-2-3-then-Generate should not be there, it makes work
       complicated. From v3.1 to 6.169.1 a tap on GENERATE did not generate: the first
       tap armed the button yellow and opened a guide box, the second turned it blue and
       printed the prompt, and only the third — green — ran. The gate was panel-only; the
       web app's GENERATE has always run on one tap, so it was also the last parity break
       on those four buttons. The whole Learn cycle is gone: state.learnMode / armedKey /
       armedEl / armTimer / armStage, armGate, dualT, guideFor, GEN_GUIDES, the arm
       classes, resetArmTimer, disarm, guidePlace, elInDoc, greenFlash, showGuide,
       showPromptStage, the HNK.learnMode bridge, its saved setting, the #hnkSetLearn
       switch, the #guideBox markup, the .gbox / .armed / .armp / .go rules and ten
       strings in every dictionary.

   (2) "Images 2 slots ပျောက်နေတယ် တစ်ခြားနေရာတေွမှာလဲ ပျောက်နေလား စစ်ပေးပြီး ပြင်ဆင်ဖြည့်စွက်" —
       the IMAGE 2 slot is missing; check whether it is missing anywhere else too. It
       was: 6.109.0 made an unfilled slot draw a dashed frame with a + so a workflow
       wanting two photographs does not open as a label and a row of buttons. But the
       tile's <img> was created with NO SRC, and UXP reports a src-less <img> as a load
       FAILURE (the fact 6.128.0 and 6.129.0 wrote, and the reason remoteArt.paint has
       given every remote picture a one-pixel placeholder ever since). The tile's onerror
       hid `thumb` — picture, ✕ and waiting frame together — so a slot nobody had filled
       erased its own frame on sight. A probe walked all eighteen panel routes and the
       wizard: exactly two src-less <img> existed in the whole panel, both of them these
       slots. C1 keeps that number at zero.

   (3) Three photographs of a Reference Transfer result placed into Photoshop as a small
       rectangle in the middle of a RAW document, over the face. canvas-fit-service's
       "fit" mode refuses to enlarge past 1:1 and photoshop-host's self-fit clamped with
       Math.min(…, 1) — so on any document bigger than the returned picture the result
       landed at its own pixel size. The bytes that were sent were a DOWNSCALE of that
       same document, so the result belongs on that document's frame. Freeform's own
       place has covered the document (Math.max, no clamp) since 6.9.0; the wizard's
       place now matches it. Selection Edit's regionBounds path is untouched — a region
       edit still lands in its own rectangle, masked to it.

   Chromium cannot reproduce (2) — it fires no error on a src-less <img> at all, which is
   exactly why 240 green tests never caught it. So C3 injects the fault: it fires the
   slot's own onerror handler and measures what survives. Before the fix the tile
   vanished; after it, the picture hides and the waiting frame comes back.
   ============================================================================ */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MAIN = read("panel/main.js");
const CODE = MAIN.replace(/\/\*[\s\S]*?\*\//g, "");   /* the 6.170.0 note names what it removed */
const PCSS = read("panel/styles.css");
const PHTML = read("panel/index.html");
const SCREEN = read("panel/src/ui/screens/workflow-tools-screen.js");
const SETTINGS = read("panel/src/ui/screens/settings-screen.js");
const MPLACE = read("panel/src/photoshop/masked-place-service.js");
const PHOST = read("panel/src/photoshop/photoshop-host.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const APP = read("docs/app/index.html");
const WHATS = read("panel/js/hnk_whats_new.js");
const MANIFEST = JSON.parse(read("panel/release-manifest.json"));
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 900)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/* =================== A) the three fixes, pinned in source =================== */
function sourcePins() {
  /* ---- (1) the gate is gone ---- */
  const GATE = ["armGate", "GEN_GUIDES", "state.learnMode", "HNK.learnMode", "showPromptStage", "showGuide",
    "guidePlace", "elInDoc", "greenFlash", "resetArmTimer", "setArmClass", "clearArmClass", "guideFor", "dualT"];
  report("A1) not one piece of the three-tap Learn cycle is left in panel/main.js — " + GATE.length + " names gone, the five state fields gone, and the note says what went and why",
    GATE.every((n) => CODE.indexOf(n) < 0) &&
    !/learnMode|armedKey|armedEl|armTimer|armStage/.test((MAIN.match(/const state = \{[\s\S]*?\n\};/) || [""])[0]) &&
    /v6\.170\.0 — THE THREE-TAP LEARN CYCLE IS GONE; GENERATE RUNS ON THE FIRST TAP\./.test(MAIN),
    { left: GATE.filter((n) => CODE.indexOf(n) >= 0) });

  report("A2) the four run buttons call their run directly, behind the same state.busy guard armGate opened with — Freeform's GENERATE, Retouch A's start, Retouch B's gen and the Studio run",
    /if \(state\.busy\) return;   \/\* never start a second run on top of one \*\/\n  \/\* the label stays put while the run feeds back through the card \(no busy dots\) \*\/\n  setBusyBtn\(null\);\n  runGenerate\(null, false, \[\], false, \{ action: "Prompt", ffCard: true \}\);/.test(MAIN) &&
    (MAIN.match(/if \(state\.busy\) return;\n        studioRun\(/g) || []).length === 2 &&
    /gen\.addEventListener\("click", function \(\) \{\n        if \(state\.busy\) return;\n        const sc = globalThis\.HNK && globalThis\.HNK\.studioScreen;/.test(MAIN), null);

  report("A3) the guide box and its three arm colours left the markup and the stylesheet, the Settings switch left its screen, and the ten strings that only described the cycle are gone from every dictionary",
    PHTML.indexOf("guideBox") < 0 && PHTML.indexOf("guide_hint") < 0 &&
    !/\.gbox|\.armed|\.armp/.test(PCSS.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    !/hnkSetLearn|ai_learn_mode|LEARN_FALLBACK/.test(SETTINGS.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")) &&
    ["guide_hint", "g_learn_next_prompt", "g_learn_prompt_head", "g_learn_next_run", "st_prompt_ready",
     "g_step_confirm", "g_cat_generic", "g_gen", "g_retouchbtn", "ai_learn_mode"].every((k) => MAIN.indexOf(k + ":") < 0 && MAIN.indexOf(k + '"') < 0),
    null);

  report("A4) the web app is untouched — it never carried the gate, and that is the parity this closes: no learnMode, no armGate, no guide box anywhere in docs/app/index.html",
    !/learnMode|armGate|guideBox|g_learn_next/.test(APP), null);

  /* ---- (2) an empty slot keeps its tile ---- */
  report("A5) every <img> the wizard creates empty carries the one-pixel placeholder — blankArt() reaches remoteArt's own BLANK first and falls back to its own copy, and both the slot's preview and the Selection card's capture use it",
    /var BLANK_PX = "data:image\/gif;base64,R0lGODlhAQABAIAAAAAAAP\/\/\/yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";/.test(SCREEN) &&
    /function blankArt\(im\) \{[\s\S]*?im\.src = \(ra && ra\.BLANK\) \|\| BLANK_PX;/.test(SCREEN) &&
    /thumbImg\.alt = "";\n    blankArt\(thumbImg\);/.test(SCREEN) &&
    /shotIm\.alt = ""; blankArt\(shotIm\);/.test(SCREEN) &&
    /UXP reports an image\n   with no src at all as a load failure/.test(SCREEN), null);

  report("A6) a picture that really fails hides ONLY itself and hands the waiting frame back — the placeholder is never treated as a failure, and the tile is never hidden again",
    /if \(!cur \|\| cur === BLANK_PX\) return;\n        thumbImg\.style\.display = "none";/.test(SCREEN) &&
    /var backEmpty = nodes\["empty_" \+ inp\.key\];\n        if \(backEmpty\) backEmpty\.style\.display = "";/.test(SCREEN) &&
    !/thumb\.style\.display = "none"/.test(SCREEN) &&
    /which reads exactly as "the IMAGE 2 slot is missing"/.test(SCREEN), null);

  /* ---- (3) a whole-frame result fills the document ---- */
  report("A7) the wizard's place covers the document and may enlarge — cover + allowUpscale through canvas-fit-service, and the region path still lands in its own rectangle",
    /fit\.computeFit\(r, deps\.canvas \|\| \{ width: 1024, height: 1024 \}, deps\.fitMode \|\| "cover", \{ allowUpscale: true \}\)/.test(MPLACE) &&
    /var bounds = deps\.regionBounds\n      \? deps\.regionBounds/.test(MPLACE) &&
    /v6\.170\.0 — A WHOLE-FRAME RESULT FILLS THE DOCUMENT\./.test(MPLACE), null);

  report("A8) the host's own self-fit (used when the caller knows no pixel size) covers the document too — Math.max with no 1:1 clamp, the same arithmetic Freeform's place has used since 6.9.0",
    /var s0 = \(lw > 0 && lh > 0\) \? Math\.max\(dw \/ lw, dh \/ lh\) : 1;/.test(PHOST) &&
    !/Math\.min\(dw \/ lw, dh \/ lh, 1\)/.test(PHOST) &&
    /const s = Math\.max\(dw \/ lw, dh \/ lh\) \* 100;/.test(MAIN) /* Freeform's, unchanged */, null);
}

/* =================== B) the geometry, as arithmetic =================== */
function fitMath() {
  const fit = require(path.join(ROOT, "panel/src/photoshop/canvas-fit-service.js"))
    || globalThis.HNK.canvasFitService;
  const F = fit && fit.computeFit ? fit : globalThis.HNK.canvasFitService;

  /* the owner's case: a 1365x2048 result, a 4096x6144 document */
  const small = F.computeFit({ width: 1365, height: 2048 }, { width: 4096, height: 6144 }, "cover", { allowUpscale: true });
  const clamped = F.computeFit({ width: 1365, height: 2048 }, { width: 4096, height: 6144 }, "fit");
  /* cover takes the LARGER of the two ratios, so the long side may overhang by a pixel or
     two when the shapes are not exactly equal (1365:2048 is not exactly 2:3); the frame is
     covered, which is the point, and the overhang is centred. */
  report("B1) the owner's numbers — a 1365×2048 result on a 4096×6144 document now fills the frame (×3, overhang centred) instead of sitting at native size in the middle, which is what the photograph showed",
    small.width >= 4096 && small.height >= 6144 && small.x <= 0 && small.y <= 0 && small.scale > 2.9 &&
    small.width - 4096 <= 8 && small.height - 6144 <= 8 &&
    clamped.width === 1365 && clamped.height === 2048 && clamped.x > 1000 && clamped.y > 2000,
    { fixed: small, old: clamped });

  /* a result already larger than the document is still contained, not blown up */
  const big = F.computeFit({ width: 8000, height: 12000 }, { width: 4096, height: 6144 }, "cover", { allowUpscale: true });
  report("B2) a result BIGGER than the document still lands on the document's frame — cover scales it down, it is never left overflowing",
    big.width === 4096 && big.height === 6144 && big.scale < 1, big);

  /* a different shape: cover fills and centres, losing only the overhang */
  const wide = F.computeFit({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, "cover", { allowUpscale: true });
  report("B3) a result whose shape differs from the document's fills the frame and is centred — the overhang is the only thing outside it",
    wide.height === 1000 && wide.width === 2000 && wide.x === -500 && wide.y === 0, wide);
}

/* =================== C) the panel itself =================== */
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const ROUTES = ["setup", "aitools", "wf", "prompt", "imagine", "meitu", "evoto", "retouch", "path",
  "create", "video", "vidup", "v2v", "talk", "presets", "gallery", "history", "tutorials"];

async function panelWalk() {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 1100 } });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await page.route("**/*", (r) => r.request().url().indexOf("127.0.0.1") >= 0 ? r.continue()
    : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.addInitScript(UXP_STUB);
  await page.goto("http://127.0.0.1:" + server.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2400);
  await page.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash().name); } catch (e) { return false; } }, null, { timeout: 25000 });

  const noSrc = [];
  for (const rt of ROUTES) {
    await page.evaluate((r) => { try { switchPage(r); } catch (e) { } }, rt);
    await page.waitForTimeout(600);
    const rows = await page.evaluate((r) => {
      const out = [], imgs = document.getElementsByTagName("img");
      for (let i = 0; i < imgs.length; i++) {
        let s = ""; try { s = (imgs[i].getAttribute && imgs[i].getAttribute("src")) || ""; } catch (e) { s = ""; }
        if (!s) out.push(r + ":<img" + (imgs[i].id ? " #" + imgs[i].id : "") + ">");
      }
      return out;
    }, rt);
    rows.forEach((x) => noSrc.push(x));
  }

  /* the wizard of a two-photograph workflow, opened with nothing picked */
  await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
  await page.waitForTimeout(800);
  const opened = await page.evaluate(async () => {
    const heads = Array.from(document.querySelectorAll(".app-grp > button, .grp-h, button.grp"));
    for (const h of heads) { try { h.click(); } catch (e) { } await new Promise((r) => setTimeout(r, 50)); }
    await new Promise((r) => setTimeout(r, 700));
    const cards = Array.from(document.querySelectorAll("#pageAiTools .wfmini"));
    for (const c of cards) {
      const t = c.querySelector(".t");
      if (t && /scene|reference/i.test(t.textContent || "")) { c.click(); await new Promise((r) => setTimeout(r, 1300)); return (t.textContent || "").trim(); }
    }
    if (cards.length) { cards[0].click(); await new Promise((r) => setTimeout(r, 1300)); return "first card"; }
    return "";
  });
  await page.waitForTimeout(700);

  const wiz = await page.evaluate(() => {
    const out = { noSrc: [], tiles: [] };
    const imgs = document.getElementsByTagName("img");
    for (let i = 0; i < imgs.length; i++) {
      let s = ""; try { s = (imgs[i].getAttribute && imgs[i].getAttribute("src")) || ""; } catch (e) { s = ""; }
      if (!s) out.noSrc.push("wizard:<img" + (imgs[i].id ? " #" + imgs[i].id : "") + ">");
    }
    const tiles = document.querySelectorAll('[id^="hnkWfThumb_"]');
    tiles.forEach((t) => {
      const r = t.getBoundingClientRect();
      const im = t.querySelector("img"), em = t.querySelector(".hnk-req-empty");
      out.tiles.push({ id: t.id, w: Math.round(r.width), h: Math.round(r.height), hidden: t.style.display === "none",
        src: im ? ((im.getAttribute("src") || "").slice(0, 26)) : "NO IMG",
        emptyH: em ? Math.round(em.getBoundingClientRect().height) : -1,
        emptyShown: em ? em.style.display !== "none" : false });
    });
    return out;
  });

  /* FAULT INJECTION — fire the slot's own onerror the way UXP fires it on a src-less <img>.
     Before the fix this hid the whole tile; after it, only the picture goes. */
  const injected = await page.evaluate(() => {
    const t = document.querySelector('[id^="hnkWfThumb_"]');
    if (!t) return { ran: false };
    const im = t.querySelector("img"), em = t.querySelector(".hnk-req-empty");
    const before = { tile: t.style.display, empty: em ? em.style.display : "?" };
    /* the placeholder is what the slot carries while it waits: the handler must ignore it */
    if (typeof im.onerror === "function") im.onerror();
    const placeholderIgnored = t.style.display !== "none" && (em ? em.style.display !== "none" : false);
    /* and now a real picture that will not decode */
    im.setAttribute("src", "data:image/png;base64,Tk9UQVBJQ1RVUkU=");
    if (typeof im.onerror === "function") im.onerror();
    return { ran: true, before, placeholderIgnored,
      tileAfter: t.style.display, imgAfter: im.style.display,
      emptyAfter: em ? em.style.display : "?",
      tileH: Math.round(t.getBoundingClientRect().height) };
  });

  /* the run buttons: one tap fires, a tap while busy does not */
  const tap = await page.evaluate(async () => {
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    switchPage("prompt"); await settle(); await new Promise((r) => setTimeout(r, 400));
    const out = { box: !!document.getElementById("guideBox"), gate: typeof armGate, field: typeof state.learnMode,
      bridge: !!(window.HNK && window.HNK.learnMode) };
    let ran = 0; const keep = runGenerate;
    runGenerate = function () { ran++; return Promise.resolve(); };
    const g = document.getElementById("btnGenerate");
    out.btn = !!g;
    if (g) { g.click(); await settle(); }
    out.first = ran;
    state.busy = true; if (g) { g.click(); await settle(); } state.busy = false;
    out.busy = ran;
    if (g) { g.click(); await settle(); }
    out.second = ran;
    runGenerate = keep;
    return out;
  });

  await browser.close(); server.close();
  return { noSrc, wiz, injected, tap, opened, errs };
}

/* =================== D) the release =================== */
function releasePins() {
  const tests = parseInt((LANDING.match(/data-count="tests">(\d+)</) || [])[1] || "0", 10);
  const wn = (APP.match(/\{ v:"6\.99\.0", kind:"page", ref:"pgCreate",[\s\S]*?\} \},\n/) || [""])[0];
  const wnP = (WHATS.match(/\{ v:"6\.99\.0", kind:"page", ref:"pgCreate",[\s\S]*?\} \},\n/) || [""])[0];
  report("D1) CI runs this test right after verify_wf_responsive; the landing counts at least 241 tests; What's New carries the 6.99.0 row in nine languages on the app and the panel; the panel release is 6.170.0",
    CI.indexOf("node test/verify_panel_one_tap_place.js") > CI.indexOf("node test/verify_wf_responsive.js") &&
    CI.indexOf("node test/verify_wf_responsive.js") > 0 && tests >= 241 && MANIFEST.version === "6.170.0" &&
    !!wn && LANGS.every((l) => (wn.match(new RegExp("(^|[,{])" + l + ':"', "g")) || []).length === 2) && !!wnP && wnP === wn,
    { tests, version: MANIFEST.version, wn: wn.slice(0, 60), panelRow: !!wnP });
}

(async () => {
  sourcePins();
  fitMath();
  const P = await panelWalk();

  report("C1) panel · not one <img> in the whole panel sits in the document without a src — all " + ROUTES.length + " routes walked, and the Smart Workflow wizard opened on “" + P.opened + "” with nothing picked (this is where the two were)",
    P.noSrc.length === 0 && P.wiz.noSrc.length === 0, { routes: P.noSrc.slice(0, 6), wizard: P.wiz.noSrc });

  report("C2) panel · every slot of a two-photograph workflow shows its waiting tile before anything is picked — the 64px dashed frame with the + is on screen, the tile is never display:none, and its picture carries the placeholder",
    P.wiz.tiles.length >= 2 && P.wiz.tiles.every((t) => !t.hidden && t.h >= 60 && t.emptyH >= 60 && t.emptyShown && /^data:image\/gif/.test(t.src)),
    P.wiz.tiles);

  report("C3) panel · FAULT INJECTION — the slot's own onerror, fired the way UXP fires it: the placeholder is ignored outright, and a picture that really will not decode hides ONLY itself and gives the waiting frame back (before 6.170.0 this call hid the whole tile)",
    P.injected.ran && P.injected.placeholderIgnored && P.injected.tileAfter !== "none" && P.injected.tileH >= 60 &&
    P.injected.imgAfter === "none" && P.injected.emptyAfter === "", P.injected);

  report("C4) panel · nothing of the gate is left at runtime — no #guideBox in the document, no armGate, no state.learnMode, no HNK.learnMode",
    P.tap.box === false && P.tap.gate === "undefined" && P.tap.field === "undefined" && P.tap.bridge === false, P.tap);

  report("C5) panel · Freeform's GENERATE runs on the FIRST tap, a tap while a run is in flight starts nothing, and the tap after that runs again — one tap, one run, every time",
    P.tap.btn && P.tap.first === 1 && P.tap.busy === 1 && P.tap.second === 2, P.tap);

  report("C6) panel · no page error", P.errs.length === 0, P.errs.slice(0, 3));

  releasePins();

  console.log(failures ? "\n" + failures + " check(s) failed."
    : "\nALL PASS — one tap runs, an empty slot keeps its frame, and a result lands on the document's own frame.");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
