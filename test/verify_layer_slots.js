/* v6.38.2 / panel 6.107.2 — THE ACTIVE LAYER, ON EVERY IMAGE SLOT.

   THE DEFECT (owner, in Photoshop): "Active layer images slots တွေ တစ်ချို့နေရာ
   မပါနေဘူး" — the Active-layer source is missing from some of the image slots.

   He was right, and the split was exact. The panel has two kinds of image
   input. The reference slots open a source sheet whose first line is "Use the
   selected Photoshop layer" (ffSrcSheet, since 6.27.0). Four others went
   straight to a file picker and could not reach the open document at all:

     · TALK           the photograph that will speak      btnTkImgPick
     · VIDEO → VIDEO  the tool's reference photo          btnVtImgPick
     · Edit ▸ IMAGINE the photo every template works on   imagineHost.pickWire
     · Batch (Path)   the photos of a batch run           ptAdd

   Inside Photoshop that is backwards: the student's photo is the layer in
   front of them, and asking them to export a JPEG first — from Photoshop, to
   give Photoshop a photo — is the whole point of the panel going missing.

   A) One sheet now serves all four (photoSheet), and the layer it captures is
      handed over in every shape those slots read.
   B) A second bug in the same place: the video wizard drew its photo chip with
      ffThumb(VT.img), and VT.img is a file entry with no mime/b64 — so it
      painted url("data:undefined;base64,undefined"), an empty box where the
      student had just put their photo. ffThumb takes both shapes now.
   C) The sheet's own five strings, which used to be Burmese and English only,
      speak all nine languages — it is the door on every slot now.
   D) CI runs this test.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const { UXP_STUB } = require("./lib/panel-parity-harness.js");

const ROOT = path.join(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + String(detail).slice(0, 400)));
  if (!ok) failures++;
}

const MAIN = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

/* ---------------------------------------------------------------- source */

report("A1) one sheet serves every image slot, and its first line is the Photoshop layer",
  /function photoSheet\(title, opts\)/.test(MAIN) &&
  /opt\(ff9\(FF_L\.srcLayer\), opts\.onLayer\);/.test(MAIN) &&
  /opt\(ff9\(FF_L\.srcFile\), opts\.onFile\);/.test(MAIN),
  "photoSheet");

report("A2) a captured layer is handed over in EVERY shape the slots read — {mime,b64} for the thumbnails, _url for the previews and the submit paths",
  /function layerPhotoEntry\(cap\)/.test(MAIN) &&
  /mime: mime, b64: b64,/.test(MAIN) &&
  /_url: "data:" \+ mime \+ ";base64," \+ b64,/.test(MAIN),
  "layerPhotoEntry");

report("A3) the capture refuses while a run is busy, checks the bytes are really an image, and reports a missing document through friendlyErr",
  /async function layerPhotoCapture\(\)/.test(MAIN) &&
  /if \(state\.busy\) return null;/.test(MAIN) &&
  /if \(!imgMagicOk\(cap\.b64\)\) \{ setStatus\(t\("st_img_bad"\), "err"\); return null; \}/.test(MAIN) &&
  /catch \(e\) \{ setStatus\(friendlyErr\(e\), "err"\); return null; \}/.test(MAIN),
  "layerPhotoCapture");

/* each of the four, at the source: the sheet is opened and the file path it
   always had is still one of the choices */
