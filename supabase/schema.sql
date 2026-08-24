-- ============================================================================
-- HNK Web Studio — Supabase schema, policies and the approval trigger.
--
-- WHY THIS FILE EXISTS. The app is a static page that talks to Supabase
-- directly with the anon key. Everything the browser does can be replayed by
-- hand from a console. So the login wall, the Premium check and the admin
-- panel added in web v5.30.0 are USER INTERFACE, not security. What actually
-- stops a customer approving their own payment is the policies below.
--
-- Until this file is applied, treat the admin panel as a convenience for you
-- and assume any signed-in user could PATCH payment_requests themselves.
--
-- HOW TO APPLY. Supabase dashboard -> SQL editor -> paste -> Run. It is
-- idempotent: safe to run more than once, and safe to run on the live project.
-- Then make yourself an admin (replace the address). Run this in the SQL
-- editor, which has no JWT — section 6's guard deliberately steps aside for a
-- caller with no auth.uid(), because that caller is already the service role
-- and bypasses RLS anyway. An ordinary signed-in customer running the same
-- statement gets is_admin silently put back to false, which is the point.
--
--     update public.profiles set is_admin = true
--     where email = 'you@example.com';
--
-- Verify it took — if this returns 0 rows or is_admin false, STOP: the admin
-- panel will render for nobody and no payment can be approved.
--
--     select email, is_admin from public.profiles where is_admin;
--
-- WHAT THE APP EXPECTS, so this file and the client cannot drift:
--   profiles          id, name, email, created_at, plan_status, plan_expires_at,
--                     allowed_devices, is_admin,
--                     joined_paid, price_1m_override, price_3m_override,
--                     price_6m_override, price_join_first_override      (v5.34)
--   payment_requests  id, user_id, kind, txn_last6, screenshot_path, status,
--                     reviewed_at, reviewed_by, note, created_at,
--                     amount_mmk, is_grant                              (v5.34)
--                     device_count                                     (v5.41.0)
--   app_settings      price_1m, price_3m, price_6m, price_extra_device,
--                     payment_instructions_my (+ per-language variants),
--                     price_join_first, join_first_months,
--                     payment_qr_url, payment_phone                     (v5.34)
--                     price_device_1..5, price_device_step              (v5.41.0)
--   kind              plan_1m | plan_3m | plan_6m | extra_device | join_first
--   status            pending | approved | rejected
--   storage bucket    payment-proofs, private, objects at <uid>/<kind>-<ts>.<ext>
--
-- WHAT THE OWNER SETS, and none of it is in the code (v5.34):
--   update public.app_settings set
--     price_join_first   = 500000,   -- the one-time first purchase
--     join_first_months  = 1,        -- what that purchase opens
--     price_1m           = 30000,    -- the default monthly rate
--     payment_phone      = '09688200680',
--     payment_qr_url     = 'https://<project>.supabase.co/storage/v1/object/public/<bucket>/kbzpay-qr.jpg';
--
-- DEVICE-TIERED LIFETIME PRICING is a separate opt-in on top of the above
-- (v5.41.0). Setting price_device_1 switches the buy screen from the flat
-- price_join_first to a per-device-count bundle; leaving it null changes
-- nothing. price_1m/3m/6m then price PER DEVICE, multiplied by the account's
-- own allowed_devices at renewal time — not a second setting to configure:
--   update public.app_settings set
--     price_device_1     = 500000,   -- lifetime, 1 device
--     price_device_2     = 800000,   -- lifetime, 2 devices (a bundle rate, not 2x)
--     price_device_3     = 1000000,
--     price_device_4     = 1200000,
--     price_device_5     = 1400000,
--     price_device_step  = 200000,   -- each device beyond 5 costs this much more
--     price_1m           = 10000;    -- PER DEVICE per month once tiers are set
--
--   -- one student on a different monthly rate:
--   update public.profiles set price_1m_override = 10000 where email = 'student@example.com';
--
--   -- a free period for a VIP student is filed as a GRANT, not a database
--   -- edit, so it is visible in the same queue as every payment. The admin
--   -- panel has a button for it; this is the same thing by hand:
--   insert into public.payment_requests (user_id, kind, is_grant, amount_mmk, note)
--   select id, 'plan_1m', true, 0, 'VIP — training course' from public.profiles
--    where email = 'student@example.com';
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. the tables themselves
--
-- WHY THIS SECTION EXISTS, and why it did not for eleven releases. Everything
-- below section 1 ALTERs, policies, triggers, indexes. None of it CREATED
-- anything, because the four tables were made by hand in the dashboard when the
-- project was first stood up, and that work was never written down. The file
-- said so in its own header and the app repeated it at accLoadProfile: "the
-- trigger that creates profiles rows lives in the owner's Supabase project and
-- NOT in this repository."
--
-- That is survivable right up until the day someone applies this file to a
-- project that does not already have the tables — a new region, a restored
-- backup, a second environment, or an owner who reached for the SQL editor of
-- the wrong one of two projects. Then the very first statement in section 1
-- fails with
--
--     ERROR: 42P01: relation "public.profiles" does not exist
--
-- and every later section, including every policy that makes this file worth
-- running, never executes. The database is left with no tables AND no
-- protection, which is the worst of the two states it could have been in.
--
-- So the tables are declared here, from the contract the header already spells
-- out. `if not exists` means this section is a no-op on the live project: it
-- cannot alter, reshape or drop a table that is already there, and the columns
-- an existing table is missing are added by section 1 exactly as before.
--
-- WHAT IS DELIBERATELY ABSENT:
--
--   * No foreign key from payment_requests.user_id to profiles.id. The admin
--     queue at admLoadWho fetches names in a SECOND request and says why:
--     "profiles and payment_requests have no declared foreign key in this
--     project, so `select=*,profiles(name,email)` 400s". Declaring one here
--     would make a fresh project behave differently from the live one — the
--     embed would start working in one and keep 400ing in the other — which is
--     precisely the drift this file exists to prevent. Both columns reference
--     auth.users instead, which gives the integrity without changing the shape
--     PostgREST sees.
--
--   * No trigger creating a profiles row on signup. The app stopped depending
--     on one in v5.38.0: accLoadProfile reads 406 as "there is no row" and
--     inserts it through profiles_insert_self, with section 6's guard filling
--     in the plan, the device cap and the email. A signup trigger would now be
--     a second writer for the same row and is not worth the race.
-- ---------------------------------------------------------------------------

