// Review fix L1: the history token never goes into a crontab line or a log.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, statSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, loadEnvFile } from '../rescue/bin/rescue.mjs';

const TOKEN = 'och_fake_token_for_tests';

describe('L1: scheduled rescue keeps the token in a private file', () => {
  it('the printed schedule has no token, and the token is in a 0600 file', async () => {
    const work = mkdtempSync(join(tmpdir(), 'sched-'));
    const lines: string[] = [];
    const before = process.env.OWNCRM_HISTORY_TOKEN;
    process.env.OWNCRM_HISTORY_TOKEN = TOKEN;
    try { await run(['schedule', '--work', work, '--url', 'https://crm.example.com'], (l: string) => lines.push(l)); }
    finally { if (before === undefined) delete process.env.OWNCRM_HISTORY_TOKEN; else process.env.OWNCRM_HISTORY_TOKEN = before; }
    const out = lines.join('\n');
    expect(out).not.toContain('OWNCRM_HISTORY_TOKEN=');
    expect(out).not.toContain(TOKEN);
    expect(out).toMatch(/owncrm\.env/);
    const envFile = join(work, 'owncrm.env');
    if (process.platform !== 'win32') expect(statSync(envFile).mode & 0o777).toBe(0o600);
    expect(loadEnvFile(work)).toEqual({ OWNCRM_URL: 'https://crm.example.com', OWNCRM_HISTORY_TOKEN: TOKEN });
  });
  it('refuses an env file other users can read', () => {
    if (process.platform === 'win32') return;
    const work = mkdtempSync(join(tmpdir(), 'sched-'));
    writeFileSync(join(work, 'owncrm.env'), `OWNCRM_HISTORY_TOKEN=${TOKEN}\n`);
    chmodSync(join(work, 'owncrm.env'), 0o644);
    expect(() => loadEnvFile(work)).toThrow(/chmod 600/);
  });
  it('a dry-run upload log never prints the token', async () => {
    const work = mkdtempSync(join(tmpdir(), 'sched-'));
    writeFileSync(join(work, 'owncrm.env'), `OWNCRM_URL=https://crm.example.com\nOWNCRM_HISTORY_TOKEN=${TOKEN}\n`, { mode: 0o600 });
    const lines: string[] = [];
    await run(['heartbeat', '--work', work], (l: string) => lines.push(l));
    expect(lines.join('\n')).not.toContain(TOKEN);
    expect(readFileSync(join(work, 'audit.jsonl'), 'utf8')).not.toContain(TOKEN);
  });
});
