"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { asService } = require("./db");
const auth = require("./auth");
const { ApiError } = require("./api-error");
const {
  requireSecret,hashInstallationId,deviceRegistry,loadEntitlementState,
  authorizeState,publicEntitlement,listDeviceSlots,
} = require("./entitlements");
const { createDownloadTokenService,createDownloadStreamLifecycle,createPgDownloadRepository } = require("./panel-download");
const { createPanelLeaseService } = require("./panel-lease");
const { readyArtifactForRelease,materializeArtifact } = require("./panel-artifacts");
const admin = require("./admin-api");

/* DB-backed artifacts are materialized into a temporary file before streaming.
   A 90+ MiB panel can therefore consume roughly that much disk and database
   bandwidth per request. Keep preparation narrow, but allow several active
   streams so one slow reader cannot monopolize delivery. These limits are per
   process; App Platform may run more than one process. */
const MATERIALIZATION_CONCURRENCY_DEFAULT=1;
const MATERIALIZATION_CONCURRENCY_HARD_MAX=2;
const STREAM_CONCURRENCY_DEFAULT=4;
const STREAM_CONCURRENCY_HARD_MAX=8;
const USER_STREAM_CONCURRENCY_DEFAULT=1;
const USER_STREAM_CONCURRENCY_HARD_MAX=2;
const DOWNLOAD_USER_STREAM_LIMIT=resolveBoundedConcurrency(
  process.env.CCX_DOWNLOAD_USER_STREAM_CONCURRENCY,
  USER_STREAM_CONCURRENCY_DEFAULT,USER_STREAM_CONCURRENCY_HARD_MAX);
const DOWNLOAD_STREAM_STALE_SECONDS=Math.min(7200,Math.max(2100,
  Number(process.env.CCX_DOWNLOAD_STREAM_STALE_SECONDS)||2100));
function resolveBoundedConcurrency(value,defaultLimit,hardMax) {
  const parsed=Number(value);
  if (!Number.isSafeInteger(parsed)||parsed<1) return defaultLimit;
  return Math.min(parsed,hardMax);
}

function createBoundedSemaphore(value,defaultLimit,hardMax) {
  const limit=resolveBoundedConcurrency(value,defaultLimit,hardMax);
  let active=0;
  return Object.freeze({
    limit,
    get active() { return active; },
    tryAcquire() {
      if (active>=limit) return null;
      active++;
      let released=false;
      return function release() {
        if (released) return false;
        released=true;
        active--;
        return true;
      };
    },
  });
}

function releaseSlotAfterCleanup(cleanup,releaseSlot) {
  const clean=typeof cleanup==="function"?cleanup:()=>{};
  let pending=null;
  return function cleanupAndRelease() {
    if (!pending) pending=Promise.resolve().then(()=>clean()).finally(()=>releaseSlot());
    return pending;
  };
}

const downloadMaterializationSlots=createBoundedSemaphore(
  process.env.CCX_DOWNLOAD_MATERIALIZATION_CONCURRENCY,
  MATERIALIZATION_CONCURRENCY_DEFAULT,MATERIALIZATION_CONCURRENCY_HARD_MAX);
const downloadStreamSlots=createBoundedSemaphore(
  process.env.CCX_DOWNLOAD_STREAM_CONCURRENCY,
  STREAM_CONCURRENCY_DEFAULT,STREAM_CONCURRENCY_HARD_MAX);

function requireIdentity(identity) {
  if (!identity || !identity.valid) throw new ApiError(401,"Not authenticated","unauthorized");
  return identity;
}

function deniedStatus(reason) {
  if (reason === "update_required") return 426;
  if (reason === "device_mismatch" || reason === "device_required") return 409;
  return 403;
}

function rejectDecision(decision) {
  if (!decision || decision.allowed !== true) {
    throw new ApiError(deniedStatus(decision && decision.reason),
      decision && decision.reason === "update_required" ? "Update Required" : "Access denied",
      decision && decision.reason || "forbidden");
  }
}

