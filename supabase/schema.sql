-- ============================================================================
-- HNK Web Studio — Supabase schema, policies and the approval trigger.
--
-- WHY THIS FILE EXISTS. The Student App uses an ordinary browser session, and
-- every request that session can make can be replayed from a console. The
-- login wall, license cards and Admin Control Center are user interface, not
-- authorization. Own-account access is enforced by the policies below. Every
-- cross-account payment review, VIP grant and proof read goes through the
-- strict /v1/admin service, which requires an admin-client session plus current
-- MFA, records an audit entry and uses service_role only inside that boundary.
--
-- Until this file is applied, the required RLS boundary does not exist. Do not
-- expose the app or approve a payment.
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
--   -- File a free VIP period only from the Admin Control Center. Its strict
--   -- server action creates and approves one audited grant transaction so the
--   -- same entitlement trigger used by paid requests remains authoritative.
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
--   * No foreign key from payment_requests.user_id to profiles.id. The strict
--     admin service joins those records server-side by their shared auth user
--     id. Both columns reference auth.users, preserving integrity without
--     changing the live PostgREST relationship graph.
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
  created_at timestamptz not null default now(),
  account_status text not null default 'pending'
                 constraint profiles_account_status_chk
                 check (account_status in ('pending','active','suspended','banned','rejected'))
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

-- The strict admin queue orders newest-first and pages this index.
create index if not exists payment_requests_created_idx
  on public.payment_requests (created_at desc);

-- accPollOnce and the customer's own history both filter by user_id.
create index if not exists payment_requests_user_idx
  on public.payment_requests (user_id);

-- app_settings is a SINGLETON in everything but its declaration. It is not
-- constrained here because a live table may already contain duplicates that
-- must be reconciled deliberately. hnk_apply_payment fails closed unless the
-- count is exactly one; the strict admin API reports the count and its UI raises
-- a prominent configuration warning.
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
-- Supabase supplies real anon/authenticated roles and still needs its table
-- privileges. The roleless API has neither role and connects as the table
-- owner, so every role-naming statement must be dynamic and conditional: even
-- a static GRANT to a missing role aborts the migration before RLS exists.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to anon, authenticated';
    execute 'grant select on public.app_settings to anon, authenticated';
    execute 'grant select, insert, update on public.profiles to authenticated';
    execute 'grant select, insert on public.payment_requests to authenticated';
    execute 'grant select, insert, update, delete on public.devices to authenticated';

    -- GRANT is additive. Remove inherited anonymous writes before a SECURITY
    -- DEFINER BEFORE trigger can inspect a guessed account.
    execute 'revoke insert, update, delete on public.profiles, public.payment_requests, public.devices from anon';
    execute 'revoke update, delete on public.payment_requests from authenticated';
    execute 'revoke insert, update, delete on public.app_settings from anon, authenticated';
  end if;

  -- New Supabase projects no longer expose new public tables automatically.
  -- Keep the secret server role usable too; it is never shipped to the client
  -- and Supabase gives it BYPASSRLS for trusted administrative operations.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update, delete on public.profiles, public.payment_requests, public.app_settings, public.devices to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. columns the client reads
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists plan_status text not null default 'none';
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists allowed_devices integer not null default 2;

-- The unified account lifecycle is independent from the legacy payment plan.
-- Existing paid/admin accounts are activated only when this column is first
-- introduced; later registrations keep the fail-closed `pending` default.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'account_status'
  ) then
    alter table public.profiles add column account_status text;
    update public.profiles
       set account_status = case
         when coalesce(is_admin, false)
           or coalesce(plan_status, 'none') = 'active'
           or plan_expires_at is not null then 'active'
         else 'pending'
       end;
    alter table public.profiles alter column account_status set default 'pending';
    alter table public.profiles alter column account_status set not null;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_account_status_chk'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_account_status_chk
      check (account_status in ('pending','active','suspended','banned','rejected'))
      not valid;
  end if;
end $$;

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

-- v5.42.1 — a payment request keeps BOTH numbers: amount_mmk is what the
-- customer says they transferred; quoted_amount_mmk is what the database says
-- this product cost when the request was filed. The latter is written only by
-- hnk_guard_payment_request below. Keeping the quote on the row prevents a
-- later price/device edit from rewriting history while preserving the owner's
-- deliberate ability to review an under/over-payment rather than making the
-- browser silently reject it.
alter table public.payment_requests add column if not exists quoted_amount_mmk integer;
alter table public.payment_requests add column if not exists pricing_mode text;

-- Existing production rows predate these invariants, so the constraints are
-- NOT VALID: PostgreSQL enforces them for every new/changed row immediately
-- without refusing the migration because an old pending row needs manual
-- reconciliation. Once that queue is clean the owner may VALIDATE them.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'payment_requests_device_count_shape_chk'
       and conrelid = 'public.payment_requests'::regclass
  ) then
    alter table public.payment_requests
      add constraint payment_requests_device_count_shape_chk check (
        pricing_mode is null or (
          (kind = 'join_first' and (device_count is null or device_count between 1 and 10))
          or (kind <> 'join_first' and device_count is null)
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'payment_requests_quote_chk'
       and conrelid = 'public.payment_requests'::regclass
  ) then
    alter table public.payment_requests
      add constraint payment_requests_quote_chk check (
        quoted_amount_mmk is null or quoted_amount_mmk between 0 and 100000000
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'payment_requests_pricing_mode_chk'
       and conrelid = 'public.payment_requests'::regclass
  ) then
    alter table public.payment_requests
      add constraint payment_requests_pricing_mode_chk check (
        pricing_mode is null or pricing_mode in ('flat','tier','grant')
      ) not valid;
  end if;
end $$;

-- A grant has no transfer and no slip, so the two columns that record them
-- must accept their absence. If the table was created with them NOT NULL — the
-- shape a payments-only design naturally produces — the first server-owned VIP
-- grant would be refused by the database with a constraint error. Dropping NOT
-- NULL is a no-op when
-- they are already nullable, which keeps this file idempotent.
alter table public.payment_requests alter column txn_last6 drop not null;
alter table public.payment_requests alter column screenshot_path drop not null;

-- ---------------------------------------------------------------------------
-- 2. request identity and the admin test
--
-- On Supabase, current_user is the role selected by PostgREST. On the
-- roleless API, platform.sql's private marker switches this helper to the
-- transaction-local mode set by db.js. Unknown or absent values are NULL and
-- therefore fail every policy closed.
create or replace function public.hnk_request_role()
returns text
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  requested text;
begin
  if to_regprocedure('auth.hnk_roleless_runtime()') is not null then
    requested := nullif(current_setting('request.role', true), '');
    if requested in ('anon', 'authenticated', 'service_role') then
      return requested;
    end if;
    return null;
  end if;

  requested := current_user::text;
  if requested in ('anon', 'authenticated', 'service_role') then
    return requested;
  end if;
  -- A Supabase SQL-editor owner already has its platform-native RLS bypass.
  -- Do not turn any other auxiliary role with a stray table grant into the
  -- service identity merely because its name is unfamiliar.
  return null;
end;
$$;

-- Supabase's opt-in Data API defaults can remove automatic function EXECUTE
-- grants. Policies call this helper as the request role, so make that dependency
-- explicit while leaving every unrelated auxiliary role fail-closed.
revoke all on function public.hnk_request_role() from public;
do $$
declare
  wanted text;
begin
  foreach wanted in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = wanted) then
      execute format('grant execute on function public.hnk_request_role() to %I', wanted);
    end if;
  end loop;
