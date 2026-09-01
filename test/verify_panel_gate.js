/* v6.24.0 — browser proof for the server-authorized Photoshop panel gate.

   The database/API matrix is exercised by verify_unified_* backend tests. This
   file loads the real tracked panel source behind a small UXP shim and proves
   that the visible product follows those server verdicts: no session, offline,
   device conflict and Update Required stay locked; a live lease opens; pairing
   is sent; focus triggers a fresh validation. */
"use strict";

const { chromium } = require("playwright-core");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PANEL = path.join(ROOT, "panel");
const indexHtml = fs.readFileSync(path.join(PANEL, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(PANEL, "main.js"), "utf8");
let failures = 0;

function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : " :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

report("A1) authorization overlay ships visible and fail-closed",
  /<div id="hnkGate"[^>]*>/.test(indexHtml) &&
  !/<div id="hnkGate"[^>]*class="[^"]*\boff\b/.test(indexHtml), {});
report("A2) panel source uses the unified API without the retired Supabase host",
  mainJs.includes("https://hnk-ai-tools-3-s4nnu.ondigitalocean.app/api") &&
  !/vmtwuuybnalefpgvrast|sb_publishable_/i.test(mainJs), {});
report("A3) every protected provider image call begins with live lease validation",
  /async function callImageAPI\s*\([^)]*\)\s*\{\s*await gateRequireLease\(\)/.test(mainJs), {});
/* 2026-08-30 owner instruction: the pairing-code step is REMOVED — the gate
   must have the sign-in controls and must NOT reintroduce the code input. */
report("A4) gate controls exist and the retired pairing input stays gone",
  ["gateEmail", "gatePass", "gateSignIn", "gateRetry", "gateSignOut"]
    .every(id => indexHtml.includes(`id="${id}"`)) &&
  !indexHtml.includes('id="gatePairCode"') && !mainJs.includes("pairing_code"), {});
report("A6) the whole gate card ships visible — no per-state hidden groups (v6.26.1)",
  !/gate-hide/.test(indexHtml) && !/gate-hide/.test(mainJs), {});
report("A7) the gate identity square can carry the member photo within web-app bounds (v6.26.2)",
  indexHtml.includes('id="gateLogoImg"') && indexHtml.includes('id="gateLogoTxt"') &&
  mainJs.includes("data:image\\/(jpeg|png|webp);base64") &&
  /GATE_AVA_MAX\s*=\s*98304/.test(mainJs), {});

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml",
  ".json": "application/json", ".woff2": "font/woff2", ".webp": "image/webp" };
/* The visual icon library is deliberately excluded from Git until its
   redistribution provenance is approved. This authorization-only browser
   proof therefore supplies a deterministic pixel for the three initial-view
   images it loads. Missing JS, CSS, HTML and every other resource still return
   404 and remain visible to the console-error assertion below. */
const GATE_ICON_PATHS = new Set([
  "icons/plugin@2x.png",
  "icons/hero-banner.jpg",
  "icons/banners/studio.jpg",
]);
const GATE_ICON_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
report("A5) the gate harness isolates only the three excluded initial-view images",
  GATE_ICON_PATHS.size === 3 && GATE_ICON_PATHS.has("icons/plugin@2x.png") &&
  GATE_ICON_PATHS.has("icons/hero-banner.jpg") &&
  GATE_ICON_PATHS.has("icons/banners/studio.jpg"), {});
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const abs = path.resolve(PANEL, rel);
  if (GATE_ICON_PATHS.has(rel)) {
    res.writeHead(200, { "Content-Type": "image/gif", "Cache-Control": "no-store" });
    res.end(GATE_ICON_PIXEL); return;
  }
  if (!abs.startsWith(PANEL + path.sep) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
  res.end(fs.readFileSync(abs));
});

const UID = "77777777-8888-4999-aaaa-bbbbbbbbbbbb";
const future = days => new Date(Date.now() + days * 86400000).toISOString();

