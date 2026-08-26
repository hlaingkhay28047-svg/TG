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
  }
  await verifyDownloadConcurrency();
  await verifyHttpDownloadLifecycle();
  verifyRoutes();
  if (failures) { console.error("\nFAIL (unified artifacts): "+failures+" check(s)");process.exit(1); }
  console.log("\nPASS (unified artifacts)");
})().catch(error=>{console.error("FAIL — unified artifact test crashed",error);process.exit(1);});
