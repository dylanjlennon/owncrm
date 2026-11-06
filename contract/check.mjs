#!/usr/bin/env node
// Usage: npm run contract:check <folder>
// Checks a contract folder. On failure writes <folder>/contract-errors.csv and exits 1.
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateContract, errorsCsv, CSV_FILES } from './lib/validate.mjs';

export function readFolder(dir) {
  const listing = readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'contract-errors.csv' && statSync(join(dir, f)).isFile());
  const known = new Set(['manifest.json', ...CSV_FILES.map((n) => `${n}.csv`)]);
  const files = {};
  for (const n of CSV_FILES) { const p = join(dir, `${n}.csv`); files[n] = existsSync(p) ? readFileSync(p, 'utf8') : null; }
  const m = join(dir, 'manifest.json');
  return { manifest: existsSync(m) ? readFileSync(m, 'utf8') : null, files, extraFiles: listing.filter((f) => !known.has(f)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir || !existsSync(dir)) { console.error('Usage: npm run contract:check <folder>'); process.exit(2); }
  const result = validateContract(readFolder(resolve(dir)));
  console.log(Object.entries(result.counts).map(([k, v]) => `${k}: ${v}`).join('\n'));
  if (!result.ok) {
    writeFileSync(join(dir, 'contract-errors.csv'), errorsCsv(result.errors));
    console.error(`\nNOT VALID: ${result.errors.length} problem(s). See ${join(dir, 'contract-errors.csv')}`);
    for (const e of result.errors.slice(0, 10)) console.error(`  ${e.file} line ${e.line} ${e.column}: ${e.problem}`);
    process.exit(1);
  }
  console.log('\nVALID: this folder can be imported.');
}
