/* v6.18.0 — PROMPT HISTORY CAN BE DELETED.
 *
 * The owner's brief: "prompts history တွေကို ဖျက်လို့ရတာထည့်ပေးပါ" — add a way to delete
 * the prompt history. The Prompt history under the prompt box on CREATE kept
 * every prompt a student generated with (twenty unstarred, sixty starred) and
 * offered no way out but the browser's site-data wipe. Now every row carries
 * its own ✕ — one tap removes just that prompt, and a ⭐ starred preset (the
 * "never lose what I starred" promise) asks once before it goes — and a Clear
 * chip under the list drops every unstarred prompt in one tap while keeping
 * the ⭐ presets, the same rule the Gallery's clear has kept since v5.62.0.
 *
 * What is driven here against the served app, not just read from the source:
 * the ✕ on an unstarred row deletes without a question; on a starred row a
 * declined confirm keeps it and an accepted one removes it; Clear counts what
 * it will remove (hidden rows included), a declined confirm removes nothing,
 * an accepted one leaves exactly the starred presets with their names and
 * snapshots intact and hides itself; deleting the last prompt hides the whole
 * history box; the next generate brings it back. The strings carry the nine
 * languages; What's New says so; CI runs this.
 *
 * Usage: PORT=8931 node test/verify_prompt_history_delete.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const PANEL_WN = fs.readFileSync(path.join(ROOT, "panel", "js", "hnk_whats_new.js"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ---- A) the source ---- */
const wrapM = APP.match(/<div id="promptHistWrap"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/);
report("A) the Clear chip is markup inside the history box, hidden until there is something to clear",
  !!wrapM && /<div id="promptHist"><\/div>\s*<button class="chip" id="phClear" style="display:none"><\/button>/.test(wrapM[1]), wrapM && wrapM[1].slice(0, 300));

