"use strict";

const crypto=require("crypto");
const fs=require("fs");
const os=require("os");
const path=require("path");
const { ApiError }=require("./api-error");

const MAX_CHUNK_BYTES=4*1024*1024;
const MIN_CHUNK_BYTES=64*1024;
const MAX_ARTIFACT_BYTES=512*1024*1024;
const VERSION_RE=/^\d+\.\d+\.\d+$/;
const SHA_RE=/^[0-9a-f]{64}$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function safeEqualHex(left,right) {
  if (!SHA_RE.test(String(left||""))||!SHA_RE.test(String(right||""))) return false;
  const a=Buffer.from(left,"hex"),b=Buffer.from(right,"hex");
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function validateArtifactSpec(body) {
  const input=body||{};
  const version=String(input.version||input.panel_version||"");
  if (!VERSION_RE.test(version)) throw new ApiError(400,"Invalid artifact version","invalid_version");
  const artifactKey=String(input.artifact_key||`HNK_Ai_Panel_v${version}.ccx`);
  if (path.basename(artifactKey)!==artifactKey||artifactKey!==`HNK_Ai_Panel_v${version}.ccx`) {
    throw new ApiError(400,"Invalid artifact name","invalid_artifact");
  }
  const expectedSha256=String(input.sha256||input.expected_sha256||"").toLowerCase();
  if (!SHA_RE.test(expectedSha256)) throw new ApiError(400,"Invalid artifact SHA-256","invalid_sha256");
  const expectedSizeBytes=Number(input.size_bytes||input.expected_size_bytes);
  if (!Number.isSafeInteger(expectedSizeBytes)||expectedSizeBytes<=0||expectedSizeBytes>MAX_ARTIFACT_BYTES) {
    throw new ApiError(400,"Invalid artifact size","invalid_artifact_size");
  }
  const chunkSize=Number(input.chunk_size||input.chunk_size_bytes||MAX_CHUNK_BYTES);
  if (!Number.isSafeInteger(chunkSize)||chunkSize<MIN_CHUNK_BYTES||chunkSize>MAX_CHUNK_BYTES) {
    throw new ApiError(400,"Invalid artifact chunk size","invalid_chunk_size");
  }
  const chunkCount=Math.ceil(expectedSizeBytes/chunkSize);
  if (chunkCount<=0||chunkCount>8192) throw new ApiError(400,"Artifact has too many chunks","invalid_chunk_count");
  return {version,artifactKey,expectedSha256,expectedSizeBytes,chunkSize,chunkCount};
}

function strictBase64(value) {
  const text=String(value||"");
  if (!text||text.length>Math.ceil(MAX_CHUNK_BYTES/3)*4+4||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
    throw new ApiError(400,"Chunk data must be canonical base64","invalid_chunk_data");
  }
  const data=Buffer.from(text,"base64");
  if (data.toString("base64")!==text) throw new ApiError(400,"Chunk data must be canonical base64","invalid_chunk_data");
  return data;
}

function decodeArtifactChunk(body,maxBytes,expectedBytes) {
  const input=body||{};
  const data=strictBase64(input.data_base64);
  const ceiling=Math.min(MAX_CHUNK_BYTES,Number(maxBytes)||MAX_CHUNK_BYTES);
  if (!data.length||data.length>ceiling) throw new ApiError(400,"Artifact chunk is too large","invalid_chunk_size");
  if (expectedBytes!==undefined&&data.length!==Number(expectedBytes)) {
    throw new ApiError(400,"Artifact chunk has the wrong size","chunk_size_mismatch");
  }
  const expected=String(input.sha256||"").toLowerCase();
  if (!SHA_RE.test(expected)) throw new ApiError(400,"Chunk SHA-256 is required","invalid_chunk_sha256");
  const actual=sha256(data);
  if (!safeEqualHex(expected,actual)) throw new ApiError(400,"Artifact chunk SHA-256 mismatch","chunk_sha256_mismatch");
  return {data,sha256:actual,sizeBytes:data.length};
}

function mapArtifact(row) {
  if (!row) return null;
  return {
    id:row.id,version:row.version,artifactKey:row.artifact_key,
    expectedSha256:row.expected_sha256,expectedSizeBytes:Number(row.expected_size_bytes),
    chunkSize:Number(row.chunk_size_bytes),chunkCount:Number(row.chunk_count),
    status:row.status,uploadedSizeBytes:Number(row.uploaded_size_bytes||0),
    objectKey:row.object_key||null,
    createdAt:row.created_at,updatedAt:row.updated_at,finalizedAt:row.finalized_at,
  };
}

function mapChunk(row) {
  if (!row) return null;
  return {
    index:Number(row.chunk_index),data:row.data,sizeBytes:Number(row.size_bytes),sha256:row.sha256,
  };
}

async function verifyChunkSequence(spec,getChunk,onChunk) {
  const hash=crypto.createHash("sha256");
  let sizeBytes=0;
  for (let index=0;index<spec.chunkCount;index++) {
    const row=await getChunk(index);
    if (!row||!Buffer.isBuffer(row.data)) throw new ApiError(409,"Artifact upload is incomplete","artifact_incomplete");
    const expectedSize=index===spec.chunkCount-1
      ? spec.expectedSizeBytes-spec.chunkSize*(spec.chunkCount-1) : spec.chunkSize;
    if (row.data.length!==expectedSize||Number(row.sizeBytes||row.size_bytes)!==expectedSize) {
      throw new ApiError(409,"Artifact chunk size does not match upload geometry","chunk_size_mismatch");
    }
    const actualChunk=sha256(row.data);
    if (!safeEqualHex(actualChunk,row.sha256)) {
      throw new ApiError(409,"Stored artifact chunk failed integrity verification","chunk_sha256_mismatch");
    }
    hash.update(row.data);sizeBytes+=row.data.length;
    if (onChunk) await onChunk(row.data,index);
  }
  const totalSha256=hash.digest("hex");
  if (sizeBytes!==spec.expectedSizeBytes) throw new ApiError(409,"Artifact size verification failed","artifact_size_mismatch");
  if (!safeEqualHex(totalSha256,spec.expectedSha256)) {
    throw new ApiError(409,"Artifact SHA-256 verification failed","artifact_sha256_mismatch");
  }
  return {sha256:totalSha256,sizeBytes,chunkCount:spec.chunkCount};
}

async function initiateUpload(client,userId,body) {
  const spec=validateArtifactSpec(body);
  const current=await client.query("select * from public.panel_artifacts where version=$1 for update",[spec.version]);
  const row=current.rows[0];
  if (row&&row.status==="ready") {
    const same=row.artifact_key===spec.artifactKey&&row.expected_sha256===spec.expectedSha256&&
      Number(row.expected_size_bytes)===spec.expectedSizeBytes;
    if (!same) throw new ApiError(409,"A finalized artifact already exists for this version","artifact_already_ready");
    return Object.assign(mapArtifact(row),{alreadyReady:true});
  }
  if (row) {
    const same=row.artifact_key===spec.artifactKey&&row.expected_sha256===spec.expectedSha256&&
      Number(row.expected_size_bytes)===spec.expectedSizeBytes&&Number(row.chunk_size_bytes)===spec.chunkSize;
    if (!same) {
      await client.query("delete from public.panel_artifact_chunks where artifact_id=$1",[row.id]);
      const updated=await client.query(
        `update public.panel_artifacts set artifact_key=$2,expected_sha256=$3,expected_size_bytes=$4,
           chunk_size_bytes=$5,chunk_count=$6,status='uploading',uploaded_size_bytes=0,
           updated_at=now(),finalized_at=null,created_by=$7 where id=$1 returning *`,
        [row.id,spec.artifactKey,spec.expectedSha256,spec.expectedSizeBytes,spec.chunkSize,spec.chunkCount,userId]);
      return mapArtifact(updated.rows[0]);
    }
    return mapArtifact(row);
  }
  const inserted=await client.query(
    `insert into public.panel_artifacts
      (version,artifact_key,expected_sha256,expected_size_bytes,chunk_size_bytes,chunk_count,created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [spec.version,spec.artifactKey,spec.expectedSha256,spec.expectedSizeBytes,spec.chunkSize,spec.chunkCount,userId]);
  return mapArtifact(inserted.rows[0]);
}

async function uploadChunk(client,artifactId,indexValue,body) {
  if (!UUID_RE.test(String(artifactId||""))) throw new ApiError(400,"Invalid artifact id","invalid_artifact_id");
  const index=Number(indexValue);
  const locked=await client.query("select * from public.panel_artifacts where id=$1 for update",[artifactId]);
  if (!locked.rows.length) throw new ApiError(404,"Artifact upload not found","artifact_not_found");
  const artifact=mapArtifact(locked.rows[0]);
  if (artifact.status!=="uploading") throw new ApiError(409,"Artifact upload is not open","artifact_not_uploading");
  if (!Number.isInteger(index)||index<0||index>=artifact.chunkCount) {
    throw new ApiError(400,"Invalid artifact chunk index","invalid_chunk_index");
  }
  const expectedBytes=index===artifact.chunkCount-1
    ? artifact.expectedSizeBytes-artifact.chunkSize*(artifact.chunkCount-1) : artifact.chunkSize;
  const decoded=decodeArtifactChunk(body,artifact.chunkSize,expectedBytes);
  await client.query(
    `insert into public.panel_artifact_chunks (artifact_id,chunk_index,data,size_bytes,sha256)
     values ($1,$2,$3,$4,$5) on conflict (artifact_id,chunk_index) do update
       set data=excluded.data,size_bytes=excluded.size_bytes,sha256=excluded.sha256,updated_at=now()`,
    [artifactId,index,decoded.data,decoded.sizeBytes,decoded.sha256]);
  const progress=await client.query(
    "select count(*)::int as chunks,coalesce(sum(size_bytes),0)::bigint as bytes from public.panel_artifact_chunks where artifact_id=$1",
    [artifactId]);
  await client.query("update public.panel_artifacts set uploaded_size_bytes=$2,updated_at=now() where id=$1",
    [artifactId,progress.rows[0].bytes]);
  return {artifactId,index,sha256:decoded.sha256,sizeBytes:decoded.sizeBytes,
    uploadedChunks:Number(progress.rows[0].chunks),uploadedSizeBytes:Number(progress.rows[0].bytes),
    chunkCount:artifact.chunkCount,expectedSizeBytes:artifact.expectedSizeBytes};
}

async function finalizeUpload(client,artifactId) {
  if (!UUID_RE.test(String(artifactId||""))) throw new ApiError(400,"Invalid artifact id","invalid_artifact_id");
  const locked=await client.query("select * from public.panel_artifacts where id=$1 for update",[artifactId]);
  if (!locked.rows.length) throw new ApiError(404,"Artifact upload not found","artifact_not_found");
  const artifact=mapArtifact(locked.rows[0]);
  if (artifact.status==="ready") return Object.assign(artifact,{alreadyReady:true});
  if (artifact.status!=="uploading") throw new ApiError(409,"Artifact upload is not open","artifact_not_uploading");
  const summary=await verifyChunkSequence(artifact,async index=>{
    const result=await client.query(
      "select chunk_index,data,size_bytes,sha256 from public.panel_artifact_chunks where artifact_id=$1 and chunk_index=$2",
      [artifactId,index]);
    return mapChunk(result.rows[0]);
  });
  const ready=await client.query(
    `update public.panel_artifacts set status='ready',uploaded_size_bytes=$2,
       finalized_at=now(),updated_at=now() where id=$1 and status='uploading' returning *`,
    [artifactId,summary.sizeBytes]);
  if (!ready.rows.length) throw new ApiError(409,"Artifact finalization lost its lock","artifact_finalize_conflict");
  return Object.assign(mapArtifact(ready.rows[0]),summary);
}

async function readyArtifactForRelease(client,release) {
  const result=await client.query(
    `select a.* from public.panel_artifacts a
      where a.id=$1 and a.version=$2 and a.artifact_key=$3 and a.expected_sha256=$4
        and a.expected_size_bytes=$5 and a.status='ready'`,
    [release.artifact_id,release.version,release.artifact_key,release.sha256,release.size_bytes]);
  return mapArtifact(result.rows[0]);
}

/* The production target is the private Space; the database chunks remain the
   delivery bridge and the fallback. Either source must prove the exact
   expected digest and size before a byte reaches a student — a Space object
   is fetched whole (its size is known and bounded) and hash-verified, and
   any Space failure falls back to the chunk path rather than surfacing. */
async function materializeFromSpace(artifact,directory,partial,destination) {
  const spaces=require("./spaces");
  if (!artifact.objectKey||!spaces.spacesConfigured()) return null;
  let data;
  try {
    data=await spaces.getObject(artifact.objectKey,{maxBytes:artifact.expectedSizeBytes});
  } catch (error) {
    console.warn("panel artifact object fetch failed; using the database bridge: "+error.message);
    return null;
  }
  if (data.length!==artifact.expectedSizeBytes||!safeEqualHex(sha256(data),artifact.expectedSha256)) {
    console.warn("panel artifact object failed SHA-256/size verification; using the database bridge");
    return null;
  }
  await fs.promises.writeFile(partial,data,{mode:0o600});
  await fs.promises.rename(partial,destination);
  return {filePath:destination,filename:artifact.artifactKey,size:artifact.expectedSizeBytes,
    cleanup:()=>fs.promises.rm(directory,{recursive:true,force:true})};
}

async function materializeArtifact(client,artifact) {
  if (!artifact||artifact.status!=="ready") throw new ApiError(503,"Private panel artifact is not ready","artifact_not_ready");
  const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),"hnk-panel-"));
  const partial=path.join(directory,"artifact.partial");
  const destination=path.join(directory,artifact.artifactKey);
  let handle=null;
  try {
    const fromSpace=await materializeFromSpace(artifact,directory,partial,destination);
    if (fromSpace) return fromSpace;
    handle=await fs.promises.open(partial,"wx",0o600);
    let position=0;
    await verifyChunkSequence(artifact,async index=>{
      const result=await client.query(
        "select chunk_index,data,size_bytes,sha256 from public.panel_artifact_chunks where artifact_id=$1 and chunk_index=$2",
        [artifact.id,index]);
      return mapChunk(result.rows[0]);
    },async data=>{
      await handle.write(data,0,data.length,position);position+=data.length;
    });
    await handle.sync();await handle.close();handle=null;
    await fs.promises.rename(partial,destination);
    await fs.promises.chmod(destination,0o600);
    return {filePath:destination,filename:artifact.artifactKey,size:artifact.expectedSizeBytes,
      cleanup:()=>fs.promises.rm(directory,{recursive:true,force:true})};
  } catch (error) {
    if (handle) { try { await handle.close(); } catch (_) {} }
    try { await fs.promises.rm(directory,{recursive:true,force:true}); } catch (_) {}
    throw error;
  }
}

module.exports={MAX_CHUNK_BYTES,MIN_CHUNK_BYTES,validateArtifactSpec,decodeArtifactChunk,
  verifyChunkSequence,mapArtifact,initiateUpload,uploadChunk,finalizeUpload,
  readyArtifactForRelease,materializeArtifact};
