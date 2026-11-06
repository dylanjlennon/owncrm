#!/usr/bin/env bash
# Replays every migration on a blank database, then runs the access test.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/localpg.sh
lpsql -d postgres -c 'create database owncrm_rls' >/dev/null
apply_migrations owncrm_rls
cat supabase/tests/rls.sql - <<'SQL' | lpsql -d owncrm_rls -At -F ' | ' -f -
do $$ declare n int; begin
  select count(*) into n from jsonb_array_elements(current_setting('owncrm.rls_results')::jsonb) r where not (r->>'pass')::boolean;
  if n > 0 then raise exception 'RLS test: % failed', n; end if;
end $$;
SQL
echo "RLS local: passed (all migrations replayed on a blank database)"