const fnStart = APP.indexOf("function renderPromptHist(){");
const fnEnd = APP.indexOf("\nrenderPromptHist();", fnStart);
const FN = fnStart >= 0 && fnEnd > fnStart ? APP.slice(fnStart, fnEnd) : "";
report("A2) every row gets a trash button with a spoken label, and a starred one asks before it goes",
  /var delB=el\("button","chip"\); delB\.innerHTML=icn\("i-trash"\)/.test(FN) && /delB\.setAttribute\("aria-label",L9\(/.test(FN) &&
  /if\(it\.star && !confirm\(L9\(/.test(FN) && /phSave\(phLoad\(\)\.filter\(function\(x\)\{ return x\.p!==it\.p; \}\)\)/.test(FN), FN.length);
report("A3) the Clear chip drops the unstarred and keeps the starred, asking first, and re-renders",
  /kept=l\.filter\(function\(x\)\{ return x\.star; \}\), dropped=l\.length-kept\.length/.test(FN) && /if\(!dropped\) return;/.test(FN) &&
  /phSave\(kept\); renderPromptHist\(\);/.test(FN), null);
const l9s = [];
FN.replace(/L9\(\{([\s\S]*?)\}\)\)?/g, (m, body) => { l9s.push(body); return m; });
const newL9 = l9s.filter(b => /i-trash|Delete this prompt|starred preset|Prompt deleted|Clear history|Starred presets stay|kept "\+kept/.test(b) || /ဖျက်|ရှင်း/.test(b));
const missing = [];
newL9.forEach((b, i) => LANGS.forEach(l => { if (!new RegExp("(^|,)" + l + ':"').test(b)) missing.push(i + "." + l); }));
report("A4) the six new strings — row label, starred question, row toast, chip label, clear question, clear toast — speak all nine languages",
  newL9.length >= 6 && missing.length === 0, { n: newL9.length, missing });

/* ---- B..G) driven ---- */
(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1800);

    const got = await page.evaluate(() => {
      const out = {};
      const KEY = "hnk_ws_prompts";
      const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
      const rows = () => Array.from(document.querySelectorAll("#promptHist .row"));
      const trash = row => Array.from(row.querySelectorAll("button")).find(b => b.innerHTML.indexOf("i-trash") >= 0);
      const vis = el => !!el && getComputedStyle(el).display !== "none";
      const wrap = document.getElementById("promptHistWrap"), clr = document.getElementById("phClear");
      let asked = 0, answer = false;
      const realConfirm = window.confirm;
      window.confirm = () => { asked++; return answer; };
      try {
        switchPage("pgCreate");
        /* B) three prompts, one a named starred preset with its snapshot */
        localStorage.setItem(KEY, JSON.stringify([
          { p: "sweep delete me first prompt", star: false, snap: { selRatio: "1:1" } },
          { p: "sweep treasured starred preset", star: true, name: "Bride finish", snap: { selRatio: "3:4" } },
          { p: "sweep delete me second prompt", star: false, snap: {} }
        ]));
        renderPromptHist();
        out.B = { rows: rows().length, trash: rows().every(r => !!trash(r)), labels: rows().every(r => (trash(r).getAttribute("aria-label") || "").length > 3),
          wrapOn: vis(wrap), clrOn: vis(clr), clrText: clr.textContent };
        /* C) ✕ on an unstarred row — no question asked, just that prompt gone */
        const unstarred = rows().find(r => !r.querySelector('[aria-pressed="true"]'));
        trash(unstarred).click();
        out.C = { asked, left: load().map(x => x.p), rows: rows().length, clrText: clr.textContent };
        /* D) ✕ on the starred row — declined keeps it, accepted removes it */
        const starredRow = () => rows().find(r => !!r.querySelector('[aria-pressed="true"]'));
        answer = false; trash(starredRow()).click();
        out.D1 = { asked, left: load().map(x => x.p) };
        answer = true; trash(starredRow()).click();
        out.D2 = { asked, left: load().map(x => x.p), clrText: clr.textContent, clrOn: vis(clr) };
        /* E) Clear — counts what it will drop, declined drops nothing, accepted leaves the presets whole */
        localStorage.setItem(KEY, JSON.stringify([
          { p: "sweep keep me starred preset", star: true, name: "Groom finish", snap: { selRatio: "4:5", rt: { a: 1 } } },
          { p: "sweep clear one", star: false }, { p: "sweep clear two", star: false }, { p: "sweep clear three", star: false }
        ]));
        renderPromptHist();
        asked = 0; answer = false;
        out.E0 = { clrOn: vis(clr), clrText: clr.textContent };
        clr.click();
        out.E1 = { asked, n: load().length };
        answer = true; clr.click();
        const after = load();
        out.E2 = { asked, left: after, rows: rows().length, clrOn: vis(clr), wrapOn: vis(wrap) };
        /* F) the last prompt goes — so does the box */
        answer = true; trash(rows()[0]).click();
        out.F = { n: load().length, rows: rows().length, wrapOn: vis(wrap), clrOn: vis(clr) };
        /* G) the next generate brings the history — and its Clear — back */
        pushPromptHistory("sweep a fresh prompt after clearing everything");
        out.G = { n: load().length, wrapOn: vis(wrap), clrOn: vis(clr), clrText: clr.textContent };
      } finally {
        window.confirm = realConfirm;
        localStorage.removeItem(KEY);
        renderPromptHist();
      }
      return out;
    });

    report("B) three seeded prompts render three rows, each with a labelled trash button; the box and the Clear chip show, the chip counting the two unstarred",
      got.B.rows === 3 && got.B.trash && got.B.labels && got.B.wrapOn && got.B.clrOn && /2/.test(got.B.clrText), got.B);
    report("C) the ✕ on an unstarred row asks nothing and removes exactly that prompt; the chip now counts one",
      got.C.asked === 0 && got.C.left.length === 2 && got.C.left.indexOf("sweep treasured starred preset") >= 0 && got.C.rows === 2 && /1/.test(got.C.clrText), got.C);
    report("D) the ✕ on a starred preset asks first — declined, it stays; accepted, it goes and the unstarred one remains",
      got.D1.asked === 1 && got.D1.left.length === 2 && got.D2.asked === 2 && got.D2.left.length === 1 && got.D2.left[0] !== "sweep treasured starred preset" && got.D2.clrOn, { D1: got.D1, D2: got.D2 });
    report("E) Clear counts the three it will drop; declined it drops nothing; accepted it leaves only the starred preset — name and snapshot intact — and hides itself while the box stays",
      got.E0.clrOn && /3/.test(got.E0.clrText) && got.E1.asked === 1 && got.E1.n === 4 && got.E2.asked === 2 &&
      got.E2.left.length === 1 && got.E2.left[0].p === "sweep keep me starred preset" && got.E2.left[0].star === true && got.E2.left[0].name === "Groom finish" &&
      got.E2.left[0].snap && got.E2.left[0].snap.selRatio === "4:5" && got.E2.rows === 1 && !got.E2.clrOn && got.E2.wrapOn, { E0: got.E0, E1: got.E1, E2: got.E2 });
    report("F) deleting the last prompt empties the store and hides the whole history box",
      got.F.n === 0 && got.F.rows === 0 && !got.F.wrapOn && !got.F.clrOn, got.F);
    report("G) the next prompt through pushPromptHistory brings the box and the Clear chip back, counting one",
      got.G.n === 1 && got.G.wrapOn && got.G.clrOn && /1/.test(got.G.clrText), got.G);
    report("H) no page errors while driving it", errs.length === 0, errs);
  } finally {
    await browser.close();
  }

  /* ---- I) What's New, the panel's copy, CI ---- */
  const wnStart = APP.indexOf("var WHATS_NEW = [");
  const wnBlock = APP.slice(wnStart, APP.indexOf("\n];", wnStart));
  const rowRe = /\{ v:"([\d.]+)", kind:"page", ref:"pgCreate",\s*t:\{my:"([^"]*)",en:"([^"]*)"/g;
  let row = null, m;
  while ((m = rowRe.exec(wnBlock))) { if (/Prompt history can be deleted/.test(m[3])) row = m; }
  report("I) What's New carries the row, found by what it says — a CREATE page entry on deleting prompt history, in Burmese and English, at 6.18.0",
    !!row && row[1] === "6.18.0" && /Prompt မှတ်တမ်း/.test(row[2]) && /✕/.test(row[3]) && /Clear/.test(row[3]), row && row.slice(1, 4));
  report("I2) the panel's lifted What's New says the same, byte for byte",
    !!row && PANEL_WN.indexOf(row[0]) >= 0, null);
  report("I3) CI runs this", /node test\/verify_prompt_history_delete\.js/.test(CI), null);

  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
