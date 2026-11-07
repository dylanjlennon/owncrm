#!/usr/bin/env bash
# Restores an encrypted backup into a BLANK database and proves the row counts match.
# Usage: TARGET_DB_URL=... AGE_IDENTITY_FILE=key.txt scripts/restore-to-blank.sh backups/crm-....sql.gz.age backups/manifest-....json
# Add SKIP_MIGRATIONS=1 if you already ran the migrations on the target.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?encrypted backup file}"; MANIFEST="${2:?manifest file}"
: "${TARGET_DB_URL:?set TARGET_DB_URL to the NEW project database}"; : "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to your private age key file}"
q() { psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -Atq "$@"; }

if [ "$(q -c "select to_regclass('public.households') is not null")" = "t" ] && [ "$(q -c 'select count(*) from public.households')" != "0" ]; then
  echo "Stopped: the target already has contacts. Restore only into a blank project."; exit 1
fi
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  for f in supabase/migrations/*.sql; do echo "Applying $f"; q -f "$f"; done
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
age -d -i "$AGE_IDENTITY_FILE" -o "$TMP/backup.sql.gz" "$FILE"
gunzip "$TMP/backup.sql.gz"
# A backup taken before a migration that removed a table still holds that table's data. Leave it
# out (and say so) instead of stopping the whole restore. See scripts/restore-filter.mjs.
EXISTING="$(q -c "select coalesce(string_agg(c.relname, ','), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','S')")"
node scripts/restore-filter.mjs "$TMP/backup.sql" "$EXISTING" "$TMP/filtered.sql" "$TMP/skipped.json"
{
  echo "begin;"
  echo "set local session_replication_role = replica;"
  echo "delete from public.app_settings where id;"
  cat "$TMP/filtered.sql"
  echo "commit;"
} | grep -v '^SET transaction_timeout' | psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -q >/dev/null
node -e '
const m = require(process.argv[1]); const { execFileSync } = require("child_process");
const skipped = new Set(require(process.argv[2]).map((s) => s.table));
let bad = 0;
for (const [t, n] of Object.entries(m.tables)) {
  if (skipped.has(t)) { console.log(`skipped  ${t}: backup ${n}, table no longer exists in this version`); continue; }
  const got = Number(execFileSync("psql", [process.env.TARGET_DB_URL, "-Atc", `select count(*) from public."${t}"`], { encoding: "utf8" }).trim());
  const ok = got === n; if (!ok) bad++;
  console.log(`${ok ? "match" : "MISMATCH"}  ${t}: backup ${n}, restored ${got}`);
}
if (bad) { console.error(`${bad} tables do not match.`); process.exit(1); }
console.log("Restore verified: every table matches the backup.");
' "$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")" "$TMP/skipped.json"
echo "Next: create your login in the new project, turn on two-step sign-in, and add it to app_owner (RESTORE.md step 6)."
