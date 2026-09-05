/* A student who has just registered is told the truth, and is let in the
 * moment the owner approves them — without signing out.
 *
 * WHAT THIS CLOSES. Registering already signed the student in, and the app
 * already re-read the profile by itself and dropped the wall when approval
 * landed. Two things made that invisible:
 *
 *   1. The only question the wall asked was "is this plan active", and a
 *      brand-new account's is not — so a student waiting on the owner was
 *      shown the PAY screen, while the small account card below said "HNK is
 *      checking your account". Two screens disagreeing; they believed the
 *      loud one.
 *   2. The re-read ran on a five-minute throttle. Nobody waits five minutes at
 *      a screen demanding money. They signed out and back in, by which time
 *      approval had usually landed — and a whole cohort learned "you have to
 *      log out and back in", which was never true.
 *
 * So: pending is its own state with its own words, it asks every twenty
 * seconds while it is the state on screen, and the moment the door opens the
 * app says so instead of silently rearranging.
 *
 * Usage: serve docs/app on 8931, then
 *   node test/verify_pending_approval.js */
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "docs/app/index.html"), "utf8");
const PORT = process.env.PORT || 8931;
let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${String(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
}

/* ---- A) the state exists, and is decided by the field that means it ---- */
check("A) a never-approved account is 'pending' on BOTH gates, not a demand for money",
  /var neverApproved = !!\(acc\.profile && !acc\.profile\.plan_expires_at\);/.test(APP) &&
  /if \(!unifiedCanWeb\(\)\) return neverApproved \? "pending"/.test(APP) &&
  /return neverApproved \? "pending" : "buy";/.test(APP),
  "a fresh student still meets 'License inactive' or a demand for money");

check("A2) the waiting screen promises it opens by itself",
  /st === "pending"/.test(APP) &&
  /This page opens by itself the moment you are approved/.test(APP) &&
  /ထွက်ပြီး ပြန်ဝင်စရာ မလိုပါ/.test(APP),
  "the pending copy does not tell the student they need not sign out");

check("A3) it asks again every twenty seconds while it is the screen on show",
  /var WALL_PENDING_MS = 20000;/.test(APP) &&
  /appWallState\(\) === "pending" \? WALL_PENDING_MS : WALL_RECHECK_MS/.test(APP) &&
  /Date\.now\(\) - _wallLast < wallRecheckMs\(\)/.test(APP),
  "the pending state still waits on the five-minute throttle");

check("A4) a settled account is NOT put on the fast cadence",
  /wallRecheckMs\(\)/.test(APP) && /WALL_RECHECK_MS = 5 \* 60000/.test(APP),
  "every account would now poll every twenty seconds");

check("A5) the 'check now' button is offered while waiting",
  /wallRetryArm\(\(st === "checking" \|\| st === "pending"\) && navigator\.onLine\)/.test(APP),
  "a student waiting on approval has nothing to press");

check("A5b) the wait re-reads BOTH gates, or approval never lands",
  /var wasPending = appWallState\(\) === "pending";/.test(APP) &&
  /if \(wasPending && unified\.enforced\)\{ try \{ await unifiedRefresh\(true\); \}/.test(APP),
  "wallRecheck refreshes the profile only, so the unified licence gate stays stale");

check("A6) opening the door is announced, and only for someone who waited",
  /_wallWasBlocked === "pending" && !on/.test(APP) && /Approved — welcome/.test(APP),
  "the wall drops silently, or a paying customer is congratulated on boot");

/* ---- B) live, through the three account states ---- */
const SESS = uid => `{"access":"a","refresh":"r","exp":${Math.floor(Date.now() / 1000) + 7200},"uid":"${uid}","email":"s@example.com"}`;
function init(profile) {
  return `try{ localStorage.setItem("hnk_seen_splash","1"); localStorage.setItem("hnk_ws_onboarded","1"); }catch(e){}
(function(){
  var UID="77777777-8888-4999-aaaa-bbbbbbbbbbbb";
  var prof=${JSON.stringify(profile)};
  window.__setProfile=function(p){ prof=p; };
  try{ localStorage.setItem("hnk_acc_sess_v1",'${SESS("77777777-8888-4999-aaaa-bbbbbbbbbbbb")}');
       localStorage.setItem("hnk_acc_profile_v1",JSON.stringify(prof)); }catch(e){}
  var realFetch=window.fetch.bind(window);
  function json(b,s){ return Promise.resolve(new Response(JSON.stringify(b),{status:s||200,headers:{"Content-Type":"application/json"}})); }
  window.__profileReads=0;
  window.fetch=function(url,init){ url=String(url);
    if(url.indexOf("127.0.0.1")>=0 && url.indexOf("/api/")<0) return realFetch(url,init);
    if(url.indexOf("/rest/v1/profiles")>=0){ window.__profileReads++; return json(prof); }
    if(url.indexOf("/v1/me/entitlement")>=0) return json({account:{status:"active"},
      license:{active:!!prof.plan_expires_at,status:prof.plan_status,expires_at:prof.plan_expires_at},
      permissions:{web_app:true,ccx_download:true,photoshop_panel:true,panel:true},
      devices:{computer:{label:"PC",device_name:"PC"}},panel:{latest_version:"6.50.0"}});
    return json({},200);
  };
})();`;
}
const FRESH = { id: "77777777-8888-4999-aaaa-bbbbbbbbbbbb", email: "s@example.com", plan_status: "none", plan_expires_at: null, allowed_devices: 2, is_admin: false };
const LAPSED = Object.assign({}, FRESH, { plan_expires_at: new Date(Date.now() - 86400000).toISOString() });
const ACTIVE = Object.assign({}, FRESH, { plan_status: "active", plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });

(async () => {
  const browser = await chromium.launch();
  try {
    async function open(profile) {
      const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
      const errs = [];
      page.on("pageerror", e => errs.push(String(e).slice(0, 140)));
      await page.addInitScript(init(profile));
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2200);
      return { page, errs };
    }

    /* just registered */
    let { page, errs } = await open(FRESH);
    let r = await page.evaluate(() => ({
      state: appWallState(),
      walled: document.body.classList.contains("wall"),
      head: (document.getElementById("wallH") || {}).textContent || "",
      body: (document.getElementById("wallP") || {}).textContent || ""
    }));
    check("B) a freshly registered student sees the waiting screen",
      r.state === "pending" && r.walled === true, JSON.stringify(r).slice(0, 200));
    check("B2) and is told, in their own language, that it opens by itself",
      /ခွင့်ပြုတာနဲ့|opens by itself/.test(r.body) && !/ငွေ|pay|Pay/.test(r.head),
      JSON.stringify({ head: r.head, body: r.body.slice(0, 90) }));

    /* the owner approves while they wait — no sign-out, no reload */
    await page.evaluate(() => {
      window.__setProfile({
        id: "77777777-8888-4999-aaaa-bbbbbbbbbbbb", email: "s@example.com",
        plan_status: "active", plan_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        allowed_devices: 2, is_admin: false
      });
    });
    const opened = await page.evaluate(async () => {
      await wallRecheck(true);
      return { state: appWallState(), walled: document.body.classList.contains("wall") };
    });
    check("B3) approval lets them in where they stand — no sign-out, no reload",
      opened.state === "" && opened.walled === false, JSON.stringify(opened));
    check("B4) no page error through the whole wait-and-approve run",
      errs.length === 0, errs.slice(0, 2).join(" | "));
    await page.close();

    /* a plan that lapsed still asks for money — pending must not swallow it */
    ({ page, errs } = await open(LAPSED));
    r = await page.evaluate(() => ({ state: appWallState(), walled: document.body.classList.contains("wall") }));
    check("C) a customer whose plan lapsed still gets the renew screen",
      r.state === "buy" && r.walled === true, JSON.stringify(r));
    await page.close();

    /* a paying student is not stopped, and is not congratulated on boot */
    ({ page, errs } = await open(ACTIVE));
    r = await page.evaluate(() => ({
      state: appWallState(),
      walled: document.body.classList.contains("wall"),
      welcome: [...document.querySelectorAll(".toast")].filter(function(t){
        return /Approved|ခွင့်ပြုပြီး/.test(t.textContent || ""); }).length
    }));
    check("C2) an approved student walks straight in, and is not congratulated on boot",
      r.state === "" && r.walled === false && r.welcome === 0, JSON.stringify(r));
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(failures
    ? `\n${failures} check(s) failed`
    : "\nAll checks passed — a registered student waits on a screen that tells the truth, and is let in where they stand.");
  process.exit(failures ? 1 : 0);
})();
