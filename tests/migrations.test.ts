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

describe('L4 round 4: migrations applied out of order', () => {
  const read = (f: string) => readFileSync(join(dir, f), 'utf8');
  it('0200 marks itself done on its last statement, and 0300 stops first if the mark is missing', () => {
    const m2 = read('20261107000200_review_fixes_2.sql').trim().split('\n');
    expect(m2.at(-1)).toMatch(/insert into private\.schema_marks .*'20261107000200_review_fixes_2'/);
    const m3 = read('20261107000300_alert_gate.sql').replace(/--[^\n]*/g, '');
    const check = m3.indexOf("private.schema_marks where name = '20261107000200_review_fixes_2'");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(m3.indexOf('alter table'));
  });
  it('0100 and 0200 only replace the send guard when no newer version is in place; 0300 marks its version', () => {
    for (const [f, v] of [['20261107000100_review_fixes.sql', 1], ['20261107000200_review_fixes_2.sql', 2]] as const) {
      const sql = read(f);
      expect(sql, f).toMatch(new RegExp(`send guard version \\(\\[0-9\\]\\+\\)'\\)::int, 0\\) > ${v} then`));
      expect(sql.replace(/do \$guard\$[\s\S]*?end \$guard\$;/g, ''), f).not.toMatch(/create or replace function private\.outbound_guard/);
    }
    expect(read('20261107000300_alert_gate.sql')).toMatch(/comment on function private\.outbound_guard\(\) is 'owncrm send guard version 3/);
  });
});