end $$;

-- SECURITY DEFINER on purpose. A policy on `profiles` that itself selects from
-- `profiles` re-enters the same policy and Postgres raises
-- "infinite recursion detected in policy for relation profiles". A definer
-- function runs as its owner, so the inner read is not policy-checked and the
-- recursion never starts. search_path is pinned because a definer function
-- with a caller-controlled search_path is a privilege-escalation hole.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- FORCE RLS makes the owner subject to this same profiles policy. Querying
  -- profiles here would recurse, so the roleless API supplies only the boolean
  -- it derived from the database before narrowing the transaction to the user.
  if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null then
    return public.hnk_request_role() = 'authenticated'
       and coalesce(pg_catalog.current_setting('request.is_admin', true) = 'true', false);
  end if;

  -- Supabase does not install the marker or FORCE owner RLS, so retain the
  -- original authoritative lookup for direct browser-to-Supabase requests.
  return coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
end;
$$;

revoke all on function public.hnk_is_admin() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.hnk_is_admin() to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. profiles — a browser bearer sees and edits only its own row. Cross-account
--    administration is authorized and audited by the strict /v1/admin API.
--
-- The UPDATE policy deliberately does NOT let a user write their own
-- plan_status / plan_expires_at / allowed_devices / is_admin. Postgres has no
-- per-column USING clause, so the columns are protected by a trigger instead
-- (section 6) rather than by hoping the client only sends `name`.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_service_all on public.profiles;
create policy profiles_service_all on public.profiles
  for all to public
  using (public.hnk_request_role() = 'service_role')
  with check (public.hnk_request_role() = 'service_role');

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to public
  using (public.hnk_request_role() = 'authenticated'
         and id = auth.uid());

