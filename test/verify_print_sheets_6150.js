/* 6.150.0 / panel 6.221.0 — PRINT SHEETS.
 *
 * A studio prints: one 4×6 of the chosen frame, four wallet-sized on a sheet, the customer's whole set two to a page. Until
 * now Print meant the browser's dialog with the bare photograph, and Photoshop had no print at all. This wave gives both
 * surfaces the print sheet:
 *  · the composer in the Portrait Style module (lifted byte for byte): 4×6 · 5×7 · 8×10 · A4 at 300 dpi, one, two, four or
 *    eight cells, the sheet turned when the photograph's shape disagrees with the cell's, a white border (nothing cropped)
 *    or the cell filled; the JPEG carries its 300 dpi in the JFIF header; the PDF puts each sheet on a page of exactly the
 *    paper's size;
 *  · the dialog: the paper, how many to a sheet, the border, a live preview, then Print (the browser) / Open in Photoshop
 *    (the panel — the document opens at the paper's size) or Save PDF; the choices remembered (hnk_print_v1);
 *  · the doors to it: every hand-off row, Portrait Style's step 03, Imagine's actions, the panel's Create result, and the
 *    Gallery's customer bar — the whole set, N to a sheet.
 *
 * A) the source on both surfaces and the lifts in sync   B) the web app: the composer's arithmetic (sizes, cells, turning,
 * the dpi tag, the border), the PDF, the set over several sheets, the dialog from the hand-off row (chips, preview,
 * remembered choices, PDF, the print frame), Imagine's and Portrait Style's buttons, the customer's Print all   C) the
 * panel: the Create result's button, the dialog, Save PDF, Open in Photoshop, the customer's Print all   D) What's New
 * E) release pins
 * Usage: PORT=8931 node test/verify_print_sheets_6150.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const { FAKE_FS_SRC } = require("./lib/fake-fs.js");
const WN = require("./lib/whats-new.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PANEL_IM = read("panel/js/hnk_imagine.js");
const PANEL_PS = read("panel/js/hnk_pstyle.js");
const PINDEX = read("panel/index.html");
const PCSS = read("panel/styles.css");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.150.0", PVER = "6.221.0";
const WAVE_V = "6.150.0", PREV_V = "6.149.0";   /* on the WAVE_V line so the bump routine leaves both alone */
const COUNT = 292;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PRINT = "ပရင့်ထုတ်", PRINT_ALL = "ဒီ ဖောက်သည် အကုန် ပရင့်", SHEET = "ပရင့် sheet", PDF = "PDF သိမ်း", PS_OPEN = "Photoshop ထဲ ဖွင့် (300 dpi)";

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 900)));
  if (!ok) failures++;
}
const slice = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? "" : s.slice(i, s.indexOf(b, i)); };
const PS_MOD = (s) => slice(s, "/* ---- PSTYLE_MODULE ---- */", "/* ---- /PSTYLE_MODULE ---- */");

/* the browser side: a photograph of a given shape, drawn on a canvas */
const MK_PHOTO = `window.__photo = function(w, h){ var c=document.createElement("canvas"); c.width=w; c.height=h; var x=c.getContext("2d"); x.fillStyle="#c96"; x.fillRect(0,0,w,h); x.fillStyle="#246"; x.fillRect(Math.round(w*0.3), Math.round(h*0.3), Math.round(w*0.4), Math.round(h*0.4)); return c.toDataURL("image/png"); };
window.__px = function(dataUrl, x, y){ return new Promise(function(res){ var im=new Image(); im.onload=function(){ var c=document.createElement("canvas"); c.width=im.naturalWidth; c.height=im.naturalHeight; var cx=c.getContext("2d"); cx.drawImage(im,0,0); var d=cx.getImageData(x,y,1,1).data; res([d[0],d[1],d[2]]); }; im.src=dataUrl; }); };
window.__pdfText = function(u8){ var s=""; for(var i=0;i<u8.length;i++){ var c=u8[i]; s+= (c>=32 && c<127) ? String.fromCharCode(c) : (c===10 ? "\\n" : "."); } return s; };`;

