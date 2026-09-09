"use strict";

/*
 * RED-first unit contracts for policy, live sessions and device slots.
 * No database or network is required: each stateful domain factory receives a
 * tiny repository and clock, the same seams its PostgreSQL adapter will use.
 *
 * Required exports:
 *   server/lib/authorization.js
 *     { evaluateAuthorization(input), REASONS }
 *   server/lib/session.js
 *     { createSessionStore(options), hashRefreshToken(token) }
 *   server/lib/devices.js
 *     { createDeviceRegistry(options) }
 *
 * Expected authorization input/output is exercised below. Expected factory
 * repository methods are implemented by createSessionRepository() and
 * createDeviceRepository(); they form the persistence-port contract.
 *
 * Usage: node test/verify_unified_backend_contract.js
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function report(name, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + " — " + name +
    (ok ? "" : "  :: " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function loadContract(relativePath, exportsWanted) {
  try {
    const loaded = require(path.join(ROOT, relativePath));
    const missing = exportsWanted.filter(name => typeof loaded[name] === "undefined");
    report(relativePath + " exports " + exportsWanted.join(", "), missing.length === 0, { missing });
    return missing.length ? null : loaded;
  } catch (error) {
    report(relativePath + " is loadable", false, {
      error: error && error.code === "MODULE_NOT_FOUND"
        ? "missing module: " + relativePath
        : String(error && error.message || error),
    });
    return null;
  }
}

function reasonValues(reasons) {
  if (Array.isArray(reasons)) return reasons;
  if (reasons instanceof Set) return [...reasons];
  if (reasons && typeof reasons === "object") return Object.values(reasons);
  return [];
}

function denialReason(resultOrError) {
  if (!resultOrError) return null;
  return resultOrError.reason || resultOrError.code ||
    (resultOrError.error && (resultOrError.error.reason || resultOrError.error.code)) || null;
}

async function denied(call) {
  try {
    const result = await call();
    if (result && (result.allowed === false || result.ok === false || result.active === false)) {
      return denialReason(result);
    }
    return null;
  } catch (error) {
    return denialReason(error);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSessionRepository() {
  const rows = new Map();
  return {
    rows,
    async create(row) {
      const saved = Object.assign({}, row);
      rows.set(saved.id, saved);
      return Object.assign({}, saved);
    },
    async findById(id) {
      const row = rows.get(id);
      return row ? Object.assign({}, row) : null;
    },
    async findByRefreshTokenHash(hash) {
      const row = [...rows.values()].find(item => item.refreshTokenHash === hash);
      return row ? Object.assign({}, row) : null;
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return Object.assign({}, row);
    },
    /* Atomic in PostgreSQL: UPDATE ... WHERE refresh_token_hash=$old AND
     * revoked_at IS NULL RETURNING *. Returning null spends a replayed token.
     * 2026-08-30: rotation now parks the spent hash in prevRefreshTokenHash
     * so a client whose rotated reply never reached disk can re-join once. */
    async rotateRefreshToken(currentHash, nextHash, nextExpiresAt, rotatedAt) {
      const row = [...rows.values()].find(item =>
        item.refreshTokenHash === currentHash && !item.revokedAt);
      if (!row) return null;
      row.prevRefreshTokenHash = row.refreshTokenHash;
      row.refreshTokenHash = nextHash;
      row.expiresAt = nextExpiresAt;
      row.lastSeenAt = rotatedAt;
      return Object.assign({}, row);
    },
    async findByPrevRefreshTokenHash(hash) {
      const row = [...rows.values()].find(item => item.prevRefreshTokenHash === hash);
      return row ? Object.assign({}, row) : null;
    },
    async rotateFromPrev(prevHash, nextHash, nextExpiresAt, rotatedAt) {
      const row = [...rows.values()].find(item =>
        item.prevRefreshTokenHash === prevHash && !item.revokedAt);
      if (!row) return null;
      row.refreshTokenHash = nextHash;
      row.expiresAt = nextExpiresAt;
      row.lastSeenAt = rotatedAt;
      return Object.assign({}, row);
    },
    async revokeById(id, revokedAt, reason) {
      const row = rows.get(id);
      if (!row) return null;
      row.revokedAt = revokedAt;
      row.revokedReason = reason || "logout";
      return Object.assign({}, row);
    },
    async revokeByUser(userId, revokedAt) {
      let count = 0;
      for (const row of rows.values()) {
        if (row.userId === userId && !row.revokedAt) {
          row.revokedAt = revokedAt;
          count++;
        }
      }
      return count;
    },
  };
}

