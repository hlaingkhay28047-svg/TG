/* 6.143.0 / panel 6.214.0 — PORTRAIT STYLE, THE OCCASION SETS: the studio's own reference photographs.
 *
 * THE VIDEO AGAIN. The studio in the owner's video does not send the customer to a template list — it keeps
 * a stack of its own reference photographs for the occasions people come in for (a birthday set with blue
 * balloons, a graduation gown, a bridal look) and the customer picks from those. 6.142.0 shipped the page
 * with the customer's own reference and the Imagine tools' template art; this wave gives the page what the
 * studio has: 42 reference photographs of its own, seven occasions of six looks, every one made on the
 * brand model (tools/art_ref/hnk-model.jpg — a synthetic character, never a real person's likeness) through
 * the masked-key art lane (tools/pstyle_art_jobs.json), finished to 630×945 and shipped IDENTICAL on both
 * surfaces (docs/app/lib/wf/pstyle/th → panel/icons/pstyle/th, copied by the lifter).
 *
 * THE PAGE. Step 02 of Edit ▸ Style now draws two rows of groups: the occasions (birthday · graduation ·
 * wedding · Myanmar traditional · family & maternity · corporate & ID · festive & seasonal — the studio's
 * own sets) above the building blocks (the six Imagine groups). The page opens on the birthday set. A set
 * carries its own description into the prompt as the REFERENCE DESCRIPTION, like a template look.
 *
 * A) the tables, the art on both surfaces, the jobs file, the module and the lift   B) the web app: the two
 * rows, the birthday grid, every picture served at 630×945, a pick, the prompt, the other groups, the words
 * in English   C) the panel: the same rows, the same pictures from icons/pstyle/th   D) What's New   E) pins
 * Usage: PORT=8931 node test/verify_pstyle_sets_6143.js   (serve docs/app first) */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");
const WN = require("./lib/whats-new.js");
const lifter = require("../tools/build_panel_pstyle.js");
const A = require("../tools/lib/app-data.js");

const PORT = Number(process.env.PORT || 8931);
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const has = (s, t) => s.indexOf(t) >= 0;
const APP = read("docs/app/index.html");
const MAIN = read("panel/main.js");
const PANEL_JS = read("panel/js/hnk_pstyle.js");
const PANEL_CSS = read("panel/styles.css");
const LIFTER = read("tools/build_panel_pstyle.js");
const LANDING = read("docs/index.html");
const CI = read(".github/workflows/test.yml");
const JOBS = JSON.parse(read("tools/pstyle_art_jobs.json"));
const VER = "6.143.0", PVER = "6.214.0";   /* the tree's current release, for the lockstep pin */
const WAVE_V = "6.143.0";                  /* this wave's own release, for its own What's New row */
const COUNT = 285;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
const all9 = (o) => !!o && LANGS.every((l) => typeof o[l] === "string" && o[l].trim().length > 0);
const OCC = ["birthday", "graduation", "wedding", "myanmar", "family", "corporate", "festive"];
const BLOCKS = ["scene", "outfit", "light", "hair", "tone", "id"];
const TH_APP = "docs/app/lib/wf/pstyle/th", TH_PANEL = "panel/icons/pstyle/th";
const PHOTO = fs.readFileSync(path.join(ROOT, "tools", "art_ref", "hnk-model.jpg")).toString("base64");
/* a card name as drawn: the full name, or its two-line ellipsis (the module's ellMark) — a prefix and the mark */
const nameOk = (shown, full) => shown === full || (/…$/.test(shown) && shown.length > 3 && full.indexOf(shown.slice(0, -1).trim()) === 0);

