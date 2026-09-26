/* 6.111.0 / panel 6.182.0 — THE OPTIONAL IMAGE SLOT THE PANEL NEVER REFRESHED.
 *
 * WHY THIS FILE EXISTS. The owner photographed a Smart Workflow card in
 * Photoshop and asked two questions about its second image slot: "ဒါခေါ်မရဘူး"
 * — this one cannot be called up — and "ဘာလို့နှစ်ခုဖြစ်နေတာလဲ" — why are there
 * two of them. Both were true, and both came from one line.
 *
 * workflow-tools-screen's inputRow() builds a tile with two faces: the picture
 * frame (with its ✕) for a slot that has a photograph, and a dashed "+ Layer"
 * frame for a slot that is waiting. It built them BOTH showing and left it to
 * refresh() to hide the wrong one. And refresh() walked state.requiredInputs
 * only — while inputRow() is called for state.optionalInputs as well. So an
 * optional slot kept, for the whole life of the card, exactly the state it was
 * built in: the placeholder picture frame (a black box, because the <img>
 * carries a one-pixel transparent GIF), its ✕, AND the dashed frame, side by
 * side; a mark frozen on "Missing" that no photograph could turn into a tick;
 * and a black box that answers no tap, because it is an <img>.
 *
 * 26 of the shipped catalog's workflows carry an optional slot. Every one of
 * them read this way from 6.109.0 — the release that first put a waiting tile
 * on screen — until this one.
 *
 * The fix is two-sided on purpose. refresh() now walks both lists, so the slot
 * is kept current; and the tile is BUILT in its waiting state, so a tile is
 * correct before any refresh runs and cannot be caught out by one that never
 * comes. Either alone would close the owner's photograph; both together make
 * the class of defect unreachable, and D1/D2 below prove each is load-bearing
 * by removing it and watching the walk fail.
 *
 * Usage: node test/verify_wf_optional_slot.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const SCREEN = path.join(PANEL, "src", "ui", "screens", "workflow-tools-screen.js");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail == null ? "" : detail).slice(0, 700)));
  if (!ok) failures++;
}

const SRC = fs.readFileSync(SCREEN, "utf8");
const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const CSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

/* the workflows the panel really ships that carry an OPTIONAL image slot */
function catalogOptional() {
  const src = fs.readFileSync(path.join(PANEL, "js", "hnk_wf_catalog_data.js"), "utf8");
  const cat = JSON.parse(src.match(/var CATALOG = ({[\s\S]*?});\n/)[1]);
  const out = [];
  cat.categories.forEach(c => c.items.forEach(w => {
    if ((w.opt || []).length) out.push({ id: w.id, req: (w.req || []).length, opt: w.opt.length });
  }));
  return out;
}

/* ---------------------------------------------------------------- A: the source */

/* A1 — the walk covers both lists. The defect was one missing concat. */
report("A1) refresh() walks the optional inputs as well as the required ones",
  /\(state\.requiredInputs \|\| \[\]\)\s*\.concat\(state\.optionalInputs \|\| \[\]\)\.forEach/.test(SRC),
  "no required++optional forEach in refresh()");

/* A2 — and it knows which kind it is looking at, because an empty optional
   slot must not claim a photograph is owed. */
report("A2) the walk knows an optional slot from a required one",
  /var isOpt = \(state\.optionalInputs \|\| \[\]\)\.indexOf\(inp\) >= 0;/.test(SRC), "no isOpt");

/* A3 — the tile is born waiting: both picture faces hidden at build time. */
const build = SRC.slice(SRC.indexOf('id: "hnkWfThumb_" + inp.key'), SRC.indexOf('nodes["empty_" + inp.key] = empty;'));
report("A3) the tile is BUILT with its picture frame and ✕ hidden, not corrected afterwards",
  /thumbImg\.style\.display = "none";/.test(build) && /clear\.style\.display = "none";/.test(build),
  build.slice(0, 200));