async function sessionInstallationHash(client, identity) {
  if (!identity.deviceInstallationId) return null;
  const { rows } = await client.query(
    "select installation_hash,client_type from public.device_installations where id=$1 and revoked_at is null",
    [identity.deviceInstallationId]);
  return rows[0] || null;
}

async function sessionComputerDevice(client,identity,expectedSlotId) {
  const requireExpectedSlot=arguments.length>=3;
  if (!identity||identity.clientType!=="web"||!identity.uid||!identity.deviceInstallationId||
      (requireExpectedSlot&&!expectedSlotId)) return null;
  const params=[identity.deviceInstallationId,identity.uid];
  const slotMatch=requireExpectedSlot?" and i.slot_id=$3":"";
  if (requireExpectedSlot) params.push(expectedSlotId);
  const {rows}=await client.query(
    `select i.id as installation_id,i.slot_id,i.client_type,
            i.revoked_at as installation_revoked_at,s.slot_type,s.status as slot_status
       from public.device_installations i
       join public.device_slots s on s.id=i.slot_id
      where i.id=$1 and s.user_id=$2 and i.client_type='web'
        and i.revoked_at is null and s.slot_type='computer' and s.status='active'${slotMatch}`,
    params);
  const row=rows[0];
  if (!row||String(row.installation_id)!==String(identity.deviceInstallationId)||
      row.client_type!=="web"||row.installation_revoked_at||row.slot_type!=="computer"||
      row.slot_status!=="active"||(requireExpectedSlot&&String(row.slot_id)!==String(expectedSlotId))) return null;
  return {registered:true,matches:true,slotType:"computer",slotId:row.slot_id,
    installationId:row.installation_id};
}

async function meEntitlement(identity, params) {
  return asService(async client => {
    let clientType = identity.clientType === "panel" ? "panel" : "web";
    let installationHash = null;
    const supplied = params.get("installation_id");
    const bound = await sessionInstallationHash(client,identity);
    if (bound) { installationHash=bound.installation_hash;clientType=bound.client_type; }
    else if (supplied) installationHash = hashInstallationId(supplied);
    const panelVersion = params.get("panel_version") || "";
    const state = await loadEntitlementState(client,identity.uid,{installationHash,clientType,panelVersion});
    const downloadDevice=await sessionComputerDevice(client,identity);
    const slots = await listDeviceSlots(client,identity.uid);
    const decisions = {
      web:authorizeState(state,"web",state.device),
      download:authorizeState(state,"download",downloadDevice),
      panel:authorizeState(state,"panel",clientType==="panel" ? state.device : null),
    };
    return { status:200,body:publicEntitlement(state,decisions,slots) };
  });
}