let failures = 0;
function report(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (extra === undefined || extra === null ? "" : " :: " + JSON.stringify(extra).slice(0, 700)));
  if (!ok) failures++;
}
/* the pixel size of a baseline or progressive JPEG, from its first SOF marker */
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/* ---------------- A) the source ---------------- */
function partA() {
  const D = A.readPstyle();
  const occ = D.groups.filter((g) => g.sets && g.sets.length), blocks = D.groups.filter((g) => !(g.sets && g.sets.length));
  const sets = [].concat(...occ.map((g) => g.sets.map((s) => ({ g: g.id, id: s.id, thumb: s.thumb, name: s.name, p: s.p }))));
  report("A1) the tables: the seven occasion groups come first (birthday · graduation · wedding · myanmar · family · corporate · festive), six sets each, 42 in all with unique ids, a name in all nine languages and a description for the prompt; the six building-block groups follow, still pointing at their Imagine tools; the two row labels speak nine languages",
    D.groups.slice(0, 7).map((g) => g.id).join() === OCC.join() && D.groups.slice(7).map((g) => g.id).join() === BLOCKS.join() &&
    occ.length === 7 && occ.every((g) => g.sets.length === 6 && all9(g.name) && !g.tool) && sets.length === 42 && new Set(sets.map((s) => s.g + ":" + s.id)).size === 42 &&
    sets.every((s) => all9(s.name) && typeof s.p === "string" && s.p.length >= 40 && /^[a-z]+-[A-Za-z0-9]+\.jpg$/.test(s.thumb) && s.thumb === s.g + "-" + s.id + ".jpg") &&
    blocks.every((g) => typeof g.tool === "string" && g.tool.length > 0) && all9(D.ui.occasions) && all9(D.ui.blocks) && D.ui.occasions.en === "Occasions" && D.ui.blocks.en === "Building blocks",
    { groups: D.groups.map((g) => g.id + (g.sets ? "(" + g.sets.length + ")" : "")), sets: sets.length });

  const appFiles = fs.existsSync(path.join(ROOT, TH_APP)) ? fs.readdirSync(path.join(ROOT, TH_APP)).sort() : [];
  const panelFiles = fs.existsSync(path.join(ROOT, TH_PANEL)) ? fs.readdirSync(path.join(ROOT, TH_PANEL)).sort() : [];
  const art = sets.map((s) => {
    const a = path.join(ROOT, TH_APP, s.thumb), b = path.join(ROOT, TH_PANEL, s.thumb);
    if (!fs.existsSync(a) || !fs.existsSync(b)) return { thumb: s.thumb, missing: true };
    const ba = fs.readFileSync(a), bb = fs.readFileSync(b), dim = jpegSize(ba);
    return { thumb: s.thumb, same: ba.equals(bb), w: dim && dim.w, h: dim && dim.h, bytes: ba.length };
  });
  report("A2) the art: all 42 pictures exist on both surfaces, byte for byte the same, real 630×945 JPEGs between 20 KB and 260 KB, and neither folder carries a stray file",
    art.every((x) => !x.missing && x.same && x.w === 630 && x.h === 945 && x.bytes >= 20000 && x.bytes <= 260000) &&
    appFiles.join() === sets.map((s) => s.thumb).sort().join() && panelFiles.join() === appFiles.join(),
    { bad: art.filter((x) => x.missing || !x.same || x.w !== 630 || x.h !== 945 || x.bytes < 20000 || x.bytes > 260000), files: appFiles.length, panelFiles: panelFiles.length });

  const names = JOBS.jobs.map((j) => j.name).sort(), want = sets.map((s) => "ps-" + s.g + "-" + s.id).sort();
  report("A3) the jobs file the art lane ran: one job per set with the same ids, every job on the brand model's reference photographs at 2:3 with the identity line first, and the note says so — never a real person's likeness",
    JOBS.jobs.length === 42 && names.join() === want.join() &&
    JOBS.jobs.every((j) => Array.isArray(j.refs) && j.refs.indexOf("tools/art_ref/hnk-model.jpg") >= 0 && j.refs.every((r) => fs.existsSync(path.join(ROOT, r))) && j.ratio === "2:3" && /^IDENTITY: the reference photos show ONE woman, the HNK model/.test(j.prompt)) &&
    has(JOBS.note, "brand model") && has(JOBS.note, "Never a real person's likeness") && has(JOBS.note, "630×945") && fs.existsSync(path.join(ROOT, "tools/art_ref/README.txt")),
    { jobs: JOBS.jobs.length, extra: names.filter((n) => want.indexOf(n) < 0), missing: want.filter((n) => names.indexOf(n) < 0) });

  const mod = lifter.between(APP, lifter.M0, lifter.M1, "module");
  const css = lifter.between(APP, lifter.C0, lifter.C1, "css");
  const SETS_LINE = 'if(g.sets && g.sets.length) return g.sets.map(function(s){ return { id:g.id+":"+s.id, name:H.t9(s.name), thumb:H.asset("pth", s.thumb), p:s.p||"" }; });';
  report("A4) the module: a group with its own sets draws them through the host's pth asset (the studio's folder on each surface), the page opens on birthday, step 02 draws the occasions row above the building-block row, and the panel's copy is today's lift with the same lines",
    has(mod, SETS_LINE) && has(mod, 'var S = { step:1, photo:null, ref:null, group:"birthday",') &&
    has(mod, '[["occasions", function(g){ return !!(g.sets && g.sets.length); }], ["blocks", function(g){ return !(g.sets && g.sets.length); }]].forEach(function(row){') &&
    has(mod, 'var lab=el("div","ps-h4", t(row[0])); w.appendChild(lab);') && has(mod, 'chips.setAttribute("data-row", row[0]);') &&
    has(APP, 'asset: function(kind, file){ return libArt(kind==="pth" ? "lib/wf/pstyle/th/"+file : (kind==="thumb" ? "lib/wf/imagine/th/" : "lib/wf/imagine/") + file); }') &&
    has(MAIN, 'asset: function (kind, file) { return kind === "pth" ? "icons/pstyle/th/" + file : (kind === "thumb" ? "icons/imagine/th/" : "icons/imagine/") + file; }') &&
    has(PANEL_JS, SETS_LINE) && has(PANEL_JS, 'group:"birthday"') && has(PANEL_JS, 'chips.setAttribute("data-row", row[0]);') &&
    has(css, "#pgPStyle .ps-h4{") && has(PANEL_CSS, "#pagePStyle .ps-h4{"));

  report("A5) the lifter copies the studio's folder to the panel (docs/app/lib/wf/pstyle/th → panel/icons/pstyle/th) and reports no drift on today's tree — the module, the CSS and the 42 pictures all current",
    has(LIFTER, 'const ART_SRC = path.join(ROOT, "docs", "app", "lib", "wf", "pstyle", "th");') && has(LIFTER, 'const ART_DST = path.join(ROOT, "panel", "icons", "pstyle", "th");') &&
    has(LIFTER, "if (writeIfChanged(path.join(ART_DST, f), fs.readFileSync(path.join(ART_SRC, f)))) changed.push(path.relative(ROOT, path.join(ART_DST, f)));") &&
    lifter.build({ dry: true }).changed.length === 0, { drift: lifter.build({ dry: true }).changed });
}

