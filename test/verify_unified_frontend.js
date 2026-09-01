"use strict";

/* Security-sensitive frontend contract. The backend remains authoritative;
 * these checks prove the published clients call that authority and expose all
 * required states without embedding a second policy engine or a client secret. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log("PASS — " + name);
  else { failed++; console.error("FAIL — " + name + (detail ? "\n       " + detail : "")); }
}

const needed = ["docs/admin/index.html", "docs/admin/admin.js", "docs/admin/admin.css",
  "docs/download/index.html", "docs/download/download.js", "docs/download/download.css"];
needed.forEach(rel => check(rel + " exists", fs.existsSync(path.join(ROOT, rel))));

const app = read("docs/app/index.html");
const admin = fs.existsSync(path.join(ROOT, "docs/admin/admin.js")) ? read("docs/admin/admin.js") : "";
const adminHtml = fs.existsSync(path.join(ROOT, "docs/admin/index.html")) ? read("docs/admin/index.html") : "";
const adminCss = fs.existsSync(path.join(ROOT, "docs/admin/admin.css")) ? read("docs/admin/admin.css") : "";
const download = fs.existsSync(path.join(ROOT, "docs/download/download.js")) ? read("docs/download/download.js") : "";
const downloadHtml = fs.existsSync(path.join(ROOT, "docs/download/index.html")) ? read("docs/download/index.html") : "";

function hasAll(text, values) { return values.every(value => text.includes(value)); }

check("student app consumes the authoritative entitlement endpoint",
  app.includes("/v1/me/entitlement") || app.includes("/api/v1/me/entitlement"));
check("student app exposes every account outcome",
  hasAll(app.toLowerCase(), ["pending", "active", "suspended", "expired", "banned", "rejected"]));
check("student app exposes independent permission outcomes",
  hasAll(app, ["web_app", "ccx_download", "panel"]));
check("student app refreshes entitlement on visibility and heartbeat",
  /visibilitychange/.test(app) && /setInterval\s*\(\s*unifiedHeartbeat\s*,\s*15000\s*\)/.test(app));
const gateAllowsSource = (app.match(/function gateAllows\(key\)\{[\s\S]*?\n\}/) || [""])[0];
let unifiedGateOutcomes = [];
try {
  const context = {
    PREMIUM_GATES:{video:true},
    unified:{enforced:true,entitlement:null},
    isPremium:()=>true,
    unifiedCanWeb(){
      const data = context.unified.entitlement;
      return !!(data && data.account.effective_status === "active" && data.license.active && data.permissions.web_app);
    },
  };
  const gateAllows = vm.runInNewContext(`(${gateAllowsSource})`, context);
  const active = {account:{effective_status:"active"},license:{active:true},permissions:{web_app:true}};
  context.unified.entitlement = {...active,account:{effective_status:"suspended"}}; unifiedGateOutcomes.push(gateAllows("video"));
  context.unified.entitlement = {...active,permissions:{web_app:false}}; unifiedGateOutcomes.push(gateAllows("video"));
  context.unified.entitlement = active; unifiedGateOutcomes.push(gateAllows("video"));
} catch (_) { unifiedGateOutcomes = [true,true,false]; }
check("premium execution gates honor cached suspension and Web App disable verdicts",
  JSON.stringify(unifiedGateOutcomes) === JSON.stringify([false,false,true]));
check("entitlement authorization failures clear cached verdicts and stay fail-closed",
  /catch\(e\)\{\s*unified\.enforced\s*=\s*true;\s*unified\.error\s*=\s*true;\s*unified\.entitlement\s*=\s*null;/.test(app) &&
  /if \(unified\.loading \|\| unified\.error \|\| !unified\.entitlement\) return ["']checking["']/.test(app));
/* 2026-08-30 owner instruction: the Panel pairing-code step is retired.
   Typed device enrollment stays; the pairing-code endpoint and its UI must
   stay gone from the student app. */
check("student app targets typed device enrollment",
  hasAll(app, ["/v1/devices/enroll", "device_type", "installation_id"]));
check("the retired pairing-code surface stays gone from the student app",
  !app.includes("/v1/devices/pairing-code") && !app.includes("unifiedPairingCode"));
check("student UI has dashboard, AI tools, account and tutorials destinations",
  hasAll(app, ["pgDash", "AI Tools", "pgAccount", "pgTutorials"]));