/* A4 — the empty optional slot says the optional word, the app's own. */
report("A4) an empty optional slot reads the optional word, never \"Missing\"",
  /isOpt \? dom\.t\("ai_optional"/.test(SRC) && /: dom\.t\("ai_missing"/.test(SRC),
  "mark line still unconditional");

/* A5 — and the word exists in every one of the panel's nine dictionaries. */
const dictCount = (MAIN.match(/^\s*ai_optional:/gm) || []).length;
report("A5) ai_optional is in all nine panel dictionaries", dictCount === 9, "found " + dictCount);

/* A6 — the mark has a class of its own, so an optional slot is not painted
   with the required slot's warning colour. */
report("A6) the optional mark has its own style", /\.hnk-req-mark\.opt\b/.test(CSS), "no .hnk-req-mark.opt");

/* ---------------------------------------------------------------- B: the blast radius */

const OPTIONAL = catalogOptional();
report("B1) the shipped catalog really does carry optional image slots (this is what the walk below covers)",
  OPTIONAL.length >= 20, OPTIONAL.length + " workflows");
console.log("      (" + OPTIONAL.length + " catalog workflows carry an optional slot — every one of them read"
  + " as two boxes before this release)");

/* ---------------------------------------------------------------- C + D: the panel itself */

function serve(patch) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    let body = fs.readFileSync(abs);
    if (patch && abs === SCREEN) body = Buffer.from(patch(body.toString("utf8")), "utf8");
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(body);
  });
  return server;
}

/* one visible face per slot is the whole rule: a waiting slot shows its dashed
   frame and nothing else; a filled slot shows its photograph and its ✕ and
   nothing else. "Two boxes" is this rule broken. */
const FACES = `(function(k){
  var thumb = document.getElementById("hnkWfThumb_" + k);
  if (!thumb) return null;
  var img = thumb.querySelector("img");
  var clr = document.getElementById("hnkWfClear_" + k);
  var emp = document.getElementById("hnkWfEmpty_" + k);
  function vis(e){ if (!e) return false; var r = e.getBoundingClientRect();
    return getComputedStyle(e).display !== "none" && r.width > 8 && r.height > 8; }
  var m = document.getElementById("hnkWfAdd_" + k);
  var row = m && m.closest ? m.closest(".hnk-req-block") : null;
  var mk = row ? row.querySelector(".hnk-req-mark") : null;
  return { picture: vis(img), clearX: vis(clr), frame: vis(emp),
           mark: mk ? mk.textContent.trim() : "", markCls: mk ? String(mk.className) : "" };
})`;

async function walk(page, id) {
  return page.evaluate(async ([wid, facesSrc]) => {
    const faces = eval(facesSrc);
    const card = document.getElementById("hnkWf_" + wid);
    if (!card) return { err: "no card " + wid };
    card.click();
    await new Promise(r => setTimeout(r, 120));
    const keys = [...document.querySelectorAll("[id^='hnkWfAdd_']")].map(b => b.id.replace("hnkWfAdd_", ""));
    const out = {};
    keys.forEach(k => out[k] = faces(k));
    return { keys, slots: out };
  }, [id, FACES]);
}