function createDeviceRepository() {
  const slots = [];
  const installations = [];
  const pairings = [];
  const deviceLimits = new Map();
  let sequence = 0;
  const copy = value => value ? Object.assign({}, value) : null;
  return {
    slots,
    installations,
    pairings,
    async getSlot(userId, slotType) {
      return copy(slots.find(row => row.userId === userId && row.slotType === slotType && row.status === "active"));
    },
    /* 2026-08-30 — SEATS, not one-per-type: claimSlot mirrors the PG
     * adapter's advisory-locked count against profiles.allowed_devices
     * (admin-adjustable; default 2). A reset seat of the type is revived
     * with generation incremented before a new row is inserted. */
    setAllowedDevices(userId, n) { deviceLimits.set(userId, n); },
    async claimSlot(row) {
      const limit = deviceLimits.has(row.userId) ? deviceLimits.get(row.userId) : 2;
      const active = slots.filter(item => item.userId === row.userId && item.status === "active");
      if (active.length >= limit) {
        const current = slots.find(item => item.userId === row.userId && item.slotType === row.slotType);
        return { claimed: false, slot: current ? copy(current) : null };
      }
      const resettable = slots.find(item => item.userId === row.userId &&
        item.slotType === row.slotType && item.status === "reset");
      if (resettable) {
        Object.assign(resettable, row, {
          status: "active", generation: resettable.generation + 1, resetAt: null,
        });
        return { claimed: true, slot: copy(resettable) };
      }
      const saved = Object.assign({ id: "slot-" + (++sequence), status: "active", generation: 1 }, row);
      slots.push(saved);
      return { claimed: true, slot: copy(saved) };
    },
    async findFreeSlot(userId, slotType, clientType) {
      const free = slots.find(slot => slot.userId === userId && slot.slotType === slotType &&
        slot.status === "active" &&
        !installations.some(i => i.slotId === slot.id && i.clientType === clientType && !i.revokedAt));
      return free ? copy(free) : null;
    },
    async getInstallation(userId, clientType, installationId) {
      const installation = installations.find(row => row.userId === userId && row.clientType === clientType &&
        row.installationId === installationId && !row.revokedAt);
      if (!installation) return null;
      const slot = slots.find(row => row.id === installation.slotId);
      return copy(Object.assign({}, installation, { slotType: slot && slot.slotType }));
    },
    /* v6.48.0 — scoped to one account, like the repository it stands in for.
       A mock that still swept every account would keep proving the rule this
       release removed. */
    async findLiveInstallationByHash(installationId, userId) {
      const live = installations.find(row => row.installationId === installationId &&
        !row.revokedAt && (!userId || row.userId === userId));
      if (!live) return null;
      const slot = slots.find(row => row.id === live.slotId);
      return copy(Object.assign({}, live, { slotType: slot && slot.slotType }));
    },
    async revokeInstallation(id, revokedAt) {
      const row = installations.find(item => item.id === id && !item.revokedAt);
      if (!row) return 0;
      row.revokedAt = revokedAt;
      return 1;
    },
    async insertInstallation(row) {
      /* mirror device_installations_active_client_uniq — the partial unique
         index on (slot_id, client_type) where revoked_at is null. Without
         this the mock silently accepts the second panel the real database
         refuses, and the one-active-panel pin above proves nothing. */
      if (installations.some(existing => existing.slotId === row.slotId &&
          existing.clientType === row.clientType && !existing.revokedAt)) {
        const err = new Error("duplicate active installation for slot/client");
        err.code = "23505";
        throw err;
      }
      /* v6.48.0 — AND MIRROR device_installations_active_user_hash_uniq, the
         OTHER partial unique index: unique (user_id, client_type,
         installation_hash) where revoked_at is null. It was global until this
         release — one browser, one account, everywhere — and schema.sql says
         why that was the wrong shape. What the mock must still refuse is the
         SAME account registering the SAME browser on the SAME client twice.

         v6.44.0 — leaving this index out of the mock entirely is why nothing
         caught the defect the owner photographed on 2026-09-09: the mock
         accepted what the real database raised 23505 for, registerWebDevice
         had no catch, and the student was shown the SQLSTATE. A mock more
         permissive than the schema proves nothing. */
      if (installations.some(existing => existing.installationId === row.installationId &&
          existing.userId === row.userId && existing.clientType === row.clientType &&
          !existing.revokedAt)) {
        const err = new Error("duplicate active installation hash");
        err.code = "23505";
        throw err;
      }
      const saved = Object.assign({ id: "installation-" + (++sequence), revokedAt: null }, row);
      installations.push(saved);
      return copy(saved);
    },
    async insertPairing(row) {
      const saved = Object.assign({ id: "pairing-" + (++sequence), consumedAt: null }, row);
      pairings.push(saved);
      return copy(saved);
    },
    async findPairingByCodeHash(codeHash) {
      return copy(pairings.find(row => row.codeHash === codeHash));
    },
    async consumePairing(codeHash, consumedAt) {
      const row = pairings.find(item => item.codeHash === codeHash && !item.consumedAt);
      if (!row) return null;
      row.consumedAt = consumedAt;
      return copy(row);
    },
    async resetSlot(userId, slotType, resetAt) {
      const affected = slots.filter(row => row.userId === userId && row.slotType === slotType && row.status === "active");
      for (const slot of affected) {
        slot.status = "reset";
        slot.resetAt = resetAt;
        for (const installation of installations) {
          if (installation.slotId === slot.id && !installation.revokedAt) installation.revokedAt = resetAt;
        }
        for (const pairing of pairings) {
          if (pairing.slotId === slot.id && !pairing.consumedAt) pairing.consumedAt = resetAt;
        }
      }
      return affected.length;
    },
  };
}

