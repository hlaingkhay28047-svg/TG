/* v6.78.0 / panel 6.149.0 — PICKERS THAT OPEN IN PHOTOSHOP, AND THE UNTIDY PLACES.

   The owner's sixteen photographs of 6.148.0 in real Photoshop said three
   things in a sentence: "model တွေ ရွေးမရဘူး၊ ဘာသာစကား ရွေးမရသေးဘူး၊ UI/UX က
   မသပ်ရပ်ဘူး" — no model can be chosen, no language, and the pages are untidy.
   Each has a mechanism, and this file pins each fix:

     1. THE PICKERS. Every picker (twenty-odd model / quality / count / size /
        resolution / duration / option selects and the header's language) was a
        native <select> made transparent and laid over a styled button. A
        browser opens the select's dropdown on the tap; Photoshop's renderer
        opens nothing. The select now sits off the hit path (1px, left:-9999px,
        still the value every reader and writer uses) and the button opens the
        panel's own <dialog> list — one row per option, disabled options as
        group headers, a search field past eight rows — and a chosen row sets
        selectedIndex and fires the same input + change events, so every
        existing handler repaints as before. (B)
     2. THE SCOPES. 6.66.1 read each page's class attribute once and cached
        it; photographs 12–13 (Imagine's art at natural size past the panel's
        edge, Retouch A's chips stacked and its ✕ under the photo) are a bad
        first read: .apg and .stpg gone from those pages. The scopes are now a
        table in main.js that this test keeps equal to index.html, and nothing
        is asked of the element. (A2, D)
     3. THE PHOTO SHEET was a position:fixed overlay, which Photoshop lays out
        as a block at the end of the page (photograph 9: "IMAGE 2 — ဘယ်ကယူမလဲ"
        under GENERATE). It is a <dialog> now. (A3, C)
     4. The Imagine Before|After pictures were sized from a measured
        clientWidth (0 in Photoshop): they take 100/v % of their v %-wide clip
        now, a width the layout resolves by itself. (A7, E)
     5. Home's dash-card labels painted at the grid's foot (a flex box around a
        bare text node), five slot buttons wrapped 4 + 1, Freeform's box wore
        the host's frame, and three workflow status lines spoke English in a
        Burmese panel. (A4–A6, A8, F)

   Fault-injected while writing: restoring `.hsl .inp { left:0; width:100% }`
   fails A1; dropping pageMeitu from PAGE_SCOPE_STPG fails A2 and D1;
   `photoSheet` back on a div fails A3/C1; `bef.style.width = art.clientWidth`
   fails A7/E1; one missing I18N block fails A8. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail).slice(0, 700)));
  if (!ok) failures++;
}
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

const INDEX = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const WF = fs.readFileSync(path.join(PANEL, "src/ui/screens/workflow-tools-screen.js"), "utf8");
const IMAGINE_PANEL = fs.readFileSync(path.join(PANEL, "js/hnk_imagine.js"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");

const LANGS = ["en", "my", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const NEW_KEYS = ["pick_title", "pick_search", "pick_none", "wf_ready_generate", "wf_add_required", "wf_press_prepare"];

/* the page scopes as index.html writes them: every element whose class list holds the token "page" */
function pageScopesFromMarkup() {
  const out = {};
  const re = /<(?:div|section)\b([^>]*)>/g; let m;
  while ((m = re.exec(INDEX))) {
    const attrs = m[1];
    const cm = /\bclass="([^"]*)"/.exec(attrs), im = /\bid="([^"]*)"/.exec(attrs);
    if (!cm || !im) continue;
    const toks = cm[1].trim().split(/\s+/);
    if (toks.indexOf("page") < 0) continue;
    out[im[1]] = { apg: toks.indexOf("apg") >= 0, stpg: toks.indexOf("stpg") >= 0 };
  }
  return out;
}

