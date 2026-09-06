/* v6.23.1 — NATIVE PICK: every pick control carries its own transparent <input type=file> on top, so a
   tap opens the chooser natively on Android shells that ignore a programmatic click() on the hidden
   shared input (Redmi Note 15 Pro+ / HyperOS, installed PWA). The chosen file reaches the SAME handler
   and the SAME slot. accept is image/* everywhere a photo is picked.
   Usage: PORT=8931 node test/verify_native_pick.js  (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
const { withPremium } = require("./_seed_premium.js");
const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 460)));
  if (!ok) failures++;
}
/* ---- A) source pins ---- */
report("A) nativePick exists, hands the files to the hidden input's own handler with the slot set first, and is wired to every pick control",
  /^function nativePick\(btn, mirrorId, before\)\{/m.test(APP) && /mirror\.onchange\.call\(fake\)/.test(APP) && /if\(before\)\{ try\{ before\(\); \}catch\(e0\)\{\} \}/.test(APP) &&
  (APP.match(/nativePick\(/g) || []).length >= 17 && /vwizSlot\(kind, filled, thumbSrc, name, req, onPick, onClear, mirrorId, before\)/.test(APP), { calls: (APP.match(/nativePick\(/g) || []).length });
report("A2) the photo inputs accept image/* (no MIME list an OEM picker can refuse); the sniff in acceptImageFile is unchanged",
  (APP.match(/<input type="file" id="(filePick|ptFilePick|ptRefPick|filePickBoard)" accept="image\/\*"/g) || []).length === 4 && !/accept="image\/png,image\/jpeg/.test(APP) &&
  /var looksImage = \(f\.type && f\.type\.toLowerCase\(\)\.indexOf\("image\/"\)===0\) \|\| \/\\\.\(png\|jpe\?g\|webp\|gif\|bmp\|heic\|heif\)\$\/i\.test\(f\.name\|\|""\);/.test(APP), null);
report("A3) the overlay is a real, full-size, transparent input above its control; the wrapper is inline unless the button was stretched, follows the button's hidden state, and the remove ✕ stays above it",
  /\.npick\{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;opacity:0;cursor:pointer;font-size:0;z-index:2/.test(APP) &&
  /\.npick-wrap\{position:relative;display:inline-flex;max-width:100%;min-width:0\}/.test(APP) && /\.npick-wrap\.block,\.ref \.npick-wrap\{width:100%\}/.test(APP) &&
  /wrap\.style\.display=\(getComputedStyle\(btn\)\.display==="none"\)\?"none":"";/.test(APP) && /new MutationObserver\(syncHide\)\.observe\(btn,\{attributes:true,attributeFilter:\["style","class","hidden"\]\}\)/.test(APP) &&
  /\.has-npick \.rsx\{z-index:3\}/.test(APP), null);
report("A4) CI runs this test", /node test\/verify_native_pick\.js/.test(CI), null);

(async () => {
  const browser = await chromium.launch();
  withPremium(browser);
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  /* a small real PNG */
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d"); x.fillStyle = "#c96"; x.fillRect(0, 0, 64, 48); return c.toDataURL("image/png").split(",")[1]; });
  const buffer = Buffer.from(png, "base64");

  /* B) refs strip on Create: every tile carries an overlay input the size of the tile; a file set on it lands in that slot */
  const strip = await page.evaluate(() => {
    switchPage("pgCreate"); state.refs = [null, null, null]; renderRefs();
    const tiles = Array.from(document.querySelectorAll("#refStrip .rs"));
    return tiles.map(t => { const inp = t.querySelector(".npick"); const r = t.getBoundingClientRect(), q = inp && inp.getBoundingClientRect();
      return { has: !!inp, accept: inp && inp.accept, box: q && Math.abs(q.width - r.width) <= 2.5 && Math.abs(q.height - r.height) <= 2.5 && Math.abs(q.left - r.left) <= 1.5 }; }); /* the overlay fills the padding box: a 1px border ring stays outside */
  });
  await page.setInputFiles("#refStrip .rs:nth-child(2) .npick", { name: "second.png", mimeType: "image/png", buffer });
  await page.waitForTimeout(700);
  const landed = await page.evaluate(() => ({ s0: !!state.refs[0], s1: !!state.refs[1], s2: !!state.refs[2], slot: state.pickSlot }));
  report("B) Create refs strip: three tiles, each with a full-size image/* overlay; a file dropped on the SECOND tile fills slot 2 only",
    strip.length >= 3 && strip.every(t => t.has && t.accept === "image/*" && t.box) && !landed.s0 && landed.s1 && !landed.s2 && landed.slot === 1, { strip, landed });

  /* C) the image Smart Workflow wizard, step 2: the ရွေး button carries the overlay; a file on IMAGE 1's overlay fills slot 1 */
  const wiz = await page.evaluate(async () => {
    state.refs = [null, null, null]; renderRefs();
    window._openWizardById("bg-replace"); await new Promise(r => setTimeout(r, 300));
    const nav = document.querySelector("#wizIn .wiz-nav"); const btns = nav ? Array.from(nav.querySelectorAll("button")) : [];
    const go = btns.find(b => b.classList.contains("btn-gold")) || btns[btns.length - 1]; if (go) go.click();
    await new Promise(r => setTimeout(r, 300));
    const slots = Array.from(document.querySelectorAll("#wizIn .wslot"));
    return slots.map(s => { const w = s.querySelector(".act .npick-wrap"), inp = s.querySelector(".act .npick"), b = s.querySelector(".act .btn");
      const rb = b && b.getBoundingClientRect(), ri = inp && inp.getBoundingClientRect();
      return { wrapped: !!w && !!inp && w.contains(b), accept: inp && inp.accept, over: rb && ri && Math.abs(rb.left - ri.left) < 2 && Math.abs(rb.width - ri.width) < 2 && Math.abs(rb.top - ri.top) < 2 && Math.abs(rb.height - ri.height) < 2 }; });
  });
  await page.setInputFiles("#wizIn .wslot:nth-of-type(1) .act .npick", { name: "subject.png", mimeType: "image/png", buffer }).catch(() => {});
  await page.waitForTimeout(700);
  const wizLanded = await page.evaluate(() => ({ s0: !!state.refs[0], s1: !!state.refs[1], filled: document.querySelectorAll("#wizIn .wslot.filled").length }));
  report("C) BG Replace wizard, Images step: each slot's ရွေး button is wrapped with an overlay exactly over it (image/*); a file on IMAGE 1's overlay fills slot 1 and the slot shows filled",
    wiz.length >= 2 && wiz.every(s => s.wrapped && s.accept === "image/*" && s.over) && wizLanded.s0 && !wizLanded.s1 && wizLanded.filled === 1, { wiz, wizLanded });
  await page.evaluate(() => { const x = document.querySelector("#wizIn .wiz-x"); if (x) x.click(); state.refs = [null, null, null]; renderRefs(); });

  /* D) the studio's Before slot and Path / video pick buttons */
  const others = await page.evaluate(async () => {
    switchPage("pgMeitu"); await new Promise(r => setTimeout(r, 300));
    const stAdd = document.querySelector("#stTarget") ? null : null;
    const refAdd = Array.from(document.querySelectorAll(".ref .add")).find(a => a.closest(".npick-wrap"));
    const st = { wrapped: !!refAdd, inp: !!(refAdd && refAdd.parentNode.querySelector(".npick")), accept: refAdd && refAdd.parentNode.querySelector(".npick").accept };
    switchPage("pgPath"); await new Promise(r => setTimeout(r, 200));
    const pt = document.getElementById("btnPtAdd"), ptI = pt && pt.parentNode.querySelector(".npick");
    const pe = document.getElementById("ptEmpty"), peI = pe && pe.parentNode.querySelector(".npick");
    const path = { wrapped: !!(pt && pt.parentNode.classList.contains("npick-wrap")), multiple: !!(ptI && ptI.multiple), accept: ptI && ptI.accept, grow: pt && pt.parentNode.classList.contains("grow"), empty: !!peI };
    const vu = document.getElementById("btnVuPick"), vuI = vu && vu.parentNode.querySelector(".npick");
    const tk = document.getElementById("btnTkAudPick"), tkI = tk && tk.parentNode.querySelector(".npick");
    return { st, path, video: { vu: vuI && vuI.accept, tkAud: tkI && tkI.accept } };
  });
  report("D) Retouch A's add-photo button, the Path add / empty-state / reference buttons and the video / talk pickers all carry overlays that inherit their hidden input's accept and multiple",
    others.st.wrapped && others.st.inp && others.st.accept === "image/*" && others.path.wrapped && others.path.multiple && others.path.accept === "image/*" && others.path.grow && others.path.empty &&
    others.video.vu === "video/mp4" && others.video.tkAud === "audio/*", others);
  const stLanded = await page.evaluate(async () => { switchPage("pgMeitu"); await new Promise(r => setTimeout(r, 200)); return !!document.querySelector(".ref .npick"); });
  await page.setInputFiles(".ref .npick", { name: "portrait.png", mimeType: "image/png", buffer }).catch(() => {});
  await page.waitForTimeout(900);
  const stGot = await page.evaluate(() => ({ src: !!ST.srcBitmap, ref0: !!state.refs[0], stage: document.getElementById("stStage").style.display !== "none" }));
  report("D2) a file set on Retouch A's overlay loads the live stage (slot 0)", stLanded && stGot.src && stGot.ref0 && stGot.stage, stGot);

  /* E) layout stays: the Talk page's photo + audio buttons share one row; a hidden pick button hides its wrapper too */
  const lay = await page.evaluate(() => {
    switchPage("pgTalk");
    const a = document.getElementById("btnTkImgPick").getBoundingClientRect(), b = document.getElementById("btnTkAudPick").getBoundingClientRect();
    const ba = document.getElementById("btnTkAudPick").parentNode.getBoundingClientRect(); /* the wrapper's box also holds the button's own margin-top */
    switchPage("pgV2V");
    const vi = document.getElementById("btnVtImgPick"), vw = vi.parentNode; const hidden0 = vi.style.display === "none";
    const wrapHidden0 = getComputedStyle(vw).display === "none";
    vi.style.display = hidden0 ? "" : "none";
    return new Promise(res => setTimeout(() => { const flipped = getComputedStyle(vw).display === "none"; vi.style.display = hidden0 ? "none" : ""; res({ sameRow: Math.abs(a.top - b.top) < 2, sideBySide: b.left >= a.right - 1, audW: ba.width, wrapW: b.width, inline: getComputedStyle(document.getElementById("btnTkImgPick").parentNode).display, hidden0, wrapHidden0, flipped }); }, 50));
  });
  report("E) layout stays: the Talk page's photo + audio pick buttons share one row at their own width; a hidden pick button hides its wrapper and shows it again",
    lay.sameRow && lay.sideBySide && Math.abs(lay.audW - lay.wrapW) < 2 && lay.inline === "inline-flex" && lay.wrapHidden0 === lay.hidden0 && lay.flipped !== lay.hidden0, lay);
  report("no page errors", errs.length === 0, errs);
  await browser.close();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — every pick is a real tap on a real file input, and the file lands where it always did");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
