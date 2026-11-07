// Review round 2, N5: a backup taken before a table was dropped still restores.
import { describe, it, expect } from 'vitest';
import { dropMissingTables } from '../scripts/restore-filter.mjs';

const dump = [
  'SET client_encoding = \'UTF8\';',
  'COPY public.app_secrets (name, ciphertext, enabled, updated_at) FROM stdin;',
  'ai_api_key\tfake\tf\t2026-11-01 00:00:00+00',
  '\\.',
  '',
  'COPY public.households (id, display_name) FROM stdin;',
  '00000000-0000-4000-8000-000000000001\tTesty McExample',
  '\\.',
  "SELECT pg_catalog.setval('public.audit_log_id_seq', 4, true);",
  "SELECT pg_catalog.setval('public.gone_id_seq', 9, true);",
].join('\n');

describe('N5: restore filter', () => {
  it('drops data for tables that no longer exist, keeps the rest, and reports what it skipped', () => {
    const r = dropMissingTables(dump, new Set(['households', 'audit_log', 'audit_log_id_seq']));
    expect(r.skipped).toEqual([{ table: 'app_secrets', rows: 1 }]);
    expect(r.sql).not.toContain('app_secrets');
    expect(r.sql).not.toContain('gone_id_seq');
    expect(r.sql).toContain('COPY public.households');
    expect(r.sql).toContain('Testy McExample');
    expect(r.sql).toContain("setval('public.audit_log_id_seq'");
  });
  it('changes nothing when every table still exists', () => {
    const r = dropMissingTables(dump, new Set(['households', 'app_secrets', 'audit_log_id_seq', 'gone_id_seq']));
    expect(r.sql).toBe(dump);
    expect(r.skipped).toEqual([]);
  });
});

describe('M4 round 3: a backup from before the upgrade does not bring back refused rows', () => {
  // In a pg_dump COPY block a newline inside a value is written as the two characters \n.
  const oldDump = [
    'COPY public.imports (id, kind, filename, status, raw_csv, error_csv, total_rows) FROM stdin;',
    '1\tcsv\told.csv\tdraft\tname,notes\\nTesty,SSN 123-45-6789 starting chemo\tline,problem,name,notes\\n2,refused,Testy,SSN 123-45-6789 starting chemo\t1',
    '2\tcsv\tdone.csv\tdone\t\\N\tline,problem,name,notes\\n3,refused,Sample,cancer\t1',
    '3\tcsv\tnew.csv\tdone\t\\N\tline,problem\\n4,Mentions health or a legal matter\t1',
    '4\tcsv\tnewdraft.csv\tdraft\t{"headers":["name"],"rows":[["Demo"]],"lines":[2]}\t\\N\t1',
    '\\.',
  ].join('\n');
  it('clears the old raw file and the old error file, keeps the new line-and-reason file and new drafts', () => {
    const r = dropMissingTables(oldDump, new Set(['imports']));
    expect(r.sql).not.toContain('123-45-6789');
    expect(r.sql).not.toContain('cancer');
    expect(r.sql).not.toContain('chemo');
    expect(r.sql).toContain('line,problem\\n4,Mentions health or a legal matter');
    expect(r.sql).toContain('{"headers":["name"]');
    expect(r.scrubbed).toEqual({ table: 'imports', rows: 2 });
    const rows = r.sql.split('\n').slice(1, 5).map((l) => l.split('\t'));
    expect(rows[0][4]).toBe('\\N');
    expect(rows[0][5]).toBe('\\N');
    expect(rows[1][5]).toBe('\\N');
    expect(rows.every((c) => c.length === 7)).toBe(true);
  });
  it('works whatever order the columns are in', () => {
    const dump = ['COPY public.imports (error_csv, id, raw_csv) FROM stdin;', 'line,problem,notes\\n2,x,cancer\t1\tnotes\\ncancer', '\\.'].join('\n');
    const r = dropMissingTables(dump, new Set(['imports']));
    expect(r.sql.split('\n')[1]).toBe('\\N\t1\t\\N');
  });
});
