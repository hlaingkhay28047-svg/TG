/* 6.117.0 / panel 6.188.0 — UI/UX wave: Retouch R2 (preview precision) + wave B2 (two-pane generation pages).

   R2 — the owner asked for a live preview "more precise than Evoto or Meitu" and a bigger A|B split
   on a computer (photos of 6.115.0 on a desktop, 2026-09-20). Measured before this wave: the
   desktop studio grid gave the preview a fixed 42% column — a 3:2 photo on a 1440 monitor stood
   494px wide beside 700px of sliders while the canvas could have been 580px tall; the sharp
   (export-path) frame existed only while zoomed, so a 2x screen showed the 1280 buffer through
   1800 device pixels at fit; the A|B divider landed on whole percents (nine pixels a step on a
   900px picture) and had no keyboard.
   Now: the column is sized from the buffer's own aspect and the canvas's stated ceiling (window −
   320px), capped at 58% of the block, floored at 340px (stColsFit); the sharp frame lands at fit
   wherever the screen can show a quarter more pixels than the buffer holds, at the picture's device pixels, and
   under the split the untouched side is drawn from the original at the same detail; the divider
   moves in tenths, ← → step it (Shift 0.1%), and it prints its position while it moves. A live
   edit stales the frame at once — the three change paths hide it — so it never sits over a proxy.
   B2 — from 1200px the six generation pages (Freeform · Text→Image · Video · Video Upscale · V→V
   · Talking Photo) become two panes the moment they carry a shown result (:has()), the result
   sticky under the header with a stated ceiling; the Freeform wipe takes what that ceiling leaves.
   One centred column without a result; phones and tablets untouched.

   A) source pins   B) Retouch A on a 1920×1080 2x monitor, a 1440×900 1x desk, a 390 phone
   C) the six generation pages at 1440 · 1920 · 1199 · 390   D) the release pins. */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 8931;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const CI = read(".github/workflows/test.yml");
const LANDING = read("docs/index.html");
const WN = read("docs/app/data/whatsnew.js");
const PWN = read("panel/js/hnk_whats_new.js");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const VER = "6.117.0", PVER = "6.188.0";
const GEN = [["pgCreate", "resultBox"], ["pgText2Img", "t2iResultBox"], ["pgVideo", "vidResultBox"], ["pgVideoUp", "vuResultBox"], ["pgV2V", "vtResultBox"], ["pgTalk", "tkResultBox"]];

let failures = 0;
function report(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failures++; console.log("FAIL — " + name + (detail !== undefined ? "  :: " + JSON.stringify(detail).slice(0, 900) : "")); }
}
const has = (s, t) => s.indexOf(t) >= 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sel = (pg) => `#${pg}.on:has(>.result-box.on,>.result-box.pending)`;   /* 6.120.0 — a pending (skeleton) card counts like a shown one, so the two-pane layout is there from the first second of a job */