/* ---------------- A) the source ---------------- */
function partA() {
  const P = A.readPstyle(), I = A.readImagine();
  const KEYS = ["print_sheet", "print_size", "print_per", "print_border", "print_pdf", "print_ps", "print_hint", "print_all", "print_pages"];
  report("A1) the words: nine print strings in nine languages in Portrait Style's table (Print itself was there); Imagine's table mirrors Print for its button; the Gallery's Print all on both surfaces",
    KEYS.every((k) => all9(P.ui[k])) && P.ui.print_sheet.my === SHEET && P.ui.print_pdf.my === PDF && P.ui.print_ps.my === PS_OPEN && P.ui.print_all.my === PRINT_ALL && P.ui.print.my === PRINT &&
    all9(I.ui.print) && LANGS.every((l) => I.ui.print[l] === P.ui.print[l]) &&
    has(slice(APP, "var GAL_W={", "function galItemText(it){"), "sessPrint:") && has(slice(APP, "var GAL_W={", "function galItemText(it){"), JSON.stringify(PRINT_ALL)) &&
    has(slice(MAIN, "const GAL_L = {", "let SESSION_P"), "sessPrint:") && has(slice(MAIN, "const GAL_L = {", "let SESSION_P"), JSON.stringify(PRINT_ALL)));
  const mod = PS_MOD(APP), pmod = PS_MOD(PANEL_PS);
  report("A2) the composer in the Portrait Style module — the four papers at 300 dpi, the grid for 1 · 2 · 4 · 8, the sheet turned when the shapes disagree (and a set kept the way its first sheet turned), the border or the filled cell, the JFIF dpi tag, the PDF at the paper's size — exported, and lifted to the panel byte for byte",
    has(mod, 'var PRINT_SIZES=[["4x6",4,6],["5x7",5,7],["8x10",8,10],["a4",8.27,11.69]], PRINT_DPI=300;') && has(mod, "function printGrid(n){ return n>=8 ? [2,4] : n>=4 ? [2,2] : n>=2 ? [1,2] : [1,1]; }") &&
    has(mod, "function printDpiTag(u8, dpi){") && has(mod, "u8[13]=1; u8[14]=(dpi>>8)&255; u8[15]=dpi&255; u8[16]=(dpi>>8)&255; u8[17]=dpi&255; return u8;") &&
    has(mod, "function printSheet(items, opts){") && has(mod, 'var turned=(typeof opts.turned==="boolean") ? opts.turned : (photoLandscape!==cellLandscape);') &&
    has(mod, "if(turned){ var t1=sw; sw=sh; sh=t1; var t2=across; across=along; along=t2; }") && has(mod, "var pad=border ? Math.round(Math.min(cw,ch)*0.04) : 0, k=0;") &&
    has(mod, "function printSheets(items, opts){") && has(mod, "if(out.length) o.turned=out[0].turned;") && has(mod, "function printPdf(sheets, title){") && has(mod, '/MediaBox [0 0 "+nP(pw)+" "+nP(ph)+"]') && has(mod, "/Filter /DCTDecode /Length ") &&
    has(mod, "printSheet:printSheet, printSheets:printSheets, printPdf:printPdf, printSizes:PRINT_SIZES };") &&
    ["function printSheet(items, opts){", "function printSheets(items, opts){", "function printPdf(sheets, title){", "function printDpiTag(u8, dpi){", "printSheet:printSheet, printSheets:printSheets, printPdf:printPdf, printSizes:PRINT_SIZES };"].every((t) => has(pmod, t)) &&
    slice(mod, "var PRINT_SIZES=", "  /* the PDF:") === slice(pmod, "var PRINT_SIZES=", "  /* the PDF:"));
  report("A3) the web app: the dialog (paper · per sheet · border · preview · Print · Save PDF · Cancel, the choices in hnk_print_v1, every plate through the stamp), the print frame with the page at the paper's size, HNK_PRINT; the doors — the hand-off row's chip, Portrait Style's printOut, Imagine's button (lifted) through its host, the Gallery's Print all through the real plates",
    has(APP, 'var PRINT_KEY="hnk_print_v1", PRINT_PREF={ size:"4x6", copies:1, border:false };') && has(APP, "function printSheetUI(items, base){") && has(APP, 'sh.id="printSheet";') &&
    has(APP, 'chips("pr-sizes", PSTYLE.printSizes.map(') && has(APP, 'chips("pr-copies", [[1,"1"],[2,"2"],[4,"4"],[8,"8"]], pref.copies,') && has(APP, 'bd.id="prBorder";') && has(APP, 'pim.id="prPreview";') && has(APP, 'pinfo.id="prInfo";') &&
    has(APP, 'go.id="prGo";') && has(APP, 'pdf.id="prPdf";') && has(APP, 'cancel.id="prCancel";') && has(APP, "function printStampAll(items){") && has(APP, "return printStampAll(items).then(function(st){ return PSTYLE.printSheets(st, { size:pref.size, copies:pref.copies, border:pref.border }); });") &&
    has(APP, "function printPages(sheets){") && has(APP, "@page{size:'+s0.wIn+'in '+s0.hIn+'in;margin:0}") && has(APP, 'f.id="printFrame";') && has(APP, "function saveBytes(bytes, name, mime){") &&
    has(APP, 'function printOut(out){ printSheetUI([{ dataUrl: out.dataUrl || ("data:"+out.mime+";base64,"+out.b64) }], "hnk-portrait-style"); }') && has(APP, "window.HNK_PRINT={ open:printSheetUI, pages:printPages, save:saveBytes };") &&
    has(APP, 'if(window.HNK_PSTYLE) chip("i-doc", L9(window.HNK_PSTYLE.ui.print), function(){ if(window.HNK_PRINT) HNK_PRINT.open([{ dataUrl:dataUrl }],') &&
    has(APP, 'prb.id="imPrint"; prb.onclick=function(){ H.printOut(cur.out); };') && has(PANEL_IM, 'prb.id="imPrint"; prb.onclick=function(){ H.printOut(cur.out); };') &&
    has(APP, 'printOut: function(out){ if(window.HNK_PRINT) HNK_PRINT.open([{ dataUrl: out.dataUrl || ("data:"+(out.mime||"image/png")+";base64,"+out.b64) }], "hnk-imagine"); },') &&
    has(APP, 'prb.id="galPrintSess";') && has(APP, "async function galPrintItems(items){") && has(APP, 'if(window.HNK_PRINT) HNK_PRINT.open(list, "hnk-customer-"+SESSION.n);'));
  report("A4) the panel: the same dialog (a <dialog> through hnkShowDialog, the same chips and words, the same composer), Open in Photoshop writing each sheet's 300 dpi JPEG and opening it, Save PDF to a chosen file; the doors — the Create result's button (labelled, off without a result), both hosts' printOut, the Gallery's Print all through the store; the CSS on both surfaces with no gap in the panel's",
    has(MAIN, "function printSheetP(items, base) {") && has(MAIN, 'let PRINT_PREF_P = (function () { try { const p = JSON.parse(localStorage.getItem("hnk_print_v1") || "null");') &&
    has(MAIN, 'dlg.className = "hnk-dlg pr-dlg"; dlg.id = "printSheet";') && has(MAIN, 'body.appendChild(chips("pr-copies", [[1, "1"], [2, "2"], [4, "4"], [8, "8"]], pref.copies,') && has(MAIN, 'bd.id = "prBorder";') &&
    has(MAIN, 'setIcnText(go, "i-doc", "ink", ff9(U.print_ps));') && has(MAIN, 'setIcnText(pdf, "i-download", "cream", ff9(U.print_pdf));') &&
    has(MAIN, 'const file = await folder.createFile("hnk_print_" + (i + 1) + ".jpg", { overwrite: true });') && has(MAIN, 'await psCore.executeAsModal(async function () { await app.open(file); }, { commandName: "HNK Open Print Sheet" });') &&
    has(MAIN, 'const f = await fsp.getFileForSaving((base || "hnk-print") + "-" + pref.size + ".pdf", { types: ["pdf"] });') && has(MAIN, 'hnkShowDialog(dlg, { title: ff9(U.print_sheet), width: 340, height: 540 });') &&
    has(PINDEX, '<div role="button" tabindex="0" class="btn" id="btnPrint"></div>') && has(MAIN, 'setIcnText($("btnPrint"), "i-doc", "cream", ff9(PSTYLE_DATA.ui.print));') && has(MAIN, 'btnOff($("btnPrint"), !hasA);') &&
    has(MAIN, 'const bpr = $("btnPrint");') && (MAIN.match(/printOut: function \(out\) \{ printSheetP\(\[\{ dataUrl: out\.dataUrl \|\| \("data:" \+ \(out\.mime \|\| "image\/png"\) \+ ";base64," \+ out\.b64\) \}\], "hnk-(portrait-style|imagine)"\); \}/g) || []).length === 2 &&
    has(MAIN, 'prb.id = "galPrintSess";') && has(MAIN, 'printSheetP(list, "hnk-customer-" + SESSION_P.n);') &&
    has(APP, ".pr-sheet .ps-galbox{max-width:520px}") && has(APP, ".pr-preview img{") && has(PCSS, ".pr-body{padding:10px}") && has(PCSS, ".pr-preview img{") && !/\.pr-[a-z-]*\{[^}]*gap:/.test(PCSS));
}