function initScript(cfg) {
  return `(function(){
    window.__cfg = ${JSON.stringify(cfg)};
    window.__reqs = [];
    window.__validateCalls = 0;
    var settings = JSON.stringify(window.__cfg.settings || {});
    var file = {
      read: function(){ return Promise.resolve(settings); },
      write: function(txt){ settings = txt; window.__saved = txt; return Promise.resolve(); }
    };
    var folder = {
      getEntry: function(){ return settings === null ? Promise.reject(new Error("none")) : Promise.resolve(file); },
      createFile: function(){ return Promise.resolve(file); }
    };
    var uxp = {
      storage: { localFileSystem: { getDataFolder: function(){ return Promise.resolve(folder); } }, formats: { utf8: "utf8" } },
      shell: { openExternal: function(u){ window.__opened = u; return Promise.resolve(); }, openPath: function(){ return Promise.resolve(); } },
      entrypoints: { setup: function(){} }
    };
    var ps = { app: { documents: [] }, core: { executeAsModal: function(){} }, imaging: {},
      action: { batchPlay: function(){ return Promise.resolve([]); } }, constants: {} };
    window.require = function(name){
      if (name === "photoshop") return ps;
      if (name === "uxp") return uxp;
      if (name === "os") return { platform: function(){ return "test"; } };
      return {};
    };
    var realFetch = window.fetch.bind(window);
    function json(body, status){ return Promise.resolve(new Response(JSON.stringify(body),
      { status: status || 200, headers: { "Content-Type": "application/json" } })); }
    window.fetch = function(url, init){
      url = String(url); init = init || {};
      window.__reqs.push({ url: url, method: init.method || "GET", body: init.body || "" });
      if (url.indexOf("panel-version.json") >= 0) return json({ v: "6.24.0", minimum_supported_version: "6.24.0" });
      if (url.indexOf("hnk-ai-tools-3-s4nnu.ondigitalocean.app/api") < 0) return realFetch(url, init);
      if (window.__cfg.offline) return Promise.reject(new TypeError("Failed to fetch"));
      if (url.indexOf("grant_type=refresh_token") >= 0) {
        if (window.__cfg.refreshOk === false) return json({ message: "Invalid Refresh Token" }, 400);
        return json({ access_token: "access-refresh", refresh_token: "refresh-next", expires_in: 3600,
          user: { id: ${JSON.stringify(UID)}, email: "student@example.com" } });
      }
      if (url.indexOf("grant_type=password") >= 0) {
        var b = {}; try { b = JSON.parse(init.body || "{}"); } catch(e){}
        if (b.password !== window.__cfg.goodPass) return json({ message: "Invalid login credentials" }, 400);
        return json({ access_token: "access-login", refresh_token: "refresh-login", expires_in: 3600,
          user: { id: ${JSON.stringify(UID)}, email: b.email } });
      }
      if (url.indexOf("/v1/devices/enroll") >= 0) {
        if (window.__cfg.enrollStatus) return json({ code: "DEVICE_CONFLICT", message: "Computer already registered" }, window.__cfg.enrollStatus);
        return json({ ok: true, device: { type: "computer" } });
      }
      if (url.indexOf("/v1/panel/validate") >= 0) {
        window.__validateCalls++;
        if (window.__cfg.validateStatus === 426) return json({ code: "UPDATE_REQUIRED", message: "Update Required" }, 426);
        if (window.__cfg.validateStatus) return json({ code: "ACCESS_DENIED", message: "Panel access denied" }, window.__cfg.validateStatus);
        return json({ ok: true, lease_token: "lease-" + window.__validateCalls,
          lease_expires_at: new Date(Date.now() + 180000).toISOString(),
          entitlement: { account: { status: "active" }, permissions: { panel: true },
            license: { active: true, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() } } });
      }
      if (url.indexOf("/auth/v1/logout") >= 0) return Promise.resolve(new Response(null, { status: 204 }));
      if (url.indexOf("/rest/v1/profiles") >= 0) return json([{ avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" }]);
      return json({ message: "not found" }, 404);
    };
  })();`;
}

