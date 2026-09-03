/* v6.59.0 — EVERY SLOT, ON EVERY CARD, OFFERS EVERY WAY IN.
 *
 * WHY THIS FILE EXISTS. The owner asked a plain question about the Photoshop
 * panel: on all the Smart Workflow cards, and on every image slot they have,
 * can a photo come in from the ACTIVE LAYER, and can one come in FROM THE WEB
 * (a link copied off Pinterest) — and does the result go back into Photoshop?
 *
 * The answer was yes, and had been since v6.27.0: workflow-tools-screen's
 * inputRow() builds a row of source buttons for every required input — + Layer,
 * File, Paste (v6.59.0), Web with its own link box, and ✦ Library — and a
 * result is placed back as a real layer through photoshop-host's placeAsLayer.
 *
 * But "yes, because one function builds them" is an argument, not a check. A
 * workflow whose inputs come from somewhere else, a card that renders through
 * a different path, a future edit that special-cases one slot — none of that
 * would fail any test we had. So this walks the SHIPPED CATALOG, opens every
 * card that asks for a photograph, and looks at every slot it draws.
 *
 * Usage: node test/verify_panel_slot_sources.js */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 600)));
  if (!ok) failures++;
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".woff2": "font/woff2" };

/* the catalog the panel actually ships, read the same way the panel reads it */
function catalogIds() {
  const src = fs.readFileSync(path.join(PANEL, "js", "hnk_wf_catalog_data.js"), "utf8");
  const m = src.match(/var CATALOG = ({[\s\S]*?});\n/);
  const cat = JSON.parse(m[1]);
  const out = [];
  cat.categories.forEach(c => c.items.forEach(w => {
    if ((w.req || []).length) out.push({ id: w.id, title: w.title, n: w.req.length });
  }));
  return out;
}

