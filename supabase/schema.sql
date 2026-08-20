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
-- Then make yourself an admin (replace the address):
--
--     update public.profiles set is_admin = true
--     where email = 'you@example.com';
--
-- WHAT THE APP EXPECTS, so this file and the client cannot drift:
--   profiles          id, name, email, created_at, plan_status, plan_expires_at,
--                     allowed_devices, is_admin
--   payment_requests  id, user_id, kind, txn_last6, screenshot_path, status,
--                     reviewed_at, reviewed_by, note, created_at
--   kind              plan_1m | plan_3m | plan_6m | extra_device
--   status            pending | approved | rejected
--   storage bucket    payment-proofs, private, objects at <uid>/<kind>-<ts>.<ext>
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. columns the client reads
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists plan_status text not null default 'none';
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists allowed_devices integer not null default 2;

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
    and kind in ('plan_1m','plan_3m','plan_6m','extra_device')
    -- a request always starts pending; a client that tries to insert itself as
    -- approved is refused rather than trusted
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
-- 5. devices
-- ---------------------------------------------------------------------------
alter table public.devices enable row level security;

drop policy if exists devices_all_own_or_admin on public.devices;
create policy devices_all_own_or_admin on public.devices
  for all to authenticated
  using (user_id = auth.uid() or public.hnk_is_admin())
  with check (user_id = auth.uid() or public.hnk_is_admin());

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
  if public.hnk_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan_status     := 'none';
    new.plan_expires_at := null;
    new.allowed_devices := 2;
    new.is_admin        := false;
    return new;
  end if;
  new.plan_status     := old.plan_status;
  new.plan_expires_at := old.plan_expires_at;
  new.allowed_devices := old.allowed_devices;
  new.is_admin        := old.is_admin;
  return new;
end;
$$;

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
  end if;

  if months > 0 then
    select greatest(coalesce(p.plan_expires_at, now()), now())
      into base from public.profiles p where p.id = new.user_id;
    update public.profiles
       set plan_status     = 'active',
           plan_expires_at = coalesce(base, now()) + (months || ' months')::interval
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
