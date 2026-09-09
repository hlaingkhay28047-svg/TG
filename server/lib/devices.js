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

  /* v6.47.0 — ONE PLACE WHERE A REGISTRATION TAKES A SEAT, AND ONE PLACE WHERE
     IT GIVES AN UNUSED ONE BACK.

     takeSeat remembers whether THIS call opened the seat. That single bit is
     the whole safety of releaseUnusedSeat: a seat findFreeSlot sat us on was
     already the account's and may carry the other client's installation — the
     one computer seat holds both the Web App and the Photoshop Panel — so it
     is never handed back here. Only a seat this call opened and could not
     fill is. */
  async function takeSeat(userId, slotType, clientType, label) {
    const free = typeof repository.findFreeSlot === "function"
      ? await repository.findFreeSlot(userId, slotType, clientType) : null;
    if (free) return { slot: free, claimed: false };
    const claim = await repository.claimSlot({
      userId, slotType, label: label || null,
      createdAt: clock().toISOString(), updatedAt: clock().toISOString(),
    });
    if (!claim || claim.claimed !== true) return { slot: null, claimed: false };
    return { slot: claim.slot, claimed: true };
  }
  async function releaseUnusedSeat(seat) {
    if (!seat || seat.claimed !== true || !seat.slot) return false;
    if (typeof repository.releaseEmptySlot !== "function") return false;
    /* the caller is already refusing this registration; a seat that cannot be
       handed back must not turn that refusal into a 500. Failing here leaves
       the account exactly where it stood before this release — and claimSlot's
       recycler picks the seat up at the next registration anyway. */
    try { return (await repository.releaseEmptySlot(seat.slot.id, clock().toISOString())) > 0; }
    catch (error) { return false; }
  }

  async function registerWebDevice(input) {
    if (!input || !["phone", "computer"].includes(input.deviceType)) return denial("invalid_device_type");
    const installationId = normalizeInstallation(input.installationId);
    if (!installationId) return denial("invalid_installation_id");
    const existing = await repository.getInstallation(input.userId, "web", installationId);
    if (existing) {
      if (existing.slotType!==input.deviceType) return denial("device_type_mismatch");
      return { allowed: true, reason: "allowed", slotId: existing.slotId, slotType: existing.slotType };
    }

    /* v6.47.0 — WHOSE MACHINE IS THIS? ASKED BEFORE A SEAT IS TAKEN FOR IT.

       The order used to be claim-then-check: a seat was taken out of the
       student's paid allowance, the machine was then found to belong to
       somebody else, and the refusal was returned — with the seat still
       claimed and nothing on it. Measured on a live database (2026-09-09):
       from a machine registered to another account, two refused attempts ate
       one of the owner's four seats and never gave it back, and only an
       administrator could see why "4 devices" had quietly become 3.

       Not one rule moved. Only the moment they are asked did, and a refusal
       now costs the student nothing.

       v6.44.0 — THE HASH INDEX IS GLOBAL, AND THIS IS WHERE IT BITES.

       device_installations_active_hash_uniq is
           unique (installation_hash) where revoked_at is null
       across the WHOLE table — not per account, not per client. getInstallation
       above searches by (user, active slot, client_type, hash), so it misses
       whenever the live row carrying this hash belongs to somebody else, and
       the insert below then violated the index. registerPanelDevice has caught
       that since 2026-08-30; this path never did, so the raw SQLSTATE travelled
       out through server/index.js fail(), which publishes err.code as the
       response's `error`, and the student was told the reason they could not
       register was "23505" (the owner's photograph, 2026-09-09).

       So ask first, and answer in words. The constraint stays exactly as it is
       — one machine registered to one account at a time is the anti-sharing
       rule the whole seat model rests on — but a student who runs into it now
       learns what happened and what to do about it. */
    const live = typeof repository.findLiveInstallationByHash === "function"
      ? await repository.findLiveInstallationByHash(installationId) : null;
    /* FAIL CLOSED ON THE OWNER OF THAT ROW. The first draft of this read
       `live.userId && live.userId !== input.userId`, so a row whose owner came
       back undefined fell past the refusal, past the client check, and into the
       revoke below — one account quietly revoking another's registration and
       taking the machine. Written this way an unknown owner is somebody else,
       which is the only safe reading of "I could not tell whose this is". */
    if (live && live.userId !== input.userId) return denial("device_registered_elsewhere");
    if (live && live.clientType !== "web") return denial("installation_id_conflict");
    if (live && typeof repository.revokeInstallation === "function") {
      /* this account's own row for this exact machine and client, left live on
         a seat that is no longer active — the same student coming back to the
         same browser. Reclaiming it is what they expect; refusing would strand
         them behind a row only an administrator could see. */
      await repository.revokeInstallation(live.id, clock().toISOString());
    }

    /* seat model: sit on an existing seat with a free web place first, and
       only then ask claimSlot for a NEW seat (which enforces the
       admin-set allowed_devices count). */
    const seat = await takeSeat(input.userId, input.deviceType, "web", input.label);
    if (!seat.slot) return denial(input.deviceType + "_slot_occupied");
    const slot = seat.slot;
    let installation;
    try {
      installation = await repository.insertInstallation({
        userId: input.userId,
        slotId: slot.id,
        clientType: "web",
        installationId,
        label: input.label || null,
        createdAt: clock().toISOString(),
        lastSeenAt: clock().toISOString(),
      });
    } catch (error) {
      /* the lookup above is not in the same transaction as the insert, so two
         browsers racing for one hash still land here. A denial, never a raw
         code — and never a seat left standing for a registration that failed. */
      await releaseUnusedSeat(seat);
      if (error && error.code === "23505") return denial("device_registered_elsewhere");
      throw error;
    }
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
    /* v6.47.0 — this machine, already registered to this account on this
       client, is not a new registration and must not be charged a seat for
       one. enrollDevice has asked validate() first since 2026-08-30, so the
       route never reached the claim; called directly, this function used to,
       and then failed the hash index on the way out — a refusal with a seat
       taken. It answers for itself now. */
    const already = await repository.getInstallation(input.userId, "panel", installationId);
    if (already) {
      return { allowed: true, reason: "allowed", slotId: already.slotId, slotType: "computer" };
    }
    /* v6.47.0 — and the ownership question comes before the seat here too;
       registerWebDevice above carries the full account of why. */
    /* v6.44.0 — the same global hash index reaches this path too, and until now
       every 23505 here was reported as panel_slot_occupied. That is the right
       answer for the index this comment block names (one active panel per
       computer seat) and the wrong one for the hash index: when ANOTHER account
       holds this machine, the student's own seats may all be free, and being
       told the seat is occupied sends them to an admin who will find nothing. */
    const live = typeof repository.findLiveInstallationByHash === "function"
      ? await repository.findLiveInstallationByHash(installationId) : null;
    if (live && live.userId !== input.userId) return denial("device_registered_elsewhere");
    if (live && live.clientType !== "panel") return denial("installation_id_conflict");
    const seat = await takeSeat(input.userId, "computer", "panel", input.label);
    if (!seat.slot) return denial("panel_slot_occupied");
    try {
      await repository.insertInstallation({
        userId: input.userId,
        slotId: seat.slot.id,
        clientType: "panel",
        installationId,
        label: input.label || null,
        createdAt: clock().toISOString(),
        lastSeenAt: clock().toISOString(),
      });
    } catch (error) {
      await releaseUnusedSeat(seat);
      if (error && error.code === "23505") return denial("panel_slot_occupied");
      throw error;
    }
    return { allowed: true, reason: "allowed", slotId: seat.slot.id, slotType: "computer" };
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
        /* v6.47.0 — AT THE CEILING, LOOK FOR A SEAT WITH NOTHING ON IT.
           An account reaches its limit holding seats that carry no live
           installation at all: the leak this release closes made them, a
           machine that was wiped or sold leaves one behind, and an
           administrator's Reset of the OTHER kind can leave the account
           full of a type the student no longer uses. Refusing while such a
           seat sits there tells a student who paid for four devices that
           they have none — and only an administrator could tell them why.

           Reusing it changes no count: the seat was already active and
           already counted against allowed_devices. It only moves the seat to
           where the student is standing. A seat with ANY live installation on
           it, of either client, is never touched. */
        const recycled = await client.query(
          `update public.device_slots
              set slot_type=$2,generation=generation+1,label=$3,updated_at=$4,reset_at=null
            where id = (select s.id from public.device_slots s
                         where s.user_id=$1 and s.status='active'
                           and not exists (select 1 from public.device_installations i
                                            where i.slot_id=s.id and i.revoked_at is null)
                         order by s.created_at limit 1)
            returning *`,
          [row.userId,row.slotType,row.label,row.updatedAt]);
        if (recycled.rows[0]) return { claimed: true, slot: mapSlot(recycled.rows[0]) };
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
    /* v6.44.0 — the live owner of an installation hash, across every account
       and both clients. device_installations_active_hash_uniq makes at most one
       such row exist, and knowing whose it is turns a constraint violation into
       a sentence. */
    async findLiveInstallationByHash(installationHash) {
      const { rows } = await client.query(
        `select i.*,s.user_id,s.slot_type from public.device_installations i
          join public.device_slots s on s.id=i.slot_id
         where i.installation_hash=$1 and i.revoked_at is null limit 1`,
        [installationHash]);
      return mapInstallation(rows[0]);
    },
    /* v6.47.0 — hand back a seat that has nothing live on it. Guarded rather
       than trusted: the seat must still be active AND still be empty, so a
       browser that sat down on it through findFreeSlot in the moment between
       the failed insert and this update keeps it. 'reset' rather than deleted,
       so claimSlot revives the same row and the seat keeps its history and its
       generation counter. */
    async releaseEmptySlot(slotId, releasedAt) {
      const { rowCount } = await client.query(
        `update public.device_slots set status='reset',reset_at=$2,updated_at=$2
          where id=$1 and status='active'
            and not exists (select 1 from public.device_installations i
                             where i.slot_id=$1 and i.revoked_at is null)`,
        [slotId,releasedAt]);
      return rowCount;
    },
    async revokeInstallation(id, revokedAt) {
      const { rowCount } = await client.query(
        "update public.device_installations set revoked_at=$2 where id=$1 and revoked_at is null",
        [id,revokedAt]);
      return rowCount;
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

/* v6.47.0 — AND OF THE PHONE.
   6.35.0 left the Phone with the administrator on the reasoning below: the
   Phone is not what blocks a new machine from Photoshop. It blocks something
   just as real. Since 6.45.0 the seats are ONE TOTAL COUNT — a phone the
   student lost, sold or wiped holds a seat they paid for and cannot reach,
   and the whole point of self-release is that a device you no longer have is
   not a reason to wait for your teacher. Everything else is unchanged: a web
   session only, the student's own account, once every seven days, and each
   slot type keeps its own cooldown because releasing a dead phone must not
   cost the student the computer release they may need the same week.

   v6.35.0 — SELF-RELEASE OF THE COMPUTER SLOT.
   The whole permission question is decided here, in one pure function with no
   database and no clock of its own, so a test can execute every branch instead
   of reading the route and hoping. Three things decide it: the session must be
   a web session (a panel that has just been refused the slot must not be able
   to take it from the machine holding it), the slot must be the Computer one
   (v6.47.0: or the Phone one — the list is RELEASABLE_SLOT_TYPES, and a slot
   type that is neither is still refused), and the student must not have done
   this to THAT slot type in the last seven days. The cooldown is what keeps a
   released slot a repair rather than a way to run one licence around a
   classroom. */
const SELF_RELEASE_COOLDOWN_DAYS = 7;
const RELEASABLE_SLOT_TYPES = ["computer", "phone"];
const SELF_RELEASE_COOLDOWN_MS = SELF_RELEASE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
function selfReleaseTime(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (value instanceof Date) { const t = value.getTime(); return Number.isFinite(t) ? t : 0; }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
function evaluateSelfRelease(input) {
  const o = input || {};
  const now = selfReleaseTime(o.now) || Date.now();
  if (String(o.clientType || "") !== "web") {
    return { allowed: false, code: "web_session_required", nextAllowedAt: null };
  }
  if (RELEASABLE_SLOT_TYPES.indexOf(String(o.slotType || "")) < 0) {
    return { allowed: false, code: "slot_not_releasable", nextAllowedAt: null };
  }
  const last = selfReleaseTime(o.lastSelfReleaseAt);
  if (last > 0 && now < last + SELF_RELEASE_COOLDOWN_MS) {
    return { allowed: false, code: "release_cooldown",
      nextAllowedAt: new Date(last + SELF_RELEASE_COOLDOWN_MS).toISOString() };
  }
  return { allowed: true, code: "allowed",
    nextAllowedAt: new Date(now + SELF_RELEASE_COOLDOWN_MS).toISOString() };
}

module.exports = { sha256, createDeviceRegistry, createPgDeviceRepository,
  evaluateSelfRelease, SELF_RELEASE_COOLDOWN_DAYS, RELEASABLE_SLOT_TYPES };
