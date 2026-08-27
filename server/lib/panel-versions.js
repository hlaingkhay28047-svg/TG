"use strict";

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ""));
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function evaluatePanelVersion(input) {
  const installedVersion = String(input && input.installedVersion || "");
  const minimumSupportedVersion = String(input && input.minimumSupportedVersion || "");
  const latestVersion = String(input && input.latestVersion || "");
  const comparison = compareVersions(installedVersion, minimumSupportedVersion);

  if (comparison === null) {
    return { allowed: false, reason: "invalid_version", updateRequired: true, latestVersion };
  }
  if (input && input.enabled === false) {
    return { allowed: false, reason: "version_blocked", updateRequired: false, latestVersion };
  }
  if (comparison < 0) {
    return { allowed: false, reason: "update_required", updateRequired: true, latestVersion };
  }
  return { allowed: true, reason: "allowed", updateRequired: false, latestVersion };
}

module.exports = { parseVersion, compareVersions, evaluatePanelVersion };
