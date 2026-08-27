-- ============================================================================
-- One-time in-place migration off the legacy auth/storage dialect.
--
-- WHY THIS EXISTS. platform.sql refuses to run against a database that still
-- carries auth.users / auth.refresh_tokens / storage.buckets / storage.objects,
-- because creating the parallel public.hnk_* tables beside them would leave
-- every existing account, refresh session and payment proof stranded in tables
-- the application no longer reads. That guard is correct. This file is the
-- explicit migration it asks for, so the guard can be satisfied without
-- discarding a single row.
--
-- IT MOVES, IT DOES NOT COPY. The legacy and roleless tables have identical
-- column names, types and order, so `alter table ... set schema` followed by a
-- rename carries the data, the primary keys and every foreign key across
-- untouched — including public.profiles.id, whose reference simply follows the
-- table it already pointed at. A copy would have to rebuild those references by
-- hand, which is the part that goes wrong. The copy path below exists only for
-- a database where a previous attempt already created the destination.
--
-- APPLY ORDER: legacy-auth-storage.sql -> platform.sql -> schema.sql.
-- Idempotent: on a database that never used the legacy dialect, and on every
-- run after the first, every block below is a no-op.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Retire the legacy policies, and let schema.sql reach the rows it upgrades.
--
-- Old policies are written against auth.uid() and the anon/authenticated roles.
-- They must not survive into the roleless model, where authority comes from
-- request.role set by server/lib/db.js. platform.sql and schema.sql are the
-- authority on what replaces them: both drop-and-create every policy they own,
-- so clearing the slate here converges rather than destroys.
--
-- Dropping them leaves the application tables ENABLE + FORCE with no policy at
-- all, which denies every row to everyone including the table's owner. For a
-- window that fails closed that is exactly right — but schema.sql's upgrade
-- path has to WRITE to those tables before it creates the replacements:
--
--     alter table public.profiles add column account_status text;
--     update public.profiles set account_status = case ... end;
--     alter table public.profiles alter column account_status set not null;
--
-- Under FORCE with no policy that update matches zero rows, silently, and the
-- NOT NULL two statements later fails on the columns it was supposed to have
-- filled. The migration then dies inside schema.sql, naming a column rather
-- than the policy state that actually caused it. So FORCE is lifted here for
-- the tables the legacy dialect created, and schema.sql restores it: every
-- table it owns gets `enable` and `force` re-asserted unconditionally, and
-- server/lib/migrate.js refuses to publish a schema fingerprint until all of
-- them report both. An interrupted run therefore leaves a service that will
-- not serve, never one serving rows without row-level security.
--
-- Only the four tables the old dialect created are touched, and only when the
-- legacy dialect is actually present, so an ordinary boot never widens
-- anything.
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
  tbl text;
begin
  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where (n.nspname, c.relname) in
           (('auth', 'users'), ('auth', 'refresh_tokens'),
            ('storage', 'buckets'), ('storage', 'objects'))
  ) then
    return;
  end if;

  raise notice 'legacy auth/storage dialect detected; migrating in place';

  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname in ('public', 'auth', 'storage')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   pol.policyname, pol.schemaname, pol.tablename);
  end loop;

  foreach tbl in array array['profiles', 'payment_requests', 'app_settings', 'devices']
  loop
    continue when to_regclass(format('public.%I', tbl)) is null;
    execute format('alter table public.%I no force row level security', tbl);
    raise notice 'lifted FORCE on public.% for the upgrade; schema.sql restores it', tbl;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Retire the legacy trigger and helper functions.
