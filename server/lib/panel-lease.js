"use strict";

const crypto = require("crypto");

const encode = value => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

function createPanelLeaseService(options) {
  const secret = String(options.secret || "");
  if (secret.length < 32) throw new Error("panel lease secret must contain at least 32 characters");
  const clock = options.clock || (() => new Date());
  const ttlSeconds = Math.min(300, Math.max(30, Number(options.ttlSeconds || 180)));
  const randomToken = options.randomToken || (() => crypto.randomBytes(16).toString("base64url"));
  const sign = payload => crypto.createHmac("sha256", secret).update(payload, "utf8").digest("base64url");

  function issue(claims) {
    const expiresAt = new Date(clock().getTime() + ttlSeconds * 1000);
    const payload = encode({
      sub: claims.userId, sid: claims.sessionId, installation: claims.installationHash,
      version: claims.panelVersion, nonce: randomToken(), exp: Math.floor(expiresAt.getTime() / 1000),
    });
    return { token: payload + "." + sign(payload), expiresAt: expiresAt.toISOString() };
  }

  function verify(token) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return null;
    const expected = Buffer.from(sign(parts[0]));
    const provided = Buffer.from(parts[1]);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
    catch (_) { return null; }
    if (!payload || !Number.isInteger(payload.exp) || payload.exp * 1000 <= clock().getTime()) return null;
    return payload;
  }

  return { issue, verify };
}

module.exports = { createPanelLeaseService };