/* ---------------- B) the web app ---------------- */
async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.addInitScript(MK_PHOTO);
  await page.addInitScript(() => {
    /* the downloads and the print frame, caught */
    window.__dl = []; const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push(this.download); return; } return realClick.apply(this, arguments); };
    window.__printed = 0; window.__frames = [];
    const realAppend = Node.prototype.appendChild; Node.prototype.appendChild = function (n) { const r = realAppend.call(this, n); try { if (n && n.tagName === "IFRAME" && n.id === "printFrame") { window.__frames.push(n); n.contentWindow.print = function () { window.__printed++; }; } } catch (e) {} return r; };
  });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; });

  /* B1 — the composer's arithmetic */
  const b1 = await page.evaluate(async () => {
    const P = window.__photo(300, 450), Lp = window.__photo(450, 300), out = {};
    const one = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 1 });
    out.one = { w: one.w, h: one.h, wIn: one.wIn, hIn: one.hIn, turned: one.turned, cells: one.cells, mime: one.mime, dpiTag: [one.jpeg[13], one.jpeg[14] * 256 + one.jpeg[15], one.jpeg[16] * 256 + one.jpeg[17]], soi: one.jpeg[0] === 0xFF && one.jpeg[1] === 0xD8, b64Same: one.dataUrl.indexOf("data:image/jpeg;base64,") === 0 };
    const four = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 4 }); out.four = { w: four.w, h: four.h, turned: four.turned, cells: four.cells };
    const two = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 2 }); out.two = { w: two.w, h: two.h, turned: two.turned, cells: two.cells };
    const land = await PSTYLE.printSheet([{ dataUrl: Lp }], { size: "5x7", copies: 1 }); out.land = { w: land.w, h: land.h, wIn: land.wIn, hIn: land.hIn, turned: land.turned };
    const eight = await PSTYLE.printSheet([{ dataUrl: P }], { size: "a4", copies: 8 }); out.eight = { w: eight.w, h: eight.h, cells: eight.cells, turned: eight.turned };
    const filled = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 1, border: false, dpi: 60 }); out.fillPx = await window.__px(filled.dataUrl, 2, 2);
    const bordered = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 1, border: true, dpi: 60 }); out.borderPx = await window.__px(bordered.dataUrl, 2, 2); out.borderMid = await window.__px(bordered.dataUrl, 120, 180);
    return out;
  });
  report("B1) the composer: a portrait photograph on 4×6 is 1200×1800 at 300 dpi, one cell, untouched; four to a sheet is 2×2 on the same portrait sheet; two to a sheet turns the sheet (1800×1200) so each cell stays portrait; a landscape photograph turns a 5×7 (2100×1500); eight portrait frames on A4 turn the sheet too (3507×2481, four across); the JFIF tag reads 300 dpi in inches; the filled cell reaches the corner, the bordered one leaves it white with the photograph inside",
    b1.one.w === 1200 && b1.one.h === 1800 && b1.one.wIn === 4 && b1.one.hIn === 6 && !b1.one.turned && b1.one.cells === 1 && b1.one.mime === "image/jpeg" && b1.one.soi && b1.one.b64Same && b1.one.dpiTag.join() === "1,300,300" &&
    b1.four.w === 1200 && b1.four.h === 1800 && !b1.four.turned && b1.four.cells === 4 &&
    b1.two.w === 1800 && b1.two.h === 1200 && b1.two.turned && b1.two.cells === 2 &&
    b1.land.w === 2100 && b1.land.h === 1500 && b1.land.wIn === 7 && b1.land.hIn === 5 && b1.land.turned &&
    b1.eight.cells === 8 && b1.eight.turned && b1.eight.w === 3507 && b1.eight.h === 2481 &&
    b1.fillPx[0] > 150 && b1.fillPx[2] < 140 && b1.borderPx.every((v) => v > 240) && b1.borderMid[2] > b1.borderMid[0], b1);

  /* B2 — the PDF and the set */
  const b2 = await page.evaluate(async () => {
    const P = window.__photo(300, 450), out = {};
    const one = await PSTYLE.printSheet([{ dataUrl: P }], { size: "4x6", copies: 1, dpi: 60 });
    const pdf = PSTYLE.printPdf([one], "HNK test"); const txt = window.__pdfText(pdf);
    out.pdf = { head: txt.slice(0, 8), count: txt.indexOf("/Count 1") > 0, box: txt.indexOf("/MediaBox [0 0 288 432]") > 0, dct: txt.indexOf("/DCTDecode") > 0, eof: txt.trim().endsWith("%%EOF"), len: pdf.length, jpegIn: pdf.length > one.jpeg.length };
    const items = [1, 2, 3, 4, 5].map(() => ({ dataUrl: P }));
    const sheets = await PSTYLE.printSheets(items, { size: "4x6", copies: 2, dpi: 60 });
    out.set = { n: sheets.length, turned: sheets.map((s) => s.turned), cells: sheets.map((s) => s.cells), w: sheets.map((s) => s.w) };
    const pdf2 = PSTYLE.printPdf(sheets, "set"); const t2 = window.__pdfText(pdf2); out.set.count3 = t2.indexOf("/Count 3") > 0; out.set.box = t2.indexOf("/MediaBox [0 0 432 288]") > 0;
    return out;
  });
  report("B2) the PDF: PDF-1.4, one page of exactly 288×432 points for a portrait 4×6, the JPEG inside as DCTDecode, %%EOF; a set of five two to a sheet is three sheets, all turned the way the first was (432×288 pages), the last with its single photograph",
    b2.pdf.head === "%PDF-1.4" && b2.pdf.count && b2.pdf.box && b2.pdf.dct && b2.pdf.eof && b2.pdf.jpegIn &&
    b2.set.n === 3 && b2.set.turned.every((t) => t === true) && b2.set.cells.join() === "2,2,2" && b2.set.w.every((w) => w === 360) && b2.set.count3 && b2.set.box, b2);

  /* B3 — the dialog from the hand-off row */
  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s)), tx = (n) => ((n && n.textContent) || "").trim();
    const P = window.__photo(300, 450), m = /^data:([^;]+);base64,(.*)$/.exec(P);
    switchPage("pgMeitu"); await new Promise((r) => setTimeout(r, 500));
    stHandoffRow("handoffStudio", m[1], m[2], "portrait.png");
    const chip = qa("#handoffStudio .chip").find((c) => tx(c) === "ပရင့်ထုတ်"); const out = { chip: !!chip };
    if (!chip) return out;
    chip.click(); await new Promise((r) => setTimeout(r, 700));
    const d = q("#printSheet"); out.open = !!d; if (!d) return out;
    out.title = tx(q("#printSheet .ps-h3")); out.sizes = qa("#printSheet .pr-sizes .chip").map(tx); out.copies = qa("#printSheet .pr-copies .chip").map(tx); out.border = tx(q("#prBorder"));
    out.on = [qa("#printSheet .pr-sizes .chip.on").map((c) => c.getAttribute("data-v")).join(), qa("#printSheet .pr-copies .chip.on").map((c) => c.getAttribute("data-v")).join()];
    out.preview = (q("#prPreview").getAttribute("src") || "").indexOf("data:image/jpeg") === 0; out.info = tx(q("#prInfo")); out.btns = [tx(q("#prGo")), tx(q("#prPdf")), tx(q("#prCancel"))];
    qa("#printSheet .pr-sizes .chip").find((c) => c.getAttribute("data-v") === "5x7").click(); await new Promise((r) => setTimeout(r, 400));
    qa("#printSheet .pr-copies .chip").find((c) => c.getAttribute("data-v") === "4").click(); await new Promise((r) => setTimeout(r, 400));
    q("#prBorder").click(); await new Promise((r) => setTimeout(r, 400));
    out.pref = JSON.parse(localStorage.getItem("hnk_print_v1") || "null"); out.info2 = tx(q("#prInfo")); out.borderOn = q("#prBorder").classList.contains("on");
    q("#prPdf").click(); let t0 = Date.now(); while (Date.now() - t0 < 8000 && !window.__dl.length) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200)); out.dl = window.__dl.slice(); out.closed = !q("#printSheet");
    /* again, for the print frame */
    chip.click(); await new Promise((r) => setTimeout(r, 700)); out.reopen = { on: [qa("#printSheet .pr-sizes .chip.on").map((c) => c.getAttribute("data-v")).join(), qa("#printSheet .pr-copies .chip.on").map((c) => c.getAttribute("data-v")).join()], border: q("#prBorder").classList.contains("on") };
    q("#prGo").click(); t0 = Date.now(); while (Date.now() - t0 < 8000 && !(window.__frames.length && window.__printed > 0)) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 200));
    const f = window.__frames[0]; out.frame = { n: window.__frames.length, printed: window.__printed, imgs: f ? f.contentWindow.document.querySelectorAll("img").length : 0, css: f ? f.contentWindow.document.querySelector("style").textContent : "", closed: !q("#printSheet") };
    return out;
  });
  report("B3) the hand-off row's Print opens the sheet: four papers, 1 · 2 · 4 · 8, the border, a preview and the line (one sheet, 4×6, 300 dpi), Print · Save PDF · Cancel; 5×7 · four · border chosen are remembered (hnk_print_v1) and the line still says one sheet; Save PDF hands the browser portrait-5x7-….pdf and closes; reopened on the remembered choices, Print writes one page at 5in 7in into the frame and calls print()",
    b3.chip && b3.open && b3.title === SHEET && b3.sizes.join("|") === "4×6″|5×7″|8×10″|A4" && b3.copies.join() === "1,2,4,8" && b3.border === "အနားကွက် ဖြူ — ပုံ မဖြတ်" && b3.on.join("|") === "4x6|1" && b3.preview &&
    b3.info.indexOf("sheet 1 ခု") === 0 && b3.info.indexOf("4×6″") > 0 && b3.info.indexOf("300 dpi") > 0 && b3.btns[0] === PRINT && b3.btns[1] === PDF && b3.btns[2] === "မလုပ်တော့ဘူး" &&
    b3.pref && b3.pref.size === "5x7" && b3.pref.copies === 4 && b3.pref.border === true && b3.info2.indexOf("sheet 1 ခု") === 0 && b3.info2.indexOf("5×7″") > 0 && b3.borderOn &&
    b3.dl.length === 1 && /^portrait-5x7-\d{8}\.pdf$/.test(b3.dl[0]) && b3.closed &&
    b3.reopen.on.join("|") === "5x7|4" && b3.reopen.border && b3.frame.n === 1 && b3.frame.printed === 1 && b3.frame.imgs === 1 && has(b3.frame.css, "@page{size:5in 7in;margin:0}") && b3.frame.closed, b3);

  /* B4 — Imagine's and Portrait Style's buttons */
  const b4 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), tx = (n) => ((n && n.textContent) || "").trim();
    const P = window.__photo(300, 450), m = /^data:([^;]+);base64,(.*)$/.exec(P), out = {};
    switchPage("pgImagine"); await new Promise((r) => setTimeout(r, 400)); IMAGINE.openTool("lighting"); await new Promise((r) => setTimeout(r, 300));
    IMAGINE.state.photos = [{ dataUrl: P, name: "p.png", out: { dataUrl: P, mime: m[1], b64: m[2] }, status: "done" }]; IMAGINE.state.cur = 0; IMAGINE.render(); await new Promise((r) => setTimeout(r, 300));
    out.im = tx(q("#imPrint")); if (q("#imPrint")) { q("#imPrint").click(); await new Promise((r) => setTimeout(r, 500)); out.imOpen = !!q("#printSheet"); q("#prCancel").click(); }
    switchPage("pgPStyle"); await new Promise((r) => setTimeout(r, 400));
    PSTYLE.state.photo = { dataUrl: P, name: "p.png" }; PSTYLE.state.versions = [{ dataUrl: P, mime: m[1], b64: m[2], model: "x", size: "1k", ts: Date.now(), w: 300, h: 450 }]; PSTYLE.state.cur = 0; PSTYLE.state.step = 3; PSTYLE.render(); await new Promise((r) => setTimeout(r, 300));
    out.ps = tx(q("#psPrint")); if (q("#psPrint")) { q("#psPrint").click(); await new Promise((r) => setTimeout(r, 500)); out.psOpen = !!q("#printSheet"); out.psTitle = tx(q("#printSheet .ps-h3")); q("#prCancel").click(); }
    return out;
  });
  report("B4) Imagine's result carries Print beside Show the customer and Portrait Style's step 03 keeps its Print — both open the same sheet",
    b4.im === PRINT && b4.imOpen && b4.ps === PRINT && b4.psOpen && b4.psTitle === SHEET, b4);

  /* B5 — the customer's whole set from the Gallery bar */
  const b5 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s)), tx = (n) => ((n && n.textContent) || "").trim();
    const P = window.__photo(300, 450), m = /^data:([^;]+);base64,(.*)$/.exec(P);
    for (let i = 0; i < 3; i++) await galleryAdd({ mime: m[1], b64: m[2] }, "print test " + i, { page: "pgMeitu" });
    switchPage("pgGallery"); await new Promise((r) => setTimeout(r, 900));
    const out = { btn: tx(q("#galPrintSess")) };
    window.__dl = []; q("#galPrintSess").click(); let t0 = Date.now(); while (Date.now() - t0 < 6000 && !q("#printSheet")) await new Promise((r) => setTimeout(r, 60));
    await new Promise((r) => setTimeout(r, 600));
    out.title = tx(q("#printSheet .ps-h3")); qa("#printSheet .pr-sizes .chip").find((c) => c.getAttribute("data-v") === "4x6").click(); qa("#printSheet .pr-copies .chip").find((c) => c.getAttribute("data-v") === "2").click(); await new Promise((r) => setTimeout(r, 500));
    out.info = tx(q("#prInfo"));
    q("#prPdf").click(); t0 = Date.now(); while (Date.now() - t0 < 10000 && !window.__dl.length) await new Promise((r) => setTimeout(r, 60));
    out.dl = window.__dl.slice(); out.n = HNK_SESSION.get().n;
    return out;
  });
  report("B5) the Gallery's customer bar: Print this customer's photos opens the sheet for all three, two to a sheet is two sheets, and Save PDF names the customer (hnk-customer-1-4x6-….pdf)",
    b5.btn === PRINT_ALL && b5.title === SHEET + " · 3" && b5.info.indexOf("sheet 2 ခု") === 0 && b5.dl.length === 1 && new RegExp("^hnk-customer-" + b5.n + "-4x6-\\d{8}\\.pdf$").test(b5.dl[0]), b5);
  report("B6) no page error on the way", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) the panel ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
