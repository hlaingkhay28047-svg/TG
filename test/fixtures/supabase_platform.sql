-- Minimal native-Supabase fixture for verify_schema_behaviour.js.
--
-- This file intentionally has no DigitalOcean roleless marker and no FORCE
-- RLS. It models only the platform-owned auth/storage objects that
-- supabase/schema.sql expects, so that suite keeps testing the Supabase dialect
-- independently from server/sql/schema.sql.

create schema if not exists auth;
create schema if not exists storage;

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

create unique index if not exists users_email_uniq
  on auth.users (lower(email));

create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists auth.refresh_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

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

create or replace function storage.foldername(name text) returns text[]
language sql
immutable
as $$ select string_to_array(name, '/') $$;

alter table storage.objects enable row level security;

do $$
declare
  wanted text;
begin
  foreach wanted in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = wanted) then
      execute format('grant usage on schema public, auth, storage to %I', wanted);
      execute format('grant execute on function auth.uid() to %I', wanted);
      execute format('grant execute on function storage.foldername(text) to %I', wanted);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert on storage.objects to authenticated';
  end if;
end $$;