async function enrollDevice(identity, body, context) {
  const channel = body.channel === "panel" ? "panel" : "web";
  if (identity.clientType !== channel) {
    throw new ApiError(403,"This session is not valid for the requested client","client_type_mismatch");
  }
  const deviceType = String(body.device_type || "");
  if (!["phone","computer"].includes(deviceType)) throw new ApiError(400,"device_type must be phone or computer","invalid_device_type");
  if (channel === "panel" && deviceType !== "computer") throw new ApiError(400,"Photoshop requires a computer","invalid_device_type");
  const observedType = channel === "panel" ? "computer" : context.observedDeviceType || "computer";
  if (deviceType !== observedType) {
    throw new ApiError(400,"device_type does not match the requesting platform","device_type_mismatch",
      {authoritative_device_type:observedType});
  }
  const installationId = String(body.installation_id || "");
  return asService(async client => {
    const fakeDevice={registered:true,matches:true,slotType:deviceType};
    const state=await loadEntitlementState(client,identity.uid,{
      panelVersion:String(body.panel_version||"6.24.0"),
    });
    rejectDecision(authorizeState(state,channel==="panel"?"panel":"web",fakeDevice));
    const registry=deviceRegistry(client);
    let result;
    if (channel === "panel") {
      const existing=await registry.validate({userId:identity.uid,clientType:"panel",installationId});
      if (existing.allowed) result=existing;
      else if (body.pairing_code) result=await registry.pairPanel({
        userId:identity.uid,pairingCode:String(body.pairing_code),panelInstallationId:installationId,
        label:String(body.label||"Photoshop").slice(0,200),
      });
      else throw new ApiError(409,"A pairing code from the registered computer is required","pairing_required");
    } else {
      result=await registry.registerWebDevice({
        userId:identity.uid,deviceType,installationId,label:String(body.label||"").slice(0,200)||null,
      });
    }
    if (!result.allowed) throw new ApiError(409,"Device could not be registered",result.reason);
    const hash=hashInstallationId(installationId);
    const installation=await client.query(
      `select i.id,i.slot_id,s.slot_type from public.device_installations i
        join public.device_slots s on s.id=i.slot_id
       where s.user_id=$1 and i.client_type=$2 and i.installation_hash=$3 and i.revoked_at is null`,
      [identity.uid,channel,hash]);
    if (!installation.rows.length) throw new ApiError(409,"Device registration was not persisted","device_registration_failed");
    await client.query("update public.sessions set device_installation_id=$2 where id=$1 and user_id=$3",
      [identity.sessionId,installation.rows[0].id,identity.uid]);
    await client.query(
      `insert into public.device_history
        (user_id,device_slot_id,actor_user_id,event_type,client_type,label,details)
       values ($1,$2,$1,$3,$4,$5,$6::jsonb)`,
      [identity.uid,installation.rows[0].slot_id,channel==="panel"?"paired":"registered",channel,
       String(body.label||"").slice(0,200)||null,JSON.stringify({slot_type:deviceType})]);
    return {status:200,body:{ok:true,device:{slot_id:installation.rows[0].slot_id,
      slot_type:installation.rows[0].slot_type,channel},reason:"allowed"}};
  });
}

async function pairingCode(identity, body) {
  if (identity.clientType !== "web") throw new ApiError(403,"A web session is required","client_type_mismatch");
  return asService(async client => {
    const state=await loadEntitlementState(client,identity.uid,{panelVersion:"6.24.0"});
    rejectDecision(authorizeState(state,"web",{registered:true,matches:true,slotType:"computer"}));
    const result=await deviceRegistry(client).createPanelPairing({
      userId:identity.uid,computerInstallationId:String(body.computer_installation_id||body.installation_id||""),
    });
    if (!result.allowed) throw new ApiError(409,"Registered computer not found",result.reason);
    return {status:200,body:{ok:true,code:result.code,expires_at:result.expiresAt}};
  });
}

async function panelPair(identity, body, context) {
  return enrollDevice(identity,{
    channel:"panel",device_type:"computer",installation_id:body.panel_installation_id||body.installation_id,
    pairing_code:body.code||body.pairing_code,label:body.label,panel_version:body.panel_version||"6.24.0",
  },context);
}

async function panelValidate(identity, body) {
  if (identity.clientType !== "panel") throw new ApiError(403,"A panel session is required","client_type_mismatch");
  const rawInstallation=String(body.installation_id||body.panel_installation_id||"");
  const installedVersion=String(body.panel_version||"");
  return asService(async client => {
    const hash=hashInstallationId(rawInstallation);
    const state=await loadEntitlementState(client,identity.uid,{
      installationHash:hash,clientType:"panel",panelVersion:installedVersion,
    });
    const decision=authorizeState(state,"panel");
    if (!decision.allowed && decision.reason==="update_required") {
      return {status:426,body:{code:"UPDATE_REQUIRED",error:"UPDATE_REQUIRED",message:"Update Required",msg:"Update Required",
        latest_version:state.panelVersion.latestVersion,minimum_supported_version:state.panelVersion.minimumSupportedVersion}};
    }
    rejectDecision(decision);
    const lease=createPanelLeaseService({
      secret:requireSecret("PANEL_LEASE_SECRET",process.env.JWT_SECRET,32),ttlSeconds:180,
    }).issue({
      userId:identity.uid,sessionId:identity.sessionId,installationHash:hash,panelVersion:installedVersion,
    });
    await client.query("update public.device_installations set last_seen_at=now() where id=$1",[state.device.installationId]);
    await client.query("update public.sessions set device_installation_id=$2 where id=$1 and user_id=$3",
      [identity.sessionId,state.device.installationId,identity.uid]);
    const slots=await listDeviceSlots(client,identity.uid);
    const entitlement=publicEntitlement(state,{web:{allowed:true,reason:"allowed"},
      download:authorizeState(state,"download",state.device),panel:decision},slots);
    return {status:200,body:{ok:true,lease_token:lease.token,lease_expires_at:lease.expiresAt,entitlement}};
  });
}