drop policy if exists profiles_update_own_or_admin on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to public
  using (public.hnk_request_role() = 'authenticated'
         and id = auth.uid())
  with check (public.hnk_request_role() = 'authenticated'
              and id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to public
  with check (public.hnk_request_role() = 'authenticated' and id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. payment_requests — a user may raise one and read their own. Review and
--    status changes exist only behind the strict server-owned /v1/admin API.
-- ---------------------------------------------------------------------------
alter table public.payment_requests enable row level security;

drop policy if exists payreq_service_all on public.payment_requests;
create policy payreq_service_all on public.payment_requests
  for all to public
  using (public.hnk_request_role() = 'service_role')
  with check (public.hnk_request_role() = 'service_role');

drop policy if exists payreq_insert_own on public.payment_requests;
create policy payreq_insert_own on public.payment_requests
  for insert to public
  with check (
    public.hnk_request_role() = 'authenticated'
    and user_id = auth.uid()
    and kind in ('plan_1m','plan_3m','plan_6m','extra_device','join_first')
    -- a customer never marks their own row a grant; that is the admin's word,
    -- and without this line anyone could file a free VIP period into the queue
    -- looking exactly like one the owner had authorised
    and coalesce(is_grant, false) = false
    -- an amount is optional (older clients do not send one) but a negative or
    -- absurd one is a typo at best, so it is bounded here rather than trusted
    and (amount_mmk is null or (amount_mmk >= 0 and amount_mmk <= 100000000))
    -- device_count is meaningful only on the one-time bundle and the shipped
    -- picker's supported range is 1..10. Tier-vs-flat and configured-price
    -- validation need live settings, so hnk_guard_payment_request below owns
    -- that dynamic half; this static shape is defence in depth at the RLS edge.
    and (
      (kind = 'join_first' and (device_count is null or device_count between 1 and 10))
      or (kind <> 'join_first' and device_count is null)
    )
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

-- Cross-account grants are server-owned admin actions. A browser bearer may
-- insert only its own ordinary request; the strict /v1/admin route verifies an
-- admin-client session plus MFA and writes the audited grant as service_role.
drop policy if exists payreq_insert_admin_grant on public.payment_requests;

drop policy if exists payreq_select_own_or_admin on public.payment_requests;
drop policy if exists payreq_select_own on public.payment_requests;
create policy payreq_select_own on public.payment_requests
  for select to public
  using (public.hnk_request_role() = 'authenticated'
         and user_id = auth.uid());

drop policy if exists payreq_update_admin_only on public.payment_requests;

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

drop policy if exists appset_service_all on public.app_settings;
create policy appset_service_all on public.app_settings
  for all to public
  using (public.hnk_request_role() = 'service_role')
  with check (public.hnk_request_role() = 'service_role');

drop policy if exists appset_read_all on public.app_settings;
create policy appset_read_all on public.app_settings
  for select to public
  using (public.hnk_request_role() in ('anon', 'authenticated'));

-- ---------------------------------------------------------------------------
-- 4c. server-authored payment quotes and immutable review transitions
--
-- The browser may SELECT the price list, but it is not the authority on either
-- a quote or an entitlement. Every request crosses this function before it is
-- stored. Returning no row means the requested product is not configured or
-- its device shape is invalid; the guard trigger then rejects the statement.
-- ---------------------------------------------------------------------------
create or replace function public.hnk_payment_quote(
  p_user_id uuid,
  p_kind text,
  p_device_count integer,
  p_is_grant boolean
)
returns table (out_mode text, out_quote integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings_rows integer;
  st public.app_settings%rowtype;
  prof public.profiles%rowtype;
  tiered boolean := false;
  amount_big bigint;
  mode_text text;
begin
  select count(*) into settings_rows from public.app_settings;
  if settings_rows <> 1 then return; end if;
  select a.* into st from public.app_settings a order by a.ctid limit 1;
  select p.* into prof from public.profiles p where p.id = p_user_id;
  if not found then return; end if;

  if coalesce(p_is_grant, false) then
    -- The admin UI grants periods/base access, never incremental paid slots.
    -- Refusing grant add-ons also prevents a free row bypassing tier base/max.
    if p_kind = 'extra_device' or p_device_count is not null then return; end if;
    return query select 'grant'::text, 0::integer;
    return;
  end if;

  tiered := coalesce(st.price_device_1, 0) > 0;

  if p_kind = 'join_first' then
    if tiered then
      if p_device_count is null or p_device_count < 1 or p_device_count > 10 then return; end if;
      mode_text := 'tier';
      if p_device_count = 1 then amount_big := st.price_device_1::bigint;
      elsif p_device_count = 2 then amount_big := st.price_device_2::bigint;
      elsif p_device_count = 3 then amount_big := st.price_device_3::bigint;
      elsif p_device_count = 4 then amount_big := st.price_device_4::bigint;
      elsif p_device_count = 5 then amount_big := st.price_device_5::bigint;
      elsif coalesce(st.price_device_5, 0) > 0 and coalesce(st.price_device_step, 0) > 0 then
        amount_big := st.price_device_5::bigint + st.price_device_step::bigint * (p_device_count - 5);
      else return;
      end if;
    else
      if p_device_count is not null then return; end if;
      mode_text := 'flat';
      amount_big := coalesce(prof.price_join_first_override, st.price_join_first)::bigint;
    end if;

  elsif p_kind in ('plan_1m','plan_3m','plan_6m') then
    if p_device_count is not null then return; end if;
    mode_text := case when tiered then 'tier' else 'flat' end;
    if p_kind = 'plan_1m' then
      amount_big := coalesce(prof.price_1m_override, st.price_1m)::bigint;
    elsif p_kind = 'plan_3m' then
      amount_big := coalesce(prof.price_3m_override, st.price_3m)::bigint;
    else
      amount_big := coalesce(prof.price_6m_override, st.price_6m)::bigint;
    end if;
    if tiered then
      if coalesce(prof.allowed_devices, 0) < 1 then return; end if;
      amount_big := amount_big * prof.allowed_devices::bigint;
    end if;

  elsif p_kind = 'extra_device' then
    if p_device_count is not null then return; end if;
    mode_text := case when tiered then 'tier' else 'flat' end;
    amount_big := st.price_extra_device::bigint;
  else
    return;
  end if;

  if amount_big is null or amount_big < 1 or amount_big > 100000000 then return; end if;
  return query select mode_text, amount_big::integer;
end;
$$;

revoke all on function public.hnk_payment_quote(uuid,text,integer,boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.hnk_payment_quote(uuid,text,integer,boolean) from authenticated';
  end if;
end $$;

create or replace function public.hnk_guard_payment_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mode_text text;
  quote_value integer;
  already_joined boolean;
  current_allowance integer;
  join_required boolean;
begin
  if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null
     and not coalesce(public.hnk_request_role() in ('authenticated', 'service_role'), false) then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    -- BEFORE triggers run before RLS WITH CHECK. Refuse a forged user_id with
    -- one uniform answer before this definer function reads or locks a victim's
    -- profile; only the trusted service-role grant path may target another user.
    if auth.uid() is not null and new.user_id is distinct from auth.uid()
       and not public.hnk_is_admin() then
      raise exception 'payment user does not match authenticated caller'
        using errcode = '42501';
    end if;

    -- Serialise all commercial requests for one account. Without this lock two
    -- concurrent first-purchase inserts can both observe joined_paid=false.
    select (p.joined_paid or p.plan_expires_at is not null
            or coalesce(p.plan_status, 'none') <> 'none'),
           coalesce(p.allowed_devices, 2),
           (coalesce(a.price_device_1, 0) > 0
            or coalesce(p.price_join_first_override, a.price_join_first, 0) > 0)
      into already_joined, current_allowance, join_required
      from public.profiles p cross join public.app_settings a
     where p.id = new.user_id
     order by a.ctid
     limit 1
       for update of p;
    if not found then
      raise exception 'payment account or singleton settings row is unavailable'
        using errcode = '23514';
    end if;

    select q.out_mode, q.out_quote into mode_text, quote_value
      from public.hnk_payment_quote(new.user_id, new.kind, new.device_count, new.is_grant) q;
    if mode_text is null or quote_value is null then
      raise exception 'payment kind, device count or configured price is invalid'
        using errcode = '23514';
    end if;

    if new.kind = 'join_first' then
      if already_joined then
        raise exception 'first-purchase entitlement is already active'
          using errcode = '23514';
      end if;
      if exists (
        select 1 from public.payment_requests r
         where r.user_id = new.user_id and r.kind = 'join_first'
           and r.status = 'pending'
      ) then
        raise exception 'a first-purchase request is already pending'
          using errcode = '23514';
      end if;
    elsif new.kind in ('plan_1m','plan_3m','plan_6m','extra_device')
          and not coalesce(new.is_grant, false)
          and join_required and not already_joined then
      raise exception 'the first-purchase entitlement must be approved before renewals or add-ons'
        using errcode = '23514';
    end if;

    if new.kind = 'extra_device' and mode_text = 'tier' and current_allowance >= 10 then
      raise exception 'the tiered device maximum is 10'
        using errcode = '23514';
    end if;

    -- These two values are never accepted from the payload. A modified client
    -- may send them, but the authoritative values replace them before RLS and
    -- CHECK constraints inspect the row.
    new.pricing_mode := mode_text;
    new.quoted_amount_mmk := quote_value;
    return new;
  end if;

  -- The SQL editor/service role may repair the commercial fields of a still-
  -- pending legacy row. It does not get a status-transition escape: approval
  -- remains subject to the same state machine and entitlement trigger.
  if ((pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null
       and public.hnk_request_role() = 'service_role')
      or (pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is null
          and auth.uid() is null))
     and old.status = 'pending' and new.status = 'pending' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.txn_last6 is distinct from old.txn_last6
     or new.screenshot_path is distinct from old.screenshot_path
     or new.amount_mmk is distinct from old.amount_mmk
     or new.is_grant is distinct from old.is_grant
     or new.device_count is distinct from old.device_count
     or new.pricing_mode is distinct from old.pricing_mode
     or new.quoted_amount_mmk is distinct from old.quoted_amount_mmk
     or new.created_at is distinct from old.created_at then
    raise exception 'payment commercial fields are immutable after submission'
      using errcode = '23514';
  end if;

  if old.status <> 'pending' or new.status not in ('approved','rejected') then
    raise exception 'payment review may only move pending to approved or rejected'
      using errcode = '23514';
  end if;
  if new.reviewed_at is null or new.reviewed_by is null then
    raise exception 'a terminal payment review requires reviewer and time'
      using errcode = '23514';
  end if;
  if auth.uid() is not null and new.reviewed_by is distinct from auth.uid() then
    raise exception 'reviewed_by must be the signed-in admin'
      using errcode = '23514';
  end if;

  -- Rows filed before v5.42.1 have no stored quote. Derive it once only when
  -- approving; rejection must remain available for malformed/unpriced legacy
  -- rows so an unsafe queue entry can always be closed without entitlement.
  if new.status = 'approved'
     and (old.pricing_mode is null or old.quoted_amount_mmk is null) then
    select q.out_mode, q.out_quote into mode_text, quote_value
      from public.hnk_payment_quote(old.user_id, old.kind, old.device_count, old.is_grant) q;
    if mode_text is null or quote_value is null then
      raise exception 'legacy payment cannot be reviewed until its price/device shape is reconciled'
        using errcode = '23514';
    end if;
    new.pricing_mode := mode_text;
    new.quoted_amount_mmk := quote_value;
  end if;
  return new;
end;
$$;

drop trigger if exists hnk_guard_payment_request on public.payment_requests;
create trigger hnk_guard_payment_request
  before insert or update on public.payment_requests
  for each row execute function public.hnk_guard_payment_request();

-- ---------------------------------------------------------------------------
-- 5. devices — legacy clients may manage only their own compatibility rows.
--    Cross-account resets belong to the strict server-owned /v1/admin API.
-- ---------------------------------------------------------------------------
alter table public.devices enable row level security;

drop policy if exists devices_service_all on public.devices;
create policy devices_service_all on public.devices
  for all to public
  using (public.hnk_request_role() = 'service_role')
  with check (public.hnk_request_role() = 'service_role');

drop policy if exists devices_all_own_or_admin on public.devices;
drop policy if exists devices_read_own_or_admin on public.devices;
drop policy if exists devices_all_own on public.devices;
create policy devices_all_own on public.devices
  for all to public
  using (public.hnk_request_role() = 'authenticated'
         and user_id = auth.uid())
  with check (public.hnk_request_role() = 'authenticated'
              and user_id = auth.uid());

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
  if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null
     and not coalesce(public.hnk_request_role() in ('authenticated', 'service_role'), false) then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- As with payment inserts, this definer trigger runs before RLS. Reject a
  -- forged user_id uniformly before taking a victim's lock or revealing their
  -- device count/cap; cross-account management stays in the trusted service path.
  if auth.uid() is not null and new.user_id is distinct from auth.uid()
     and not public.hnk_is_admin() then
    raise exception 'device user does not match authenticated caller'
      using errcode = '42501';
  end if;

  -- The profile row is the per-account entitlement mutex. Device inserts and
  -- payment approvals take the same lock, so neither two new registrations nor
  -- a registration racing a smaller tier approval can both validate against
  -- stale counts. Lock BEFORE the duplicate check so a concurrent re-register
  -- sees the first committed row and remains a silent no-op.
  select coalesce(allowed_devices, 2) into cap
    from public.profiles where id = new.user_id
    for update;
  if not found then
    raise exception 'device profile is unavailable' using errcode = 'P0001';
  end if;

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
  -- THE BOOTSTRAP ESCAPE, and without it this file is self-defeating. In
  -- Supabase, auth.uid() is NULL in the SQL editor/service-owner connection,
  -- which already bypasses RLS. In the roleless API the owner is FORCE-RLS
  -- constrained, so only an explicit internal service context receives the
  -- same ability. A missing/unknown context fails closed; an authenticated
  -- customer always takes the guarded branch below.
  if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null then
    if public.hnk_request_role() = 'service_role' then
      return new;
    end if;
    if public.hnk_request_role() is distinct from 'authenticated' then
      raise exception 'authentication required' using errcode = '42501';
    end if;
  elsif auth.uid() is null then
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
    new.account_status  := 'pending';
    -- v5.34: a self-inserted row must not arrive already joined, nor carrying
    -- a price of its own choosing
    new.joined_paid               := false;
    new.price_1m_override         := null;
    new.price_3m_override         := null;
    new.price_6m_override         := null;
    new.price_join_first_override := null;
    -- v5.37: identity comes from the identity provider rather than the payload.
    -- Supabase can read auth.users here. In roleless mode db.js reads it while
    -- briefly in the internal service context, then pins that trusted value in
    -- request.user_email before narrowing the transaction to authenticated.
    -- Coalesce preserves the supplied value only if that authoritative value is
    -- unexpectedly absent (profiles.id still references auth.users.id).
    if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null then
      new.email := coalesce(nullif(pg_catalog.current_setting('request.user_email', true), ''), new.email);
    else
      new.email := coalesce((select u.email from auth.users u where u.id = new.id), new.email);
    end if;
    return new;
  end if;
  new.plan_status     := old.plan_status;
  new.plan_expires_at := old.plan_expires_at;
  new.allowed_devices := old.allowed_devices;
  new.is_admin        := old.is_admin;
  new.account_status  := old.account_status;
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
  --   * the strict admin grant endpoint resolves a student by normalized
  --     email, so a second row claiming that address would make the target
  --     ambiguous;
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
-- rather than guess"), and the strict admin service writes only the review
-- transition for the same reason. If both extended the plan, every approval
-- would count twice.
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
  already_joined boolean;
  current_allowance integer;
  registered_devices integer;
  settings_rows integer;
  join_required boolean;
begin
  if old.status <> 'pending' or new.status <> 'approved' then
    return new;
  end if;

  -- Serialize entitlement changes for this account. Two admins, two tabs or
  -- two pending requests must observe one ordered state, not both calculate
  -- from the same stale allowance and overwrite each other.
  select (p.joined_paid or p.plan_expires_at is not null
          or coalesce(p.plan_status, 'none') <> 'none'),
         coalesce(p.allowed_devices, 2),
         greatest(coalesce(p.plan_expires_at, now()), now())
    into already_joined, current_allowance, base
    from public.profiles p
   where p.id = new.user_id
     for update;
  if not found then
    raise exception 'payment profile is unavailable' using errcode = '23514';
  end if;

  -- A pending row can pre-date the server-authored quote columns. Re-check the
  -- current authoritative join policy while the profile lock is held, so a
  -- legacy renewal/add-on cannot become the evidence that makes an account
  -- look joined. Flat deployments with no configured joining fee preserve the
  -- historical renew-first flow; grants remain the explicit admin exception.
  select count(*),
         coalesce(bool_or(
           coalesce(a.price_device_1, 0) > 0
           or coalesce(p.price_join_first_override, a.price_join_first, 0) > 0
         ), false)
    into settings_rows, join_required
    from public.app_settings a
    join public.profiles p on p.id = new.user_id;
  if settings_rows <> 1 then
    raise exception 'payment settings must contain exactly one row'
      using errcode = '23514';
  end if;

  if not coalesce(new.is_grant, false)
     and new.kind in ('plan_1m','plan_3m','plan_6m','extra_device')
     and join_required and not already_joined then
    raise exception 'the first-purchase entitlement must be approved before renewals or add-ons'
      using errcode = '23514';
  end if;

  if new.kind = 'join_first' then
    if already_joined then
      raise exception 'first-purchase entitlement is already active'
        using errcode = '23514';
    end if;
    if new.pricing_mode = 'tier' then
      if new.device_count is null or new.device_count < 1 or new.device_count > 10
         or new.quoted_amount_mmk is null then
        raise exception 'tiered first purchase has no valid server quote/device count'
          using errcode = '23514';
      end if;
      -- A pre-tier account with manually granted/add-on entitlement needs an
      -- explicit owner decision; silently replacing it with an absolute bundle
      -- can erase a slot that was already paid for.
      if current_allowance <> 2 then
        raise exception 'existing device entitlement must be reconciled before a tier bundle'
          using errcode = '23514';
      end if;
      select count(*) into registered_devices
        from public.devices d where d.user_id = new.user_id;
      if registered_devices > new.device_count then
        raise exception 'remove registered devices before approving this smaller bundle'
          using errcode = '23514';
      end if;
    elsif new.pricing_mode not in ('flat','grant') then
      raise exception 'first purchase has no valid pricing mode'
        using errcode = '23514';
    end if;
  elsif new.kind = 'extra_device' and new.pricing_mode = 'tier' then
    if not already_joined then
      raise exception 'tier add-on requires an approved base bundle'
        using errcode = '23514';
    end if;
    if current_allowance >= 10 then
      raise exception 'the tiered device maximum is 10'
        using errcode = '23514';
    end if;
  end if;

  if new.kind = 'plan_1m' then months := 1;
  elsif new.kind = 'plan_3m' then months := 3;
  elsif new.kind = 'plan_6m' then months := 6;
  elsif new.kind = 'join_first' then
    -- v5.34 — the one-time joining fee also opens the first period, and how
    -- long that period is belongs to the owner, not to this file. Default 1.
    -- The singleton check above has already rejected zero or duplicate rows.
    -- ORDER BY ctid remains deterministic defence in depth without depending
    -- on a named key that legacy app_settings tables may not have.
    select coalesce(nullif(a.join_first_months, 0), 1) into months
      from public.app_settings a order by a.ctid limit 1;
    months := coalesce(months, 1);
  end if;

  if months > 0 then
    update public.profiles
       set plan_status     = 'active',
           account_status  = 'active',
           plan_expires_at = coalesce(base, now()) + (months || ' months')::interval,
           -- v5.34 — settling the joining fee is what clears it, and nothing
           -- else does. A plan_1m approval leaves joined_paid alone, so a
           -- customer cannot buy a cheap month to skip the joining fee.
           joined_paid     = case when new.kind = 'join_first' then true else joined_paid end,
           -- Only a server-quoted tier may set an absolute bundle. A flat or
           -- admin-grant join preserves the historical allowance.
           allowed_devices = case when new.kind = 'join_first' and new.pricing_mode = 'tier'
                                   then new.device_count
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
-- 8. payment proofs — a private bucket, own folder in, service-reviewed
--
-- The app uploads to payment-proofs/<uid>/<kind>-<ts>.<ext>. A browser may
-- read only its own object; the strict admin API resolves a payment id and
-- reads the proof with service_role after admin-session + MFA checks. The
-- bucket stays private so no bank slip has a permanent public URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists proofs_insert_own on storage.objects;
drop policy if exists proofs_service_all on storage.objects;
create policy proofs_service_all on storage.objects
  for all to public
  using (public.hnk_request_role() = 'service_role')
  with check (public.hnk_request_role() = 'service_role');

create policy proofs_insert_own on storage.objects
  for insert to public
  with check (
    public.hnk_request_role() = 'authenticated'
    and bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists proofs_read_own_or_admin on storage.objects;
drop policy if exists proofs_read_own on storage.objects;
create policy proofs_read_own on storage.objects
  for select to public
  using (
    public.hnk_request_role() = 'authenticated'
    and bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A plain PostgreSQL table owner bypasses RLS unless FORCE is set. Do that only
-- for the roleless API marker: Supabase's trusted SQL editor/service-owner flow
-- deliberately retains its platform-native bypass semantics.
do $$
begin
  if pg_catalog.to_regprocedure('auth.hnk_roleless_runtime()') is not null then
    alter table public.profiles force row level security;
    alter table public.payment_requests force row level security;
    alter table public.app_settings force row level security;
    alter table public.devices force row level security;
    alter table storage.objects force row level security;
  end if;
end $$;

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

-- ---------------------------------------------------------------------------
-- 10. unified accounts, licenses, devices, sessions and audit history (v5.43)
--
-- This section is strictly additive. The four legacy application tables and
-- their columns remain available while server-owned `/v1` APIs use the
-- canonical records below. Every table is RLS-enabled even though sensitive
-- writes are performed only by the server after live-session authorization.
-- ---------------------------------------------------------------------------

create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (name in ('student','admin')),
  created_at timestamptz not null default now()
);

insert into public.roles (name) values ('student'), ('admin')
on conflict (name) do nothing;

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p
join public.roles r on r.name = case when p.is_admin then 'admin' else 'student' end
on conflict (user_id, role_id) do nothing;

create table if not exists public.licenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  status     text not null default 'active' check (status in ('active','revoked')),
  starts_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

insert into public.licenses (user_id, status, starts_at, expires_at)
select p.id,
       case when p.plan_expires_at > now() and p.plan_status = 'active' then 'active' else 'revoked' end,
       least(p.created_at, p.plan_expires_at - interval '1 second'),
       p.plan_expires_at
  from public.profiles p
 where p.plan_expires_at is not null
   and p.plan_expires_at > least(p.created_at, p.plan_expires_at - interval '1 second')
on conflict (user_id) do nothing;

create table if not exists public.app_permissions (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  web_app_enabled      boolean not null default true,
  ccx_download_enabled boolean not null default true,
  panel_enabled        boolean not null default true,
  updated_by           uuid references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now()
);

insert into public.app_permissions (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create table if not exists public.device_slots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  slot_type  text not null check (slot_type in ('phone','computer')),
  status     text not null default 'active' check (status in ('active','reset')),
  generation integer not null default 1 check (generation > 0),
  label      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reset_at   timestamptz,
  unique (user_id, slot_type)
);

create table if not exists public.device_installations (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid not null references public.device_slots (id) on delete cascade,
  client_type       text not null check (client_type in ('web','panel')),
  installation_hash text not null,
  label             text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  revoked_at        timestamptz,
  unique (slot_id, client_type, installation_hash)
);

create unique index if not exists device_installations_active_client_uniq
  on public.device_installations (slot_id, client_type)
  where revoked_at is null;
create unique index if not exists device_installations_active_hash_uniq
  on public.device_installations (installation_hash)
  where revoked_at is null;

create table if not exists public.sessions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  device_installation_id uuid references public.device_installations (id) on delete set null,
  client_type            text not null check (client_type in ('web','panel','admin')),
  refresh_token_hash     text not null unique,
  created_at             timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  expires_at             timestamptz not null,
  revoked_at             timestamptz,
  revoked_reason         text,
  ip_hash                text,
  user_agent             text,
  mfa_verified_at        timestamptz,
  check (expires_at > created_at)
);

create index if not exists sessions_user_active_idx
  on public.sessions (user_id, expires_at) where revoked_at is null;

create table if not exists public.login_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  session_id      uuid references public.sessions (id) on delete set null,
  event_type      text not null check (event_type in ('login','failed_login','refresh','logout','forced_logout','password_reset')),
  occurred_at     timestamptz not null default now(),
  client_type     text not null default 'web' check (client_type in ('web','panel','admin')),
  success         boolean not null,
  attempted_email text,
  device_type     text,
  device_name     text,
  ip_hash         text,
  user_agent      text,
  failure_reason  text
);

-- Authentication records MFA failures in the same immutable history stream.
-- Name the constraint explicitly so upgrading an older inline CHECK is
-- idempotent and cannot leave the API writing an event the database rejects.
alter table public.login_history drop constraint if exists login_history_event_type_check;
alter table public.login_history add constraint login_history_event_type_check
  check (event_type in ('login','failed_login','refresh','logout','forced_logout','password_reset','mfa_failed'));

create index if not exists login_history_user_time_idx
  on public.login_history (user_id, occurred_at desc);
create index if not exists login_history_failed_email_idx
  on public.login_history (lower(attempted_email), occurred_at desc)
  where success = false;
create index if not exists login_history_failed_ip_idx
  on public.login_history (ip_hash, occurred_at desc)
  where success = false;
create index if not exists login_history_mfa_failed_user_idx
  on public.login_history (user_id, occurred_at desc)
  where success = false and event_type = 'mfa_failed';

create table if not exists public.download_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  session_id     uuid references public.sessions (id) on delete set null,
  device_slot_id uuid references public.device_slots (id) on delete set null,
  panel_version  text,
  artifact_key   text,
  token_hash     text unique,
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz,
  downloaded_at  timestamptz,
  completed_at   timestamptz,
  result         text not null check (result in ('issued','streaming','downloaded','failed','denied','expired','invalid')),
  reason         text,
  ip_hash        text,
  user_agent     text
);

alter table public.download_history add column if not exists completed_at timestamptz;
alter table public.download_history drop constraint if exists download_history_result_check;
alter table public.download_history add constraint download_history_result_check
  check (result in ('issued','streaming','downloaded','failed','denied','expired','invalid'));

create index if not exists download_history_user_time_idx
  on public.download_history (user_id, issued_at desc);
create index if not exists download_history_streaming_user_idx
  on public.download_history (user_id, downloaded_at desc)
  where result = 'streaming';

create table if not exists public.admin_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid not null references auth.users (id) on delete restrict,
  target_user_id uuid references auth.users (id) on delete set null,
  action         text not null,
  created_at     timestamptz not null default now(),
  details        jsonb not null default '{}'::jsonb,
  ip_hash        text,
  user_agent     text
);

create index if not exists admin_audit_target_time_idx
  on public.admin_audit_logs (target_user_id, created_at desc);

create table if not exists public.panel_versions (
  version           text primary key check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  is_latest         boolean not null default false,
  minimum_supported boolean not null default false,
  enabled           boolean not null default true,
  artifact_key      text not null,
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes        bigint check (size_bytes is null or size_bytes > 0),
  released_at       timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null
);

create unique index if not exists panel_versions_one_latest_idx
  on public.panel_versions (is_latest) where is_latest;
create unique index if not exists panel_versions_one_minimum_idx
  on public.panel_versions (minimum_supported) where minimum_supported;

insert into public.panel_versions
  (version, is_latest, minimum_supported, enabled, artifact_key, sha256, size_bytes)
values ('6.24.0', true, true, false, 'HNK_Ai_Panel_v6.24.0.ccx',
        'ef7d5fe2e34d682a086fed3b3bdcb83ac7ba32e27f4094f81df630647f310725', 92228620)
on conflict (version) do nothing;

create table if not exists public.device_pairing_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  slot_id     uuid not null references public.device_slots (id) on delete cascade,
  code_hash   text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > created_at)
);

