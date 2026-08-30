"use strict";

const crypto = require("crypto");

const sha256 = value => crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
const hmac = (secret, value) => crypto.createHmac("sha256", secret).update(String(value || ""), "utf8").digest("hex");

function createDeviceRegistry(options) {
  const repository = options.repository;
  const clock = options.clock || (() => new Date());
  const randomToken = options.randomToken || (() => crypto.randomBytes(18).toString("base64url"));
  const pairingSecret = String(options.pairingSecret || "");
  if (pairingSecret.length < 16) throw new Error("pairingSecret must contain at least 16 characters");
  const pairingTtlSeconds = Math.min(600, Math.max(60, Number(options.pairingTtlSeconds || 300)));
  const normalizeInstallation = options.hashInstallationId || (value => String(value || ""));
  const denial = reason => ({ allowed: false, reason });

  async function registerWebDevice(input) {
    if (!input || !["phone", "computer"].includes(input.deviceType)) return denial("invalid_device_type");
    const installationId = normalizeInstallation(input.installationId);
    if (!installationId) return denial("invalid_installation_id");
    const existing = await repository.getInstallation(input.userId, "web", installationId);
    if (existing) {
      if (existing.slotType!==input.deviceType) return denial("device_type_mismatch");
      return { allowed: true, reason: "allowed", slotId: existing.slotId, slotType: existing.slotType };
    }

    /* seat model: sit on an existing seat with a free web place first, and
       only then ask claimSlot for a NEW seat (which enforces the
       admin-set allowed_devices count). */
    let slot = typeof repository.findFreeSlot === "function"
      ? await repository.findFreeSlot(input.userId, input.deviceType, "web") : null;
    if (!slot) {
      const claim = await repository.claimSlot({
        userId: input.userId,
        slotType: input.deviceType,
        label: input.label || null,
        createdAt: clock().toISOString(),
        updatedAt: clock().toISOString(),
      });
      if (!claim || claim.claimed !== true) return denial(input.deviceType + "_slot_occupied");
      slot = claim.slot;
    }
    const installation = await repository.insertInstallation({
      userId: input.userId,
      slotId: slot.id,
      clientType: "web",
      installationId,
      label: input.label || null,
      createdAt: clock().toISOString(),
      lastSeenAt: clock().toISOString(),
    });
    return { allowed: true, reason: "allowed", slotId: slot.id, slotType: slot.slotType, installationId: installation.id };
  }

  /* 2026-08-30 owner instruction: the pairing-code step is gone. Students
     found the generate-on-website / type-within-5-minutes dance too hard
     (real field report the same day). What actually limited account
     sharing was never the code — it is the partial unique index
     device_installations_active_client_uniq: ONE active panel
     installation per computer slot. That stays. The panel now registers
     itself directly on sign-in: it joins the existing computer slot (or
     claims one if the account has none yet), and a second machine gets
     panel_slot_occupied until an admin uses Reset Computer. */
  async function registerPanelDevice(input) {
    const installationId = normalizeInstallation(input.installationId);
    if (!installationId) return denial("invalid_installation_id");
    let slot = typeof repository.findFreeSlot === "function"
      ? await repository.findFreeSlot(input.userId, "computer", "panel") : null;
    if (!slot) {
      const claim = await repository.claimSlot({
        userId: input.userId,
        slotType: "computer",
        label: input.label || null,
        createdAt: clock().toISOString(),
        updatedAt: clock().toISOString(),
      });
      if (!claim || claim.claimed !== true) return denial("panel_slot_occupied");
      slot = claim.slot;
    }
    try {
      await repository.insertInstallation({
        userId: input.userId,
        slotId: slot.id,
        clientType: "panel",
        installationId,
        label: input.label || null,
        createdAt: clock().toISOString(),
        lastSeenAt: clock().toISOString(),
      });
    } catch (error) {
      if (error && error.code === "23505") return denial("panel_slot_occupied");
      throw error;
    }
    return { allowed: true, reason: "allowed", slotId: slot.id, slotType: "computer" };
  }

  async function validate(input) {
    const installationId = normalizeInstallation(input.installationId);
    const installation = await repository.getInstallation(input.userId, input.clientType, installationId);
    if (!installation) return denial("device_mismatch");
    return { allowed: true, reason: "allowed", slotId: installation.slotId,
      slotType: input.clientType === "panel" ? "computer" : input.deviceType || null };
  }

  async function resetSlot(input) {
    if (input.actorRole !== "admin") return denial("admin_required");
    const count = await repository.resetSlot(input.userId, input.slotType, clock().toISOString());
    return { allowed: true, reason: "allowed", resetCount: count };
  }

  return { registerWebDevice, registerPanelDevice, validate, resetSlot };
}

function mapSlot(row) {
  return row && {
    id: row.id, userId: row.user_id, slotType: row.slot_type, status: row.status,
    generation: row.generation, label: row.label, createdAt: row.created_at,
    updatedAt: row.updated_at, resetAt: row.reset_at,
  };
}

function mapInstallation(row) {
  return row && {
    id: row.id, userId: row.user_id, slotId: row.slot_id, clientType: row.client_type,
    installationId: row.installation_hash, label: row.label, createdAt: row.created_at,
    lastSeenAt: row.last_seen_at, revokedAt: row.revoked_at, slotType: row.slot_type,
  };
}

