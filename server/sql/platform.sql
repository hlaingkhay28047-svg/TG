-- ============================================================================
-- HNK roleless platform schema.
--
-- DigitalOcean's App Platform development database gives the application a
-- restricted runtime login. It can create objects in the already-existing
-- public schema, but it cannot CREATE SCHEMA or CREATE ROLE. Keep every object
-- the API owns in public so a fresh deployment needs no one-time administrator
-- grant. The hnk_ prefix prevents collisions with application tables.
--
-- APPLY ORDER: platform.sql -> schema.sql. Both files are idempotent.
-- ============================================================================

-- Never silently switch an already-initialized roleless database from the old
-- auth/storage dialect to parallel empty public tables. Such a database needs
-- an explicit data + foreign-key migration; refusing here preserves every
-- account, refresh session and proof until that migration is reviewed.
do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where (n.nspname, c.relname) in
           (('auth', 'users'), ('auth', 'refresh_tokens'),
            ('storage', 'buckets'), ('storage', 'objects'))
  ) then
    raise exception
      'legacy auth/storage tables detected; explicit data and foreign-key migration required'
      using errcode = '55000';
  end if;
end $$;

-- Marker used by schema.sql to enable FORCE RLS and fail closed whenever the
-- transaction-local request context has not been set by server/lib/db.js.
create or replace function public.hnk_roleless_runtime() returns boolean
language sql
immutable
as $$ select true $$;

revoke all on function public.hnk_roleless_runtime() from public;

-- The one request identity primitive used by every policy. A verified bearer
-- token contributes only its UUID; server/lib/db.js writes it with SET LOCAL.
create or replace function public.hnk_uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

revoke all on function public.hnk_uid() from public;

-- Password hashes and recovery data are API-private. FORCE RLS matters even
-- though the restricted database login owns the table: only service context
-- may inspect or mutate identity rows.
create table if not exists public.hnk_auth_users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  recovery_token     text,
  recovery_sent_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists hnk_auth_users_email_uniq
  on public.hnk_auth_users (lower(email));

alter table public.hnk_auth_users enable row level security;
drop policy if exists hnk_auth_users_service_all on public.hnk_auth_users;
create policy hnk_auth_users_service_all on public.hnk_auth_users
  for all to public
  using (current_setting('request.role', true) = 'service_role')
  with check (current_setting('request.role', true) = 'service_role');
alter table public.hnk_auth_users force row level security;
revoke all on public.hnk_auth_users from public;

-- Refresh tokens are revocable server state. They are intentionally not
-- exposed through the generic REST table allow-list.
create table if not exists public.hnk_auth_refresh_tokens (
  token      text primary key,
  user_id    uuid not null references public.hnk_auth_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists hnk_auth_refresh_tokens_user_idx
  on public.hnk_auth_refresh_tokens (user_id);

alter table public.hnk_auth_refresh_tokens enable row level security;
drop policy if exists hnk_auth_refresh_tokens_service_all on public.hnk_auth_refresh_tokens;
create policy hnk_auth_refresh_tokens_service_all on public.hnk_auth_refresh_tokens
  for all to public
  using (current_setting('request.role', true) = 'service_role')
  with check (current_setting('request.role', true) = 'service_role');
alter table public.hnk_auth_refresh_tokens force row level security;
revoke all on public.hnk_auth_refresh_tokens from public;

-- Low-volume payment-proof storage. Bytes and metadata share one RLS row, so
-- there is no public object URL or second authorization system.
create table if not exists public.hnk_storage_buckets (
  id     text primary key,
  name   text,
  public boolean not null default false
);

create table if not exists public.hnk_storage_objects (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text references public.hnk_storage_buckets (id),
  name         text not null,
  owner        uuid references public.hnk_auth_users (id) on delete set null,
  mime_type    text,
  data         bytea,
  created_at   timestamptz not null default now()
);

create unique index if not exists hnk_storage_objects_bucket_name_uniq
  on public.hnk_storage_objects (bucket_id, name);

create or replace function public.hnk_foldername(name text) returns text[]
language sql
immutable
as $$ select string_to_array(name, '/') $$;

revoke all on function public.hnk_foldername(text) from public;

alter table public.hnk_storage_buckets enable row level security;
drop policy if exists hnk_storage_buckets_service_all on public.hnk_storage_buckets;
create policy hnk_storage_buckets_service_all on public.hnk_storage_buckets
  for all to public
  using (current_setting('request.role', true) = 'service_role')
  with check (current_setting('request.role', true) = 'service_role');
alter table public.hnk_storage_buckets force row level security;
revoke all on public.hnk_storage_buckets from public;

alter table public.hnk_storage_objects enable row level security;
revoke all on public.hnk_storage_objects from public;
