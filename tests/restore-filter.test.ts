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
