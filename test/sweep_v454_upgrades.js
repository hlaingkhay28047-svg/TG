/* v4.54.0 regression sweep — original framing is sacred on every surface.

   Reported by the studio owner: Evoto/Meitu before-after results came back
   with the subject re-framed and the aspect ratio changed.

   The cause: the shared dispatcher appends "Output aspect ratio: X" to the
   request whenever #selRatio is set. V2 Retouch and Path Retouch have always
   blanked that select for the duration of a run — their comments say
   "original framing is sacred in a retouch". Studio's Tier-3 pass and the
   Workflow wizard never did, so whatever the Create page happened to be set
   to rode along invisibly. A 3:2 wedding photo retouched in Studio came back
   as 9:16 with the subject cropped, and the before/after slider then compared
   two different shapes. Neither surface even shows the ratio control: Studio
   is a different page and the wizard is a modal, so the value was always a
   leftover the user could not see.

   Pinned contracts:
   A) The dispatcher only appends an aspect-ratio line when a ratio is set —
      the mechanism the rest of this suite depends on.
   B) Studio's Tier-3 pass sends NO aspect-ratio line even when the Create
      page is set to one, and restores the user's choice afterwards.
   C) Studio's composed prompt states the framing lock in words as well.
   D) The Workflow wizard likewise sends no stale ratio line and restores it.
   E) Studio forces count to 1, so a leftover x4 cannot charge four times for
      one retouch.
   F) The surfaces that already got this right (V2, Path) still do — this is
      the pin that stops the fix being undone in one place and not another.

   Usage: PORT=8931 node test/sweep_v454_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const r = await page.evaluate(async () => {
    const out = {};
    /* capture what the dispatcher would actually send */
    window.__sent = [];
    const realFetch = window.fetch;
    window.fetch = async function (u, o) {
      const url = String(u);
      if (url.indexOf("generativelanguage") >= 0 || url.indexOf("runninghub") >= 0) {
        let body = "";
        try { body = (o && o.body) ? String(o.body) : ""; } catch (e) { }
        window.__sent.push(body);
        return {
          ok: true, status: 200, json: async () => ({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" } }] } }]
          })
        };
      }
      return realFetch(u, o);
    };
    state.key = "test-key";

    const plate = (() => {
      const c = document.createElement("canvas"); c.width = 900; c.height = 600;
      const x = c.getContext("2d"); x.fillStyle = "#c9a227"; x.fillRect(0, 0, 900, 600);
      return c.toDataURL("image/jpeg", 0.9);
    })();
    const pm = plate.match(/^data:([^;]+);base64,(.+)$/);

    /* A) the mechanism: a set ratio really does append the line */
    document.getElementById("selRatio").value = "9:16";
    state.refs[0] = { mime: pm[1], b64: pm[2], label: "t" };
    document.getElementById("prompt").value = "plain create-page run";
    window.__sent = [];
    await document.getElementById("btnGen").onclick();
    out.A_line = window.__sent.some(b => b.indexOf("Output aspect ratio: 9:16") >= 0);

    /* B/E) Studio Tier-3 with the Create page still set to 9:16 */
    switchPage("pgStudio");
    await new Promise(s => setTimeout(s, 300));
    document.getElementById("selRatio").value = "9:16";
    document.getElementById("selCount").value = "4";
    await new Promise(res => ST.loadImage(plate, { done: res }));
    await new Promise(s => setTimeout(s, 700));
    state.st.pend = [{ id: "mu_smooth", v: 50 }];
    window.__sent = [];
    let seenCount = null;
    const cSel = document.getElementById("selCount");
    const origGen = document.getElementById("btnGen").onclick;
    document.getElementById("btnGen").onclick = async function () {
      seenCount = cSel.value;
      return origGen.apply(this, arguments);
    };
    await document.getElementById("btnStGen").onclick();
    document.getElementById("btnGen").onclick = origGen;
    out.B_noRatio = !window.__sent.some(b => b.indexOf("Output aspect ratio") >= 0);
    out.B_sent = window.__sent.length > 0;
    out.B_restored = document.getElementById("selRatio").value === "9:16";
    out.E_count1 = seenCount === "1";
    out.E_countRestored = document.getElementById("selCount").value === "4";

    /* C) the prompt says it too */
    const sp = stComposePrompt();
    out.C_lock = /FRAMING LOCK/.test(sp) && /exact aspect ratio/.test(sp) &&
      /never zoom|Never zoom/.test(sp);

    /* F) the two surfaces that were already right stay right */
    out.F_v2 = /r\.value\s*=\s*""/.test(String(v2DoGenerate));
    out.F_path = /r\.value\s*=\s*""/.test(String(ptDoGenerateOne));

    window.fetch = realFetch;
    state.key = "";
    state.st.pend = [];
    return out;
  });

  report("A) the dispatcher appends an aspect-ratio line only when one is set", r.A_line, r);
  report("B) Studio sends no stale aspect-ratio line and restores the user's choice",
    r.B_sent && r.B_noRatio && r.B_restored, r);
  report("C) Studio's prompt states the framing lock in words", r.C_lock, r);
  /* runWizGenerate lives inside the wizard closure, so it is pinned at source
     level — the same file-based technique other suites use for the site */
  const srcHtml = fs.readFileSync(path.resolve(__dirname, "..", "docs", "app", "index.html"), "utf8");
  const wizFn = srcHtml.slice(srcHtml.indexOf("async function runWizGenerate()"),
                              srcHtml.indexOf("async function runWizGenerate()") + 2500);
  report("D) the Workflow wizard blanks the invisible ratio and restores it",
    wizFn.indexOf('wzR.value=""') >= 0 && wizFn.indexOf("wzR.value=wzSavedRatio") >= 0,
    { found: wizFn.indexOf('wzR.value=""') >= 0, restored: wizFn.indexOf("wzR.value=wzSavedRatio") >= 0 });
  report("E) Studio forces count to 1 so a leftover x4 can't charge four times",
    r.E_count1 && r.E_countRestored, r);
  report("F) V2 Retouch and Path Retouch still blank the ratio too", r.F_v2 && r.F_path, r);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
