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
  let paymentRefresh401 = false;
  let refreshCalls = 0;
  let refreshedSurfaceReads = 0;
  let resolveRefreshedSurfaces;
  const refreshedSurfaces = new Promise(resolve => { resolveRefreshedSurfaces = resolve; });
  const proofPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n6sAAAAASUVORK5CYII=", "base64");
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
    if (url.includes("/mfa/setup")) return json(200,{secret:"JBSWY3DPEHPK3PXP",otpauth_uri:"otpauth://totp/HNK:owner?secret=JBSWY3DPEHPK3PXP"});
    if (url.includes("/mfa/verify")) { mfaVerified = parsed.code === "123456"; return json(mfaVerified?200:400,mfaVerified?{ok:true,mfa_verified:true}:{error:"invalid_mfa_code"}); }
    if (paymentRefresh401 && request.method()==="GET" && /\/(dashboard|students\?|payment-requests\?)/.test(url)) {
      const bearer=request.headers()["authorization"]||"";
      if(bearer==="Bearer ADMIN-A") return json(401,{error:"session_expired"});
      if(bearer==="Bearer ADMIN-B") {
        refreshedSurfaceReads++;
        if(refreshedSurfaceReads>=3){paymentRefresh401=false;resolveRefreshedSurfaces();}
      }
    }
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
    if (/\/payment-requests\/request-1\/proof$/.test(url)) return route.fulfill({status:200,contentType:"image/png",body:proofPng});
    if (/\/payment-requests\/request-1\/review$/.test(url)) { paymentRefresh401=true; return json(200,{ok:true,payment_request:{id:"request-1",status:parsed.status,note:parsed.note}}); }
    if (/\/payment-requests\?/.test(url)) {
      const status=new URL(url).searchParams.get("status");
      if(status==="history") return json(200,{payment_requests:[{id:"request-2",student_name:"Ko Min",student_email:"min@example.com",kind:"plan_1m",amount_mmk:11000,status:"approved",note:"Transfer verified",created_at:"2026-08-24T03:00:00Z",reviewed_at:"2026-08-25T04:00:00Z"}],page:1,limit:20,total:1});
      return json(200,{payment_requests:[{id:"request-1",student_name:"Aye Aye",student_email:"aye@example.com",kind:"plan_3m",amount_mmk:30000,quoted_amount_mmk:33000,txn_last6:"123456",screenshot_path:"student-1/proof.png",status:"pending",created_at:"2026-08-26T03:00:00Z"}],configuration_warnings:[{code:"app_settings_row_count",count:2}],page:1,limit:20,total:1});
    }
    if (url.includes("/payment-grants")) return json(201,{ok:true,payment_request:{id:"grant-1",status:"approved",is_grant:true}});
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
  await page.click('[data-panel="payments"]');
  await page.waitForSelector("#paymentRows [data-payment-proof='request-1']");
  const pendingCall=[...calls].reverse().find(call=>/\/payment-requests\?/.test(call.url));
  const pendingParams=new URL(pendingCall.url).searchParams;
  report("payment queue requests the server-authorized pending page",pendingParams.get("status")==="pending"&&pendingParams.get("page")==="1"&&pendingParams.get("limit")==="20",Object.fromEntries(pendingParams));
  const desktopPayment=await page.locator("#paymentRows tr").first().innerText();
  const configurationWarning=await page.locator("#paymentConfigWarning").innerText();
  const mismatchPresentation=await page.locator("#paymentRows .payment-mismatch").evaluate(element=>{const style=getComputedStyle(element);return{role:element.getAttribute("role"),background:style.backgroundColor,border:style.borderTopColor,color:style.color};});
  const configurationPresentation=await page.locator("#paymentConfigWarning").evaluate(element=>{const style=getComputedStyle(element);return{role:element.getAttribute("role"),background:style.backgroundColor,border:style.borderTopColor,color:style.color};});
  report("desktop queue separates sent and due amounts and visibly flags an accessible mismatch",/Sent\s+30,000 MMK/.test(desktopPayment)&&/Due\s+33,000 MMK/.test(desktopPayment)&&/Amount mismatch/.test(desktopPayment)&&mismatchPresentation.role==="alert"&&!/rgba?\(0, 0, 0, 0\)/.test(mismatchPresentation.background),{desktopPayment,mismatchPresentation});
  report("payment configuration singleton warnings are prominent and accessible",await page.locator("#paymentConfigWarning").isVisible()&&/2 configuration rows/.test(configurationWarning)&&configurationPresentation.role==="alert"&&!/rgba?\(0, 0, 0, 0\)/.test(configurationPresentation.background),{configurationWarning,configurationPresentation});
  await page.setViewportSize({width:390,height:844});
  await page.waitForSelector("#paymentCards .payment-mismatch",{state:"visible"});
  const mobilePayment=await page.locator("#paymentCards .payment-card").first().innerText();
  report("mobile payment card preserves sent, due and mismatch evidence",/Sent\s+30,000 MMK/.test(mobilePayment)&&/Due\s+33,000 MMK/.test(mobilePayment)&&/Amount mismatch/.test(mobilePayment),mobilePayment);
  await page.setViewportSize({width:1280,height:900});

  await page.evaluate(()=>{const revoke=URL.revokeObjectURL.bind(URL);window.__revokedPaymentProofs=[];URL.revokeObjectURL=url=>{window.__revokedPaymentProofs.push(url);revoke(url);};});
  await page.click("#paymentRows [data-payment-proof='request-1']");
  await page.waitForSelector("#paymentProofDialog[open] #paymentProofImage[src^='blob:']");
  const proofSrc=await page.locator("#paymentProofImage").getAttribute("src");
  report("payment proof is fetched as an authenticated Blob and displayed in-page",calls.some(call=>/\/payment-requests\/request-1\/proof$/.test(call.url))&&String(proofSrc).startsWith("blob:"),proofSrc);
  await page.click("#closePaymentProof");
  const proofClosed=await page.evaluate(src=>({revoked:window.__revokedPaymentProofs.includes(src),src:document.getElementById("paymentProofImage").getAttribute("src"),hidden:document.getElementById("paymentProofImage").hidden}),proofSrc);
  report("closing proof revokes the in-memory Blob URL and clears the image",proofClosed.revoked&&!proofClosed.src&&proofClosed.hidden,proofClosed);

  await page.click("#paymentRows [data-payment-review='request-1'][data-payment-decision='approved']");
  const approvalMessage=await page.locator("#paymentReviewMessage").innerText();
  report("payment confirmation repeats both sent and due amounts before approval",/sent 30,000 MMK/i.test(approvalMessage)&&/due 33,000 MMK/i.test(approvalMessage)&&/mismatch/i.test(approvalMessage),approvalMessage);
  await page.fill("#paymentReviewNote","Bank transfer verified.");
  await page.click("#confirmPaymentReview");
  await page.waitForFunction(()=>document.getElementById("paymentReviewDialog")&&!document.getElementById("paymentReviewDialog").open);
  const reviewCall=[...calls].reverse().find(call=>/\/payment-requests\/request-1\/review$/.test(call.url));
  report("payment approval sends only the reviewed status and audit note",reviewCall&&reviewCall.method==="POST"&&JSON.stringify(reviewCall.body)===JSON.stringify({status:"approved",note:"Bank transfer verified."}),reviewCall);
  const refreshSettled=await Promise.race([refreshedSurfaces.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),3000))]);
  const rotatedAfterPayment=await page.evaluate(()=>JSON.parse(sessionStorage.getItem("hnk_admin_sess_v1")||"{}"));
  report("concurrent post-review 401s share one rotating refresh and replay with its new bearer",refreshSettled&&refreshCalls===1&&rotatedAfterPayment.access==="ADMIN-B",{refreshSettled,refreshCalls,refreshedSurfaceReads,rotatedAfterPayment});

  await page.click("#paymentRows [data-payment-review='request-1'][data-payment-decision='rejected']");
  await page.fill("#paymentReviewNote","Proof did not match the transfer.");
  await page.click("#confirmPaymentReview");
  await page.waitForFunction(()=>document.getElementById("paymentReviewDialog")&&!document.getElementById("paymentReviewDialog").open);
  const rejectionCall=[...calls].reverse().find(call=>/\/payment-requests\/request-1\/review$/.test(call.url));
  report("payment rejection requires the same explicit note confirmation",rejectionCall&&rejectionCall.method==="POST"&&JSON.stringify(rejectionCall.body)===JSON.stringify({status:"rejected",note:"Proof did not match the transfer."}),rejectionCall);

  await page.fill("#grantEmail","vip@example.com");
  await page.selectOption("#grantKind","plan_3m");
  await page.fill("#grantNote","Three-month scholarship.");
  await page.click("#paymentGrantForm button[type=submit]");
  await page.waitForSelector("#confirmDialog[open]");
  await page.click("#confirmAction");
  await page.waitForFunction(()=>document.getElementById("confirmDialog")&&!document.getElementById("confirmDialog").open);
  await page.waitForFunction(()=>/VIP access granted/i.test(document.getElementById("paymentGrantStatus").textContent));
  const grantCall=[...calls].reverse().find(call=>/\/payment-grants$/.test(call.url));
  report("VIP grant confirmation sends the strict email/kind/note contract",grantCall&&grantCall.method==="POST"&&JSON.stringify(grantCall.body)===JSON.stringify({email:"vip@example.com",kind:"plan_3m",note:"Three-month scholarship."}),grantCall);

  await page.click("[data-payment-view='history']");
  await page.waitForFunction(()=>/Approved/.test(document.getElementById("paymentRows").textContent));
  const historyPaymentCall=[...calls].reverse().find(call=>/\/payment-requests\?/.test(call.url));
  const historyPaymentParams=new URL(historyPaymentCall.url).searchParams;
  report("payment history stays on the same audited endpoint",historyPaymentParams.get("status")==="history",Object.fromEntries(historyPaymentParams));
  const payment320=await measure(320,800),payment1280=await measure(1280,900);
  report("payment review and grant controls stay responsive and accessible",[payment320,payment1280].every(m=>m.scroll<=m.inner+1&&!m.small.length&&!m.unnamed.length),{payment320,payment1280});

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