(async () => {
  const { chromium } = require("playwright-core");
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    const abs = path.resolve(PANEL, rel);
    if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store" });
    res.end(fs.readFileSync(abs));
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const wanted = catalogIds();
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.route("**/*", r => {
      const u = r.request().url();
      if (u.indexOf("127.0.0.1") >= 0) return r.continue();
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
    }, null, { timeout: 20000 }).catch(() => { throw new Error("the panel never reached its signed-in state"); });

    await page.evaluate(() => { try { switchPage("wf"); } catch (e) { } });
    await page.waitForTimeout(900);

    report("every workflow that asks for a photograph is on the panel's Workflows page",
      await page.evaluate(ids => ids.every(w => !!document.getElementById("hnkWf_" + w.id)), wanted),
      "missing: " + (await page.evaluate(ids => ids.filter(w => !document.getElementById("hnkWf_" + w.id))
        .map(w => w.id).slice(0, 6).join(", "), wanted)));

    /* open each card and look at what its slots really offer */
    const bad = [];
    const seen = { cards: 0, slots: 0, selection: 0 };
    for (const w of wanted) {
      const got = await page.evaluate(async id => {
        const card = document.getElementById("hnkWf_" + id);
        if (!card) return { open: false };
        card.click();
        await new Promise(r => setTimeout(r, 40));
        const rows = document.querySelectorAll(".hnk-req-block");
        const slots = [];
        rows.forEach(row => {
          const key = (row.querySelector("[id^='hnkWfAdd_']") || {}).id || "";
          const k = key.replace("hnkWfAdd_", "");
          slots.push({
            key: k,
            layer: !!document.getElementById("hnkWfAdd_" + k),
            file: !!document.getElementById("hnkWfFile_" + k),
            paste: !!document.getElementById("hnkWfPaste_" + k),
            web: !!document.getElementById("hnkWfWeb_" + k),
            url: !!document.getElementById("hnkWfUrl_" + k) && !!document.getElementById("hnkWfUrlGo_" + k),
            lib: !!document.getElementById("hnkWfLib_" + k)
          });
        });
        return { open: true, slots: slots };
      }, w.id);
      if (!got.open) { bad.push(w.id + ": card would not open"); }
      else if (got.slots.length < w.n) { bad.push(w.id + ": " + got.slots.length + " slots drawn, catalog says " + w.n); }
      else {
        seen.cards++;
        got.slots.forEach(s => {
          seen.slots++;
          /* Selection Edit is the one deliberate exception, and it is the
             reason this list is a list rather than a blanket rule: its photo
             IS the live Rectangle-tool selection, read at Generate time, so
             a source button would offer a way in that the workflow cannot
             honour. It draws a ticked slot and a hint line instead. Any
             OTHER slot that loses its buttons is a defect, and this catches
             it. (The gap that remains — no way to use Selection Edit on a
             photo that is not open in Photoshop, and no marquee at all in
             the web app — is real, and is its own piece of work.) */
          if (w.id === "region-edit" && !s.key) { seen.selection++; return; }
          const miss = ["layer", "file", "paste", "web", "url", "lib"].filter(k => !s[k]);
          if (miss.length) bad.push(w.id + "/" + s.key + ": no " + miss.join("+"));
        });
      }
      /* back to the list for the next card. The screen's own "← Workflow
         Tools" button is the only thing that resets its selection; without
         pressing it every card after the first reads "would not open" and
         the real answer stays hidden. */
      await page.evaluate(() => { const b = document.getElementById("hnkWfBack"); if (b) b.click(); });
      await page.waitForFunction(() => document.querySelectorAll(".wfmini").length > 10, null, { timeout: 8000 })
        .catch(() => { });
    }

    report("every image slot on every card offers all five ways in — Active Layer, File, Paste, Web link, Library",
      bad.length === 0, bad.slice(0, 8).join(" | "));
    console.log("      (" + seen.cards + " cards opened, " + seen.slots + " slots inspected, "
      + seen.selection + " of them Selection Edit's live-marquee slot)");

    /* and the way back out: a result becomes a real Photoshop layer */
    const host = await page.evaluate(() => {
      const h = window.HNK && window.HNK.photoshopHost;
      return {
        place: !!(h && typeof h.placeAsLayer === "function"),
        capture: !!(h && typeof h.captureActiveLayer === "function"),
        pick: !!(h && typeof h.pickImageFile === "function"),
        masked: !!(window.HNK && window.HNK.maskedPlaceService),
        group: !!(window.HNK && window.HNK.resultGroupService)
      };
    });
    report("the panel can read the active layer and place a result back as a layer",
      host.place && host.capture, JSON.stringify(host));
    report("and Selection Edit's masked place-back and the result-group service are both wired",
      host.masked && host.group, JSON.stringify(host));

    /* v6.59.0 — the link a studio actually copies off Pinterest is a link to
       the PAGE. It used to pass validation, fail at the fetch, and come back
       as "check the URL and try again", which is true and useless. */
    const links = await page.evaluate(() => {
      const svc = window.HNK && window.HNK.imageImportService;
      if (!svc || !svc.isPageLink) return null;
      return {
        pinPage: svc.isPageLink("https://www.pinterest.com/pin/12345/"),
        pinShort: svc.isPageLink("https://pin.it/abc"),
        insta: svc.isPageLink("https://www.instagram.com/p/xyz/"),
        directPin: svc.isPageLink("https://i.pinimg.com/originals/ab/cd.jpg"),
        plainImg: svc.isPageLink("https://example.com/photo.webp?v=2")
      };
    });
    report("a Pinterest or Instagram PAGE link is recognised as a page link, and a direct image link still is not",
      !!links && links.pinPage && links.pinShort && links.insta && !links.directPin && !links.plainImg,
      JSON.stringify(links));

    report("no page error while every card was opened", errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — a slot in the panel cannot take the photo a studio wants to give it.`
    : "\nAll checks passed — every card, every slot: Active Layer, File, Paste, Web link, Library; and the result goes back into Photoshop.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