--
-- `drop schema auth cascade` does NOT reach these. A PL/pgSQL body is an opaque
-- string to the dependency tracker, and so is a quoted SQL body, so a trigger
-- function calling auth.uid() survives the schema that defines it and then
-- raises `schema "auth" does not exist` the first time its table is written to
-- — which is exactly what schema.sql does when it backfills account_status.
-- The failure surfaces two files later than its cause, so remove them here.
--
-- CASCADE takes the triggers with the functions. schema.sql owns the
-- replacements and creates each one with `drop trigger if exists` before
-- `create trigger`, so this converges to the declared set rather than leaving a
-- table unguarded.
--
-- Keyed on what is actually present rather than on the legacy tables, so a
-- database that got halfway through a previous attempt still gets cleaned up.
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname as schema_name,
           p.proname  as name,
           pg_get_function_identity_arguments(p.oid) as args
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~ 'auth\.(uid|role|jwt)\(|storage\.foldername\('
  loop
    execute format('drop function if exists %I.%I(%s) cascade',
                   fn.schema_name, fn.name, fn.args);
    raise notice 'dropped legacy function %.%(%)', fn.schema_name, fn.name, fn.args;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Move each legacy table to the name the roleless schema expects.
--
-- Parents before children only matters for the copy branch; the move branch is
-- order-independent because a rename never breaks a reference.
-- ---------------------------------------------------------------------------
do $$
declare
  m       record;
  cols    text;
  moved   int := 0;
begin
  for m in
    select *
      from (values
        ('auth',    'users',          'hnk_auth_users',          1),
        ('auth',    'refresh_tokens', 'hnk_auth_refresh_tokens', 2),
        ('storage', 'buckets',        'hnk_storage_buckets',     3),
        ('storage', 'objects',        'hnk_storage_objects',     4)
      ) as t(src_schema, src_table, dst_table, ord)
     order by ord
  loop
    continue when to_regclass(format('%I.%I', m.src_schema, m.src_table)) is null;

    if to_regclass(format('public.%I', m.dst_table)) is null then
      -- The ordinary path: nothing was created beside it, so carry it over
      -- whole. Data, keys and inbound references all follow the table.
      execute format('alter table %I.%I set schema public', m.src_schema, m.src_table);
      execute format('alter table public.%I rename to %I', m.src_table, m.dst_table);
      moved := moved + 1;
      raise notice 'moved %.% -> public.%', m.src_schema, m.src_table, m.dst_table;
    else
      -- A previous attempt already created the destination. Merge on the
      -- columns the two tables share and let the destination win a conflict:
      -- it is the one the running application has been writing to.
      select string_agg(format('%I', column_name), ', ' order by ordinal_position)
        into cols
        from information_schema.columns src
       where src.table_schema = m.src_schema
         and src.table_name   = m.src_table
         and exists (
           select 1 from information_schema.columns dst
            where dst.table_schema = 'public'
              and dst.table_name   = m.dst_table
              and dst.column_name  = src.column_name);

      if cols is not null then
        execute format('insert into public.%I (%s) select %s from %I.%I on conflict do nothing',
                       m.dst_table, cols, cols, m.src_schema, m.src_table);
      end if;
      execute format('drop table %I.%I cascade', m.src_schema, m.src_table);
      raise notice 'merged %.% into public.% and dropped the legacy table',
                   m.src_schema, m.src_table, m.dst_table;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Give the moved constraints the names a fresh database would have.
--
-- A renamed table keeps the constraint names it was born with, so a migrated
-- database ends up with users_pkey where a new one has hnk_auth_users_pkey.
-- Nothing breaks today — the definitions are identical — but the next migration
-- that names one of these constraints would work on new installs and fail on
-- upgraded ones, which is the worst way to find out. Converge now, while the
-- mapping is still obvious. Renaming a constraint renames its backing index
-- with it, so the index names follow for free.
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
  has_old boolean;
  has_new boolean;