/* ---------------- B) the web app ---------------- */
async function partB(browser) {
  const D = A.readPstyle();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); localStorage.setItem("hnk_rh_apikey", "rh-test-key-value-placeholder"); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { try { document.body.classList.remove("wall"); } catch (e) {} state.rhKey = "rh-test-key-value-placeholder"; switchPage("pgPStyle"); });
  await page.waitForTimeout(500);

  /* two readers installed on the page (its CSP forbids string eval): the group rows and the cards of the grid */
  await page.evaluate(() => {
    window.__psRows = () => [...document.querySelectorAll("#psRoot .ps-groups")].map((r) => ({ row: r.getAttribute("data-row"), chips: [...r.querySelectorAll(".chip")].map((c) => c.getAttribute("data-group")), on: [...r.querySelectorAll(".chip.on")].map((c) => c.getAttribute("data-group")), texts: [...r.querySelectorAll(".chip")].map((c) => c.textContent.trim()) }));
    window.__psCards = () => [...document.querySelectorAll("#psGrid .ps-card")].map((c) => ({ id: c.getAttribute("data-set"), src: c.querySelector("img").getAttribute("src"), name: c.querySelector(".ps-card-n").textContent.trim(), on: c.classList.contains("on") }));
  });
  const b1 = await page.evaluate(async (b64) => {
    PSTYLE.setPhoto({ dataUrl: "data:image/jpeg;base64," + b64, name: "kid.jpg" });
    await new Promise((r) => setTimeout(r, 300));
    document.querySelector("#psNext1").click(); await new Promise((r) => setTimeout(r, 200));
    return { step: PSTYLE.state.step, group: PSTYLE.state.group, rows: window.__psRows(), labels: [...document.querySelectorAll("#psRoot .ps-h4")].map((h) => h.textContent.trim()), cards: window.__psCards() };
  }, PHOTO);
  const bd = D.groups[0];
  report("B1) step 02 draws the occasions row (seven chips, birthday lit) above the building-block row (six chips), each under its label in the studio's language, and opens on the birthday set: six cards from lib/wf/pstyle/th in the table's order, each named in Burmese",
    b1.step === 2 && b1.group === "birthday" && b1.rows.length === 2 && b1.rows[0].row === "occasions" && b1.rows[0].chips.join() === OCC.join() && b1.rows[0].on.join() === "birthday" &&
    b1.rows[1].row === "blocks" && b1.rows[1].chips.join() === BLOCKS.join() && b1.rows[1].on.length === 0 &&
    b1.rows[0].texts.join() === D.groups.slice(0, 7).map((g) => g.name.my).join() && b1.labels.join("|") === D.ui.occasions.my + "|" + D.ui.blocks.my &&
    b1.cards.length === 6 && b1.cards.map((c) => c.id).join() === bd.sets.map((s) => "birthday:" + s.id).join() &&
    b1.cards.every((c, i) => /(^|\/)lib\/wf\/pstyle\/th\/birthday-/.test(c.src) && c.src.indexOf(bd.sets[i].thumb) >= 0 && nameOk(c.name, bd.sets[i].name.my) && !c.on), b1);

  const urls = [].concat(...D.groups.slice(0, 7).map((g) => g.sets.map((s) => "lib/wf/pstyle/th/" + s.thumb)));
  const b2 = await page.evaluate(async (list) => {
    const out = [];
    for (const u of list) {
      try {
        const r = await fetch(u, { cache: "no-store" }); const bl = await r.blob(); const bm = await createImageBitmap(bl);
        out.push({ u, ok: r.status === 200 && /image\/jpeg/.test(bl.type) && bl.size >= 20000 && bm.width === 630 && bm.height === 945, w: bm.width, h: bm.height, size: bl.size, type: bl.type }); bm.close();
      } catch (e) { out.push({ u, ok: false, err: String(e) }); }
    }
    return out;
  }, urls);
  report("B2) the served app carries all 42 pictures: every one fetches as a JPEG the browser decodes at 630×945",
    b2.length === 42 && b2.every((x) => x.ok), { bad: b2.filter((x) => !x.ok).slice(0, 5) });

  const b3 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s);
    q("#psGrid .ps-card").click(); await new Promise((r) => setTimeout(r, 150));
    const ref = PSTYLE.state.ref, pr = PSTYLE.prompt();
    return { kind: ref && ref.kind, id: ref && ref.id, thumb: ref && ref.thumb, name: ref && ref.name, p: ref && ref.p, cards: window.__psCards(), genOn: !q("#psGen").classList.contains("is-off"), prompt: pr };
  });
  const s0 = bd.sets[0];
  report("B3) a tap on the first birthday card picks the set (the card lights, Create wakes) and its description goes into the prompt as the REFERENCE DESCRIPTION, after the two image roles and the task",
    b3.kind === "set" && b3.id === "birthday:" + s0.id && /birthday-/.test(b3.thumb || "") && b3.name === s0.name.my && b3.p === s0.p &&
    b3.cards.filter((c) => c.on).map((c) => c.id).join() === "birthday:" + s0.id && b3.genOn &&
    b3.prompt.indexOf("IMAGE 1 = MAIN SUBJECT") === 0 && b3.prompt.indexOf("REFERENCE DESCRIPTION: " + s0.p) > b3.prompt.indexOf(D.frame.task) && b3.prompt.indexOf("IDENTITY LOCK") > b3.prompt.indexOf("REFERENCE DESCRIPTION: "),
    { id: b3.id, prompt: (b3.prompt || "").slice(0, 240) });

  const b4 = await page.evaluate(async () => {
    const q = (s) => document.querySelector(s), out = {};
    for (const g of ["myanmar", "festive", "outfit", "wedding"]) {
      q('#psRoot .ps-groups .chip[data-group="' + g + '"]').click(); await new Promise((r) => setTimeout(r, 120));
      out[g] = { group: PSTYLE.state.group, cards: window.__psCards(), rows: window.__psRows().map((r) => r.on.join()) };
    }
    out.refId = PSTYLE.state.ref && PSTYLE.state.ref.id;
    return out;
  });
  report("B4) the other occasions draw their own six pictures (myanmar-…, festive-…, wedding-…), a building block still draws the Imagine art (outfit: 12+ from imagine/th), the lit chip follows the group across both rows, and the picked birthday set stays picked while browsing",
    ["myanmar", "festive", "wedding"].every((g) => b4[g].group === g && b4[g].cards.length === 6 && b4[g].cards.every((c) => new RegExp("lib/wf/pstyle/th/" + g + "-").test(c.src)) && b4[g].rows.join("|") === g + "|") &&
    b4.outfit.group === "outfit" && b4.outfit.cards.length >= 12 && b4.outfit.cards.every((c) => /imagine\/th\/outfit-/.test(c.src)) && b4.outfit.rows.join("|") === "|outfit" &&
    b4.refId === "birthday:" + s0.id && b4.wedding.cards.every((c) => !c.on),
    { myanmar: b4.myanmar.cards.length, outfit: b4.outfit.cards.length, ref: b4.refId });

  const b5 = await page.evaluate(async () => {
    const was = LANG; LANG = "en"; PSTYLE.render(); await new Promise((r) => setTimeout(r, 120));   /* the app's L9 reads the global LANG */
    const en = { rows: window.__psRows().map((r) => r.texts), labels: [...document.querySelectorAll("#psRoot .ps-h4")].map((h) => h.textContent.trim()), cards: window.__psCards().map((c) => c.name) };
    LANG = was; PSTYLE.render(); await new Promise((r) => setTimeout(r, 120));
    const back = { labels: [...document.querySelectorAll("#psRoot .ps-h4")].map((h) => h.textContent.trim()) };
    return { en, back };
  });
  const wd = D.groups.find((g) => g.id === "wedding");
  report("B5) in English the rows read Occasions / Building blocks, the seven chips and the wedding cards carry their English names, and Burmese comes back",
    b5.en.labels.join("|") === "Occasions|Building blocks" && b5.en.rows[0].join() === D.groups.slice(0, 7).map((g) => g.name.en).join() && b5.en.rows[1].join() === D.groups.slice(7).map((g) => g.name.en).join() &&
    b5.en.cards.length === 6 && b5.en.cards.every((n, i) => nameOk(n, wd.sets[i].name.en)) && b5.back.labels.join("|") === D.ui.occasions.my + "|" + D.ui.blocks.my, b5);

  report("B6) no page error through any of it", errs.length === 0, errs);
  await ctx.close();
}

