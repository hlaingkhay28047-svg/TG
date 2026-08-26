"use strict";

const { evaluatePanelVersion } = require("./panel-versions");

const REASONS = Object.freeze({
  PENDING: "pending",
  NOT_ACTIVE: "not_active",
  SUSPENDED: "suspended",
  BANNED: "banned",
  REJECTED: "rejected",
  LICENSE_MISSING: "license_missing",
  LICENSE_REVOKED: "license_revoked",
  LICENSE_NOT_STARTED: "license_not_started",
  LICENSE_EXPIRED: "license_expired",
  WEB_DISABLED: "web_disabled",
  DOWNLOAD_DISABLED: "download_disabled",
  PANEL_DISABLED: "panel_disabled",
  DEVICE_REQUIRED: "device_required",
  DEVICE_MISMATCH: "device_mismatch",
  UPDATE_REQUIRED: "update_required",
  VERSION_BLOCKED: "version_blocked",
  INVALID_VERSION: "invalid_version",
  ALLOWED: "allowed",
});

const denied = reason => ({ allowed: false, reason });

function evaluateAuthorization(input) {
  const value = input || {};
  const status = String(value.accountStatus || "");
  if (status === "pending") return denied(REASONS.PENDING);
  if (status === "suspended") return denied(REASONS.SUSPENDED);
  if (status === "banned") return denied(REASONS.BANNED);
  if (status === "rejected") return denied(REASONS.REJECTED);
  if (status !== "active") return denied(REASONS.NOT_ACTIVE);

  const license = value.license;
  if (!license) return denied(REASONS.LICENSE_MISSING);
  if (license.status !== "active") return denied(REASONS.LICENSE_REVOKED);
  const now = new Date(value.now || Date.now()).getTime();
  const startsAt = new Date(license.startsAt).getTime();
  const expiresAt = new Date(license.expiresAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)) return denied(REASONS.LICENSE_MISSING);
  if (startsAt > now) return denied(REASONS.LICENSE_NOT_STARTED);
  if (expiresAt <= now) return denied(REASONS.LICENSE_EXPIRED);

  const permissions = value.permissions || {};
  const capability = value.capability || "web";
  if (capability === "web" && permissions.webAppEnabled !== true) return denied(REASONS.WEB_DISABLED);
  if (capability === "download" && permissions.ccxDownloadEnabled !== true) return denied(REASONS.DOWNLOAD_DISABLED);
  if (capability === "panel" && permissions.panelEnabled !== true) return denied(REASONS.PANEL_DISABLED);

  if (!value.device || value.device.registered !== true) return denied(REASONS.DEVICE_REQUIRED);
  if (value.device.matches !== true) return denied(REASONS.DEVICE_MISMATCH);
  if ((capability === "panel" || capability === "download") && value.device.slotType !== "computer") {
    return denied(REASONS.DEVICE_MISMATCH);
  }

  if (capability === "panel") {
    const version = evaluatePanelVersion(value.panelVersion || {});
    if (!version.allowed) return denied(version.reason);
  }
  return { allowed: true, reason: REASONS.ALLOWED };
}

module.exports = { REASONS, evaluateAuthorization };
