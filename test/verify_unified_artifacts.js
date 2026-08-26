"use strict";

/* RED-first private artifact persistence and upload integrity contract. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");

const ROOT=path.join(__dirname,"..");
let failures=0;
function report(name,ok,detail) {
  console.log((ok?"PASS":"FAIL")+" — "+name+(ok?"":"  :: "+JSON.stringify(detail)));
  if (!ok) failures++;
}

function verifySchema() {
  const schemas=[
    {label:"native",sql:fs.readFileSync(path.join(ROOT,"supabase/schema.sql"),"utf8"),force:false},
    {label:"roleless",sql:fs.readFileSync(path.join(ROOT,"server/sql/schema.sql"),"utf8"),force:true},
  ];
  for (const {label,sql,force} of schemas) {
    for (const table of ["panel_artifacts","panel_artifact_chunks"]) {
      report(label+" schema defines private "+table,
        new RegExp("create\\s+table\\s+if\\s+not\\s+exists\\s+public\\."+table,"i").test(sql));
      report(label+" "+table+" has "+(force?"FORCE ":"")+"RLS",
        new RegExp("alter\\s+table\\s+public\\."+table+"\\s+enable\\s+row\\s+level\\s+security","i").test(sql)&&
          (!force||new RegExp("alter\\s+table\\s+public\\."+table+"\\s+force\\s+row\\s+level\\s+security","i").test(sql)));
    }
    report(label+" artifact chunks are capped at four MiB",
      /octet_length\s*\(data\)\s*<=\s*4194304/i.test(sql));
    report(label+" initial 6.24 release is disabled until a private artifact is finalized",
      /values\s*\(\s*'6\.24\.0'\s*,\s*true\s*,\s*true\s*,\s*false/i.test(sql));
  }
}

async function verifyModule() {
  let contract=null;
  try { contract=require(path.join(ROOT,"server/lib/panel-artifacts.js")); }
  catch (error) { report("panel artifact module is loadable",false,{error:String(error.message||error)});return; }
  const wanted=["MAX_CHUNK_BYTES","validateArtifactSpec","decodeArtifactChunk","verifyChunkSequence"];
  const missing=wanted.filter(name=>typeof contract[name]==="undefined");
  report("panel artifact module exports integrity helpers",missing.length===0,{missing});
  if (missing.length) return;

  const bytes=Buffer.from("private panel bytes");
  const digest=crypto.createHash("sha256").update(bytes).digest("hex");
  const spec=contract.validateArtifactSpec({
    version:"6.24.0",artifact_key:"HNK_Ai_Panel_v6.24.0.ccx",
    sha256:digest,size_bytes:bytes.length,chunk_size:65536,
  });
  report("artifact initiation fixes expected SHA, size and bounded chunk geometry",
    spec.expectedSha256===digest&&spec.expectedSizeBytes===bytes.length&&
      spec.chunkSize===65536&&spec.chunkCount===1,{spec});

  const decoded=contract.decodeArtifactChunk({data_base64:bytes.toString("base64"),sha256:digest},65536,bytes.length);
  report("chunk decoder verifies canonical base64, expected size and per-chunk SHA",
    Buffer.isBuffer(decoded.data)&&decoded.data.equals(bytes)&&decoded.sha256===digest,{decodedSize:decoded.data.length});

  const sequence=await contract.verifyChunkSequence(spec,async index => index===0?decoded:null);
  report("finalization recomputes total SHA/size from an ordered contiguous sequence",
    sequence.sha256===digest&&sequence.sizeBytes===bytes.length&&sequence.chunkCount===1,{sequence});

  const failuresExpected=[];
  for (const input of [
    {version:"6.24.0",artifact_key:"../panel.ccx",sha256:digest,size_bytes:bytes.length},
    {version:"6.24.0",artifact_key:"HNK_Ai_Panel_v6.24.0.ccx",sha256:"0".repeat(64),size_bytes:0},
    {version:"6.24.0",artifact_key:"HNK_Ai_Panel_v6.24.0.ccx",sha256:digest,size_bytes:bytes.length,chunk_size:contract.MAX_CHUNK_BYTES+1},
  ]) {
    try { contract.validateArtifactSpec(input);failuresExpected.push(null); }
    catch (error) { failuresExpected.push(error&&error.code); }
  }
  report("artifact initiation rejects traversal, empty artifacts and oversized chunks",
    failuresExpected.every(Boolean),{failuresExpected});

  let mismatch=null;
  try { contract.decodeArtifactChunk({data_base64:bytes.toString("base64"),sha256:"0".repeat(64)},1024,bytes.length); }
  catch (error) { mismatch=error&&error.code; }
  report("chunk upload rejects a mismatched digest",mismatch==="chunk_sha256_mismatch",{mismatch});
}

async function verifyDownloadConcurrency() {
  const source=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  const helperStart=source.indexOf("const MATERIALIZATION_CONCURRENCY_DEFAULT");
  const helperEnd=source.indexOf("const downloadMaterializationSlots",helperStart);
  let contract=null,error="";
  if (helperStart>=0&&helperEnd>helperStart) {
    try {
      contract=Function(source.slice(helperStart,helperEnd)+
        ";return {MATERIALIZATION_CONCURRENCY_DEFAULT,MATERIALIZATION_CONCURRENCY_HARD_MAX,"+
        "STREAM_CONCURRENCY_DEFAULT,STREAM_CONCURRENCY_HARD_MAX,resolveBoundedConcurrency,"+
        "createBoundedSemaphore,releaseSlotAfterCleanup};")();
    } catch (caught) { error=String(caught&&caught.message||caught); }
  }
  report("download concurrency helpers compile independently of database dependencies",
    !!contract,{helperStart,helperEnd,error});
  if (!contract) return;

  report("materialization defaults to one while streams default to four and both clamp configuration",
    contract.resolveBoundedConcurrency(undefined,contract.MATERIALIZATION_CONCURRENCY_DEFAULT,
      contract.MATERIALIZATION_CONCURRENCY_HARD_MAX)===1&&
      contract.resolveBoundedConcurrency("not-a-number",4,8)===4&&
      contract.resolveBoundedConcurrency("0",4,8)===4&&
      contract.resolveBoundedConcurrency("6",4,8)===6&&
      contract.resolveBoundedConcurrency("999",4,8)===8&&
      contract.MATERIALIZATION_CONCURRENCY_DEFAULT===1&&
      contract.MATERIALIZATION_CONCURRENCY_HARD_MAX>=1&&contract.MATERIALIZATION_CONCURRENCY_HARD_MAX<=4&&
      contract.STREAM_CONCURRENCY_DEFAULT===4&&contract.STREAM_CONCURRENCY_HARD_MAX===8,
    {materializationDefault:contract.MATERIALIZATION_CONCURRENCY_DEFAULT,
      materializationHardMax:contract.MATERIALIZATION_CONCURRENCY_HARD_MAX,
      streamDefault:contract.STREAM_CONCURRENCY_DEFAULT,streamHardMax:contract.STREAM_CONCURRENCY_HARD_MAX});

  const two=contract.createBoundedSemaphore(2,1,8);
  const releaseFirst=two.tryAcquire();
  const releaseSecond=two.tryAcquire();
  const refused=two.tryAcquire();
  releaseFirst();releaseFirst();
  const replacement=two.tryAcquire();
  report("bounded semaphore refuses overflow and release is idempotent",
    typeof releaseFirst==="function"&&typeof releaseSecond==="function"&&refused===null&&
      typeof replacement==="function"&&two.active===2&&two.limit===2,
    {limit:two.limit,active:two.active,refused});
  releaseSecond();replacement();

  const materialization=contract.createBoundedSemaphore(undefined,1,2);
  const streams=contract.createBoundedSemaphore(undefined,4,8);
  const releaseMaterialization=materialization.tryAcquire();
  const releaseStream=streams.tryAcquire();
  releaseMaterialization();
  const materializationAgain=materialization.tryAcquire();
  const streamStillHeld=streams.active===1;
  if (materializationAgain) materializationAgain();
  releaseStream();
  report("materialization can release while its independent stream slot remains held",
    typeof materializationAgain==="function"&&streamStillHeld&&materialization.active===0&&streams.active===0,
    {materializationActive:materialization.active,streamActive:streams.active,streamStillHeld});

  const one=contract.createBoundedSemaphore(1,1,8);
  const releaseSlot=one.tryAcquire();
  let finishCleanup;
  const cleanupGate=new Promise(resolve=>{finishCleanup=resolve;});
  let cleanupCalls=0;
  const cleanup=contract.releaseSlotAfterCleanup(async()=>{cleanupCalls++;await cleanupGate;},releaseSlot);
  const pending=cleanup();
  await Promise.resolve();
  const heldThroughCleanup=one.tryAcquire()===null;
  finishCleanup();
  await pending;
  const afterCleanup=one.tryAcquire();
  if (afterCleanup) afterCleanup();
  report("download slot remains held through cleanup and is released afterward",
    heldThroughCleanup&&typeof afterCleanup==="function"&&cleanupCalls===1&&one.active===0,
    {heldThroughCleanup,cleanupCalls,active:one.active});

  const failing=contract.createBoundedSemaphore(1,1,8);
  const releaseFailing=failing.tryAcquire();
  const failedCleanup=contract.releaseSlotAfterCleanup(async()=>{throw new Error("cleanup failed");},releaseFailing);
  let cleanupError="";
  try { await Promise.all([failedCleanup(),failedCleanup()]); }
  catch (error) { cleanupError=String(error&&error.message||error); }
  const recovered=failing.tryAcquire();
  if (recovered) recovered();
  report("cleanup failure and duplicate cleanup calls still release exactly one slot",
    cleanupError==="cleanup failed"&&typeof recovered==="function"&&failing.active===0,
    {cleanupError,active:failing.active});
}

async function verifyDownloadDeviceBinding() {
  const source=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  const helperStart=source.indexOf("async function sessionComputerDevice(");
  const helperEnd=source.indexOf("\n\nasync function meEntitlement",helperStart);
  let sessionComputerDevice=null,error="";
  if (helperStart>=0&&helperEnd>helperStart) {
    try {
      sessionComputerDevice=Function(source.slice(helperStart,helperEnd)+
        ";return sessionComputerDevice;")();
    } catch (caught) { error=String(caught&&caught.message||caught); }
  }
  report("download authorization exposes a testable current-session computer binding helper",
    typeof sessionComputerDevice==="function",{helperStart,helperEnd,error});
  if (!sessionComputerDevice) return;

  const rowsByInstallation=new Map([
    ["phone-installation",{installation_id:"phone-installation",slot_id:"phone-slot",
      client_type:"web",slot_type:"phone",slot_status:"active",installation_revoked_at:null}],
    ["computer-installation",{installation_id:"computer-installation",slot_id:"computer-slot",
      client_type:"web",slot_type:"computer",slot_status:"active",installation_revoked_at:null}],
  ]);
  const bindingQueries=[];
  const bindingClient={query:async(sql,params)=>{
    bindingQueries.push({sql,params});
    const row=rowsByInstallation.get(params[0]);
    return {rows:row?[row]:[]};
  }};
  const baseIdentity={uid:"11111111-1111-4111-8111-111111111111",clientType:"web"};
  const unbound=await sessionComputerDevice(bindingClient,baseIdentity);
  const phone=await sessionComputerDevice(bindingClient,
    Object.assign({},baseIdentity,{deviceInstallationId:"phone-installation"}));
  const computer=await sessionComputerDevice(bindingClient,
    Object.assign({},baseIdentity,{deviceInstallationId:"computer-installation"}));
  const wrongSlot=await sessionComputerDevice(bindingClient,
    Object.assign({},baseIdentity,{deviceInstallationId:"computer-installation"}),"other-computer-slot");
  const normalizedSql=String(bindingQueries[0]&&bindingQueries[0].sql||"").replace(/\s+/g," ").toLowerCase();
  report("only this web session's active computer installation satisfies download binding",
    unbound===null&&phone===null&&computer&&computer.slotId==="computer-slot"&&
      computer.slotType==="computer"&&wrongSlot===null&&bindingQueries.length===3&&
      normalizedSql.includes("from public.device_installations")&&
      normalizedSql.includes("join public.device_slots")&&normalizedSql.includes("i.id=$1")&&
      normalizedSql.includes("s.user_id=$2")&&normalizedSql.includes("i.client_type='web'")&&
      normalizedSql.includes("i.revoked_at is null")&&normalizedSql.includes("s.slot_type='computer'")&&
      normalizedSql.includes("s.status='active'"),
    {unbound,phone,computer,wrongSlot,queries:bindingQueries});

  const issueStart=source.indexOf("async function issueDownload(");
  const issueEnd=source.indexOf("\n\nasync function redeemDownload",issueStart);
  const issueSource=issueStart>=0&&issueEnd>issueStart?source.slice(issueStart,issueEnd):"";
  let issueDownload=null,issueCompileError="";
  const tokenInputs=[];
  const downloadHistoryWrites=[];
  try {
    class TestApiError extends Error {
      constructor(status,message,code) { super(message);this.status=status;this.code=code; }
    }
    const rejectDecision=decision=>{
      if (!decision||decision.allowed!==true) {
        throw new TestApiError(409,"Access denied",decision&&decision.reason||"forbidden");
      }
    };
    const authorizeState=(_state,_capability,device)=>device&&device.slotType==="computer"
      ? {allowed:true,reason:"allowed"}:{allowed:false,reason:"device_required"};
    issueDownload=Function("asService","loadEntitlementState","sessionComputerDevice",
      "authorizeState","rejectDecision","readyArtifactForRelease","createDownloadTokenService",
      "createPgDownloadRepository","requireSecret","ApiError",issueSource+";return issueDownload;")(
      async fn=>fn(bindingClient),async()=>({}),sessionComputerDevice,authorizeState,rejectDecision,
      async(_client,row)=>({artifactKey:row.artifact_key}),options=>({issue:async input=>{
        tokenInputs.push(input);await options.repository.create(input);
        return {token:"signed-token",tokenId:"token-id",expiresAt:"2026-08-26T00:05:00.000Z"};
      }}),()=>({create:async row=>{downloadHistoryWrites.push(row);return {id:"token-id"};}}),
      ()=>"s".repeat(32),TestApiError);
  } catch (caught) { issueCompileError=String(caught&&caught.message||caught); }
  report("panel download issue path compiles with its authorization dependencies isolated",
    typeof issueDownload==="function",{issueStart,issueEnd,issueCompileError});

  if (issueDownload) {
    const originalQuery=bindingClient.query;
    bindingClient.query=async(sql,params)=>{
      if (/insert\s+into\s+public\.download_history/i.test(sql)) downloadHistoryWrites.push({sql,params});
      if (/from\s+public\.panel_versions/i.test(sql)) return {rows:[{
        version:"6.24.0",artifact_key:"HNK_Ai_Panel_v6.24.0.ccx",sha256:"a".repeat(64),
        size_bytes:1,artifact_id:"artifact-id",
      }]};
      return originalQuery(sql,params);
    };
    const context={ipHash:"ip",userAgent:"test"};
    const body={version:"6.24.0"};
    async function deniedCode(identity) {
      try { await issueDownload(identity,body,context);return null; }
      catch (caught) { return caught&&caught.code; }
    }
    const unboundCode=await deniedCode(Object.assign({},baseIdentity,{sessionId:"session-unbound"}));
    const phoneCode=await deniedCode(Object.assign({},baseIdentity,{
      sessionId:"session-phone",deviceInstallationId:"phone-installation",
    }));
    const tokensBeforeComputer=tokenInputs.length;
    const historyBeforeComputer=downloadHistoryWrites.length;
    const computerResult=await issueDownload(Object.assign({},baseIdentity,{
      sessionId:"session-computer",deviceInstallationId:"computer-installation",
    }),body,context);
    report("phone and unbound web sessions issue no CCX history/token while the bound computer succeeds",
      unboundCode==="device_required"&&phoneCode==="device_required"&&tokensBeforeComputer===0&&
        historyBeforeComputer===0&&downloadHistoryWrites.length===1&&
        computerResult&&computerResult.status===200&&tokenInputs.length===1&&
        tokenInputs[0].sessionId==="session-computer"&&
        tokenInputs[0].deviceSlotId==="computer-slot",
      {unboundCode,phoneCode,tokensBeforeComputer,historyBeforeComputer,downloadHistoryWrites,
        computerStatus:computerResult&&computerResult.status,tokenInputs});
  }

  const entitlementStart=source.indexOf("async function meEntitlement(");
  const entitlementEnd=source.indexOf("\n\nasync function enrollDevice",entitlementStart);
  const entitlementSource=entitlementStart>=0&&entitlementEnd>entitlementStart
    ? source.slice(entitlementStart,entitlementEnd):"";
  let meEntitlement=null,entitlementCompileError="";
  try {
    const authorizeState=(_state,capability,device)=>capability==="download"
      ? (device&&device.slotType==="computer"?{allowed:true,reason:"allowed"}:
        {allowed:false,reason:"device_required"})
      : {allowed:true,reason:"allowed"};
    meEntitlement=Function("asService","sessionInstallationHash","hashInstallationId",
      "loadEntitlementState","listDeviceSlots","sessionComputerDevice","authorizeState","publicEntitlement",
      entitlementSource+";return meEntitlement;")(
      async fn=>fn(bindingClient),async(_client,identity)=>identity.deviceInstallationId
        ? {installation_hash:"bound-hash",client_type:"web"}:null,
      value=>value,async()=>({device:null}),async()=>[
        {id:"phone-slot",type:"phone",status:"active"},
        {id:"computer-slot",type:"computer",status:"active"},
      ],sessionComputerDevice,authorizeState,(_state,decisions,slots)=>({
        allowed:{ccx_download:decisions.download.allowed},
        reasons:{ccx_download:decisions.download.reason},devices:slots,
      }));
  } catch (caught) { entitlementCompileError=String(caught&&caught.message||caught); }
  report("account entitlement compiles with current-session device binding isolated",
    typeof meEntitlement==="function",{entitlementStart,entitlementEnd,entitlementCompileError});
  if (meEntitlement) {
    const params=new URLSearchParams("panel_version=6.24.0");
    const phoneEntitlement=await meEntitlement(Object.assign({},baseIdentity,{
      sessionId:"session-phone",deviceInstallationId:"phone-installation",
    }),params);
    const computerEntitlement=await meEntitlement(Object.assign({},baseIdentity,{
      sessionId:"session-computer",deviceInstallationId:"computer-installation",
    }),params);
    report("phone entitlement denies CCX download even when the account also owns a computer slot",
      phoneEntitlement.body.allowed.ccx_download===false&&
        phoneEntitlement.body.reasons.ccx_download==="device_required"&&
        phoneEntitlement.body.devices.some(slot=>slot.type==="computer")&&
        computerEntitlement.body.allowed.ccx_download===true,
      {phone:phoneEntitlement.body,computer:computerEntitlement.body});
  }

  const redeemStart=source.indexOf("async function redeemDownload(");
  const redeemEnd=source.indexOf("\n\nasync function adminCall",redeemStart);
  const redeem=redeemStart>=0&&redeemEnd>redeemStart?source.slice(redeemStart,redeemEnd):"";
  const consumeAt=redeem.indexOf("service.consume({token})");
  const liveAt=redeem.indexOf("from public.sessions",consumeAt);
  const bindingAt=redeem.indexOf("sessionComputerDevice(client",liveAt);
  const authorizeAt=redeem.indexOf('authorizeState(state,"download",device)',bindingAt);
  report("token redemption revalidates the live session's same computer installation and slot",
    consumeAt>=0&&liveAt>consumeAt&&bindingAt>liveAt&&authorizeAt>bindingAt&&
      /device_installation_id/.test(redeem.slice(consumeAt,bindingAt))&&
      /client_type/.test(redeem.slice(consumeAt,bindingAt))&&
      /consumed\.deviceSlotId/.test(redeem.slice(bindingAt,authorizeAt)),
    {consumeAt,liveAt,bindingAt,authorizeAt});
}

async function verifyDownloadRedemptionBinding() {
  const source=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  const helperStart=source.indexOf("async function sessionComputerDevice(");
  const helperEnd=source.indexOf("\n\nasync function meEntitlement",helperStart);
  const redeemStart=source.indexOf("async function redeemDownload(");
  const redeemEnd=source.indexOf("\n\nasync function adminCall",redeemStart);
  const helperSource=helperStart>=0&&helperEnd>helperStart?source.slice(helperStart,helperEnd):"";
  const redeemSource=redeemStart>=0&&redeemEnd>redeemStart?source.slice(redeemStart,redeemEnd):"";
  const panelDownload=require(path.join(ROOT,"server/lib/panel-download.js"));
  const signingSecret="isolated-redemption-secret-2026-08-26";
  const userId="11111111-1111-4111-8111-111111111111";
  const sessionId="22222222-2222-4222-8222-222222222222";
  const issuedSlotId="33333333-3333-4333-8333-333333333333";
  const currentInstallationId="44444444-4444-4444-8444-444444444444";
  const artifactKey="HNK_Ai_Panel_v6.24.0.ccx";
  let activeScenario=null;
  let redeemDownload=null;
  let compileError="";

  class TestApiError extends Error {
    constructor(status,message,code) { super(message);this.status=status;this.code=code; }
  }
  function semaphore() {
    let active=0;
    return {
      get active() { return active; },
      tryAcquire() {
        active++;
        let released=false;
        return ()=>{
          if (released) return false;
          released=true;active--;return true;
        };
      },
    };
  }
  const streamSlots=semaphore();
  const materializationSlots=semaphore();
  const queries=[];
  const client={query:async(sql,params)=>{
    const normalized=String(sql||"").replace(/\s+/g," ").toLowerCase();
    queries.push({scenario:activeScenario&&activeScenario.name,sql:normalized,params});
    if (normalized.includes("pg_advisory_xact_lock")) return {rows:[]};
    if (normalized.includes("from public.download_history")&&normalized.includes("result='streaming'")) {
      return {rows:[{n:0}]};
    }
    if (normalized.includes("from public.sessions s join public.profiles")) {
      return {rows:activeScenario&&activeScenario.live?[activeScenario.live]:[]};
    }
    if (normalized.includes("from public.device_installations i")&&
        normalized.includes("join public.device_slots s")) {
      return {rows:activeScenario&&activeScenario.device?[activeScenario.device]:[]};
    }
    if (normalized.includes("from public.panel_versions")) return {rows:[{
      version:"6.24.0",artifact_key:artifactKey,size_bytes:1,sha256:"a".repeat(64),artifact_id:"artifact-id",
    }]};
    throw new Error("unexpected redemption query: "+normalized);
  }};
  const materializations=[];
  const cleanupCalls=[];

  try {
    redeemDownload=Function("requireSecret","createDownloadTokenService","ApiError",
      "downloadStreamSlots","downloadMaterializationSlots","asService","createPgDownloadRepository",
      "DOWNLOAD_STREAM_STALE_SECONDS","DOWNLOAD_USER_STREAM_LIMIT","loadEntitlementState",
      "authorizeState","rejectDecision","readyArtifactForRelease","materializeArtifact",
      "createDownloadStreamLifecycle","releaseSlotAfterCleanup",
      helperSource+"\n"+redeemSource+"\nreturn redeemDownload;")(
      ()=>signingSecret,panelDownload.createDownloadTokenService,TestApiError,
      streamSlots,materializationSlots,async fn=>fn(client),()=>activeScenario.repository,
      2100,1,async()=>({}),(_state,_capability,device)=>device
        ? {allowed:true,reason:"allowed"}:{allowed:false,reason:"device_required"},
      decision=>{
        if (!decision||decision.allowed!==true) {
          throw new TestApiError(409,"Access denied",decision&&decision.reason||"forbidden");
        }
      },async(_client,row)=>({artifactKey:row.artifact_key}),async()=>{
        materializations.push(activeScenario.name);
        return {filename:artifactKey,size:1,filePath:"/tmp/private-panel.ccx",cleanup:async()=>{
          cleanupCalls.push(activeScenario.name);
        }};
      },panelDownload.createDownloadStreamLifecycle,(cleanup,releaseSlot)=>{
        let pending=null;
        return ()=>{
          if (!pending) pending=Promise.resolve().then(()=>cleanup()).finally(()=>releaseSlot());
          return pending;
        };
      });
  } catch (caught) { compileError=String(caught&&caught.message||caught); }
  report("CCX token redemption path compiles as an executable isolated contract",
    typeof redeemDownload==="function",{helperStart,helperEnd,redeemStart,redeemEnd,compileError});
  if (!redeemDownload) return;

  function repository() {
    let row=null;
    return {
      async create(input) { row=Object.assign({id:"download-id",downloadedAt:null},input);return row; },
      async findByTokenHash(hash) { return row&&row.tokenHash===hash?row:null; },
      async consumeIfUnused(hash,downloadedAt) {
        if (!row||row.tokenHash!==hash||row.downloadedAt) return null;
        row=Object.assign({},row,{downloadedAt,result:"streaming"});
        return row;
      },
      async completeStream(_id,result,reason) {
        row=Object.assign({},row,{result,reason,completedAt:new Date().toISOString()});
        return row;
      },
    };
  }
  const liveSession=overrides=>Object.assign({
    revoked_at:null,expires_at:new Date(Date.now()+60000).toISOString(),client_type:"web",
    device_installation_id:currentInstallationId,account_status:"active",
  },overrides||{});
  const currentDevice=overrides=>Object.assign({
    installation_id:currentInstallationId,slot_id:issuedSlotId,client_type:"web",
    installation_revoked_at:null,slot_type:"computer",slot_status:"active",
  },overrides||{});
  async function exercise(scenario) {
    activeScenario=Object.assign({repository:repository()},scenario);
    const issued=await panelDownload.createDownloadTokenService({
      repository:activeScenario.repository,secret:signingSecret,ttlSeconds:300,
    }).issue({userId,sessionId,deviceSlotId:issuedSlotId,panelVersion:"6.24.0",artifactKey});
    const queryStart=queries.length;
    const materializationStart=materializations.length;
    try {
      const response=await redeemDownload(issued.token);
      return {response,error:null,queries:queries.slice(queryStart),
        materialized:materializations.length-materializationStart};
    } catch (error) {
      return {response:null,error,queries:queries.slice(queryStart),
        materialized:materializations.length-materializationStart};
    }
  }

  const revokedSession=await exercise({name:"revoked-session",live:liveSession({
    revoked_at:new Date().toISOString(),
  }),device:currentDevice()});
  report("redemption rejects a token after its issuing web session is revoked",
    revokedSession.error&&revokedSession.error.code==="session_revoked"&&
      revokedSession.materialized===0&&!revokedSession.queries.some(item=>
        item.sql.includes("from public.device_installations i")),
    {code:revokedSession.error&&revokedSession.error.code,queries:revokedSession.queries});

  const revokedInstallation=await exercise({name:"revoked-installation",live:liveSession(),
    device:currentDevice({installation_revoked_at:new Date().toISOString()})});
  report("redemption rejects the current session's revoked computer installation",
    revokedInstallation.error&&revokedInstallation.error.code==="device_required"&&
      revokedInstallation.materialized===0,
    {code:revokedInstallation.error&&revokedInstallation.error.code,queries:revokedInstallation.queries});

  const wrongInstallation=await exercise({name:"wrong-installation",live:liveSession(),
    device:currentDevice({installation_id:"55555555-5555-4555-8555-555555555555"})});
  const wrongInstallationQuery=wrongInstallation.queries.find(item=>
    item.sql.includes("from public.device_installations i"));
  report("redemption rejects an installation that is not the live session's bound installation",
    wrongInstallation.error&&wrongInstallation.error.code==="device_required"&&
      wrongInstallation.materialized===0&&wrongInstallationQuery&&
      wrongInstallationQuery.params[0]===currentInstallationId&&wrongInstallationQuery.params[2]===issuedSlotId,
    {code:wrongInstallation.error&&wrongInstallation.error.code,bindingQuery:wrongInstallationQuery});

  const wrongSlot=await exercise({name:"wrong-slot",live:liveSession(),
    device:currentDevice({slot_id:"66666666-6666-4666-8666-666666666666"})});
  const wrongSlotQuery=wrongSlot.queries.find(item=>item.sql.includes("from public.device_installations i"));
  report("redemption rejects a current installation outside the token's original computer slot",
    wrongSlot.error&&wrongSlot.error.code==="device_required"&&wrongSlot.materialized===0&&
      wrongSlotQuery&&wrongSlotQuery.params[0]===currentInstallationId&&wrongSlotQuery.params[2]===issuedSlotId,
    {code:wrongSlot.error&&wrongSlot.error.code,bindingQuery:wrongSlotQuery});

  const currentSessionDevice=await exercise({name:"current-session-device",live:liveSession(),
    device:currentDevice()});
  const currentDeviceQuery=currentSessionDevice.queries.find(item=>
    item.sql.includes("from public.device_installations i"));
  if (currentSessionDevice.response&&currentSessionDevice.response.stream&&
      currentSessionDevice.response.stream.lifecycle) {
    await currentSessionDevice.response.stream.lifecycle.finish();
  }
  report("redemption materializes only for the live session's exact active computer installation and issued slot",
    !currentSessionDevice.error&&currentSessionDevice.response&&currentSessionDevice.response.status===200&&
      currentSessionDevice.materialized===1&&currentDeviceQuery&&
      currentDeviceQuery.params[0]===currentInstallationId&&currentDeviceQuery.params[1]===userId&&
      currentDeviceQuery.params[2]===issuedSlotId&&streamSlots.active===0&&materializationSlots.active===0&&
      cleanupCalls.includes("current-session-device"),
    {status:currentSessionDevice.response&&currentSessionDevice.response.status,
      bindingQuery:currentDeviceQuery,materialized:currentSessionDevice.materialized,
      streamSlots:streamSlots.active,materializationSlots:materializationSlots.active,cleanupCalls});
}

async function verifyHttpDownloadLifecycle() {
  const source=fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8");
  const helperStart=source.indexOf("async function streamDownloadResponse");
  const helperEnd=source.indexOf("\n\nconst server =",helperStart);
  let streamDownloadResponse=null,error="";
  if (helperStart>=0&&helperEnd>helperStart) {
    try {
      streamDownloadResponse=Function(source.slice(helperStart,helperEnd)+
        ";return streamDownloadResponse;")();
    } catch (caught) { error=String(caught&&caught.message||caught); }
  }
  report("HTTP download lifecycle helper compiles independently of server/database dependencies",
    typeof streamDownloadResponse==="function",{helperStart,helperEnd,error});
  if (!streamDownloadResponse) return;

  class FakeResponse extends EventEmitter {
    constructor() {
      super();this.destroyed=false;this.writable=true;this.writableFinished=false;
      this.headersSent=false;this.idleTimeouts=[];
    }
    writeHead() { this.headersSent=true; }
    setTimeout(ms,callback) { this.idleTimeouts.push({ms,callback});return this; }
    destroy() {
      if (this.destroyed) return;
      this.destroyed=true;this.writable=false;this.emit("close");
    }
  }
  class FakeFile extends EventEmitter {
    constructor() { super();this.destroyed=false;this.destination=null; }
    pipe(destination) { this.destination=destination;return destination; }
    destroy() { this.destroyed=true; }
  }
  function fixture() {
    const file=new FakeFile();
    const timers=[];
    const calls=[];
    const lifecycle={
      finish:()=>{calls.push({type:"finish"});return Promise.resolve();},
      abort:reason=>{calls.push({type:"abort",reason});return Promise.resolve();},
    };
    const runtime={
      createReadStream:()=>file,
      setTimeout:(callback,ms)=>{
        const timer={callback,ms,cleared:false,unref(){}};timers.push(timer);return timer;
      },
      clearTimeout:timer=>{timer.cleared=true;},
      idleTimeoutMs:30000,maxDurationMs:600000,
      onLifecycleError:()=>{},
    };
    const req={destroyed:false};
    const res=new FakeResponse();
    const stream={
      contentType:"application/octet-stream",size:1024,filename:"HNK_Ai_Panel_v6.24.0.ccx",
      filePath:"/tmp/private-panel.ccx",lifecycle,
    };
    return {file,timers,calls,lifecycle,runtime,req,res,stream};
  }

  const beforeStart=fixture();
  beforeStart.req.destroyed=true;
  const beforeResult=await streamDownloadResponse(
    beforeStart.req,beforeStart.res,200,beforeStart.stream,beforeStart.runtime);
  report("a disconnect before streaming aborts exactly once without opening the artifact",
    beforeResult===false&&beforeStart.calls.length===1&&
      beforeStart.calls[0].type==="abort"&&beforeStart.calls[0].reason==="stream_aborted_before_start"&&
      beforeStart.file.destination===null&&beforeStart.timers.length===0,
    {beforeResult,calls:beforeStart.calls,timers:beforeStart.timers.length});

  const completed=fixture();
  const completedResult=await streamDownloadResponse(
    completed.req,completed.res,200,completed.stream,completed.runtime);
  completed.res.writableFinished=true;
  completed.res.emit("finish");
  completed.res.emit("close");
  await Promise.resolve();
  report("finish/close races record one success and clear both stream timeouts",
    completedResult===true&&completed.calls.length===1&&completed.calls[0].type==="finish"&&
      completed.timers.length===1&&completed.timers[0].cleared===true&&
      completed.res.idleTimeouts.some(item=>item.ms===0)&&!completed.file.destroyed,
    {completedResult,calls:completed.calls,timers:completed.timers,idleTimeouts:completed.res.idleTimeouts});

  const fileFailure=fixture();
  await streamDownloadResponse(fileFailure.req,fileFailure.res,200,fileFailure.stream,fileFailure.runtime);
  fileFailure.file.emit("error",new Error("read failed"));
  fileFailure.res.emit("finish");
  await Promise.resolve();
  report("file-error/response-event races abort once, destroy both sides and clear the timer",
    fileFailure.calls.length===1&&fileFailure.calls[0].type==="abort"&&
      fileFailure.calls[0].reason==="stream_error"&&fileFailure.file.destroyed&&
      fileFailure.res.destroyed&&fileFailure.timers[0].cleared,
    {calls:fileFailure.calls,fileDestroyed:fileFailure.file.destroyed,
      responseDestroyed:fileFailure.res.destroyed,timer:fileFailure.timers[0]});

  const responseFailure=fixture();
  await streamDownloadResponse(responseFailure.req,responseFailure.res,200,responseFailure.stream,responseFailure.runtime);
  responseFailure.res.emit("error",new Error("socket failed"));
  responseFailure.res.emit("close");
  await Promise.resolve();
  report("response errors are handled as a one-shot abort instead of becoming uncaught events",
    responseFailure.calls.length===1&&responseFailure.calls[0].type==="abort"&&
      responseFailure.calls[0].reason==="stream_error"&&responseFailure.file.destroyed&&responseFailure.res.destroyed,
    {calls:responseFailure.calls});

  const idle=fixture();
  await streamDownloadResponse(idle.req,idle.res,200,idle.stream,idle.runtime);
  idle.res.idleTimeouts[0].callback();
  idle.timers[0].callback();
  await Promise.resolve();
  report("idle/maximum-duration timeout races abort once and release stream ownership",
    idle.calls.length===1&&idle.calls[0].type==="abort"&&idle.calls[0].reason==="stream_idle_timeout"&&
      idle.file.destroyed&&idle.res.destroyed&&idle.timers[0].cleared,
    {calls:idle.calls,timer:idle.timers[0]});

  const maximum=fixture();
  await streamDownloadResponse(maximum.req,maximum.res,200,maximum.stream,maximum.runtime);
  maximum.timers[0].callback();
  maximum.res.idleTimeouts[0].callback();
  await Promise.resolve();
  report("maximum stream duration independently aborts a slow but active response",
    maximum.calls.length===1&&maximum.calls[0].type==="abort"&&
      maximum.calls[0].reason==="stream_duration_timeout"&&maximum.file.destroyed&&
      maximum.res.destroyed&&maximum.timers[0].cleared,
    {calls:maximum.calls,timer:maximum.timers[0]});

  const setupFailure=fixture();
  setupFailure.res.writeHead=()=>{throw new Error("headers failed");};
  let setupError="";
  try {
    await streamDownloadResponse(setupFailure.req,setupFailure.res,200,setupFailure.stream,setupFailure.runtime);
  } catch (caught) { setupError=String(caught&&caught.message||caught); }
  report("synchronous stream setup failures abort ownership before propagating an unsent response error",
    setupError==="headers failed"&&setupFailure.calls.length===1&&
      setupFailure.calls[0].type==="abort"&&setupFailure.calls[0].reason==="stream_setup_error"&&
      setupFailure.file.destination===null&&setupFailure.timers.length===0,
    {setupError,calls:setupFailure.calls,timers:setupFailure.timers.length});
}

function verifyRoutes() {
  const source=fs.readFileSync(path.join(ROOT,"server/lib/v1.js"),"utf8");
  const serverSource=fs.readFileSync(path.join(ROOT,"server/index.js"),"utf8");
  for (const route of ["/v1/admin/panel-artifacts/initiate","/v1/admin/panel-artifacts/"]) {
    report("server exposes "+route,source.includes(route));
  }
  report("download materializes DB chunks rather than requiring a committed CCX",
    /materializeArtifact/.test(source)&&/panel_artifact_chunks/.test(fs.readFileSync(path.join(ROOT,"server/lib/panel-artifacts.js"),"utf8")));
  const redeem=(source.match(/async function redeemDownload\(token\)\s*\{([\s\S]*?)\n\}\n\nasync function adminCall/)||[])[1]||"";
  const inspectAt=redeem.indexOf(".inspect({token})");
  const streamAcquireAt=redeem.indexOf("downloadStreamSlots.tryAcquire()");
  const materializationAcquireAt=redeem.indexOf("downloadMaterializationSlots.tryAcquire()");
  const transactionAt=redeem.indexOf("asService(");
  const consumeAt=redeem.indexOf("service.consume({token})");
  const materializationSlotsAt=source.indexOf("const downloadMaterializationSlots=createBoundedSemaphore(");
  const streamSlotsAt=source.indexOf("const downloadStreamSlots=createBoundedSemaphore(");
  const redeemAt=source.indexOf("async function redeemDownload(token)");
  report("separate configurable materialization and stream semaphores live at process module scope",
    materializationSlotsAt>=0&&streamSlotsAt>materializationSlotsAt&&redeemAt>streamSlotsAt&&
      source.indexOf("const downloadMaterializationSlots=",materializationSlotsAt+1)===-1&&
      source.indexOf("const downloadStreamSlots=",streamSlotsAt+1)===-1,
    {materializationSlotsAt,streamSlotsAt,redeemAt});
  report("both busy checks happen before a transaction can consume the one-time token",
    streamAcquireAt>=0&&materializationAcquireAt>streamAcquireAt&&transactionAt>materializationAcquireAt&&
      consumeAt>transactionAt&&
      (redeem.match(/throw new ApiError\(503,[\s\S]{0,180}?"download_busy"\)/g)||[]).length===2,
    {streamAcquireAt,materializationAcquireAt,transactionAt,consumeAt});
  const userLockAt=redeem.indexOf("pg_advisory_xact_lock",transactionAt);
  const userCountAt=redeem.indexOf("result='streaming'",userLockAt);
  report("signed-token inspection precedes scarce slots and one account cannot monopolize active streams",
    inspectAt>=0&&inspectAt<streamAcquireAt&&userLockAt>transactionAt&&
      userCountAt>userLockAt&&consumeAt>userCountAt&&
      /DOWNLOAD_USER_STREAM_LIMIT/.test(source)&&/download_user_busy/.test(redeem),
    {inspectAt,streamAcquireAt,userLockAt,userCountAt,consumeAt});
  const materializeAt=redeem.indexOf("preparedArtifact=await materializeArtifact(client,stored)");
  const releaseMaterializationAt=redeem.indexOf("releaseMaterializationSlot();",materializeAt);
  const lifecycleAt=redeem.indexOf("createDownloadStreamLifecycle",materializeAt);
  report("materialization releases immediately after preparation, before streaming begins",
    materializeAt>=0&&releaseMaterializationAt>materializeAt&&lifecycleAt>releaseMaterializationAt,
    {materializeAt,releaseMaterializationAt,lifecycleAt});
  report("successful streams own only the stream slot until cleanup and errors release both resources",
    /releaseSlotAfterCleanup\(artifact\.cleanup,releaseStreamSlot\)/.test(redeem)&&
      /finally\s*\{[\s\S]*?if \(releaseMaterializationSlot\) releaseMaterializationSlot\(\);[\s\S]*?releaseStreamSlot\(\)/.test(redeem)&&
      /catch\s*\(error\)[\s\S]*?throw error/.test(redeem),
    {hasLifecycleRelease:/releaseSlotAfterCleanup/.test(redeem),
      hasMaterializationRelease:releaseMaterializationAt>=0,hasErrorRelease:/releaseStreamSlot\(\)/.test(redeem)});
  report("HTTP streams bound idle and total duration and clean up a pre-start disconnect",
    /CCX_DOWNLOAD_IDLE_TIMEOUT_MS/.test(serverSource)&&
      /CCX_DOWNLOAD_MAX_DURATION_MS/.test(serverSource)&&
      /stream_idle_timeout/.test(serverSource)&&/stream_duration_timeout/.test(serverSource)&&
      /stream_aborted_before_start/.test(serverSource)&&/file\.destroy\(\)/.test(serverSource));
}

(async()=>{
  const concurrencyOnly=process.argv.includes("--download-concurrency-only");
  if (!concurrencyOnly) {
    verifySchema();
    await verifyModule();
    await verifyDownloadDeviceBinding();
    await verifyDownloadRedemptionBinding();
  }
  await verifyDownloadConcurrency();
  await verifyHttpDownloadLifecycle();
  verifyRoutes();
  if (failures) { console.error("\nFAIL (unified artifacts): "+failures+" check(s)");process.exit(1); }
  console.log("\nPASS (unified artifacts)");
})().catch(error=>{console.error("FAIL — unified artifact test crashed",error);process.exit(1);});
