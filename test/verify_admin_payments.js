"use strict";

/* Strict payment administration contract. Cross-account payment reads and
 * writes must stay behind the dedicated admin session, role, MFA and audit
 * boundary; generic /rest browser access is tested separately as denied. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const admin = require(path.join(ROOT, "server", "lib", "admin-api.js"));
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok || detail === undefined ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";
const MUTATION_ID = "44444444-4444-4444-8444-444444444444";
/* An ENROLLED administrator: MFA is optional, so the "missing MFA is rejected"
   assertions below only hold for an admin who has actually confirmed a second
   factor. mfaEnrolled:true is what makes {..., mfaVerified:false} a session
   that opted into MFA and has not yet passed it this time. */
const verifiedAdmin = {
  uid: ADMIN_ID, clientType: "admin", roles: ["admin"],
  mfaEnrolled: true, mfaVerified: true,
};

function sqlText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function apiCode(error) { return error && { status:error.status, code:error.code }; }

async function verifyExportsAndBoundary() {
  const names = ["listPaymentRequests", "reviewPayment", "paymentProof", "grantPayment"];
  report("strict payment admin functions are exported",
    names.every(name => typeof admin[name] === "function"),
    names.filter(name => typeof admin[name] !== "function"));
  if (names.some(name => typeof admin[name] !== "function")) return;

  let touched = 0;
  const client = { query: async () => { touched++; return { rows:[] }; } };
  let webError = null;
  try {
    await admin.listPaymentRequests(client,
      { ...verifiedAdmin,clientType:"web" },new URLSearchParams());
  } catch (error) { webError = apiCode(error); }
  let mfaError = null;
  try {
    await admin.listPaymentRequests(client,
      { ...verifiedAdmin,mfaVerified:false },new URLSearchParams());
  } catch (error) { mfaError = apiCode(error); }
  report("payment administration rejects web sessions and missing MFA before querying",
    webError && webError.status === 403 && webError.code === "forbidden" &&
      mfaError && mfaError.status === 403 && mfaError.code === "mfa_required" && touched === 0,
    {webError,mfaError,touched});

  let strictTouched=0;const strictClient={query:async()=>{strictTouched++;return {rows:[]};}};
  const strictCalls=[
    () => admin.reviewPayment(strictClient,{...verifiedAdmin,mfaVerified:false},PAYMENT_ID,
      {status:"approved",note:"verified"},{}),
    () => admin.grantPayment(strictClient,{...verifiedAdmin,mfaVerified:false},
      {email:"student@example.test",kind:"plan_1m",note:"verified",mutation_id:MUTATION_ID},{}),
    () => admin.paymentProof(strictClient,{...verifiedAdmin,mfaVerified:false},PAYMENT_ID,{}),
  ];
  const strictErrors=[];
  for (const invoke of strictCalls) {
    try { await invoke(); } catch (error) { strictErrors.push(apiCode(error)); }
  }
  report("review, grant and proof each require current admin MFA before querying",
    strictErrors.length===strictCalls.length &&
      strictErrors.every(error=>error&&error.status===403&&error.code==="mfa_required") &&
      strictTouched===0,
    {strictErrors,strictTouched});
}

async function verifyList() {
  if (typeof admin.listPaymentRequests !== "function") return;
  const calls = [];
  const client = { query: async (sql,values) => {
    const normalized=sqlText(sql);
    calls.push({sql:normalized,values});
    if (/^select count\(\*\)::int as total/.test(normalized)) {
      return {rows:[{total:1,app_settings_count:1}]};
    }
    return { rows:[{
      id:PAYMENT_ID,user_id:STUDENT_ID,name:"Student",email:"student@example.test",
      kind:"plan_1m",status:"pending",screenshot_path:STUDENT_ID+"/proof.jpg",
    }] };
  } };
  const result = await admin.listPaymentRequests(client,verifiedAdmin,
    new URLSearchParams("status=pending&q=student&page=1&limit=20"));
  const item = result.payment_requests && result.payment_requests[0];
  report("payment queue is server-listed with bounded filters and an opaque proof route",
    calls.length === 2 && calls[1].values.includes("pending") && calls[1].values.includes("%student%") &&
      result.total === 1 && item && item.id === PAYMENT_ID &&
      Array.isArray(result.configuration_warnings) && result.configuration_warnings.length===0 &&
      item.proof_url === "/api/v1/admin/payment-requests/"+PAYMENT_ID+"/proof" &&
      !("screenshot_path" in item) && !("total_count" in item),
    {calls,result});

  const historyCalls=[];
  const historyClient={query:async(sql,values)=>{
    const normalized=sqlText(sql);
    historyCalls.push({sql:normalized,values});
    if (/^select count\(\*\)::int as total/.test(normalized)) {
      return {rows:[{total:0,app_settings_count:2}]};
    }
    return {rows:[]};
  }};
  const history=await admin.listPaymentRequests(historyClient,verifiedAdmin,
    new URLSearchParams("status=history&page=2&limit=10"));
  report("payment history maps to terminal approved and rejected requests",
    historyCalls.length===2 &&
      historyCalls.every(call=>/r\.status in \('approved','rejected'\)/.test(call.sql)) &&
      historyCalls.every(call=>!call.values.includes("history")) &&
      history.page===2 && history.limit===10 && history.total===0 &&
      history.configuration_warnings.length===1 &&
      history.configuration_warnings[0].code==="app_settings_row_count" &&
      history.configuration_warnings[0].count===2,
    {historyCalls,history});
}