/* ================= A) source ================= */
function sourcePins() {
  const grid = GEN.map(([pg]) => sel(pg)).join(",") + "{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,40%);column-gap:18px;align-items:start}";
  const hero = GEN.map(([pg]) => sel(pg) + ">.page-hero").join(",") + "{grid-column:1/-1}";
  const cards = GEN.map(([pg]) => sel(pg) + ">.card").join(",") + "{grid-column:1;max-width:none;margin-left:0;margin-right:0}";
  const box = GEN.map(([pg]) => sel(pg) + ">.result-box").join(",") + "{grid-column:2;grid-row:2/span 12;max-width:none;margin:0;position:sticky;top:calc(var(--navH,65px) + 12px);max-height:calc(100vh - var(--navH,65px) - 24px);overflow-y:auto;overscroll-behavior:contain}";
  const wf3 = GEN.map(([pg]) => sel(pg) + " .wfgrid").join(",") + "{grid-template-columns:repeat(3,minmax(0,1fr))}";
  const wf4 = GEN.map(([pg]) => sel(pg) + " .wfgrid").join(",") + "{grid-template-columns:repeat(4,minmax(0,1fr))}";
  const at1200 = APP.indexOf("@media(min-width:1200px){\n  " + grid), at1800 = APP.indexOf("@media(min-width:1800px){\n  .wfgrid{grid-template-columns:repeat(5,minmax(0,1fr))}\n  " + wf4);
  report("A1) wave B2 rules: from 1200px a generation page with a shown result is a two-column grid (controls 1fr · result minmax(380px,40%)), the hero spans both, the cards lose the 880/1120 cap, the result box is sticky under the header with a stated ceiling; the card grid keeps three across (four from 1800px); declared after the 1440 layer so the centred rules lose",
    at1200 > 0 && has(APP, hero) && has(APP, cards) && has(APP, box) && has(APP, wf3) && at1800 > at1200 && at1200 > APP.indexOf("#pgText2Img>.result-box,#pgCreate>.result-box,#pgTalk>.result-box{max-width:1120px}"), { at1200, at1800 });
  report("A2) stColsFit: the stage column is sized from the buffer's aspect and the ≥1024 canvas ceiling (window − 320px), capped at 58% of the block and 420px + gap of controls, floored at 340px; cleared under 1024px, without a photo and for 2-up; run when the buffer is built, on refresh, on resize, on the 2-up toggle and with the stage sync",
    has(APP, "function stColsFit(){") && has(APP, 'var wide=!!(window.matchMedia&&matchMedia("(min-width:1024px)").matches);') &&
    has(APP, 'if(!wide||!ST.buf||!ST.srcBitmap||cols.classList.contains("sbs")){ cols.style.gridTemplateColumns=""; cols.removeAttribute("data-fit-w"); return; }') &&
    has(APP, "var maxH=Math.max(240,window.innerHeight-320);") && has(APP, "var cap=Math.min(Math.round(W*0.58), W-ST_COLS_MIN_R);") && has(APP, "var lw=Math.max(340, Math.min(want, cap));") &&
    has(APP, "var ST_COLS_MIN_R=436;") && has(APP, 'cols.style.gridTemplateColumns=lw+"px minmax(0,1fr)";') &&
    has(APP, '  ST.buf=document.createElement("canvas"); ST.buf.width=bw; ST.buf.height=bh;\n  if(typeof stColsFit==="function") stColsFit();') &&
    has(APP, "  ST.refreshFns.push(stColsFit); stColsFit();") && has(APP, "ST._colsT=setTimeout(stColsFit,80)") &&
    has(APP, '    var cols=$("stCols"); if(cols) cols.classList.toggle("sbs",on); /* desktop: the stage column widens for two panes */\n    stColsFit();') &&
    has(APP, "  window.stStageSync=function(){ try{ upd(); }catch(e){} try{ stColsFit(); }catch(e2){} };") &&
    has(APP, "#stColL #stCanvas{max-height:calc(100vh - 320px)}"), null);
  report("A3) the sharp frame at fit and under the split: the frame's long edge is the full cap while zoomed and the picture's device pixels at fit (part of the key); wanted wherever the screen can show more than the buffer holds; the split's untouched side is drawn from the original (or the pin) clipped at the divider; the HD tag rides the picture at fit; the three change paths stale it at once",
    has(APP, "function hiCap(){ return Z.s>1.05 ? ST_HI_CAP : Math.min(ST_HI_CAP, Math.round(Math.max(cssW(),cssH())*hiDpr())); }") &&
    has(APP, "function hiFitNeed(){ return !!(ST.buf&&c.width*1.25<cssW()*hiDpr()); }") &&
    has(APP, "function hiWanted(){ return !!(ST.srcBitmap&&!ST.holding&&!ST.showingResult&&!(ST.sbs&&ST.sbs.on)&&!ST.showZones&&(Z.s>1.05||hiFitNeed())); }") &&
    has(APP, '(state.st.img&&state.st.img.b64||"").length,hiCap()]); }') && has(APP, "var sc=Math.min(1,hiCap()/Math.max(w,h));") &&
    has(APP, "var srcS=(ST.pin&&ST.pin.cv)?ST.pin.cv:stExportSource();") && has(APP, "hx.save(); hx.beginPath(); hx.rect(sx0,0,sw0,oh); hx.clip(); hx.drawImage(srcS,sx*kx,sy*ky,sw*kx,sh*ky,0,0,ow,oh); hx.restore();") &&
    has(APP, 'var hdTag=document.createElement("span"); hdTag.id="stHdTag"; hdTag.textContent="HD";') && has(APP, 'function hdTagSync(){ hdTag.style.display=(ST.hi.on&&Z.s<=1.001)?"inline-block":"none"; }') &&
    has(APP, "#stHdTag{position:absolute;left:8px;top:8px;z-index:3;display:none;pointer-events:none;") &&
    has(APP, 'function stApplyDragFilter(){ var c=$("stCanvas"); if(c) c.style.filter=ST.split.on?"":stCssFilter(stEffT1()); if(ST.hi&&ST.hi.on&&ST._hiSync) ST._hiSync();') &&
    has(APP, "function stProxySoon(){\n  if(ST.hi&&ST.hi.on&&ST._hiSync) ST._hiSync();") &&
    has(APP, "  if(ST.split.on){ /* SHOULD #11: while A|B split is on, settle-path renders both halves */\n    if(ST.hi&&ST.hi.on&&ST._hiSync) ST._hiSync();") &&
    LANGS.every((l) => new RegExp('hdTag\\.title=L9\\(\\{[^\\n]*' + l + ':"[^"]{6,}"').test(APP)), null);
  report("A4) divider precision: tenths of a percent from the pointer, the readout on the line (data-pct, shown while it moves), ← → step 1% and Shift 0.1% (not while typing, not over the result wipe), the sharp frame redrawn with the divider",
    has(APP, "ST.split.pct=stClamp(Math.round((e.clientX-r.left)/r.width*1000)/10,0,100);") &&
    has(APP, 'line.setAttribute("data-pct",(Math.round(ST.split.pct*10)/10)+"%");') &&
    has(APP, ".st-split-line::before{content:attr(data-pct);position:absolute;top:8px;left:50%;") && has(APP, "#stStage.split.st-adjust .st-split-line::before{opacity:1}") &&
    has(APP, 'if(ev.key!=="ArrowLeft"&&ev.key!=="ArrowRight") return;') && has(APP, 'nudge((ev.key==="ArrowRight"?1:-1)*(ev.shiftKey?0.1:1));') &&
    has(APP, 'if(/INPUT|TEXTAREA|SELECT/.test(tag)||(t&&t.closest&&t.closest(".cmp"))) return;') &&
    has(APP, "function follow(){ if(!rafP){ rafP=true; requestAnimationFrame(function(){ rafP=false; stRenderSettle(); if(ST.hi&&ST.hi.on&&ST._hiDraw) ST._hiDraw(); }); } }") &&
    has(APP, "ST._splitNudge=nudge;"), null);
  report("A5) cmpFit: inside a sticky two-pane result card the wipe's budget is the card's ceiling minus its other content (measured), never an inner scrollbar",
    has(APP, 'var card=box.closest?box.closest(".result-box"):null;') && has(APP, 'if(cs.position==="sticky"&&cap>0){') &&
    has(APP, "var other=Math.max(0, card.scrollHeight-Math.round(box.getBoundingClientRect().height));") && has(APP, "maxH=Math.max(240, Math.min(maxH, cap-other-8));"), null);
}

