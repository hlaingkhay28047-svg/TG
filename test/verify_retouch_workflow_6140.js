/* 6.140.0 / panel 6.211.0 — RETOUCH A/B KEEPS THE PHOTO, REMEMBERS THE CONTROLS AND ANSWERS THE KEYBOARD.
 *
 * WHAT THE SURVEY FOUND. Retouch A carries 163 controls and Retouch B 213, with a 25-step undo,
 * split / 2-up / pin / peek, five zoom presets, multi-face targeting, recipes, a skin check and a
 * one-tap — the feature list already stood beside Meitu and Evoto. What it lacked was in the
 * hour of work around those features, and three of those gaps were measured:
 *
 *   1. THE PHOTO DID NOT SURVIVE A RELOAD. state.st — every slider — is saved; the picture never
 *      was, because base64 does not fit localStorage. A phone that reloaded, a tab the browser
 *      threw away, came back to a full set of sliders and an empty stage. The picture now goes to
 *      IndexedDB (kv, the store the Gallery uses) as it loads, with a 144px tile, and the empty
 *      picker — Retouch A/B's and V2's, which share the slot — offers "Continue your last edit"
 *      with the tile, the time and the size, or Discard. Removing the photo drops the draft.
 *   2. NO RECENT CONTROLS. A studio uses the same six or eight sliders on every face, and each
 *      was a scroll through seventeen groups. Every drag now moves its id to the front of a list
 *      of eight, kept with the stage preferences (hnk_st_ui); the jump bar draws it as chips that
 *      open the group, scroll the row into view and focus it — across the suite pages too. The
 *      list is lifted with the studio module, so the panel has it.
 *   3. THE KEYBOARD STOPPED AT Ctrl+Z / Ctrl+Y / Ctrl+Enter / B. Space now peeks like B, [ and ]
 *      step the loupe, 0 fits, 1 is 100%, F E L frame the face, eyes and lips, S is the A|B
 *      split, P pins, and ? draws a sheet in the studio's language. Nothing fires while typing.
 *
 * A) the code, on both surfaces   B) the app driven for real: recent, draft, keyboard
 * C) What's New   D) release pins
 * Usage: PORT=8931 node test/verify_retouch_workflow_6140.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const WN = require("./lib/whats-new.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const count = (s, t) => s.split(t).length - 1;
const APP = read("docs/app/index.html");
const PANEL_HTML = read("panel/index.html");
const PANEL_CSS = read("panel/styles.css");
const SUITES = read("panel/js/hnk_studio_suites.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const VER = "6.150.0", PVER = "6.221.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.140.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 292;
const PORT = Number(process.env.PORT || 8931);
const BASE = "http://127.0.0.1:" + PORT;
const PHOTO = fs.readFileSync(path.join(ROOT, "tools", "art_ref", "hnk-model.jpg")).toString("base64");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

let failures = 0;
function report(name, ok, detail) {
  if (ok) { console.log("PASS " + name); return; }
  failures++;
  console.log("FAIL " + name + (detail === undefined ? "" : "\n     " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
}
/* an L9 call in the shell that names all nine base languages */
function nineLang(src, lead) {
  const i = src.indexOf(lead); if (i < 0) return false;
  const seg = src.slice(i, src.indexOf("})", i) + 2);
  return LANGS.every((c) => new RegExp("[{,]" + c + ':"').test(seg));
}

/* ===================== A) the code ===================== */

