"use strict";

/* Browser sweep for the dedicated admin shell. It pins the security boundary:
 * a Student App session is ignored, admin password login requests client_type
 * admin, dashboard data waits for TOTP, and all policy mutations stay server-side. */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const DOCS = path.resolve(__dirname, "../docs");
let browser;
let server;

function staticServer() {
  return http.createServer((req, res) => {
    let pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/admin/" || pathname === "/admin") pathname = "/admin/index.html";
    const file = path.resolve(DOCS, "." + pathname);
    if (!file.startsWith(DOCS + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const type = file.endsWith(".html") ? "text/html; charset=utf-8"
      : file.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
    res.writeHead(200, { "Content-Type":type, "Cache-Control":"no-store" });
    fs.createReadStream(file).pipe(res);
  });
}

(async () => {
  server = staticServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
  let failed = 0;
  const report = (name, ok, detail) => {
    if (ok) console.log("PASS — " + name);
    else { failed++; console.error("FAIL — " + name + (detail ? "\n       " + JSON.stringify(detail) : "")); }
  };

  const calls = [];
  let mfaVerified = false;
  let dashboard401 = false;
  const page = await browser.newPage({ viewport:{width:390,height:844} });
  await page.addInitScript(() => localStorage.setItem("hnk_acc_sess_v1", JSON.stringify({access:"STUDENT",uid:"student-1"})));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = request.url();
    let parsed = {}; try { parsed = JSON.parse(request.postData() || "{}"); } catch (_) {}
    calls.push({url,method:request.method(),body:parsed});
    const json = (status, body) => route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if (url.includes("grant_type=password")) return json(200,{access_token:"ADMIN-A",refresh_token:"ADMIN-R",expires_at:1999999999,session_id:"admin-session",user:{id:"admin-1",email:"owner@example.com"}});
    if (url.includes("grant_type=refresh_token")) return json(200,{access_token:"ADMIN-B",refresh_token:"ADMIN-R2",expires_at:1999999999,session_id:"admin-session",user:{id:"admin-1",email:"owner@example.com"}});
    if (url.includes("/mfa/setup")) return json(200,{secret:"JBSWY3DPEHPK3PXP",otpauth_uri:"otpauth://totp/HNK:owner?secret=JBSWY3DPEHPK3PXP"});
    if (url.includes("/mfa/verify")) { mfaVerified = parsed.code === "123456"; return json(mfaVerified?200:400,mfaVerified?{ok:true,mfa_verified:true}:{error:"invalid_mfa_code"}); }
    if (url.includes("/dashboard")) {
      if (!mfaVerified) return json(403,{error:"mfa_required",message:"Two-factor verification is required"});
      if (dashboard401) { dashboard401=false; return json(401,{error:"session_expired"}); }
      return json(200,{metrics:{total_students:12,active_students:8,pending_students:2,expired_students:1,suspended_students:1,online_students:3,expiring_soon:2},latest_logins:[]});
    }
    if (/\/students\/student-1$/.test(url)) return json(200,{
      student:{id:"student-1",name:"Aye Aye",email:"aye@example.com",account_status:"active",license_status:"active",starts_at:"2026-08-01T00:00:00Z",expires_at:"2026-12-01T00:00:00Z",web_app_enabled:true,ccx_download_enabled:false,panel_enabled:true,last_active_at:"2026-08-26T00:00:00Z"},
      devices:[{slot_type:"phone",status:"active",installations:[{id:"phone-install",label:"iPhone · Safari"}]},{slot_type:"computer",status:"active",installations:[{id:"computer-install",label:"Windows · Chrome"}]}],
    });
    if (/\/students(?:\?|$)/.test(url)) return json(200,{students:[{id:"student-1",name:"Aye Aye",email:"aye@example.com",account_status:"active",license_status:"active",expires_at:"2026-12-01T00:00:00Z",last_active_at:"2026-08-26T00:00:00Z"}],page:1,total:1});
    if (url.includes("/histories")) return json(200,{events:[],page:1,total:0});
    if (url.includes("/panel-version")) return json(200,{latest_version:"6.24.0",minimum_supported_version:"6.24.0"});
    if (url.includes("/logout")) return json(200,{ok:true});
    return json(404,{error:"not_found"});
  });

  await page.goto(origin+"/admin/",{waitUntil:"networkidle"});
  await page.waitForSelector("#adminLogin:not([hidden])");
  const studentIgnored = await page.evaluate(() => ({login:!document.getElementById("adminLogin").hidden,adminSession:sessionStorage.getItem("hnk_admin_sess_v1"),studentSession:!!localStorage.getItem("hnk_acc_sess_v1")}));
  report("a Student App session cannot enter or silently become an admin session",studentIgnored.login&&!studentIgnored.adminSession&&studentIgnored.studentSession,studentIgnored);

  await page.fill("#adminLoginEmail","owner@example.com");
  await page.fill("#adminLoginPassword","correct-horse");
  await page.click("#adminLoginButton");
  await page.waitForSelector("#adminMfa:not([hidden])");
  const loginCall=calls.find(call=>call.url.includes("grant_type=password"));
  const beforeMfa=calls.filter(call=>/\/api\/v1\/admin\/(students|histories|panel-version)/.test(call.url));
  report("admin login requests client_type admin and protected data waits for TOTP",loginCall&&loginCall.method==="POST"&&loginCall.body.client_type==="admin"&&!beforeMfa.length,{loginCall,beforeMfa});

  await page.click("#adminMfaSetupButton");
  await page.fill("#adminMfaCode","123456");
  await page.click("#adminMfaVerifyButton");
  await page.waitForSelector("#adminApp:not([hidden])");
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("hnk_admin_sess_v1")||"{}"));
  report("TOTP verification unlocks a tab-scoped admin session",mfaVerified&&stored.client_type==="admin"&&stored.access==="ADMIN-A",stored);

  async function measure(width,height){
    await page.setViewportSize({width,height});
    return page.evaluate(()=>{
      const interactive=[...document.querySelectorAll("button,input,select,a[href]")].filter(el=>el.getClientRects().length&&!el.disabled);
      return {inner:innerWidth,scroll:document.documentElement.scrollWidth,small:interactive.filter(el=>{const r=el.getBoundingClientRect();return r.height<44||r.width<44;}).map(el=>el.id||el.textContent.trim().slice(0,20)),unnamed:interactive.filter(el=>!(el.getAttribute("aria-label")||el.getAttribute("aria-labelledby")||el.textContent.trim()||el.getAttribute("title"))).length};
    });
  }
  const m390=await measure(390,844),m320=await measure(320,800),m1280=await measure(1280,900);
  report("admin has no horizontal overflow at 320/390/1280",[m390,m320,m1280].every(m=>m.scroll<=m.inner+1),{m390,m320,m1280});
  report("all visible admin controls clear 44px and have names",[m390,m320,m1280].every(m=>!m.small.length&&!m.unnamed),{m390,m320,m1280});

  await page.setViewportSize({width:390,height:844});
  await page.click('[data-panel="students"]');
  await page.fill("#studentSearch","Aye");
  await page.selectOption("#studentStatus","active");
  await page.selectOption("#studentLicense","active");
  await page.click("#studentFilters button[type=submit]");
  const studentFilterCall=[...calls].reverse().find(call=>/\/students\?/.test(call.url));
  const studentParams=new URL(studentFilterCall.url).searchParams;
  report("student search/status/license filters reach the backend contract",studentParams.get("q")==="Aye"&&studentParams.get("status")==="active"&&studentParams.get("license_status")==="active",Object.fromEntries(studentParams));

  await page.click("#studentCards [data-student-id='student-1']");
  await page.waitForSelector("#studentDialog[open]");
  const detail=await page.evaluate(()=>({focus:document.activeElement&&document.activeElement.id,labelled:!!document.getElementById("studentDialog").getAttribute("aria-labelledby"),summary:document.getElementById("studentSummary").textContent,devices:document.getElementById("studentDevices").textContent,permissions:[...document.querySelectorAll("#permissionToggles input")].map(input=>input.checked)}));
  report("flat detail normalizes into license, mixed permissions and Phone/Computer 1/1",detail.labelled&&!!detail.focus&&/Dec.*2026/i.test(detail.summary)&&/Phone 1\/1/.test(detail.devices)&&/Computer 1\/1/.test(detail.devices)&&JSON.stringify(detail.permissions)===JSON.stringify([true,false,true]),detail);
  await page.keyboard.press("Escape");
  report("Escape closes the student dialog",!(await page.locator("#studentDialog").evaluate(el=>el.open)));

  await page.click('[data-panel="history"]');
  await page.fill("#historySearch","Aye");
  await page.selectOption("#historyType","failed_login");
  await page.click("#historyFilters button[type=submit]");
  const historyCall=[...calls].reverse().find(call=>/\/histories\?/.test(call.url));
  const historyParams=new URL(historyCall.url).searchParams;
  report("history type/search filters reach the backend contract",historyParams.get("type")==="failed_login"&&historyParams.get("search")==="Aye",Object.fromEntries(historyParams));

  dashboard401=true;
  await page.click('[data-panel="overview"]');
  await page.waitForTimeout(250);
  const refreshCall=[...calls].reverse().find(call=>call.url.includes("grant_type=refresh_token"));
  report("admin refresh rotation retains client_type admin",refreshCall&&refreshCall.body.client_type==="admin",refreshCall);

  const forbidden=await browser.newPage({viewport:{width:390,height:844}});
  await forbidden.route("**/api/**",route=>{
    const url=route.request().url(),body=url.includes("grant_type=password")?{access_token:"NOT-ADMIN",refresh_token:"R",user:{id:"student",email:"student@example.com"}}:{error:"forbidden",message:"Admin permission required"};
    route.fulfill({status:url.includes("grant_type=password")?200:403,contentType:"application/json",body:JSON.stringify(body)});
  });
  await forbidden.goto(origin+"/admin/");
  await forbidden.fill("#adminLoginEmail","student@example.com");
  await forbidden.fill("#adminLoginPassword","secret123");
  await forbidden.click("#adminLoginButton");
  await forbidden.waitForSelector("#adminForbidden:not([hidden])");
  report("server 403 keeps a non-admin account out",await forbidden.locator("#adminApp").evaluate(el=>el.hidden));

  await forbidden.close(); await page.close(); await browser.close(); browser=null;
  await new Promise(resolve=>server.close(resolve)); server=null;
  if(failed) process.exit(1);
  console.log("\nPASS — admin dedicated-session, MFA, responsive and accessibility sweep");
})().catch(async error=>{
  console.error(error);
  if(browser) await browser.close().catch(()=>{});
  if(server) await new Promise(resolve=>server.close(resolve));
  process.exit(1);
});
