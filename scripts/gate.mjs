#!/usr/bin/env node
// npm run gate: everything that must pass before a change ships.
// typecheck, lint, unit tests (app, contract, rescue), build, secret and client-data scan,
// the access test on a blank local database, database rules (upgrade, restore, alert gate),
// backup and restore test, and, when .env.local
// and test accounts exist, real HTTPS access checks against the test project.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const steps = [
  ['Typecheck', 'npx', ['tsc', '--noEmit']],
  ['Lint', 'npx', ['eslint', '.', '--max-warnings=0']],
  ['Unit tests', 'npx', ['vitest', 'run']],
  ['Build', 'npx', ['next', 'build']],
  ['Secret and client-data scan', 'node', ['scripts/scan-secrets.mjs']],
  ['Access test on a blank local database (all migrations replayed)', 'bash', ['scripts/test-rls-local.sh'], { skippable: true }],
  ['Database rules on local Postgres (upgrade, restore, alert gate)', 'bash', ['scripts/test-db-local.sh'], { skippable: true }],
  ['Backup and restore-to-blank test', 'bash', ['scripts/test-restore-local.sh'], { skippable: true }],
  ['Access checks over HTTPS against the test project', 'node', ['scripts/test-rest.mjs'], { needs: ['.env.local', '.e2e/accounts.json'] }],
];
const summary = [];
for (const [name, cmd, args, opts = {}] of steps) {
  if (opts.needs && !opts.needs.every((f) => existsSync(f))) { summary.push(`SKIP  ${name} (needs ${opts.needs.join(' and ')})`); continue; }
  console.log(`\n=== ${name}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_USE_ENV_PROXY: process.env.HTTPS_PROXY ? '1' : process.env.NODE_USE_ENV_PROXY, NODE_NO_WARNINGS: '1' } });
  if (opts.skippable && r.status === 77) { summary.push(`SKIP  ${name} (Postgres or age not installed)`); continue; }
  summary.push(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${name}`);
  if (r.status !== 0) break;
}
const remote = 'docs/test-results/rls-remote.json';
if (existsSync(remote)) {
  const r = JSON.parse(readFileSync(remote, 'utf8'));
  summary.push(`INFO  Access test as SQL on the test project (run through the Supabase SQL editor or MCP): ${r.passed}/${r.total} on ${r.ran_at}`);
}
console.log(`\n${summary.join('\n')}`);
process.exit(summary.some((s) => s.startsWith('FAIL')) ? 1 : 0);
