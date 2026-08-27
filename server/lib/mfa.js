"use strict";

const crypto = require("crypto");

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0, value = 0, output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(text) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const char of String(text || "").toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, timeMs, stepSeconds) {
  const counter = Math.floor(timeMs / 1000 / (stepSeconds || 30));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, "0");
}

function verifyTotp(secret, code, nowMs) {
  const supplied = String(code || "");
  if (!/^\d{6}$/.test(supplied)) return false;
  for (let drift = -1; drift <= 1; drift++) {
    const expected = totp(secret, nowMs + drift * 30000, 30);
    if (crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return true;
  }
  return false;
}

function encryptionKey(secret) {
  const raw = String(secret || "");
  if (raw.length < 32) throw new Error("MFA encryption key must contain at least 32 characters");
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function encryptSecret(secret, keySecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(keySecret), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  return [iv,cipher.getAuthTag(),encrypted].map(value => value.toString("base64url")).join(".");
}

function decryptSecret(value, keySecret) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3) throw new Error("invalid encrypted MFA secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(keySecret), Buffer.from(parts[0], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")),decipher.final()]).toString("utf8");
}

const generateSecret = () => base32Encode(crypto.randomBytes(20));

module.exports = { base32Encode, base32Decode, totp, verifyTotp, encryptSecret, decryptSecret, generateSecret };
