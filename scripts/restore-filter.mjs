#!/usr/bin/env node
// Makes an older backup load into today's database. A table that a later migration removed
// (for example public.app_secrets, the old AI key setting, dropped in Nov 2026) still has a
// "COPY public.<table>" block in backups taken before that migration. Loading it would stop the
// whole restore. This removes those blocks and says which tables were skipped and how many rows
// they held, so the restore can go on and the row check can leave them out.
// Usage: node scripts/restore-filter.mjs <dump.sql> <existing tables, comma separated> <out.sql> <skipped.json>
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * @param {string} sql the plain pg_dump --data-only output
 * @param {Set<string>} existing public tables in the target database
 * @returns {{ sql: string, skipped: { table: string, rows: number }[] }}
 */
export function dropMissingTables(sql, existing) {
  const out = [];
  /** @type {{ table: string, rows: number }[]} */
  const skipped = [];
  /** @type {{ table: string, rows: number } | null} */
  let dropping = null;
  for (const line of sql.split('\n')) {
    if (dropping) {
      if (line === '\\.') { skipped.push(dropping); dropping = null; } else dropping.rows++;
      continue;
    }
    const m = line.match(/^COPY public\.("?)(\w+)\1 /);
    if (m && !existing.has(m[2])) { dropping = { table: m[2], rows: 0 }; continue; }
    // pg_dump also writes sequence values. One for a dropped table would fail the same way.
    const seq = line.match(/^SELECT pg_catalog\.setval\('public\.("?)(\w+)\1'/);
    if (seq && !existing.has(seq[2])) continue;
    out.push(line);
  }
  return { sql: out.join('\n'), skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dump, tables, outFile, skippedFile] = process.argv.slice(2);
  if (!dump || tables === undefined || !outFile || !skippedFile) { console.error('Usage: restore-filter.mjs <dump.sql> <tables,...> <out.sql> <skipped.json>'); process.exit(2); }
  // Sequences are passed in the same list as tables.
  const r = dropMissingTables(readFileSync(dump, 'utf8'), new Set(tables.split(',').filter(Boolean)));
  writeFileSync(outFile, r.sql);
  writeFileSync(skippedFile, JSON.stringify(r.skipped));
  for (const s of r.skipped) console.log(`Skipped ${s.table}: this table no longer exists in this version (${s.rows} rows in the backup).`);
}