-- profiles.id IS the auth user's id — section 6 relies on it
-- ("profiles.id references auth.users.id") when it takes the email from the
-- identity provider rather than from the payload.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  created_at timestamptz not null default now()
);

-- kind and status are checked here as well as in the policies. The policies
-- bound what `authenticated` may insert; these bound what ANY writer may leave
-- behind, including the dashboard and a future migration. The lists are the
-- header's, verbatim.
create table if not exists public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null
                  check (kind in ('plan_1m','plan_3m','plan_6m','extra_device','join_first')),
  txn_last6       text,
  screenshot_path text,
  status          text not null default 'pending'
                  check (status in ('pending','approved','rejected')),
  reviewed_at     timestamptz,
  reviewed_by     uuid references auth.users (id),
  note            text,
  created_at      timestamptz not null default now()
);

-- The admin queue reads `order=created_at.desc&limit=100` on every open.
create index if not exists payment_requests_created_idx
  on public.payment_requests (created_at desc);

-- accPollOnce and the customer's own history both filter by user_id.
create index if not exists payment_requests_user_idx
  on public.payment_requests (user_id);

-- app_settings is a SINGLETON in everything but its declaration. hnk_apply_payment
-- reads `order by a.ctid limit 1` and the client reads its own copy, so a second
-- row lets an approved join_first open a different period from the one the buy
-- screen quoted. It is not constrained to one row here because the live table is
-- not, and a constraint this file cannot apply to production is a promise it
-- cannot keep; the admin panel warns when it finds more than one instead.
-- payment_instructions_my is the fallback every language falls back TO; the
-- per-language columns (payment_instructions_en, _th, ...) are optional, and a
-- missing one simply comes back undefined and takes the Burmese text.
create table if not exists public.app_settings (
  price_1m                integer,
  price_3m                integer,
  price_6m                integer,
  price_extra_device      integer,
  payment_instructions_my text
);

