"use strict";

const ADMIN_ACTIONS = Object.freeze([
  "view_dashboard", "list_students", "approve", "reject", "activate", "suspend", "ban",
  "extend_license", "change_expiry", "reset_phone", "reset_computer", "force_logout",
  "set_web_app_enabled", "set_ccx_download_enabled", "set_panel_enabled", "password_reset",
  "view_login_history", "view_device_history", "view_download_history", "manage_panel_versions",
]);

function authorizeAdminAction(input) {
  const action = String(input && input.action || "");
  if (!ADMIN_ACTIONS.includes(action)) return { allowed: false, reason: "unknown_action", auditRequired: false };
  const roles = input && input.actor && Array.isArray(input.actor.roles) ? input.actor.roles : [];
  if (!roles.includes("admin")) return { allowed: false, reason: "forbidden", auditRequired: true };
  if (input.requireMfa && input.actor.mfaVerified !== true) {
    return { allowed: false, reason: "mfa_required", auditRequired: true };
  }
  return { allowed: true, reason: "allowed", auditRequired: true };
}

module.exports = { ADMIN_ACTIONS, authorizeAdminAction };
