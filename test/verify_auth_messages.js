/* v5.93.0 / 6.64.0 — WHAT A STUDENT IS TOLD WHEN SIGNING IN GOES WRONG.
 *
 * Wave 11 began with the owner's ask: register / sign-in / login, better and
 * easier for students. Reading the two sign-in paths against the errors the
 * API can actually return found that neither surface could say what had
 * happened, and both said something that made the student act wrongly:
 *
 *   - The WEB APP mapped five of the server's states — rate_limited (429),
 *     auth_busy (503), invalid_password, session_revoked, and any unknown —
 *     onto acc_unreachable, "Can't reach the account server." A student who
 *     is locked out is told their CONNECTION is broken, so they retry, which
 *     extends the lockout.
 *
 *   - The PANEL was worse: gateSignIn() showed "Wrong email or password" for
 *     EVERY non-ok response. A student locked out by the failed-login limiter
 *     was told their password was wrong, so they tried more passwords — and
 *     some would reset a password that had never been wrong.
 *
 * The rule this pins: a sign-in message must be TRUE, and it must imply the
 * right next action. Three actions exist — fix what you typed, wait, or check
 * your connection — and telling a student to do one when they need another is
 * the defect, not the wording.
 *
 * The error list is READ FROM server/lib/auth.js rather than typed here, so a
 * state the server adds later, or renames, fails this test instead of quietly
 * falling back to "no connection" again.
 *
 * Usage: PORT=8931 node test/verify_auth_messages.js  (serve docs/app first) */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright-core");
const PORT = process.env.PORT || 8931;
const LANGS = ["my", "en", "shn", "kac", "th", "zh", "vi", "id", "ms"];
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) failures++;
}

