/* v6.79.0 / panel 6.150.0 — DIALOGS THAT SIZE IN PHOTOSHOP, AND THE FOUR PICKS.

   The owner's sixteen photographs of 6.149.0 in real Photoshop 27.10:

     1. THE DIALOG STRIP (6th, 14th). 6.78.0 gave every picker and the photo
        sheet a <dialog>; both opened as a strip eighty pixels wide on a light
        frame. UXP sizes a dialog from its CONTENT's explicit dimensions and
        paints the frame itself, so the body now carries an explicit width,
        the background and the colour, the picker list an explicit height,
        and one helper (hnkShowDialog) hands the same size to showModal. (A1, B1)
     2. MODEL · RATIO · COUNT · SIZE IN THE WIZARD (5th, 12th). The app's
        wizard clones its Create selects into its last step; the panel printed
        a sentence. The panel's own .hsl pickers and ratio rail now stand in
        the wizard, fed by HNK.genOpts (Freeform's lists) and written to the
        workflow state the compiler reads AND to Freeform, two-way. The
        compiler carries the variants and the request count. (A2, B2–B4)
     3. RETOUCH A/B "ADD A PHOTO" OPENED A FOLDER DIALOG (15th, 16th). The tap
        went to the reference-library browser, which asks for a library folder
        first. It opens the Layer · File sheet now, through the panel's own
        capture paths. (A3, B5) The "Before" tag on the empty slot is the
        app's own (the string-parity walk reads it) and stays.
     4. HOME TILE LABELS AT THE GRID'S FOOT (2nd) — again, with display:block.
        The caption rides inside the picture box, absolute, like the badge
        that has always been right. (A4, B6)
     5. RETOUCH A STACKED (15th) while Retouch B was right: the jump bar and
        photo slot rules hung off the .stpg ancestor; unscoped twins, and a
        second layout pass after the block is moved. (A5)
     6. Viewport 0×0 (9th): innerWidth is 0, so every width fallback the
        Imagine brush and sliders had was built on nothing — a matchMedia
        binary search and the host's other rulers; a native range under each
        hub card where the picture cannot be measured. (A6, C1)
     7. "Storage · native localStorage" (9th): the real host was not recognised
        by the shim's one signal; two signals now, and a late adopt. (A7, D1)
     8. The header's language label wrapped, the Freeform model picker had
        half a row. (A8) The Workflows hero keeps the app's literal — the
        page-parity walk reads it string for string.

   Fault-injected while writing: `.hnk-dlg-body` without a width fails A1;
   pickPhoto back on refLibBrowseInto fails A3 and B5; the caption outside
   .art fails A4/B6; `variants: 1` in the compiler fails A2/B4; the shim's
   uxp host signal removed fails D1. */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const vm = require("vm");

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