async function boot(browser, port) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.route("**/*", r => {
    if (r.request().url().indexOf("127.0.0.1") >= 0) return r.continue();
    if (r.request().resourceType() === "image")
      return r.fulfill({ status: 200, contentType: "image/gif",
        body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64") });
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(UXP_STUB);
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => {
    try { const d = window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash(); return !!(d && d.name); }
    catch (e) { return false; }
  }, null, { timeout: 20000 });
  await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
  await page.waitForTimeout(900);
  return { page, errs };
}

(async () => {
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch();
  const server = serve(null);
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const { page, errs } = await boot(browser, port);

    /* C1 — the owner's own card, both slots, one box each. */
    const bg = await walk(page, "bg-replace");
    const two = Object.keys(bg.slots || {}).filter(k => {
      const s = bg.slots[k];
      return !s || s.picture || s.clearX || !s.frame;
    });
    report("C1) Background Replace draws ONE box per slot — the dashed frame, no black picture box, no ✕",
      !bg.err && Object.keys(bg.slots).length === 2 && two.length === 0,
      bg.err || JSON.stringify(bg.slots));

    /* C2 — and the optional slot says what it is. */
    const optWord = await page.evaluate(() => {
      const a = window.HNK.aiToolsApp.workflowScreen();
      const st = a.getState();
      return { key: (st.optionalInputs[0] || {}).key || "", opt: (st.optionalInputs || []).length };
    });
    const bgMark = (bg.slots[optWord.key] || {}).mark || "";
    const bgCls = (bg.slots[optWord.key] || {}).markCls || "";
    report("C2) the optional slot reads \"Optional\", not \"Missing\", and wears its own mark class",
      !!optWord.key && bgMark.length > 0 && !/Missing|မရှိသေး/.test(bgMark)
        && /\bopt\b/.test(bgCls),
      "key=" + optWord.key + " mark=" + JSON.stringify(bgMark) + " cls=" + bgCls);

    /* C3 — a photograph really lands on the OPTIONAL slot and is SEEN. This is
       the half the owner could not reach at all: the picture was stored (the
       state module has always walked both lists) and never drawn. */
    const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const filled = await page.evaluate(async ([k, ref, facesSrc]) => {
      const faces = eval(facesSrc);
      const a = window.HNK.aiToolsApp.workflowScreen();
      const st = a.getState();
      const g = globalThis.HNK.workflowState || null;
      if (g && g.setInput) g.setInput(st, k, { source: "file", role: "background", ref: ref, valid: true });
      else (st.optionalInputs || []).forEach(i => { if (i.key === k) i.image = { source: "file", role: i.role, ref: ref, valid: true }; });
      a.refresh();
      await new Promise(r => setTimeout(r, 120));
      return faces(k);
    }, [optWord.key, PX, FACES]);
    report("C3) a photograph on the optional slot is shown — picture and ✕ on, dashed frame off, mark ticked",
      !!filled && filled.picture && filled.clearX && !filled.frame && /✓/.test(filled.mark),
      JSON.stringify(filled));

    /* C4 — and ✕ puts it back to one waiting box. */
    const cleared = await page.evaluate(async ([k, facesSrc]) => {
      const faces = eval(facesSrc);
      const b = document.getElementById("hnkWfClear_" + k);
      if (b) b.click();
      await new Promise(r => setTimeout(r, 160));
      return faces(k);
    }, [optWord.key, FACES]);
    report("C4) ✕ on the optional slot gives the waiting frame back, alone",
      !!cleared && !cleared.picture && !cleared.clearX && cleared.frame, JSON.stringify(cleared));

    /* C5 — every catalog workflow that has an optional slot, not just the one
       the owner happened to open. C1–C4 left Background Replace open, and the
       screen's own back button is the only thing that returns the card list. */
    await page.evaluate(() => { const b = document.getElementById("hnkWfBack"); if (b) b.click(); });
    await page.waitForFunction(() => document.querySelectorAll(".wfmini").length > 10, null, { timeout: 8000 })
      .catch(() => { });
    const bad = [];
    let cards = 0, slots = 0;
    for (const w of OPTIONAL) {
      const g = await walk(page, w.id);
      if (g.err) { bad.push(w.id + ": " + g.err); }
      else {
        cards++;
        Object.keys(g.slots).forEach(k => {
          slots++;
          const s = g.slots[k];
          if (!s) { bad.push(w.id + "/" + k + ": no tile"); return; }
          if (s.picture || s.clearX) bad.push(w.id + "/" + k + ": picture box on an empty slot");
          else if (!s.frame) bad.push(w.id + "/" + k + ": no waiting frame");
        });
      }
      await page.evaluate(() => { const b = document.getElementById("hnkWfBack"); if (b) b.click(); });
      await page.waitForFunction(() => document.querySelectorAll(".wfmini").length > 10, null, { timeout: 8000 })
        .catch(() => { });
    }
    report("C5) every catalog workflow with an optional slot draws one box per slot",
      bad.length === 0, bad.slice(0, 8).join(" | "));
    console.log("      (" + cards + " cards opened, " + slots + " slots inspected)");

    report("C6) the walk raised no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
    await page.close();
  } finally { server.close(); }

  /* ------------------------------------------------------ D: fault injection */

  const DROP_CONCAT = src => src.replace(
    /\(state\.requiredInputs \|\| \[\]\)\s*\.concat\(state\.optionalInputs \|\| \[\]\)\.forEach/,
    "(state.requiredInputs || []).forEach");
  const DROP_BUILD_EMPTY = src => src.replace(
    /thumbImg\.style\.display = "none";\n\s*clear\.style\.display = "none";\n/, "");

  async function faulted(name, patch, probe, check) {
    const s = serve(patch);
    await new Promise(r => s.listen(0, "127.0.0.1", r));
    const p = s.address().port;
    try {
      const { page } = await boot(browser, p);
      const got = await probe(page);
      await page.close();
      report(name, check(got), JSON.stringify(got));
    } finally { s.close(); }
  }

  const openOnly = page => walk(page, "bg-replace").then(r => r.slots || r);

  /* The two halves of the fix answer the owner's two questions, and they answer
     DIFFERENT ones — which is why each is injected on its own here rather than
     both together.

     D1 — the refresh walk is what makes an optional slot USABLE. Take the concat
     away (leaving the empty-built tile in place) and the card opens looking
     right, but a photograph put into the slot is stored and never drawn and the
     mark never leaves "Missing": the owner's "ဒါခေါ်မရဘူး", this slot cannot be
     called up. */
  await faulted("D1) without the optional walk, a photograph on the optional slot is stored but never shown (the walk is load-bearing)",
    DROP_CONCAT,
    async page => {
      await walk(page, "bg-replace");
      const PX2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      return page.evaluate(async ([ref, facesSrc]) => {
        const faces = eval(facesSrc);
        const a = window.HNK.aiToolsApp.workflowScreen();
        const st = a.getState();
        const k = (st.optionalInputs[0] || {}).key || "";
        (st.optionalInputs || []).forEach(i => { if (i.key === k) i.image = { source: "file", role: i.role, ref: ref, valid: true }; });
        a.refresh();
        await new Promise(r => setTimeout(r, 120));
        return faces(k);
      }, [PX2, FACES]);
    },
    f => !!f && !f.picture && !f.clearX && f.frame && /Missing|\u1019\u101b\u103e\u102d\u101e\u1031\u1038/.test(f.mark));

  /* D2 — and the empty-built tile is what stops the SYMPTOM the owner
     photographed. Remove both and the card opens exactly as it did in the
     photograph: the picture frame, its ✕ and the dashed frame all at once. */
  await faulted("D2) without both halves, the optional slot opens as two boxes — the owner's photograph, reproduced",
    src => DROP_BUILD_EMPTY(DROP_CONCAT(src)),
    openOnly,
    st => Object.keys(st).some(x => st[x] && st[x].picture && st[x].frame));

  /* D3 — and with ONLY the empty build removed, the walk repairs the tile on the
     render's own closing refresh(). It is written down here rather than left to
     be discovered: the belt holds when the braces are cut, which is the point of
     having both. */
  await faulted("D3) with the walk in place, an unrefreshed build state is repaired before the card is seen",
    DROP_BUILD_EMPTY,
    openOnly,
    st => Object.keys(st).length === 2 && Object.keys(st).every(x => st[x] && !st[x].picture && !st[x].clearX && st[x].frame));

  await browser.close();

  /* ------------------------------------------------------ E: the release */
  const man = JSON.parse(fs.readFileSync(path.join(PANEL, "release-manifest.json"), "utf8"));
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "app", "version.json"), "utf8"));
  report("E1) the web app is 6.133.0", ver.v === "6.136.0", ver.v);
  report("E2) the panel is 6.204.0", String(man.version) === "6.207.0", man.version);

  console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILED");
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