const artifactHashCache=new Map();
function sha256File(filePath,stat) {
  const key=[filePath,stat.size,stat.mtimeMs].join("|");
  if (artifactHashCache.has(key)) return artifactHashCache.get(key);
  const pending=new Promise((resolve,reject)=>{
    const hash=crypto.createHash("sha256");
    const stream=fs.createReadStream(filePath);
    stream.on("data",chunk=>hash.update(chunk));
    stream.on("error",reject);
    stream.on("end",()=>resolve(hash.digest("hex")));
  }).catch(error=>{artifactHashCache.delete(key);throw error;});
  artifactHashCache.clear();
  artifactHashCache.set(key,pending);
  return pending;
}

async function configuredArtifact(artifactKey,sizeBytes,expectedSha256) {
  if (process.env.ALLOW_FILESYSTEM_PANEL_ARTIFACT!=="1") {
    throw new ApiError(503,"Filesystem panel artifacts are disabled; use finalized private storage","artifact_not_ready");
  }
  const safeName=path.basename(String(artifactKey||""));
  if (!safeName||safeName!==artifactKey||!/^HNK_Ai_Panel_v\d+\.\d+\.\d+\.ccx$/.test(safeName)) {
    throw new ApiError(503,"Panel artifact metadata is invalid","artifact_metadata_invalid");
  }
  const configured=process.env.PANEL_ARTIFACT_PATH||path.join(__dirname,"..","private",safeName);
  if (path.basename(configured)!==safeName) throw new ApiError(503,"Panel artifact path does not match the approved release","artifact_path_mismatch");
  let stat;
  try { stat=fs.statSync(configured); }
  catch (_) { throw new ApiError(503,"Panel artifact is unavailable","artifact_unavailable"); }
  if (!stat.isFile()||(sizeBytes&&Number(sizeBytes)!==stat.size)) {
    throw new ApiError(503,"Panel artifact failed release metadata validation","artifact_metadata_mismatch");
  }
  if (!/^[0-9a-f]{64}$/.test(String(expectedSha256||""))) {
    throw new ApiError(503,"Panel artifact has no approved SHA-256","artifact_metadata_invalid");
  }
  let actual;
  try { actual=await sha256File(configured,stat); }
  catch (_) { throw new ApiError(503,"Panel artifact could not be verified","artifact_unavailable"); }
  const expectedBytes=Buffer.from(String(expectedSha256),"hex");
  const actualBytes=Buffer.from(actual,"hex");
  if (expectedBytes.length!==actualBytes.length||!crypto.timingSafeEqual(expectedBytes,actualBytes)) {
    throw new ApiError(503,"Panel artifact failed SHA-256 validation","artifact_integrity_mismatch");
  }
  return {filePath:configured,filename:safeName,size:stat.size};
}

