/* v4.59.0 regression sweep — the ledger covers every vendor, honestly.

   v4.58 booked RunningHub jobs at the amount RunningHub reported. But this
   studio's default provider is Gemini, so the money card was answering a
   question about a minority of the work while saying nothing about the rest.

   The three providers are not comparable and must not be shown as if they
   were:
   - RunningHub reports the exact charge per job and a remaining balance.
   - Google publishes NO per-call charge and NO balance for an API key.
   - OpenAI is the same — the old /dashboard/billing route needs a browser
     session, not a key.

   So for the latter two the app books an exact RUN COUNT, says plainly why
   there is no money figure, and offers one field: the rate the owner reads off
   the vendor's own dashboard. That figure is then labelled as theirs.

   Pinned contracts:
   A) Ledger rows carry a provider, and a row written before this release —
      which has no provider field — reads as RunningHub rather than "unknown".
   B) A vendor that reports no cost contributes ZERO to the money columns. A
      run count is not a price.
   C) The owner's own rate produces an estimate, and that estimate never leaks
      into the reported-money total.
   D) RunningHub renders first even when a free-tier vendor has more runs, and
      only the non-reporting vendors get a rate field.
   E) A Gemini or OpenAI run is booked on the IMAGE, not on the request — a
      safety block or a 503 must not be charged to the owner's tally.
   F) Every new string exists in all nine languages.

   Usage: PORT=8931 node test/sweep_v459_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 250)));
  await page.addInitScript(() => {
    localStorage.setItem("hnk_ws_onboarded", "1");
    localStorage.setItem("hnk_ws_seen", "1");
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const SRC = require("fs").readFileSync("docs/app/index.html", "utf8");
  const r = await page.evaluate((SRC) => {
    const out = {};
    spendClear();
    localStorage.removeItem("hnk_ws_rates");
    spendAdd("rh1", { label: "nano-banana-2" }, { money: 0.05, coins: 11, secs: 8, has: true });
    spendAdd("rh2", { label: "upscale-pro" }, { money: 0.30, coins: 66, secs: 21, has: true });
    for (let i = 0; i < 14; i++) spendNoteRun("gemini", "gemini-3-pro-image-preview", "image");
    for (let i = 0; i < 3; i++) spendNoteRun("openai", "gpt-image-2 1024x1536 high", "image");

    let roll = spendRollup();
    out.A_provs = Object.keys(roll.byProv).sort();
    out.A_counts = { rh: roll.byProv.rh.n, gemini: roll.byProv.gemini.n, openai: roll.byProv.openai.n };
    /* a row from before this release has no `p` and must read as RunningHub */
    const raw = JSON.parse(localStorage.getItem("hnk_ws_spend"));
    delete raw.rows[0].p;
    localStorage.setItem("hnk_ws_spend", JSON.stringify(raw));
    const legacy = spendRollup();
    out.A_legacy = { provs: Object.keys(legacy.byProv).sort(), rh: legacy.byProv.rh.n };

    /* B) a run count is not a price */
    out.B_gemMoney = legacy.byProv.gemini.money;
    out.B_oaMoney = legacy.byProv.openai.money;
    out.B_all = +legacy.all.money.toFixed(4);
    out.B_unknownFlagged = legacy.byProv.gemini.unknown;

    /* C) the owner's rate estimates, and never touches reported money */
    spendRateSet("gemini", null, 0.04);
    const withRate = spendRollup();
    out.C_est = +(withRate.byProv.gemini.est || 0).toFixed(4);
    out.C_moneyUntouched = +withRate.all.money.toFixed(4);
    out.C_gemMoneyStill = withRate.byProv.gemini.money;
    /* a model-specific rate beats the vendor-wide one */
    spendRateSet("gemini", "gemini-3-pro-image-preview", 0.09);
    out.C_specific = spendRate("gemini", "gemini-3-pro-image-preview");
    out.C_vendorWide = spendRate("gemini", "some-other-model");
    spendRateSet("gemini", "gemini-3-pro-image-preview", 0);
    /* clearing a rate removes the estimate rather than storing a zero price */
    spendRateSet("gemini", null, 0);
    out.C_cleared = spendRate("gemini", null);
    spendRateSet("gemini", null, 0.04);

    /* D) render order and which vendors get a rate field */
    localStorage.setItem("hnk_ws_rh_bal", JSON.stringify(
      { money: 42.18, coins: 8436, currency: "USD", apiType: "SHARED", ts: Date.now(), queue: { running: 0, queued: 0, limit: 5 } }));
    RH_LAST_CUR = "USD";
    const b = JSON.parse(localStorage.getItem("hnk_ws_spend")); b.cur = "USD";
    localStorage.setItem("hnk_ws_spend", JSON.stringify(b));
    renderSpend();
    const blocks = Array.from(document.querySelectorAll("#moneyProv .acc-sub"));
    out.D_blocks = blocks.length;
    out.D_first = blocks.length ? (blocks[0].querySelector(".subh") || {}).textContent : "";
    out.D_rateInputs = document.querySelectorAll("#moneyProv input[type=number]").length;
    out.D_rhHasNoRate = blocks.length ? !blocks[0].querySelector("input[type=number]") : false;
    out.D_estShown = document.getElementById("moneyProv").textContent.indexOf("0.56") >= 0;
    out.D_reasonShown = document.getElementById("moneyProv").textContent.indexOf(
      t("money_norate").replace("{V}", "Google Gemini").slice(0, 24)) >= 0;

    /* E) v5.50.0 — the retired vendors' generate/booking paths are GONE from
       the shipped source: no Gemini generateContent dispatch, no
       oaGenerateOne, no api.openai.com. Their ledger rows above are HISTORY
       that the vendor-generic ledger must keep rendering (pinned by A–D).
       The one live booking path is RunningHub's, which books the REPORTED
       charge only after the poll completes (rhBookSpend on `final`). */
    out.E_gemGone = SRC.indexOf("generateContent?key=") < 0 &&
      SRC.indexOf("generativelanguage.googleapis.com") < 0;
    out.E_oaGone = typeof window.oaGenerateOne === "undefined" && SRC.indexOf("api.openai.com") < 0;
    out.E_rhBooksReported = /rhV2PollUntilDone[\s\S]{0,400}?rhBookSpend\(taskId, meta, final\)/.test(SRC);

    /* F) nine languages */
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    const KEYS = ["money_all_short", "money_unrep", "money_norate", "money_rate_ph", "money_est"];
    out.F_missing = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) out.F_missing.push(l + "." + k);
    }));

    spendClear();
    localStorage.removeItem("hnk_ws_rates");
    localStorage.removeItem("hnk_ws_rh_bal");
    return out;
  }, SRC);

  report("A) every row carries a vendor, and a pre-v4.59 row reads as RunningHub",
    r.A_provs.join(",") === "gemini,openai,rh" && r.A_counts.rh === 2 &&
    r.A_counts.gemini === 14 && r.A_counts.openai === 3 &&
    r.A_legacy.provs.join(",") === "gemini,openai,rh" && r.A_legacy.rh === 2,
    { provs: r.A_provs, counts: r.A_counts, legacy: r.A_legacy });
  report("B) a vendor that reports no cost contributes zero money, and says so",
    r.B_gemMoney === 0 && r.B_oaMoney === 0 && r.B_all === 0.35 && r.B_unknownFlagged === 14,
    { gem: r.B_gemMoney, oa: r.B_oaMoney, all: r.B_all, unknown: r.B_unknownFlagged });
  report("C) the owner's rate estimates without ever touching reported money",
    r.C_est === 0.56 && r.C_moneyUntouched === 0.35 && r.C_gemMoneyStill === 0 &&
    r.C_specific === 0.09 && r.C_vendorWide === 0.04 && r.C_cleared === 0,
    { est: r.C_est, money: r.C_moneyUntouched, gem: r.C_gemMoneyStill,
      specific: r.C_specific, wide: r.C_vendorWide, cleared: r.C_cleared });
  report("D) RunningHub renders first, only non-reporting vendors get a rate field",
    r.D_blocks === 3 && r.D_first === "RunningHub" && r.D_rateInputs === 2 &&
    r.D_rhHasNoRate && r.D_estShown && r.D_reasonShown,
    { blocks: r.D_blocks, first: r.D_first, rates: r.D_rateInputs,
      rhNoRate: r.D_rhHasNoRate, est: r.D_estShown, reason: r.D_reasonShown });
  report("E) v5.50.0: the Gemini/OpenAI booking paths are gone with their vendors; RunningHub books the reported charge only after the job completes",
    r.E_gemGone && r.E_oaGone && r.E_rhBooksReported,
    { gemGone: r.E_gemGone, oaGone: r.E_oaGone, rhBooks: r.E_rhBooksReported });
  report("F) every new string exists in all nine languages",
    r.F_missing.length === 0, r.F_missing);

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