begin
  for c in
    select *
      from (values
        ('hnk_auth_users',          'users_pkey',                  'hnk_auth_users_pkey'),
        ('hnk_auth_refresh_tokens', 'refresh_tokens_pkey',         'hnk_auth_refresh_tokens_pkey'),
        ('hnk_auth_refresh_tokens', 'refresh_tokens_user_id_fkey', 'hnk_auth_refresh_tokens_user_id_fkey'),
        ('hnk_storage_buckets',     'buckets_pkey',                'hnk_storage_buckets_pkey'),
        ('hnk_storage_objects',     'objects_pkey',                'hnk_storage_objects_pkey'),
        ('hnk_storage_objects',     'objects_bucket_id_fkey',      'hnk_storage_objects_bucket_id_fkey'),
        ('hnk_storage_objects',     'objects_owner_fkey',          'hnk_storage_objects_owner_fkey')
      ) as t(tbl, old_name, new_name)
  loop
    continue when to_regclass(format('public.%I', c.tbl)) is null;

    select exists (
      select 1 from pg_constraint con
       where con.conrelid = format('public.%I', c.tbl)::regclass
         and con.conname = c.old_name)
      into has_old;
    select exists (
      select 1 from pg_constraint con
       where con.conrelid = format('public.%I', c.tbl)::regclass
         and con.conname = c.new_name)
      into has_new;

    if has_old and not has_new then
      begin
        execute format('alter table public.%I rename constraint %I to %I',
                       c.tbl, c.old_name, c.new_name);
        raise notice 'renamed constraint on public.%: % -> %', c.tbl, c.old_name, c.new_name;
      exception when insufficient_privilege then
        raise notice 'could not rename % on public.%; the constraint still enforces the same rule',
                     c.old_name, c.tbl;
      end;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Retire the legacy index names.
--
-- A moved table brings its indexes and their old names into public, where
-- platform.sql is about to create the same coverage under hnk_-prefixed names.
-- Dropping the old names leaves one index per constraint instead of two, and
-- makes a migrated database match a freshly created one exactly.
--
-- Best effort for the same reason step 7 is: a duplicate index costs write
-- throughput, never correctness, and is not worth failing a release over.
-- ---------------------------------------------------------------------------
do $$
declare
  idx text;
begin
  foreach idx in array array['users_email_uniq',
                             'refresh_tokens_user_idx',
                             'objects_bucket_name_uniq']
  loop
    if to_regclass(format('public.%I', idx)) is null then
      continue;
    end if;
    begin
      execute format('drop index public.%I', idx);
    exception when insufficient_privilege then
      raise notice 'could not drop legacy index %; it is redundant, not harmful', idx;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Make the recovery tokens satisfy the constraint platform.sql adds.
--
-- The roleless schema adds a unique index over non-null recovery_token that the
-- legacy table never had, so legacy rows may collide. A recovery token is a
-- short-lived password-reset credential: clearing a duplicate costs its holder
-- one more "forgot password" click and costs the account nothing, whereas
-- letting two accounts share one is exactly the collision the index prevents.
-- The most recently issued token is the one kept.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.hnk_auth_users') is null then
    return;
  end if;

  update public.hnk_auth_users u
     set recovery_token = null,
         recovery_sent_at = null
   where u.recovery_token is not null
     and exists (
       select 1
         from public.hnk_auth_users other
        where other.recovery_token = u.recovery_token
          and (other.recovery_sent_at, other.id) > (u.recovery_sent_at, u.id)
     );
end $$;

-- ---------------------------------------------------------------------------
-- 7. Remove the now-empty legacy schemas.
--
-- CASCADE is the point, not a shortcut: it takes auth.uid(), auth.role() and
-- storage.foldername() with them, and with those every remaining object that
-- still depends on the old dialect. Guarded on the schema holding no tables, so
-- a partially migrated database is never stripped of data.
--
-- BEST EFFORT, DELIBERATELY. Dropping a schema requires owning it, and while
-- the application login created these and normally does, a database whose
-- schemas were installed by an administrator would raise here — after the
-- tables have already been carried across, turning a completed migration into
-- a failed deploy. platform.sql's guard names the four TABLES, not the
-- schemas, so an empty auth or storage left standing satisfies it. Say so and
-- carry on rather than blocking the release on a tidiness step.
-- ---------------------------------------------------------------------------
do $$
declare
  s text;
begin
  foreach s in array array['auth', 'storage']
  loop
    if not exists (select 1 from pg_namespace where nspname = s) then
      continue;
    end if;
    if exists (select 1 from pg_tables where schemaname = s) then
      raise notice 'schema % still holds tables; leaving it in place', s;
      continue;
    end if;
    begin
      execute format('drop schema %I cascade', s);
      raise notice 'dropped legacy schema %', s;
    exception when insufficient_privilege or dependent_objects_still_exist then
      raise notice 'could not drop legacy schema % (%); it is empty and harmless',
                   s, sqlerrm;
    end;
  end loop;
end $$;