async function partC(browser) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const pp = await browser.newPage({ viewport: { width: 420, height: 760 } });
    const errs = []; pp.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pp.route("**/*", (r) => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
      if (r.request().resourceType() === "image") return r.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await pp.addInitScript(UXP_STUB);
    await pp.addInitScript("window.__fx = " + FAKE_FS_SRC + "; window.HNK = window.HNK || {}; window.HNK.__uxpForTests = window.__fx.uxp;");
    await pp.addInitScript(MK_PHOTO);
    await pp.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await pp.waitForTimeout(2500);
    const c1 = await pp.evaluate(async () => {
      const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s)), tx = (n) => ((n && n.textContent) || "").trim();
      const P = window.__photo(300, 450), m = /^data:([^;]+);base64,(.*)$/.exec(P), out = {};
      /* Photoshop and the file system, caught */
      window.__psOpen = []; window.__written = []; window.__saved = [];
      const ps = require("photoshop"); ps.app.open = async function (f) { window.__psOpen.push(f && f.name); }; ps.core.executeAsModal = async function (fn) { return fn(); };
      const lfs = require("uxp").storage.localFileSystem;
      lfs.getDataFolder = async function () { return { createFile: async function (n) { return { name: n, write: async function (buf) { window.__written.push([n, buf.byteLength || (buf && buf.length) || 0]); } }; } }; };
      lfs.getFileForSaving = async function (n) { return { name: n, write: async function (buf) { window.__saved.push([n, buf.byteLength || (buf && buf.length) || 0]); } }; };
      switchPage("aitools"); await new Promise((r) => setTimeout(r, 500));
      out.label = tx(q("#btnPrint")); out.offBefore = q("#btnPrint").classList.contains("is-off");
      state.resultB64 = m[2]; state.resultMime = m[1]; refreshCompare(); await new Promise((r) => setTimeout(r, 200));
      out.offAfter = q("#btnPrint").classList.contains("is-off");
      q("#btnPrint").click(); await new Promise((r) => setTimeout(r, 800));
      const d = q("dialog#printSheet"); out.open = !!d && (d.open || d.hasAttribute("open")); if (!d) return out;
      out.title = tx(q("#printSheet .ps-h3")); out.sizes = qa("#printSheet .pr-sizes .chip").map(tx); out.copies = qa("#printSheet .pr-copies .chip").map(tx); out.border = tx(q("#prBorder"));
      out.preview = (q("#prPreview").getAttribute("src") || "").indexOf("data:image/jpeg") === 0; out.info = tx(q("#prInfo")); out.btns = [tx(q("#prGo")), tx(q("#prPdf")), tx(q("#prCancel"))];
      qa("#printSheet .pr-copies .chip").find((c) => c.getAttribute("data-v") === "4").click(); await new Promise((r) => setTimeout(r, 400)); out.pref = JSON.parse(localStorage.getItem("hnk_print_v1") || "null");
      q("#prPdf").click(); let t0 = Date.now(); while (Date.now() - t0 < 8000 && !window.__saved.length) await new Promise((r) => setTimeout(r, 60)); await new Promise((r) => setTimeout(r, 200));
      out.saved = window.__saved.slice(); out.closed = !q("#printSheet"); out.status = tx(q("#status"));
      q("#btnPrint").click(); await new Promise((r) => setTimeout(r, 800));
      q("#prGo").click(); t0 = Date.now(); while (Date.now() - t0 < 8000 && !window.__psOpen.length) await new Promise((r) => setTimeout(r, 60)); await new Promise((r) => setTimeout(r, 200));
      out.opened = window.__psOpen.slice(); out.written = window.__written.slice(); out.closed2 = !q("#printSheet"); out.status2 = tx(q("#status"));
      return out;
    });
    report("C1) the panel's Create result: Print (off until a result, on with one) opens the same sheet as a <dialog> — the four papers, 1 · 2 · 4 · 8, the border, the preview and the line, Open in Photoshop · Save PDF · Cancel; four to a sheet is remembered; Save PDF writes hnk-print-4x6.pdf and says one sheet; Open in Photoshop writes hnk_print_1.jpg and opens it",
      c1.label === PRINT && c1.offBefore && !c1.offAfter && c1.open && c1.title === SHEET && c1.sizes.join("|") === "4×6″|5×7″|8×10″|A4" && c1.copies.join() === "1,2,4,8" && c1.border === "အနားကွက် ဖြူ — ပုံ မဖြတ်" &&
      c1.preview && c1.info.indexOf("sheet 1 ခု") === 0 && c1.info.indexOf("300 dpi") > 0 && c1.btns[0] === PS_OPEN && c1.btns[1] === PDF && c1.btns[2] === "မလုပ်တော့ဘူး" &&
      c1.pref && c1.pref.copies === 4 && c1.saved.length === 1 && c1.saved[0][0] === "hnk-print-4x6.pdf" && c1.saved[0][1] > 2000 && c1.closed && has(c1.status, "sheet 1 ခု") &&
      c1.opened.length === 1 && c1.opened[0] === "hnk_print_1.jpg" && c1.written.length === 1 && c1.written[0][1] > 2000 && c1.closed2 && has(c1.status2, "Photoshop"), c1);

    const c2 = await pp.evaluate(async () => {
      const q = (s) => document.querySelector(s), qa = (s) => Array.from(document.querySelectorAll(s)), tx = (n) => ((n && n.textContent) || "").trim();
      const P = window.__photo(300, 450), m = /^data:([^;]+);base64,(.*)$/.exec(P), out = {};
      const gs = globalThis.HNK.galleryStore; await gs.save(m[2], "png", "pstyle"); await gs.save(m[2], "png", "imagine"); await gs.save(m[2], "png", "path");
      switchPage("gallery"); await new Promise((r) => setTimeout(r, 900));
      out.btn = tx(q("#galPrintSess")); window.__psOpen = []; window.__written = [];
      q("#galPrintSess").click(); let t0 = Date.now(); while (Date.now() - t0 < 6000 && !q("#printSheet")) await new Promise((r) => setTimeout(r, 60)); await new Promise((r) => setTimeout(r, 600));
      out.title = tx(q("#printSheet .ps-h3")); qa("#printSheet .pr-copies .chip").find((c) => c.getAttribute("data-v") === "2").click(); await new Promise((r) => setTimeout(r, 500)); out.info = tx(q("#prInfo"));
      q("#prGo").click(); t0 = Date.now(); while (Date.now() - t0 < 10000 && window.__psOpen.length < 2) await new Promise((r) => setTimeout(r, 60)); await new Promise((r) => setTimeout(r, 200));
      out.opened = window.__psOpen.slice(); out.closed = !q("#printSheet");
      switchPage("imagine"); await new Promise((r) => setTimeout(r, 400)); globalThis.HNK.imagine.openTool("lighting"); await new Promise((r) => setTimeout(r, 300));
      globalThis.HNK.imagine.state.photos = [{ dataUrl: P, name: "p.png", out: { dataUrl: P, mime: m[1], b64: m[2] }, status: "done" }]; globalThis.HNK.imagine.state.cur = 0; globalThis.HNK.imagine.render(); await new Promise((r) => setTimeout(r, 300));
      out.im = tx(q("#imPrint")); if (q("#imPrint")) { q("#imPrint").click(); await new Promise((r) => setTimeout(r, 600)); out.imOpen = !!q("#printSheet"); q("#prCancel").click(); await new Promise((r) => setTimeout(r, 200)); }
      switchPage("pstyle"); await new Promise((r) => setTimeout(r, 400));
      const PS = globalThis.HNK.pstyle; PS.state.photo = { dataUrl: P, name: "p.png" }; PS.state.versions = [{ dataUrl: P, mime: m[1], b64: m[2], model: "x", size: "1k", ts: Date.now(), w: 300, h: 450 }]; PS.state.cur = 0; PS.state.step = 3; PS.render(); await new Promise((r) => setTimeout(r, 300));
      out.ps = tx(q("#psPrint")); if (q("#psPrint")) { q("#psPrint").click(); await new Promise((r) => setTimeout(r, 600)); out.psOpen = !!q("#printSheet"); q("#prCancel").click(); }
      return out;
    });
    report("C2) the panel's Gallery bar: Print this customer's photos opens the sheet for the customer's three files, two to a sheet is two sheets, Open in Photoshop opens two documents; Imagine's and Portrait Style's results carry Print too",
      c2.btn === PRINT_ALL && c2.title === SHEET + " · 3" && c2.info.indexOf("sheet 2 ခု") === 0 && c2.opened.join() === "hnk_print_1.jpg,hnk_print_2.jpg" && c2.closed && c2.im === PRINT && c2.imOpen && c2.ps === PRINT && c2.psOpen, c2);
    report("C3) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgGallery");
  report("D1) What's New carries the " + WAVE_V + " row in nine languages, the panel says the same, and the " + PREV_V + " row is still there",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && WN.appRow(WAVE_V, "pgGallery") === WN.panelRow(WAVE_V, "pgGallery") && WN.appRow(WAVE_V, "pgGallery").length > 200 && !!WN.find(WN.appRows(), PREV_V, "pgGallery"),
    { row: !!row, same: !!row && WN.appRow(WAVE_V, "pgGallery") === WN.panelRow(WAVE_V, "pgGallery"), len: row ? WN.appRow(WAVE_V, "pgGallery").length : 0 });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the customer check it follows",
    steps === COUNT && has(CI, "node test/verify_print_sheets_6150.js") && CI.indexOf("verify_print_sheets_6150.js") > CI.indexOf("verify_session_6149.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests", has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

(async function main() {
  partA();
  partD();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    withPremium(browser);
    await partB(browser);
    await partC(browser);
  } finally { await browser.close(); }
  partE();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
