/* v4.57.0 regression sweep — the group badge counts what is on the page.

   stCountControls knew three shapes: input[type=range], .chips rows and
   input[type=color]. It did not know about a bare .chip — the thing
   stToggle/svToggle returns — and it did not know about a prompt field.
   Measured on the shipped v4.56 build: 40 bare chips and 4 prompt fields were
   invisible to it. EV-14 AI Removal is built ENTIRELY from four bare toggles
   plus #ev_removeText, so its badge printed "0 ခု" over five working
   controls; MU-1 One-Tap printed 2 with 4 on screen. A badge that reads 0 on
   a group that works is worse than no badge — it tells the operator the group
   is empty and they never open it.

   Pinned contracts:
   A) A bare chip counts, wherever it hangs. They are appended to three
      different parents (.st-ctl, .row, and .grp-b itself), which is why the
      selector is .chip:not(.chips .chip) and not .st-ctl > .chip — the latter
      would silently miss five.
   B) A chip inside a .chips row is NOT counted twice: the row is the control.
   C) Colour pickers are not counted twice either, though stColorInp gives
      them className "inp st-color".
   D) A prompt field counts — it feeds the render exactly as a slider does.
   E) The 880-pack search boxes do NOT count. A finder is not a control, and
      counting it would have been the same dishonesty in the opposite
      direction, in the very commit meant to end it.
   F) The two named victims read their real size, and neither suite total is
      the pre-fix number any more.
   G) Every group badge equals its own body, and the suite statline on Home
      equals the sum — the law that has held since the counts stopped being
      hand-typed integers.

   Usage: PORT=8931 node test/sweep_v457_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const out = {};
    const byId = id => ST.groups.find(g => (g.el.querySelector(".grp-h") || {}).textContent &&
      g.el.querySelector(".grp-b") && g.el.querySelector(".grp-b").querySelector("#" + id));

    /* A) a bare chip counts, whatever its parent */
    const probe = document.createElement("div");
    probe.innerHTML = '<div class="grp-b">' +
      '<div class="st-ctl"><button class="chip">a</button></div>' +
      '<div class="row"><button class="chip">b</button></div>' +
      '<button class="chip">c</button>' +
      '</div>';
    out.A = stCountControls(probe);                       // want 3

    /* B) chips inside a .chips row stay one control */
    const probe2 = document.createElement("div");
    probe2.innerHTML = '<div class="grp-b"><div class="chips">' +
      '<button class="chip">a</button><button class="chip">b</button>' +
      '<button class="chip">c</button></div></div>';
    out.B = stCountControls(probe2);                       // want 1

    /* C) a colour picker is one control, not two */
    const probe3 = document.createElement("div");
    probe3.innerHTML = '<div class="grp-b"><input type="color" class="inp st-color"></div>';
    out.C = stCountControls(probe3);                       // want 1

    /* D/E) a prompt field counts; a finder does not */
    const probe4 = document.createElement("div");
    probe4.innerHTML = '<div class="grp-b">' +
      '<input type="text" class="inp" id="p1">' +
      '<input type="text" class="inp st-find" id="p2"></div>';
    out.DE = stCountControls(probe4);                       // want 1

    /* the real page: both 880 search boxes must carry the finder class */
    const searches = Array.from(document.querySelectorAll("#muHost .grp-b input.inp[type='text'], #evHost .grp-b input.inp[type='text']"))
      .filter(i => !i.id);
    out.E_found = searches.length;
    out.E_marked = searches.filter(i => i.classList.contains("st-find")).length;

    /* F) the two named victims */
    const grpOf = el => { while (el && !el.classList.contains("grp")) el = el.parentElement; return el; };
    const cntOf = el => { const g = grpOf(el); const c = g && g.querySelector(".cnt"); return c ? parseInt(c.textContent, 10) : null; };
    out.F_ev14 = cntOf(document.getElementById("ev_removeText"));
    out.F_mu1 = cntOf(document.getElementById("stAutoBtn"));

    /* G) every badge equals its own body, and the statline equals the sums.
       Re-implemented, not delegated — a test that calls stCountControls can
       only ever agree with itself. */
    const count = g => {
      const b = g.el.querySelector(".grp-b") || g.el;
      return b.querySelectorAll('input[type="range"]').length
           + b.querySelectorAll(".chips").length
           + b.querySelectorAll('input[type="color"]').length
           + b.querySelectorAll(".chip:not(.chips .chip)").length
           + b.querySelectorAll('input.inp:not([type="color"]):not(.st-find)').length;
    };
    out.G_disagree = ST.groups.filter(g =>
      (g.el.querySelector(".cnt") || {}).textContent !== count(g) + t("unit")).length;
    out.G_mu = ST.groups.filter(g => g.host !== "ev").reduce((a, g) => a + count(g), 0);
    out.G_ev = ST.groups.filter(g => g.host === "ev").reduce((a, g) => a + count(g), 0);
    out.G_statMu = Number(document.getElementById("stMeituCount").textContent);
    out.G_statEv = Number(document.getElementById("stEvotoCount").textContent);
    out.G_constMu = ST_MEITU_COUNT; out.G_constEv = ST_EVOTO_COUNT;
    /* no group may read zero — that was the whole complaint */
    out.G_zeros = ST.groups.filter(g => count(g) === 0)
      .map(g => (g.el.querySelector(".grp-h") || {}).textContent || "?");
    return out;
  });

  report("A) a bare chip counts wherever it hangs — .st-ctl, .row or the body itself",
    r.A === 3, { got: r.A, want: 3 });
  report("B) a .chips row is one control, not one per chip inside it",
    r.B === 1, { got: r.B, want: 1 });
  report("C) a colour picker is not double-counted as an input.inp",
    r.C === 1, { got: r.C, want: 1 });
  report("D/E) a prompt field counts and a finder does not",
    r.DE === 1, { got: r.DE, want: 1 });
  report("E) both 880-pack search boxes carry .st-find",
    r.E_found === 2 && r.E_marked === 2, { found: r.E_found, marked: r.E_marked });
  report("F) EV-14 AI Removal no longer claims to be empty",
    r.F_ev14 === 5, { got: r.F_ev14, want: 5 });
  report("F) MU-1 One-Tap counts all four of its controls",
    r.F_mu1 === 4, { got: r.F_mu1, want: 4 });
  report("G) every group badge equals its own body",
    r.G_disagree === 0, { disagreeing: r.G_disagree });
  report("G) the Home statline equals the measured suite totals",
    r.G_statMu === r.G_mu && r.G_statEv === r.G_ev &&
    r.G_constMu === r.G_mu && r.G_constEv === r.G_ev,
    { statMu: r.G_statMu, measuredMu: r.G_mu, statEv: r.G_statEv, measuredEv: r.G_ev });
  report("G) the totals moved off the pre-fix numbers and no group reads zero",
    r.G_mu > 141 && r.G_ev > 183 && r.G_zeros.length === 0,
    { mu: r.G_mu, ev: r.G_ev, zeros: r.G_zeros });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