async function run(browser, cfg) {
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const errors = [];
  page.on("pageerror", error => errors.push("pageerror: " + String(error).slice(0, 240)));
  page.on("console", message => { if (message.type() === "error") errors.push("console: " + message.text().slice(0, 200)); });
  await page.addInitScript(initScript(cfg));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => typeof gateS !== "undefined" && gateS.view && gateS.view !== "checking",
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => ({
    view: typeof gateS === "undefined" ? "missing" : gateS.view,
    hidden: getComputedStyle(document.getElementById("hnkGate")).display === "none",
    app: getComputedStyle(document.getElementById("app")).display,
    loginRow: getComputedStyle(document.getElementById("gateLogin")).display !== "none",
    lockedRow: getComputedStyle(document.getElementById("gateLocked")).display !== "none",
    avaShown: getComputedStyle(document.getElementById("gateLogoImg")).display !== "none",
    error: (document.getElementById("gateErr").textContent || "").trim(),
    lockedMsg: (document.getElementById("gateLockedMsg").textContent || "").trim(),
    password: document.getElementById("gatePass").value,
    validateCalls: window.__validateCalls,
    requests: window.__reqs
  }));
  return { page, state, errors };
}

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  const allErrors = [];
  const saved = { accRefresh: "refresh", accUid: UID, accEmail: "student@example.com", accDevId: "panel-install-a" };

  let result = await run(browser, { settings: {} });
  allErrors.push(...result.errors);
  report("B) no saved session shows login and keeps the app out of the focus tree",
    result.state.view === "login" && !result.state.hidden && result.state.app === "none", result.state);
  report("B2) the signed-out card shows every control at once with a quiet locked message",
    result.state.loginRow && result.state.lockedRow && result.state.lockedMsg === "", result.state);
  report("B3) signed out, the identity square shows the HNK mark — never a stale member photo",
    !result.state.avaShown, result.state);
  await result.page.close();

  result = await run(browser, { settings: saved });
  allErrors.push(...result.errors);
  report("C) active account plus enrolled computer plus live lease unlocks",
    result.state.view === "open" && result.state.hidden && result.state.app !== "none" && result.state.validateCalls >= 1,
    result.state);
  const avaAfter = await result.page.evaluate(() =>
    getComputedStyle(document.getElementById("gateLogoImg")).display !== "none" &&
    (document.getElementById("gateLogoImg").getAttribute("src") || "").indexOf("data:image/jpeg") === 0
  ).catch(() => false);
  report("C2) the member's website profile photo fills the gate identity square (v6.26.2)",
    avaAfter === true, { avaAfter });
  await result.page.close();

  result = await run(browser, { settings: saved, validateStatus: 403 });
  allErrors.push(...result.errors);
  report("D) suspended/disabled/expired server verdict stays locked",
    result.state.view === "locked" && !result.state.hidden && result.state.app === "none", result.state);
  report("D2) the denied card keeps sign-in visible and explains the lock",
    result.state.loginRow && result.state.lockedRow && result.state.lockedMsg !== "", result.state);
  await result.page.close();

  result = await run(browser, { settings: saved, enrollStatus: 409 });
  allErrors.push(...result.errors);
  report("E) a different registered computer is refused before validation",
    result.state.view === "locked" && result.state.validateCalls === 0 && /Computer/i.test(result.state.error), result.state);
  await result.page.close();

  result = await run(browser, { settings: saved, validateStatus: 426 });
  allErrors.push(...result.errors);
  report("F) unsupported panel version hard-locks with Update Required",
    result.state.view === "locked" && /Update Required/i.test(result.state.error), result.state);
  await result.page.close();

  result = await run(browser, { settings: { ...saved, accProfile: { plan_status: "active", plan_expires_at: future(30) }, accSeenAt: Date.now() }, offline: true });
  allErrors.push(...result.errors);
  report("G) offline cache never unlocks the panel",
    result.state.view === "locked" && !result.state.hidden && result.state.app === "none", result.state);
  await result.page.close();

  /* 2026-08-30 owner instruction: no pairing code. Sign-in registers the
     device directly; the enroll body must NOT carry a pairing_code field. */
  result = await run(browser, { settings: {}, goodPass: "correct-horse" });
  await result.page.fill("#gateEmail", "student@example.com");
  await result.page.fill("#gatePass", "correct-horse");
  await result.page.click("#gateSignIn");
  await result.page.waitForFunction(() => gateS.view === "open", null, { timeout: 30000 }).catch(() => {});
  const signed = await result.page.evaluate(() => ({
    view: gateS.view,
    password: document.getElementById("gatePass").value,
    enrollBody: (window.__reqs.find(r => r.url.indexOf("/v1/devices/enroll") >= 0) || {}).body || ""
  }));
  allErrors.push(...result.errors);
  report("H) sign-in clears the password and enrolls with no pairing code",
    signed.view === "open" && signed.password === "" &&
    signed.enrollBody.indexOf('"installation_id"') >= 0 &&
    signed.enrollBody.indexOf("pairing_code") < 0, signed);
  await result.page.close();

  result = await run(browser, { settings: saved });
  const before = result.state.validateCalls;
  await result.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await result.page.waitForFunction(n => window.__validateCalls > n, before, { timeout: 10000 }).catch(() => {});
  const after = await result.page.evaluate(() => window.__validateCalls);
  allErrors.push(...result.errors);
  report("I) returning focus forces a fresh live entitlement validation", after > before, { before, after });
  await result.page.close();

  /* v6.40.0 — ONE NAVIGATION, AND IT IS THE WEB APP'S.
     The panel is the same product in another window, so its navigation is not
     its own to invent: the app's bottom bar carries five work groups in a
     fixed order and parks Setup behind a header gear, and the panel now does
     exactly that. Read from BOTH files so drift on either side fails: the
     app's TOPGROUPS labels are the expectation, the panel's tab bar is the
     claim. The panel also used to draw a SECOND navigation inside Home that
     repeated these tabs — that must not come back. */
  const appSrc = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
  const groupBlock = (appSrc.match(/var TOPGROUPS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || "";
  const appGroups = [...groupBlock.matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
  const barBlock = (indexHtml.match(/<div class="tabbar">([\s\S]*?)<\/div>/) || [])[1] || "";
  const panelTabs = [...barBlock.matchAll(/<span class="tabb-l">([^<]*)<\/span>/g)].map(m => m[1]);
  report("L) the panel's bottom bar is the web app's five groups, in its order",
    appGroups.length === 5 && JSON.stringify(panelTabs) === JSON.stringify(appGroups),
    { app: appGroups, panel: panelTabs });
  report("M) Setup left the bar for the header gear, exactly as the app parks it",
    !/tabSetup/.test(barBlock) && /id="btnGearSetup"/.test(indexHtml), {
      onBar: /tabSetup/.test(barBlock), gear: /id="btnGearSetup"/.test(indexHtml) });
  const controller = fs.readFileSync(path.join(PANEL, "src/ui/app-controller.js"), "utf8");
  report("N) the panel draws one navigation, not two",
    !/hnkNav_/.test(controller) && !/id: "hnkNav"/.test(controller), {});

  /* v6.41.0 — THE SECOND BROWSER IS GONE AND ITS DOOR IS SHUT.
     The panel used to carry a whole mini web browser — an allow-list, an
     address bar, size presets, a postMessage image bridge — which the web app
     does not have and does not need, and which cost the CCX a webview grant
     plus eleven third-party domain grants that were call paths in a
     distributed, inspectable package. Removing the UI without removing the
     grants would have left the doors open, so both are asserted here. */
  const panelManifest = JSON.parse(fs.readFileSync(path.join(PANEL, "manifest.json"), "utf8"));
  const perms = panelManifest.requiredPermissions || {};
  const domains = ((perms.network || {}).domains || []).join(" ");
  const browserHosts = ["photoeditorai.io", "photoeditor.ai", "playground.com",
    "pixlr.com", "fotor.com", "remove.bg"].filter(host => domains.includes(host));
  report("O) the mini browser is gone, and so is every grant it needed",
    !/<webview/i.test(indexHtml) && !("webview" in perms) && browserHosts.length === 0 &&
    !/function bindWeb\(/.test(mainJs) && !/WEB_SITES/.test(mainJs),
    { webviewTag: /<webview/i.test(indexHtml), webviewPermission: "webview" in perms,
      hosts: browserHosts, bindWeb: /function bindWeb\(/.test(mainJs) });

  /* v6.39.0 — A BROWSER CANNOT CATCH THIS ONE, WHICH IS WHY IT SHIPPED.
     Photoshop's panel runtime lays a container's children out in a ROW unless
     the container says otherwise; a browser stacks them either way. So every
     Home and Workflows card rendered its title, summary and model line side by
     side and clipped them into one unreadable run ("BG Replace" + "replaces
     the background" arriving as a single sentence) in Photoshop, while every
     test here rendered it correctly. The stylesheet is therefore the thing to
     assert: a container that holds stacked lines must DECLARE that it stacks. */
  const stylesheet = fs.readFileSync(path.join(PANEL, "styles.css"), "utf8");
  function declarationsFor(className) {
    let block = "";
    const rule = /([^{}]+)\{([^}]*)\}/g;
    let match;
    while ((match = rule.exec(stylesheet))) {
      const selectors = match[1].split(",").map(part => part.trim());
      if (selectors.some(sel => sel.split(/\s+/).pop() === className)) block += match[2] + ";";
    }
    return block;
  }
  const rowRisk = [".hnk-action-txt", ".hnk-field", ".hnk-screen", ".hnk-slot-errors"]
    .filter(cls => {
      const decl = declarationsFor(cls);
      return !(/display\s*:\s*flex/.test(decl) && /flex-direction\s*:\s*column/.test(decl));
    });
  report("K) every stacked text container declares that it stacks", rowRisk.length === 0, rowRisk);

  report("J) all scenarios complete without uncaught browser errors", allErrors.length === 0, allErrors);
  await browser.close();
  server.close();
  if (failures) process.exit(1);
  console.log("\nPhotoshop panel server gate verified.");
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  server.close();
  process.exit(1);
});