-- ...and it starts with exactly one row, because the buy screen reads row one
-- and an empty table quotes nothing. Every value is deliberately NULL: the
-- header lists prices as the owner's to set, and a placeholder price is a real
-- number a real customer could be charged.
insert into public.app_settings (price_1m)
select null
 where not exists (select 1 from public.app_settings);

create table if not exists public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  device_id  text not null,
  label      text,
  created_at timestamptz not null default now()
);

-- RLS refuses everything by default, but only for roles that can reach the
-- table at all. Supabase's default privileges usually grant these; stating them
-- makes a fresh project work without depending on that, and re-granting an
-- existing privilege is a no-op. app_settings is readable by anon on purpose —
-- the buy screen quotes prices before anyone signs in — and writable by nobody,
-- which section 4b explains at length.
grant usage on schema public to anon, authenticated;
grant select                         on public.app_settings     to anon, authenticated;
grant select, insert, update         on public.profiles         to authenticated;
grant select, insert, update         on public.payment_requests to authenticated;
grant select, insert, update, delete on public.devices          to authenticated;

-- ---------------------------------------------------------------------------
-- 1. columns the client reads
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists plan_status text not null default 'none';
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists allowed_devices integer not null default 2;

-- v5.34 pricing. Every number lives in the database, never in the client:
-- the owner sets them in the dashboard and the buy screen quotes whatever is
-- there. price_*_override is per CUSTOMER and wins over the app_settings
-- default when set, which is how a training-course student pays a different
-- monthly rate from a studio without either number appearing in code.
-- joined_paid records that the one-time joining fee has been settled, so the
-- buy screen stops quoting it.
alter table public.profiles add column if not exists joined_paid boolean not null default false;
alter table public.profiles add column if not exists price_1m_override integer;
alter table public.profiles add column if not exists price_3m_override integer;
alter table public.profiles add column if not exists price_6m_override integer;
alter table public.profiles add column if not exists price_join_first_override integer;

-- BACKFILL, and it is not optional. joined_paid defaults to false, so without
-- this every customer who has already paid would be quoted the joining fee
-- again the moment this release lands. An account that has ever had a plan has
-- already joined: plan_expires_at is written only by hnk_apply_payment, which
-- runs only on an approved payment. An EXPIRED plan still counts — the joining
-- fee is paid once, not once per lapse.
-- Safe to re-run: it only ever sets false to true, for rows that already show
-- evidence of a payment.
update public.profiles
   set joined_paid = true
 where joined_paid = false
   and (plan_expires_at is not null or coalesce(plan_status, 'none') <> 'none');

-- v5.34 payment_requests. amount_mmk is WHAT THE CUSTOMER SAYS THEY SENT — it
-- is a claim, not a fact, and the schema treats it as one: nothing in the
-- database compares it to a price or acts on it. Its whole job is to be shown
-- to the admin next to the amount that was actually due, so a 10,000 sent
-- against a 50,000 plan is visible before approval instead of after.
-- is_grant marks a row an admin created as a free grant rather than a payment,
-- so a VIP period is auditable rather than an invisible edit to a profile.
alter table public.payment_requests add column if not exists amount_mmk integer;
alter table public.payment_requests add column if not exists is_grant boolean not null default false;

-- v5.41.0 — how many devices THIS join_first purchase covers, when the owner
-- has opted into device-tiered lifetime pricing (see price_device_1 below).
-- Null everywhere else: a renewal's device count is the account's own
-- allowed_devices, already on the profile, not a fresh choice per payment.
alter table public.payment_requests add column if not exists device_count integer;

