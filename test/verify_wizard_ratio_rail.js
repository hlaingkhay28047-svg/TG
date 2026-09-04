/* v6.4.0 — the shape of the picture, shown as a shape.
 *
 * The owner: "smart workflow card တွေမှာ ratio ရွေးတဲ့အခါ နမူနာလေးတေွ
 * လေးထောင့်ကွက် ထည့်ပေးပါ." The rail that draws those little proportioned
 * boxes has existed since v5.56.0 and the Create card, Text to Image and the
 * Video page all have it. The Smart Workflow wizard — the one screen where a
 * student who does not know what "3:4" means is choosing — did not.
 *
 * NOT BECAUSE IT WAS NEVER WRITTEN. buildWizGenRow calls for it. The wizard
 * builds its whole step OFF-DOCUMENT and appends it at the end, and the
 * attach function looked its select up with document.getElementById, which
 * cannot see a detached element: the call returned on its first line, every
 * time, in silence. The fix takes the element instead of its id, and this
 * file is what keeps the rail on the screen it was written for.
 *
 * Usage: PORT=8931 node test/verify_wizard_ratio_rail.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");
const { withPremium } = require("./_seed_premium.js");

const PORT = process.env.PORT || 8931;
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const TINY_GIF = "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) failures++;
}

(async () => {
  report("A) the rail can be attached to an element, not only to an id in the document",
    /function ratioRailAttach\(selOrId\)/.test(APP) &&
    /typeof selOrId === "string"/.test(APP),
    "ratioRailAttach still takes an id only — a detached wizard step gets no rail");

  const browser = await chromium.launch();
  withPremium(browser);
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errs = [];
    page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
    await page.goto("http://127.0.0.1:" + PORT + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(2400);

    /* the rails the app has always had, so a regression here is named as one */
    const base = await page.evaluate(() => ({
      selRatio: document.querySelectorAll("#selRatioRail .rchip").length,
      t2i: document.querySelectorAll("#selT2IRatioRail .rchip").length,
      vid: document.querySelectorAll("#selVidAspectRail .rchip").length
    }));
    report("B) the Create card, Text to Image and the Video page all still draw their rails",
      base.selRatio > 1 && base.t2i > 1 && base.vid > 1, base);

    /* open a Smart Workflow card and walk to the step that asks for the ratio */
    await page.evaluate(arg => {
      state.refs = [{ mime: "image/gif", b64: arg.gif }, null, null];
      try { renderRefs(); } catch (e) { }
      try { switchPage("pgWf"); } catch (e) { }
      const c = document.querySelector(".wfgrid .wfmini");
      if (c) c.click();
    }, { gif: TINY_GIF });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const fast = document.querySelector(".wiz.on .wiz-fast");
      if (fast) fast.click();
    });
    await page.waitForTimeout(1300);

    const W = await page.evaluate(() => {
      const rail = document.getElementById("wiz_selRatioRail");
      const chips = [...document.querySelectorAll("#wiz_selRatioRail .rchip")];
      const box = c => {
        const i = c.querySelector("i");
        return i ? [parseInt(i.style.width, 10), parseInt(i.style.height, 10)] : null;
      };
      return {
        onStep3: [...document.querySelectorAll(".wiz-dot")].findIndex(d => d.classList.contains("on")) + 1,
        hasSelect: !!document.getElementById("wiz_selRatio"),
        hasRail: !!rail,
        n: chips.length,
        labels: chips.map(c => (c.querySelector("span") || {}).textContent),
        boxes: chips.map(box),
        /* tapping a shape has to actually pick that ratio */
        picked: (() => {
          const target = chips.find(c => (c.querySelector("span") || {}).textContent === "9:16");
          if (!target) return null;
          target.click();
          return {
            select: document.getElementById("wiz_selRatio").value,
            main: document.getElementById("selRatio").value,
            marked: (document.querySelector("#wiz_selRatioRail .rchip.on span") || {}).textContent
          };
        })()
      };
    });

    report("C) the wizard's ratio step draws the rail the owner asked for",
      W.onStep3 === 3 && W.hasSelect && W.hasRail && W.n > 1, W);
    /* the point of the boxes is that they are the SHAPE — a portrait ratio
       must be taller than it is wide, and a landscape one wider than tall */
    const wrong = [];
    W.labels.forEach((lab, i) => {
      const m = /^(\d+):(\d+)$/.exec(lab || "");
      const b = W.boxes[i];
      if (!m || !b) return;
      const rw = +m[1], rh = +m[2];
      if (rw > rh && !(b[0] > b[1])) wrong.push(lab + " is not drawn wide");
      if (rh > rw && !(b[1] > b[0])) wrong.push(lab + " is not drawn tall");
      if (rw === rh && b[0] !== b[1]) wrong.push(lab + " is not drawn square");
    });
    report("D) each little box is the shape it names — portrait tall, landscape wide, square square",
      wrong.length === 0 && W.labels.filter(l => /:/.test(l || "")).length >= 4, wrong);
    report("E) tapping a shape picks that ratio, on the wizard AND on the card it mirrors",
      W.picked && W.picked.select === "9:16" && W.picked.main === "9:16" && W.picked.marked === "9:16",
      W.picked);
    report("F) no page error while the wizard drew it", errs.length === 0, errs.slice(0, 3));
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} FAILURE(S) — a student choosing a ratio in a workflow card still cannot see the shape.`
    : "\nAll checks passed — the ratio is a shape on every screen that asks for one, the workflow cards included.");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error("FAIL — " + (e && e.stack || e)); process.exit(1); });
