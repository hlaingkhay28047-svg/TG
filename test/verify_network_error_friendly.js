/* Regression test for a bug found by a full-app real-browser audit after
   v4.15.1: when a fetch() call to Gemini fails at the network layer (no
   HTTP response at all — e.g. the device loses its connection mid-request),
   the raw, untranslated "TypeError: Failed to fetch" was shown verbatim to
   the user regardless of their chosen language, on both the Create page
   (the shared $("btnGen") dispatcher) and Retouch Studio (which delegates
   to the same dispatcher) — inconsistent with the rest of the app, which is
   careful to localize every other error path (RunningHub/OpenAI already
   went through rhFriendly()/oaFriendly(); only the raw-network-exception
   case on the Gemini path was missed).
   Fix: friendlyError(e) recognizes network-level failures and returns a
   localized "check your internet" message instead of the raw exception.
   Usage: PORT=8931 node test/verify_network_error_friendly.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  // simulate a real network-layer failure: fetch() rejects before any
  // response is ever received, exactly like a dropped connection would
  await page.addInitScript(() => {
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      if (String(url).indexOf(":generateContent") >= 0) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      return realFetch.apply(this, arguments);
    };
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    state.key = "TEST_KEY";
    window.scrollTo = function () {}; Element.prototype.scrollIntoView = function () {};
  });

  let allOk = true;
  function report(name, ok, extra) {
    console.log((ok ? "PASS" : "FAIL") + " (" + name + ")" + (extra ? " :: " + extra : ""));
    if (!ok) allOk = false;
  }

  // 1) Create page: a dropped connection must surface a localized message,
  // not the raw "TypeError: Failed to fetch"
  const createResult = await page.evaluate(async () => {
    switchPage("pgCreate");
    document.getElementById("prompt").value = "a test prompt";
    document.getElementById("btnGen").onclick();
    for (let w = 0; w < 100 && document.getElementById("stGen").textContent === ""; w++) await new Promise(r => setTimeout(r, 30));
    return { statusText: document.getElementById("stGen").textContent, retryShown: document.getElementById("btnRetry").style.display !== "none" };
  });
  console.log("create network-failure status:", JSON.stringify(createResult));
  report("Create shows a localized message (not a raw TypeError) on a dropped connection", !/TypeError|Failed to fetch/i.test(createResult.statusText) && createResult.retryShown, JSON.stringify(createResult));

  // 2) Retouch Studio (delegates to the same shared dispatcher): same check
  const retouchResult = await page.evaluate(async (b64) => {
    switchPage("pgRetouch");
    state.refs = [{ mime: "image/png", b64: b64, label: "before" }, null, null];
    renderRefs();
    document.querySelectorAll("#rsPresetGrid .chip")[0].click();
    for (let w = 0; w < 100 && document.getElementById("stRsGen").textContent === ""; w++) await new Promise(r => setTimeout(r, 30));
    return { statusText: document.getElementById("stRsGen").textContent, retryShown: document.getElementById("btnRsRetry").style.display !== "none" };
  }, B64);
  console.log("retouch network-failure status:", JSON.stringify(retouchResult));
  report("Retouch Studio shows a localized message (not a raw TypeError) on a dropped connection", !/TypeError|Failed to fetch/i.test(retouchResult.statusText) && retouchResult.retryShown, JSON.stringify(retouchResult));

  // 3) localization actually applies (not just English) — check a couple of languages
  const langResult = await page.evaluate(async () => {
    window.LANG = "zh";
    var msg = friendlyError(new TypeError("Failed to fetch"));
    return { zhMsg: msg, hasChinese: /[一-鿿]/.test(msg) };
  });
  console.log("zh localization:", JSON.stringify(langResult));
  report("friendlyError() actually localizes (zh contains Chinese characters)", langResult.hasChinese, JSON.stringify(langResult));

  console.log("\n" + (allOk ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(allOk ? 0 : 1);
})();
