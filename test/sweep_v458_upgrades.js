/* v4.58.0 regression sweep — the money is on screen.

   The studio ran eighty photos a night against a prepaid RunningHub balance
   it could only see by opening another tab, and the GENERATE button said
   "3 AI" — a count of fragments, not a price. Topaz 6x and Z-Image Turbo are
   not the same money.

   RunningHub answers all three questions and this app was ignoring two of
   them. The /query response the poller already fetches every 2.5s carries
   `usage` {consumeMoney, consumeCoins, taskCostTime, thirdPartyConsumeMoney}
   and a `taskUsageList` for jobs that fan out into sub-tasks; that is the
   amount actually charged, not an estimate, and it has been thrown away since
   v4.9.

   Pinned contracts:
   A) Usage is read the same whether the host answers flat ({taskId,usage}) or
      wrapped ({code,msg,data}). openapi/v2 answers this app flat — rhV2Submit
      reads j.taskId — while /uc/ paths use the older envelope, so a reader
      that knows only one shape silently books every job at zero.
   B) Sub-task usage sums, and a parent that also appears in taskUsageList is
      not counted twice.
   C) A job RunningHub reported no numbers for is has:false — visible as
      "cost not reported", never a confident 0.00 that hides real spend.
   D) The ledger is idempotent per taskId (the poller can settle twice), rolls
      up by day and by model, and its lifetime total survives the row cap.
   E) fmtMoney does not round a fraction of a cent away: 0.0125 must not print
      as "0.01".
   F) The request body is built by its own function, so the quote is taken
      against the exact payload the submit would send — a quote for a
      different body is a quote for a different job.
   G) The balance is stored and rendered, coins and money are never invented
      from one another, and both cards exist with all nine languages behind
      every string.

   Usage: PORT=8931 node test/sweep_v458_upgrades.js  (serve docs/app first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}
const near = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
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

    /* A) both envelopes read the same */
    const flat = { taskId: "t1", status: "SUCCESS",
      usage: { consumeMoney: "0.05", consumeCoins: "12", taskCostTime: "9" } };
    const a1 = rhUsageOf(flat), a2 = rhUsageOf({ code: 0, msg: "success", data: flat });
    out.A = { money: a1.money, coins: a1.coins, secs: a1.secs, same: JSON.stringify(a1) === JSON.stringify(a2) };
    /* a flat response that happens to own a `data` key must not be gutted */
    out.A_nocode = rhUsageOf({ taskId: "t", data: { nope: 1 }, usage: { consumeMoney: "0.01" } }).money;

    /* B) sub-tasks sum; a parent already in the list is not double-counted */
    out.B_dedup = rhUsageOf({
      taskId: "p", usage: { consumeMoney: "0.10" },
      taskUsageList: [
        { taskId: "p", usage: { consumeMoney: "0.10" } },
        { taskId: "c1", usage: { consumeMoney: "0.02" } },
        { taskId: "c2", usage: { consumeMoney: "0.03" } }]
    }).money;
    out.B_add = rhUsageOf({
      taskId: "p2", usage: { consumeMoney: "0.10" },
      taskUsageList: [{ taskId: "c1", usage: { consumeMoney: "0.02" } }]
    }).money;
    /* thirdPartyConsumeMoney is real money too and must be included */
    out.B_third = rhUsageOf({ taskId: "z", usage: { consumeMoney: "0.01", thirdPartyConsumeMoney: "0.04" } }).money;

    /* C) nothing reported is not zero-with-confidence */
    const none = rhUsageOf({ taskId: "x", status: "SUCCESS" });
    out.C = { has: none.has, money: none.money };

    /* D) the ledger */
    spendClear();
    spendAdd("a1", { kind: "image", label: "nano-banana-2" }, rhUsageOf(flat));
    spendAdd("a1", { kind: "image", label: "nano-banana-2" }, rhUsageOf(flat));   /* twice */
    spendAdd("a2", { kind: "image", label: "upscale-pro" }, rhUsageOf({ usage: { consumeMoney: "0.30" } }));
    spendAdd("a3", { kind: "image", label: "nano-banana-2" }, rhUsageOf({ taskId: "q" }));
    const roll = spendRollup();
    out.D_rows = roll.rows.length;
    out.D_today = +roll.today.money.toFixed(6);
    out.D_unknown = roll.today.unknown;
    out.D_models = Object.keys(roll.byModel).sort();
    out.D_newestFirst = roll.rows[0].id === "a3";
    /* the cap keeps the lifetime total true */
    spendClear();
    for (let i = 0; i < 405; i++) spendAdd("k" + i, { label: "m" }, { money: 1, coins: 0, secs: 0, has: true });
    const big = spendRollup();
    out.D_cap = { rows: big.rows.length, allN: big.all.n, allMoney: Math.round(big.all.money), trimmed: big.trimmed };

    /* re-seed a small, known book for the render checks */
    spendClear();
    spendAdd("r1", { label: "nano-banana-2" }, rhUsageOf(flat));
    spendAdd("r2", { label: "upscale-pro" }, rhUsageOf({ usage: { consumeMoney: "0.30" } }));
    spendAdd("r3", { label: "nano-banana-2" }, rhUsageOf({ taskId: "q" }));

    /* E) a fraction of a cent survives */
    out.E = [fmtMoney(0.0125, "USD"), fmtMoney(0.05, "USD"), fmtMoney(1.5, "USD"), fmtMoney(0, "USD"), fmtMoney(2, "")];

    /* F) the body builder exists and is what submit uses */
    out.F_fn = typeof rhV2Body === "function";
    out.F_used = String(rhV2Submit).indexOf("rhV2Body(") >= 0;
    const b = rhV2Body("alibaba/qwen-image-2.0/image-edit", ["u1"], "hello", "3:4", "2k",
      { id: "qwen-image-2", sizeParam: true, promptMax: 800 });
    out.F_body = b;
    /* the quote must ask for the same resolution the dispatcher would send */
    out.F_quoteRes = String(stQuoteCost).indexOf("rhV2Resolution") >= 0;
    /* an upscale model submits a DIFFERENT body (rhV2SubmitUpscale), so it
       must not be quoted from rhV2Body — a quote for the wrong body is worse
       than no quote */
    out.F_skipUpscale = String(stQuoteCost).indexOf('a.kind==="upscale"') >= 0;
    /* the quote cache must remember a MISS, or an unsupported/CORS-blocked
       price-preview is re-requested on every slider move */
    out.F_cacheMiss = String(stQuoteCost).indexOf("hasOwnProperty") >= 0 &&
      String(stQuoteCost).indexOf("ST_QUOTE.hits[key]=q") >= 0;
    /* and a late response for a superseded key must not paint the line */
    out.F_seq = String(stQuoteCost).indexOf("ST_QUOTE.seq") >= 0;
    /* painting a null quote must clear the line rather than leave a stale price */
    (function () {
      const line = document.getElementById("stGenCost");
      stQuotePaint({ price: 0.2, currency: "USD", freeNow: false });
      out.F_paintPrice = line.textContent;
      stQuotePaint(null);
      out.F_paintNull = line.textContent;
      stQuotePaint({ freeNow: true, freeLeft: 7 });
      out.F_paintFree = line.textContent;
      out.F_paintFreeCls = line.className;
      stQuotePaint(null);
    })();

    /* G) balance rendering + the cards */
    localStorage.setItem("hnk_ws_rh_bal", JSON.stringify(
      { money: 12.5, coins: 880, currency: "USD", apiType: "SHARED", ts: Date.now(), queue: { running: 1, queued: 2, limit: 5 } }));
    renderSpend();
    out.G_bal = (document.getElementById("moneyBal") || {}).textContent;
    out.G_meta = (document.getElementById("moneyMeta") || {}).textContent;
    out.G_today = (document.getElementById("moneyToday") || {}).textContent;
    out.G_runs = document.querySelectorAll("#moneyRuns .acc-kv").length;
    out.G_subh = document.querySelectorAll("#moneyRuns .subh, #moneyByModel .subh").length;
    out.G_byModel = document.querySelectorAll("#moneyByModel .acc-kv").length;
    out.G_dash = getComputedStyle(document.getElementById("dashMoney")).display !== "none";
    out.G_unknownShown = document.getElementById("moneyRuns").textContent.indexOf(t("money_unknown")) >= 0;
    out.G_queueShown = document.getElementById("moneyMeta").textContent.indexOf("5") >= 0;
    /* coins alone must not become money, and money alone must not become coins */
    out.G_coinsOnly = balText({ coins: 880, money: null, currency: "" });
    /* money-only accounts still get a headline, coins-only accounts fall back to coins */
    out.G_bigCoins = balText({ coins: 880, money: null, currency: "" }, true);
    out.G_moneyOnly = balText({ coins: null, money: 3, currency: "USD" });
    out.G_neither = balText({ coins: null, money: null });

    /* every new string in all nine languages */
    const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
    const KEYS = ["money_h", "money_intro", "money_bal", "money_today", "money_month", "money_runs",
      "money_refresh", "money_runs_t", "money_never", "money_checked", "money_queue", "money_fail",
      "money_nokey", "money_empty", "money_unknown", "money_trim", "money_csv", "money_clear",
      "money_cleared", "money_all", "money_bymodel", "money_recent", "money_more", "cost_ran", "cost_quote", "cost_free", "cost_free_any", "job_age_now"];
    out.G_missing = [];
    KEYS.forEach(k => LANGS.forEach(l => {
      const v = TR[k] && TR[k][l];
      if (typeof v !== "string" || !v.trim()) out.G_missing.push(l + "." + k);
    }));

    /* the quote line is present and silent with nothing pending */
    out.G_quoteEl = !!document.getElementById("stGenCost");
    out.G_quoteQuiet = (document.getElementById("stGenCost") || {}).textContent === "";

    /* the ledger key is its own — the 12h job registry must not be able to
       expire the accounts */
    out.G_sep = RH_SPEND_LS !== RH_JOBS_LS;
    /* and every paid surface books through one place */
    out.G_hook = String(rhPollTracked).indexOf("rhBookSpend") >= 0;

    spendClear();
    localStorage.removeItem("hnk_ws_rh_bal");
    return out;
  });

  report("A) usage reads the same from a flat response and a {code,data} envelope",
    r.A.same && near(r.A.money, 0.05) && r.A.coins === 12 && r.A.secs === 9 && near(r.A_nocode, 0.01), r.A);
  report("B) sub-task usage sums, a repeated parent is not double-counted, third-party money counts",
    near(r.B_dedup, 0.15) && near(r.B_add, 0.12) && near(r.B_third, 0.05),
    { dedup: r.B_dedup, add: r.B_add, third: r.B_third });
  report("C) a job with no reported cost is unknown, not free",
    r.C.has === false && r.C.money === 0, r.C);
  report("D) the ledger is idempotent, rolls up by day and model, newest first",
    r.D_rows === 3 && near(r.D_today, 0.35) && r.D_unknown === 1 &&
    r.D_models.join(",") === "nano-banana-2,upscale-pro" && r.D_newestFirst,
    { rows: r.D_rows, today: r.D_today, unknown: r.D_unknown, models: r.D_models, newestFirst: r.D_newestFirst });
  report("D) the lifetime total survives the row cap",
    r.D_cap.rows === 400 && r.D_cap.allN === 405 && r.D_cap.allMoney === 405 && r.D_cap.trimmed === 5, r.D_cap);
  report("E) a fraction of a cent is not rounded away",
    r.E[0] === "0.0125 USD" && r.E[1] === "0.05 USD" && r.E[2] === "1.50 USD" && r.E[3] === "0 USD" && r.E[4] === "2.00",
    r.E);
  report("F) the quote is built from the same body builder the submit uses",
    r.F_fn && r.F_used && r.F_body.size === "1080*1440" && r.F_body.prompt === "hello" && r.F_quoteRes,
    { fn: r.F_fn, used: r.F_used, body: r.F_body, res: r.F_quoteRes });
  report("F) an upscale model is not quoted from the image-edit body",
    r.F_skipUpscale, r.F_skipUpscale);
  report("F) a failed quote is cached as a miss and a superseded response cannot paint",
    r.F_cacheMiss && r.F_seq, { cacheMiss: r.F_cacheMiss, seq: r.F_seq });
  report("F) the quote line paints a price, a free run, and clears on no quote",
    r.F_paintPrice.indexOf("0.20") >= 0 && r.F_paintNull === "" &&
    r.F_paintFree.indexOf("7") >= 0 && r.F_paintFreeCls === "free",
    { price: r.F_paintPrice, cleared: r.F_paintNull, free: r.F_paintFree, cls: r.F_paintFreeCls });
  /* the headline cell carries money alone — measured at 390px, the joined
     "42.18 USD · 8436 RH" wraps and drops its caption below the neighbouring
     two, so the statline stops reading as a row. Coins keep the meta line. */
  report("G) the balance renders without inventing one unit from the other",
    r.G_bal === "12.50 USD" && r.G_meta.indexOf("880 RH") >= 0 &&
    r.G_coinsOnly === "880 RH" && r.G_moneyOnly === "3.00 USD" && r.G_neither === "—",
    { bal: r.G_bal, meta: r.G_meta, coinsOnly: r.G_coinsOnly, moneyOnly: r.G_moneyOnly, neither: r.G_neither });
  report("G) both cards render the book, the queue and the unknown row",
    r.G_today === "0.35" && r.G_runs === 3 && r.G_byModel === 2 && r.G_dash &&
    r.G_unknownShown && r.G_queueShown && r.G_subh === 2 && r.G_bigCoins === "880 RH",
    { today: r.G_today, runs: r.G_runs, byModel: r.G_byModel, dash: r.G_dash,
      unknown: r.G_unknownShown, queue: r.G_queueShown, subheads: r.G_subh, bigCoins: r.G_bigCoins });
  report("G) every new string exists in all nine languages",
    r.G_missing.length === 0, r.G_missing);
  report("G) the quote line exists and stays silent with nothing pending",
    r.G_quoteEl && r.G_quoteQuiet, r);
  report("G) the ledger is separate from the 12h job registry and every paid surface books through one hook",
    r.G_sep && r.G_hook, { separate: r.G_sep, hook: r.G_hook });

  report("no page errors", pageErrors.length === 0, pageErrors);
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