check("student cannot self-reset or delete a registered device",
  !/accFetch\([^\n]+\/rest\/v1\/devices[^\n]+method:\s*["']DELETE["']/.test(app),
  "device replacement is an audited admin action");
check("student panel acquisition no longer embeds a CCX path", !/href=["'][^"']*\.ccx/i.test(app));

check("admin uses only same-origin /api/v1 routes", admin.includes("/api/v1/admin/") && !/https?:\/\//i.test(admin));
/* 2026-08-31 — owner instruction: leaving and returning must not sign the
   administrator out, and the console reopens on the panel they left. The
   session therefore PERSISTS (localStorage) — still under its own isolated
   admin key, never the student session key, with sign-out clearing every
   copy. The old tab-scoped pin described the retired design. */
check("admin session persists across visits in its own isolated store, never the student session",
  admin.includes("hnk_admin_sess_v1") && admin.includes("hnk_admin_panel_v1") &&
  /localStorage\.setItem\(SESSION_KEY/.test(admin) &&
  /localStorage\.removeItem\(SESSION_KEY/.test(admin) &&
  !admin.includes("hnk_acc_sess_v1"));
check("admin is installable with its own identity: manifest, ADMIN-badged icons, cinema hero band",
  adminHtml.includes('rel="manifest"') && adminHtml.includes("manifest.webmanifest") &&
  adminHtml.includes("admin-icon-192.png") &&
  fs.existsSync(path.join(ROOT, "docs/admin/manifest.webmanifest")) &&
  fs.existsSync(path.join(ROOT, "docs/admin/admin-icon-192.png")) &&
  fs.existsSync(path.join(ROOT, "docs/admin/admin-icon-512.png")) &&
  adminHtml.includes('class="admin-hero"') && adminCss.includes(".admin-hero video") &&
  admin.includes("banner-superhero") && !/style="/.test(adminHtml));
check("admin password and refresh grants explicitly request an admin client session",
  admin.includes("/api/auth/v1/token?grant_type=password") &&
  admin.includes("/api/auth/v1/token?grant_type=refresh_token") &&
  (admin.match(/client_type\s*:\s*["']admin["']/g) || []).length >= 2);
check("admin has an authoritative 403 role guard", /403/.test(admin) && /forbidden|not authorized|admin access/i.test(admin));
check("admin exposes dashboard, students, histories and panel-version endpoints",
  hasAll(admin, ["/api/v1/admin/dashboard", "/api/v1/admin/students", "/api/v1/admin/histories", "/api/v1/admin/panel-version"]));
check("admin sends functional student and history filter contracts",
  /query\.set\(["']q["'],\s*search\)/.test(admin) &&
  /query\.set\(["']type["'],\s*type\s*\|\|\s*["']all["']\)/.test(admin) &&
  hasAll(adminHtml, ['value="failed_login"', 'value="license"', 'value="account"', 'value="admin"']));
check("admin detail tolerates flat permissions/licenses and device-slot arrays",
  hasAll(admin, ["web_app_enabled", "ccx_download_enabled", "panel_enabled", "license_status", "slot_type", "installations"]));
const actions = ["approve", "reject", "activate", "suspend", "ban", "extend_license", "set_expiry",
  "reset_phone", "reset_computer", "force_logout", "set_permission", "password_reset", "set_devices"];
check("admin exposes every required named student action", hasAll(admin, actions),
  "missing: " + actions.filter(a => !admin.includes(a)).join(", "));
/* 2026-08-28 — the owner retired the authenticator system from the admin UI:
 * administrator sign-in is email+password only. The server keeps its MFA
 * endpoints and enrolled-admin enforcement (verify_api_service and
 * verify_unified_api_contracts pin them), but with no enrolment UI no
 * administrator can become enrolled, so no session can be code-gated. */
check("admin authenticator UI is fully retired: password sign-in only",
  adminHtml.includes("adminLoginForm") &&
  !/mfa|2fa|authenticator|totp|second factor/i.test(adminHtml) &&
  !/mfa|2fa|authenticator|totp/i.test(admin) &&
  !/mfa|2fa|authenticator|enrollment|secret-note/i.test(adminCss));
check("admin supports resumable private Panel artifact upload and finalization",
  hasAll(admin, ["/api/v1/admin/panel-artifacts/initiate", "/chunks/", "/finalize", "uploaded_indices", "crypto.subtle.digest", "data_base64"]) &&
  hasAll(adminHtml, ["panelArtifactFile", "artifactProgress", "artifactUploadStatus"]));
check("artifact chunks are capped at 4 MiB and release enable follows finalization",
  /ARTIFACT_CHUNK_SIZE\s*=\s*4\s*\*\s*1024\s*\*\s*1024/.test(admin) &&
  /finalizePanelArtifact[\s\S]{0,1600}enabled\s*:\s*true/.test(admin));
check("admin markup has search, filters, student detail dialog and live feedback",
  /type=["']search["']/.test(adminHtml) && /<dialog\b/i.test(adminHtml) && /aria-live=["']polite["']/.test(adminHtml));
/* 2026-08-28 — payment review is retired end-to-end in the admin shell: students
 * stopped submitting payment requests in v5.44.0, so the queue could only ever
 * be empty, and manual access goes through the audited student Approve /
 * extend_license actions instead. The server-side payment endpoints remain
 * (removing them reaches into ADMIN_ACTIONS and the unified contracts), but no
 * published client may reference them. */
check("admin payment surfaces are fully retired from markup, script and styles",
  !/payment/i.test(admin) && !/payment/i.test(adminHtml) && !/payment/i.test(adminCss) &&
  !/\/rest\/v1\/payment_requests|supabase\.co\/rest/i.test(admin));
check("no orphaned proof-Blob or VIP-grant machinery survives the payment removal",
  !/createObjectURL|revokeObjectURL|apiBlob/.test(admin) &&
  !/proof/i.test(adminHtml) && !/grant/i.test(adminHtml) && !/proof|grant-card/i.test(adminCss));
check("admin mutation retries retain a browser-generated idempotency key until success",
  /crypto\.randomUUID\(\)/.test(admin) &&
  /function mutationFor\(/.test(admin) && /function clearMutation\(/.test(admin) &&
  /mutationFor\("extend_license"/.test(admin) &&
  /crypto\.subtle\.digest\("SHA-256"/.test(admin) && /stablePayload\(/.test(admin) &&
  /sessionStorage\.getItem\(key\)/.test(admin) &&
  /sessionStorage\.setItem\(key, mutation\.id\)/.test(admin) &&
  /sessionStorage\.getItem\(mutation\.key\) === mutation\.id/.test(admin) &&
  /sessionStorage\.removeItem\(mutation\.key\)/.test(admin));
check("a completed license mutation is never reported as failed when only dashboard refresh fails",
  /body = await api\(`\$\{API\.students\}/.test(admin) &&
  /notify\(body\.message[\s\S]{0,260}await Promise\.all\([\s\S]{0,180}if \(mutation\) clearMutation\(mutation\)/.test(admin) &&
  /const summary = `\$\{title\(action\)\} completed, but refreshed data could not be loaded\.`/.test(admin) &&
  /handleError\(Object\.assign\(new Error\(message\)/.test(admin));
/* 20260901a — the console is bilingual: visible labels now pass through
   t(key, english), the English literal staying in the code as the source of
   truth. The contract this pins is the GATING (Approve exists only for a
   canonical pending account) and the label — both still asserted, with the
   translation wrapper allowed between them. */
check("Approve is rendered only for a canonical pending account",
  /canonicalAccountStatus\s*===\s*["']pending["'][\s\S]{0,220}\["approve",\s*(?:t\(\s*"act\.approve",\s*)?"Approve"/.test(admin));
check("concurrent admin 401s share one refresh and ignore stale responses after session rotation",
  hasAll(admin, ["refreshInFlight", "sessionGeneration"]) &&
  /accessToken\(\) !== token/.test(admin) && /generation !== sessionGeneration/.test(admin));

check("download requests a temporary URL only from an explicit control",
  download.includes("/api/v1/downloads/panel") && /addEventListener\s*\(\s*["']click["']/.test(download));
check("download request never round-trips a server device id or installation hash",
  !/computer_installation_id|installation_hash/.test(download));
check("download page never embeds a CCX path", !/\.ccx(?:["'?#]|$)/i.test(download + downloadHtml));
check("download UI describes expiring secure delivery", /expir|temporary|secure|သက်တမ်း/i.test(downloadHtml + download));

const published = app + admin + adminHtml + download + downloadHtml;
check("new clients contain no service/admin/database secret",
  !/(service[_-]?role|database[_-]?service[_-]?key|secret[_-]?admin[_-]?key)/i.test(published));

if (failed) process.exit(1);
console.log("\nPASS — unified frontend authorization and UX contract");