-- A grant has no transfer and no slip, so the two columns that record them
-- must accept their absence. If the table was created with them NOT NULL — the
-- shape a payments-only design naturally produces — an admin's first VIP grant
-- would be refused by the database with a constraint error the admin panel
-- could only report as "couldn't submit". Dropping NOT NULL is a no-op when
-- they are already nullable, which keeps this file idempotent.
alter table public.payment_requests alter column txn_last6 drop not null;
alter table public.payment_requests alter column screenshot_path drop not null;

-- ---------------------------------------------------------------------------
-- 2. the admin test
--
-- SECURITY DEFINER on purpose. A policy on `profiles` that itself selects from
-- `profiles` re-enters the same policy and Postgres raises
-- "infinite recursion detected in policy for relation profiles". A definer
-- function runs as its owner, so the inner read is not policy-checked and the
-- recursion never starts. search_path is pinned because a definer function
-- with a caller-controlled search_path is a privilege-escalation hole.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.hnk_is_admin() from public;
grant execute on function public.hnk_is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. profiles — a user sees only their own row; only an admin may move a plan
--
-- The UPDATE policy deliberately does NOT let a user write their own
-- plan_status / plan_expires_at / allowed_devices / is_admin. Postgres has no
-- per-column USING clause, so the columns are protected by a trigger instead
-- (section 6) rather than by hoping the client only sends `name`.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.hnk_is_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.hnk_is_admin())
  with check (id = auth.uid() or public.hnk_is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. payment_requests — a user may raise one and read their own; ONLY an admin
--    may change one. This is the policy the whole admin panel rests on.
-- ---------------------------------------------------------------------------
alter table public.payment_requests enable row level security;

drop policy if exists payreq_insert_own on public.payment_requests;
create policy payreq_insert_own on public.payment_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and kind in ('plan_1m','plan_3m','plan_6m','extra_device','join_first')
    -- a customer never marks their own row a grant; that is the admin's word,
    -- and without this line anyone could file a free VIP period into the queue
    -- looking exactly like one the owner had authorised
    and coalesce(is_grant, false) = false
    -- an amount is optional (older clients do not send one) but a negative or
    -- absurd one is a typo at best, so it is bounded here rather than trusted
    and (amount_mmk is null or (amount_mmk >= 0 and amount_mmk <= 100000000))
    -- a request always starts pending; a client that tries to insert itself as
    -- approved is refused rather than trusted
    and coalesce(status, 'pending') = 'pending'
    -- ...and it starts UNREVIEWED. Without these three, a user could insert a
    -- row that already carries reviewed_at, reviewed_by and a note, which the
    -- admin list renders verbatim — a forged "already approved by you" entry
    -- sitting in the approval queue. The status check alone does not stop it,
    -- because these are separate columns.
    and reviewed_at is null
    and reviewed_by is null
    and note is null
  );

-- v5.34 — payreq_insert_own is `user_id = auth.uid()`, so an admin recording a
-- free period for a student would be refused by their own database. This is the
-- narrow exception: an admin may insert a row for ANY user, but only one marked
-- is_grant with no money attached. A grant therefore lands in the same queue,
-- with the same audit trail, as every payment.
drop policy if exists payreq_insert_admin_grant on public.payment_requests;
create policy payreq_insert_admin_grant on public.payment_requests
  for insert to authenticated
  with check (
    public.hnk_is_admin()
    and is_grant = true
    and coalesce(amount_mmk, 0) = 0
    and kind in ('plan_1m','plan_3m','plan_6m','extra_device','join_first')
    and coalesce(status, 'pending') = 'pending'
  );

drop policy if exists payreq_select_own_or_admin on public.payment_requests;
create policy payreq_select_own_or_admin on public.payment_requests
  for select to authenticated
  using (user_id = auth.uid() or public.hnk_is_admin());

