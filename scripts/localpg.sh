#!/usr/bin/env bash
# Starts a throwaway local Postgres for tests. Source this file. Needs Postgres installed.
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -z "$PGBIN" ] && PGBIN="$(dirname "$(command -v pg_ctl 2>/dev/null || echo /nonexistent/x)")"
if [ ! -x "$PGBIN/initdb" ]; then echo "SKIP: no local Postgres server found"; exit 77; fi
PGPORT_TEST="${PGPORT_TEST:-54329}"
PGDATA_TEST="$(mktemp -d /tmp/owncrm-pg.XXXXXX)"
if [ "$(id -u)" = "0" ]; then chown postgres "$PGDATA_TEST"; PGRUN=(runuser -u postgres --); else PGRUN=(); fi
PGUSER_TEST="$([ "$(id -u)" = "0" ] && echo postgres || id -un)"
"${PGRUN[@]}" "$PGBIN/initdb" -D "$PGDATA_TEST/db" -A trust -U "$PGUSER_TEST" >/dev/null
"${PGRUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA_TEST/db" -o "-p $PGPORT_TEST -k $PGDATA_TEST" -l "$PGDATA_TEST/log" -w start >/dev/null
localpg_stop() { "${PGRUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA_TEST/db" -m immediate stop >/dev/null 2>&1; rm -rf "$PGDATA_TEST"; }
trap localpg_stop EXIT
lpsql() { psql -h 127.0.0.1 -p "$PGPORT_TEST" -U "$PGUSER_TEST" -v ON_ERROR_STOP=1 -q "$@"; }
apply_migrations() { # $1 = database
  lpsql -d "$1" -f supabase/tests/auth-shim.sql >/dev/null
  for f in supabase/migrations/*.sql; do lpsql -d "$1" -f "$f" >/dev/null || { echo "Migration failed: $f"; exit 1; }; done
}