/* ================= B) Retouch A ================= */
async function openApp(browser, w, h, dpr) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr || 1 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_seen_splash", "1"); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof switchPage === "function" && typeof stLoadImage === "function" && typeof stColsFit === "function", null, { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.evaluate("window.SNAP = " + SNAP.toString() + "; window.WAIT = " + WAIT.toString() + ";");   /* the page-side helpers, for the evaluate blocks below */
  return { ctx, page, errs };
}
/* a photo with fine texture (so the sharp frame carries detail the buffer cannot), retained as the picker would keep it */
const LOAD_PHOTO = async ([W, H]) => {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#6a4a3a"); g.addColorStop(1, "#d9a884"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) { x.fillStyle = i % 2 ? "rgb(214,162,130)" : "rgb(70,40,30)"; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  x.fillStyle = "#e8c9b0"; x.beginPath(); x.ellipse(W * 0.5, H * 0.45, W * 0.12, H * 0.28, 0, 0, Math.PI * 2); x.fill();
  const du = c.toDataURL("image/jpeg", 0.92);
  state.stFull = { key: stFullKey(du.slice(du.indexOf(",") + 1)), du };
  await new Promise((res) => { ST.loadImage(du, { done: res }); });
  for (let w = 0; w < 100 && !ST.fullBitmap; w++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  return !!ST.fullBitmap;
};
const SNAP = () => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const c = document.getElementById("stCanvas"), cols = document.getElementById("stCols"), hiC = document.getElementById("stHiCanvas"), tag = document.getElementById("stHdTag"), line = document.getElementById("stSplitLine");
  return { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, W: cols.clientWidth, buf: { w: c.width, h: c.height }, canvas: R(c), clientW: c.clientWidth, cols: cols.style.gridTemplateColumns, fitW: Number(cols.getAttribute("data-fit-w")) || 0,
    L: R(document.getElementById("stColL")), Rc: R(document.getElementById("stColR")), hi: !!ST.hi.on, hiW: ST.hi.w, hiH: ST.hi.h, hiShown: hiC.style.display !== "none", hiCanvas: { w: hiC.width, h: hiC.height },
    tag: getComputedStyle(tag).display !== "none" && tag.getBoundingClientRect().width > 10, tagTitle: tag.title, /* computed, not the inline value — an empty inline value fell back to the sheet's display:none (caught on the 1920 2x after-shot) */ zoom: ST.ui.zoom.s, split: ST.split.on, pct: ST.split.pct, dataPct: line.getAttribute("data-pct"), adjust: document.getElementById("stStage").classList.contains("st-adjust"), full: !!ST.fullBitmap };
};
const WAIT = async (pred, ms) => { let t = 0; while (t < ms && !pred()) { await new Promise((r) => setTimeout(r, 100)); t += 100; } return t; };
function expectFit(s) { /* the rule, recomputed from what the page measured */
  const want = Math.round(Math.max(240, s.vh - 320) * s.buf.w / s.buf.h) + 2, cap = Math.min(Math.round(s.W * 0.58), s.W - 436);
  let lw = Math.max(340, Math.min(want, cap)); if (lw > s.W - 200) lw = Math.max(340, s.W - 200); return lw;
}
async function retouchWalk(browser) {
  /* ---- a 1920×1080 monitor at 2x: the sharp frame lands at fit ---- */
  {
    const { ctx, page, errs } = await openApp(browser, 1920, 1080, 2);
    await page.evaluate(() => { switchPage("pgMeitu"); });
    await page.waitForTimeout(300);
    const full = await page.evaluate(LOAD_PHOTO, [3000, 2000]);
    const s0 = await page.evaluate(SNAP);
    const lw = expectFit(s0);
    report("B1) 1920×1080 2x, a 3000×2000 photo: the stage column is sized from the picture — round(min(58% of the block, the 760px ceiling × 3:2)) — the canvas fills it, the controls keep ≥ 420px",
      full && s0.fitW === lw && s0.cols === lw + "px minmax(0px, 1fr)" && near(s0.L.w, lw, 1) && near(s0.canvas.w, lw, 3) && s0.Rc.w >= 420 && lw > Math.round(s0.W * 0.42) + 100, { s0, lw });
    const waited = await page.evaluate(() => WAIT(() => ST.hi.on, 12000), null).catch(() => 12000);
    const s1 = await page.evaluate(SNAP);
    report("B2) …the sharp frame lands at fit within seconds: rendered at the picture's device pixels (canvas client width × 2), drawn over the canvas at that size, the HD tag on the picture (nine-language title), the zoom pill not involved",
      s1.hi && s1.hiShown && s1.hiW === Math.round(s1.clientW * 2) && s1.hiCanvas.w === s1.hiW && s1.tag && s1.tagTitle.length > 10 && s1.zoom === 1 && waited < 12000, { waited, s1 });
    /* ---- split: the frame stays, the divider is precise ---- */
    const sp = await page.evaluate(async () => {
      document.getElementById("stSplit").click(); await new Promise((r) => setTimeout(r, 700));
      await WAIT(() => ST.hi.on, 8000);
      const a = SNAP();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
      const b = SNAP();
      /* typing in a field must not move it */
      const inp = document.createElement("input"); document.body.appendChild(inp); inp.focus();
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      const c = ST.split.pct; inp.remove();
      return { a, b, typedPct: c };
    });
    report("B3) A|B split on: the sharp frame stays (the untouched side drawn from the original), the divider reads 50% on the line; → then Shift+→ ← → moves it 50 → 51.1 with the readout '51.1%' and the position pill shown; an arrow typed in a field moves nothing",
      sp.a.split && sp.a.hi && sp.a.hiShown && sp.a.dataPct === "50%" && sp.b.pct === 51.1 && sp.b.dataPct === "51.1%" && sp.b.adjust && sp.b.hi && sp.typedPct === 51.1, sp);
    /* a real mouse drag lands on tenths */
    await page.evaluate(() => { document.getElementById("stStage").scrollIntoView({ block: "center" }); });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const b = document.getElementById("stCanvas").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    const x0 = r.x + r.w * 0.30, x1 = r.x + r.w * 0.3337, y = r.y + r.h * 0.5;
    await page.mouse.move(x0, y); await page.mouse.down(); await page.mouse.move(x0 + 20, y, { steps: 3 }); await page.mouse.move(x1, y, { steps: 4 });
    const during = await page.evaluate(() => ({ pct: ST.split.pct, adjust: document.getElementById("stStage").classList.contains("st-adjust"), dataPct: document.getElementById("stSplitLine").getAttribute("data-pct") }));
    await page.mouse.up();
    const wantPct = Math.round((x1 - r.x) / r.w * 1000) / 10;
    report("B4) a mouse drag of the divider lands on tenths of a percent (33.4, not 33) with the readout following",
      near(during.pct, wantPct, 0.15) && Math.abs(during.pct - Math.round(during.pct)) > 0.05 && during.adjust && during.dataPct === during.pct + "%", { during, wantPct });
    /* an edit stales the frame at once; a fresh one lands at the fit size */
    const ed = await page.evaluate(async () => {
      await WAIT(() => ST.hi.on, 6000);
      const key0 = ST.hi.key;
      state.st.t1 = stDefT1(); state.st.t1.exp = 40; stT1Changed();
      const stale = { on: ST.hi.on, shown: document.getElementById("stHiCanvas").style.display !== "none" };
      const waited = await WAIT(() => ST.hi.on && ST.hi.key !== key0, 12000);
      const fresh = SNAP();
      /* the same in the other two change paths: a T2 slider and a pipeline control */
      const k1 = ST.hi.key; state.st.t2 = stDefT2(); state.st.t2.smooth = 40; stT2Changed(); const stale2 = ST.hi.on;
      await WAIT(() => ST.hi.on && ST.hi.key !== k1, 12000);
      const k2 = ST.hi.key; stProxySoon(); const kept = ST.hi.on; /* no change → nothing to stale */
      state.st.t1 = stDefT1(); state.st.t2 = stDefT2(); stT1Changed(); stT2Changed();
      await WAIT(() => ST.hi.on && ST.hi.key !== k2, 12000);
      return { stale, stale2, kept, waited, fresh, key0changed: fresh.hi && ST.hi.key !== key0 };
    });
    report("B5) an exposure edit under the split hides the stale sharp frame in the same call and a fresh frame lands (still at the fit size); a skin slider hides it too; a proxy request with nothing changed keeps it",
      ed.stale.on === false && ed.stale.shown === false && ed.fresh.hi && ed.fresh.hiW === Math.round(ed.fresh.clientW * 2) && ed.stale2 === false && ed.kept === true && ed.waited < 12000, ed);
    /* zoom: the full cap; back to fit: the fit frame again */
    const z = await page.evaluate(async () => {
      document.getElementById("stSplit").click(); await new Promise((r) => setTimeout(r, 300));
      ST.zoomTo(2.5);
      const w1 = await WAIT(() => ST.hi.on && ST.hi.w === 3000, 12000); const zoomed = SNAP();
      ST.zoomReset(); await new Promise((r) => setTimeout(r, 150)); const justReset = SNAP();
      const w2 = await WAIT(() => ST.hi.on && ST.hi.w < 3000, 12000); const fit = SNAP();
      return { w1, zoomed, justReset, w2, fit };
    });
    report("B6) zoomed ×2.5 the frame is the whole 3000px original (the zoom pill carries HD, the tag steps aside); Fit hides it, then the fit-size frame returns",
      z.zoomed.hi && z.zoomed.hiW === 3000 && !z.zoomed.tag && z.zoomed.zoom > 1.05 && /* the loupe is clamped to the buffer's native scale until the 3000px frame exists (§3.1) */ z.justReset.hi === false && z.fit.hi && z.fit.hiW === Math.round(z.fit.clientW * 2) && z.fit.tag && z.w1 < 12000 && z.w2 < 12000, z);
    /* a portrait photo gives the width back */
    await page.evaluate(LOAD_PHOTO, [2000, 3000]);
    await page.waitForTimeout(1500);
    const p = await page.evaluate(SNAP);
    const lwP = expectFit(p);
    report("B7) a 2000×3000 portrait: the column shrinks to the 760px ceiling × 2:3 (the sliders get two columns back); at fit the screen cannot show more than the 1365px buffer, so no sharp frame and no tag",
      p.fitW === lwP && lwP < Math.round(p.W * 0.42) && near(p.L.w, lwP, 1) && p.Rc.w > 900 && p.hi === false && p.tag === false && p.buf.w < p.buf.h, { p, lwP });
    report("B8) 2x monitor: no page errors", errs.length === 0, errs);
    await ctx.close();
  }
  /* ---- a 1440×900 desk at 1x: the column grows, the frame stays a zoom thing ---- */
  {
    const { ctx, page, errs } = await openApp(browser, 1440, 900, 1);
    await page.evaluate(() => { switchPage("pgMeitu"); });
    await page.waitForTimeout(300);
    const full = await page.evaluate(LOAD_PHOTO, [3000, 2000]);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(SNAP);
    const lw = expectFit(s);
    const z = await page.evaluate(async () => { ST.zoomTo(2.5); const w = await WAIT(() => ST.hi.on && ST.hi.w === 3000, 12000); const zoomed = SNAP(); ST.zoomReset(); await new Promise((r) => setTimeout(r, 800)); return { w, zoomed, reset: SNAP() }; });
    report("B9) 1440×900 1x, a 3:2 photo: the stage takes 58% of the block (701px on this desk, was 494px); at fit the 1x screen shows no more than the buffer — no frame, no tag; zoomed the 3000px frame comes as before, Fit hides it",
      full && s.fitW === lw && lw === Math.round(s.W * 0.58) && s.hi === false && s.tag === false && z.zoomed.hi && z.zoomed.hiW === 3000 && z.reset.hi === false && z.reset.tag === false && z.w < 12000, { s, lw, z });
    report("B10) 1x desk: no page errors", errs.length === 0, errs);
    await ctx.close();
  }
  /* ---- a phone: untouched, the keyboard nudge still exists ---- */
  {
    const { ctx, page, errs } = await openApp(browser, 390, 844, 3);
    await page.evaluate(() => { switchPage("pgMeitu"); });
    await page.waitForTimeout(300);
    await page.evaluate(LOAD_PHOTO, [3000, 2000]);
    await page.waitForTimeout(800);
    const ph = await page.evaluate(async () => {
      const a = SNAP();
      document.getElementById("stSplit").click(); await new Promise((r) => setTimeout(r, 400));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      return { a, b: SNAP() };
    });
    report("B11) a 390 phone: no inline columns (the stack is the phone's own), no sharp frame at fit (a 3x phone shows only 4% more pixels than the 896px buffer — under the quarter the rule asks for), the divider still steps by keyboard",
      ph.a.cols === "" && ph.a.fitW === 0 && ph.a.hi === false && ph.b.split && ph.b.pct === 49 && ph.b.dataPct === "49%" && errs.length === 0, { ph, errs });
    await ctx.close();
  }
}

