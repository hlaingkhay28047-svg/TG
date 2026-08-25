"use strict";

/* App Platform liveness must not wait for PostgreSQL.
 *
 * A deployment runs the schema migration against the same database used by the
 * old container. DDL can legitimately wait for an old transaction's lock. This
 * test accepts a TCP connection and then never completes the PostgreSQL
 * handshake, which gives the boot migration the same observable shape: its
 * promise remains pending. The process must still open its HTTP port promptly,
 * answer the database-free liveness probe, and refuse every database route
 * until the migration has attested the tracked schema. */
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
let failures = 0;
const children = new Set();
const stalledSockets = new Set();
let stalledDatabase = null;

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const close = server => new Promise(resolve => server.close(resolve));

function trackChild(child) {
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function waitForChildExit(child, timeoutMs) {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
    let settled = false;
    const finish = exited => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const gracefulExit = waitForChildExit(child, 1000);
  child.kill("SIGTERM");
  if (await gracefulExit) return;
  const forcedExit = waitForChildExit(child, 1000);
  child.kill("SIGKILL");
  if (!await forcedExit) throw new Error(`child process ${child.pid} survived SIGKILL`);
}

async function unusedPort() {
  const server = net.createServer();
  await listen(server);
  const port = server.address().port;
  await close(server);
  return port;
}

async function requestJson(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(250) });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch (_) {}
      return { status: response.status, body, text };
    } catch (err) {
      lastError = err && err.message;
      await sleep(40);
    }
  }
  return { status: 0, body: null, error: lastError };
}

(async () => {
  stalledDatabase = net.createServer(socket => {
    stalledSockets.add(socket);
    socket.on("close", () => stalledSockets.delete(socket));
    /* Deliberately do not answer the PostgreSQL handshake. */
  });
  await listen(stalledDatabase);

  const databasePort = stalledDatabase.address().port;
  const apiPort = await unusedPort();
  let logs = "";
  const child = trackChild(spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    env: Object.assign({}, process.env, {
      DATABASE_URL: `postgres://hnk:hnk@127.0.0.1:${databasePort}/hnk`,
      PGSSLMODE: "disable",
      JWT_SECRET: "liveness-test-secret-that-is-never-used-for-real-tokens",
      ALLOWED_ORIGIN: "https://example.test",
      PORT: String(apiPort),
    }),
    stdio: ["ignore", "pipe", "pipe"],
  }));
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });

  const started = Date.now();
  const live = await requestJson(`http://127.0.0.1:${apiPort}/live`, 1500);
  const elapsedMs = Date.now() - started;
  const ready = await requestJson(`http://127.0.0.1:${apiPort}/ready`, 500);
  const guarded = await requestJson(`http://127.0.0.1:${apiPort}/rest/v1/app_settings`, 500);

  report("a blocked boot migration cannot prevent the liveness endpoint answering",
    live.status === 200 && live.body && live.body.ok === true && live.body.live === true,
    { elapsedMs, response: live, logs: logs.slice(-300) });
  report("readiness refuses traffic while the boot migration is pending",
    ready.status === 503 && ready.body && ready.body.ready === false,
    ready);
  report("database routes stay closed while the boot migration is pending",
    guarded.status === 503 && guarded.body && guarded.body.error === "schema_incomplete",
    guarded);

  /* SKIP_MIGRATE is an operator decision, not a transient failure. It must
     remain visibly not-ready without creating an unrecoverable retry chain. */
  const skippedPort = await unusedPort();
  let skippedLogs = "";
  const skippedChild = trackChild(spawn(process.execPath,
    [path.join(ROOT, "server", "index.js")], {
      env: Object.assign({}, process.env, {
        DATABASE_URL: `postgres://hnk:hnk@127.0.0.1:${databasePort}/hnk`,
        PGSSLMODE: "disable",
        JWT_SECRET: "skip-migration-test-secret-that-is-never-used-for-real-tokens",
        ALLOWED_ORIGIN: "https://example.test",
        PORT: String(skippedPort),
        SKIP_MIGRATE: "1",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    }));
  skippedChild.stdout.on("data", chunk => { skippedLogs += chunk; });
  skippedChild.stderr.on("data", chunk => { skippedLogs += chunk; });
  const skippedReady = await requestJson(`http://127.0.0.1:${skippedPort}/ready`, 1000);
  await sleep(1250); /* longer than the first recoverable-failure retry delay */
  report("an explicitly skipped migration stays not-ready without retry churn",
    skippedReady.status === 503 && skippedReady.body && skippedReady.body.ready === false &&
    !skippedLogs.includes("migrate: retry") &&
    skippedLogs.split("migrate: skipped").length - 1 <= 1,
    { response: skippedReady, logs: skippedLogs.slice(-500) });

  await stopChild(skippedChild);
  await stopChild(child);
  for (const socket of stalledSockets) socket.destroy();
  await close(stalledDatabase);
  stalledDatabase = null;

  console.log(`\n${failures ? `FAIL (${failures})` : "PASS — API liveness is independent of migration readiness"}`);
  process.exit(failures ? 1 : 0);
})().catch(async err => {
  for (const child of Array.from(children)) {
    try { await stopChild(child); } catch (_) {}
  }
  for (const socket of stalledSockets) socket.destroy();
  if (stalledDatabase && stalledDatabase.listening) {
    try { await close(stalledDatabase); } catch (_) {}
  }
  console.error("FAIL — liveness harness crashed ::", err && err.stack ? err.stack : err);
  process.exit(1);
});
