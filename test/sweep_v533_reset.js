/* v5.33.0 password-reset sweep — the recovery token stays on our own origin.

   WHAT WAS WRONG. ACC_RESET_URL pointed at a hnk-account-center deployment on
   a third-party preview host, and the landing footer's "Account · Premium"
   link pointed at the same place. The auth service puts the recovery token in
   the redirect URL, so that one constant decided which host received
   every customer's password-reset token — and a token that resets a password
   is, for the moment it is alive, the account. The host was somebody else's
   domain, it had no visible relationship to the product a customer had signed
   up for, and nothing in the repo tested that it was reachable, let alone that
   it handled the token responsibly.

   The page now lives at /reset/ on the production origin. This file exercises
   it as a browser would, against faked GoTrue responses, and checks the things
   that are easy to get wrong once and never notice again.

   WHY THE PAGE IS SERVED FROM A ROUTE RATHER THAN A SERVER. The whole point is
   the ORIGIN, so the test loads the page at its real production URL and
   fulfils it from disk. A localhost server would have proved the markup works
   and said nothing about the thing under test.

   Pinned contracts:
   A) No third-party account host survives anywhere in the shipped files, and
      ACC_RESET_URL is on the production origin.
   B) The page requests nothing off-origin: no script, style, font or image.
   C) A recovery link renders the form AND the token is gone from the URL
      before the user can read it.
   D) The token never reaches localStorage or sessionStorage.
   E) Saving a password PUTs /auth/v1/user with the one-time recovery secret in
      the JSON body, then revokes the fresh compatibility session returned by
      the API. The token is never sent in an HTTP URL or Authorization header.
   F) A spent or expired link shows the dead-link message and no form.
   G) The transition token_hash spelling is accepted without calling a retired
      third-party verification endpoint.
   H) A short password never leaves the browser.
   I) referrer=no-referrer, and CSP permits only same-origin API requests.
   J) Every string the page renders comes from the app's own tables, apart from
      the two keys documented as new — so the reset page cannot drift into
      saying something the app never said. Matched across every language EITHER
      side carries, so a key that legitimately ships two languages is compared
      on two, and a language present on one side alone is a mismatch.
   K) 320px wide, nothing scrolls sideways and every control clears 44px.

   Usage: node test/sweep_v533_reset.js   (no server needed) */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs", "app", "index.html"), "utf8");
const LANDING = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
const RESET = fs.readFileSync(path.join(ROOT, "docs", "reset", "index.html"), "utf8");

const ORIGIN = "https://hnkaistudio.com";
const RESET_URL = ORIGIN + "/reset/";

let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

/* ---------- A) nothing points off-origin any more ---------- */
const strays = [];
for (const [file, body] of [["docs/app/index.html", APP], ["docs/index.html", LANDING], ["docs/reset/index.html", RESET]]) {
  /* the app carries one comment recording what the constant used to be; a
     LINK is what matters, so only href/src/= assignments are counted */
  for (const m of body.matchAll(/(?:href|src)\s*=\s*"(https?:\/\/[^"]+)"/g)) {
    const host = m[1].replace(/^https?:\/\//, "").split("/")[0];
    if (/lovable|hnk-account-center/i.test(host)) strays.push({ file, url: m[1] });
  }
  for (const m of body.matchAll(/ACC_RESET_URL\s*=\s*"([^"]+)"/g)) {
    if (m[1].indexOf(ORIGIN + "/") !== 0) strays.push({ file, ACC_RESET_URL: m[1] });
  }
  if (/vmtwuuybnalefpgvrast|sb_publishable_/i.test(body)) strays.push({ file, retiredAuthBackend:true });
}
const resetConst = (APP.match(/ACC_RESET_URL\s*=\s*"([^"]+)"/) || [])[1];
report("A) no third-party account host is linked, and ACC_RESET_URL is on the production origin",
  strays.length === 0 && resetConst === RESET_URL, { strays, resetConst });