drop policy if exists payreq_update_admin_only on public.payment_requests;
create policy payreq_update_admin_only on public.payment_requests
  for update to authenticated
  using (public.hnk_is_admin())
  with check (public.hnk_is_admin());

-- no delete policy: nobody deletes a payment record, including an admin.
-- The audit trail is the point.

-- ---------------------------------------------------------------------------
-- 4b. app_settings — the prices AND THE BANK ACCOUNT NUMBER
--
-- THIS IS THE MOST CONSEQUENTIAL POLICY IN THE FILE and it was missing.
-- accLoadSettings reads this table with { anon: true } — deliberately, because
-- the buy screen has to show prices and payment instructions before anyone has
-- signed in. Supabase's default grants make an unauthenticated table both
-- readable AND writable, so with no policy here a browser console could PATCH
-- payment_instructions_my and every customer would wire their money to an
-- account of the attacker's choosing. The read is meant to be public; the
-- write never was.
--
-- Read is granted to anon AND authenticated. There is deliberately NO insert,
-- update or delete policy: with RLS enabled and no such policy, every write is
-- refused for everyone, including admins. The owner edits prices and bank
-- details in the Supabase dashboard, which uses the service role and bypasses
-- RLS — so nothing legitimate is lost.
-- ---------------------------------------------------------------------------
-- v5.34 — the joining fee and the period it opens. Both are the owner's to
-- set in the dashboard; nothing in the client or in this file assumes a value.
alter table public.app_settings add column if not exists price_join_first integer;
alter table public.app_settings add column if not exists join_first_months integer;
-- The KBZPay QR the buy screen shows. A URL, not an image: the QR encodes a
-- live bank account, and a public git repository is a permanent, unrevocable
-- place to put one. Upload it to a Supabase storage bucket and paste the URL.
alter table public.app_settings add column if not exists payment_qr_url text;
alter table public.app_settings add column if not exists payment_phone text;

-- v5.41.0 — device-tiered lifetime pricing, OPT IN. price_device_1 is the
-- first-purchase price for one device; price_device_2..5 are the TOTAL price
-- for that many (a bundle rate, not price_device_1 multiplied — the owner's
-- own numbers step unevenly: +300,000 for the second device, +200,000 each
-- after). price_device_step prices every device beyond five, continuing that
-- same +200,000 pattern. Every column defaults to null, which means nothing
-- here has changed: the buy screen falls back to the flat price_join_first
-- exactly as before until price_device_1 is set.
alter table public.app_settings add column if not exists price_device_1 integer;
alter table public.app_settings add column if not exists price_device_2 integer;
alter table public.app_settings add column if not exists price_device_3 integer;
alter table public.app_settings add column if not exists price_device_4 integer;
alter table public.app_settings add column if not exists price_device_5 integer;
alter table public.app_settings add column if not exists price_device_step integer;

alter table public.app_settings enable row level security;

drop policy if exists appset_read_all on public.app_settings;
create policy appset_read_all on public.app_settings
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5. devices
-- ---------------------------------------------------------------------------
alter table public.devices enable row level security;

drop policy if exists devices_all_own_or_admin on public.devices;
create policy devices_all_own_or_admin on public.devices
  for all to authenticated
  using (user_id = auth.uid() or public.hnk_is_admin())
  with check (user_id = auth.uid() or public.hnk_is_admin());

-- ---------------------------------------------------------------------------
-- 5b. the device cap, enforced where it cannot be edited out
--
-- allowed_devices is a PRICED product: extra_device is one of the four SKUs in
-- payreq_insert_own, and hnk_apply_payment increments allowed_devices when the
-- admin approves one. Until this trigger existed the cap was enforced nowhere —
-- profiles.allowed_devices was a number the buy screen displayed and nothing
-- read. A customer could register twenty devices and never buy a slot.
--
-- The client is already built for this and has been since v4.30: accIsDeviceLimit
-- checks for SQLSTATE P0001 by name, accDevLimitMsg renders dev_limit with the
-- real allowed_devices substituted, and the rejection deliberately never fails
-- the login. So raising P0001 here lights up a UI path that has been waiting for
-- a server that never spoke.
--
-- SECURITY DEFINER because the count has to see every row for that user, and the
-- devices policy in section 5 scopes an ordinary caller to their own rows only —
-- which, for this purpose, happens to be the same set, but the definer makes the
-- count independent of any future narrowing of that policy.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_guard_device_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used  integer;
  cap   integer;