async function verifyAuthorization() {
  const contract = loadContract("server/lib/authorization.js", ["evaluateAuthorization", "REASONS"]);
  if (!contract) return;

  const expectedReasons = [
    "pending", "not_active", "suspended", "banned", "rejected",
    "license_missing", "license_expired", "web_disabled", "download_disabled",
    "panel_disabled", "device_required", "device_mismatch", "update_required",
    "version_blocked", "allowed",
  ];
  const publishedReasons = reasonValues(contract.REASONS);
  report("authorization publishes every stable machine-readable reason",
    expectedReasons.every(reason => publishedReasons.includes(reason)),
    { expected: expectedReasons, published: publishedReasons });

  const base = {
    now: "2026-08-26T00:00:00.000Z",
    accountStatus: "active",
    license: {
      status: "active",
      startsAt: "2026-08-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    },
    permissions: {
      webAppEnabled: true,
      ccxDownloadEnabled: true,
      panelEnabled: true,
    },
    capability: "web",
    device: { registered: true, matches: true, slotType: "computer" },
    panelVersion: {
      installedVersion: "6.24.0",
      minimumSupportedVersion: "6.24.0",
      latestVersion: "6.24.0",
      enabled: true,
    },
  };

  const withPatch = patch => Object.assign(clone(base), patch);
  const matrix = [
    ["pending account", "pending", withPatch({ accountStatus: "pending" })],
    ["inactive account", "not_active", withPatch({ accountStatus: "inactive" })],
    ["suspended account", "suspended", withPatch({ accountStatus: "suspended" })],
    ["banned account", "banned", withPatch({ accountStatus: "banned" })],
    ["rejected account", "rejected", withPatch({ accountStatus: "rejected" })],
    ["missing license", "license_missing", withPatch({ license: null })],
    ["expired license", "license_expired", withPatch({ license: {
      status: "active", startsAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-08-25T23:59:59.000Z",
    } })],
    ["web permission disabled", "web_disabled", withPatch({
      capability: "web", permissions: { webAppEnabled: false, ccxDownloadEnabled: true, panelEnabled: true },
    })],
    ["download permission disabled", "download_disabled", withPatch({
      capability: "download", permissions: { webAppEnabled: true, ccxDownloadEnabled: false, panelEnabled: true },
    })],
    ["panel permission disabled", "panel_disabled", withPatch({
      capability: "panel", permissions: { webAppEnabled: true, ccxDownloadEnabled: true, panelEnabled: false },
    })],
    ["missing registered device", "device_required", withPatch({ capability: "panel", device: null })],
    ["different registered computer", "device_mismatch", withPatch({
      capability: "panel", device: { registered: true, matches: false, slotType: "computer" },
    })],
    ["panel older than minimum", "update_required", withPatch({ capability: "panel", panelVersion: {
      installedVersion: "6.23.9", minimumSupportedVersion: "6.24.0", latestVersion: "6.24.0", enabled: true,
    } })],
    ["explicitly blocked panel version", "version_blocked", withPatch({ capability: "panel", panelVersion: {
      installedVersion: "6.24.0", minimumSupportedVersion: "6.24.0", latestVersion: "6.24.0", enabled: false,
    } })],
    ["fully entitled account", "allowed", withPatch({ capability: "panel" })],
  ];

  for (const [name, reason, input] of matrix) {
    let output;
    let error = null;
    try { output = await contract.evaluateAuthorization(input); }
    catch (caught) { error = String(caught && caught.message || caught); }
    const shouldAllow = reason === "allowed";
    report("authorization matrix: " + name,
      !error && output && output.allowed === shouldAllow && output.reason === reason,
      { expected: { allowed: shouldAllow, reason }, output, error });
  }
}

async function verifySessions() {
  const contract = loadContract("server/lib/session.js", ["createSessionStore", "hashRefreshToken"]);
  if (!contract) return;

  const hashA = contract.hashRefreshToken("refresh-token-A");
  const hashA2 = contract.hashRefreshToken("refresh-token-A");
  const hashB = contract.hashRefreshToken("refresh-token-B");
  report("refresh tokens use a deterministic one-way SHA-256-size digest",
    typeof hashA === "string" && /^[a-f0-9]{64}$/i.test(hashA) &&
      hashA === hashA2 && hashA !== hashB && hashA !== "refresh-token-A",
    { hashLength: typeof hashA === "string" ? hashA.length : null, deterministic: hashA === hashA2 });

  const repository = createSessionRepository();
  let nowMs = Date.parse("2026-08-26T00:00:00.000Z");
  let tokenSequence = 0;
  const store = contract.createSessionStore({
    repository,
    clock: () => new Date(nowMs),
    randomToken: () => "refresh-secret-" + (++tokenSequence),
    refreshTtlSeconds: 3600,
  });
  const userId = "11111111-1111-4111-8111-111111111111";

  const issued = await store.issue({ userId, clientType: "web", deviceInstallationId: "web-pc-A" });
  const stored = repository.rows.get(issued && issued.sessionId);
  report("issuing a session returns the refresh secret while persisting only its hash",
    issued && issued.sessionId && issued.refreshToken && stored &&
      stored.refreshTokenHash === contract.hashRefreshToken(issued.refreshToken) &&
      !JSON.stringify(stored).includes(issued.refreshToken),
    { issuedKeys: issued ? Object.keys(issued) : null, stored });

  let validation = await store.validate({ sessionId: issued.sessionId, userId });
  report("an unrevoked, unexpired session validates", validation && validation.active === true,
    { validation });

  /* Change persistence behind the store between calls. A cache-only validator
   * fails here, which proves force-logout/suspend can be observed live. */
  await repository.update(issued.sessionId, { revokedAt: new Date(nowMs).toISOString() });
  validation = await store.validate({ sessionId: issued.sessionId, userId });
  report("access validation re-reads live revocation state on every check",
    validation && validation.active === false && validation.reason === "session_revoked",
    { validation });

  /* 2026-08-30 owner instruction: students must never be asked to sign in
     again because Photoshop quit before the rotated token reached disk. The
     immediately-PREVIOUS token therefore re-joins the chain once more for
     web/panel sessions (a deliberate trade: the panel lease, the device
     slot and account status stay the real gates), while anything two or
     more steps back stays dead — and admin sessions stay strict. */
  const rotating = await store.issue({ userId, clientType: "panel", deviceInstallationId: "panel-pc-A" });
  const rotated = await store.rotate({ refreshToken: rotating.refreshToken });
  const rejoined = await store.rotate({ refreshToken: rotating.refreshToken });
  report("refresh rotation issues a new token, and the crash-lost previous token re-joins the chain",
    rotated && rotated.refreshToken && rotated.refreshToken !== rotating.refreshToken &&
      rejoined && rejoined.refreshToken && rejoined.sessionId === rotated.sessionId &&
      rejoined.refreshToken !== rotated.refreshToken,
    { rotated: rotated && { sessionId: rotated.sessionId }, rejoined: rejoined && { sessionId: rejoined.sessionId } });
  /* the middle token was superseded by the re-join and never parked as prev:
     it is the "two steps back" credential and must stay dead */
  const supersededReason = await denied(() => store.rotate({ refreshToken: rotated.refreshToken }));
  report("a superseded middle token (two steps back) stays dead",
    supersededReason === "invalid_refresh_token", { supersededReason });
  /* repeated crash-loss keeps working: the parked previous token can re-join
     again — the student's stored credential never strands them */
  const rejoinedAgain = await store.rotate({ refreshToken: rotating.refreshToken });
  report("the parked previous token survives repeated lost replies",
    rejoinedAgain && rejoinedAgain.sessionId === rotated.sessionId &&
      rejoinedAgain.refreshToken !== rejoined.refreshToken,
    { rejoinedAgain: rejoinedAgain && { sessionId: rejoinedAgain.sessionId } });

  const adminRotating = await store.issue({ userId, clientType: "admin" });
  const adminRotated = await store.rotate({ refreshToken: adminRotating.refreshToken });
  const adminReplayReason = await denied(() => store.rotate({ refreshToken: adminRotating.refreshToken }));
  report("admin sessions stay strict single-token — a spent admin token is refused",
    adminRotated && adminRotated.refreshToken && adminReplayReason === "invalid_refresh_token",
    { adminReplayReason });

  const idleStore = contract.createSessionStore({
    repository,
    clock: () => new Date(nowMs),
    randomToken: () => "idle-refresh-secret-" + (++tokenSequence),
    refreshTtlSeconds: 3600,
    adminIdleSeconds: 300,
  });
  const idleAdmin = await idleStore.issue({ userId, clientType: "admin" });
  const ordinaryWeb = await idleStore.issue({ userId, clientType: "web" });
  nowMs += 301000;
  const idleAdminReason = await denied(() => idleStore.rotate({ refreshToken: idleAdmin.refreshToken }));
  const ordinaryWebRefresh = await idleStore.rotate({ refreshToken: ordinaryWeb.refreshToken });
  const idleAdminRow = repository.rows.get(idleAdmin.sessionId);
  report("refresh cannot revive an idle admin session while an ordinary session still rotates",
    idleAdminReason === "admin_session_timeout" &&
      idleAdminRow && idleAdminRow.revokedReason === "admin_idle_timeout" &&
      ordinaryWebRefresh && ordinaryWebRefresh.refreshToken,
    { idleAdminReason, idleAdminRow, ordinaryWebRefresh });

  const second = await store.issue({ userId, clientType: "web", deviceInstallationId: "web-phone-A" });
  await store.revokeUser({ userId });
  const afterForceLogout = await Promise.all([
    store.validate({ sessionId: rotating.sessionId, userId }),
    store.validate({ sessionId: second.sessionId, userId }),
  ]);
  report("force logout revokes every live web and panel session for the account",
    afterForceLogout.every(result => result && result.active === false && result.reason === "session_revoked"),
    { afterForceLogout });
}

async function verifyDevices() {
  const contract = loadContract("server/lib/devices.js", ["createDeviceRegistry"]);
  if (!contract) return;

  const repository = createDeviceRepository();
  let nowMs = Date.parse("2026-08-26T00:00:00.000Z");
  let randomSequence = 0;
  const registry = contract.createDeviceRegistry({
    repository,
    clock: () => new Date(nowMs),
    randomToken: () => "pairing-secret-" + (++randomSequence),
    pairingSecret: "test-only-pairing-hmac-secret",
    pairingTtlSeconds: 300,
  });
  const userId = "22222222-2222-4222-8222-222222222222";

  /* 2026-08-30 owner instruction: device count is the ADMIN's dial
     (profiles.allowed_devices, default 2), enforced as fungible SEATS. */
  const phoneA = await registry.registerWebDevice({
    userId, deviceType: "phone", installationId: "phone-A", label: "Student phone",
  });
  const phoneB = await registry.registerWebDevice({
    userId, deviceType: "phone", installationId: "phone-B", label: "Second phone",
  });
  report("seats are fungible — the default two seats can both be phones",
    phoneA && phoneA.allowed === true && phoneA.slotType === "phone" &&
      phoneB && phoneB.allowed === true && phoneB.slotId !== phoneA.slotId,
    { phoneA, phoneB });

  const copiedPhoneIdReason = await denied(() => registry.registerWebDevice({
    userId, deviceType: "computer", installationId: "phone-A", label: "Desktop claiming phone id",
  }));
  report("an existing installation id cannot cross from its authoritative phone slot into computer",
    copiedPhoneIdReason === "device_type_mismatch", { copiedPhoneIdReason });

  const overLimitReason = await denied(() => registry.registerWebDevice({
    userId, deviceType: "computer", installationId: "computer-web-A", label: "Student PC",
  }));
  report("the third device is refused while the admin dial says two",
    overLimitReason === "computer_slot_occupied", { overLimitReason });

  repository.setAllowedDevices(userId, 3);
  const computerA = await registry.registerWebDevice({
    userId, deviceType: "computer", installationId: "computer-web-A", label: "Student PC",
  });
  report("raising allowed_devices to three admits the computer",
    computerA && computerA.allowed === true && computerA.slotType === "computer",
    { computerA });

  /* 2026-08-30 owner instruction: the pairing-code step is gone. The panel
     registers itself directly; the control that actually limits sharing is
     the ONE-active-panel-per-slot rule, so that is what this pins now. */
  const panelA = await registry.registerPanelDevice({
    userId, installationId: "panel-A", label: "Photoshop",
  });
  const secondPanelReason = await denied(() => registry.registerPanelDevice({
    userId, installationId: "panel-B", label: "Copied Photoshop",
  }));
  report("direct panel registration joins the existing computer slot, and a second panel is refused",
    panelA && panelA.allowed === true && panelA.slotType === "computer" &&
      panelA.slotId === computerA.slotId && secondPanelReason === "panel_slot_occupied",
    { computerA, panelA, secondPanelReason });

  const retired = ["createPanelPairing", "pairPanel"].filter(fn => typeof registry[fn] === "function");
  report("the retired pairing-code surface is gone from the registry",
    retired.length === 0, { retired });

  repository.setAllowedDevices(userId, 4);
  const panelB = await registry.registerPanelDevice({
    userId, installationId: "panel-B", label: "Second studio machine",
  });
  report("the owner scenario end-to-end: a fourth seat lets a second machine's panel in",
    panelB && panelB.allowed === true && panelB.slotType === "computer" &&
      panelB.slotId !== panelA.slotId,
    { panelB });

  const validPanel = await registry.validate({ userId, clientType: "panel", installationId: "panel-A" });
  const copiedPanelReason = await denied(() => registry.validate({
    userId, clientType: "panel", installationId: "panel-not-paired",
  }));
  report("only the paired panel installation validates for the shared computer slot",
    validPanel && validPanel.allowed === true && copiedPanelReason === "device_mismatch",
    { validPanel, copiedPanelReason });

  const studentResetReason = await denied(() => registry.resetSlot({
    actorRole: "student", userId, slotType: "computer",
  }));
  const adminReset = await registry.resetSlot({ actorRole: "admin", userId, slotType: "computer" });
  const oldPanelReason = await denied(() => registry.validate({
    userId, clientType: "panel", installationId: "panel-A",
  }));
  const computerAfterReset = await registry.registerWebDevice({
    userId, deviceType: "computer", installationId: "computer-web-B", label: "Replacement PC",
  });
  report("only an admin reset releases the computer slot and revokes its paired panel",
    studentResetReason === "admin_required" && adminReset && adminReset.allowed === true &&
      oldPanelReason === "device_mismatch" && computerAfterReset && computerAfterReset.allowed === true,
    { studentResetReason, adminReset, oldPanelReason, computerAfterReset });

  /* v6.48.0 — ONE MACHINE, TWO ACCOUNTS, AND THAT IS ALLOWED NOW.

     Until this release device_installations_active_hash_uniq was global —
     `unique (installation_hash) where revoked_at is null` across every account
     and both clients — so a second student signing into a browser the first
     still held was refused. It was written as an anti-sharing rule and was not
     one: sharing is ONE ACCOUNT ON MANY DEVICES, which allowed_devices counts,
     while this refused MANY ACCOUNTS ON ONE BROWSER, where each account pays
     for and spends its own seat. It blocked the borrowed laptop, the family
     computer and the shop machine, and anyone it inconvenienced opened a
     second browser and walked around it in ten seconds (schema.sql carries the
     whole argument; the owner asked for the trade on 2026-09-09).

     So the index is per account now, and these two prove the new contract:
     the second account registers, and neither account's seats move because of
     the other.

     v6.44.0 — what must never come back is the SQLSTATE. registerWebDevice had
     no catch around its insert, the violation travelled out through fail(), and
     the owner photographed his own laptop reading

         Server က ငြင်းလိုက်တဲ့ အကြောင်းရင်း: 23505

     — unique_violation, printed to a human as a reason. The catch stays. */
  /* a genuinely different account — the first draft of this line reused the
     userId above, so "the other student" was the same student and the checks
     below measured nothing. */
  const otherUser = "33333333-3333-4333-8333-333333333333";
  repository.setAllowedDevices(otherUser, 4);
  const seatsBeforeShare = repository.slots.filter(s => s.userId === userId && s.status === "active").length;
  const sharedWeb = await registry.registerWebDevice({
    userId: otherUser, deviceType: "computer", installationId: "computer-web-B", label: "Same laptop",
  });
  const firstStillHolds = await registry.validate({
    userId, clientType: "web", installationId: "computer-web-B",
  });
  report("a second account registers the very browser the first still holds — and the first keeps it",
    sharedWeb && sharedWeb.allowed === true && firstStillHolds && firstStillHolds.allowed === true &&
    repository.slots.filter(s => s.userId === userId && s.status === "active").length === seatsBeforeShare,
    { sharedWeb, firstStillHolds, seatsBeforeShare,
      seatsAfter: repository.slots.filter(s => s.userId === userId && s.status === "active").length });

  /* the panel path carried the same global rule and loses it the same way: a
     panel installation the FIRST account still holds live no longer refuses
     the second. Both join their OWN computer seat, so neither account's count
     moves because of the other. */
  const firstPanel = await registry.registerPanelDevice({
    userId, installationId: "panel-shared-laptop", label: "Same laptop",
  });
  const sharedPanel = await registry.registerPanelDevice({
    userId: otherUser, installationId: "panel-shared-laptop", label: "Same laptop",
  });
  report("a panel installation the first account still holds no longer refuses the second — each on its own seat",
    firstPanel && firstPanel.allowed === true && sharedPanel && sharedPanel.allowed === true &&
    sharedPanel.slotId !== firstPanel.slotId &&
    repository.slots.filter(s => s.userId === otherUser && s.status === "active").length === 1,
    { firstPanel, sharedPanel,
      otherSeats: repository.slots.filter(s => s.userId === otherUser && s.status === "active").length });

  /* and the refusal that is NOT about other people stays exactly where it was:
     the web app and the panel keep separate installation ids, so one account
     presenting its own WEB id on the panel is still a named conflict. */
  const crossedClient = await denied(() => registry.registerPanelDevice({
    userId: otherUser, installationId: "computer-web-B", label: "Same laptop",
  }));
  report("a web installation id presented on the panel is still installation_id_conflict, within the account",
    crossedClient === "installation_id_conflict", { crossedClient });

  /* the refusal that DOES remain: the same account, the same browser, the same
     client, twice over. The index still forbids it — and because the collision
     can only be this account's own row for this very device, the second call
     reads back what the first wrote instead of refusing a student their own
     machine. */
  const sameTwice = await registry.registerWebDevice({
    userId: otherUser, deviceType: "computer", installationId: "computer-web-B", label: "Same laptop again",
  });
  report("the same account registering the same browser twice is answered from the row it already has",
    sameTwice && sameTwice.allowed === true && sameTwice.slotId === sharedWeb.slotId,
    { sameTwice, first: sharedWeb && sharedWeb.slotId });

  /* the same student, the same browser, on a seat that is no longer active:
     their own row, so they get it back rather than meeting a wall only an
     administrator can see. */
  await registry.resetSlot({ actorRole: "admin", userId, slotType: "phone" });
  const phoneAgain = await registry.registerWebDevice({
    userId, deviceType: "phone", installationId: "phone-web-A", label: "Same phone",
  });
  report("the same student on the same device reclaims it after a reset",
    phoneAgain && phoneAgain.allowed === true, { phoneAgain });

  /* and the second fence: even when some future constraint fires somewhere
     this file does not reach, fail() must not publish its SQLSTATE as the
     `error` a client reads and, since 6.42.0, shows to a human. 42501 and
     P0001 keep their codes on purpose — both are read by name on the client. */
  const indexSrc = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
  const nameMap = /const PG_ERROR_NAME = \{([\s\S]*?)\};/.exec(indexSrc);
  const usesMap = /error: err && err\.code \? \(PG_ERROR_NAME\[err\.code\] \|\| err\.code\)/.test(indexSrc);
  report("fail() never publishes a bare SQLSTATE as the error a student is shown",
    !!nameMap && usesMap && /"23505": "conflict"/.test(nameMap[1]) &&
      !/"42501"/.test(nameMap[1]) && !/"P0001"/.test(nameMap[1]),
    { mapped: !!nameMap, usesMap, body: nameMap && nameMap[1].replace(/\s+/g, " ").trim() });
}

(async () => {
  await verifyAuthorization();
  await verifySessions();
  await verifyDevices();
})().catch(error => {
  report("backend contract runner completes", false, { error: error && error.stack || String(error) });
}).finally(() => {
  console.log("\n" + (failures ? "FAIL (" + failures + ")" : "PASS (unified backend contract)"));
  process.exit(failures ? 1 : 0);
});