function reviewClient(initialStatus) {
  const calls = [];
  const client = { query: async (sql,values) => {
    const normalized = sqlText(sql);
    calls.push({sql:normalized,values});
    if (/from public\.payment_requests r where r\.id=\$1$/.test(normalized)) {
      return { rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,kind:"plan_1m",status:initialStatus}] };
    }
    if (/from public\.profiles where id=\$1 for update$/.test(normalized)) {
      return { rows:[{id:STUDENT_ID}] };
    }
    if (/from public\.payment_requests where id=\$1 and user_id=\$2 for update$/.test(normalized)) {
      return { rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,kind:"plan_1m",status:initialStatus,note:null}] };
    }
    if (/^update public\.payment_requests/.test(normalized)) {
      return { rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,kind:"plan_1m",status:values[1],
        reviewed_by:values[2],note:values[4]}] };
    }
    if (/^insert into public\.admin_audit_logs/.test(normalized)) return { rows:[] };
    throw new Error("unexpected SQL: "+normalized);
  } };
  return {client,calls};
}

async function verifyReview() {
  if (typeof admin.reviewPayment !== "function") return;
  const fixture = reviewClient("pending");
  const result = await admin.reviewPayment(fixture.client,verifiedAdmin,PAYMENT_ID,
    {status:"approved",note:"verified"},{ipHash:"ip",userAgent:"ua"});
  const update = fixture.calls.find(call => /^update public\.payment_requests/.test(call.sql));
  const audit = fixture.calls.find(call => /^insert into public\.admin_audit_logs/.test(call.sql));
  report("payment review locks state, sets reviewer/time on the server and audits atomically",
    fixture.calls.some(call => /profiles where id=\$1 for update$/.test(call.sql)) &&
      fixture.calls.some(call => /payment_requests where id=\$1 and user_id=\$2 for update$/.test(call.sql)) &&
      update && /reviewed_at=now\(\)/.test(update.sql) &&
      update.values[1] === "approved" && update.values[2] === ADMIN_ID &&
      audit && audit.values[0] === ADMIN_ID && audit.values[1] === STUDENT_ID &&
      result.payment_request && result.payment_request.status === "approved",
    {calls:fixture.calls,result});

  let forgedError = null;
  let forgedTouched = 0;
  try {
    await admin.reviewPayment({query:async()=>{forgedTouched++;return {rows:[]};}},
      verifiedAdmin,PAYMENT_ID,{status:"approved",reviewed_by:STUDENT_ID},{});
  } catch (error) { forgedError = apiCode(error); }
  report("payment review rejects client-supplied reviewer fields before querying",
    forgedError && forgedError.status === 400 && forgedTouched === 0,
    {forgedError,forgedTouched});

  let noteError=null;let noteTouched=0;
  try {
    await admin.reviewPayment({query:async()=>{noteTouched++;return {rows:[]};}},
      verifiedAdmin,PAYMENT_ID,{status:"approved",note:" "},{});
  } catch (error) { noteError=apiCode(error); }
  report("payment review requires an admin note before querying",
    noteError && noteError.status===400 && noteError.code==="invalid_payment_note" && noteTouched===0,
    {noteError,noteTouched});

  const replay = reviewClient("approved");
  let replayError = null;
  try {
    await admin.reviewPayment(replay.client,verifiedAdmin,PAYMENT_ID,{status:"rejected",note:"duplicate"},{});
  } catch (error) { replayError = apiCode(error); }
  report("a terminal payment cannot be reviewed twice or audited twice",
    replayError && replayError.status === 409 && replayError.code === "payment_already_reviewed" &&
      !replay.calls.some(call => /^update public\.payment_requests|^insert into public\.admin_audit_logs/.test(call.sql)),
    {replayError,calls:replay.calls});
}

