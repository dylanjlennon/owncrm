#!/usr/bin/env node
// Makes an older backup load into today's database. A table that a later migration removed
// (for example public.app_secrets, the old AI key setting, dropped in Nov 2026) still has a
// "COPY public.<table>" block in backups taken before that migration. Loading it would stop the
// whole restore. This removes those blocks and says which tables were skipped and how many rows
// they held, so the restore can go on and the row check can leave them out.
// It also clears what older versions kept from spreadsheet uploads (Nov 2026 review, M4): the
// whole uploaded file (imports.raw_csv) and an error file that copied refused rows word for word
// (imports.error_csv), including the SSN or health text that got them refused. Only the new
// shapes are kept: a draft of rows that passed (JSON) and an error file of line and reason.
// private.restore_finish() in the database does the same again, in case this step is skipped.
// Usage: node scripts/restore-filter.mjs <dump.sql> <existing tables, comma separated> <out.sql> <skipped.json>
import { readFileSync, writeFileSync } from 'node:fs';

// A value as pg_dump writes it in a COPY block: newlines are the two characters \n, NULL is \N.
const NULL = '\\N';
const newDraft = (/** @type {string} */ v) => v === NULL || v.startsWith('{');
const newErrorFile = (/** @type {string} */ v) => v === NULL || /^line,problem(?:\\r)?\\n/.test(v) || v === 'line,problem';

/**
 * @param {string} sql the plain pg_dump --data-only output
 * @param {Set<string>} existing public tables in the target database
 * @returns {{ sql: string, skipped: { table: string, rows: number }[], scrubbed: { table: string, rows: number } }}
 */
export function dropMissingTables(sql, existing) {
  const out = [];
  /** @type {{ table: string, rows: number }[]} */
  const skipped = [];
  const scrubbed = { table: 'imports', rows: 0 };
  /** @type {{ table: string, rows: number } | null} */
  let dropping = null;
  /** @type {{ raw: number, err: number } | null} */
  let imports = null;
  for (const line of sql.split('\n')) {
    if (dropping) {
      if (line === '\\.') { skipped.push(dropping); dropping = null; } else dropping.rows++;
      continue;
    }
    if (imports) {
      if (line === '\\.') { imports = null; out.push(line); continue; }
      const cells = line.split('\t');
      let changed = false;
      if (imports.raw >= 0 && !newDraft(cells[imports.raw] ?? NULL)) { cells[imports.raw] = NULL; changed = true; }
      if (imports.err >= 0 && !newErrorFile(cells[imports.err] ?? NULL)) { cells[imports.err] = NULL; changed = true; }
      if (changed) scrubbed.rows++;
      out.push(cells.join('\t'));
      continue;
    }
    const m = line.match(/^COPY public\.("?)(\w+)\1 /);
    if (m && !existing.has(m[2])) { dropping = { table: m[2], rows: 0 }; continue; }
    if (m && m[2] === 'imports') {
      const cols = (line.match(/\(([^)]*)\)/)?.[1] ?? '').split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      imports = { raw: cols.indexOf('raw_csv'), err: cols.indexOf('error_csv') };
    }
    // pg_dump also writes sequence values. One for a dropped table would fail the same way.
    const seq = line.match(/^SELECT pg_catalog\.setval\('public\.("?)(\w+)\1'/);
    if (seq && !existing.has(seq[2])) continue;
    out.push(line);
  }
  return { sql: out.join('\n'), skipped, scrubbed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dump, tables, outFile, skippedFile] = process.argv.slice(2);
  if (!dump || tables === undefined || !outFile || !skippedFile) { console.error('Usage: restore-filter.mjs <dump.sql> <tables,...> <out.sql> <skipped.json>'); process.exit(2); }
  // Sequences are passed in the same list as tables.
  const r = dropMissingTables(readFileSync(dump, 'utf8'), new Set(tables.split(',').filter(Boolean)));
  writeFileSync(outFile, r.sql);
  writeFileSync(skippedFile, JSON.stringify(r.skipped));
  for (const s of r.skipped) console.log(`Skipped ${s.table}: this table no longer exists in this version (${s.rows} rows in the backup).`);
  if (r.scrubbed.rows) console.log(`Cleared the stored upload or old error file on ${r.scrubbed.rows} imports: older versions kept refused rows word for word.`);
}
