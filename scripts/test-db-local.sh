#!/usr/bin/env bash
# Database rules that need a real Postgres, on throwaway local databases. Fake data only.
# - Updating an install whose email cap is at or below the alert reserve stops with a clear
#   message and changes nothing (review round 3, L1).
# - Restoring an older backup clears the old stored uploads and error files, and never raises a
#   cap (M4, L1).
# - The alert decision (public.alert_admit) holds under 40 truly parallel connections: shares,
#   per-address rule, de-dupe and the once-only flood notice and lead list (H1, M1, M3). Escalations
#   keep their reserve even against direct inserts, and every email counts toward the monthly
#   cap (L2).
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
[ "$(q -d fresh -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")" = "10/9" ] || fail "restore raised the cap instead of lowering the reserve: $(q -d fresh -c "select daily_email_cap || '/' || reserved_alert_budget from public.app_settings")"
echo "  old raw and error files cleared, new ones kept, cap 10 kept and reserve lowered to 9 (as close to 15 as the cap allows): ok"

echo "== The alert decision under 40 parallel connections (H1, M1, M3)"
q -d postgres -c 'create database gate' >/dev/null
apply_migrations gate
q -d gate >/dev/null <<'SQL'
update public.app_settings set owner_email = 'owner@example.com', backup_email = 'backup@example.com', reserved_alert_budget = 40, daily_email_cap = 100, monthly_email_cap = 3000 where id;
select public.intake_lead(jsonb_build_object('first_name', 'Par' || g, 'email', 'par' || g || '@example.com', 'source', 'Website form', 'channel', 'form')) from generate_series(1, 80) g;
update public.leads l set flood_key = 'lead:addr' || (n % 4) from (select id, row_number() over (order by received_at, id) as n from public.leads) x where x.id = l.id and x.n <= 40;
update public.leads l set flood_key = 'lead:solo' || n from (select id, row_number() over (order by received_at, id) as n from public.leads) x where x.id = l.id and x.n > 40;
SQL
admit() { q -d gate -c "set role service_role; select public.alert_admit($1)" 2>&1 | tail -1; }
parallel() { # $1 = how many, $2 = a function of i that prints the arguments
  local i; for i in $(seq 1 "$1"); do admit "$($2 "$i")" >/dev/null & done; wait
}
lead_args() { local id; id="$(q -d gate -c "select id from public.leads order by received_at, id offset $(( $1 - 1 )) limit 1")"
  echo "'lead', array['owner@example.com'], 'New lead: Par$1', 'x', 'lead:new:$id', 72, '$id'::uuid, null, (select flood_key from public.leads where id = '$id'), null"; }