/* ---------------- C) the panel ---------------- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
async function partC(browser) {
  const D = A.readPstyle();
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
    await pp.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await pp.waitForTimeout(2500);
    const c1 = await pp.evaluate(async (args) => {
      switchPage("pstyle"); await new Promise((r) => setTimeout(r, 300));
      const q = (s) => document.querySelector(s), ps = globalThis.HNK.pstyle;
      ps.setPhoto({ dataUrl: "data:image/jpeg;base64," + args.b64, name: "layer" }); await new Promise((r) => setTimeout(r, 200));
      q("#psNext1").click(); await new Promise((r) => setTimeout(r, 200));
      const rows = () => [...document.querySelectorAll("#pagePStyle .ps-groups")].map((r) => ({ row: r.getAttribute("data-row"), chips: [...r.querySelectorAll(".chip")].map((c) => c.getAttribute("data-group")), on: [...r.querySelectorAll(".chip.on")].map((c) => c.getAttribute("data-group")) }));
      const cards = () => [...document.querySelectorAll("#psGrid .ps-card")].map((c) => ({ id: c.getAttribute("data-set"), src: c.querySelector("img").getAttribute("src"), name: c.querySelector(".ps-card-n").textContent.trim(), on: c.classList.contains("on") }));
      const out = { page: state.page, step: ps.state.step, group: ps.state.group, rows: rows(), labels: [...document.querySelectorAll("#pagePStyle .ps-h4")].map((h) => h.textContent.trim()), cards: cards() };
      q("#psGrid .ps-card").click(); await new Promise((r) => setTimeout(r, 100)); out.refId = ps.state.ref && ps.state.ref.id; out.refP = ps.state.ref && ps.state.ref.p; out.prompt = ps.prompt();
      q('#pagePStyle .ps-groups .chip[data-group="wedding"]').click(); await new Promise((r) => setTimeout(r, 120)); out.wedding = cards();
      const pics = [];
      for (const u of args.urls) {
        try { const r = await fetch(new URL(u, location.href).href, { cache: "no-store" }); const bl = await r.blob(); const bm = await createImageBitmap(bl); pics.push({ u, ok: r.status === 200 && bl.size >= 20000 && bm.width === 630 && bm.height === 945 }); bm.close(); }   /* absolute: the harness's fetch stub passes 127.0.0.1 URLs through */
        catch (e) { pics.push({ u, ok: false, err: String(e) }); }
      }
      out.pics = pics;
      return out;
    }, { b64: PHOTO, urls: [].concat(...D.groups.slice(0, 7).map((g) => g.sets.map((s) => "icons/pstyle/th/" + s.thumb))) });
    const bd = D.groups[0], wd = D.groups.find((g) => g.id === "wedding");
    report("C1) the panel draws the same two rows on step 02, opens on the six birthday pictures from icons/pstyle/th, a tap picks the set and its description enters the prompt, the wedding group draws its six, and all 42 pictures decode at 630×945 from the panel's own folder",
      c1.page === "pstyle" && c1.step === 2 && c1.group === "birthday" && c1.rows.length === 2 && c1.rows[0].row === "occasions" && c1.rows[0].chips.join() === OCC.join() && c1.rows[0].on.join() === "birthday" &&
      c1.rows[1].row === "blocks" && c1.rows[1].chips.join() === BLOCKS.join() && c1.labels.join("|") === D.ui.occasions.my + "|" + D.ui.blocks.my &&
      c1.cards.length === 6 && c1.cards.every((c, i) => c.src === "icons/pstyle/th/" + bd.sets[i].thumb && nameOk(c.name, bd.sets[i].name.my)) &&
      c1.refId === "birthday:" + bd.sets[0].id && c1.refP === bd.sets[0].p && c1.prompt.indexOf("REFERENCE DESCRIPTION: " + bd.sets[0].p) > 0 &&
      c1.wedding.length === 6 && c1.wedding.every((c, i) => c.src === "icons/pstyle/th/" + wd.sets[i].thumb) &&
      c1.pics.length === 42 && c1.pics.every((p) => p.ok),
      { rows: c1.rows, cards: c1.cards.length, ref: c1.refId, badPics: c1.pics.filter((p) => !p.ok).slice(0, 5) });
    report("C2) no page error in the panel", errs.length === 0, errs);
    await pp.close();
  } finally { server.close(); }
}