const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const SHIM = fs.readFileSync(path.join(PANEL, "src/app/uxp-local-storage.js"), "utf8");
const HOME = fs.readFileSync(path.join(PANEL, "src/ui/screens/home-screen.js"), "utf8");
const STUDIO = fs.readFileSync(path.join(PANEL, "src/ui/screens/retouch-studio-screen.js"), "utf8");
const WF = fs.readFileSync(path.join(PANEL, "src/ui/screens/workflow-tools-screen.js"), "utf8");
const COMPILER = fs.readFileSync(path.join(PANEL, "src/workflows/workflow-request-compiler.js"), "utf8");
const IMAGINE_PANEL = fs.readFileSync(path.join(PANEL, "js/hnk_imagine.js"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");

function sourcePins() {
  /* A1 — the dialog's content carries the size; one helper opens every dialog with it */
  const a1 = {
    body: /\.hnk-dlg-body \{ display: block; padding: 16px; width: 300px; max-width: 92vw; box-sizing: border-box; background-color: var\(--panel\); color: var\(--text\); \}/.test(CSS),
    pick: /\.hnk-pick \.hnk-dlg-body \{ width: 320px; \}/.test(CSS),
    sheet: /\.ff-sheet \.card \{ margin: 0; border: 0; width: 300px; max-width: 92vw; box-sizing: border-box; background-color: var\(--panel\); color: var\(--text\); \}/.test(CSS),
    helper: /function hnkShowDialog\(dlg, opts\) \{/.test(MAIN) && /size: \{ width: w \+ 20, height: h \}/.test(MAIN) && /dlg\.uxpShowModal === "function"\) return dlg\.uxpShowModal\(o\)/.test(MAIN),
    bodyW: /body\.style\.width = w \+ "px"; body\.style\.boxSizing = "border-box";/.test(MAIN),
    listH: /list\.style\.height = listH \+ "px";/.test(MAIN),
    uses: (MAIN.match(/hnkShowDialog\(/g) || []).length,
    noBare: !/dlg\.showModal\(\); else dlg\.setAttribute/.test(MAIN) && !/bd\.showModal\(\); else bd\.setAttribute/.test(MAIN) && !/const r = dlg\.showModal\(\);/.test(MAIN)
  };
  report("A1) .hnk-dlg-body / .ff-sheet .card carry an explicit width, background and colour; hnkShowDialog sets the body width in px, the picker list an explicit height, passes {size} to showModal, and every dialog in main.js (picker, sheet, confirm, prompt) opens through it",
    a1.body && a1.pick && a1.sheet && a1.helper && a1.bodyW && a1.listH && a1.uses >= 5 && a1.noBare, a1);

  /* A2 — the wizard's four picks, and the compiler that carries them */
  const a2 = {
    opts: /function renderGenOpts\(root, wf\) \{/.test(WF) && /renderGenOpts\(root, wf\);/.test(WF),
    ids: ["wfModel", "wfRatio", "wfCount", "wfSize"].every(id => WF.indexOf('hslPicker("' + id + '"') >= 0),
    rail: /g\.paintRatioRail\("wfRatioRail", "wfRatio"/.test(WF),
    both: /wstate\.setOutput\(state, \{ ratio: ratio \|\| "auto", size: size \? size\.toLowerCase\(\) : "2k", variants: count \}\);/.test(WF) && /go\.set\(\{ model: mp\.sel\.value \|\| null, ratio: ratio, count: count, size: size \}\)/.test(WF),
    route: /state\.resolvedRoute = v \? \{ modelId: v, auto: false \} : \(wf\.route \? Object\.assign\(\{\}, wf\.route\) : null\);/.test(WF),
    bridge: /globalThis\.HNK\.genOpts = \{/.test(MAIN) && /models: function \(\) \{ return FREEFORM_MODELS\.map/.test(MAIN) && /set: function \(o\) \{/.test(MAIN) && /ffPaintModelBtn\(\); ffFillRatio\(\); ffPaintRail\(\); ffPaintAdvanced\(\);/.test(MAIN),
    compiler: /var variants = Math\.max\(1, Math\.min\(4, parseInt\(out\.variants, 10\) \|\| 1\)\);/.test(COMPILER) && /variants: variants/.test(COMPILER) && /requestCount: requestCount/.test(COMPILER) && !/variants: 1\b/.test(COMPILER),
    keys: ["wf_opts", "wf_model_auto"].every(k => (MAIN.match(new RegExp("^    " + k + ': "', "mg")) || []).length === 9)
  };
  report("A2) the wizard draws wfModel · wfRatio (rail) · wfCount · wfSize as .hsl pickers, writes each pick to the workflow state and back to Freeform through HNK.genOpts, resolves the route from the model pick, and the compiler carries variants + requestCount; wf_opts / wf_model_auto in nine languages",
    Object.keys(a2).every(k => a2[k]), a2);

  /* A3 — Retouch's photo goes to the sheet, never the library folder */
  const a3 = {
    pick: /pickPhoto: function \(\) \{ try \{ stPickInto\("subject-reference", "PHOTO"\); \} catch \(e\) \{ \} \},/.test(MAIN),
    ref: /pickRef: function \(\) \{ try \{ stPickInto\("reference-2", "REF"\); \} catch \(e\) \{ \} \},/.test(MAIN),
    sheet: /function stPickInto\(slotId, title\) \{\s*photoSheet\(title, \{\s*onLayer: function \(\) \{ refLayerInto\(slotId\); \},\s*onFile: function \(\) \{ refFileInto\(slotId\); \}/.test(MAIN),
    file: /async function refFileInto\(slotId\) \{[\s\S]{0,400}fsp\.getFileForOpening\(\{ allowMultiple: false, types: REF_LIB_TYPES \}\)/.test(MAIN) && !/async function refFileInto\(slotId\) \{[\s\S]{0,900}getFolder/.test(MAIN),
    layer: /async function refLayerInto\(slotId\) \{[\s\S]{0,300}layerPhotoCapture\(\)[\s\S]{0,200}slot\.assign\(\{ b64: e\.b64, mime: e\.mime, label: e\.name \}\)/.test(MAIN),
    noLib: !/pickPhoto: function \(\) \{ try \{ refLibBrowseInto/.test(MAIN)
  };
  report("A3) the studio bridge's pickPhoto / pickRef open the Layer · File sheet (stPickInto); refFileInto is one file dialog with no library folder; refLayerInto captures the active layer into the slot",
    Object.keys(a3).every(k => a3[k]), a3);

  /* A4 — the Home caption inside the picture box */
  report("A4) home-screen puts .lbl + .sub inside .art as .cap; the CSS pins .cap to the box's bottom edge and the card is a block",
    /var cap = dom\.el\(doc, "div", \{ class: "cap" \}, \[\s*dom\.el\(doc, "div", \{ class: "lbl"/.test(HOME) && /artBox\.appendChild\(cap\);/.test(HOME)
    && /var card = dom\.el\(doc, "button", \{ class: "dash-card", id: "hnkDash_" \+ c\.page \}, \[artBox\]\);/.test(HOME)
    && /#pageAiTools \.dash-card \.cap \{ position: absolute; left: 0; right: 0; bottom: 0;/.test(CSS) && /#pageAiTools \.dash-card \{ display: block; \}/.test(CSS), {});

  /* A5 — the studio dock's unscoped twins + the relayout pass */
  const twins = ["#stJumpBar {", "#stJumpTop {", "#stSuiteTabs {", "#stSuiteTabs .chip {", "#stSearch {", "#stGroupChips {", "#stGroupChips .chip {", "#stSearchTgl {", "#stPicker .ref {", "#stPicker .ref .add {", "#stPicker .ref .tag {", "#stColL, #stColR, #stCols, .st-mount {"];
  const missing = twins.filter(t => CSS.indexOf("\n" + t) < 0);
  report("A5) every jump-bar and photo-slot rule has an unscoped twin (no .stpg ancestor to depend on), and mount() schedules a second layout pass for the moved block",
    missing.length === 0 && /stRelayoutSoon\(cols\)/.test(STUDIO) && /function stRelayoutSoon\(node\) \{/.test(STUDIO) && /p\.removeChild\(node\);/.test(STUDIO), { missing });

  /* A6 — the width probe and the hub range, app + lifted panel module */
  const im = (src) => ({
    probe: /function imViewportW\(\)\{/.test(src) && /window\.matchMedia\("\(min-width: "\+mid\+"px\)"\)\.matches/.test(src) && /var vw=imViewportW\(\); if\(!\(vw>0\)\) return imStageW\(\);/.test(src),
    range: /var rng = el\("input","im-hubrange"\); rng\.type="range";/.test(src) && /var rngSync=function\(\)\{ rng\.style\.display = imRect\(art\) \? "none" : ""; \};/.test(src) && /c\.appendChild\(rng\);/.test(src),
    api: /viewportW:imViewportW, stageWidth:imStageWidth,/.test(src)
  });
  const ia = im(APP), ip = im(IMAGINE_PANEL);
  report("A6) imViewportW (innerWidth → outerWidth → visualViewport → matchMedia binary search) feeds imStageWidth; the hub card carries a range that shows only where the art box cannot be measured; app and panel module alike; main.js hnkWidthProbes + the SELF-TEST row + H.stageWidth",
    Object.keys(ia).every(k => ia[k] && ip[k]) && /function hnkMatchMediaWidth\(\)/.test(MAIN) && /label: "width probes"/.test(MAIN) && /stageWidth: function \(el\) \{/.test(MAIN), { app: ia, panel: ip });

  /* A7 — the shim's two signals and the late adopt */
  report("A7) the shim recognises the host by require(\"photoshop\").app.version OR require(\"uxp\").host.name, exposes adopt() on the native path, seeds a late install from native keys, and main.js adopts when hostIsPhotoshop()",
    /function realHostNow\(\) \{/.test(SHIM) && /\/photoshop\/i\.test\(ux\.host\.name\)/.test(SHIM) && /adopt: function \(\) \{ install\(true\); return G\.HNK\.localStore; \}/.test(SHIM)
    && /function install\(seedFromNative\) \{/.test(SHIM) && /if \(seedFromNative\) \{[\s\S]{0,300}ns\.key\(si\)/.test(SHIM)
    && /safe\("storage-adopt", function \(\) \{/.test(MAIN) && /function hostIsPhotoshop\(\) \{/.test(MAIN) && /ls\.adopt\(\)/.test(MAIN), {});

  /* A8 — the tidy-ups */
  report("A8) .hdr .hsl no longer shrinks (flex 0 0 auto, min-width 108px), #genOpts .hsl takes the row, textarea drops the host frame, #rhConfiguredList chips are denser",
    /\.hdr \.hsl \{ position: relative; flex: 0 0 auto; display: flex; flex-direction: row; max-width: 132px; min-width: 108px; \}/.test(CSS)
    && /\.apg #genOpts \.hsl \{ width: 100%; \}/.test(CSS) && /^textarea \{ -webkit-appearance: none; appearance: none; outline: none; box-shadow: none; border-width: 1px; border-style: solid; \}/m.test(CSS)
    && /#rhConfiguredList \.chip \{ font-size: 11px;/.test(CSS), {});   /* 6.114.0: 10.5 → 11px, the text floor; still denser than the 13px chip */

  report("A9) .github/workflows/test.yml runs verify_panel_uxp_dialogs.js right after verify_panel_pickers.js",
    /node test\/verify_panel_pickers\.js\n[\s\S]{0,400}node test\/verify_panel_uxp_dialogs\.js/.test(CI), {});
}

/* ---- the shim in Node: a host that names itself only through require("uxp").host, and the late adopt ---- */
function shimInNode() {
  function run(o) {
    const G = {}; G.globalThis = G; G.window = G;
    const m = {};
    G.localStorage = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
    if (o.seed) Object.keys(o.seed).forEach(k => { m[k] = o.seed[k]; });
    const folder = { getEntry: () => Promise.reject(new Error("ENOENT")), createFile: () => Promise.resolve({ write: () => Promise.resolve() }) };
    G.require = function (name) {
      if (name === "photoshop") return { app: o.psVersion ? { version: o.psVersion } : {} };
      if (name === "uxp") return { host: o.uxpHost ? { name: o.uxpHost } : null, storage: { localFileSystem: { getDataFolder: () => Promise.resolve(folder) } } };
      throw new Error("no module " + name);
    };
    G.setTimeout = setTimeout; G.clearTimeout = clearTimeout; G.Promise = Promise; G.Error = Error; G.String = String; G.Object = Object; G.JSON = JSON;
    vm.runInNewContext(SHIM, G);
    return { G, store: G.HNK.localStore, native: G.localStorage };
  }
  const browser = run({});
  report("D0) a browser (native round-trips, no host signal) keeps its own storage — backend native, shimmed false",
    browser.store.shimmed === false && browser.store.backend === "native", { shimmed: browser.store.shimmed, backend: browser.store.backend });
  const byUxp = run({ uxpHost: "Photoshop" });
  report("D1) a host that names itself only through require(\"uxp\").host.name installs the shim although native storage round-trips",
    byUxp.store.shimmed === true && byUxp.store.backend === "file" && byUxp.G.localStorage === byUxp.store.storage, { shimmed: byUxp.store.shimmed, backend: byUxp.store.backend });
  const late = run({ seed: { "hnk_recipes": "[1,2]", "hnk_fav": "x" } });
  const before = late.store.shimmed;
  late.store.adopt();
  const after = late.G.HNK.localStore;
  report("D2) adopt() on the native path installs the shim late and carries every key the session already wrote (two seeded keys read back through the new storage)",
    before === false && after.shimmed === true && after.adopted === true && after.keys() === 2 && late.G.localStorage.getItem("hnk_recipes") === "[1,2]" && late.G.localStorage.getItem("hnk_fav") === "x",
    { before, shimmed: after.shimmed, adopted: after.adopted, keys: after.keys() });
}

const NO_GEOM = `(function () {
  Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; };
  Element.prototype.getClientRects = function () { return []; };
  ["clientWidth", "clientHeight", "scrollWidth", "scrollHeight"].forEach(function (k) { Object.defineProperty(Element.prototype, k, { configurable: true, get: function () { return 0; } }); });
  ["offsetWidth", "offsetHeight", "offsetLeft", "offsetTop"].forEach(function (k) { Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: function () { return 0; } }); });
  Object.defineProperty(window, "innerWidth", { configurable: true, get: function () { return 0; } });
  Object.defineProperty(window, "outerWidth", { configurable: true, get: function () { return 0; } });
  try { Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return null; } }); } catch (e) { }
  /* the media-query engine of a 377px-wide panel */
  window.matchMedia = function (q) { var m = /min-width:\\s*(\\d+)px/.exec(q); var n = m ? +m[1] : 0; return { matches: n <= 377 }; };
})();`;

async function main() {
  sourcePins();
  shimInNode();
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
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => { try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name === "Student Name" && d.money); } catch (e) { return false; } }, null, { timeout: 20000 })
      .catch(() => { throw new Error("the panel never reached the signed-in state"); });
    await page.waitForTimeout(500);
    return { page, errs };
  }
  try {
    const B = await boot();
    /* ---------------- B1. the dialog's content has the size ---------------- */
    await B.page.evaluate(() => switchPage("aitools"));
    const b1 = await B.page.evaluate(() => {
      document.getElementById("rhModelBtn").click();
      const d = document.getElementById("hnkPick"); const body = d.querySelector(".hnk-dlg-body"); const list = d.querySelector(".hnk-pick-list");
      const cs = getComputedStyle(body);
      const r = { bodyW: body.style.width, bodyCW: cs.width, bg: cs.backgroundColor, listH: list.style.height, rows: d.querySelectorAll(".hnk-pick-row").length };
      HNK.hslPicker.close();
      photoSheet("IMAGE 1", { onLayer: function () { }, onFile: function () { } });
      const sh = document.getElementById("ffSheet"); const card = sh.querySelector(".card"); const cc = getComputedStyle(card);
      r.cardW = card.style.width; r.cardCW = cc.width; r.cardBg = cc.backgroundColor; r.sheetTag = sh.tagName;
      ffSheetClose();
      /* the confirm, opened and cancelled */
      const p = setupConfirm("?"); const dc = document.querySelector("dialog.hnk-dlg"); r.confirmW = dc && dc.querySelector(".hnk-dlg-body").style.width;
      dc.querySelector(".hnk-dlg-row .btn").click();
      return r;
    });
    report("B1) the Model list's body is 320px wide in inline style and computed, painted --panel, the list 380px tall for 49 rows; the photo sheet's card 300px; the confirm's body 300px",
      b1.bodyW === "320px" && b1.bodyCW === "320px" && /^rgb\(/.test(b1.bg) && b1.bg !== "rgba(0, 0, 0, 0)" && b1.listH === "380px" && b1.rows > 8
      && b1.cardW === "300px" && b1.cardCW === "300px" && b1.cardBg !== "rgba(0, 0, 0, 0)" && b1.sheetTag === "DIALOG" && b1.confirmW === "300px", b1);

    /* ---------------- B2–B4. the wizard's four picks ---------------- */
    await B.page.evaluate(async () => { switchPage("wf"); await new Promise(r => setTimeout(r, 600)); document.getElementById("hnkWf_reference-scenes").click(); });
    await B.page.waitForTimeout(1200);
    const b2 = await B.page.evaluate(() => {
      const id = (x) => document.getElementById(x);
      const rail = id("wfRatioRail");
      return { box: !!id("hnkWfOpts"), model: id("wfModel") && id("wfModel").options.length, modelVal: id("wfModelVal") && id("wfModelVal").textContent,
        ratio: id("wfRatio") && id("wfRatio").options.length, ratioHidden: id("wfRatioHsl") && id("wfRatioHsl").style.display === "none", rail: rail ? rail.querySelectorAll(".rchip").length : -1,
        count: id("wfCount") && id("wfCount").options.length, size: id("wfSize") && id("wfSize").options.length, route: id("hnkWfRouteLine") && id("hnkWfRouteLine").textContent,
        cur: HNK.genOpts.current() };
    });
    report("B2) the Reference Scenes wizard draws the options block: Model (Auto + 49), the ratio rail (9 chips, the parked picker hidden), Count (3), Size (4), and the route line reads Auto · Nano Banana 2 · 2K · auto",
      b2.box && b2.model === 50 && /Auto/.test(b2.modelVal) && b2.ratio === 9 && b2.ratioHidden && b2.rail === 9 && b2.count === 3 && b2.size === 4 && /Nano Banana 2/.test(b2.route) && /2K/.test(b2.route), b2);

    const b3 = await B.page.evaluate(() => {
      const id = (x) => document.getElementById(x);
      id("wfModelBtn").click();
      const rows = Array.from(document.querySelectorAll("#hnkPick .hnk-pick-row"));
      rows.find(r => /Seedream v4\.5/.test(r.textContent)).click();
      const chip = Array.from(id("wfRatioRail").querySelectorAll(".rchip")).find(x => x.textContent.indexOf("3:4") >= 0); chip.click();
      id("wfCountBtn").click();
      Array.from(document.querySelectorAll("#hnkPick .hnk-pick-row")).find(r => r.textContent.indexOf("×2") >= 0).click();
      id("wfSizeBtn").click();
      Array.from(document.querySelectorAll("#hnkPick .hnk-pick-row")).find(r => /^4K/.test(r.textContent)).click();
      const st = HNK.aiToolsApp.controller().workflow;
      return { modelVal: id("wfModelVal").textContent, route: st.resolvedRoute, output: st.output, line: id("hnkWfRouteLine").textContent,
        ff: { model: id("ffModel").value, ratio: state.ffRatio, count: state.ffCount, size: state.ffSize, ffModelVal: id("ffModelVal").textContent, railOn: Array.from(document.querySelectorAll("#ffRatioRail .rchip.on")).map(x => x.textContent) },
        railOn: Array.from(document.querySelectorAll("#wfRatioRail .rchip.on")).map(x => x.textContent) };
    });
    report("B3) picking Seedream v4.5 · 3:4 · ×2 · 4K through the panel's own list and rail writes the workflow state (resolvedRoute seedream-v4-5 auto:false, output ratio 3:4 size 4k variants 2) AND Freeform (ffModel, state.ffRatio/ffCount/ffSize, its button and rail), and the route line says so",
      /Seedream v4\.5/.test(b3.modelVal) && b3.route && b3.route.modelId === "seedream-v4-5" && b3.route.auto === false
      && b3.output.ratio === "3:4" && b3.output.size === "4k" && b3.output.variants === 2
      && b3.ff.model === "seedream-v4-5" && b3.ff.ratio === "3:4" && b3.ff.count === 2 && b3.ff.size === "4K" && /Seedream v4\.5/.test(b3.ff.ffModelVal) && b3.ff.railOn[0] === "3:4"
      && b3.railOn[0] === "3:4" && /Seedream v4\.5/.test(b3.line) && /4K/.test(b3.line) && /3:4/.test(b3.line) && /×2/.test(b3.line), b3);

    const b4 = await B.page.evaluate(() => {
      const st = HNK.aiToolsApp.controller().workflow;
      const req = HNK.workflowRequestCompiler.compile(st);
      const id = (x) => document.getElementById(x);
      /* back to Auto: the workflow's own route again */
      id("wfModelBtn").click();
      document.querySelector("#hnkPick .hnk-pick-row[data-i=\"0\"]").click();
      const st2 = HNK.aiToolsApp.controller().workflow;
      return { model: req.model, auto: req.modelResolvedFromAuto, out: req.output, requestCount: req.requestCount, mode: req.mode,
        backRoute: st2.resolvedRoute, backLine: id("hnkWfRouteLine").textContent };
    });
    report("B4) the compiled request carries the picks — model seedream-v4-5 (not auto), output 4k · 3:4 · variants 2 · requestCount 2 — and choosing Auto again restores the workflow's own route (nano-banana-2, auto)",
      b4.mode === "smart-workflow" && b4.model === "seedream-v4-5" && b4.auto === false && b4.out.size === "4k" && b4.out.ratio === "3:4" && b4.out.variants === 2 && b4.requestCount === 2
      && b4.backRoute && b4.backRoute.modelId === "nano-banana-2" && b4.backRoute.auto === true && /Auto|အော်တို/.test(b4.backLine), b4);

    /* ---------------- B5. Retouch's photo: the sheet, never a folder ---------------- */
    await B.page.evaluate(() => switchPage("meitu"));
    await B.page.waitForTimeout(300);
    const b5 = await B.page.evaluate(() => {
      const fsx = require("uxp").storage.localFileSystem; let folder = 0, file = 0;
      fsx.getFolder = function () { folder++; return Promise.resolve(null); };
      fsx.getFileForOpening = function () { file++; return Promise.resolve(null); };
      document.querySelector("#stPicker .add").click();
      const sh = document.getElementById("ffSheet");
      const r = { sheet: !!sh, tag: sh && sh.tagName, title: sh && sh.querySelector(".subh").textContent, btns: sh ? sh.querySelectorAll(".btn").length : 0 };
      sh.querySelectorAll(".btn")[1].click();
      return new Promise(res => setTimeout(() => { r.folder = folder; r.file = file; r.gone = !document.getElementById("ffSheet"); res(r); }, 150));
    });
    report("B5) Retouch A's \"Add a photo\" opens the Layer · File · Cancel <dialog> titled PHOTO — ဘယ်ကယူမလဲ; File asks for ONE FILE (getFileForOpening ×1, getFolder ×0)",
      b5.sheet && b5.tag === "DIALOG" && /^PHOTO — /.test(b5.title) && b5.btns === 3 && b5.file === 1 && b5.folder === 0 && b5.gone, b5);

    /* ---------------- B6. the Home caption ---------------- */
    await B.page.evaluate(() => switchPage("aitools"));
    const b6 = await B.page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("#dashGrid .dash-card"));
      const c0 = cards[0]; const art = c0.querySelector(".art").getBoundingClientRect(); const cap = c0.querySelector(".cap").getBoundingClientRect();
      return { n: cards.length, inside: cards.every(c => c.querySelector(".art > .cap > .lbl") && c.querySelector(".art > .cap > .sub")), outside: cards.filter(c => c.querySelector(":scope > .lbl")).length,
        labels: cards.map(c => c.querySelector(".lbl").textContent.length > 0).every(Boolean), capAtFoot: Math.abs(art.bottom - cap.bottom) <= 2 && cap.top > art.top, cardDisp: getComputedStyle(c0).display };
    });
    report("B6) all six Home tiles carry their label and sub-line inside the picture box, pinned to its bottom edge; nothing flows under the card",
      b6.n === 6 && b6.inside && b6.outside === 0 && b6.labels && b6.capAtFoot && b6.cardDisp === "block", b6);
    report("B) no page error", B.errs.length === 0, B.errs);
    await B.page.close();

    /* ---------------- C. no geometry, innerWidth 0: the probe answers, the hub range shows ---------------- */
    const C = await boot({ pre: [NO_GEOM] });
    await C.page.evaluate(() => switchPage("imagine"));
    await C.page.waitForTimeout(600);
    const c1 = await C.page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".im-card"));
      const rng = cards[0].querySelector(".im-hubrange");
      rng.value = "30"; rng.dispatchEvent(new Event("input", { bubbles: true }));
      const wp = hnkWidthProbes();
      return { cards: cards.length, rng: !!rng, shown: rng && rng.style.display !== "none", topW: cards[0].querySelector(".im-cmp-top").style.width, befW: cards[0].querySelector("img.im-orig").style.width,
        split: HNK.imagine.hubSplit(), vw: HNK.imagine.viewportW(), stage: HNK.imagine.stageWidth(cards[0].querySelector(".im-hubcmp")), probes: wp };
    });
    report("C1) with rect · client · offset · innerWidth all 0 and only a media-query engine of 377px: imViewportW answers 377, the stage width is 377 less the ancestors' padding, hnkWidthProbes reads mm 377 · best 377, and the hub card shows its range — moving it to 30 moves the line (top 30%, before 333.33%)",
      c1.cards > 10 && c1.rng && c1.shown && c1.topW === "30%" && c1.befW === "333.33%" && c1.split.lighting === 30 && c1.vw === 377 && c1.stage > 200 && c1.stage < 377 && c1.probes.mm === 377 && c1.probes.best === 377 && c1.probes.inner === 0, c1);
    report("C) no page error under no geometry", C.errs.length === 0, C.errs);
    await C.page.close();

    /* ---------------- C2. with geometry the range stays hidden ---------------- */
    const G = await boot();
    await G.page.evaluate(() => switchPage("imagine"));
    await G.page.waitForTimeout(600);
    const c2 = await G.page.evaluate(() => { const r = document.querySelector(".im-card .im-hubrange"); return { rng: !!r, hidden: r && r.style.display === "none", vw: HNK.imagine.viewportW() }; });
    report("C2) in a browser that measures the box the hub range stays hidden and imViewportW is the real innerWidth", c2.rng && c2.hidden && c2.vw === 420, c2);
    await G.page.close();
  } finally {
    await browser.close(); server.close();
  }
}

main().then(() => {
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASS — verify_panel_uxp_dialogs");
  process.exit(failures ? 1 : 0);
}).catch(e => { console.error("ERROR", e); process.exit(1); });