parallel 40 lead_args
n="$(q -d gate -c "select count(*) from public.outbound_emails where alert_class = 'lead'")"
[ "$n" = "12" ] || fail "40 parallel posts from 4 addresses sent $n new-lead alerts, expected 12 (3 per address)"
echo "  40 parallel posts from 4 addresses: 12 new-lead alerts (3 per address): ok"
parallel 40 lead_args
[ "$(q -d gate -c "select count(*) from public.outbound_emails where alert_class = 'lead'")" = "12" ] || fail "the same 40 posts again sent more alerts (de-dupe races)"
echo "  the same 40 again: still 12 (de-dupe holds): ok"
solo_args() { lead_args $(( $1 + 40 )); }
parallel 40 solo_args
n="$(q -d gate -c "select count(*) from public.outbound_emails where alert_class = 'lead'")"
[ "$n" = "22" ] || fail "40 parallel posts from 40 addresses brought one-by-one lead alerts to $n, expected 22 (28 lead share - 6 for the lead list)"
echo "  40 more from 40 different addresses: one-by-one lead alerts stop at 22: ok"
notice_args() { echo "'system', array['owner@example.com'], 'Your web form is being flooded', 'x', 'form_flood', 12, null, null, null, null"; }
parallel 40 notice_args
[ "$(q -d gate -c "select count(*) from public.outbound_emails where alert_key = 'form_flood'")" = "1" ] || fail "40 parallel flood notices sent more than one"
echo "  40 parallel flood notices: 1 sent: ok"
digest_args() { echo "'digest', array['owner@example.com'], 'Many new leads: 9 waiting', 'x', null, 12, null, null, null, null"; }
parallel 40 digest_args
[ "$(q -d gate -c "select count(*) from public.outbound_emails where alert_class = 'digest'")" = "1" ] || fail "40 parallel lead lists sent more than one"
echo "  40 parallel lead lists: 1 sent: ok"
noisy_args() { echo "'system', array['owner@example.com'], 'Someone marked your email as spam $1', 'x', null, 12, null, null, null, null"; }
parallel 40 noisy_args
r="$(admit "'critical', array['owner@example.com','backup@example.com'], 'Problem: Nightly backup', 'x', 'check:backup', 12, null, null, null, null")"
echo "$r" | grep -q '"send": true' || fail "after 40 parallel ordinary alerts, \"backup stopped\" was refused: $r"
[ "$(q -d gate -c "select count(*) from public.outbound_emails where kind = 'alert'")" -le 40 ] || fail "more than 40 alerts today"
echo "  40 parallel ordinary alerts, then \"backup stopped\" still goes to both: ok"
# Ordinary alerts saved directly (not through alert_admit) stop where the unused parts of the
# escalation, reminder and "Alerts paused" reserves start; an escalation can still use its own.
for i in $(seq 1 40); do q -d gate -c "set role service_role; insert into public.outbound_emails (to_address, subject, body_text, kind, alert_class) values ('owner@example.com', 'direct $i', 'x', 'alert', 'system')" >/dev/null 2>&1 || break; done
expect="$(q -d gate -c "select 40 - greatest(0, 6 - count(*) filter (where alert_class = 'critical')) - greatest(0, 4 - count(*) filter (where alert_class = 'reminder')) - greatest(0, 1 - count(*) filter (where alert_class = 'notice')) from public.outbound_emails where kind = 'alert'")"
[ "$(q -d gate -c "select count(*) from public.outbound_emails where kind = 'alert'")" = "$expect" ] || fail "direct inserts did not stop at $expect"
q -d gate -c "set role service_role; insert into public.outbound_emails (to_address, subject, body_text, kind, alert_class) values ('backup@example.com', 'Problem: Watchdog', 'x', 'alert', 'critical')" >/dev/null 2>&1 || fail "an escalation could not use its reserve"
echo "  a direct insert can't use the unused part of the escalation reserve: ok"

echo "== Every email counts toward the monthly cap (L2)"
q -d postgres -c 'create database month' >/dev/null
apply_migrations month
if [ "$(q -d month -c "select extract(day from now() at time zone timezone) = 1 from public.app_settings")" = "t" ]; then
  echo "  skipped: today is the 1st, so there are no earlier days this month to fill"
else
  # Earlier this month: 25 alerts. Cap 30 a month, 20 held for alerts.
  q -d month >/dev/null <<'SQL'
update public.app_settings set owner_email = 'owner@example.com', reserved_alert_budget = 20, daily_email_cap = 100, monthly_email_cap = 30 where id;
set session_replication_role = replica;
insert into public.outbound_emails (to_address, subject, body_text, kind, alert_class, status, created_at)
select 'owner@example.com', 'earlier ' || g, 'x', 'alert', 'critical', 'sent', (date_trunc('month', now() at time zone s.timezone) at time zone s.timezone) + interval '1 hour'
  from generate_series(1, 25) g, public.app_settings s;
SQL
  sent=0; for i in $(seq 1 12); do q -d month -c "set role service_role; insert into public.outbound_emails (to_address, subject, body_text, kind) values ('c$i@example.com', 'hi', 'x', 'one_to_one')" >/dev/null 2>&1 && sent=$((sent + 1)); done
  [ "$sent" = "0" ] || fail "client email sent $sent after 25 alerts this month with a monthly cap of 30 and 20 held for alerts; expected 0"
  echo "  25 alerts earlier this month: client email is refused (alerts count toward the month): ok"
  r="$(q -d month -c "set role service_role; select public.alert_admit('critical', array['owner@example.com'], 'b' || g, 'x', null, 12, null, null, null, null)->>'send' from generate_series(1, 10) g" | grep -c true || true)"
  [ "$r" = "5" ] || fail "alerts today: $r sent, expected 5 (the rest of the monthly cap)"
  [ "$(q -d month -c "select count(*) from public.outbound_emails where status <> 'failed'")" = "30" ] || fail "the month total is not 30"
  echo "  alerts may use the rest, and the month stops at exactly 30: ok"
fi

