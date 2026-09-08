"use strict";

const ADMIN_ACTIONS = Object.freeze([
  "view_dashboard", "list_students", "approve", "reject", "activate", "suspend", "ban",
  "extend_license", "change_expiry", "reset_phone", "reset_computer", "force_logout",
  "set_web_app_enabled", "set_ccx_download_enabled", "set_panel_enabled", "set_devices", "password_reset",
  "view_login_history", "view_device_history", "view_download_history", "manage_panel_versions",
  "list_payment_requests", "review_payment", "view_payment_proof", "grant_payment",
  "view_visits", "update_record",
]);

/* v6.37.0 — the admin can finally fix a student's RECORD, not only its state.
   Until now the only writable fields on a student were account_status and
   allowed_devices, so a name typed badly at sign-up was permanent and the
   teacher had nowhere to keep "paid by KBZ on 3 Sep" except their own memory.

   Pure on purpose, exactly like evaluateSelfRelease: the test executes every
   branch of this instead of reading the route and hoping.

   The name is NOT trimmed to ASCII. Every student here types Burmese, Shan or
   Kachin, so the only characters removed are control characters and the
   Unicode separators that make two visually identical names sort apart; the
   rest of the codepoint space is a legitimate name. */
const RECORD_NAME_MAX = 80;
const RECORD_NOTE_MAX = 500;

function cleanRecordText(value) {
  /* strip C0/C1 controls, normalise every Unicode space to one plain space,
     then collapse runs — the same shape the app applies to a typed address */
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evaluateRecordUpdate(input) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasNote = Object.prototype.hasOwnProperty.call(body, "admin_note");
  if (!hasName && !hasNote) {
    return { ok: false, status: 400, code: "record_unchanged",
      message: "Send a name, an admin note, or both" };
  }
  const changes = {};
  if (hasName) {
    if (typeof body.name !== "string") {
      return { ok: false, status: 400, code: "invalid_name", message: "The name must be text" };
    }
    const name = cleanRecordText(body.name);
    /* A blank name is refused rather than stored: the list, the detail dialog
       and every audit line read this field, and a row with no name is one the
       teacher cannot act on. Clearing a note is meaningful; clearing a name is
       not. */
    if (!name) {
      return { ok: false, status: 400, code: "invalid_name", message: "The name cannot be empty" };
    }
    if ([...name].length > RECORD_NAME_MAX) {
      return { ok: false, status: 400, code: "invalid_name",
        message: `The name cannot be longer than ${RECORD_NAME_MAX} characters`,
        details: { max: RECORD_NAME_MAX } };
    }
    changes.name = name;
  }
  if (hasNote) {
    if (body.admin_note !== null && typeof body.admin_note !== "string") {
      return { ok: false, status: 400, code: "invalid_note", message: "The note must be text" };
    }
    /* the note keeps its line breaks — a teacher writes a list in it — so only
       controls other than newline and tab are removed */
    const note = body.admin_note === null ? "" : String(body.admin_note)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
      .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, " ")
      .trim();
    if ([...note].length > RECORD_NOTE_MAX) {
      return { ok: false, status: 400, code: "invalid_note",
        message: `The note cannot be longer than ${RECORD_NOTE_MAX} characters`,
        details: { max: RECORD_NOTE_MAX } };
    }
    changes.adminNote = note;          /* "" means: delete the note */
  }
  return { ok: true, changes };
}

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

module.exports = { ADMIN_ACTIONS, authorizeAdminAction, evaluateRecordUpdate,
  RECORD_NAME_MAX, RECORD_NOTE_MAX };
