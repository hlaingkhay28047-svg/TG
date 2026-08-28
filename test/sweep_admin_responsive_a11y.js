"use strict";

/* Browser sweep for the dedicated admin shell. It pins the security boundary:
 * a Student App session is ignored, admin password login requests client_type
 * admin, no admin data is read before a session exists, and all policy
 * mutations stay server-side. */
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
  let dashboard401 = false;
  /* A successful 12-month extension arms a one-shot 401 on the three surface
     refreshes runAction fires concurrently (student detail, student list,
     dashboard), proving they share a single rotating token refresh. */
  let surfaceRefresh401 = false;
  let refreshCalls = 0;
  let refreshedSurfaceReads = 0;
  const failedExtendMutations = new Set();
  const committedRefreshFailureMutations = new Set();
  let failNextCommittedDashboard = false;
  let resolveRefreshedSurfaces;
  const refreshedSurfaces = new Promise(resolve => { resolveRefreshedSurfaces = resolve; });
  const page = await browser.newPage({ viewport:{width:390,height:844} });
  await page.addInitScript(() => localStorage.setItem("hnk_acc_sess_v1", JSON.stringify({access:"STUDENT",uid:"student-1"})));
  await page.route("**/api/**", async route => {
    const request = route.request(), url = request.url();
    let parsed = {}; try { parsed = JSON.parse(request.postData() || "{}"); } catch (_) {}
    calls.push({url,method:request.method(),body:parsed});
    const json = (status, body) => route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if (url.includes("grant_type=password")) return json(200,{access_token:"ADMIN-A",refresh_token:"ADMIN-R",expires_at:1999999999,session_id:"admin-session",user:{id:"admin-1",email:"owner@example.com"}});
    if (url.includes("grant_type=refresh_token")) {
      refreshCalls++;
      await new Promise(resolve => setTimeout(resolve, 25));
      return json(200,{access_token:"ADMIN-B",refresh_token:"ADMIN-R2",expires_at:1999999999,session_id:"admin-session",user:{id:"admin-1",email:"owner@example.com"}});
    }
    if (surfaceRefresh401 && request.method()==="GET" && /\/(dashboard|students\?|students\/student-1$)/.test(url)) {
      const bearer=request.headers()["authorization"]||"";
      if(bearer==="Bearer ADMIN-A") return json(401,{error:"session_expired"});
      if(bearer==="Bearer ADMIN-B") {
        refreshedSurfaceReads++;
        if(refreshedSurfaceReads>=3){surfaceRefresh401=false;resolveRefreshedSurfaces();}
      }
    }
    if (url.includes("/dashboard")) {
      if (dashboard401) { dashboard401=false; return json(401,{error:"session_expired"}); }
      if (failNextCommittedDashboard) {
        failNextCommittedDashboard=false;
        return json(503,{error:"temporarily_unavailable",message:"Temporary dashboard refresh failure"});
      }
      return json(200,{metrics:{total_students:12,active_students:8,pending_students:2,expired_students:1,suspended_students:1,online_students:3,expiring_soon:2},latest_logins:[]});
    }
    if (/\/students\/student-1\/actions$/.test(url)) {
      const fail=parsed.months===1&&!failedExtendMutations.has(parsed.mutation_id);
      if(fail) failedExtendMutations.add(parsed.mutation_id);
      if(!fail&&parsed.months===6&&!committedRefreshFailureMutations.has(parsed.mutation_id)) {
        committedRefreshFailureMutations.add(parsed.mutation_id);
        failNextCommittedDashboard=true;
      }
      if(!fail&&parsed.months===12) surfaceRefresh401=true;
      return json(fail?503:200,fail
        ? {error:"temporarily_unavailable",message:"Temporary extension failure"}
        : {ok:true,action:parsed.action,student_id:"student-1"});
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

  const preLoginAdminReads=calls.filter(call=>call.url.includes("/api/v1/admin/")).length;
  await page.fill("#adminLoginEmail","owner@example.com");
  await page.fill("#adminLoginPassword","correct-horse");
  await page.click("#adminLoginButton");
  await page.waitForSelector("#adminApp:not([hidden])");
  const loginCall=calls.find(call=>call.url.includes("grant_type=password"));
  report("admin login requests client_type admin and no admin data is read before it",
    loginCall&&loginCall.method==="POST"&&loginCall.body.client_type==="admin"&&preLoginAdminReads===0,
    {loginCall,preLoginAdminReads});

  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("hnk_admin_sess_v1")||"{}"));
  const mfaAbsence=await page.evaluate(()=>({gate:!!document.getElementById("adminMfa"),card:!!document.getElementById("setupMfa"),markup:/mfa|authenticator/i.test(document.documentElement.outerHTML)}));
  report("password sign-in opens a tab-scoped admin session with no authenticator step anywhere in the shell",
    stored.client_type==="admin"&&stored.access==="ADMIN-A"&&Object.values(mfaAbsence).every(present=>!present),
    {stored,mfaAbsence});

  async function measure(width,height){
    await page.setViewportSize({width,height});
    return page.evaluate(()=>{
      const interactive=[...document.querySelectorAll("button,input,select,textarea,a[href]")].filter(el=>el.getClientRects().length&&!el.disabled);
      const hasName=el=>el.getAttribute("aria-label")||el.getAttribute("aria-labelledby")||
        el.textContent.trim()||el.getAttribute("title")||
        (el.labels&&[...el.labels].some(label=>label.textContent.trim()));
      return {inner:innerWidth,scroll:document.documentElement.scrollWidth,small:interactive.filter(el=>{const r=el.getBoundingClientRect();return r.height<44||r.width<44;}).map(el=>el.id||el.textContent.trim().slice(0,20)),unnamed:interactive.filter(el=>!hasName(el)).map(el=>el.id||el.tagName.toLowerCase())};
    });
  }
  const m390=await measure(390,844),m320=await measure(320,800),m1280=await measure(1280,900);
  report("admin has no horizontal overflow at 320/390/1280",[m390,m320,m1280].every(m=>m.scroll<=m.inner+1),{m390,m320,m1280});
  report("all visible admin controls clear 44px and have names",[m390,m320,m1280].every(m=>!m.small.length&&!m.unnamed.length),{m390,m320,m1280});

  await page.setViewportSize({width:390,height:844});
  /* Mobile navigation is intentionally off-canvas and closes after every
     selection. Exercise the real menu control instead of force-clicking a
     hidden sidebar button. */
  await page.click("#menuButton");
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
  const accountActionLabels=await page.locator("#accountActions button").allTextContents();
  report("an active account never offers the pending-only Approve action",
    !accountActionLabels.includes("Approve"),accountActionLabels);

  /* The shell writes the "completed" status BEFORE awaiting the three refresh
     requests, and clears the mutation key only after they resolve (admin.js:
     notify(...) then await Promise.all([...]) then clearMutation). Waiting on
     the status text alone samples sessionStorage while those refreshes are
     still in flight, which is why this read used to be racy. Wait for the key
     count the assertion expects; a count that never arrives still fails, and
     report() below still records the state that was actually observed. */
  const extendKeys = async expected => {
    try {
      await page.waitForFunction(count=>Object.keys(sessionStorage)
        .filter(key=>key.startsWith("hnk_admin_mutation_v1:extend_license:")).length===count,
        expected,{timeout:10000});
    } catch { /* fall through to the read below */ }
    return page.evaluate(()=>Object.keys(sessionStorage)
      .filter(key=>key.startsWith("hnk_admin_mutation_v1:extend_license:")));
  };

  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>/Temporary extension failure/.test(document.getElementById("liveStatus").textContent));
  await page.selectOption("#licenseMonths","3");
  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>/Extend License completed/i.test(document.getElementById("liveStatus").textContent));
  const extendKeysBeforeReload=await extendKeys(1);
  await page.reload({waitUntil:"networkidle"});
  await page.waitForSelector("#adminApp:not([hidden])");
  await page.click("#menuButton");
  await page.click('[data-panel="students"]');
  await page.click("#studentCards [data-student-id='student-1']");
  await page.waitForSelector("#studentDialog[open]");
  await page.selectOption("#licenseMonths","1");
  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>/Extend License completed/i.test(document.getElementById("liveStatus").textContent));
  const extendCalls=calls.filter(call=>/\/students\/student-1\/actions$/.test(call.url));
  const extendKeysAfterSuccess=await extendKeys(0);
  report("license-extension A survives interleaved B and reload, then clears only A on success",
    extendCalls.length===3&&extendCalls.every(call=>call.body.action==="extend_license"&&
      /^[0-9a-f-]{36}$/i.test(call.body.mutation_id||""))&&
      extendCalls[0].body.months===1&&extendCalls[1].body.months===3&&extendCalls[2].body.months===1&&
      extendCalls[0].body.mutation_id===extendCalls[2].body.mutation_id&&
      extendCalls[0].body.mutation_id!==extendCalls[1].body.mutation_id&&
      extendKeysBeforeReload.length===1&&extendKeysAfterSuccess.length===0,
    {extendCalls,extendKeysBeforeReload,extendKeysAfterSuccess});

  await page.selectOption("#licenseMonths","6");
  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>/Extend License completed, but refreshed data could not be loaded\./i
    .test(document.getElementById("liveStatus").textContent));
  const committedKeyBeforeReload=await extendKeys(1);
  await page.reload({waitUntil:"networkidle"});
  await page.waitForSelector("#adminApp:not([hidden])");
  await page.click("#menuButton");
  await page.click('[data-panel="students"]');
  await page.click("#studentCards [data-student-id='student-1']");
  await page.waitForSelector("#studentDialog[open]");
  await page.selectOption("#licenseMonths","6");
  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>/Extend License completed\./i
    .test(document.getElementById("liveStatus").textContent));
  const committedExtendCalls=calls.filter(call=>/\/students\/student-1\/actions$/.test(call.url)&&call.body.months===6);
  const committedKeysAfterReplay=await extendKeys(0);
  report("a committed extension keeps its mutation id through refresh failure and clears it after replay refresh",
    committedExtendCalls.length===2&&
      committedExtendCalls[0].body.mutation_id===committedExtendCalls[1].body.mutation_id&&
      committedKeyBeforeReload.length===1&&committedKeysAfterReplay.length===0,
    {committedExtendCalls,committedKeyBeforeReload,committedKeysAfterReplay});

  /* A fourth, 12-month extension succeeds and then finds the admin bearer
     expired on all three concurrent surface refreshes at once. */
  await page.selectOption("#licenseMonths","12");
  await page.click("#extendLicense");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  const refreshSettled=await Promise.race([refreshedSurfaces.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),10000))]);
  const rotatedKeys=await extendKeys(0);
  const rotatedSession=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("hnk_admin_sess_v1")||"{}"));
  report("concurrent post-action 401s share one rotating refresh and replay with its new bearer",
    refreshSettled&&refreshCalls===1&&rotatedSession.access==="ADMIN-B"&&rotatedKeys.length===0,
    {refreshSettled,refreshCalls,refreshedSurfaceReads,rotatedSession,rotatedKeys});

  await page.keyboard.press("Escape");
  report("Escape closes the student dialog",!(await page.locator("#studentDialog").evaluate(el=>el.open)));

  await page.click("#menuButton");
  await page.click('[data-panel="history"]');
  await page.fill("#historySearch","Aye");
  await page.selectOption("#historyType","failed_login");
  await page.click("#historyFilters button[type=submit]");
  const historyCall=[...calls].reverse().find(call=>/\/histories\?/.test(call.url));
  const historyParams=new URL(historyCall.url).searchParams;
  report("history type/search filters reach the backend contract",historyParams.get("type")==="failed_login"&&historyParams.get("search")==="Aye",Object.fromEntries(historyParams));

  await page.setViewportSize({width:1280,height:900});
  const paymentAbsence=await page.evaluate(()=>({
    nav:!!document.querySelector('[data-panel="payments"]'),
    panel:!!document.getElementById("panel-payments"),
    proofDialog:!!document.getElementById("paymentProofDialog"),
    reviewDialog:!!document.getElementById("paymentReviewDialog"),
    grantForm:!!document.getElementById("paymentGrantForm"),
    markup:/payment/i.test(document.documentElement.outerHTML),
  }));
  report("the retired payment queue, proof, review and VIP-grant surfaces are absent from the served shell",
    Object.values(paymentAbsence).every(present=>!present),paymentAbsence);

  dashboard401=true;
  await page.click('[data-panel="overview"]');
  await page.waitForTimeout(250);
  const refreshCall=[...calls].reverse().find(call=>call.url.includes("grant_type=refresh_token"));
  report("admin refresh rotation retains client_type admin",refreshCall&&refreshCall.body.client_type==="admin",refreshCall);
  const paymentCalls=calls.filter(call=>/payment/i.test(call.url));
  report("no admin interaction ever called a payment endpoint",!paymentCalls.length,paymentCalls);
  const mfaCalls=calls.filter(call=>/\/mfa\//.test(call.url));
  report("no admin interaction ever called an MFA endpoint",!mfaCalls.length,mfaCalls);

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
  console.log("\nPASS — admin dedicated-session, responsive and accessibility sweep");
})().catch(async error=>{
  console.error(error);
  if(browser) await browser.close().catch(()=>{});
  if(server) await new Promise(resolve=>server.close(resolve));
  process.exit(1);
});