async function issueDownload(identity, body, context) {
  if (identity.clientType !== "web") throw new ApiError(403,"A web session is required","client_type_mismatch");
  return asService(async client => {
    const version=String(body.version||body.panel_version||"6.24.0");
    const state=await loadEntitlementState(client,identity.uid,{panelVersion:version});
    const device=await sessionComputerDevice(client,identity);
    rejectDecision(authorizeState(state,"download",device));
    const release=await client.query(
      "select version,artifact_key,sha256,size_bytes,artifact_id from public.panel_versions where version=$1 and enabled=true",[version]);
    if (!release.rows.length) throw new ApiError(404,"Panel version not found","version_not_found");
    const artifact=await readyArtifactForRelease(client,release.rows[0]);
    if (!artifact) throw new ApiError(503,"Verified private panel artifact is unavailable","artifact_not_ready");
    const service=createDownloadTokenService({
      repository:createPgDownloadRepository(client),
      secret:requireSecret("CCX_DOWNLOAD_SECRET",process.env.JWT_SECRET,32),ttlSeconds:300,
    });
    const issued=await service.issue({
      userId:identity.uid,sessionId:identity.sessionId,deviceSlotId:device.slotId,
      panelVersion:version,artifactKey:artifact.artifactKey,ipHash:context.ipHash,userAgent:context.userAgent,
    });
    return {status:200,body:{ok:true,download_url:"/api/v1/downloads/panel/"+encodeURIComponent(issued.token),
      expires_at:issued.expiresAt,token_id:issued.tokenId,version}};
  });
}

async function redeemDownload(token) {
  /* Acquire both bounded resources before consuming the one-time token. A busy
     response is retryable with the same token instead of burning it. Stream
     capacity is wider so one slow reader cannot monopolize materialization. */
  const signingSecret=requireSecret("CCX_DOWNLOAD_SECRET",process.env.JWT_SECRET,32);
  const inspected=createDownloadTokenService({repository:null,secret:signingSecret,ttlSeconds:300}).inspect({token});
  if (!inspected.allowed) {
    const status=inspected.reason==="download_token_expired"?410:403;
    throw new ApiError(status,"Download token is not valid",inspected.reason);
  }
  const releaseStreamSlot=downloadStreamSlots.tryAcquire();
  if (!releaseStreamSlot) throw new ApiError(503,"Panel download service is busy; retry shortly","download_busy");
  let releaseMaterializationSlot=downloadMaterializationSlots.tryAcquire();
  if (!releaseMaterializationSlot) {
    releaseStreamSlot();
    throw new ApiError(503,"Panel download preparation is busy; retry shortly","download_busy");
  }
  let preparedArtifact=null;
  try {
    const response=await asService(async client => {
      const service=createDownloadTokenService({
        repository:createPgDownloadRepository(client),
        secret:signingSecret,ttlSeconds:300,
      });
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",
        ["panel-download:"+inspected.userId]);
      const activeStreams=await client.query(
        `select count(*)::int as n from public.download_history
          where user_id=$1 and result='streaming'
            and downloaded_at>now()-($2||' seconds')::interval`,
        [inspected.userId,String(DOWNLOAD_STREAM_STALE_SECONDS)]);
      if (Number(activeStreams.rows[0]&&activeStreams.rows[0].n||0)>=DOWNLOAD_USER_STREAM_LIMIT) {
        throw new ApiError(429,"This account already has an active panel download","download_user_busy");
      }
      const consumed=await service.consume({token});
      if (!consumed.allowed) {
        const status=consumed.reason==="download_token_expired"?410:consumed.reason==="download_token_replayed"?409:403;
        throw new ApiError(status,"Download token is not valid",consumed.reason);
      }
      const live=await client.query(
        `select s.revoked_at,s.expires_at,s.client_type,s.device_installation_id,p.account_status
           from public.sessions s join public.profiles p on p.id=s.user_id
          where s.id=$1 and s.user_id=$2`,[consumed.sessionId,consumed.userId]);
      if (!live.rows.length||live.rows[0].revoked_at||new Date(live.rows[0].expires_at).getTime()<=Date.now()||
          live.rows[0].account_status!=="active") {
        throw new ApiError(403,"Account session is no longer active","session_revoked");
      }
      const state=await loadEntitlementState(client,consumed.userId,{panelVersion:consumed.panelVersion});
      const device=await sessionComputerDevice(client,{
        uid:consumed.userId,clientType:live.rows[0].client_type,
        deviceInstallationId:live.rows[0].device_installation_id,
      },consumed.deviceSlotId);
      rejectDecision(authorizeState(state,"download",device));
      const release=await client.query(
        "select version,artifact_key,size_bytes,sha256,artifact_id from public.panel_versions where version=$1 and enabled=true",[consumed.panelVersion]);
      if (!release.rows.length||release.rows[0].artifact_key!==consumed.artifactKey) {
        throw new ApiError(403,"Panel release is no longer available","release_disabled");
      }
      const stored=await readyArtifactForRelease(client,release.rows[0]);
      if (!stored) throw new ApiError(503,"Verified private panel artifact is unavailable","artifact_not_ready");
      try {
        preparedArtifact=await materializeArtifact(client,stored);
      } finally {
        releaseMaterializationSlot();
        releaseMaterializationSlot=null;
      }
      const artifact=preparedArtifact;
      const lifecycle=createDownloadStreamLifecycle({
        complete:(result,reason)=>asService(async completionClient=>{
          await createPgDownloadRepository(completionClient).completeStream(consumed.id,result,reason);
        }),
        cleanup:releaseSlotAfterCleanup(artifact.cleanup,releaseStreamSlot),
      });
      return {status:200,stream:Object.assign({contentType:"application/octet-stream",lifecycle},artifact)};
    });
    /* From here, finish/abort owns artifact cleanup and the slot release. */
    preparedArtifact=null;
    return response;
  } catch (error) {
    try {
      if (preparedArtifact&&typeof preparedArtifact.cleanup==="function") await preparedArtifact.cleanup();
    } catch (_) {
      /* Preserve the authorization/materialization error; cleanup is best-effort. */
    } finally {
      if (releaseMaterializationSlot) releaseMaterializationSlot();
      releaseStreamSlot();
    }
    throw error;
  }
}

