"use strict";

/*
 * The two production safety nets, tested rather than assumed.
 *
 * A) SECURITY HEADERS — live, not grepped. A <meta> CSP cannot carry
 *    frame-ancestors and nothing in HTML can carry HSTS, so these can only
 *    come from the response itself. The API is booted for real here (no
 *    database needed: /live is process-local) and every kind of response —
 *    a 200, a CORS preflight, and an unknown route — must carry the whole
 *    set. The response that skips them is the one an attacker uses.
 *
 * B) THE BACKUP LANE — the contract that makes a dump a backup: a typed
 *    confirmation on manual runs, a private object in the private Space
 *    (never the repository, never public), a byte-for-byte round-trip
 *    verification, a real restore rehearsal, and pruning so the bill stays
 *    flat. Also that it cannot print what it handles.
 *
 * Usage: node test/verify_production_safety.js
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

const REQUIRED = {
  "strict-transport-security": /max-age=(\d+)/,
  "x-content-type-options": /^nosniff$/,
  "x-frame-options": /^DENY$/,
  "content-security-policy": /frame-ancestors 'none'/,
  "referrer-policy": /^no-referrer$/,
  "permissions-policy": /camera=\(\)/,
};

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

function request(port, method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, timeout: 5000 }, res => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/* A crashing node process prints the offending line, a caret, then the real
   headline ("Error: Cannot find module 'pg'"). Report that headline when it is
   there, and the opening lines when it is not — a truncated stack tail names
   the file but never the fault. */
function firstProblem(text) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const headline = lines.find(line => /^([A-Za-z]*Error|FATAL|Cannot |[A-Z]{4,}:)/.test(line));
  return (headline || lines.slice(0, 3).join(" | ") || "(said nothing)").slice(0, 240);
}

function missing(headers) {
  return Object.entries(REQUIRED)
    .filter(([name, pattern]) => !pattern.test(String(headers[name] || "")))
    .map(([name]) => name);
}

(async () => {
  /* ---------- A) live headers on every kind of response ---------- */
  const port = await freePort();
  const api = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    env: Object.assign({}, process.env, { PORT: String(port), DATABASE_URL: "" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  /* Keep what the process said. A server that cannot boot — a missing
     dependency, a port already taken — used to fail this check with nothing
     but a port number to go on; the reason belongs in the failure itself. */
  let boot = "";
  const keep = chunk => { if (boot.length < 4000) boot += chunk; };
  api.stdout.on("data", keep); api.stderr.on("data", keep);
  let died = null;
  api.on("exit", (code, signal) => { died = { code, signal }; });
  let up = false;
  for (let attempt = 0; attempt < 60 && !up; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { await request(port, "GET", "/live"); up = true; } catch (_) { }
  }
  try {
    report("the API answers its liveness probe without a database", up,
      { port, exited: died, said: firstProblem(boot) });
    if (up) {
      const live = await request(port, "GET", "/live");
      report("a normal 200 carries the whole security header set",
        live.status === 200 && !missing(live.headers).length,
        { status: live.status, missing: missing(live.headers) });

      const preflight = await request(port, "OPTIONS", "/api/v1/admin/dashboard");
      report("a CORS preflight carries them too",
        !missing(preflight.headers).length, { status: preflight.status, missing: missing(preflight.headers) });

      const unknown = await request(port, "GET", "/no-such-route-" + Date.now());
      report("an unknown route carries them too",
        !missing(unknown.headers).length, { status: unknown.status, missing: missing(unknown.headers) });

      const hsts = String(live.headers["strict-transport-security"] || "");
      const seconds = Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0);
      report("HSTS pins transport for at least a year, subdomains included",
        seconds >= 31536000 && /includeSubDomains/i.test(hsts), { hsts });

      const csp = String(live.headers["content-security-policy"] || "");
      report("the API's own CSP allows nothing by default and refuses to be framed",
        /default-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp), { csp });

      /* The Photoshop panel is a legitimate cross-origin caller: CORS governs
         it, and a blanket resource policy must not quietly cut it off. */
      report("no blanket Cross-Origin-Resource-Policy that would cut off the panel",
        !live.headers["cross-origin-resource-policy"], { corp: live.headers["cross-origin-resource-policy"] });
    }
  } finally {
    api.kill("SIGKILL");
  }

  /* ---------- B) the backup lane's contract ---------- */
  const lanePath = path.join(ROOT, ".github", "workflows", "backup-database.yml");
  const lane = fs.existsSync(lanePath) ? fs.readFileSync(lanePath, "utf8") : "";
  report("a database backup lane exists at all", !!lane, { lanePath });
  report("it runs on a schedule and by hand", /schedule:/.test(lane) && /cron:/.test(lane) && /workflow_dispatch:/.test(lane));
  report("a manual run must type BACKUP", /CONFIRM_INPUT" \] && \[ "\$CONFIRM_INPUT" != "BACKUP"|!= "BACKUP"/.test(lane));
  report("the dump is written to the private Space, never the repository",
    /s3:\/\/\$BUCKET\/\$KEY/.test(lane) && /--acl-private/.test(lane) && !/git add|git commit/.test(lane));
  report("the stored object is proved byte-for-byte against the dump",
    /BACK_SHA" != "\$SHA"/.test(lane) && /BACK_BYTES" != "\$BYTES"/.test(lane));
  report("a dump only counts once it has been restored and counted",
    /pg_restore/.test(lane) && /RESTORE_TABLES/.test(lane) && /fewer than ten tables/.test(lane));
  report("old dumps are pruned so the bill stays flat",
    /RETENTION_DAYS/.test(lane) && /rm --recursive/.test(lane));
  report("the lane never turns on command echo and deletes its key on every exit",
    !/^\s*set -[a-z]*x/m.test(lane) && /trap cleanup EXIT/.test(lane) && /spaces\/keys\/\$EPHEMERAL_ACCESS/.test(lane));
  report("the database URI is masked the moment it is read",
    /::add-mask::\$DB_URI/.test(lane));

  console.log(failures ? `\nFAIL (${failures})` : "\nAll production-safety contracts hold.");
  process.exit(failures ? 1 : 0);
})().catch(error => { console.error("FATAL", error); process.exit(1); });
