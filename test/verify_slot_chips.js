/* Every tool that takes a file says which files it takes, before one is picked
 * — on both surfaces, in the student's own language.
 *
 * WHAT THIS CLOSES. The V→V deck puts a pill on each card: "1 video",
 * "1 video + 1 photo", "1 video + 1 face photo". Students read it. The pages
 * that actually TAKE those files said nothing. Video Tools showed one button
 * and HID its photo button entirely for tools that do not use one, so a
 * student never learned that some tools want a photo at all — they only found
 * out by picking a different tool and watching a second button appear. And
 * Talking Photo, the page most likely to receive the wrong kind of file, asked
 * for a picture and a recording with two identical-looking buttons.
 *
 * The chips are that pill, made live: dim and dashed while the slot is empty,
 * gold once it holds something, and tapping one opens that slot's picker. This
 * checks both pages on both surfaces, that the photo slot follows the tool's
 * own imageParam rather than a hardcoded list, and that the wording is one
 * table rather than two.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_slot_chips.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const APP = read("docs/app/index.html");
const PANEL = read("panel/main.js");
const PORT = process.env.PORT || 8931;
let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
}

/* ---- A) the wording is one table, not two ---- */
const NAMES = [
  ["video", "ဗီဒီယို ၁", "1 video"],
  ["photo", "ပုံ ၁", "1 photo"],
  ["audio", "အသံ ၁", "1 recording"]
];
check("A) both surfaces name the slots with the same words",
  NAMES.every(([, my, en]) => APP.includes(my) && APP.includes(en) &&
    PANEL.includes(my) && PANEL.includes(en)),
  NAMES.filter(([, my]) => !(APP.includes(my) && PANEL.includes(my))).map(n => n[0]).join(", "));

check("A2) the panel keeps them in one table rather than inline at each call",
  /const SLOT_L = \{/.test(PANEL) && /ff9\(SLOT_L\.video\)/.test(PANEL) &&
  /ff9\(SLOT_L\.photo\)/.test(PANEL) && /ff9\(SLOT_L\.audio\)/.test(PANEL),
  "the panel repeats the slot names at each call site");

/* ---- B) the photo slot follows the tool, not a list ---- */
check("B) the app decides the photo slot from the tool's own imageParam",
  /if\(m && m\.imageParam\) slots\.push/.test(APP),
  "the app hardcodes which tools show a photo slot");
check("B2) and so does the panel",
  /if \(d && d\.imageParam\) slots\.push/.test(PANEL),
  "the panel hardcodes which tools show a photo slot");

/* ---- C) live, on both surfaces ---- */
(async () => {
  const browser = await chromium.launch();
  try {
    /* --- the web app --- */
    const app = await browser.newPage({ viewport: { width: 420, height: 820 } });
    const appErrs = [];
    app.on("pageerror", e => appErrs.push(String(e).slice(0, 160)));
    await app.addInitScript(`try{ localStorage.setItem("hnk_seen_splash","1"); localStorage.setItem("hnk_ws_onboarded","1"); }catch(e){}`);
    await app.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await app.waitForTimeout(2500);
    const a = await app.evaluate(() => {
      const out = {};
      const txt = id => { const h = document.getElementById(id); return h ? [...h.children].map(c => c.textContent.trim()) : null; };
      try { switchPage("pgVideoUp"); } catch (e) { }
      out.videoOnly = txt("vtSlotChips");
      out.dimWhileEmpty = !!document.querySelector("#vtSlotChips .slotchip:not(.on)");
      try {
        const sel = document.getElementById("selVtModel");
        const withImg = [...sel.options].find(o => { const d = rhVtModelDef(o.value); return d && d.imageParam; });
        if (withImg) { sel.value = withImg.value; updateVtModelUI(); }
      } catch (e) { out.err = String(e).slice(0, 120); }
      out.withPhoto = txt("vtSlotChips");
      try { switchPage("pgTalk"); } catch (e) { }
      out.talk = txt("tkSlotChips");
      return out;
    });
    check("C) the app's Video Tools names the video slot, and only that, for a video-only tool",
      Array.isArray(a.videoOnly) && a.videoOnly.length === 1 && a.videoOnly[0].indexOf("ဗီဒီယို") >= 0,
      JSON.stringify(a.videoOnly));
    check("C2) and adds a photo slot the moment a tool that takes one is chosen",
      Array.isArray(a.withPhoto) && a.withPhoto.length === 2 && a.withPhoto[1].indexOf("ပုံ") >= 0,
      JSON.stringify(a.withPhoto));
    check("C3) an empty slot reads as empty rather than as done",
      a.dimWhileEmpty === true, "every chip renders in the filled state");
    check("C4) Talking Photo names both kinds of file it takes",
      Array.isArray(a.talk) && a.talk.length === 2 &&
      a.talk[0].indexOf("ပုံ") >= 0 && a.talk[1].indexOf("အသံ") >= 0,
      JSON.stringify(a.talk));
    check("C5) no page error while the chips built",
      appErrs.length === 0, appErrs.slice(0, 2).join(" | "));
    await app.close();

    /* --- the panel --- */
    const dir = path.join(ROOT, "panel");
    const server = http.createServer((req, res) => {
      let p = path.join(dir, decodeURIComponent(req.url.split("?")[0]));
      if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, "index.html");
      const e = path.extname(p);
      res.writeHead(200, { "Content-Type": e === ".js" ? "text/javascript" : e === ".css" ? "text/css" : e === ".svg" ? "image/svg+xml" : "text/html" });
      res.end(fs.readFileSync(p));
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const pg = await browser.newPage({ viewport: { width: 420, height: 820 } });
    const pErrs = [];
    pg.on("pageerror", e => pErrs.push(String(e).slice(0, 160)));
    await pg.route("**/*", r => r.request().url().indexOf("127.0.0.1") >= 0
      ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await pg.addInitScript(UXP_STUB);
    await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
    await pg.waitForTimeout(2500);
    const p2 = await pg.evaluate(() => {
      const out = {};
      const txt = id => { const h = document.getElementById(id); return h ? [...h.children].map(c => c.textContent.trim()) : null; };
      try { switchPage("video"); } catch (e) { }
      out.vt = txt("vtSlotChips");
      try { switchPage("talk"); } catch (e) { }
      out.tk = txt("tkSlotChips");
      return out;
    });
    check("D) the panel's Video Tools names its video slot",
      Array.isArray(p2.vt) && p2.vt.length >= 1 && p2.vt[0].indexOf("ဗီဒီယို") >= 0,
      JSON.stringify(p2.vt));
    check("D2) and the panel's Talking Photo names both of its slots",
      Array.isArray(p2.tk) && p2.tk.length === 2 &&
      p2.tk[0].indexOf("ပုံ") >= 0 && p2.tk[1].indexOf("အသံ") >= 0,
      JSON.stringify(p2.tk));
    check("D3) no page error while the panel's chips built",
      pErrs.length === 0, pErrs.slice(0, 2).join(" | "));
    await pg.close();
    server.close();
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} check(s) failed`
    : "\nAll checks passed — every file a tool takes is named before it is picked, on both surfaces.");
  process.exit(failures ? 1 : 0);
})();
