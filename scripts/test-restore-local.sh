#!/usr/bin/env bash
# Proves backup and restore on throwaway local databases: seed, back up, encrypt, restore to blank, compare.
# Also proves a forced failure and a sudden drop in rows are caught.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v age >/dev/null || { echo "SKIP: age is not installed"; exit 77; }
source scripts/localpg.sh
URL="postgresql://$PGUSER_TEST@127.0.0.1:$PGPORT_TEST"
lpsql -d postgres -c 'create database src' -c 'create database dst' >/dev/null
apply_migrations src
node scripts/seed-demo.mjs >/dev/null && lpsql -d src -f supabase/seed-demo.sql >/dev/null
WORK="$(mktemp -d)"; age-keygen -o "$WORK/key.txt" 2>/dev/null; RECIP="$(grep -o 'age1[0-9a-z]*' "$WORK/key.txt")"
SUPABASE_DB_URL="$URL/src" BACKUP_AGE_RECIPIENT="$RECIP" BACKUP_DIR="$WORK/b" node scripts/backup.mjs
lpsql -d dst -f supabase/tests/auth-shim.sql >/dev/null
TARGET_DB_URL="$URL/dst" AGE_IDENTITY_FILE="$WORK/key.txt" bash scripts/restore-to-blank.sh "$(ls "$WORK"/b/*.age)" "$WORK/b/manifest-latest.json"
if SUPABASE_DB_URL="$URL/src" BACKUP_AGE_RECIPIENT="$RECIP" BACKUP_DIR="$WORK/c" BACKUP_FORCE_FAIL=1 node scripts/backup.mjs >/dev/null; then echo "FAIL: forced failure was not reported"; exit 1; fi
echo "Forced failure is reported: ok"
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.total_rows=m.total_rows*10;m.tables.households=1000;require("fs").writeFileSync(f+".big",JSON.stringify(m))' "$WORK/b/manifest-latest.json"
if SUPABASE_DB_URL="$URL/src" BACKUP_AGE_RECIPIENT="$RECIP" BACKUP_DIR="$WORK/d" BACKUP_PREVIOUS_MANIFEST="$WORK/b/manifest-latest.json.big" node scripts/backup.mjs >/dev/null; then echo "FAIL: a sharp drop in rows was not caught"; exit 1; fi
echo "Sharp drop in rows is caught: ok"
if TARGET_DB_URL="$URL/dst" AGE_IDENTITY_FILE="$WORK/key.txt" SKIP_MIGRATIONS=1 bash scripts/restore-to-blank.sh "$(ls "$WORK"/b/*.age)" "$WORK/b/manifest-latest.json" >/dev/null 2>&1; then echo "FAIL: restore into a non-blank database was allowed"; exit 1; fi
echo "Restore refuses a database that already has contacts: ok"
# A backup taken BEFORE the Nov 2026 review migrations (it still holds public.app_secrets, since
# dropped) must restore onto today's schema.
lpsql -d postgres -c 'create database oldsrc' -c 'create database dst_old' >/dev/null
lpsql -d oldsrc -f supabase/tests/auth-shim.sql >/dev/null
for f in supabase/migrations/*.sql; do case "$(basename "$f")" in 20261107*) continue;; esac; lpsql -d oldsrc -f "$f" >/dev/null; done
lpsql -d oldsrc -c "insert into public.households (display_name) values ('Testy McExample'), ('Sample Example')" \
  -c "insert into public.app_secrets (name, ciphertext) values ('ai_api_key', 'fake-ciphertext-for-test')" \
  -c "insert into public.people (household_id, first_name, birthday) select id, 'Testy', '1961-04-02' from public.households where display_name = 'Testy McExample'" \
  -c "update public.app_settings set daily_email_cap = 10 where id" >/dev/null
SUPABASE_DB_URL="$URL/oldsrc" BACKUP_AGE_RECIPIENT="$RECIP" BACKUP_DIR="$WORK/old" node scripts/backup.mjs >/dev/null
grep -q '"app_secrets"' "$WORK/old/manifest-latest.json" || { echo "FAIL: the old backup should list app_secrets"; exit 1; }
lpsql -d dst_old -f supabase/tests/auth-shim.sql >/dev/null
TARGET_DB_URL="$URL/dst_old" AGE_IDENTITY_FILE="$WORK/key.txt" bash scripts/restore-to-blank.sh "$(ls "$WORK"/old/*.age)" "$WORK/old/manifest-latest.json" >"$WORK/old.log" 2>&1 \
  || { cat "$WORK/old.log"; echo "FAIL: a backup from before the upgrade did not restore"; exit 1; }
[ "$(lpsql -d dst_old -Atc 'select count(*) from public.households')" = "2" ] || { echo "FAIL: old backup restored the wrong number of contacts"; exit 1; }
grep -q 'skipped  app_secrets' "$WORK/old.log" || { echo "FAIL: the skipped table was not reported"; exit 1; }
[ "$(lpsql -d dst_old -Atc "select birthday from public.people where first_name = 'Testy'")" = "2000-04-02" ] || { echo "FAIL: an old birthday kept its year"; exit 1; }
[ "$(lpsql -d dst_old -Atc "select count(*) from pg_constraint where conname in ('people_birthday_month_day_only','app_settings_caps_above_alert_reserve')")" = "2" ] || { echo "FAIL: restore did not put the checks back"; exit 1; }
echo "A backup from before the upgrade restores onto the new schema: ok"
rm -rf "$WORK"
echo "RESTORE TEST: passed"