function sourcePins() {
  /* A1 — the select leaves the hit path in both scopes (header + app pages) */
  const offHdr = /\.hdr \.hsl \.inp \{ position: absolute; left: -9999px; top: 0; width: 1px; height: 1px;/.test(CSS);
  const offApg = /\.apg \.hsl \.inp \{ position: absolute; left: -9999px; top: 0; width: 1px; height: 1px;/.test(CSS);
  const overlayLeft = /\.hsl \.inp \{ position: absolute; left: 0; top: 0; width: 100%; height: 100%;/.test(CSS);
  report("A1) both .hsl .inp rules park the native select off the hit path (1px at left:-9999px) — no transparent overlay is left",
    offHdr && offApg && !overlayLeft, { offHdr, offApg, overlayLeft });

  /* A1b — the picker: one document listener on .hsl-btn, a <dialog id=hnkPick>, rows that set selectedIndex and fire input + change */
  const pick = {
    dialog: /dlg\.className = "hnk-dlg hnk-pick"; dlg\.id = "hnkPick";/.test(MAIN),
    delegate: /const btn = hslClosest\(t0, "hsl-btn"\);/.test(MAIN) && /document\.addEventListener\("click", function \(ev\) \{/.test(MAIN),
    choose: /sel\.selectedIndex = i;[\s\S]{0,200}dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\);[\s\S]{0,80}dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\);/.test(MAIN),
    groups: /if \(o\.disabled\) \{[\s\S]{0,120}g\.className = "hnk-pick-grp";/.test(MAIN),
    search: /if \(opts\.length > 8\) \{[\s\S]{0,120}q\.className = "inp hnk-pick-q";/.test(MAIN),
    api: /globalThis\.HNK\.hslPicker = \{/.test(MAIN) && /safe\("pickers", function \(\) \{ bindHslPickers\(\); \}\);/.test(MAIN),
    css: /\.hnk-pick \{ width: 320px; \}/.test(CSS) && /\.hnk-pick-list \{ display: block; max-height: 380px; overflow-y: auto;/.test(CSS) && /\.hnk-pick-row\.on \{/.test(CSS)
  };
  report("A1b) main.js carries the picker: document-level .hsl-btn delegation → <dialog id=hnkPick> with rows (disabled options as group headers, a search field past eight), choose() sets selectedIndex and fires input + change, HNK.hslPicker exported, bound in init",
    Object.keys(pick).every(k => pick[k]), pick);

  /* A2 — the scope table IS the markup, and nothing is read from the element any more */
  const scopes = pageScopesFromMarkup();
  const tm = /const PAGE_SCOPE_STPG = \{([^}]*)\};/.exec(MAIN);
  const table = tm ? tm[1].split(",").map(s => s.trim().split(":")[0].trim()).filter(Boolean).sort() : null;
  const markupStpg = Object.keys(scopes).filter(id => scopes[id].stpg).sort();
  const allApg = Object.keys(scopes).every(id => scopes[id].apg);
  report("A2) main.js PAGE_SCOPE_STPG equals the set of index.html pages carrying .stpg, every page carries .apg, pageScope() is what switchPage paints, and scopeMem is gone",
    !!table && JSON.stringify(table) === JSON.stringify(markupStpg) && markupStpg.length >= 4 && allApg
    && /function pageScope\(pageId\) \{ return " apg" \+ \(PAGE_SCOPE_STPG\[pageId\] \? " stpg" : ""\); \}/.test(MAIN)
    && /const scope = pageScope\(p\.page\);\s*\n\s*pe\.className = "page" \+ scope \+/.test(MAIN)
    && MAIN.indexOf("scopeMem") < 0 && Object.keys(scopes).length >= 16,
    { table, markupStpg, allApg, pages: Object.keys(scopes).length, scopeMem: MAIN.indexOf("scopeMem") });

  /* A3 — the photo sheet is a dialog, and its CSS no longer fixes it to the viewport */
  report("A3) photoSheet builds a <dialog id=ffSheet class=ff-sheet> (showModal, a Cancel row, backdrop + cancel close) and .ff-sheet is no longer position:fixed",
    /const bd = document\.createElement\("dialog"\); bd\.id = "ffSheet"; bd\.className = "ff-sheet";/.test(MAIN)
    && /cancel\.className = "btn ff-sheet-cancel";/.test(MAIN)
    && /bd\.addEventListener\("cancel", function \(\) \{ ffSheetClose\(\); \}\);/.test(MAIN)
    && /if \(typeof bd\.showModal === "function"\) bd\.showModal\(\); else bd\.setAttribute\("open", ""\);/.test(MAIN)
    && /\.ff-sheet \{ background-color: var\(--panel\); border: 1px solid var\(--line-soft\); border-radius: 14px; padding: 0;/.test(CSS)
    && !/\.ff-sheet \{ position: fixed;/.test(CSS),
    { fixed: /\.ff-sheet \{ position: fixed;/.test(CSS) });

  /* A4 — Home's tile labels are blocks */
  report("A4) #pageAiTools .dash-card .lbl is display:block (a flex box around a bare text node painted its text at the grid's foot)",
    /#pageAiTools \.dash-card \.lbl \{ display: block;/.test(CSS) && !/#pageAiTools \.dash-card \.lbl \{ display: flex;/.test(CSS), {});

  /* A5 — five slot buttons sit 3 + 2 */
  report("A5) .hnk-req-row > .hnk-btn takes a third of the row (flex: 1 1 30%, min-width 0, border-box) so five source buttons sit 3 + 2, not 4 + 1",
    /\.hnk-req-row > \.hnk-btn \{ flex: 1 1 30%; min-width: 0; box-sizing: border-box;/.test(CSS), {});

  /* A6 — Freeform's box wears no host frame */
  report("A6) .pbox drops the host's own appearance / outline / box-shadow",
    /\.pbox \{ -webkit-appearance: none; appearance: none; outline: none; box-shadow: none; \}/.test(CSS), {});

  /* A7 — Imagine's Before pictures are sized by percentage, never by a measured width */
  const imPins = (src) => ({
    hub: /var hubBefW=function\(v\)\{ return \(v>0 \? Math\.round\(1000000\/v\)\/100 : 100\)\+"%"; \};/.test(src),
    hubSet: /bef\.style\.width=hubBefW\(v\); \};/.test(src),
    cmp: /function cmpBefW\(v\)\{ return \(v>0 \? Math\.round\(1000000\/v\)\/100 : 100\)\+"%"; \}/.test(src),
    cmpSet: /if\(refs\.orig\) refs\.orig\.style\.width=cmpBefW\(v\);/.test(src),
    noMeasure: src.indexOf("bef.style.width=art.clientWidth") < 0 && src.indexOf("refs.orig.style.width=refs.cmp.clientWidth") < 0
  });
  const ap = imPins(APP), pp = imPins(IMAGINE_PANEL);
  report("A7) app + panel Imagine: hub hubBefW(v) and tool cmpBefW(v) give the Before picture 100/v % of its clip; the measured clientWidth widths are gone",
    Object.keys(ap).every(k => ap[k] && pp[k]), { app: ap, panel: pp });

  /* A8 — six new keys in all nine languages; the three workflow lines go through dom.t */
  const perKey = {};
  NEW_KEYS.forEach(k => { perKey[k] = (MAIN.match(new RegExp("^    " + k + ': "', "mg")) || []).length; });
  report("A8) pick_title · pick_search · pick_none · wf_ready_generate · wf_add_required · wf_press_prepare exist in all nine I18N blocks, and workflow-tools-screen reads the three status lines through dom.t",
    NEW_KEYS.every(k => perKey[k] === 9)
    && /dom\.t\("wf_ready_generate", "All required inputs are ready \\u2014 press GENERATE\."\)/.test(WF)
    && /dom\.t\("wf_add_required", "Add the required images\."\)/.test(WF)
    && /dom\.t\("wf_press_prepare", "Press Prepare to load this workflow and check your images\."\)/.test(WF)
    && !/textContent = canGenerate \? "All required inputs/.test(WF),
    perKey);

  /* A9 — CI runs this file */
  report("A9) .github/workflows/test.yml runs verify_panel_pickers.js right after verify_panel_dead_controls.js",
    /node test\/verify_panel_dead_controls\.js\n[\s\S]{0,400}node test\/verify_panel_pickers\.js/.test(CI), {});
}

/* the class read Photoshop can answer with null (6.53.0), both routes the old scope code took */
const NULL_CLASS_READ = `(function () {
  const ga = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function (n) { if (n === "class") return null; return ga.call(this, n); };
  const d = Object.getOwnPropertyDescriptor(Element.prototype, "className");
  Object.defineProperty(Element.prototype, "className", { configurable: true, get: function () { return null; }, set: function (v) { d.set.call(this, v); } });
})();`;

async function main() {
  sourcePins();
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  async function boot(o) {
    o = o || {};
    const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 220)));
    await page.route("**/*", route => {
      const u = route.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    for (const s of (o.pre || [])) await page.addInitScript(s);
    await page.addInitScript(UXP_STUB);
    for (const s of (o.post || [])) await page.addInitScript(s);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(500);
    return { page, errs };
  }
  try {
    const B = await boot();
    /* ---------------- B. the pickers, end to end ---------------- */
    await B.page.evaluate(() => switchPage("aitools"));
    const b1 = await B.page.evaluate(() => {
      const sel = document.getElementById("rhModelSel");
      const adv = document.getElementById("rhAdvH"); if (adv) adv.click();
      const cs = getComputedStyle(sel);
      document.getElementById("rhModelBtn").click();
      const d = document.getElementById("hnkPick");
      const rows = d ? Array.from(d.querySelectorAll(".hnk-pick-row")) : [];
      const on = d ? d.querySelector(".hnk-pick-row.on") : null;
      return { open: !!d && d.tagName === "DIALOG" && d.open === true, isOpen: HNK.hslPicker.isOpen(), rows: rows.length, opts: sel.options.length,
        title: d && d.querySelector(".hnk-dlg-msg").textContent, search: !!(d && d.querySelector(".hnk-pick-q")),
        onIdx: on && on.getAttribute("data-i"), selIdx: sel.selectedIndex, selOffPath: cs.position === "absolute" && cs.left === "-9999px" && cs.width === "1px", cancel: !!(d && d.querySelector(".hnk-dlg-row .btn")) };
    });
    report("B1) a tap on the Model button (Home ▸ Advanced) opens <dialog id=hnkPick>: title \"Model\", one row per option, the current option marked, a search field (49 > 8), a Cancel row; the native select sits off the hit path",
      b1.open && b1.isOpen && b1.rows === b1.opts && b1.rows > 8 && b1.title === "Model" && b1.search && b1.onIdx === String(b1.selIdx) && b1.selOffPath && b1.cancel, b1);

    const b2 = await B.page.evaluate(() => {
      const sel = document.getElementById("rhModelSel"); const ev = { input: 0, change: 0 };
      sel.addEventListener("input", () => ev.input++); sel.addEventListener("change", () => ev.change++);
      const rows = Array.from(document.querySelectorAll("#hnkPick .hnk-pick-row"));
      const pick = rows.find(r => r.getAttribute("data-i") !== String(sel.selectedIndex));
      const label = pick.textContent; pick.click();
      return { ev, selIdx: sel.selectedIndex, picked: +pick.getAttribute("data-i"), selVal: sel.value, optVal: sel.options[+pick.getAttribute("data-i")].value,
        val: document.getElementById("rhModelVal").textContent, label, closed: !document.getElementById("hnkPick") && !HNK.hslPicker.isOpen() };
    });
    report("B2) choosing a row sets the select (selectedIndex + value), fires input then change, the button's own label repaints to the chosen model, and the dialog is gone",
      b2.ev.input === 1 && b2.ev.change === 1 && b2.selIdx === b2.picked && b2.selVal === b2.optVal && b2.val && b2.label.indexOf(b2.val.replace(/ ✓$/, "")) >= 0 && b2.closed, b2);

    const b3 = await B.page.evaluate(() => {
      const sel = document.getElementById("selLang");
      const before = state.lang;
      document.getElementById("langHslBtn").click();
      const d = document.getElementById("hnkPick"); const rows = d ? Array.from(d.querySelectorAll(".hnk-pick-row")) : [];
      const title = d && d.querySelector(".hnk-dlg-msg").textContent;
      const th = rows.find(r => sel.options[+r.getAttribute("data-i")].value === "th"); th.click();
      const afterTh = { lang: state.lang, val: document.getElementById("langVal").textContent, closed: !document.getElementById("hnkPick") };
      document.getElementById("langHslBtn").click();
      const rows2 = Array.from(document.querySelectorAll("#hnkPick .hnk-pick-row"));
      const my = rows2.find(r => sel.options[+r.getAttribute("data-i")].value === "my"); my.click();
      return { before, rows: rows.length, opts: sel.options.length, title, afterTh, back: state.lang, val: document.getElementById("langVal").textContent, pickTitleMy: t("pick_title") };
    });
    report("B3) the header's language button opens the same list (title \"Language\", one row per language); ไทย switches the panel to th and paints ไทย on the button; မြန်မာ switches it back",
      b3.before === "my" && b3.rows === b3.opts && b3.rows >= 9 && b3.title === "Language" && b3.afterTh.lang === "th" && b3.afterTh.val === "ไทย" && b3.afterTh.closed && b3.back === "my" && b3.pickTitleMy === "ရွေးပါ", b3);

    await B.page.evaluate(() => switchPage("video"));
    const b4 = await B.page.evaluate(() => {
      document.getElementById("vidModelBtn").click();
      const d = document.getElementById("hnkPick"); const q = d.querySelector(".hnk-pick-q");
      const rows = d.querySelectorAll(".hnk-pick-row").length, grps = d.querySelectorAll(".hnk-pick-grp").length;
      const vis = (s) => Array.from(d.querySelectorAll(s)).filter(r => !/\bhide\b/.test(r.className)).length;
      q.value = "kling"; q.dispatchEvent(new Event("input", { bubbles: true }));
      const kling = { rows: vis(".hnk-pick-row"), grps: vis(".hnk-pick-grp"), allKling: Array.from(d.querySelectorAll(".hnk-pick-row")).filter(r => !/\bhide\b/.test(r.className)).every(r => /kling/i.test(r.textContent)) };
      q.value = "zzzzqq"; q.dispatchEvent(new Event("input", { bubbles: true }));
      const none = { rows: vis(".hnk-pick-row"), noneShown: !/\bhide\b/.test(d.querySelector(".hnk-pick-none").className), noneText: d.querySelector(".hnk-pick-none").textContent };
      q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true }));
      const reset = { rows: vis(".hnk-pick-row"), grps: vis(".hnk-pick-grp") };
      d.querySelector(".hnk-dlg-row .btn").click();
      return { rows, grps, kling, none, reset, closed: !document.getElementById("hnkPick"), placeholder: q.getAttribute("placeholder") };
    });
    report("B4) the Video model list (180-odd rows under 40-odd family headers) filters as you type: \"kling\" leaves only Kling rows and their families, a miss shows the \"nothing matches\" line, clearing restores every row; Cancel closes",
      b4.rows > 150 && b4.grps > 20 && b4.kling.rows > 5 && b4.kling.rows < b4.rows && b4.kling.grps < b4.grps && b4.kling.allKling
      && b4.none.rows === 0 && b4.none.noneShown && b4.none.noneText === "မတွေ့ပါ" && b4.reset.rows === b4.rows && b4.reset.grps === b4.grps && b4.closed && b4.placeholder === "ရှာရန်…", b4);

    const b5 = await B.page.evaluate(() => {
      const ids = ["ffModelBtn", "ffCountBtn", "ffSizeBtn", "t2iModelBtn", "t2iResBtn", "vidResBtn", "vidDurBtn", "vuResBtn", "vtModelBtn", "vtOptBtn", "tkModelBtn", "rhQualityBtn"];
      const out = {};
      ids.forEach(id => {
        const b = document.getElementById(id); if (!b) { out[id] = "absent"; return; }
        const wrap = b.parentNode; const sel = wrap.querySelector("select");
        b.click();
        const d = document.getElementById("hnkPick");
        out[id] = { opened: !!d, rows: d ? d.querySelectorAll(".hnk-pick-row, .hnk-pick-grp").length : 0, opts: sel ? sel.options.length : -1, title: d && d.querySelector(".hnk-dlg-msg").textContent };
        HNK.hslPicker.close();
      });
      const kb = (function () { const b = document.getElementById("ffModelBtn"); b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); const o = !!document.getElementById("hnkPick"); HNK.hslPicker.close(); return o; })();
      return { out, kb };
    });
    const b5ok = Object.keys(b5.out).every(id => b5.out[id] !== "absent" && b5.out[id].opened && (b5.out[id].opts === 0 || b5.out[id].rows === b5.out[id].opts) && b5.out[id].title);
    report("B5) every other picker in the markup (Freeform model · count · size, T2I model · res, Video res · dur, VidUp res, Talk model · option, Talk model, Quality) opens the list with one row per option and a title, and Enter on a focused button opens it too",
      b5ok && b5.kb, b5);

    /* ---------------- C. the photo sheet ---------------- */
    await B.page.evaluate(() => switchPage("create"));
    const c1 = await B.page.evaluate(() => {
      const calls = { layer: 0, file: 0 };
      photoSheet("IMAGE 2", { onLayer: function () { calls.layer++; }, onFile: function () { calls.file++; } });
      const d = document.getElementById("ffSheet");
      const r = { tag: d && d.tagName, open: d && d.open === true, btns: d ? d.querySelectorAll(".btn").length : 0, cancel: !!(d && d.querySelector(".ff-sheet-cancel")),
        title: d && d.querySelector(".subh").textContent, inBody: !!d && d.parentNode === document.body, cls: d && d.className };
      d.querySelector(".ff-sheet-cancel").click(); r.goneAfterCancel = !document.getElementById("ffSheet");
      photoSheet("IMAGE 2", { onLayer: function () { calls.layer++; }, onFile: function () { calls.file++; } });
      document.querySelector("#ffSheet .btn").click();
      r.goneAfterPick = !document.getElementById("ffSheet"); r.calls = calls;
      return r;
    });
    report("C1) photoSheet(\"IMAGE 2\") opens a <dialog id=ffSheet class=ff-sheet> in the body (Layer · File · Cancel, title \"IMAGE 2 — ဘယ်ကယူမလဲ\"); Cancel removes it, and the first option runs its callback and removes it",
      c1.tag === "DIALOG" && c1.open && c1.btns === 3 && c1.cancel && /^IMAGE 2 — /.test(c1.title) && c1.inBody && c1.cls === "ff-sheet" && c1.goneAfterCancel && c1.goneAfterPick && c1.calls.layer === 1 && c1.calls.file === 0, c1);

    /* ---------------- E. Imagine's Before pictures ---------------- */
    await B.page.evaluate(() => switchPage("imagine"));
    await B.page.waitForTimeout(400);
    const e1 = await B.page.evaluate(() => {
      const hub = document.querySelector(".im-hubcmp"); const bef = hub && hub.querySelector("img.im-orig"); const top = hub && hub.querySelector(".im-cmp-top");
      return { hub: !!hub, befW: bef && bef.style.width, topW: top && top.style.width, splits: HNK.imagine.hubSplit() };
    });
    const hubBox = await B.page.$(".im-hubcmp");
    const bb = hubBox ? await hubBox.boundingBox() : null;
    if (bb) {
      await B.page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
      await B.page.mouse.down();
      await B.page.mouse.move(bb.x + bb.width * 0.25, bb.y + bb.height * 0.5, { steps: 4 });
      await B.page.mouse.up();
    }
    const e1b = await B.page.evaluate(() => {
      const hub = document.querySelector(".im-hubcmp"); const bef = hub.querySelector("img.im-orig"); const top = hub.querySelector(".im-cmp-top");
      const v = parseFloat(top.style.width);
      return { befW: bef.style.width, topW: top.style.width, v, expect: (Math.round(1000000 / v) / 100) + "%" };
    });
    report("E1) the hub's Before|After card: the Before picture is 200% wide at the 50% split, and after a drag to a quarter it is 100/v % of the v%-wide clip — no measured width anywhere",
      e1.hub && e1.befW === "200%" && e1.topW === "50%" && bb && e1b.v > 0 && e1b.v < 50 && e1b.befW === e1b.expect, { e1, e1b, bb: !!bb });

    const e2 = await B.page.evaluate(() => {
      const api = HNK.imagine; const st = api.state;
      const tool = (api.data.tools || [])[0]; api.openTool(tool.id);
      /* a photo with a result, so the tool view draws its Before|After compare */
      const px = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
      st.photos = [{ dataUrl: px, name: "one.jpg", out: { dataUrl: px, size: "" }, status: "done", sec: 1, err: "", strokes: [] }];
      st.cur = 0; st.split = 50; api.render();
      return { tool: tool.id, photos: st.photos.length, split: st.split, cmp: !!document.querySelector(".im-cmp .im-cmp-top img.im-orig") };
    });
    await B.page.waitForTimeout(200);
    const e3 = await B.page.evaluate(() => {
      const api = HNK.imagine;
      const orig = () => { const o = document.querySelector(".im-cmp .im-cmp-top img.im-orig"); return o ? o.style.width : null; };
      const at50 = orig(); api.setSplit(25); const at25 = orig(); api.setSplit(80); const at80 = orig();
      return { at50, at25, at80, split: api.state.split };
    });
    report("E2) the tool view's Before|After compare sizes its Before picture by the split too: 200% at 50, 400% at 25, 125% at 80",
      e2.tool && e2.cmp && e3.at50 === "200%" && e3.at25 === "400%" && e3.at80 === "125%" && e3.split === 80, { e2, e3 });

    /* ---------------- F. the three workflow lines ---------------- */
    const f1 = await B.page.evaluate(() => {
      const out = {};
      const pick = (code) => { const sel = document.getElementById("selLang"); sel.value = code; sel.dispatchEvent(new Event("change", { bubbles: true })); };
      ["my", "th", "en"].forEach(l => { pick(l); out[l] = { lang: state.lang, ready: t("wf_ready_generate"), add: t("wf_add_required"), prep: t("wf_press_prepare") }; });
      pick("my");
      return out;
    });
    report("F1) the workflow status lines answer in the panel's language: Burmese by default, Thai, English — never the English fallback in a Burmese panel",
      f1.my.lang === "my" && f1.th.lang === "th" && f1.en.lang === "en" && f1.my.ready === "လိုအပ်တဲ့ ပုံတွေ အဆင်သင့်ပါ — GENERATE နှိပ်ပါ။" && f1.my.add === "လိုအပ်တဲ့ ပုံတွေ ထည့်ပါ။" && /ပြင်ဆင်/.test(f1.my.prep)
      && f1.th.ready !== f1.en.ready && /GENERATE/.test(f1.th.ready) && f1.en.ready === "All required inputs are ready — press GENERATE.", f1);

    report("B–F) no page error while the pickers, the sheet, the Imagine compares and the language switch were exercised", B.errs.length === 0, B.errs);
    await B.page.close();

    /* ---------------- D. the scopes with a renderer that answers null for every class read ---------------- */
    const D = await boot({ pre: [NULL_CLASS_READ] });
    const d1 = await D.page.evaluate(() => {
      const out = {};
      ["imagine", "meitu", "evoto", "retouch", "path", "video", "aitools"].forEach(k => { switchPage(k); });
      ["pageImagine", "pageMeitu", "pageEvoto", "pageRetouch", "pagePath", "pageVideo", "pageAiTools", "stDock"].forEach(id => {
        const e = document.getElementById(id); out[id] = e ? (e.classList.contains("apg") ? "apg" : "-") + (e.classList.contains("stpg") ? "+stpg" : "") + (e.classList.contains("on") ? "+on" : "") : "absent";
      });
      out.classRead = document.getElementById("pageMeitu").getAttribute("class");
      return out;
    });
    report("D1) with getAttribute(\"class\") and className both answering null (the read Photoshop can fail), every page keeps .apg after a round of switches, the four studio pages keep .stpg, and only the active page carries .on",
      d1.classRead === null && d1.pageImagine === "apg" && d1.pageMeitu === "apg+stpg" && d1.pageEvoto === "apg+stpg" && d1.pageRetouch === "apg+stpg" && d1.stDock === "apg+stpg"
      && d1.pagePath === "apg" && d1.pageVideo === "apg" && d1.pageAiTools === "apg+on", d1);
    report("D) no page error under the null class read", D.errs.length === 0, D.errs);
    await D.page.close();
  } finally {
    await browser.close(); server.close();
  }
}

main().then(() => {
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — verify_panel_pickers");
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error("ERROR", e); process.exit(1); });