/* ---------- B) the page is self-contained ---------- */
const externalRefs = [...RESET.matchAll(/(?:src|href)\s*=\s*"([^"]*)"/g)]
  .map(m => m[1])
  .filter(u => /^(https?:)?\/\//.test(u));
report("B) the reset page requests nothing off-origin",
  externalRefs.length === 0, externalRefs);

/* ---------- I) the two headers that matter ---------- */
const referrer = (RESET.match(/<meta\s+name="referrer"\s+content="([^"]*)"/) || [])[1];
const csp = (RESET.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i) || [])[1] || "";
const connectSrc = (csp.match(/connect-src\s+([^;]+)/) || [])[1] || "";
report("I) the page sends no referrer and its CSP permits only the same-origin auth API",
  referrer === "no-referrer" && connectSrc.trim() === "'self'" && /default-src\s+'none'/.test(csp),
  { referrer, connectSrc: connectSrc.trim(), csp: csp.slice(0, 90) });

/* ---------- J) the strings are the shipped ones, in all nine languages ----------

   The reset page is a second surface saying the same things, and a second
   surface is where copy quietly diverges: someone fixes a message in the app
   and this page keeps the old wording, in nine languages, forever. So every
   language of every string is matched against the source it was taken from —
   the app's TR_V430 table or the landing's I18N block — and only three keys
   are allowed to be anything else:

     pw_title, pw_link_dead   genuinely new, and their Shan and Kachin forms
                              are documented in the page as built from words
                              already shipped
     pw_unreachable           acc_unreachable with its trailing clause deleted.
                              A deletion invents no translation, so it is
                              accepted only if it is a PREFIX of the app's
                              string in every single language — a rewrite in
                              any one of them fails here. */
const NEW_KEYS = ["pw_title", "pw_link_dead"];
const TRIMMED = { pw_unreachable: "acc_unreachable" };
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];

/* v5.41.0 — ACCEPT EITHER QUOTE STYLE. The app's TR table is mostly double
   quoted but not entirely (btn_show is `{ my: 'ပြ', en: 'Show' }`), and a
   single-quoted source entry parsed to an EMPTY object here — so every
   language came back "missing" and the failure pointed at the reset page
   rather than at this parser. */
