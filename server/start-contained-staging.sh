#!/bin/sh
set -eu

: "${HNK_CONTAINED_PG_PASSWORD:?HNK_CONTAINED_PG_PASSWORD is required}"

export POSTGRES_USER="hnk_staging"
export POSTGRES_DB="hnk_staging"
export POSTGRES_PASSWORD="$HNK_CONTAINED_PG_PASSWORD"
export PGDATA="/tmp/hnk-contained-pgdata"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
export PGSSLMODE="disable"

mkdir -p "$PGDATA"

/usr/local/bin/docker-entrypoint.sh postgres \
  -c listen_addresses=127.0.0.1 \
  -c shared_buffers=32MB \
  -c max_connections=30 &
postgres_pid=$!
node_pid=""

stop_all() {
  if [ -n "$node_pid" ]; then kill "$node_pid" 2>/dev/null || true; fi
  kill "$postgres_pid" 2>/dev/null || true
  if [ -n "$node_pid" ]; then wait "$node_pid" 2>/dev/null || true; fi
  wait "$postgres_pid" 2>/dev/null || true
}
trap stop_all EXIT INT TERM

# The API listens immediately and keeps readiness false until its built-in,
# bounded migration retry connects to PostgreSQL and applies the exact schema.
gosu postgres node /app/index.js &
node_pid=$!

while :; do
  if ! kill -0 "$postgres_pid" 2>/dev/null; then
    if wait "$postgres_pid"; then postgres_status=0; else postgres_status=$?; fi
    echo "contained staging PostgreSQL stopped unexpectedly (exit $postgres_status)" >&2
    kill "$node_pid" 2>/dev/null || true
    wait "$node_pid" 2>/dev/null || true
    exit 1
  fi
  if ! kill -0 "$node_pid" 2>/dev/null; then
    if wait "$node_pid"; then node_status=0; else node_status=$?; fi
    kill "$postgres_pid" 2>/dev/null || true
    wait "$postgres_pid" 2>/dev/null || true
    exit "$node_status"
  fi
  sleep 1
done