echo "== Reply reminders keep their own reserve, and one \"Alerts paused\" email (review round 4, M2)"
q -d postgres -c 'create database rem' >/dev/null
apply_migrations rem
q -d rem >/dev/null <<'SQL'
update public.app_settings set owner_email = 'owner@example.com', backup_email = 'backup@example.com', reserved_alert_budget = 40, daily_email_cap = 100, monthly_email_cap = 3000 where id;
select public.intake_lead(jsonb_build_object('first_name', 'Rem' || g, 'email', 'rem' || g || '@example.com', 'source', 'Website form', 'channel', 'form')) from generate_series(1, 60) g;
SQL
radmit() { q -d rem -c "set role service_role; select public.alert_admit($1)" 2>&1 | tail -1; }
first="$(q -d rem -c "select id from public.leads order by received_at, id limit 1")"
radmit "'lead', array['owner@example.com'], 'New lead: Rem1', 'x', 'lead:new:$first', 72, '$first'::uuid, null, 'addr-first', null" | grep -q '"send": true' || fail "the first lead was not alerted"
# 59 more leads from 59 addresses, 20 at a time, use up the one-by-one share.
i=0; for id in $(q -d rem -c "select id from public.leads order by received_at, id offset 1"); do
  i=$((i + 1)); radmit "'lead', array['owner@example.com'], 'New lead', 'x', 'lead:new:$id', 72, '$id'::uuid, null, 'addr$i', null, 'Paused (test)'" >/dev/null &
  [ $((i % 20)) = 0 ] && wait
done; wait
[ "$(q -d rem -c "select count(*) from public.outbound_emails where alert_class = 'lead'")" = "22" ] || fail "new-lead alerts did not stop at 22"
[ "$(q -d rem -c "select count(*) from public.outbound_emails where alert_class = 'notice'")" = "1" ] || fail "expected exactly one \"Alerts paused\" email after 38 refusals at once"
r1="$(radmit "'lead_reminder', array['owner@example.com'], 'No reply yet: Rem1', 'x', 'lead:first:$first', 72, '$first'::uuid, null, 'addr-first', null")"
r2="$(radmit "'lead_reminder', array['owner@example.com','backup@example.com'], 'Still no reply: Rem1', 'x', 'lead:second:$first', 72, '$first'::uuid, null, 'addr-first', null")"
echo "$r1" | grep -q '"send": true' || fail "the first lead's reminder was refused after a busy day: $r1"
echo "$r2" | grep -q '"send": true' || fail "the first lead's backup escalation was refused after a busy day: $r2"
[ "$(q -d rem -c "select count(*) from public.outbound_emails where to_address = 'backup@example.com'")" = "1" ] || fail "the backup contact was not told"
for k in 1 2 3; do radmit "'system', array['owner@example.com'], 'Problem $k', 'x', 'check:p$k'" >/dev/null; done
[ "$(q -d rem -c "select count(*) from public.outbound_emails where alert_class = 'notice'")" = "1" ] || fail "a second \"Alerts paused\" email went out"
echo "  60 leads from 60 addresses: 22 one by one, one \"Alerts paused\" email; the first lead's reminder and backup escalation still go: ok"

echo "== \"Backup stopped\" reaches both people at a small alert number (review round 4, L5)"
q -d postgres -c 'create database small' >/dev/null
apply_migrations small
q -d small -c "update public.app_settings set owner_email = 'owner@example.com', backup_email = 'backup@example.com', reserved_alert_budget = 5, daily_email_cap = 10, monthly_email_cap = 3000 where id" >/dev/null
sadmit() { q -d small -c "set role service_role; select public.alert_admit($1)" 2>&1 | tail -1; }
sadmit "'lead', array['owner@example.com'], 'New lead 1', 'x', 'lead:new:a', 72, null, null, 'a', null" >/dev/null
sadmit "'lead', array['owner@example.com'], 'New lead 2', 'x', 'lead:new:b', 72, null, null, 'b', null" >/dev/null
sadmit "'digest', array['owner@example.com'], 'Many new leads: 3 waiting', 'x'" >/dev/null
sadmit "'system', array['owner@example.com'], 'Problem: Domain', 'x', 'check:domain'" >/dev/null
r="$(sadmit "'critical', array['owner@example.com','backup@example.com'], 'Problem: Nightly backup', 'x', 'check:backup'")"
echo "$r" | grep -q '"send": true' || fail "at an alert number of 5, \"backup stopped\" was refused: $r"
echo "  alert number 5: \"backup stopped\" still goes to both: ok"

echo "DATABASE RULES TEST: passed"