/* ================= C) the six generation pages ================= */
const GEN_WALK = async ([pages, w]) => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = [];
  for (const [pg, rb] of pages) {
    window.scrollTo(0, 0); switchPage(pg); await new Promise((r) => setTimeout(r, 250));
    const p = document.getElementById(pg), box = document.getElementById(rb);
    box.className = "card result-box";
    const cardsOff = [...p.querySelectorAll(":scope > .card:not(.result-box)")].map(R);
    const off = { display: getComputedStyle(p).display, cardW: Math.max(...cardsOff.map((c) => c.w)), cardX: cardsOff[0].x, pageX: R(p).x, pageW: R(p).w };
    box.className = "card result-box on";
    await new Promise((r) => setTimeout(r, 150));
    const cards = [...p.querySelectorAll(":scope > .card:not(.result-box)")].map(R);
    const grid = p.querySelector(".wfgrid");
    const on = { display: getComputedStyle(p).display, cols: getComputedStyle(p).gridTemplateColumns.split(" ").length, hero: R(p.querySelector(":scope > .page-hero")), cards, cardMaxW: Math.max(...cards.map((c) => c.w)), cardRight: Math.max(...cards.map((c) => c.x + c.w)),
      box: R(box), pos: getComputedStyle(box).position, top: getComputedStyle(box).top, maxH: getComputedStyle(box).maxHeight, scrollW: document.documentElement.scrollWidth, wfCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null,
      boxSH: box.scrollHeight, boxCH: box.clientHeight };
    window.scrollTo(0, 700); await new Promise((r) => setTimeout(r, 200));
    const nav = document.querySelector(".nav").getBoundingClientRect();
    const scrolled = { scrollY: Math.round(scrollY), boxTop: R(box).y, navBottom: Math.round(nav.bottom), firstCardTop: R(p.querySelector(":scope > .card")).y };
    window.scrollTo(0, 0); box.className = "card result-box";
    out.push({ pg, off, on, scrolled });
  }
  return out;
};
async function genWalk(browser) {
  for (const vp of [{ w: 1440, h: 900, two: true, wf: 3 }, { w: 1920, h: 1080, two: true, wf: 4 }, { w: 1199, h: 800, two: false }, { w: 390, h: 844, two: false }]) {
    const { ctx, page, errs } = await openApp(browser, vp.w, vp.h, 1);
    const rows = await page.evaluate(GEN_WALK, [GEN, vp.w]);
    if (vp.two) {
      report(`C1) ${vp.w}×${vp.h}: without a result each of the six pages is one centred column (block, the card ≤ 1120px); with a shown result it is a two-column grid — the hero spans both, every card sits left and grows to the pane, the result box sits right of the cards' edge, is sticky at header + 12px with a (window − header − 24px) ceiling, nothing overflows`,
        rows.every((r) => r.off.display === "block" && r.off.cardW <= 1120 && r.off.cardX > r.off.pageX && r.on.display === "grid" && r.on.cols === 2 && r.on.hero.w >= r.on.cardMaxW + 300 && r.on.cardMaxW > r.off.cardW * 0.55 &&
          r.on.cards.every((c) => c.x + c.w <= r.on.box.x - 10) && r.on.box.x >= r.on.cardRight + 10 && r.on.box.w >= 380 && r.on.pos === "sticky" && r.on.top === (65 + 12) + "px" && r.on.maxH === (vp.h - 65 - 24) + "px" && r.on.scrollW <= vp.w),
        rows.map((r) => ({ pg: r.pg, off: r.off, on: { d: r.on.display, cols: r.on.cols, cardMaxW: r.on.cardMaxW, cardRight: r.on.cardRight, box: r.on.box, pos: r.on.pos, top: r.on.top, maxH: r.on.maxH, sw: r.on.scrollW } })));
      report(`C2) ${vp.w}×${vp.h}: scrolled 700px down, the result box holds at header + 12px on every page that scrolls that far (the sticky is real), and the Video card grid shows ${vp.wf} across in the control pane`,
        rows.every((r) => r.scrolled.scrollY < 700 || r.scrolled.boxTop === r.scrolled.navBottom + 12) && rows.some((r) => r.scrolled.scrollY >= 700) && rows.find((r) => r.pg === "pgVideo").on.wfCols === vp.wf,
        rows.map((r) => ({ pg: r.pg, scrolled: r.scrolled, wf: r.on.wfCols })));
      /* Freeform with a real 600×900 result: the wipe fits the sticky card */
      const ff = await page.evaluate(async () => {
        const R = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
        switchPage("pgCreate"); await new Promise((r) => setTimeout(r, 250));
        const mk = (w, h, c1, c2) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, w, h); return c.toDataURL("image/jpeg", 0.8); };
        const b64 = (du) => du.split(",")[1];
        state.refs[0] = { mime: "image/jpeg", b64: b64(mk(600, 900, "#553", "#a86")), label: "x.jpg" }; state.hist = [{ mime: "image/jpeg", b64: b64(mk(600, 900, "#357", "#9bd")) }]; state.histSel = 0; state.result = state.hist[0];
        const card = document.getElementById("resultBox"); card.className = "card result-box on"; state.cmpBase = null; refreshCmp(); document.getElementById("cmpWrap").style.display = ""; cmpLayout();
        await new Promise((r) => setTimeout(r, 500)); cmpLayout(); await new Promise((r) => setTimeout(r, 150));
        const box = document.getElementById("cmpBox");
        const o = { card: R(card), box: R(box), fit: Number(box.getAttribute("data-fit")), cap: parseFloat(getComputedStyle(card).maxHeight), sh: card.scrollHeight, ch: card.clientHeight, pos: getComputedStyle(card).position, vh: innerHeight };
        card.className = "card result-box"; return o;
      });
      const other = ff.sh - ff.box.h, budget = Math.min(ff.vh - 300, ff.cap - other - 8), wantW = Math.round(budget * 600 / 900);
      report(`C3) ${vp.w}×${vp.h} Freeform with a 600×900 result: the wipe is sized to what the sticky card's ceiling leaves after its other content (measured), the card never scrolls inside, the wipe is centred in the right pane`,
        ff.pos === "sticky" && near(ff.fit, wantW, 1) /* the card's other content is measured against the box's previous height: a pixel of rounding */ && near(ff.box.w, wantW, 2) && ff.sh <= ff.ch + 1 && ff.box.x > ff.card.x && near(ff.box.x - ff.card.x, (ff.card.x + ff.card.w) - (ff.box.x + ff.box.w), 3) && ff.card.h <= ff.cap + 1, { ff, other, budget, wantW });
    } else {
      report(`C4) ${vp.w}×${vp.h}: under 1200px nothing changes — with or without a result every page stays one block column, the result box in the flow (static), no overflow`,
        rows.every((r) => r.off.display === "block" && r.on.display === "block" && r.on.pos === "static" && r.on.box.x === r.on.cards[0].x && r.on.box.w === r.on.cards[0].w && r.on.scrollW <= vp.w), rows.map((r) => ({ pg: r.pg, d: r.on.display, pos: r.on.pos, box: r.on.box, c0: r.on.cards[0] })));
    }
    report(`C5) ${vp.w}×${vp.h}: no page errors`, errs.length === 0, errs);
    await ctx.close();
  }
}

