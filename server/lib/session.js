"use strict";

const crypto = require("crypto");

const hashRefreshToken = token => crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");

function createSessionStore(options) {
  const repository = options.repository;
  const clock = options.clock || (() => new Date());
  const randomToken = options.randomToken || (() => crypto.randomBytes(32).toString("base64url"));
  const refreshTtlSeconds = Number(options.refreshTtlSeconds || 60 * 60 * 24 * 30);
  const adminIdleSeconds = Math.max(60, Number(options.adminIdleSeconds ||
    process.env.ADMIN_SESSION_TIMEOUT_SECONDS || 900));
  const id = options.randomId || (() => crypto.randomUUID());

  const denial = reason => ({ active: false, allowed: false, reason });
  const isoNow = () => clock().toISOString();
  const expiry = () => new Date(clock().getTime() + refreshTtlSeconds * 1000).toISOString();

  async function issue(input) {
    const refreshToken = randomToken();
    const row = await repository.create({
      id: id(),
      userId: input.userId,
      clientType: input.clientType || "web",
      deviceInstallationId: input.deviceInstallationId || null,
      refreshTokenHash: hashRefreshToken(refreshToken),
      createdAt: isoNow(),
      lastSeenAt: isoNow(),
      expiresAt: expiry(),
      revokedAt: null,
      ipHash: input.ipHash || null,
      userAgent: input.userAgent || null,
      mfaVerifiedAt: input.mfaVerifiedAt || null,
    });
    return { sessionId: row.id, refreshToken, expiresAt: row.expiresAt };
  }

  async function validate(input) {
    const row = await repository.findById(input.sessionId);
    if (!row || row.userId !== input.userId) return denial("session_not_found");
    if (row.revokedAt) return denial("session_revoked");
    if (new Date(row.expiresAt).getTime() <= clock().getTime()) return denial("session_expired");
    if (repository.update) await repository.update(row.id, { lastSeenAt: isoNow() });
    return { active: true, allowed: true, reason: "allowed", session: row };
  }

  async function rotate(input) {
    const currentHash = hashRefreshToken(input.refreshToken);
    /* Refresh is activity, but it must not resurrect an admin session whose
       authoritative row was already idle past the limit. Check the old row
       before the atomic rotation updates last_seen_at. The row's client type,
       not a caller-supplied body field, decides whether this rule applies. */
    const current = await repository.findByRefreshTokenHash(currentHash);
    if (!current) return denial("invalid_refresh_token");
    if (current.revokedAt) return denial("session_revoked");
    if (new Date(current.expiresAt).getTime() <= clock().getTime()) {
      return denial("session_expired");
    }
    if (current.clientType === "admin" &&
        clock().getTime() - new Date(current.lastSeenAt).getTime() > adminIdleSeconds * 1000) {
      await repository.revokeById(current.id, isoNow(), "admin_idle_timeout");
      return denial("admin_session_timeout");
    }
    const nextToken = randomToken();
    const row = await repository.rotateRefreshToken(
      currentHash, hashRefreshToken(nextToken), expiry(), isoNow());
    if (!row || new Date(row.expiresAt).getTime() <= clock().getTime()) {
      return denial("invalid_refresh_token");
    }
    return { sessionId: row.id, refreshToken: nextToken, expiresAt: row.expiresAt, userId: row.userId };
  }

  async function revokeSession(input) {
    const row = await repository.revokeById(input.sessionId, isoNow());
    return row ? { allowed: true, reason: "revoked" } : denial("session_not_found");
  }

  async function revokeUser(input) {
    const count = await repository.revokeByUser(input.userId, isoNow());
    return { allowed: true, reason: "revoked", count };
  }

  return { issue, validate, rotate, revokeSession, revokeUser };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    deviceInstallationId: row.device_installation_id,
    clientType: row.client_type,
    refreshTokenHash: row.refresh_token_hash,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    ipHash: row.ip_hash,
    userAgent: row.user_agent,
    mfaVerifiedAt: row.mfa_verified_at,
  };
}

function createPgSessionRepository(client) {
  const returning = "id,user_id,device_installation_id,client_type,refresh_token_hash," +
    "created_at,last_seen_at,expires_at,revoked_at,revoked_reason,ip_hash,user_agent,mfa_verified_at";
  return {
    async create(row) {
      const { rows } = await client.query(
        `insert into public.sessions
          (id,user_id,device_installation_id,client_type,refresh_token_hash,created_at,last_seen_at,
           expires_at,revoked_at,ip_hash,user_agent,mfa_verified_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning ${returning}`,
        [row.id,row.userId,row.deviceInstallationId,row.clientType,row.refreshTokenHash,row.createdAt,
         row.lastSeenAt,row.expiresAt,row.revokedAt,row.ipHash,row.userAgent,row.mfaVerifiedAt]);
      return mapSession(rows[0]);
    },
    async findById(id) {
      const { rows } = await client.query(`select ${returning} from public.sessions where id=$1`, [id]);
      return mapSession(rows[0]);
    },
    async findByRefreshTokenHash(hash) {
      const { rows } = await client.query(`select ${returning} from public.sessions where refresh_token_hash=$1`, [hash]);
      return mapSession(rows[0]);
    },
    async update(id, patch) {
      if (patch.lastSeenAt) {
        const { rows } = await client.query(
          `update public.sessions set last_seen_at=$2 where id=$1 returning ${returning}`,
          [id, patch.lastSeenAt]);
        return mapSession(rows[0]);
      }
      return this.findById(id);
    },
    async rotateRefreshToken(currentHash, nextHash, nextExpiresAt, rotatedAt) {
      const { rows } = await client.query(
        `update public.sessions set refresh_token_hash=$2,expires_at=$3,last_seen_at=$4
          where refresh_token_hash=$1 and revoked_at is null and expires_at > $4
          returning ${returning}`,
        [currentHash,nextHash,nextExpiresAt,rotatedAt]);
      return mapSession(rows[0]);
    },
    async revokeById(id, revokedAt, reason) {
      const { rows } = await client.query(
        `update public.sessions set revoked_at=coalesce(revoked_at,$2),revoked_reason=coalesce(revoked_reason,$3)
          where id=$1 returning ${returning}`,
        [id,revokedAt,reason || "logout"]);
      return mapSession(rows[0]);
    },
    async revokeByUser(userId, revokedAt, reason) {
      const result = await client.query(
        `update public.sessions set revoked_at=$2,revoked_reason=$3
          where user_id=$1 and revoked_at is null`,
        [userId,revokedAt,reason || "force_logout"]);
      return result.rowCount;
    },
  };
}

module.exports = { hashRefreshToken, createSessionStore, createPgSessionRepository, mapSession };