begin
  -- A RE-REGISTRATION IS NOT A NEW DEVICE, and until this branch existed the
  -- cap said it was. The unique index below was documented as what makes a
  -- second POST for the same browser "a no-op collision instead of a new row",
  -- but a BEFORE INSERT trigger runs BEFORE any index is consulted: at the cap,
  -- re-registering a browser the customer ALREADY owns raised P0001 rather than
  -- colliding harmlessly. accRegisterDevice falls through to its POST whenever
  -- the preceding GET is merely `!ok` -- an expired token, a network blip -- so
  -- a customer at their limit could be shown "remove an old device" for a
  -- device that was already in the list, and might delete a real one to obey.
  -- Returning NULL cancels this INSERT silently, which is precisely the no-op
  -- the index was meant to produce. The index still backstops the race where
  -- two concurrent inserts both pass this check.
  if exists (select 1 from public.devices
              where user_id = new.user_id and device_id = new.device_id) then
    return null;
  end if;

  select count(*) into used from public.devices where user_id = new.user_id;
  select coalesce(allowed_devices, 2) into cap from public.profiles where id = new.user_id;
  if cap is null then cap := 2; end if;
  if used >= cap then
    raise exception 'device limit reached: % of % slots used', used, cap
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists hnk_guard_device_cap on public.devices;
create trigger hnk_guard_device_cap
  before insert on public.devices
  for each row execute function public.hnk_guard_device_cap();

-- Re-registering the SAME browser must never consume a second slot. accBoot
-- keeps its device id in localStorage across logout precisely so it does not,
-- and accRegisterDevice is written GET-then-POST to be safe either way — this
-- index is what makes the second POST a no-op collision instead of a new row.
create unique index if not exists devices_user_device_uniq
  on public.devices (user_id, device_id);