create table if not exists public.device_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  device_slot_id uuid references public.device_slots (id) on delete set null,
  actor_user_id  uuid references auth.users (id) on delete set null,
  event_type     text not null check (event_type in ('registered','paired','seen','reset','blocked')),
  client_type    text check (client_type is null or client_type in ('web','panel')),
  label          text,
  created_at     timestamptz not null default now(),
  details        jsonb not null default '{}'::jsonb
);

create index if not exists device_history_user_time_idx
  on public.device_history (user_id, created_at desc);

create table if not exists public.admin_mfa (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  encrypted_secret text not null,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Rotation never replaces the confirmed secret until the new TOTP proves it
-- works. Existing deployments receive the staging column idempotently.
alter table public.admin_mfa
  add column if not exists pending_encrypted_secret text;

-- Signup, login, recovery and password-change throttles are durable server state. Email/IP values are
-- one-way hashes and this table has no browser-readable policy or grant.
create table if not exists public.auth_attempts (
  id          uuid primary key default gen_random_uuid(),
  operation   text not null,
  occurred_at timestamptz not null default now(),
  ip_hash     text not null,
  email_hash  text
);

alter table public.auth_attempts drop constraint if exists auth_attempts_operation_check;
alter table public.auth_attempts add constraint auth_attempts_operation_check
  check (operation in ('signup','login','login_admission','recover','recovery_probe','password_change'));

create index if not exists auth_attempts_operation_ip_time_idx
  on public.auth_attempts (operation, ip_hash, occurred_at desc);
create index if not exists auth_attempts_operation_email_ip_time_idx
  on public.auth_attempts (operation, email_hash, ip_hash, occurred_at desc)
  where email_hash is not null;
create index if not exists auth_attempts_operation_email_time_idx
  on public.auth_attempts (operation, email_hash, occurred_at desc)
  where email_hash is not null;
create index if not exists auth_attempts_operation_time_idx
  on public.auth_attempts (operation, occurred_at desc);
create index if not exists auth_attempts_occurred_at_idx
  on public.auth_attempts (occurred_at);

-- Paid panel binaries are not repository assets. An MFA-verified admin uploads
-- them in bounded chunks; the server enables a release only after recomputing
-- the complete artifact digest and size. These tables have no client grants or
-- policies: only the server-owned transaction path may read/write the bytes.
create table if not exists public.panel_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  version             text not null unique check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  artifact_key        text not null unique,
  expected_sha256     text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_size_bytes bigint not null check (expected_size_bytes > 0 and expected_size_bytes <= 536870912),
  chunk_size_bytes    integer not null check (chunk_size_bytes between 65536 and 4194304),
  chunk_count         integer not null check (chunk_count > 0 and chunk_count <= 8192),
  status              text not null default 'uploading' check (status in ('uploading','ready','failed')),
  uploaded_size_bytes bigint not null default 0 check (uploaded_size_bytes >= 0),
  created_by          uuid not null references auth.users (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finalized_at        timestamptz
);

create table if not exists public.panel_artifact_chunks (
  artifact_id uuid not null references public.panel_artifacts (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  data        bytea not null,
  size_bytes  integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (artifact_id, chunk_index),
  check (octet_length(data) = size_bytes and octet_length(data) <= 4194304)
);

create index if not exists panel_artifacts_ready_idx
  on public.panel_artifacts (version, status);

alter table public.panel_versions
  add column if not exists artifact_id uuid references public.panel_artifacts (id) on delete set null;

-- Existing deployments may have received the metadata-only seed from an
-- earlier build. It must not remain downloadable without a finalized private
-- artifact. Once a matching artifact is ready this update becomes a no-op.
update public.panel_versions v
   set enabled = false, artifact_id = null
 where v.version = '6.24.0'
   and not exists (
     select 1 from public.panel_artifacts a
      where a.version = v.version and a.artifact_key = v.artifact_key
        and a.expected_sha256 = v.sha256 and a.expected_size_bytes = v.size_bytes
        and a.status = 'ready'
   );

-- profiles.is_admin is the bootstrap source of truth for the canonical admin
-- role. Re-running the schema removes stale grants before inserting the exact
-- set of current administrators.
delete from public.user_roles ur
 using public.roles r
 where ur.role_id = r.id
   and r.name = 'admin'
   and not exists (
     select 1 from public.profiles p
      where p.id = ur.user_id and p.is_admin = true
   );

insert into public.user_roles (user_id, role_id)
select p.id, r.id
  from public.profiles p
  join public.roles r on r.name = 'admin'
 where p.is_admin = true
on conflict (user_id, role_id) do nothing;

create or replace function public.hnk_sync_admin_role_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_role_id uuid;
begin
  select id into admin_role_id from public.roles where name = 'admin';
  if new.is_admin = true then
    insert into public.user_roles (user_id, role_id)
    values (new.id, admin_role_id)
    on conflict (user_id, role_id) do nothing;
  else
    delete from public.user_roles
     where user_id = new.id and role_id = admin_role_id;
    if tg_op = 'UPDATE' then
      if coalesce(old.is_admin, false) = true then
        update public.sessions
           set revoked_at = now()
         where user_id = new.id and revoked_at is null;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.hnk_sync_admin_role_from_profile() from public;

drop trigger if exists hnk_sync_admin_role_from_profile on public.profiles;
create trigger hnk_sync_admin_role_from_profile
  after insert or update of is_admin on public.profiles
  for each row execute function public.hnk_sync_admin_role_from_profile();

-- Server RBAC uses user_roles. The earlier hnk_is_admin() definition remains a
-- deliberately protected compatibility path for legacy RLS and first-admin
-- bootstrap; profile triggers prevent customers from editing is_admin.

-- Keep canonical licenses synchronized when the legacy payment trigger extends
-- plan_expires_at. The canonical record remains the server policy source.
create or replace function public.hnk_sync_legacy_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_expires_at is not null
     and (old.plan_expires_at is distinct from new.plan_expires_at
          or old.plan_status is distinct from new.plan_status) then
    insert into public.licenses (user_id, status, starts_at, expires_at)
    values (new.id,
            case when new.plan_status = 'active' and new.plan_expires_at > now()
                 then 'active' else 'revoked' end,
            least(now(), new.plan_expires_at - interval '1 second'),
            new.plan_expires_at)
    on conflict (user_id) do update
      set status = excluded.status,
          starts_at = least(public.licenses.starts_at, excluded.starts_at),
          expires_at = excluded.expires_at,
          updated_at = now();
  end if;
  return new;
end;
$$;
revoke all on function public.hnk_sync_legacy_license() from public;

drop trigger if exists hnk_sync_legacy_license on public.profiles;
create trigger hnk_sync_legacy_license
  after update of plan_status, plan_expires_at on public.profiles
  for each row execute function public.hnk_sync_legacy_license();

-- Explicit grants and policies: a policy without a grant is not an access path,
-- and broad default grants are removed before the intended read-only surface is
-- added back. All writes go through server-owned `/v1` transactions.
revoke all on public.roles, public.user_roles, public.licenses,
  public.app_permissions, public.device_slots, public.device_installations,
  public.sessions, public.login_history, public.download_history,
  public.admin_audit_logs, public.panel_versions, public.device_pairing_codes,
  public.device_history, public.admin_mfa, public.auth_attempts, public.panel_artifacts,
  public.panel_artifact_chunks from public, anon, authenticated;

grant select on public.roles, public.user_roles, public.licenses,
  public.app_permissions, public.device_slots, public.device_installations,
  public.login_history, public.download_history, public.panel_versions,
  public.device_history to authenticated;

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.licenses enable row level security;
alter table public.app_permissions enable row level security;
alter table public.device_slots enable row level security;
alter table public.device_installations enable row level security;
alter table public.sessions enable row level security;
alter table public.login_history enable row level security;
alter table public.download_history enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.panel_versions enable row level security;
alter table public.device_pairing_codes enable row level security;
alter table public.device_history enable row level security;
alter table public.admin_mfa enable row level security;
alter table public.auth_attempts enable row level security;
alter table public.panel_artifacts enable row level security;
alter table public.panel_artifact_chunks enable row level security;

drop policy if exists roles_read_authenticated on public.roles;
create policy roles_read_authenticated on public.roles for select to authenticated using (true);
drop policy if exists user_roles_read_own_or_admin on public.user_roles;
drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles for select to authenticated
  using (user_id = auth.uid());
drop policy if exists licenses_read_own_or_admin on public.licenses;
drop policy if exists licenses_read_own on public.licenses;
create policy licenses_read_own on public.licenses for select to authenticated
  using (user_id = auth.uid());
drop policy if exists permissions_read_own_or_admin on public.app_permissions;
drop policy if exists permissions_read_own on public.app_permissions;
create policy permissions_read_own on public.app_permissions for select to authenticated
  using (user_id = auth.uid());
drop policy if exists device_slots_read_own_or_admin on public.device_slots;
drop policy if exists device_slots_read_own on public.device_slots;
create policy device_slots_read_own on public.device_slots for select to authenticated
  using (user_id = auth.uid());
drop policy if exists device_installations_read_own_or_admin on public.device_installations;
drop policy if exists device_installations_read_own on public.device_installations;
create policy device_installations_read_own on public.device_installations for select to authenticated
  using (exists (select 1 from public.device_slots s
                 where s.id = slot_id and s.user_id = auth.uid()));
drop policy if exists login_history_read_own_or_admin on public.login_history;
drop policy if exists login_history_read_own on public.login_history;
create policy login_history_read_own on public.login_history for select to authenticated
  using (user_id = auth.uid());
drop policy if exists download_history_read_own_or_admin on public.download_history;
drop policy if exists download_history_read_own on public.download_history;
create policy download_history_read_own on public.download_history for select to authenticated
  using (user_id = auth.uid());
drop policy if exists panel_versions_read_authenticated on public.panel_versions;
create policy panel_versions_read_authenticated on public.panel_versions for select to authenticated using (true);
drop policy if exists device_history_read_own_or_admin on public.device_history;
drop policy if exists device_history_read_own on public.device_history;
create policy device_history_read_own on public.device_history for select to authenticated
  using (user_id = auth.uid());
