-- ============================================================================
-- HNK platform schema — the parts Supabase used to supply.
--
-- WHY THIS FILE EXISTS. supabase/schema.sql protects four tables with row-level
-- security, and every one of its 18 guards asks the same question: `auth.uid()`.
-- On Supabase that function reads the JWT the Auth service issued, and
-- auth.users, storage.buckets/objects and the request identity context came
-- with the platform. On a plain PostgreSQL cluster none of that exists, so the
-- app schema would not even load.
--
-- This file creates those objects for real. It is deliberately shaped so that
-- supabase/schema.sql still applies on Supabase and here: same function name,
-- same signature and same request semantics. That is what lets the whole tested
-- security model — and test/verify_schema_behaviour.js's 21 checks — survive a
-- move off Supabase instead of being rewritten in application code, which is
-- where authorisation bugs live.
--
-- APPLY ORDER:  platform.sql  ->  supabase/schema.sql
-- Both are idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. schemas and the roleless-runtime marker
--
-- A DigitalOcean development database gives the app one database owner but no
-- cluster administrator. Cluster-wide CREATE ROLE is therefore unavailable.
-- Request roles are transaction-local values set only by server/lib/db.js;
-- schema.sql recognises this marker, pins every request table behind FORCE RLS,
-- and refuses a connection with no explicit request context.
-- ---------------------------------------------------------------------------

-- CREATING SCHEMAS NEEDS A PRIVILEGE THE DATABASE USER MAY NOT HAVE. A
-- freshly provisioned managed-database user is CONNECT-only by default — CREATE
-- on the database, which governs CREATE SCHEMA, belongs to the owner alone
-- until an admin grants it. Same shape as the role bootstrap above: caught and
-- re-raised naming the exact remedy, with the database and the connecting role
-- read from the connection itself rather than guessed, since a hand-typed
-- identifier that is even slightly wrong is a second round trip to find out.
do $$
begin
  create schema if not exists auth;
  create schema if not exists storage;
exception when insufficient_privilege then
  raise exception
    'this database user cannot CREATE SCHEMA. Run once as an admin: %',
    format('grant create on database %I to %I;', current_database(), current_user)
    using errcode = 'insufficient_privilege';
end $$;

create or replace function auth.hnk_roleless_runtime() returns boolean
language sql
immutable
as $$ select true $$;

-- Detection needs only the catalogue entry. Keeping execution owner-only stops
-- this implementation marker becoming an accidental public API.
revoke all on function auth.hnk_roleless_runtime() from public;

-- ---------------------------------------------------------------------------
-- 2. auth.users — the identity table profiles.id references
--
-- Supabase kept the password hash and the confirmation state private to its
-- Auth service. Here they are columns, and they are NOT readable by anon or
-- authenticated: no grant is issued below, so a customer cannot select another
-- customer's password hash even though the API connects to the same database.
-- Only the service role the API runs as can touch this table.
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  recovery_token     text,
  recovery_sent_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One address, one account — case-insensitively. profiles has the same index
-- for the same reason: admGrant looks a student up by typed email, and a second
-- row claiming that address decides arbitrarily who gets a free VIP period.
create unique index if not exists users_email_uniq on auth.users (lower(email));

-- Auth data contains password hashes, recovery tokens and refresh tokens. The
-- old SET ROLE boundary made these tables unreachable to customer statements;
-- FORCE RLS preserves that separation even though every request now uses the
-- one database-owner login. Only db.asService/migrate set this internal mode.
alter table auth.users enable row level security;
drop policy if exists hnk_auth_users_service_all on auth.users;
create policy hnk_auth_users_service_all on auth.users
  for all to public
  using (current_setting('request.role', true) = 'service_role')
  with check (current_setting('request.role', true) = 'service_role');
alter table auth.users force row level security;

-- ---------------------------------------------------------------------------
-- 3. auth.uid() — the hinge the entire security model turns on
--
-- Identical in name, signature and meaning to Supabase's. It reads a per-
-- transaction setting the API writes after it has verified the caller's token:
--
--     begin;
--     select set_config('request.role', 'authenticated', true),
--            set_config('request.jwt.claim.sub', '<verified uid>', true);
--     ...the app's query...
--     commit;
--
-- The `true` second argument to current_setting means "return null if unset"
-- rather than raising, which is what makes an anonymous request simply have no
-- uid instead of erroring. SET LOCAL is essential: outside a transaction it is
-- silently a no-op, which would leave auth.uid() null and every "the attack was
-- refused" assertion passing for the wrong reason.
-- ---------------------------------------------------------------------------
create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- 4. storage — payment proofs, kept in the database
--
-- Supabase stored the bytes in object storage and the metadata in
-- storage.objects, and supabase/schema.sql's proofs_insert_own /
-- proofs_read_own_or_admin policies are written against that table. Keeping the
-- same table means those two policies apply unchanged; adding `data` means the
-- bytes live under the same row-level security as the metadata, so there is no
-- second system holding customers' bank slips on a guessable URL.
--
-- These are phone screenshots at low volume. If that ever stops being true the
-- column can move to object storage without touching the policies.
-- ---------------------------------------------------------------------------
create table if not exists storage.buckets (
  id     text primary key,
  name   text,
  public boolean not null default false
);

create table if not exists storage.objects (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text references storage.buckets (id),
  name         text not null,
  owner        uuid references auth.users (id) on delete set null,
  mime_type    text,
  data         bytea,
  created_at   timestamptz not null default now()
);

create unique index if not exists objects_bucket_name_uniq
  on storage.objects (bucket_id, name);

-- The policies split a path like "<uid>/plan_1m-1699999999.jpg" and compare the
-- first segment to auth.uid(). Same helper, same behaviour.
create or replace function storage.foldername(name text) returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

-- ROW-LEVEL SECURITY IS ENABLED HERE, and it has to be.
--
-- supabase/schema.sql section 8 creates proofs_insert_own and
-- proofs_read_own_or_admin on storage.objects but never enables RLS on the
-- table, because on Supabase the platform ships it already enabled. A policy on
-- a table without RLS does NOTHING — it is not an error, it simply never
-- applies — so recreating the table here without this line reproduced the
-- policies and none of the protection.
--
-- That is not a theory. test/verify_api_service.js caught it: one customer
-- uploaded a file into another customer's folder and read that customer's bank
-- slip, both answering 200, with the two policies present and correct the whole
-- time. This is the single line that stops it.
alter table storage.objects enable row level security;

-- ---------------------------------------------------------------------------
-- 5. refresh tokens
--
-- The app calls /auth/v1/token?grant_type=refresh_token, so a refresh token has
-- to be storable and revocable. Rows are deleted on logout; a token that is not
-- present is not valid, which makes logout mean something server-side rather
-- than only clearing localStorage.
-- ---------------------------------------------------------------------------
create table if not exists auth.refresh_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists refresh_tokens_user_idx on auth.refresh_tokens (user_id);

alter table auth.refresh_tokens enable row level security;
drop policy if exists hnk_refresh_tokens_service_all on auth.refresh_tokens;
create policy hnk_refresh_tokens_service_all on auth.refresh_tokens
  for all to public
  using (current_setting('request.role', true) = 'service_role')
  with check (current_setting('request.role', true) = 'service_role');
alter table auth.refresh_tokens force row level security;