async function verifyGrant() {
  if (typeof admin.grantPayment !== "function") return;
  const calls = [];
  const client = { query:async(sql,values)=>{
    const normalized=sqlText(sql);calls.push({sql:normalized,values});
    if (/from public\.profiles p join public\.hnk_auth_users u/.test(normalized)) {
      return {rows:[{id:STUDENT_ID,email:"student@example.test"}]};
    }
    if (/from public\.profiles where id=\$1 for update$/.test(normalized)) return {rows:[{id:STUDENT_ID}]};
    if (/^insert into public\.admin_audit_logs/.test(normalized)&&/mutation_id/.test(normalized)) {
      return {rows:[{id:"55555555-5555-4555-8555-555555555555"}],rowCount:1};
    }
    if (/^insert into public\.payment_requests/.test(normalized)) return {rows:[{
      id:PAYMENT_ID,user_id:STUDENT_ID,kind:values[1],status:"pending",is_grant:true,
      amount_mmk:0,note:values[2],
    }]};
    if (/^update public\.payment_requests/.test(normalized)) return {rows:[{
      id:PAYMENT_ID,user_id:STUDENT_ID,kind:"plan_3m",status:"approved",is_grant:true,
      amount_mmk:0,note:"scholarship",reviewed_by:values[1],reviewed_at:new Date(),
    }]};
    if (/^update public\.admin_audit_logs/.test(normalized)) return {rows:[{id:values[0]}],rowCount:1};
    throw new Error("unexpected SQL: "+normalized);
  }};
  const result=await admin.grantPayment(client,verifiedAdmin,
    {email:"student@example.test",kind:"plan_3m",note:"scholarship",mutation_id:MUTATION_ID},{});
  const insert=calls.find(call=>/^insert into public\.payment_requests/.test(call.sql));
  const approval=calls.find(call=>/^update public\.payment_requests/.test(call.sql));
  report("VIP grants atomically apply entitlement through the strict audited server path",
    insert && /is_grant,amount_mmk,note/.test(insert.sql) &&
      insert.values[0]===STUDENT_ID && insert.values[1]==="plan_3m" &&
      approval && /status='approved'/.test(approval.sql) && /reviewed_at=now\(\)/.test(approval.sql) &&
      approval.values[0]===PAYMENT_ID && approval.values[1]===ADMIN_ID &&
      result.payment_request && result.payment_request.status==="approved" &&
      calls.some(call=>/^insert into public\.admin_audit_logs/.test(call.sql) &&
        call.values[0]===ADMIN_ID && call.values[1]===STUDENT_ID && call.values[2]==="grant_payment" &&
        call.values.includes(MUTATION_ID)) &&
      calls.some(call=>/^update public\.admin_audit_logs/.test(call.sql)&&/result=/.test(call.sql)),
    {calls,result});

  let invalidError=null;let invalidTouched=0;
  try {
    await admin.grantPayment({query:async()=>{invalidTouched++;return {rows:[]};}},verifiedAdmin,
      {email:"student@example.test",kind:"plan_3m",note:"  "},{});
  } catch (error) { invalidError=apiCode(error); }
  report("VIP grants require an admin note before querying",
    invalidError && invalidError.status===400 && invalidError.code==="invalid_payment_note" && invalidTouched===0,
    {invalidError,invalidTouched});

  let mutationError=null;let mutationTouched=0;
  try {
    await admin.grantPayment({query:async()=>{mutationTouched++;return {rows:[]};}},verifiedAdmin,
      {email:"student@example.test",kind:"plan_3m",note:"scholarship"},{});
  } catch (error) { mutationError=apiCode(error); }
  report("VIP grants require a durable mutation identifier before querying",
    mutationError&&mutationError.status===400&&mutationError.code==="invalid_mutation_id"&&mutationTouched===0,
    {mutationError,mutationTouched});
}

