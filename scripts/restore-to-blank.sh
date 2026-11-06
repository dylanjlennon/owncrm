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
{
  echo "begin;"
  echo "set local session_replication_role = replica;"
  echo "delete from public.app_settings where id;"
  cat "$TMP/backup.sql"
  echo "commit;"
} | grep -v '^SET transaction_timeout' | psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -q >/dev/null
node -e '
const m = require(process.argv[1]); const { execFileSync } = require("child_process");
let bad = 0;
for (const [t, n] of Object.entries(m.tables)) {
  const got = Number(execFileSync("psql", [process.env.TARGET_DB_URL, "-Atc", `select count(*) from public."${t}"`], { encoding: "utf8" }).trim());
  const ok = got === n; if (!ok) bad++;
  console.log(`${ok ? "match" : "MISMATCH"}  ${t}: backup ${n}, restored ${got}`);
}
if (bad) { console.error(`${bad} tables do not match.`); process.exit(1); }
console.log("Restore verified: every table matches the backup.");
' "$(cd "$(dirname "$MANIFEST")" && pwd)/$(basename "$MANIFEST")"
echo "Next: create your login in the new project, turn on two-step sign-in, and add it to app_owner (RESTORE.md step 6)."
