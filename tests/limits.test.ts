// Blue smaller item: a 4.5 to 5 MB import gets a clear message, not a Vercel platform error.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importSizeProblem, IMPORT_MAX_BYTES } from '@/lib/limits';
import { messageFor } from '@/lib/messages';

describe('import size', () => {
  it('stays under the 4.5 MB Vercel request limit', () => {
    expect(IMPORT_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
    expect(importSizeProblem(4.7 * 1024 * 1024)).toMatch(/4 MB/);
    expect(importSizeProblem(3 * 1024 * 1024)).toBeNull();
  });
  it('says what to do instead', () => {
    expect(messageFor('import_too_big')?.text).toMatch(/contract:sql/);
  });
  it('the server action and Next agree with it', () => {
    expect(readFileSync(join(__dirname, '..', 'next.config.mjs'), 'utf8')).toMatch(/bodySizeLimit: '4\.5mb'/);
    expect(readFileSync(join(__dirname, '..', 'src/app/(app)/import/actions.ts'), 'utf8')).toMatch(/const MAX = IMPORT_MAX_BYTES/);
  });
});

describe('N6: email caps leave room for client email', async () => {
  const { capsProblem } = await import('@/lib/limits');
  it('refuses a daily or monthly cap at or below the alert reserve', () => {
    expect(capsProblem({ daily_email_cap: 10, monthly_email_cap: 3000, reserved_alert_budget: 40 })).toBe(true);
    expect(capsProblem({ daily_email_cap: 40, monthly_email_cap: 3000, reserved_alert_budget: 40 })).toBe(true);
    expect(capsProblem({ daily_email_cap: 100, monthly_email_cap: 3000, reserved_alert_budget: 40 })).toBe(false);
    expect(messageFor('caps_too_low')?.text).toMatch(/higher than/);
  });
});
