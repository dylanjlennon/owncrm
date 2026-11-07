#!/usr/bin/env bash
# Database rules that need a real Postgres, on throwaway local databases. Fake data only.
# - Updating an install whose email cap is at or below the alert reserve stops with a clear
#   message and changes nothing (review round 3, L1).
# - Restoring an older backup clears the old stored uploads and error files, and never raises a
#   cap (M4, L1).
set -euo pipefail
cd "$(dirname "$0")/.."
export PGOPTIONS="-c client_min_messages=warning"
source scripts/localpg.sh
q() { lpsql -At "$@"; }
fail() { echo "FAIL: $*"; exit 1; }

echo "== Update refuses a daily cap at or below the alert reserve (L1)"
q -d postgres -c 'create database up' >/dev/null
q -d up -f supabase/tests/auth-shim.sql >/dev/null
for f in supabase/migrations/2026110600*.sql supabase/migrations/20261107000100_*.sql; do q -d up -f "$f" >/dev/null; done
q -d up -c "update public.app_settings set daily_email_cap = 30, reserved_alert_budget = 40 where id" >/dev/null
if out="$(q -d up -f supabase/migrations/20261107000200_review_fixes_2.sql 2>&1)"; then fail "the update went ahead with a cap of 30 and a reserve of 40"; fi
echo "$out" | grep -q 'Stopped before changing anything' || { echo "$out"; fail "no clear message"; }
echo "$out" | grep -q 'reserved_alert_budget = 15' || { echo "$out"; fail "the message does not say what to run"; }
[ "$(q -d up -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")" = "30/40" ] || fail "the caps were changed"
[ "$(q -d up -c "select count(*) from information_schema.columns where table_name = 'leads' and column_name = 'alert_held'")" = "0" ] || fail "the update changed things before stopping"
q -d up -c "update public.app_settings set reserved_alert_budget = 15 where id" >/dev/null
for f in supabase/migrations/20261107000[2-9]*.sql; do q -d up -f "$f" >/dev/null || fail "$f did not apply after the fix the message gave"; done
[ "$(q -d up -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")" = "30/15" ] || fail "the caps changed"
echo "  stops with a clear message, changes nothing, applies after the suggested fix: ok"

echo "== A fresh install is not stopped (L1)"
q -d postgres -c 'create database fresh' >/dev/null
apply_migrations fresh
echo "  ok"

echo "== Restoring an older backup clears refused rows and keeps the caps (M4, L1)"
q -d fresh >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
select private.restore_begin();
update public.app_settings set daily_email_cap = 10, monthly_email_cap = 3000, reserved_alert_budget = 25 where id;
insert into public.imports (kind, filename, status, raw_csv, error_csv, total_rows) values
  ('csv', 'old-draft.csv', 'draft', E'name,notes\nTesty,SSN 123-45-6789 starting chemo', E'line,problem,name,notes\n2,refused,Testy,SSN 123-45-6789 starting chemo', 1),
  ('csv', 'old-done.csv', 'done', null, E'line,problem,name,notes\n3,refused,Sample,cancer', 1),
  ('csv', 'new-done.csv', 'done', null, E'line,problem\n4,Mentions health or a legal matter', 1),
  ('csv', 'new-draft.csv', 'draft', '{"headers":["name"],"rows":[["Demo"]],"lines":[2]}', null, 1);
select private.restore_finish();
commit;
SQL
[ "$(q -d fresh -c "select count(*) from public.imports where raw_csv like '%6789%' or error_csv like '%6789%' or error_csv like '%cancer%'")" = "0" ] || fail "refused rows came back with the restore"
[ "$(q -d fresh -c "select error_csv from public.imports where filename = 'new-done.csv'" | head -1)" = "line,problem" ] || fail "the new error file was cleared"
[ "$(q -d fresh -c "select raw_csv is not null from public.imports where filename = 'new-draft.csv'")" = "t" ] || fail "the new draft was cleared"
[ "$(q -d fresh -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")" = "10/5" ] || fail "restore raised the cap instead of lowering the reserve: $(q -d fresh -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")"
echo "  old raw and error files cleared, new ones kept, cap 10 kept and reserve lowered to 5: ok"

echo "DATABASE RULES TEST: passed"