function partA() {
  report("A1) recent controls: ST.ui carries the list, the stage-preference loader and saver round-trip it, and every slider drag records its id",
    has(APP, 'ui:{mode:"auto",pipCorner:"tr",zoom:{s:1,x:0,y:0},recent:[]}') &&
    has(APP, "if(Array.isArray(u.recent)) ST.ui.recent=u.recent.filter(function(x){ return typeof x===\"string\"&&x; }).slice(0,8);") &&
    has(APP, "u.recent=ST.ui.recent||[]; localStorage.setItem(ST_UI_LS,JSON.stringify(u));") &&
    has(APP, "function stRecentTouch(id){") && has(APP, "ST.ui.recent=r.slice(0,8);") &&
    has(APP, "    o.set(v);\n    stRecentTouch(o.id);   /* 6.140.0 */"));

  report("A2) the jump bar draws the row under the group strip on both surfaces, and a chip opens the group, scrolls the row into view and focuses it — switching suite page when it has to",
    has(APP, 'var recHost=$("stRecent");') && has(APP, "function stRecentGo(id){") && has(APP, "function stRecentRender(){") &&
    has(APP, "ST.recentRender=stRecentRender;") &&
    has(APP, 'if(curPage!==want){ switchPage(want); setTimeout(go,60); } else go();\n  }\n  function stRecentRender(){') &&
    has(APP, '<div class="chips" id="stRecent" style="display:none"></div>') &&
    has(PANEL_HTML, '<div class="chips" id="stRecent" style="display:none"></div>') &&
    has(PANEL_CSS, ".stpg #stRecent {") && has(PANEL_CSS, "\n#stRecent {") && has(APP, "#stRecent .chip{") &&
    /* the jump-bar diet (deep-scrolled, keyboard-open, landscape PiP) keeps one chip row of at most 50px: Recent waits for the full bar */
    has(APP, "#pgStudio.stcompact #stRecent,#pgMeitu.stcompact #stRecent,#pgEvoto.stcompact #stRecent{display:none!important}"));

  report("A3) the lifted studio module carries the recent list and none of the app-only parts: no IndexedDB draft, no keyboard sheet, no stLoadImage",
    has(SUITES, "function stRecentTouch(id){") && has(SUITES, "function stRecentRender(){") && has(SUITES, "function stRecentGo(id){") &&
    has(SUITES, "stRecentTouch(o.id);") && has(SUITES, 'ST.draftOffer') && has(SUITES, 'ST.draftClear') &&
    !has(SUITES, "stDraftOffer") && !has(SUITES, "kvGet(") && !has(SUITES, "stKeysSheet") && !has(SUITES, "function stLoadImage("),
    { touch: has(SUITES, "function stRecentTouch(id){"), draft: has(SUITES, "stDraftOffer"), kv: has(SUITES, "kvGet(") });

  report("A4) the draft: one IndexedDB record written as the photo loads (with a 144px tile), offered by both empty pickers through ST hooks the panel never sets, dropped by Discard and by taking the photo off",
    has(APP, 'var ST_DRAFT_KEY="hnk_st_draft_v1";') && has(APP, "function stDraftSave(img,bitmap){") &&
    has(APP, 'th=c.toDataURL("image/jpeg",0.8);') &&
    has(APP, "    stDraftSave(state.st.img,img);   /* 6.140.0") &&
    has(APP, "ST.draftOffer=stDraftOffer; ST.draftClear=stDraftClear;") &&
    has(APP, "  if(!ref && ST.draftOffer) ST.draftOffer(host);") &&
    has(APP, "  if(!ref && ST && ST.draftOffer) ST.draftOffer(host);") &&
    count(APP, "stDropFull(); if(ST&&ST.draftClear) ST.draftClear(); renderRefs(); };") === 2 &&
    has(APP, 'try{ if(!state.refs[0]) stDraftOffer($("rsPicker")); }catch(e){}') &&
    has(APP, 'var cards=document.querySelectorAll(".st-draft"); for(var i=0;i<cards.length;i++) cards[i].parentNode.removeChild(cards[i]);'));

  report("A5) the keyboard: Space peeks (and leaves a focused button alone), [ ] step the loupe, 0 and 1 are fit and 100%, F E L frame, S splits, P pins, ? draws the sheet, and typing is never intercepted",
    has(APP, 'if(ev.key===" "){ if(/^(BUTTON|A|SUMMARY|INPUT)$/.test(tagN)) return; ev.preventDefault(); if(!ev.repeat && ST.holdDown) ST.holdDown(); }') &&
    has(APP, 'if(tn==="INPUT") return !/^(range|checkbox|radio|button)$/.test(t.type||"text");') &&
    has(APP, 'else if(ev.key==="]"||ev.key==="["){ ev.preventDefault(); if(ST.zoomTo) ST.zoomTo((ST.ui.zoom.s||1)*(ev.key==="]"?1.15:0.87)); }') &&
    has(APP, 'else if(ev.key==="0"){ ev.preventDefault(); var z0=$("stZpFit"); if(z0) z0.click(); }') &&
    has(APP, 'else if(ev.key==="1"){ ev.preventDefault(); var z1=$("stZp100"); if(z1) z1.click(); }') &&
    has(APP, 'var zf=$("stZpFace"); if(zf&&zf.offsetParent)') && has(APP, 'var ze=$("stZpEyes"); if(ze&&ze.offsetParent)') && has(APP, 'var zl=$("stZpLips"); if(zl&&zl.offsetParent)') &&
    has(APP, 'else if(ev.key==="s"||ev.key==="S"){ ev.preventDefault(); var sp=$("stSplit"); if(sp) sp.click(); }') &&
    has(APP, 'else if(ev.key==="p"||ev.key==="P"){ ev.preventDefault(); var pn=$("stPin"); if(pn) pn.click(); }') &&
    has(APP, 'else if(ev.key==="?"){ ev.preventDefault(); stKeysSheet(); }') &&
    has(APP, 'if((ev.key==="b"||ev.key==="B"||ev.key===" ") && ST.holdUp) ST.holdUp();') &&
    has(APP, "window.stKeysSheet=function(){") && has(APP, 'ktg.id="stKeysTgl"') &&
    has(APP, "@media (pointer:coarse){ #stKeysTgl{display:none} }") &&
    has(APP, "    if(!ST_SUITE_PAGE[curPage]||typing(ev)) return;"));

  report("A6) the new words are written in all nine base languages: the Recent label, the draft card, its two buttons, the sheet's title and every one of its rows",
    nineLang(APP, 'el("span","st-recent-lb",L9({my:"မကြာသေးမီ",en:"Recent"') &&
    nineLang(APP, 'L9({my:"နောက်ဆုံး ပြင်ခဲ့တဲ့ပုံ ဆက်ပြင်မလား?"') &&
    nineLang(APP, 'L9({my:"ဆက်ပြင်မယ်",en:"Continue"') && nineLang(APP, 'L9({my:"ဖယ်လိုက်မယ်",en:"Discard"') &&
    nineLang(APP, 'L9({my:"ကီးဘုတ် — Retouch"') && nineLang(APP, 'L9({my:"ဖိထားရင် မူရင်း ပြ"') &&
    nineLang(APP, 'L9({my:"ချုံ့ · ချဲ့"') && nineLang(APP, 'L9({my:"ပုံအပြည့် · 100%"') &&
    nineLang(APP, 'L9({my:"မျက်နှာ · မျက်လုံး · နှုတ်ခမ်း ချဲ့"') && nineLang(APP, 'L9({my:"A|B ခွဲကြည့်"') &&
    nineLang(APP, 'L9({my:"မှတ်ထား (pin)"') && nineLang(APP, 'L9({my:"နောက်ပြန် · ရှေ့ပြန်"') &&
    nineLang(APP, 'L9({my:"ဒီစာရင်း ပြ/ဖျောက်"') && nineLang(APP, 'L9({my:"ကီးဘုတ် shortcut စာရင်း"'));
}

