"use strict";

const crypto = require("crypto");
const { asService } = require("./db");
const { verifyToken } = require("./crypto");
const { resolveClientAddress } = require("./request-source");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_IDLE_SECONDS = Math.max(60, Number(process.env.ADMIN_SESSION_TIMEOUT_SECONDS || 900));
const TRUST_PROXY_HOPS = Math.min(5,Math.max(0,Number(process.env.TRUST_PROXY_HOPS || 0)));
const TRUST_DO_CONNECTING_IP = process.env.TRUST_DO_CONNECTING_IP === "1";

function bearerFrom(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req && req.headers && req.headers.authorization || ""));
  return match ? match[1].trim() : null;
}

function hashRequestValue(value, secret) {
  if (!value) return null;
  return crypto.createHmac("sha256", String(secret || "")).update(String(value), "utf8").digest("hex");
}

function classifyWebDevice(userAgent) {
  return /(android|iphone|ipad|ipod|mobile|windows phone)/i.test(String(userAgent || ""))
    ? "phone" : "computer";
}

function requestContext(req, secret, clientType) {
  const address = resolveClientAddress(req,TRUST_PROXY_HOPS,TRUST_DO_CONNECTING_IP);
  return {
    clientType: ["web","panel","admin"].includes(clientType) ? clientType : "web",
    ipHash: hashRequestValue(address, secret),
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
    deviceName: String(req.headers["x-device-name"] || "").slice(0, 200) || null,
    observedDeviceType: classifyWebDevice(req.headers["user-agent"]),
  };
}

async function authenticateRequest(req, secret) {
  const token = bearerFrom(req);
  if (!token) return { provided: false, valid: false, reason: "missing_access_token" };
  const payload = verifyToken(token, secret);
  if (!payload || !UUID_RE.test(String(payload.sid || ""))) {
    return { provided: true, valid: false, reason: "invalid_access_token" };
  }

  return asService(async client => {
    const { rows } = await client.query(
      `select s.id,s.user_id,s.client_type,s.created_at,s.last_seen_at,s.expires_at,
              s.revoked_at,s.device_installation_id,s.mfa_verified_at,
              p.account_status,p.is_admin,
              coalesce(array_agg(distinct r.name) filter (where r.name is not null),'{}') as roles,
              bool_or(m.confirmed_at is not null) as mfa_enrolled
         from public.sessions s
         join public.profiles p on p.id=s.user_id
         left join public.user_roles ur on ur.user_id=s.user_id
         left join public.roles r on r.id=ur.role_id
         left join public.admin_mfa m on m.user_id=s.user_id
        where s.id=$1 and s.user_id=$2
        group by s.id,p.account_status,p.is_admin`,
      [payload.sid,payload.sub]);
    const row = rows[0];
    if (!row) return { provided: true, valid: false, reason: "session_not_found" };
    if (row.revoked_at) return { provided: true, valid: false, reason: "session_revoked" };
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query(
        "update public.sessions set revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,'expired') where id=$1",
        [row.id]);
      return { provided: true, valid: false, reason: "session_expired" };
    }
    if (["suspended","banned","rejected"].includes(row.account_status)) {
      await client.query(
        "update public.sessions set revoked_at=coalesce(revoked_at,now()),revoked_reason=coalesce(revoked_reason,$2) where user_id=$1 and revoked_at is null",
        [row.user_id,row.account_status]);
      return { provided: true, valid: false, reason: "account_" + row.account_status };
    }

    const roles = Array.isArray(row.roles) ? row.roles : [];
    /* profiles.is_admin is the authoritative bootstrap/demotion flag. A stale
       user_roles row may never keep access alive after that flag is cleared. */
    const adminRoleIndex=roles.indexOf("admin");
    if (row.is_admin && adminRoleIndex<0) roles.push("admin");
    if (!row.is_admin&&adminRoleIndex>=0) roles.splice(adminRoleIndex,1);
    if (roles.includes("admin") && row.client_type === "admin" &&
        Date.now() - new Date(row.last_seen_at).getTime() > ADMIN_IDLE_SECONDS * 1000) {
      await client.query(
        "update public.sessions set revoked_at=now(),revoked_reason='admin_idle_timeout' where id=$1",
        [row.id]);
      return { provided: true, valid: false, reason: "admin_session_timeout" };
    }

    await client.query("update public.sessions set last_seen_at=now() where id=$1", [row.id]);
    return {
      provided: true,
      valid: true,
      uid: row.user_id,
      sessionId: row.id,
      clientType: row.client_type,
      deviceInstallationId: row.device_installation_id,
      accountStatus: row.account_status,
      roles,
      mfaEnrolled: !!row.mfa_enrolled,
      mfaVerified: !!row.mfa_verified_at,
      payload,
    };
  });
}

module.exports = { bearerFrom, hashRequestValue, classifyWebDevice, requestContext, authenticateRequest };