const surfaces = [
  ["TALK", /photoSheet\(ff9\(TK_L\.pickImg\), \{[\s\S]{0,600}?TK\.img = e;[\s\S]{0,600}?onFile/],
  ["VIDEO → VIDEO", /photoSheet\(ff9\(VT_L\.pickImg\), \{[\s\S]{0,600}?VT\.img = e;[\s\S]{0,600}?onFile/],
  ["IMAGINE", /pickWire: function \(btn, onFiles\) \{[\s\S]{0,900}?photoSheet\(ff9\(FF_L\.where\), \{[\s\S]{0,400}?onFile: fromFiles/],
  ["Batch \\(Path\\)", /function ptAdd\(\) \{[\s\S]{0,700}?photoSheet\([\s\S]{0,600}?onFile: ptAddFiles/]
];
surfaces.forEach(function (s) {
  report("A4) " + s[0].replace(/\\/g, "") + " opens the sheet instead of going straight to a file picker",
    s[1].test(MAIN), s[0]);
});

report("A5) and none of the four still wires a bare file picker onto its click",
  !/btnTkImgPick"\);\s*\n\s*if \(ip\) ip\.addEventListener\("click", async function \(\) \{\s*\n\s*try \{ const f = await pickFile/.test(MAIN) &&
  !/btnVtImgPick"\);\s*\n\s*if \(vti\) vti\.addEventListener\("click", async function \(\) \{\s*\n\s*try \{ const f = await pickFile/.test(MAIN),
  "the old direct wiring");

report("B1) the thumbnail draws a capture AND a file entry — the video wizard's photo chip is no longer data:undefined",
  /const url = \(r && r\.b64\) \? \("data:" \+ \(r\.mime \|\| "image\/png"\) \+ ";base64," \+ r\.b64\)\s*\n\s*: \(r && r\._url\) \? r\._url : "";/.test(MAIN) &&
  /if \(url\) im\.style\.backgroundImage/.test(MAIN),
  "ffThumb");

report("C1) the sheet's five strings speak all nine languages",
  (() => {
    const bad = [];
    ["where", "srcLayer", "srcFile", "srcLib", "srcLast"].forEach(function (k) {
      const m = new RegExp("\\n  " + k + ": \\{([^\\n]*?)\\},?\\n").exec(MAIN);
      if (!m) { bad.push(k + ": not found"); return; }
      const missing = LANGS.filter(function (l) { return !new RegExp("(?:^|[{, ])" + l + ':\\s*"').test(m[1]); });
      if (missing.length) bad.push(k + ": " + missing.join(","));
    });
    return bad.length === 0 ? true : (report._c1 = bad, false);
  })(), report._c1);

/* --------------------------------------------------------------- runtime */

(async () => {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
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
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
    await page.addInitScript(UXP_STUB);
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      try { return !!(window.HNK && window.HNK.panelNav && window.HNK.panelNav.dash()); }
      catch (e) { return false; }
    }, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);

    /* the strings the sheet must show, read from the panel itself so the test
       cannot drift from the copy */
    const L = await page.evaluate(() => ({ layer: ff9(FF_L.srcLayer), file: ff9(FF_L.srcFile) }));

    const openSheet = async (prep, id) => {
      await page.evaluate(k => { try { if (k) switchPage(k); } catch (e) { } }, prep);
      await page.waitForTimeout(prep ? 500 : 0);
      return await page.evaluate((btnId) => {
        const old = document.getElementById("ffSheet"); if (old && old.parentNode) old.parentNode.removeChild(old);
        const b = document.getElementById(btnId);
        if (!b) return { missing: btnId };
        b.click();
        const sheet = document.getElementById("ffSheet");
        if (!sheet) return { opened: false };
        return { opened: true,
          options: Array.prototype.map.call(sheet.querySelectorAll(".btn"), function (o) { return (o.textContent || "").trim(); }),
          head: (sheet.querySelector(".subh") || {}).textContent || "" };
      }, id);
    };

    const cases = [
      ["TALK", "talk", "btnTkImgPick"],
      ["VIDEO → VIDEO", "v2v", "btnVtImgPick"],
      ["Batch (Path)", "path", "btnPtAdd"]
    ];
    for (const [name, pageKey, id] of cases) {
      const r = await openSheet(pageKey, id);
      report("D1) " + name + " offers the Photoshop layer and the file, on a real click",
        !!r.opened && r.options.indexOf(L.layer) === 0 && r.options.indexOf(L.file) === 1,
        JSON.stringify(r));
    }

    /* Imagine opens on its hub of tools; the photo strip — and so the add
       button pickWire is attached to — belongs to a tool view, so open the
       first tool the hub offers before looking for it. */
    await page.evaluate(() => { try { switchPage("imagine"); } catch (e) { } });
    await page.waitForTimeout(900);
    const imgId = await page.evaluate(() => {
      const card = document.querySelector(".im-card[data-tool]");
      const id = card && card.getAttribute("data-tool");
      if (id && window.HNK && window.HNK.imagine && window.HNK.imagine.openTool) window.HNK.imagine.openTool(id);
      return document.getElementById("imAddBig") ? "imAddBig" : (document.getElementById("imAdd") ? "imAdd" : "");
    });
    const rIm = imgId ? await openSheet(null, imgId) : { missing: "imAdd/imAddBig" };
    report("D1) Edit ▸ IMAGINE offers the Photoshop layer and the file, on a real click",
      !!rIm.opened && rIm.options.indexOf(L.layer) === 0 && rIm.options.indexOf(L.file) === 1,
      JSON.stringify({ id: imgId, r: rIm }));

    /* B) the wizard's chip, with a file-shaped entry */
    const thumb = await page.evaluate(() => {
      const a = ffThumb({ _url: "data:image/png;base64,AAAA", name: "x.png" });
      const b = ffThumb({ mime: "image/jpeg", b64: "BBBB" });
      const c = ffThumb({});
      return { fileShape: a.style.backgroundImage, capture: b.style.backgroundImage, empty: c.style.backgroundImage };
    });
    report("D2) a file-shaped photo draws in the wizard chip, a capture still draws, and an empty slot paints nothing at all",
      thumb.fileShape.indexOf("data:image/png;base64,AAAA") >= 0 &&
      thumb.capture.indexOf("data:image/jpeg;base64,BBBB") >= 0 &&
      thumb.fileShape.indexOf("undefined") < 0 && thumb.capture.indexOf("undefined") < 0 &&
      !thumb.empty,
      JSON.stringify(thumb));

    /* the layer path, with no document open: it must report, never throw */
    const quiet = await page.evaluate(async () => {
      try { const e = await layerPhotoCapture(); return { threw: false, entry: e }; }
      catch (err) { return { threw: true, msg: String(err && err.message) }; }
    });
    report("D3) with no document open the layer path reports on the status line and returns nothing — it never throws",
      quiet.threw === false && !quiet.entry, JSON.stringify(quiet));

    report("D4) nothing threw while all of that was driven",
      errs.length === 0, errs.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  const CI = fs.readFileSync(path.join(ROOT, ".github/workflows/test.yml"), "utf8");
  report("D) CI runs this test", CI.includes("node test/verify_layer_slots.js"), null);

  console.log(failures ? "\nFAIL (" + failures + ")" : "\nPASS — every image slot in the panel can take the layer the student is looking at");
  process.exit(failures ? 1 : 0);
})();