async function adminCall(identity,context,fn) {
  return asService(client=>fn(client,identity,context));
}

async function handle(input) {
  const pathname=input.pathname;
  const method=input.method;
  const body=input.body||{};
  const identity=input.identity;
  const context=input.context||{};

  const downloadMatch=/^\/v1\/downloads\/panel\/([^/]+)$/.exec(pathname);
  if (downloadMatch&&method==="GET") return redeemDownload(downloadMatch[1]);

  requireIdentity(identity);
  if (pathname==="/v1/me/entitlement"&&method==="GET") return meEntitlement(identity,input.params);
  if (pathname==="/v1/devices/enroll"&&method==="POST") return enrollDevice(identity,body,context);
  if (pathname==="/v1/devices/pairing-code"&&method==="POST") return pairingCode(identity,body);
  if (pathname==="/v1/panel/pair"&&method==="POST") return panelPair(identity,body,context);
  if (pathname==="/v1/panel/validate"&&method==="POST") return panelValidate(identity,body);
  if (pathname==="/v1/downloads/panel"&&method==="POST") return issueDownload(identity,body,context);

  if (pathname==="/v1/admin/dashboard"&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,(client,id)=>admin.dashboard(client,id))};
  }
  if (pathname==="/v1/admin/students"&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,(client,id)=>admin.students(client,id,input.params))};
  }
  if (pathname==="/v1/admin/payment-requests"&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,
      (client,id)=>admin.listPaymentRequests(client,id,input.params))};
  }
  if (pathname==="/v1/admin/payment-grants"&&method==="POST") {
    return {status:201,body:await adminCall(identity,context,
      (client,id,ctx)=>admin.grantPayment(client,id,body,ctx))};
  }
  const paymentMatch=/^\/v1\/admin\/payment-requests\/([0-9a-f-]+)\/(review|proof)$/.exec(pathname);
  if (paymentMatch&&paymentMatch[2]==="review"&&method==="POST") {
    return {status:200,body:await adminCall(identity,context,
      (client,id,ctx)=>admin.reviewPayment(client,id,paymentMatch[1],body,ctx))};
  }
  if (paymentMatch&&paymentMatch[2]==="proof"&&method==="GET") {
    const proof=await adminCall(identity,context,
      (client,id,ctx)=>admin.paymentProof(client,id,paymentMatch[1],ctx));
    return {status:200,raw:proof.raw,contentType:proof.contentType};
  }
  const studentMatch=/^\/v1\/admin\/students\/([0-9a-f-]+)(\/actions)?$/.exec(pathname);
  if (studentMatch&&method==="GET"&&!studentMatch[2]) {
    return {status:200,body:await adminCall(identity,context,(client,id)=>admin.studentDetail(client,id,studentMatch[1]))};
  }
  if (studentMatch&&method==="POST"&&studentMatch[2]) {
    const result=await adminCall(identity,context,(client,id,ctx)=>admin.studentAction(client,id,studentMatch[1],body,ctx));
    if (result.passwordReset&&result.passwordResetEmail) {
      await auth.recover({email:result.passwordResetEmail},context);
    }
    delete result.passwordResetEmail;
    delete result.passwordReset;
    return {status:result.action==="password_reset"?202:200,body:result};
  }
  if (pathname==="/v1/admin/histories"&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,(client,id)=>admin.histories(client,id,input.params))};
  }
  if (pathname==="/v1/admin/panel-version"&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,(client,id)=>admin.getPanelVersion(client,id))};
  }
  if (pathname==="/v1/admin/panel-version"&&method==="PUT") {
    return {status:200,body:await adminCall(identity,context,(client,id,ctx)=>admin.putPanelVersion(client,id,body,ctx))};
  }
  if (pathname==="/v1/admin/panel-artifacts/initiate"&&method==="POST") {
    return {status:201,body:await adminCall(identity,context,
      (client,id,ctx)=>admin.initiatePanelArtifact(client,id,body,ctx))};
  }
  const artifactMatch=/^\/v1\/admin\/panel-artifacts\/([0-9a-f-]+)$/.exec(pathname);
  if (artifactMatch&&method==="GET") {
    return {status:200,body:await adminCall(identity,context,
      (client,id)=>admin.panelArtifactStatus(client,id,artifactMatch[1]))};
  }
  const chunkMatch=/^\/v1\/admin\/panel-artifacts\/([0-9a-f-]+)\/chunks\/(\d+)$/.exec(pathname);
  if (chunkMatch&&method==="PUT") {
    return {status:200,body:await adminCall(identity,context,
      (client,id,ctx)=>admin.putPanelArtifactChunk(client,id,chunkMatch[1],chunkMatch[2],body,ctx))};
  }
  const finalizeMatch=/^\/v1\/admin\/panel-artifacts\/([0-9a-f-]+)\/finalize$/.exec(pathname);
  if (finalizeMatch&&method==="POST") {
    return {status:200,body:await adminCall(identity,context,
      (client,id,ctx)=>admin.finalizePanelArtifact(client,id,finalizeMatch[1],ctx))};
  }
  if (pathname==="/v1/admin/mfa/setup"&&method==="POST") {
    return {status:200,body:await adminCall(identity,context,(client,id,ctx)=>admin.mfaSetup(client,id,ctx))};
  }
  if (pathname==="/v1/admin/mfa/verify"&&method==="POST") {
    const result=await adminCall(identity,context,(client,id,ctx)=>admin.mfaVerify(client,id,body,ctx));
    if (result&&result.error) {
      throw new ApiError(result.error.status,result.error.message,result.error.code);
    }
    return {status:200,body:result};
  }
  throw new ApiError(404,"Not found","not_found");
}

module.exports={ handle,configuredArtifact };