/* ---------------- D) What's New · E) pins ---------------- */
function partD() {
  const row = WN.find(WN.appRows(), WAVE_V, "pgPStyle");
  report("D1) What's New carries the " + WAVE_V + " row for the occasion sets in nine languages (42 pictures, seven occasions, the brand model), and the panel says the same",
    !!row && LANGS.every((c) => row.t[c] && row.s[c]) && /42/.test(row.t.en) && /brand model/.test(row.s.en) && /630×945/.test(row.s.en) &&
    WN.appRow(WAVE_V, "pgPStyle") === WN.panelRow(WAVE_V, "pgPStyle") && WN.appRow(WAVE_V, "pgPStyle").length > 200, { row: !!row });
}
function partE() {
  const steps = (CI.match(/node test\//g) || []).length;
  report("E1) the suite runs " + COUNT + " tests and this one is named in the workflow, after the Portrait Style check it extends",
    steps === COUNT && has(CI, "node test/verify_pstyle_sets_6143.js") && CI.indexOf("verify_pstyle_sets_6143.js") > CI.indexOf("verify_pstyle_6142.js"), { steps });
  report("E2) the release is " + VER + " / panel " + PVER + " in lockstep across the app, the API, the panel and the download record",
    has(read("docs/app/version.json"), '"' + VER + '"') && has(read("server/index.js"), 'const API_VERSION = "' + VER + '";') &&
    has(APP, 'var APP_VER="' + VER + '"') && has(read("docs/app/sw.js"), "hnk-web-studio-v" + VER.replace(/\./g, "-")) &&
    has(MAIN, 'const PANEL_VERSION = "' + PVER + '";') && has(read("panel/manifest.json"), '"version": "' + PVER + '"') &&
    has(read("panel/release-manifest.json"), '"version": "' + PVER + '"') && has(read("docs/download/panel-version.json"), '"latest_version": "' + PVER + '"') &&
    has(read("docs/app/data/album-module.js"), 'var APP_MARK = "' + VER + '";'));
  report("E3) the landing counts " + COUNT + " tests and its two-column grid still opens at 280px — the count bumps stopped nudging the CSS number next to it",
    has(LANDING, COUNT + " tests") && new RegExp('data-count="tests">' + COUNT + '<').test(LANDING) && has(LANDING, "minmax(280px,5fr)"));
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