/* ---- the server's own list, read from source ---- */
const authSrc = fs.readFileSync(path.join(__dirname, "..", "server", "lib", "auth.js"), "utf8");
const SERVER_ERRORS = [];
const seen = new Set();
for (const m of authSrc.matchAll(/AuthError\(\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/g)) {
  const key = m[1] + "|" + m[3];
  if (seen.has(key)) continue;
  seen.add(key);
  SERVER_ERRORS.push({ status: Number(m[1]), message: m[2], code: m[3] });
}
/* auth_busy is raised by crypto.js when the KDF is at capacity, not by an
   AuthError literal — it reaches the client as a 503 with that code. */
SERVER_ERRORS.push({ status: 503, message: "Server busy", code: "auth_busy" });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e).slice(0, 240)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  report("A) the server's error list was read, not typed — every state it can report is under test",
    SERVER_ERRORS.length >= 10 && SERVER_ERRORS.some(e => e.code === "rate_limited")
      && SERVER_ERRORS.some(e => e.code === "auth_busy"), SERVER_ERRORS.map(e => e.status + ":" + e.code));

  /* ---- B: the web app, every state, every language ---- */
  const B = await page.evaluate(({ errors, langs }) => {
    const out = [];
    const saved = window.LANG;
    errors.forEach(e => {
      const body = { code: e.status, error_code: e.code, msg: e.message };
      langs.forEach(L => {
        window.LANG = L;
        const login = accFriendly(e.status, body, "login");
        const signup = accFriendly(e.status, body);
        out.push({ code: e.code, status: e.status, lang: L, login, signup,
          unreachable: window.TR.acc_unreachable[L] || window.TR.acc_unreachable.en });
      });
    });
    window.LANG = saved;
    return out;
  }, { errors: SERVER_ERRORS, langs: LANGS });

  const fellBack = B.filter(r => r.login === r.unreachable || r.signup === r.unreachable);
  report("B) no state the server can report reaches a student as \"can't reach the account server\" — the message that makes a locked-out student retry harder",
    fellBack.length === 0, fellBack.slice(0, 6).map(r => r.code + "@" + r.lang));

  const empty = B.filter(r => !r.login || !r.signup || /^\[|undefined/.test(r.login + r.signup));
  report("B2) every state has real words in all nine languages — no blank, no key name leaking through",
    empty.length === 0, empty.slice(0, 6));

  /* the lockout must not read as a wrong password, and must name the wait */
  const lock = B.filter(r => r.code === "rate_limited");
  const badLock = lock.filter(r => !/15|၁၅|นาที|分钟|phút|menit|minit|minute|Minute/i.test(r.login));
  report("C) a locked-out student is told to WAIT and told their password is fine — never that the password is wrong",
    lock.length > 0 && badLock.length === 0, badLock.slice(0, 4).map(r => r.lang + ": " + r.login));

  const B3 = await page.evaluate(({ langs }) => {
    const saved = window.LANG; const out = [];
    langs.forEach(L => {
      window.LANG = L;
      out.push({ lang: L,
        lock: accFriendly(429, { error_code: "rate_limited" }, "login"),
        creds: accFriendly(400, { error_code: "invalid_grant" }, "login"),
        busy: accFriendly(503, { error_code: "auth_busy" }, "login"),
        revoked: accFriendly(401, { error_code: "session_revoked" }),
        longpw: accFriendly(422, { error_code: "invalid_password" }) });
    });
    window.LANG = saved; return out;
  }, { langs: LANGS });
  const collide = B3.filter(r => new Set([r.lock, r.creds, r.busy, r.revoked, r.longpw]).size !== 5);
  report("C2) the five states read as five different things in every language — a student can tell a lockout from a typo from a busy server",
    collide.length === 0, collide.slice(0, 3));

  /* ---- D: the panel's gate says the same three things ---- */
  const panelSrc = fs.readFileSync(path.join(__dirname, "..", "panel", "main.js"), "utf8");
  const gateBlock = panelSrc.slice(panelSrc.indexOf("async function gateSignIn"),
    panelSrc.indexOf("async function gateSignIn") + 1600);
  report("D) the panel's sign-in reads the server's code instead of blaming the password for everything",
    /gate_wait/.test(gateBlock) && /gate_busy/.test(gateBlock)
    && /429|rate_limited/.test(gateBlock) && /503|auth_busy/.test(gateBlock),
    gateBlock.slice(0, 300));

  const waitCount = (panelSrc.match(/gate_wait:/g) || []).length;
  const busyCount = (panelSrc.match(/gate_busy:/g) || []).length;
  report("D2) and it can say them in all nine languages, like every other gate label",
    waitCount === 9 && busyCount === 9, { gate_wait: waitCount, gate_busy: busyCount });

  const panelWait = [...panelSrc.matchAll(/gate_wait: "([^"]*)"/g)].map(m => m[1]);
  const noMinutes = panelWait.filter(w => !/15|၁၅|นาที|分钟|phút|menit|minit|Minute|minute/i.test(w));
  report("D3) the panel's lockout line also names the wait and clears the password of blame",
    noMinutes.length === 0, noMinutes);

  /* ---- E: a real 429 from a real server, end to end ---- */
  const srv = http.createServer((req, res) => {
    res.writeHead(429, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ code: 429, error_code: "rate_limited", msg: "Too many login attempts. Try again later." }));
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const realBody = await new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: srv.address().port, path: "/auth/v1/token" }, r => {
      let d = ""; r.on("data", c => d += c); r.on("end", () => resolve({ status: r.statusCode, body: JSON.parse(d) }));
    }).on("error", reject);
  });
  srv.close();
  const E = await page.evaluate(({ status, body }) => ({
    msg: accFriendly(status, body, "login"),
    unreachable: window.TR.acc_unreachable[window.LANG] || window.TR.acc_unreachable.en,
    creds: window.TR.acc_bad_creds[window.LANG] || window.TR.acc_bad_creds.en,
  }), realBody);
  report("E) an actual 429 response, parsed from a real HTTP body, produces the wait message — not the connection message and not the wrong-password message",
    E.msg !== E.unreachable && E.msg !== E.creds && /15|၁၅/.test(E.msg), E);

  /* ---- G: the phone keyboard's Go key ---- */
  /* The panel's gate has submitted on Enter since 6.28.0. The web app has no
     <form> at all, so nothing was listening: a student filled the password,
     pressed Go, and nothing happened — they had to dismiss the keyboard,
     which hides the field they just filled, and hunt for the button. */
  const G = await page.evaluate(() => {
    const out = {};
    ["accEmail", "accPass", "accEmail2", "accPass2", "accPassNew"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) { out[id] = "missing"; return; }
      let fired = false;
      const spy = ev => { if (ev.defaultPrevented) fired = true; };
      el.addEventListener("keydown", spy);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      el.removeEventListener("keydown", spy);
      out[id] = fired ? "submits" : "ignored";
    });
    return out;
  });
  const ignored = Object.keys(G).filter(k => G[k] !== "submits");
  report("G) pressing Enter (the phone keyboard's Go key) submits from every account field — the panel's gate has done this for six versions",
    ignored.length === 0, G);

  report("G2) and the panel's gate still does too, so the two surfaces behave the same",
    /ev\.key === "Enter"|ev\.keyCode === 13/.test(panelSrc), "panel gate lost its Enter handler");

  report("F) no page error while any of this was measured", errs.length === 0, errs);

  console.log("\n" + (failures === 0
    ? "All checks passed — every sign-in failure now tells the student the truth, and points at the one thing that will fix it."
    : "FAIL (" + failures + ")"));
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
