// Review fix L2: the unused AI key setting and its encryption are gone everywhere.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as secure from '@/lib/secure';

const root = join(__dirname, '..');
function files(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', '.e2e', 'review', 'screens', 'test-results'].includes(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) files(p, out); else if (/\.(ts|tsx|mjs|md|sql|example|yml)$/.test(f)) out.push(p);
  }
  return out;
}

describe('L2: no AI key setting', () => {
  it('no code, page or doc offers to store an AI key', () => {
    const hits = files(root)
      .filter((p) => !p.endsWith('no-ai-key.test.ts') && !/supabase\/migrations\/2026110600/.test(p))
      .filter((p) => /ai_api_key|app_secrets|APP_ENCRYPTION_KEY|encryptSecret|decryptSecret|Optional AI key/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(root, p));
    expect(hits).toEqual(['supabase/migrations/20261107000100_review_fixes.sql']);
  });
  it('the encryption helpers are gone', () => {
    expect('encryptSecret' in secure).toBe(false);
    expect('decryptSecret' in secure).toBe(false);
  });
  it('a migration drops the table', () => {
    const sql = readFileSync(join(root, 'supabase/migrations/20261107000100_review_fixes.sql'), 'utf8');
    expect(sql).toMatch(/drop table if exists public\.app_secrets/);
  });
  it('the docs still promise that no AI login is ever stored', () => {
    expect(readFileSync(join(root, 'FAQ.md'), 'utf8')).toMatch(/never stores an AI login/);
  });
});
