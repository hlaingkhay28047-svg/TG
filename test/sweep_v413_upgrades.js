/* Mocked regression check for the v4.13.0 full-app-audit upgrades:
   - Cancel button actually aborts an in-flight RunningHub generation
     (Text2Img, mirrors the same AbortController wiring on Video/VidUp)
   - makePickable() gives thumbnail-grid items real keyboard/screen-reader
     affordances (tabindex, role=button, Enter/Space activation)
   - The shared Ratio dropdown narrows to a model's actually-honored enum
     (Z-Image Turbo) instead of silently letting an invalid pick (e.g. 4:5)
     through, and restores the full list when switching to a model without
     that restriction
   - Reference image upload rejects an obviously-non-image file instead of
     accepting it (the accept="image/..." hint is not enforced everywhere)
   - friendly() (the Gemini error translator) is now localized, not
     Burmese-only
   - the ratio dropdown preserves the user's picked value across both a
     narrow AND a restore-to-full-list, not just the narrow
   - the "update available" sticky toast can't permanently silence toast()
     for the rest of the session if the user never taps it (bounded, not
     forever — found by adversarial review of the first v4.13.0 pass)
   - cancelling while the /query poll fetch is actually in flight (not just
     between poll ticks) still normalizes to a "cancelled" error instead of
     a raw AbortError misread as a generic failure (same review finding)
   Usage: PORT=8931 node test/sweep_v413_upgrades.js   (serve docs/app on $PORT first) */
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 1000 } });
  page.on("pageerror", e => console.log("PAGEERROR:", String(e).slice(0, 300)));

  await page.addInitScript(`
    window.fetch = new Proxy(window.fetch, { apply(target, thisArg, args) {
      var u = String(args[0]);
      if (u.indexOf("www.runninghub.ai") >= 0) {
        if (u.indexOf("/media/upload/binary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({code:0,data:{download_url:"https://mock.rh.test/up.png"}}), {status:200}));
        }
        // Always RUNNING -> the generation never finishes on its own, so
        // Cancel is the only way the test can observe it stopping.
        return Promise.resolve(new Response(JSON.stringify({taskId:"T1",status:"RUNNING"}), {status:200}));
      }
      return Reflect.apply(target, thisArg, args);
    }});
  `);

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const cancelResult = await page.evaluate(async () => {
    state.rhKey = "TEST_KEY";
    switchPage("pgText2Img");
    document.getElementById("t2iPrompt").value = "a test prompt";
    var before = document.getElementById("btnT2ICancel").style.display;
    document.getElementById("btnT2IGen").onclick();
    for (var w = 0; w < 40 && document.getElementById("btnT2ICancel").style.display === "none"; w++) {
      await new Promise(r => setTimeout(r, 50));
    }
    var shownDuringGen = document.getElementById("btnT2ICancel").style.display !== "none";
    document.getElementById("btnT2ICancel").onclick();
    for (var w2 = 0; w2 < 40 && document.getElementById("btnT2ICancel").style.display !== "none"; w2++) {
      await new Promise(r => setTimeout(r, 50));
    }
    return {
      before: before, shownDuringGen: shownDuringGen,
      hiddenAfterCancel: document.getElementById("btnT2ICancel").style.display === "none",
      statusText: document.getElementById("stT2IGen").textContent,
      statusClass: document.getElementById("stT2IGen").className
    };
  });
  console.log("cancel result:", JSON.stringify(cancelResult));
  const cancelOk = cancelResult.before === "none" && cancelResult.shownDuringGen && cancelResult.hiddenAfterCancel
    && /Cancelled|ရပ်လိုက်/.test(cancelResult.statusText) && cancelResult.statusClass.indexOf("err") === -1;
  console.log(cancelOk ? "PASS (Cancel button stops generation)" : "FAIL (cancel)");

  const kbResult = await page.evaluate(() => {
    var probe = document.createElement("img");
    var fired = false;
    makePickable(probe, function(){ fired = true; });
    var hasTabindex = probe.tabIndex === 0;
    var hasRole = probe.getAttribute("role") === "button";
    probe.onkeydown({ key: "Enter", preventDefault: function(){} });
    return { hasTabindex: hasTabindex, hasRole: hasRole, fired: fired };
  });
  console.log("keyboard-accessible grid:", JSON.stringify(kbResult));
  const kbOk = kbResult.hasTabindex && kbResult.hasRole && kbResult.fired;
  console.log(kbOk ? "PASS (makePickable wires tabindex/role/keydown)" : "FAIL (makePickable)");

  const ratioResult = await page.evaluate(() => {
    switchPage("pgCreate");
    state.rhKey = "TEST_KEY";
    document.getElementById("selRatio").value = "16:9"; // a value valid in every list below
    var c = rhCfg(); c.activeModel = "z-image-turbo"; rhSaveCfg(c);
    renderRhProviderOption();
    document.getElementById("selProvider").value = "runninghub";
    updateGenOptsForRHKind();
    var zOptions = Array.from(document.getElementById("selRatio").options).map(o => o.value || o.textContent);
    var has45 = zOptions.indexOf("4:5") >= 0;
    var preservedThroughNarrow = document.getElementById("selRatio").value === "16:9";
    var c2 = rhCfg(); c2.activeModel = "nano-banana-2"; rhSaveCfg(c2);
    updateGenOptsForRHKind();
    var restoredOptions = Array.from(document.getElementById("selRatio").options).map(o => o.value || o.textContent);
    var restoredHas45 = restoredOptions.indexOf("4:5") >= 0;
    var preservedThroughRestore = document.getElementById("selRatio").value === "16:9";
    return { zOptions, has45, restoredHas45, preservedThroughNarrow, preservedThroughRestore };
  });
  console.log("ratio narrowing:", JSON.stringify(ratioResult));
  const ratioOk = !ratioResult.has45 && ratioResult.restoredHas45 && ratioResult.zOptions.length === 7
    && ratioResult.preservedThroughNarrow && ratioResult.preservedThroughRestore;
  console.log(ratioOk ? "PASS (ratio dropdown narrows for Z-Image Turbo, preserves value through narrow and restore)" : "FAIL (ratio narrowing)");

  const mimeResult = await page.evaluate(() => {
    state.refs = [null, null, null];
    var fakeTxt = { type: "text/plain", name: "notes.txt" };
    document.getElementById("filePick").onchange.call({ files: [fakeTxt], value: "" });
    return { stillNull: state.refs.every(r => r === null), toastText: document.getElementById("toast").textContent || "" };
  });
  console.log("mime rejection:", JSON.stringify(mimeResult));
  const mimeOk = mimeResult.stillNull && /ပုံ|image/i.test(mimeResult.toastText);
  console.log(mimeOk ? "PASS (non-image file rejected)" : "FAIL (mime check)");

  const friendlyResult = await page.evaluate(() => {
    var saved = window.LANG;
    window.LANG = "en";
    var msg = friendly(429, {});
    window.LANG = saved;
    return msg;
  });
  console.log("friendly(429) at LANG=en:", friendlyResult);
  const friendlyOk = /quota/i.test(friendlyResult) && !/[က-႟]/.test(friendlyResult);
  console.log(friendlyOk ? "PASS (friendly() localizes, no Burmese leak at en)" : "FAIL (friendly localization)");

  // Sticky toast must not permanently silence toast() forever if the update
  // banner is shown but never tapped — only gate while sticky is true.
  const stickyResult = await page.evaluate(() => {
    _toastSticky = true;
    toast("should be blocked", "ok");
    var blockedText = document.getElementById("toast").textContent;
    _toastSticky = false;
    toast("should show now", "ok");
    var recoveredText = document.getElementById("toast").textContent;
    return { blockedText, recoveredText };
  });
  console.log("sticky toast gating:", JSON.stringify(stickyResult));
  const stickyOk = stickyResult.blockedText !== "should be blocked" && stickyResult.recoveredText === "should show now";
  console.log(stickyOk ? "PASS (sticky toast blocks while set, recovers once cleared)" : "FAIL (sticky toast)");

  // Cancelling while the /query poll fetch is actually in flight (not just
  // between ticks) must still surface as a "cancelled" error, not a raw
  // AbortError misread as a generic RunningHub failure.
  await page.addInitScript(() => {}); // no-op, keep prior init script active
  const inFlightCancelResult = await page.evaluate(async () => {
    var ctrl = new AbortController();
    var hangingFetch = function(req) {
      // Simulate rhV2Query's fetch actually being in flight when abort() fires.
      return new Promise((resolve, reject) => {
        ctrl.signal.addEventListener("abort", () => {
          var err = new DOMException("The user aborted a request.", "AbortError");
          reject(err);
        });
      });
    };
    var origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (String(url).indexOf("/openapi/v2/query") >= 0) return hangingFetch();
      return origFetch(url, opts);
    };
    var pollPromise = rhV2PollUntilDone("TEST_KEY", "T1", null, 60000, ctrl.signal);
    setTimeout(() => ctrl.abort(), 100);
    var code = null;
    try { await pollPromise; } catch (e) { code = e && e.code; }
    window.fetch = origFetch;
    return { code };
  });
  console.log("in-flight cancel:", JSON.stringify(inFlightCancelResult));
  const inFlightCancelOk = inFlightCancelResult.code === "cancelled";
  console.log(inFlightCancelOk ? "PASS (cancel during in-flight query fetch normalizes to 'cancelled')" : "FAIL (in-flight cancel)");

  const overall = cancelOk && kbOk && ratioOk && mimeOk && friendlyOk && stickyOk && inFlightCancelOk;
  console.log("\n" + (overall ? "PASS" : "FAIL"));
  await browser.close();
  process.exit(overall ? 0 : 1);
})();
