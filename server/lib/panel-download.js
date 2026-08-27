"use strict";

const crypto = require("crypto");

const tokenHash = token => crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
const encode = value => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createDownloadStreamLifecycle(options) {
  const complete=options&&options.complete||(()=>{});
  const cleanup=options&&options.cleanup||(()=>{});
  let settled=null;
  function settle(result,reason) {
    if (settled) return settled;
    settled=Promise.resolve().then(()=>complete(result,reason||null)).finally(()=>cleanup());
    return settled;
  }
  return {
    finish:()=>settle("downloaded",null),
    abort:reason=>settle("failed",reason||"stream_aborted"),
  };
}

function createDownloadTokenService(options) {
  const repository = options.repository;
  const clock = options.clock || (() => new Date());
  const secret = String(options.secret || "");
  if (secret.length < 32) throw new Error("download signing secret must contain at least 32 characters");
  const randomToken = options.randomToken || (() => crypto.randomBytes(24).toString("base64url"));
  const ttlSeconds = Math.min(300, Math.max(1, Number(options.ttlSeconds || 300)));
  const denial = reason => ({ allowed: false, reason });

  function signature(payload) {
    return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
  }

  function inspect(input) {
    const token=String(input&&input.token||"");
    const parts=token.split(".");
    if (parts.length!==2) return denial("invalid_download_token");
    const expected=signature(parts[0]);
    const givenBytes=Buffer.from(parts[1]);
    const expectedBytes=Buffer.from(expected);
    if (givenBytes.length!==expectedBytes.length||!crypto.timingSafeEqual(givenBytes,expectedBytes)) {
      return denial("invalid_download_token");
    }
    let payload;
    try { payload=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")); }
    catch (_) { return denial("invalid_download_token"); }
    const now=clock();
    if (!payload||!Number.isInteger(payload.exp)||payload.exp*1000<=now.getTime()) {
      return denial("download_token_expired");
    }
    if (!UUID_RE.test(String(payload.sub||""))) return denial("invalid_download_token");
    return {allowed:true,reason:"allowed",userId:payload.sub,expiresAt:new Date(payload.exp*1000).toISOString()};
  }

  async function issue(input) {
    const now = clock();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    if (!UUID_RE.test(String(input.userId||""))) throw new Error("download user id must be a UUID");
    const payload = encode({ nonce: randomToken(),sub:input.userId,exp:Math.floor(expiresAt.getTime()/1000) });
    const token = payload + "." + signature(payload);
    const row = await repository.create({
      userId: input.userId,
      sessionId: input.sessionId || null,
      deviceSlotId: input.deviceSlotId || null,
      panelVersion: input.panelVersion,
      artifactKey: input.artifactKey,
      tokenHash: tokenHash(token),
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      result: "issued",
      ipHash: input.ipHash || null,
      userAgent: input.userAgent || null,
    });
    return { token, tokenId: row.id, expiresAt: expiresAt.toISOString(), panelVersion: input.panelVersion };
  }

  async function consume(input) {
    const token = String(input && input.token || "");
    const inspected=inspect({token});
    if (!inspected.allowed) return inspected;
    const row = await repository.findByTokenHash(tokenHash(token));
    if (!row) return denial("invalid_download_token");
    if (row.userId!==inspected.userId) return denial("invalid_download_token");
    if (row.downloadedAt) return denial("download_token_replayed");
    const now = clock();
    if (new Date(row.expiresAt).getTime() <= now.getTime()) {
      return denial("download_token_expired");
    }
    const consumed = await repository.consumeIfUnused(tokenHash(token), now.toISOString());
    if (!consumed) return denial("download_token_replayed");
    return Object.assign({ allowed: true, reason: "allowed" }, consumed);
  }

  return { issue,inspect,consume };
}

function mapDownload(row) {
  if (!row) return null;
  return {
    id: row.id, userId: row.user_id, sessionId: row.session_id,
    deviceSlotId: row.device_slot_id, panelVersion: row.panel_version,
    artifactKey: row.artifact_key, tokenHash: row.token_hash,
    issuedAt: row.issued_at, expiresAt: row.expires_at,
    downloadedAt: row.downloaded_at, completedAt:row.completed_at,
    result: row.result, reason: row.reason,
  };
}

function createPgDownloadRepository(client) {
  return {
    async create(row) {
      const { rows } = await client.query(
        `insert into public.download_history
          (user_id,session_id,device_slot_id,panel_version,artifact_key,token_hash,
           issued_at,expires_at,result,reason,ip_hash,user_agent)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
        [row.userId,row.sessionId,row.deviceSlotId,row.panelVersion,row.artifactKey,row.tokenHash,
         row.issuedAt,row.expiresAt,row.result,row.reason || null,row.ipHash || null,row.userAgent || null]);
      return mapDownload(rows[0]);
    },
    async findByTokenHash(hash) {
      const { rows } = await client.query("select * from public.download_history where token_hash=$1", [hash]);
      return mapDownload(rows[0]);
    },
    async consumeIfUnused(hash, downloadedAt) {
      const { rows } = await client.query(
        `update public.download_history set downloaded_at=$2,result='streaming',reason=null
          where token_hash=$1 and downloaded_at is null returning *`, [hash,downloadedAt]);
      return mapDownload(rows[0]);
    },
    async completeStream(id,result,reason) {
      if (!["downloaded","failed"].includes(result)) throw new Error("invalid download stream result");
      const { rows }=await client.query(
        `update public.download_history set result=$2,reason=$3,completed_at=now()
          where id=$1 and result='streaming' returning *`,[id,result,reason||null]);
      return mapDownload(rows[0]);
    },
  };
}

module.exports = { tokenHash, createDownloadTokenService, createDownloadStreamLifecycle,
  createPgDownloadRepository, mapDownload };
