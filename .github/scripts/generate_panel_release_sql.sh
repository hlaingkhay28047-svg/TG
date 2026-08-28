#!/usr/bin/env bash
# Emit the SQL that publishes one panel release through the private database
# bridge — the same transitions the admin console performs (initiate ->
# chunks -> verify -> ready; one latest, one minimum, enable only against a
# finalized artifact), in one transaction, under the service-role request
# context. The caller connects as the NOBYPASSRLS runtime user and pipes the
# output to psql; test/verify_panel_release_workflow.js runs this exact
# script against a real scratch database carrying the tracked schema.
#
# Environment (all required):
#   VERSION         semantic version being released, e.g. 6.25.2
#   ARTIFACT        HNK_Ai_Panel_v$VERSION.ccx
#   EXPECTED_SHA    64-hex SHA-256 the stored artifact must equal
#   EXPECTED_BYTES  exact byte size the stored artifact must equal
#   MINIMUM         semantic minimum supported version for the policy
#   ARTIFACT_PATH   absolute path of the already-built artifact to store
# Optional:
#   CHUNK_BYTES     chunk geometry, default 4194304 (the admin console's own)
#
# The artifact is re-hashed here: a caller whose file does not equal the
# declared digest and size gets a refusal, not SQL. Nothing secret appears in
# the output — it carries only the version strings, digests, sizes and the
# base64 of the artifact itself, and it never prints a connection string.
set -euo pipefail

for name in VERSION ARTIFACT EXPECTED_SHA EXPECTED_BYTES MINIMUM ARTIFACT_PATH; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "generate_panel_release_sql: $name is required" >&2
    exit 64
  fi
done
CHUNK_BYTES="${CHUNK_BYTES:-4194304}"

printf '%s\n' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "generate_panel_release_sql: VERSION is not semantic" >&2; exit 64; }
printf '%s\n' "$MINIMUM" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "generate_panel_release_sql: MINIMUM is not semantic" >&2; exit 64; }
printf '%s\n' "$EXPECTED_SHA" | grep -Eq '^[0-9a-f]{64}$' || { echo "generate_panel_release_sql: EXPECTED_SHA is not 64-hex" >&2; exit 64; }
case "$EXPECTED_BYTES" in (''|*[!0-9]*) echo "generate_panel_release_sql: EXPECTED_BYTES is not a number" >&2; exit 64;; esac
case "$CHUNK_BYTES" in (''|*[!0-9]*) echo "generate_panel_release_sql: CHUNK_BYTES is not a number" >&2; exit 64;; esac
if [ "$CHUNK_BYTES" -lt 65536 ] || [ "$CHUNK_BYTES" -gt 4194304 ]; then
  echo "generate_panel_release_sql: CHUNK_BYTES must be between 65536 and 4194304" >&2
  exit 64
fi
if [ "$ARTIFACT" != "HNK_Ai_Panel_v$VERSION.ccx" ]; then
  echo "generate_panel_release_sql: ARTIFACT must be HNK_Ai_Panel_v$VERSION.ccx" >&2
  exit 64
fi
LOWEST="$(printf '%s\n%s\n' "$MINIMUM" "$VERSION" | sort -V | head -1)"
if [ "$LOWEST" != "$MINIMUM" ]; then
  echo "generate_panel_release_sql: MINIMUM is newer than VERSION — refusing a policy that locks the release out" >&2
  exit 64
fi
if [ ! -f "$ARTIFACT_PATH" ]; then
  echo "generate_panel_release_sql: ARTIFACT_PATH does not exist" >&2
  exit 66
fi
MEASURED_SHA="$(sha256sum "$ARTIFACT_PATH" | awk '{print $1}')"
MEASURED_BYTES="$(stat -c %s "$ARTIFACT_PATH")"
if [ "$MEASURED_SHA" != "$EXPECTED_SHA" ] || [ "$MEASURED_BYTES" != "$EXPECTED_BYTES" ]; then
  echo "generate_panel_release_sql: the artifact does not equal the declared SHA-256/size — refusing to emit SQL" >&2
  exit 65
fi
if [ "$EXPECTED_BYTES" -gt 67108864 ]; then
  echo "generate_panel_release_sql: this lane stores at most 64 MiB through the database bridge" >&2
  exit 65
fi

umask 077
CHUNK_DIR="$(mktemp -d)"
trap 'rm -rf "$CHUNK_DIR"' EXIT
split -b "$CHUNK_BYTES" -d -a 4 "$ARTIFACT_PATH" "$CHUNK_DIR/chunk."
CHUNK_COUNT="$(ls "$CHUNK_DIR" | wc -l | tr -d ' ')"
if [ "$CHUNK_COUNT" -lt 1 ] || [ "$CHUNK_COUNT" -gt 8192 ]; then
  echo "generate_panel_release_sql: chunk count $CHUNK_COUNT is outside the schema's bounds" >&2
  exit 65
fi

cat <<SQL
\\o /dev/null
select set_config('request.role','service_role',false),
       set_config('request.jwt.claim.sub','',false),
       set_config('request.is_admin','false',false),
       set_config('request.user_email','',false);
\\o
begin;
create temporary table _release (admin_id uuid not null, artifact_id uuid not null, already_ready boolean not null) on commit drop;
do \$\$
declare
  v_admin uuid;
  v_art public.panel_artifacts%rowtype;
  v_id uuid;
