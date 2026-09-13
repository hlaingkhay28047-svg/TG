/* 6.76.0 — LIBRARY SCENE PRESETS IN THE SMART WORKFLOW WIZARD.
 *
 * The owner asked (2026-09-13): "Library ထဲက ပုံတွေကို scenes reference prompt
 * Preset ကတ်အဖြစ် အသုံးပြုလို့ရအောင် လုပ်ပေးလို့ရလား" — let the Library's
 * pictures be one-tap preset cards for a scene reference. Under every slot
 * that asks for a scene or a background (Reference Scenes' IMAGE 2, BG
 * Replace's new background, the scene composites) both surfaces now draw the
 * Library's own scene looks as a strip; one tap loads the look's full plate
 * into that slot and the prompt gains one line naming the preset.
 *
 * What this proves, on the live pages rather than by reading the source:
 *   A) the two surfaces pick the SAME looks in the SAME order (one rule, twice);
 *   B) the web app: the strip sits under IMAGE 2 only, a tap fills the slot
 *      with the plate's bytes, the prompt that will be sent ends with the
 *      SCENE PRESET line, clearing the slot drops the line, a workflow with no
 *      scene slot draws no strip;
 *   C) the panel: the same strip under the second slot, tiles painted through
 *      remoteArt (data: URLs — a remote <img src> draws nothing in Photoshop),
 *      a tap lands a data: URL in the slot with the tick, and the compiled
 *      request carries the same SCENE PRESET line;
 *   D) the source pins that keep it there, and CI.
 * Usage: PORT=8931 node test/verify_scene_presets.js   (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const APP_DIR = path.join(ROOT, "docs", "app");
const APP = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8");
const SCREEN = fs.readFileSync(path.join(PANEL, "src", "ui", "screens", "workflow-tools-screen.js"), "utf8");
const COMPILER = fs.readFileSync(path.join(PANEL, "src", "workflows", "workflow-request-compiler.js"), "utf8");
const LIBMOD = fs.readFileSync(path.join(PANEL, "js", "hnk_library_compact_cards.js"), "utf8");
const PCSS = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
const CI = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test.yml"), "utf8");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };
const ASSET_HOST = "https://hnk-ai-tools-3-s4nnu.ondigitalocean.app";
const OWNER = "Reference scenes from image 2 keep image 1 subject frame and composition and scenes follow the subject compose";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok || detail == null ? "" : "  :: " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

(async () => {
  /* ---- D) the source, first: what the two surfaces and CI carry ---- */
  const appRule = (APP.match(/function scenePresetList\(items\)\{[\s\S]*?\n  \}/) || [""])[0];
  const panelRule = (SCREEN.match(/function scenePresetList\(items\)\{[\s\S]*?\n\}/) || [""])[0];
  const norm = s => s.replace(/^\s+/gm, "");
  report("D1) one rule, written twice byte for byte (modulo indentation): the app's scenePresetList and the panel screen's",
    appRule.length > 200 && norm(appRule) === norm(panelRule), { app: appRule.length, panel: panelRule.length });
  report("D2) the app sends wizSendPrompt() (prompt + SCENE PRESET line), the panel compiler appends _scenePresetLine, the Library module publishes the plate URL, the panel strip paints through remoteArt",
    /\$\("prompt"\)\.value=wizSendPrompt\(\);/.test(APP) && /prompt \+= _scenePresetLine\(state\);/.test(COMPILER) &&
    /"\\nSCENE PRESET: " \+ im\.preset\.title/.test(COMPILER) && /H\.libPlateUrl = function \(tier, id\)/.test(LIBMOD) &&
    /setArt\(im, plateUrl\("ui", it\.id\)\);/.test(SCREEN) && /ra\.load\(url\)\.then/.test(SCREEN), null);
  report("D3) the panel's strip CSS obeys the UXP-safe rules the panel wrote for itself: no gap, no object-fit, no pseudo-elements in the new block",
    (() => { const blk = (PCSS.match(/\.hnk-scene \{[\s\S]*?\.hnk-scene-tile\.on \{[^}]*\}/) || [""])[0];
      return blk.length > 200 && !/(^|[;{\s])gap\s*:/.test(blk) && !/object-fit/.test(blk) && !/::/.test(blk); })(), null);
  report("D4) CI runs this test", /PORT=8931 node test\/verify_scene_presets\.js/.test(CI), null);

  const browser = await chromium.launch();
  withPremium(browser);
  let appIds = null;
  try {
    /* ---- B) the web app ---- */
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.addInitScript(() => { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2600);
    const opened = await page.evaluate(async () => {
      state.refs = [];
      window.openWorkflowById("reference-scenes");
      await new Promise(r => setTimeout(r, 200));
      /* step 1 → 2: the wizard's own Next button */
      const nav = document.querySelectorAll("#wiz .wiz-nav .btn");
      if (nav.length) nav[nav.length - 1].click();
      await new Promise(r => setTimeout(r, 300));
      const slots = [...document.querySelectorAll("#wiz .wslot")];
      const strips = [...document.querySelectorAll("#wiz .wscene")];
      const after2 = slots[1] && slots[1].nextElementSibling;
      const tiles = strips[0] ? [...strips[0].querySelectorAll(".wscene-tile")] : [];
      return {
        on: document.getElementById("wiz").className, slots: slots.length, strips: strips.length,
        stripFollowsSlot2: !!(after2 && after2.classList && after2.classList.contains("wscene")),
        tiles: tiles.length, firstSrc: tiles[0] ? tiles[0].querySelector("img").getAttribute("src") : "",
        firstId: tiles[0] ? tiles[0].getAttribute("data-id") : "", firstTitle: tiles[0] ? tiles[0].title : "",
        heading: strips[0] ? strips[0].querySelector(".wscene-h").textContent : "",
        ids: window._scenePresetIds()
      };
    });
    appIds = opened.ids;
    report("B1) Reference Scenes opens on its Images step with two slots and ONE strip of Library scene looks, right under IMAGE 2",
      /\bon\b/.test(opened.on) && opened.slots === 2 && opened.strips === 1 && opened.stripFollowsSlot2 && opened.tiles >= 50 &&
      opened.tiles === opened.ids.length && /^lib\/ui\/user-ref-\d+\.jpg$/.test(opened.firstSrc) && opened.firstId === opened.ids[0] &&
      opened.heading.length > 10,
      JSON.stringify(opened).slice(0, 400));
    const picked = await page.evaluate(async () => {
      const tile = document.querySelector("#wiz .wscene-tile");
      tile.click();
      for (let i = 0; i < 60 && !(state.refs[1] && state.refs[1].b64); i++) await new Promise(r => setTimeout(r, 100));
      const r = state.refs[1] || null;
      const t2 = document.querySelector('#wiz .wscene-tile[data-id="' + tile.getAttribute("data-id") + '"]');
      return { id: tile.getAttribute("data-id"), title: tile.title, group: (window.LW || LW).items.filter(x => x.id === tile.getAttribute("data-id"))[0].g || "",
        mime: r && r.mime, b64len: r ? r.b64.length : 0, label: r && r.label, preset: r && r.scenePreset,
        filled: !!document.querySelectorAll("#wiz .wslot")[1].classList.contains("filled"),
        onClass: t2 ? t2.className : "", prompt: window._wizSendPrompt() };
    });
    report("B2) one tap loads the look's full plate into IMAGE 2 (real JPEG bytes, the look's title as its label), marks the tile, and the prompt that will be sent opens with the owner's sentence and ends with the SCENE PRESET line",
      picked.mime === "image/jpeg" && picked.b64len > 3000 && picked.label === picked.title && picked.preset === picked.id && picked.filled &&
      /\bon\b/.test(picked.onClass) && picked.prompt.indexOf(OWNER) === 0 &&
      picked.prompt.endsWith("\nSCENE PRESET: " + picked.title + (picked.group ? " — " + picked.group : "")),
      JSON.stringify({ ...picked, prompt: picked.prompt.slice(-120) }).slice(0, 500));
    const cleared = await page.evaluate(async () => {
      const slot2 = document.querySelectorAll("#wiz .wslot")[1];
      const btns = [...slot2.querySelectorAll(".act .btn")];
      btns[btns.length - 1].click();  /* the clear button is the last action on a filled slot */
      await new Promise(r => setTimeout(r, 200));
      return { ref: !!state.refs[1], prompt: window._wizSendPrompt(), tileOn: !!document.querySelector("#wiz .wscene-tile.on") };
    });
    report("B3) clearing IMAGE 2 drops the preset with it: no SCENE PRESET line, no marked tile",
      !cleared.ref && cleared.prompt.indexOf("SCENE PRESET") < 0 && !cleared.tileOn, cleared);
    const noScene = await page.evaluate(async () => {
      const w = (window.LW || LW).workflows.filter(x => !x.kind && (x.req || []).length >= 2 && !(x.req.concat(x.opt || []).some(l => /scene|background/i.test(l))))[0];
      if (!w) return { none: true };
      window.openWorkflowById(w.id);
      await new Promise(r => setTimeout(r, 200));
      const nav = document.querySelectorAll("#wiz .wiz-nav .btn");
      if (nav.length) nav[nav.length - 1].click();
      await new Promise(r => setTimeout(r, 300));
      return { id: w.id, req: w.req, slots: document.querySelectorAll("#wiz .wslot").length, strips: document.querySelectorAll("#wiz .wscene").length };
    });
    report("B4) a two-image workflow whose second slot is not a scene draws no strip", !noScene.none && noScene.slots >= 2 && noScene.strips === 0, noScene);
    report("B5) nothing threw in the app", errs.length === 0, errs.slice(0, 3).join(" | "));
    await page.close();

    /* ---- C) the panel ---- */
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      let base = PANEL;
      if (rel.indexOf("__app/") === 0) { base = APP_DIR; rel = rel.slice(6); }
      const abs = path.resolve(base, rel);
      if (!abs.startsWith(base + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(abs));
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const pport = server.address().port;
    try {
      const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
      const perrs = [];
      p.on("pageerror", e => perrs.push(String(e).slice(0, 240)));
      await p.addInitScript(UXP_STUB);
      await p.addInitScript(`(function(){
        var stub = window.fetch;
        var BASE = ${JSON.stringify(ASSET_HOST + "/app/")};
        window.fetch = function(url, init){
          var u = String(url);
          if (u.indexOf(BASE) === 0) u = "http://127.0.0.1:${pport}/__app/" + u.slice(BASE.length);
          return stub(u, init);
        };
      })();`);
      await p.goto(`http://127.0.0.1:${pport}/index.html`, { waitUntil: "load" });
      await p.waitForFunction(() => { try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); } catch (e) { return false; } },
        null, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1200);
      const popen = await p.evaluate(async () => {
        try { switchPage("wf"); } catch (e) { }
        await new Promise(r => setTimeout(r, 800));
        const card = document.getElementById("hnkWf_reference-scenes");
        if (!card) return { noCard: true };
        card.click();
        await new Promise(r => setTimeout(r, 1500));
        const blocks = [...document.querySelectorAll(".hnk-req-block")];
        const strips = blocks.map(b => b.querySelectorAll(".hnk-scene").length);
        const strip = document.getElementById("hnkWfScene_img2");
        const tiles = strip ? [...strip.children] : [];
        const painted = tiles.slice(0, 6).map(t => String((t.querySelector("img") || {}).src || "").slice(0, 15));
        return { blocks: blocks.length, strips, tiles: tiles.length, painted,
          firstId: tiles[0] ? tiles[0].getAttribute("data-id") : "", firstTitle: tiles[0] ? tiles[0].getAttribute("title") : "",
          ids: window.HNK.workflowToolsScreen.scenePresetIds(),
          heading: (document.querySelector(".hnk-scene-h") || {}).textContent || "" };
      });
      report("C1) the panel draws the same strip under its second slot only, every tile a data: URL painted through remoteArt (no remote <img src>)",
        !popen.noCard && popen.blocks === 2 && popen.strips[0] === 0 && popen.strips[1] === 1 && popen.tiles >= 50 &&
        popen.painted.length === 6 && popen.painted.every(s => s === "data:image/jpeg") && popen.heading.length > 10,
        JSON.stringify(popen).slice(0, 400));
      report("A) the app and the panel pick the same Library looks in the same order",
        Array.isArray(appIds) && Array.isArray(popen.ids) && appIds.length >= 50 && JSON.stringify(appIds) === JSON.stringify(popen.ids),
        { app: appIds && appIds.length, panel: popen.ids && popen.ids.length, first: [appIds && appIds[0], popen.ids && popen.ids[0]] });
      const ppick = await p.evaluate(async () => {
        const strip = document.getElementById("hnkWfScene_img2");
        const tile = strip.children[0];
        tile.click();
        const ws = window.HNK.aiToolsApp.workflowScreen();
        const st = ws.getState();
        const inp = () => st.requiredInputs.filter(x => x.key === "img2")[0];
        for (let i = 0; i < 80 && !(inp().image && inp().image.source === "preset"); i++) await new Promise(r => setTimeout(r, 100));
        const im = inp().image || {};
        const comp = window.HNK.workflowRequestCompiler.compile(st);
        const thumb = document.getElementById("hnkWfThumb_img2");
        return { id: tile.getAttribute("data-id"), title: tile.getAttribute("title"), source: im.source, ref: String(im.ref || "").slice(0, 15), refLen: String(im.ref || "").length,
          preset: im.preset,
          markText: ((document.querySelectorAll(".hnk-req-mark")[1]) || {}).textContent, thumbSrc: thumb && thumb.firstChild ? String(thumb.firstChild.src).slice(0, 15) : "",
          tileOn: tile.className, prompt: comp && comp.compiledPrompt };
      });
      report("C2) a tap lands the full plate in the slot as a data: URL with the tick and the thumbnail, remembers the look, and the compiled request ends with the same SCENE PRESET line the app sends",
        ppick.source === "preset" && ppick.ref === "data:image/jpeg" && ppick.refLen > 3000 && ppick.preset && ppick.preset.id === ppick.id &&
        ppick.markText === "✓" && ppick.thumbSrc === "data:image/jpeg" && /\bon\b/.test(ppick.tileOn) &&
        typeof ppick.prompt === "string" && ppick.prompt.indexOf(OWNER) === 0 &&
        ppick.prompt.endsWith("\nSCENE PRESET: " + ppick.title + (ppick.preset && ppick.preset.group ? " — " + ppick.preset.group : "")),
        JSON.stringify({ ...ppick, prompt: String(ppick.prompt || "").slice(-120) }).slice(0, 500));
      report("C3) nothing threw in the panel", perrs.length === 0, perrs.slice(0, 3).join(" | "));
      await p.close();
    } finally { server.close(); }
  } finally { await browser.close(); }

  console.log(failures ? "\nFAIL (" + failures + ")" : "\nPASS — a Library look is one tap from the Scene Reference, on both surfaces, and the model is told which one");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
