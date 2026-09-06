/* v6.27.0 — CROSS-ENGINE PRELOAD. Every browser test in this suite opens
   `require("playwright").chromium`. The cross-engine lane preloads this file
   (NODE_OPTIONS=--require) with HNK_ENGINE=webkit or firefox, and the same
   test then runs, unchanged, on that engine. Nothing happens without the
   variable, so the ordinary Chromium run is byte-for-byte what it was.

   SERVICE WORKERS ARE BLOCKED ON THE SWAPPED ENGINES. Lane run #5 measured
   why: sweep_v492_gridfit G2 failed on WebKit with a 404 for
   /api/v1/me/entitlement — a request the premium fixture answers through
   context.route(). The app's service worker claims its page as soon as it
   activates; once it has, WebKit and Firefox perform the page's fetches from
   the worker, and Playwright's route() does not reach requests made through a
   service worker on those engines (it does on Chromium). Whether the worker
   had activated before the entitlement fetch was a race the fixture lost at
   the third viewport. The lane measures layout and behaviour, not the worker,
   so every context on a swapped engine passes Playwright's own
   serviceWorkers:"block" (an init script that stubs
   navigator.serviceWorker.register); the Chromium gate keeps the worker. */
const eng = process.env.HNK_ENGINE;

function blockServiceWorkers(browserType) {
  const launch = browserType.launch.bind(browserType);
  browserType.launch = async function (opts) {
    const browser = await launch(opts);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = (o) => newContext(Object.assign({ serviceWorkers: "block" }, o || {}));
    const newPage = browser.newPage.bind(browser);
    browser.newPage = (o) => newPage(Object.assign({ serviceWorkers: "block" }, o || {}));
    return browser;
  };
  return browserType;
}

if (eng && eng !== "chromium") {
  const pw = require("playwright");
  if (!pw[eng]) throw new Error("HNK_ENGINE must be webkit or firefox, got " + eng);
  Object.defineProperty(pw, "chromium", { value: blockServiceWorkers(pw[eng]), configurable: true, enumerable: true });
}

module.exports = { blockServiceWorkers };