begin
  select u.id into v_admin
    from public.hnk_auth_users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id
   where r.name = 'admin'
   order by u.created_at limit 1;
  if v_admin is null then
    raise exception 'RELEASE_ABORT: no admin account exists to attribute the release to';
  end if;
  select * into v_art from public.panel_artifacts where version = '$VERSION' for update;
  if found and v_art.status = 'ready' and v_art.artifact_key = '$ARTIFACT'
     and v_art.expected_sha256 = '$EXPECTED_SHA' and v_art.expected_size_bytes = $EXPECTED_BYTES then
    insert into _release values (v_admin, v_art.id, true);
  elsif found and v_art.status = 'ready' then
    raise exception 'RELEASE_ABORT: a different finalized artifact already exists for version $VERSION';
  elsif found then
    delete from public.panel_artifact_chunks where artifact_id = v_art.id;
    update public.panel_artifacts
       set artifact_key = '$ARTIFACT', expected_sha256 = '$EXPECTED_SHA',
           expected_size_bytes = $EXPECTED_BYTES, chunk_size_bytes = $CHUNK_BYTES,
           chunk_count = $CHUNK_COUNT, status = 'uploading', uploaded_size_bytes = 0,
           updated_at = now(), finalized_at = null, created_by = v_admin
     where id = v_art.id;
    insert into _release values (v_admin, v_art.id, false);
  else
    insert into public.panel_artifacts
      (version, artifact_key, expected_sha256, expected_size_bytes, chunk_size_bytes, chunk_count, created_by)
    values ('$VERSION', '$ARTIFACT', '$EXPECTED_SHA', $EXPECTED_BYTES, $CHUNK_BYTES, $CHUNK_COUNT, v_admin)
    returning id into v_id;
    insert into _release values (v_admin, v_id, false);
  end if;
end
\$\$;
SQL

INDEX=0
for CHUNK in "$CHUNK_DIR"/chunk.*; do
  CHUNK_SHA="$(sha256sum "$CHUNK" | awk '{print $1}')"
  CHUNK_SIZE="$(stat -c %s "$CHUNK")"
  printf "insert into public.panel_artifact_chunks (artifact_id, chunk_index, data, size_bytes, sha256)\n"
  printf "select artifact_id, %s, decode('" "$INDEX"
  base64 -w0 "$CHUNK"
  printf "','base64'), %s, '%s' from _release where not already_ready;\n" "$CHUNK_SIZE" "$CHUNK_SHA"
  INDEX=$((INDEX + 1))
done

cat <<SQL
do \$\$
declare
  v_id uuid;
  v_ready boolean;
  v_sha text;
  v_len bigint;
begin
  select artifact_id, already_ready into v_id, v_ready from _release;
  if not v_ready then
    select encode(sha256(string_agg(data, ''::bytea order by chunk_index)), 'hex'),
           coalesce(sum(octet_length(data)), 0)
      into v_sha, v_len
      from public.panel_artifact_chunks where artifact_id = v_id;
    if v_sha is distinct from '$EXPECTED_SHA' or v_len is distinct from $EXPECTED_BYTES::bigint then
      raise exception 'RELEASE_ABORT: the stored artifact failed SHA-256/size verification';
    end if;
    update public.panel_artifacts
       set status = 'ready', uploaded_size_bytes = $EXPECTED_BYTES, finalized_at = now(), updated_at = now()
     where id = v_id and status = 'uploading';
    if not found then
      raise exception 'RELEASE_ABORT: artifact finalization lost its lock';
    end if;
  end if;
  if not exists (select 1 from public.panel_versions where version = '$MINIMUM')
     and '$MINIMUM' <> '$VERSION' then
    raise exception 'RELEASE_ABORT: minimum version $MINIMUM has no release record';
  end if;
  update public.panel_versions set is_latest = false, minimum_supported = false;
  insert into public.panel_versions
    (version, is_latest, minimum_supported, enabled, artifact_key, sha256, size_bytes, artifact_id, released_at, created_by)
  select '$VERSION', true, ('$VERSION' = '$MINIMUM'), true, '$ARTIFACT', '$EXPECTED_SHA', $EXPECTED_BYTES,
         artifact_id, now(), admin_id
    from _release
  on conflict (version) do update
    set is_latest = true, minimum_supported = excluded.minimum_supported, enabled = true,
        artifact_key = excluded.artifact_key, sha256 = excluded.sha256, size_bytes = excluded.size_bytes,
        artifact_id = excluded.artifact_id, released_at = now(), created_by = excluded.created_by;
  if '$VERSION' <> '$MINIMUM' then
    update public.panel_versions set minimum_supported = true where version = '$MINIMUM';
    if not found then
      raise exception 'RELEASE_ABORT: minimum version could not be selected';
    end if;
  end if;
end
\$\$;
commit;
select 'PROOF: version='||v.version||' latest='||v.is_latest::text||' minimum='||v.minimum_supported::text
       ||' enabled='||v.enabled::text||' bytes='||coalesce(v.size_bytes::text,'-')
       ||' artifact='||coalesce(a.status,'none')
  from public.panel_versions v
  left join public.panel_artifacts a on a.id = v.artifact_id
 order by v.released_at desc;
SQL