/* ================= D) the release ================= */
function releasePins() {
  const manifest = JSON.parse(read("panel/release-manifest.json"));
  const pv = JSON.parse(read("docs/download/panel-version.json"));
  /* 6.118.0 — this wave shipped as 6.117.0 / 6.188.0; every wave after it moves the pair on. What stays
     true is the LOCKSTEP: one app version in every app file, one panel version in every panel file, the
     landing carrying both, and the pair at or past this wave's. */
  const appV = (APP.match(/var APP_VER="([0-9.]+)";/) || [])[1], panV = (MAIN.match(/const PANEL_VERSION = "([0-9.]+)";/) || [])[1];
  const ge = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return true; };
  report(`D1) the release pair is in lockstep (this wave shipped as ${VER} / panel ${PVER}; the pair only moves forward): APP_VER, version.json, sw.js cache, API_VERSION agree; PANEL_VERSION, manifest, release-manifest (+ artifact file), panel-version.json agree; the download footer and the landing carry both`,
    !!appV && !!panV && ge(appV, VER) && ge(panV, PVER) && has(read("docs/app/version.json"), `"v":"${appV}"`) && has(read("docs/app/sw.js"), 'var CACHE = "hnk-web-studio-v' + appV.replace(/\./g, "-") + '";') &&
    has(read("server/index.js"), `const API_VERSION = "${appV}";`) && has(read("panel/manifest.json"), `"version": "${panV}"`) &&
    manifest.version === panV && manifest.artifact_file === `HNK_Ai_Panel_v${panV}.ccx` && /^[0-9a-f]{64}$/.test(manifest.sha256) && manifest.bytes > 20000000 &&
    pv.v === panV && pv.latest_version === panV && has(read("docs/download/index.html"), `Web App ${appV} · Panel ${panV}`) &&
    has(LANDING, appV) && has(LANDING, panV) && !has(LANDING, "6.116.0") && !has(LANDING, "6.187.0"), { appV, panV, manifest: manifest.version, pv: pv.v });
  const rows = JSON.parse(WN.replace(/^window\.HNK_WHATS_NEW=/, "").replace(/;\s*$/, ""));
  const row = rows.find((r) => r.v === VER);
  report(`D2) the What's New strip carries the ${VER} row (it led the strip when this wave shipped) — title and story in all nine languages, pointing at Retouch A — and the panel's lifted table carries it`,
    row && row.v === VER && row.ref === "pgMeitu" && LANGS.every((l) => row.t[l] && row.t[l].length > 8 && row.s[l] && row.s[l].length > 40) && has(PWN, `"v":"${VER}"`), row && { v: row.v, langs: Object.keys(row.t) });
  report("D3) CI runs this test right after the wave B3 + R1 step and the landing says how many tests the suite runs (259 when this wave shipped, 260 since 6.118.0 added verify_ux_wave_6118, 261 since 6.119.0 added verify_ux_wave_6119, 262 since 6.120.0 added verify_ux_wave_6120, 263 since 6.121.0 added verify_album_designer)",
    has(CI, "run: node test/verify_ux_wave_6116.js\n") && has(CI, "run: node test/verify_ux_wave_6117.js") && CI.indexOf("verify_ux_wave_6116") < CI.indexOf("verify_ux_wave_6117") &&
    (CI.match(/node test\//g) || []).length === 272 && has(LANDING, "272 tests") && !has(LANDING, "258 tests"), { steps: (CI.match(/node test\//g) || []).length });
}

(async () => {
  sourcePins();
  const browser = await chromium.launch();
  withPremium(browser);
  try {
    await retouchWalk(browser);
    await genWalk(browser);
  } finally { await browser.close(); }
  releasePins();
  console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASS — the stage takes the width the picture needs, the sharp frame lands at fit and under the split, the divider moves in tenths, and a result sits beside its controls on a monitor");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