async function verifyProof() {
  if (typeof admin.paymentProof !== "function") return;
  const calls=[];const bytes=Buffer.from([0xff,0xd8,0xff,0xd9]);
  const client={query:async(sql,values)=>{
    const normalized=sqlText(sql);calls.push({sql:normalized,values});
    if (/from public\.payment_requests where id=\$1 for share$/.test(normalized)) {
      return {rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,screenshot_path:STUDENT_ID+"/proof.jpg"}]};
    }
    if (/from public\.hnk_storage_objects/.test(normalized)) {
      if (/octet_length\(data\)/.test(normalized)) {
        return {rows:[{mime_type:"image/jpeg",byte_length:bytes.length}]};
      }
      return {rows:[{data:bytes}]};
    }
    if (/^insert into public\.admin_audit_logs/.test(normalized)) return {rows:[]};
    throw new Error("unexpected SQL: "+normalized);
  }};
  const result=await admin.paymentProof(client,verifiedAdmin,PAYMENT_ID,{ipHash:"ip",userAgent:"ua"});
  const objectRead=calls.find(call=>/hnk_storage_objects/.test(call.sql)&&/octet_length/.test(call.sql));
  const bytesRead=calls.find(call=>/hnk_storage_objects/.test(call.sql)&&/^select data/.test(call.sql));
  const auditRead=calls.find(call=>/^insert into public\.admin_audit_logs/.test(call.sql));
  report("proof retrieval derives the private object from the payment row",
    objectRead && objectRead.values[0]==="payment-proofs" &&
      objectRead.values[1]===STUDENT_ID+"/proof.jpg" &&
      /for share$/.test(objectRead.sql) && bytesRead &&
      auditRead && auditRead.values[0]===ADMIN_ID && auditRead.values[1]===STUDENT_ID &&
      auditRead.values[2]==="view_payment_proof" &&
      Buffer.isBuffer(result.raw) && result.raw.equals(bytes) && result.contentType==="image/jpeg",
    {calls,contentType:result.contentType,size:result.raw&&result.raw.length});

  let unsafeError=null;const unsafeCalls=[];
  try {
    await admin.paymentProof({query:async(sql)=>{
      const normalized=sqlText(sql);unsafeCalls.push(normalized);
      if (/from public\.payment_requests where id=\$1 for share$/.test(normalized)) {
        return {rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,screenshot_path:STUDENT_ID+"/proof.svg"}]};
      }
      return {rows:[{mime_type:"image/svg+xml; charset=utf-8",byte_length:6}]};
    }},verifiedAdmin,PAYMENT_ID,{});
  } catch (error) { unsafeError=apiCode(error); }
  report("proof retrieval rejects active or untrusted stored content types before bytes or audit",
    unsafeError && unsafeError.status===415 && unsafeError.code==="unsupported_payment_proof_type" &&
      unsafeCalls.length===2 && !unsafeCalls.some(sql=>/^select data|admin_audit_logs/.test(sql)),
    {unsafeError,unsafeCalls});

  let largeError=null;const largeCalls=[];
  try {
    await admin.paymentProof({query:async(sql)=>{
      const normalized=sqlText(sql);largeCalls.push(normalized);
      if (/from public\.payment_requests where id=\$1 for share$/.test(normalized)) {
        return {rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,screenshot_path:STUDENT_ID+"/large.jpg"}]};
      }
      return {rows:[{mime_type:"image/jpeg",byte_length:20*1024*1024}]};
    }},verifiedAdmin,PAYMENT_ID,{});
  } catch (error) { largeError=apiCode(error); }
  report("proof retrieval rejects an oversized stored object before loading bytes or auditing",
    largeError && largeError.status===413 && largeError.code==="payment_proof_too_large" &&
      largeCalls.length===2 && !largeCalls.some(sql=>/^select data|admin_audit_logs/.test(sql)),
    {largeError,largeCalls});

  let pathError=null;const pathCalls=[];
  try {
    await admin.paymentProof({query:async(sql)=>{
      pathCalls.push(sqlText(sql));
      return {rows:[{id:PAYMENT_ID,user_id:STUDENT_ID,
        screenshot_path:"44444444-4444-4444-8444-444444444444/proof.jpg"}]};
    }},verifiedAdmin,PAYMENT_ID,{});
  } catch (error) { pathError=apiCode(error); }
  report("proof retrieval rejects a path outside the payment owner's folder before reading bytes",
    pathError && pathError.status===404 && pathCalls.length===1 &&
      !pathCalls.some(sql=>/hnk_storage_objects|admin_audit_logs/.test(sql)),
    {pathError,pathCalls});
}

async function verifyRoutes() {
  const v1=fs.readFileSync(path.join(ROOT,"server","lib","v1.js"),"utf8");
  const server=fs.readFileSync(path.join(ROOT,"server","index.js"),"utf8");
  report("v1 publishes list, review, proof and grant routes only under /admin",
    /\/v1\/admin\/payment-requests/.test(v1) && /\(review\|proof\)/.test(v1) &&
      /admin\.reviewPayment/.test(v1) && /admin\.paymentProof/.test(v1) &&
      /\/v1\/admin\/payment-grants/.test(v1) &&
      /async function adminCall[\s\S]*?return asService/.test(v1) &&
      !/\/rest\/v1\/payment_requests/.test(v1));
  report("the HTTP boundary sends proof bytes with private no-store protection",
    /out\.raw/.test(server) && /Cache-Control["']\s*,\s*["']private, no-store/.test(server) &&
      /X-Content-Type-Options["']\s*,\s*["']nosniff/.test(server) &&
      /Content-Length["']\s*:\s*body\.length/.test(server));
}

(async()=>{
  await verifyExportsAndBoundary();
  await verifyList();
  await verifyReview();
  await verifyGrant();
  await verifyProof();
  await verifyRoutes();
  console.log("\n"+(failures?"FAIL ("+failures+")":"PASS (strict admin payments)"));
  process.exit(failures?1:0);
})().catch(error=>{console.error(error&&error.stack||error);process.exit(1);});