-- ---------------------------------------------------------------------------
-- 6. a user may edit their own name — and nothing else about their plan
--
-- Section 3's UPDATE policy lets a user write their own row, which is needed
-- for the name field. Without this trigger that same policy would also let
-- them set plan_status='active' and plan_expires_at = 2099. The trigger puts
-- the plan columns back to what they were unless an admin is doing the update.
--
-- INSERT is guarded too, and that half is not theoretical tidiness. Section 3's
-- insert policy checks only `id = auth.uid()`, so a user whose profile row does
-- not exist yet could create it with is_admin = true and hand themselves the
-- approval panel. The app never inserts a profile — it only ever selects one —
-- but the policy grants the right regardless of what the app chooses to do with
-- it, and a right the trigger does not bound is a hole whether or not the
-- shipped client walks through it. On INSERT there is no `old` row to copy
-- from, so the plan columns are forced to their starting values instead.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_guard_profile_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- THE BOOTSTRAP ESCAPE, and without it this file is self-defeating.
  -- auth.uid() is NULL whenever there is no JWT on the connection, which is
  -- exactly the Supabase SQL editor, a migration, or anything else running as
  -- the service role. Those callers already bypass RLS entirely, so refusing
  -- them here buys nothing — and it cost everything: the very first admin has
  -- to be created by an UPDATE run in the SQL editor, hnk_is_admin() returned
  -- false there, and this trigger copied is_admin=false straight back over it.
  -- The file's own instructions could never work: no admin could ever exist,
  -- so no payment could ever be approved. An ordinary customer can never reach
  -- this branch, because the UPDATE policy in section 3 is `to authenticated`
  -- and an authenticated request always carries a uid.
  if auth.uid() is null then
    return new;
  end if;
  if public.hnk_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan_status     := 'none';
    new.plan_expires_at := null;
    new.allowed_devices := 2;
    new.is_admin        := false;
    -- v5.34: a self-inserted row must not arrive already joined, nor carrying
    -- a price of its own choosing
    new.joined_paid               := false;
    new.price_1m_override         := null;
    new.price_3m_override         := null;
    new.price_6m_override         := null;
    new.price_join_first_override := null;
    -- v5.37: identity, taken from the identity provider rather than from the
    -- payload. NOT nulled: the trigger that creates a profiles row on signup
    -- lives in the owner's Supabase project and NOT in this repository, so
    -- blanking the column here rested on an assumption about code this file
    -- cannot see -- and if that trigger ever runs with a non-null auth.uid(),
    -- blanking it would leave every new customer with no email, which is the
    -- field the approval queue shows as who filed a payment and the field
    -- admGrant looks students up by. auth.users is the authority; coalesce
    -- keeps the supplied value only in the impossible case where the lookup
    -- finds nothing (profiles.id references auth.users.id).
    new.email := coalesce((select u.email from auth.users u where u.id = new.id), new.email);
    return new;
  end if;
  new.plan_status     := old.plan_status;
  new.plan_expires_at := old.plan_expires_at;
  new.allowed_devices := old.allowed_devices;
  new.is_admin        := old.is_admin;
  -- v5.34: joined_paid decides whether the joining fee is still owed and the
  -- overrides decide what everything costs. A customer who could write either
  -- could set their own price to zero, which is the same hole as writing
  -- plan_status directly.
  new.joined_paid               := old.joined_paid;
  new.price_1m_override         := old.price_1m_override;
  new.price_3m_override         := old.price_3m_override;
  new.price_6m_override         := old.price_6m_override;
  new.price_join_first_override := old.price_join_first_override;
  -- v5.37: IDENTITY IS NOT THE CUSTOMER'S TO EDIT. profiles_update_own_or_admin
  -- is a whole-row grant, this function restored every plan and price column
  -- and left `email` and `name` writable, and three things key on them:
  --   * the approval queue prints `name · email` as who filed a payment, so a
  --     customer could make their row read as somebody else while the owner
  --     decides whether to accept their money;
  --   * admGrant looks a student up by typed email with limit=1 and no order,
  --     so a second row claiming that address decides arbitrarily who gets a
  --     free VIP period;
  --   * this file's own instructions, and the README's, hand out admin and
  --     per-customer prices with `where email = '...'`.
  -- No shipped code path writes profiles at all -- every client reference is a
  -- GET -- so nothing legitimate is lost by refusing.
  new.email := old.email;
  new.name  := old.name;
  return new;
end;
$$;

-- ...and the database refuses a duplicate identity rather than letting a
-- `limit=1` with no ORDER BY pick one arbitrarily. Case-insensitive because an
-- owner typing an address into the grant box is not thinking about case.
-- NOTE: if this raises, two rows already share an address -- reconcile them
-- before re-running, rather than dropping the index.
create unique index if not exists profiles_email_uniq
  on public.profiles (lower(email));

drop trigger if exists hnk_guard_profile_plan on public.profiles;
create trigger hnk_guard_profile_plan
  before update on public.profiles
  for each row execute function public.hnk_guard_profile_plan();

drop trigger if exists hnk_guard_profile_insert on public.profiles;
create trigger hnk_guard_profile_insert
  before insert on public.profiles
  for each row execute function public.hnk_guard_profile_plan();