function entryFrom(body, re) {
  const m = body.match(re);
  if (!m) return null;
  const out = {};
  for (const p of m[1].matchAll(/"?(\w+)"?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
    out[p[1]] = p[2] !== undefined ? p[2] : p[3];
  }
  return out;
}
const resetKeys = [...RESET.matchAll(/^\s{2}(\w+):\s*\{((?:[^{}]|\\.)*)\}/gm)]
  .map(m => ({ key: m[1], langs: entryFrom("{" + m[2] + "}", /^\{([\s\S]*)\}$/) }));

const drifted = [];
for (const { key, langs } of resetKeys) {
  if (NEW_KEYS.indexOf(key) >= 0) continue;
  const sourceKey = TRIMMED[key] || key;
  const src =
    entryFrom(APP, new RegExp("\\b" + sourceKey + ":\\s*\\{([^{}]*)\\}")) ||
    entryFrom(LANDING, new RegExp('"' + sourceKey.replace(/_/g, "\\.") + '"\\s*:\\s*\\{([^{}]*)\\}'));
  if (!src) { drifted.push({ key, why: "no source entry named " + sourceKey }); continue; }
  /* v5.41.0 — compare the languages BOTH SIDES ACTUALLY CARRY, not a fixed
     nine. btn_show ships {my,en} in the app and falls through to English for
     the other seven, on both surfaces; demanding nine would fail a key that has
     not drifted at all, and drift is what this check is for. The union is the
     stricter comparison, not the looser one: a language present on one side and
     absent on the other is now a mismatch, which the old fixed list could not
     see either. */
  const present = [...new Set([...LANGS, ...Object.keys(langs), ...Object.keys(src)])]
    .filter(L => langs[L] != null || src[L] != null);
  for (const L of present) {
    const mine = langs[L], theirs = src[L];
    if (mine == null || theirs == null) { drifted.push({ key, lang: L, why: "missing" }); continue; }
    const ok = TRIMMED[key] ? theirs.indexOf(mine) === 0 && mine.length > 0 : mine === theirs;
    if (!ok) drifted.push({ key, lang: L, mine: mine.slice(0, 40), theirs: theirs.slice(0, 40) });
  }
}
report("J) every reused string matches its shipped source in every language either side carries (trimmed ones only by deletion)",
  resetKeys.length >= 6 && drifted.length === 0,
  { checked: resetKeys.length, drifted: drifted.slice(0, 6), total: drifted.length });

/* ---------- the browser half ---------- */
(async () => {
  const browser = await chromium.launch();

  /* One context helper: serve /reset/ from disk at its real production URL,
     and answer the same-origin unified auth API from a script the test owns. */
  async function open(url, authApi) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 900 } });
    const calls = [];
    await ctx.route(ORIGIN + "/**", route => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      if (p.indexOf("/api/auth/v1/") === 0) {
        const entry = {
          path: p.slice(4),
          method: req.method(),
          auth: req.headers()["authorization"] || "",
          apikey: !!req.headers()["apikey"],
        };
        try { entry.body = JSON.parse(req.postData() || "{}"); } catch (e) { entry.body = null; }
        calls.push(entry);
        const answer = authApi(entry) || { status: 200, body: {} };
        return route.fulfill({ status: answer.status, contentType: "application/json",
          body: JSON.stringify(answer.body || {}) });
      }
      if (p === "/reset/" || p === "/reset/index.html") {
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: RESET });
      }
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>app</title>" });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(200);
    return { ctx, page, calls, errors };
  }

  const TOKEN = "one-time-recovery-token-fixture";
  const FRESH_ACCESS = "fresh-session-access-token";
  const okAuth = e => {
    if (e.path === "/auth/v1/user") return { status: 200, body: { id: "u1", access_token:FRESH_ACCESS } };
    if (e.path === "/auth/v1/logout") return { status: 204, body: {} };
    return { status: 200, body: {} };
  };

  /* ---------- C + D) a live fragment recovery link ---------- */
  {
    const { ctx, page, errors } = await open(
      RESET_URL + "#token=" + encodeURIComponent(TOKEN) + "&type=recovery", okAuth);
    const s = await page.evaluate(() => ({
      url: location.href,
      hash: location.hash,
      search: location.search,
      formVisible: !!document.getElementById("form") && document.getElementById("form").className !== "hide",
      pwVisible: !!document.getElementById("pw").getClientRects().length,
      storage: JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)),
    }));
    report("C) a recovery link shows the form and the token is already out of the URL",
      s.formVisible && s.pwVisible && s.hash === "" && s.search === "" && s.url.indexOf(TOKEN) < 0,
      { url: s.url, hash: s.hash, formVisible: s.formVisible });
    report("D) the recovery token is never written to localStorage or sessionStorage",
      s.storage.indexOf(TOKEN) < 0, { storage: s.storage.slice(0, 120) });
    report("C2) no console error or uncaught exception on the happy path",
      errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- H) a short password never leaves the browser ---------- */
  {
    const { ctx, page, calls } = await open(RESET_URL + "?token=" + encodeURIComponent(TOKEN) + "&type=recovery", okAuth);
    await page.fill("#pw", "12345");
    await page.waitForTimeout(80);
    const disabled = await page.evaluate(() => document.getElementById("btn").disabled);
    await page.evaluate(() => document.getElementById("form").dispatchEvent(new Event("submit", { cancelable: true })));
    await page.waitForTimeout(250);
    report("H) a password under six characters keeps submit disabled and fires no request",
      disabled === true && calls.length === 0, { disabled, calls: calls.map(c => c.path) });
    await ctx.close();
  }

  /* ---------- E) saving, then revoking ---------- */
  {
    const { ctx, page, calls, errors } = await open(RESET_URL + "#token=" + encodeURIComponent(TOKEN) + "&type=recovery", okAuth);
    await page.fill("#pw", "brand-new-secret");
    await page.waitForTimeout(80);
    await page.click("#btn");
    await page.waitForTimeout(500);
    const put = calls.find(c => c.path === "/auth/v1/user");
    const out = calls.find(c => c.path === "/auth/v1/logout");
    const after = await page.evaluate(() => ({
      formHidden: document.getElementById("form").className === "hide",
      st: (document.getElementById("st").textContent || "").trim(),
      openShown: document.getElementById("open").className.indexOf("hide") < 0,
      pw: document.getElementById("pw").value,
      live: document.getElementById("st").getAttribute("aria-live"),
    }));
    report("E) saving PUTs the one-time secret in JSON, then revokes only the fresh returned session",
      !!put && put.method === "PUT" && put.auth === "" && !put.apikey &&
      put.body && put.body.password === "brand-new-secret" && put.body.recovery_token === TOKEN &&
      !!out && out.method === "POST" && out.auth === "Bearer " + FRESH_ACCESS,
      { put: put && { m: put.method, auth: put.auth, keys: put.body && Object.keys(put.body) }, logout: !!out });
    report("E2) success hides the form, clears the field, announces politely and offers the app",
      after.formHidden && after.pw === "" && after.openShown && after.st.length > 0 && after.live === "polite",
      after);
    report("E3) no console error across the save path", errors.length === 0, errors);
    await ctx.close();
  }

  /* ---------- G) the token_hash shape ---------- */
  {
    const { ctx, page, calls } = await open(RESET_URL + "?token_hash=th-fixture&type=recovery", okAuth);
    await page.fill("#pw", "brand-new-secret");
    await page.waitForTimeout(80);
    await page.click("#btn");
    await page.waitForTimeout(500);
    const put = calls.find(c => c.path === "/auth/v1/user");
    const verify = calls.find(c => c.path === "/auth/v1/verify");
    report("G) token_hash transition links use the unified one-time-token contract without /verify",
      !verify && !!put && put.auth === "" && put.body && put.body.recovery_token === "th-fixture",
      { verify: !!verify, put: put && {auth:put.auth,body:put.body} });
    await ctx.close();
  }

  /* ---------- F) a spent link ---------- */
  for (const [label, url] of [
    ["an expired link", RESET_URL + "#error=access_denied&error_description=Email+link+is+invalid+or+has+expired"],
    ["a bare visit", RESET_URL],
  ]) {
    const { ctx, page, calls } = await open(url, okAuth);
    const s = await page.evaluate(() => ({
      formHidden: document.getElementById("form").className === "hide",
      st: (document.getElementById("st").textContent || "").trim(),
      err: document.getElementById("st").className.indexOf("err") >= 0,
      openShown: document.getElementById("open").className.indexOf("hide") < 0,
    }));
    report("F) " + label + " shows the dead-link message, hides the form and offers a way out",
      s.formHidden && s.err && s.st.length > 0 && s.openShown && calls.length === 0, s);
    await ctx.close();
  }

  /* ---------- K) 320px ---------- */
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
    await ctx.route(ORIGIN + "/**", route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: RESET }));
    const page = await ctx.newPage();
    await page.goto(RESET_URL + "?token=" + encodeURIComponent(TOKEN) + "&type=recovery", { waitUntil: "load" });
    await page.waitForTimeout(200);
    const k = await page.evaluate(() => {
      const small = [];
      document.querySelectorAll("button,input,a").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && r.height < 44) small.push(el.id || el.tagName);
      });
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, small };
    });
    report("K) at 320px nothing scrolls sideways and every control clears a 44px touch target",
      k.scrollW <= k.innerW && k.small.length === 0, k);
    await ctx.close();
  }

  await browser.close();
  console.log("\n" + (failures === 0 ? "PASS" : "FAIL (" + failures + ")"));
  process.exit(failures === 0 ? 0 : 1);
})();
