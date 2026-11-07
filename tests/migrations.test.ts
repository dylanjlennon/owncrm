// Review round 2, N14 and N15: migrations are safe to paste by hand, and the deploy order is written down.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'supabase', 'migrations');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

describe('N14: a trigger switched off in a migration is switched back on in the same statement', () => {
  it.each(migrations)('%s', (f) => {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    const outside = sql.replace(/do \$\$[\s\S]*?\$\$;/gi, '');
    expect(outside).not.toMatch(/disable trigger/i);
    for (const block of sql.match(/do \$\$[\s\S]*?\$\$;/gi) ?? []) {
      const off = block.match(/disable trigger (\w+)/gi) ?? [];
      for (const d of off) expect(block).toMatch(new RegExp(d.replace(/disable/i, 'enable'), 'i'));
    }
  });
});

describe('N15: deploy order', () => {
  it('HOW-TO says to apply new migrations before deploying the app', () => {
    const howto = readFileSync(join(__dirname, '..', 'HOW-TO.md'), 'utf8');
    expect(howto).toMatch(/migrations?\W*(first|before)/i);
    expect(howto).toMatch(/20261107000200_review_fixes_2\.sql/);
    expect(howto).toMatch(/20261107000300_alert_gate\.sql/);
    expect(howto).toMatch(/Stopped before changing anything/);
  });
});