/* ===================== B) the app, driven ===================== */

async function partB(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  const open = async () => {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} switchPage("pgMeitu"); });
    await page.waitForTimeout(700);
  };
  const load = async () => {
    await page.evaluate(async (b64) => { await new Promise((res) => { stLoadImage("data:image/jpeg;base64," + b64, { done: res }); }); }, PHOTO);
    await page.waitForTimeout(1400); /* the record is written 800 ms after the load settles */
  };
  await open();

  /* ---- recent ---- */
  const b1 = await page.evaluate(() => {
    const drag = (inp) => { inp.value = String(parseInt(inp.max, 10)); inp.dispatchEvent(new Event("input", { bubbles: true })); return inp.id; };
    const mu = [...document.querySelectorAll("#muHost .grp input.rng")].slice(0, 9).map(drag);   /* nine on Retouch A … */
    const ev = drag(document.querySelector("#evHost input.rng, #stDock #evHost input.rng, #stDock input.rng")); /* … and one on Retouch B */
    const rec = document.getElementById("stRecent");
    const ls = JSON.parse(localStorage.getItem("hnk_st_ui") || "{}");
    return {
      before: document.getElementById("stRecent").style.display, recent: ST.ui.recent.slice(), ls: ls.recent, mu: mu, ev: ev,
      chips: [...rec.querySelectorAll(".chip")].map((c) => ({ id: c.getAttribute("data-for"), text: c.textContent, title: c.title })),
      label: rec.querySelector(".st-recent-lb") && rec.querySelector(".st-recent-lb").textContent, visible: rec.style.display === "" && rec.offsetParent !== null
    };
  });
  const expected = [b1.ev].concat(b1.mu.slice().reverse()).slice(0, 8);
  report("B1) ten drags leave eight recent controls, newest first and deduplicated, saved with the stage preferences, drawn as chips that carry the control's label and its group",
    b1.recent.length === 8 && b1.recent.join() === expected.join() && (b1.ls || []).join() === b1.recent.join() &&
    b1.visible && b1.label === "မကြာသေးမီ" && b1.chips.length === 8 && b1.chips.every((c, i) => c.id === b1.recent[i] && c.text.length > 0 && c.title.length > 0),
    { recent: b1.recent, expected: expected, chips: b1.chips.slice(0, 3), label: b1.label, visible: b1.visible });

  const b2 = await page.evaluate(async () => {
    const id = ST.ui.recent[0]; /* the Retouch B control, from Retouch A's page */
    const from = curPage;
    document.querySelector('#stRecent .chip[data-for="' + id + '"]').click();
    await new Promise((r) => setTimeout(r, 350));
    const inp = document.getElementById(id); let g = inp; while (g && !(g.classList && g.classList.contains("grp"))) g = g.parentNode;
    return { from: from, page: curPage, open: g && g.className, focused: document.activeElement === inp, flashed: !!inp.parentNode.className.match(/st-flash/) || !!document.querySelector(".st-ctl.st-flash") };
  });
  report("B2) a chip for a control on the other suite switches the page, opens its group, flashes the row and puts the focus on the slider",
    b2.from === "pgMeitu" && b2.page === "pgEvoto" && b2.open === "grp open" && b2.focused && b2.flashed, b2);

  await open();
  const b3 = await page.evaluate(() => ({ recent: ST.ui.recent.length, chips: document.querySelectorAll("#stRecent .chip").length, shown: document.getElementById("stRecent").style.display === "" }));
  report("B3) after a reload the list is back from the stage preferences and the row is drawn before anything is touched", b3.recent === 8 && b3.chips === 8 && b3.shown, b3);

  /* ---- draft ---- */
  const b4a = await page.evaluate(async () => ({ kv: await kvGet("hnk_st_draft_v1"), cards: document.querySelectorAll(".st-draft").length }));
  await load();
  const b4 = await page.evaluate(async (b64) => { const d = await kvGet("hnk_st_draft_v1"); return { has: !!d, same: !!d && d.b64 === b64, w: d && d.w, h: d && d.h, th: !!d && /^data:image\/jpeg;base64,/.test(d.th) && d.th.length < 20000, ts: !!d && Date.now() - d.ts < 60000, ref: !!state.refs[0] }; }, PHOTO);
  report("B4) a fresh profile holds no draft and shows no card; loading a photo writes one record — the bytes, the size, a small tile and the time",
    !b4a.kv && b4a.cards === 0 && b4.has && b4.same && b4.w === 520 && b4.h === 600 && b4.th && b4.ts && b4.ref, { before: b4a, after: b4 });

  await open();
  const b5 = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      st: !!q("#stPicker .st-draft"), rs: !!q("#rsPicker .st-draft"), ids: document.querySelectorAll("#stDraftCard").length,
      title: q("#stPicker .st-draft b") && q("#stPicker .st-draft b").textContent,
      meta: q("#stPicker .st-draft .mut") && q("#stPicker .st-draft .mut").textContent,
      tile: q("#stPicker .st-draft img") && q("#stPicker .st-draft img").src.slice(0, 23),
      go: !!q("#stPicker .st-draft .st-draft-go"), drop: !!q("#stPicker .st-draft .st-draft-drop"), ref: !!state.refs[0], stage: document.getElementById("stStage").style.display
    };
  });
  report("B5) after the reload the stage is empty and both empty pickers — Retouch A/B's and V2's, which share the slot — offer the last photo back with its tile, the time and the size",
    b5.st && b5.rs && b5.ids === 1 && b5.title === "နောက်ဆုံး ပြင်ခဲ့တဲ့ပုံ ဆက်ပြင်မလား?" && /^\d\d\/\d\d \d\d:\d\d · 520×600$/.test(b5.meta || "") &&
    b5.tile === "data:image/jpeg;base64," && b5.go && b5.drop && !b5.ref && b5.stage === "none", b5);

  await page.click("#stPicker .st-draft .st-draft-go");
  await page.waitForTimeout(1300);
  const b6 = await page.evaluate(() => ({ ref: !!state.refs[0], w: ST.srcW, h: ST.srcH, stage: document.getElementById("stStage").style.display, cards: document.querySelectorAll(".st-draft").length, filled: !!document.querySelector("#stPicker .ref.filled") }));
  report("B6) Continue puts the photo back on the stage — the same 520×600 — and both cards go", b6.ref && b6.w === 520 && b6.h === 600 && b6.stage === "" && b6.cards === 0 && b6.filled, b6);

  await page.evaluate(() => document.querySelector("#stPicker .ref.filled .x").click());
  await page.waitForTimeout(700);
  const b7 = await page.evaluate(async () => ({ kv: !!(await kvGet("hnk_st_draft_v1")), ref: !!state.refs[0], cards: document.querySelectorAll(".st-draft").length }));
  report("B7) taking the photo off the stage is a decision: the draft goes with it and the empty picker offers nothing", !b7.kv && !b7.ref && b7.cards === 0, b7);

  await load();
  await open();
  const b8a = await page.evaluate(() => document.querySelectorAll(".st-draft").length);
  await page.click("#stPicker .st-draft .st-draft-drop");
  await page.waitForTimeout(600);
  const b8 = await page.evaluate(async () => ({ kv: !!(await kvGet("hnk_st_draft_v1")), cards: document.querySelectorAll(".st-draft").length, ref: !!state.refs[0] }));
  report("B8) Discard drops the record and every card, on both pickers", b8a === 2 && !b8.kv && b8.cards === 0 && !b8.ref, { offered: b8a, after: b8 });

  /* ---- keyboard ---- */
  const b9a = await page.evaluate(() => {
    const kd = (k, t) => (t || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const s0 = ST.ui.zoom.s; kd("]"); const noPhoto = ST.ui.zoom.s === s0;
    kd("?"); const sheet = !!document.getElementById("stKeysSheet");
    kd("?"); const toggled = !document.getElementById("stKeysSheet");
    return { noPhoto: noPhoto, sheet: sheet, toggled: toggled };
  });
  await load();
  const b9 = await page.evaluate(() => {
    const out = {};
    const kd = (k, t) => (t || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const ku = (k) => document.body.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
    const s0 = ST.ui.zoom.s; kd("]"); out.zoomIn = ST.ui.zoom.s > s0; /* clamped at maxS(), which for a 520px photo is close to 100% — the step is still a step */
    kd("["); kd("["); out.zoomOut = ST.ui.zoom.s < s0 + 0.001;
    kd("1"); out.z100 = ST.ui.zoom.s; kd("0"); out.fit = ST.ui.zoom.s;
    kd(" "); out.holding = !!ST.holding; ku(" "); out.released = !ST.holding;
    kd("?"); out.sheet = !!document.getElementById("stKeysSheet"); out.rows = document.querySelectorAll("#stKeysSheet .st-keys-row").length;
    out.keys = [...document.querySelectorAll("#stKeysSheet kbd")].map((k) => k.textContent);
    out.title = document.querySelector("#stKeysSheet .st-keys-h") && document.querySelector("#stKeysSheet .st-keys-h").textContent;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); out.sheetGone = !document.getElementById("stKeysSheet");
    const sp = document.getElementById("stSplit"); const before = sp.className; kd("S"); out.split = sp.className !== before; kd("S"); out.splitBack = sp.className === before;
    const inp = document.getElementById("stSearch"); const s1 = ST.ui.zoom.s; kd("]", inp); kd("?", inp); out.typingIgnored = ST.ui.zoom.s === s1 && !document.getElementById("stKeysSheet");
    const btn = document.getElementById("stZpFit"); kd(" ", btn); out.spaceOnButton = !ST.holding;
    /* a slider that was just dragged keeps the focus; the keyboard must not die there */
    const rng = document.querySelector("#muHost input.rng"); kd("0"); kd("]", rng); out.rangeKeepsKeys = ST.ui.zoom.s > 1; kd("0");
    out.chip = !!document.getElementById("stKeysTgl"); document.getElementById("stKeysTgl").click(); out.chipOpens = !!document.getElementById("stKeysSheet");
    document.getElementById("stKeysSheet").click(); out.tapCloses = !document.getElementById("stKeysSheet");
    return out;
  });
  report("B9) with a photo on the stage ] and [ step the loupe, 1 is 100% and 0 fits, Space peeks and releases, S splits and unsplits, ? draws the nine-row sheet and Esc or a tap closes it; without a photo only ? answers; typing into the search field and Space on a focused button are left alone, and a focused slider keeps the keyboard alive",
    b9a.noPhoto && b9a.sheet && b9a.toggled &&
    b9.zoomIn && b9.zoomOut && b9.z100 !== b9.fit && b9.fit === 1 && b9.holding && b9.released &&
    b9.sheet && b9.rows === 9 && b9.keys.join("|") === "Space · B|[ · ]|0 · 1|F · E · L|S|P|Ctrl+Z · Ctrl+Y|Ctrl+Enter|?" && b9.title === "ကီးဘုတ် — Retouch" &&
    b9.sheetGone && b9.split && b9.splitBack && b9.typingIgnored && b9.spaceOnButton && b9.rangeKeepsKeys && b9.chip && b9.chipOpens && b9.tapCloses,
    { noPhoto: b9a, withPhoto: b9 });

  report("B10) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ===================== C) What's New ===================== */

function partC() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgMeitu");
  report("C1) What's New carries the " + WAVE_V + " row for Retouch A, in nine languages, without the warning glyph the panel lifter drops, and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && !/\u26a0/.test(JSON.stringify(row)) &&
    WN.appRow(WAVE_V, "pgMeitu") === WN.panelRow(WAVE_V, "pgMeitu") && WN.appRow(WAVE_V, "pgMeitu").length > 200,
    { row: !!row, langs: row ? LANGS.filter((c) => !(row.t[c] && row.s[c])) : null });
}

/* ===================== D) release pins ===================== */

function partD() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("D1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the boot check it follows",
    steps === COUNT && has(CI, "node test/verify_retouch_workflow_6140.js") &&
    CI.indexOf("verify_retouch_workflow_6140.js") > CI.indexOf("verify_boot_cost_6139.js"), { steps: steps });
  report("D2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(read("panel/main.js"), 'const PANEL_VERSION = "' + PVER + '";') &&
    has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') &&
    has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("D3) the landing counts " + COUNT + " tests",
    has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING));
}

/* ===================== run ===================== */

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
})();
