#!/usr/bin/env node
// Nightly backup: dump the data, check it, encrypt it, and report the result.
// A backup that wasn't checked doesn't count. This one fails loudly when:
//   the dump is empty, a table's row count in the file doesn't match the database,
//   rows dropped sharply since the last backup, or the encrypted file looks wrong.
// Env: SUPABASE_DB_URL (required), BACKUP_AGE_RECIPIENT (required, an age public key),
//      BACKUP_DIR (default ./backups), BACKUP_PREVIOUS_MANIFEST (optional),
//      OWNCRM_URL + BACKUP_REPORT_SECRET (optional, reports to the Status page),
//      HEALTHCHECK_BACKUP_URL (outside watchdog, required for go-live), BACKUP_FORCE_FAIL=1 (drill).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const env = process.env;
const dir = env.BACKUP_DIR || 'backups';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const EXCLUDE = ['app_owner', 'rate_limits'];

async function report(ok, detail) {
  // Say whether the outside backup check was pinged, so go-live can see it is set up.
  detail = `${detail} ${env.HEALTHCHECK_BACKUP_URL ? 'Outside check: pinged.' : 'Outside check: not set up (HEALTHCHECK_BACKUP_URL).'}`;
  console.log(`${ok ? 'OK' : 'FAILED'}: ${detail}`);
  const tasks = [];
  if (env.OWNCRM_URL && env.BACKUP_REPORT_SECRET) {
    tasks.push(fetch(`${env.OWNCRM_URL.replace(/\/$/, '')}/api/backup-report`, { method: 'POST', headers: { Authorization: `Bearer ${env.BACKUP_REPORT_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok, detail }) }).catch(() => null));
  }
  if (env.HEALTHCHECK_BACKUP_URL) tasks.push(fetch(ok ? env.HEALTHCHECK_BACKUP_URL : `${env.HEALTHCHECK_BACKUP_URL.replace(/\/$/, '')}/fail`, { method: 'POST', body: detail }).catch(() => null));
  await Promise.all(tasks);
  process.exit(ok ? 0 : 1);
}

export function countCopyRows(sql) {
  const counts = {};
  let current = null;
  for (const line of sql.split('\n')) {
    if (current) { if (line === '\\.') current = null; else counts[current]++; continue; }
    const m = line.match(/^COPY public\.("?)(\w+)\1 /);
    if (m) { current = m[2]; counts[current] = 0; }
  }
  return counts;
}

async function main() {
  if (!env.SUPABASE_DB_URL) return report(false, 'SUPABASE_DB_URL is not set.');
  if (!env.BACKUP_AGE_RECIPIENT) return report(false, 'BACKUP_AGE_RECIPIENT is not set. Backups must be encrypted.');
  if (env.BACKUP_FORCE_FAIL === '1') return report(false, 'Forced failure drill. If you got an alert, alerts work.');
  mkdirSync(dir, { recursive: true });
  const psql = (sql) => execFileSync('psql', [env.SUPABASE_DB_URL, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8' }).trim();
  const tables = psql(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`).split('\n').filter((t) => t && !EXCLUDE.includes(t));
  const plainPath = join(dir, `crm-${stamp}.sql`);
  execFileSync('pg_dump', [env.SUPABASE_DB_URL, '--data-only', '--schema=public', ...EXCLUDE.map((t) => `--exclude-table=public.${t}`), '--no-owner', '--no-privileges', '-f', plainPath]);
  const plain = readFileSync(plainPath, 'utf8');
  const fileCounts = countCopyRows(plain);
  const live = Object.fromEntries(psql(tables.map((t) => `select '${t}', count(*) from public."${t}"`).join(' union all ')).split('\n').map((l) => { const [t, n] = l.split('|'); return [t, Number(n)]; }));
  const problems = [];
  for (const t of tables) {
    const inFile = fileCounts[t] ?? -1;
    if (inFile < 0) problems.push(`${t} is missing from the dump`);
    else if (Math.abs(inFile - live[t]) > Math.max(5, live[t] * 0.02)) problems.push(`${t}: ${inFile} rows in the file but ${live[t]} in the database`);
  }
  const total = Object.values(fileCounts).reduce((a, b) => a + b, 0);
  if (plain.length < 200) problems.push('The dump is nearly empty');
  if (env.BACKUP_PREVIOUS_MANIFEST && existsSync(env.BACKUP_PREVIOUS_MANIFEST)) {
    const prev = JSON.parse(readFileSync(env.BACKUP_PREVIOUS_MANIFEST, 'utf8'));
    if (prev.total_rows > 50 && total < prev.total_rows * Number(env.BACKUP_MIN_RATIO || 0.8)) problems.push(`Rows fell from ${prev.total_rows} to ${total} since the last backup`);
    for (const t of ['households', 'suppressions', 'consent_records']) if ((prev.tables?.[t] ?? 0) > 10 && (fileCounts[t] ?? 0) === 0) problems.push(`${t} went from ${prev.tables[t]} rows to none`);
  }
  const gz = gzipSync(Buffer.from(plain));
  const gzPath = `${plainPath}.gz`;
  writeFileSync(gzPath, gz);
  const encPath = `${gzPath}.age`;
  execFileSync('age', ['-r', env.BACKUP_AGE_RECIPIENT, '-o', encPath, gzPath]);
  rmSync(plainPath); rmSync(gzPath);
  const enc = readFileSync(encPath);
  if (!enc.subarray(0, 21).toString().startsWith('age-encryption.org/v1')) problems.push('The encrypted file does not look like an age file');
  if (statSync(encPath).size < 100) problems.push('The encrypted file is too small');
  const manifest = { created_at: new Date().toISOString(), file: encPath.split('/').pop(), sha256: createHash('sha256').update(enc).digest('hex'), bytes_encrypted: enc.length, bytes_plain: plain.length, total_rows: total, tables: fileCounts };
  writeFileSync(join(dir, `manifest-${stamp}.json`), JSON.stringify(manifest, null, 2));
  writeFileSync(join(dir, 'manifest-latest.json'), JSON.stringify(manifest, null, 2));
  if (problems.length) return report(false, `Backup checks failed: ${problems.join('; ')}`);
  return report(true, `Backup checked: ${tables.length} tables, ${total} rows, ${Math.round(enc.length / 1024)} KB encrypted.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => report(false, `Backup error: ${String(e.message).slice(0, 300)}`));
