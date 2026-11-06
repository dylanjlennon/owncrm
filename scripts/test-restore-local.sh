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
rm -rf "$WORK"
echo "RESTORE TEST: passed"