function createPgDeviceRepository(client) {
  return {
    async getSlot(userId, slotType) {
      const { rows } = await client.query(
        "select * from public.device_slots where user_id=$1 and slot_type=$2 and status='active'",
        [userId,slotType]);
      return mapSlot(rows[0]);
    },
    /* 2026-08-30 — slots are SEATS counted against profiles.allowed_devices
       (admin-adjustable), no longer one-per-type. The per-user advisory
       lock serializes concurrent claims inside the asService transaction
       so two racing enrolls cannot both squeeze past the count. A reset
       seat of the same type is reactivated before a new one is created. */
    async claimSlot(row) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [String(row.userId)]);
      const limitQ = await client.query(
        "select coalesce(allowed_devices,2) as n from public.profiles where id=$1", [row.userId]);
      const limit = limitQ.rows.length ? Number(limitQ.rows[0].n) : 2;
      const activeQ = await client.query(
        "select count(*)::int as n from public.device_slots where user_id=$1 and status='active'",
        [row.userId]);
      if (Number(activeQ.rows[0].n) >= limit) {
        const current = await client.query(
          "select * from public.device_slots where user_id=$1 and slot_type=$2 order by created_at limit 1",
          [row.userId,row.slotType]);
        return { claimed: false, slot: mapSlot(current.rows[0]) };
      }
      const revived = await client.query(
        `update public.device_slots
            set status='active',generation=generation+1,label=$3,updated_at=$4,reset_at=null
          where id = (select id from public.device_slots
                       where user_id=$1 and slot_type=$2 and status='reset'
                       order by created_at limit 1)
          returning *`,
        [row.userId,row.slotType,row.label,row.updatedAt]);
      if (revived.rows[0]) return { claimed: true, slot: mapSlot(revived.rows[0]) };
      const { rows } = await client.query(
        `insert into public.device_slots (user_id,slot_type,status,generation,label,created_at,updated_at)
         values ($1,$2,'active',1,$3,$4,$5) returning *`,
        [row.userId,row.slotType,row.label,row.createdAt,row.updatedAt]);
      return { claimed: true, slot: mapSlot(rows[0]) };
    },
    /* an active seat of this type with no live installation of this client
       kind — where a new web browser or panel install sits down first */
    async findFreeSlot(userId, slotType, clientType) {
      const { rows } = await client.query(
        `select s.* from public.device_slots s
          where s.user_id=$1 and s.slot_type=$2 and s.status='active'
            and not exists (select 1 from public.device_installations i
                             where i.slot_id=s.id and i.client_type=$3 and i.revoked_at is null)
          order by s.created_at limit 1`,
        [userId,slotType,clientType]);
      return mapSlot(rows[0]);
    },
    async getInstallation(userId, clientType, installationHash) {
      const { rows } = await client.query(
        `select i.*,s.user_id,s.slot_type from public.device_installations i
          join public.device_slots s on s.id=i.slot_id
         where s.user_id=$1 and s.status='active' and i.client_type=$2
           and i.installation_hash=$3 and i.revoked_at is null`,
        [userId,clientType,installationHash]);
      return mapInstallation(rows[0]);
    },
    async insertInstallation(row) {
      const { rows } = await client.query(
        `insert into public.device_installations
          (slot_id,client_type,installation_hash,label,created_at,last_seen_at)
         values ($1,$2,$3,$4,$5,$6) returning *, $7::uuid as user_id`,
        [row.slotId,row.clientType,row.installationId,row.label,row.createdAt,row.lastSeenAt,row.userId]);
      return mapInstallation(rows[0]);
    },
    async insertPairing(row) {
      const { rows } = await client.query(
        `insert into public.device_pairing_codes
          (user_id,slot_id,code_hash,created_at,expires_at)
         values ($1,$2,$3,$4,$5) returning *`,
        [row.userId,row.slotId,row.codeHash,row.createdAt,row.expiresAt]);
      return rows[0];
    },
    async findPairingByCodeHash(codeHash) {
      const { rows } = await client.query(
        `select id,user_id as "userId",slot_id as "slotId",code_hash as "codeHash",
                created_at as "createdAt",expires_at as "expiresAt",consumed_at as "consumedAt"
           from public.device_pairing_codes where code_hash=$1`, [codeHash]);
      return rows[0] || null;
    },
    async consumePairing(codeHash, consumedAt) {
      const { rows } = await client.query(
        `update public.device_pairing_codes set consumed_at=$2
          where code_hash=$1 and consumed_at is null returning id,user_id as "userId",slot_id as "slotId"`,
        [codeHash,consumedAt]);
      return rows[0] || null;
    },
    async resetSlot(userId, slotType, resetAt) {
      const { rows } = await client.query(
        `update public.device_slots set status='reset',reset_at=$3,updated_at=$3
          where user_id=$1 and slot_type=$2 and status='active' returning id`,
        [userId,slotType,resetAt]);
      if (!rows.length) return 0;
      const ids = rows.map(row => row.id);
      await client.query(
        "update public.device_installations set revoked_at=$2 where slot_id=any($1::uuid[]) and revoked_at is null",
        [ids,resetAt]);
      await client.query(
        "update public.device_pairing_codes set consumed_at=$2 where slot_id=any($1::uuid[]) and consumed_at is null",
        [ids,resetAt]);
      return rows.length;
    },
  };
}

module.exports = { sha256, createDeviceRegistry, createPgDeviceRepository };