-- ---------------------------------------------------------------------------
-- 7. approval extends the plan — in the database, not in the browser
--
-- The client comment at accPollOnce already assumes this ("the server trigger
-- has already extended plan_expires_at / bumped allowed_devices — re-read
-- rather than guess"), and the admin panel writes ONLY the review fields for
-- the same reason. If both extended the plan, every approval would count twice.
--
-- Extension is from the LATER of now and the current expiry, so renewing early
-- adds to the remaining time instead of throwing it away.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_apply_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  months integer := 0;
  base   timestamptz;
begin
  if new.status <> 'approved' or coalesce(old.status, '') = 'approved' then
    return new;
  end if;

  if new.kind = 'plan_1m' then months := 1;
  elsif new.kind = 'plan_3m' then months := 3;
  elsif new.kind = 'plan_6m' then months := 6;
  elsif new.kind = 'join_first' then
    -- v5.34 — the one-time joining fee also opens the first period, and how
    -- long that period is belongs to the owner, not to this file. Default 1.
    -- v5.39.0 — LIMIT without ORDER BY does not pick a row, it picks whatever
    -- the planner emits first. With the one row this table is meant to hold
    -- that is moot; with two, the period an approved join_first opens could
    -- differ from the price the client quoted, which reads its own copy. ctid
    -- is ordered on rather than a named column because this file only ALTERs
    -- app_settings (see above) and so cannot promise any particular column
    -- exists; every table has ctid. Deterministic is the most this can be —
    -- AGREEING with the client requires app_settings to hold exactly one row.
    select coalesce(nullif(a.join_first_months, 0), 1) into months
      from public.app_settings a order by a.ctid limit 1;
    months := coalesce(months, 1);
  end if;

  if months > 0 then
    select greatest(coalesce(p.plan_expires_at, now()), now())
      into base from public.profiles p where p.id = new.user_id;
    update public.profiles
       set plan_status     = 'active',
           plan_expires_at = coalesce(base, now()) + (months || ' months')::interval,
           -- v5.34 — settling the joining fee is what clears it, and nothing
           -- else does. A plan_1m approval leaves joined_paid alone, so a
           -- customer cannot buy a cheap month to skip the joining fee.
           joined_paid     = case when new.kind = 'join_first' then true else joined_paid end,
           -- v5.41.0 — device-tiered lifetime pricing set how many devices
           -- THIS purchase covers on device_count; a plain join_first with no
           -- tiers configured never sends it, and coalescing onto the existing
           -- value leaves allowed_devices exactly where it already was (the
           -- profiles column default), unchanged from before this feature.
           allowed_devices = case when new.kind = 'join_first' and new.device_count is not null
                                   then greatest(1, new.device_count)
                                   else allowed_devices end
     where id = new.user_id;
  elsif new.kind = 'extra_device' then
    update public.profiles
       set allowed_devices = coalesce(allowed_devices, 2) + 1
     where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists hnk_apply_payment on public.payment_requests;
create trigger hnk_apply_payment
  after update on public.payment_requests
  for each row execute function public.hnk_apply_payment();

-- ---------------------------------------------------------------------------
-- 8. payment proofs — a private bucket, own folder in, own or admin out
--
-- The app uploads to payment-proofs/<uid>/<kind>-<ts>.<ext> and the admin panel
-- reads the bytes with the bearer token attached, so the bucket must stay
-- private: a public bucket would put every customer's bank slip on a guessable
-- URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists proofs_insert_own on storage.objects;
create policy proofs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists proofs_read_own_or_admin on storage.objects;
create policy proofs_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.hnk_is_admin())
  );

-- ---------------------------------------------------------------------------
-- 9. check it worked
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('profiles','payment_requests','devices');
--     -> rowsecurity must be true for all three
--
--   select policyname, cmd from pg_policies where schemaname='public';
--     -> the policies above
--
-- And the two that matter, run while signed in as a NON-admin customer:
--
--   update public.payment_requests set status='approved' where id='<some id>';
--     -> must affect 0 rows. If it approves anything, this file is not applied.
--
--   update public.profiles set is_admin=true, plan_status='active' where id=auth.uid();
--     -> must report success and change NOTHING. The trigger in section 6 puts
--        every plan column back. If the row comes back with is_admin true, the
--        approval panel is standing open to every customer you have.
-- ---------------------------------------------------------------------------
