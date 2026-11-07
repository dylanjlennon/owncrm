// Review round 2, N3: a refused spreadsheet row, and the raw file, are never stored.
import { describe, it, expect, vi } from 'vitest';
import { fakeDb } from './fakedb';

const db = fakeDb({
  tables: { imports: [], app_settings: [{ id: true, timezone: 'UTC' }] },
  defaults: { imports: () => ({ status: 'draft', created_at: new Date().toISOString(), error_csv: null, error_rows: 0 }) },
  rpc: {
    // Same effect as public.import_contract on the imports row.
    import_contract: (args: any, t: any) => { const r = t.imports.find((x: any) => x.id === args.p_import); Object.assign(r, { status: 'done', raw_csv: null, imported_rows: args.p.households.length }); return { created: args.p.households.length }; },
  },
});
vi.mock('@/lib/auth', () => ({ requireOwner: async () => ({ db }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { uploadCsv, commitImport } = await import('@/app/(app)/import/actions');

const SECRET_BITS = ['123-45-6789', 'chemo', '021000021', 'Lawsuit'];
const csv = [
  'First,Email,Notes',
  'Testy,testy@example.com,Toured homes Saturday',
  'Sample,sample@example.com,"SSN 123-45-6789, starting chemo next week"',
  'Demo,demo@example.com,routing 021000021',
  'Example,example@example.com,Lawsuit with the HOA',
  'Nobody,,no contact',
].join('\n');

describe('N3: import storage', () => {
  it('stores neither the raw file nor any refused cell, before or after the import', async () => {
    const f = new FormData(); f.set('file', new File([csv], 'contacts.csv', { type: 'text/csv' }));
    await uploadCsv(f).catch((e) => e);
    const row = db.tables.imports[0];
    const stored = () => JSON.stringify(db.tables.imports);
    for (const bit of SECRET_BITS) expect(stored()).not.toContain(bit);
    expect(row.raw_csv).not.toContain('First,Email,Notes');
    expect(row.error_rows).toBe(3);
    expect(row.error_csv).toMatch(/^line,problem/);

    const c = new FormData(); c.set('id', row.id); c.set('m_first_name', '0'); c.set('m_email', '1'); c.set('m_notes', '2');
    await commitImport(c).catch((e) => e);
    for (const bit of SECRET_BITS) expect(stored()).not.toContain(bit);
    expect(row.status).toBe('done');
    expect(row.raw_csv).toBeNull();
    // Upload refusals and the row refused after matching ("Nobody" has no email or phone).
    expect(row.error_rows).toBe(4);
    expect(row.error_csv.split('\r\n').slice(1).filter(Boolean).map((l: string) => l.split(',')[0])).toEqual(['3', '4', '5', '6']);
  });
  it('an unfinished upload is cleared after a day', async () => {
    const { runTick } = await import('@/lib/tick');
    const { jobStatusView } = await import('./fakedb');
    const old = { id: 'imp-old', status: 'draft', kind: 'csv', raw_csv: '{"headers":[],"lines":[],"rows":[]}', created_at: new Date(Date.now() - 30 * 3600000).toISOString() };
    const fresh = { ...old, id: 'imp-new', created_at: new Date().toISOString() };
    const t = fakeDb({
      tables: { imports: [old, fresh], app_settings: [{ id: true, timezone: 'UTC', all_clear_enabled: false, owner_email: 'owner@example.com' }], job_runs: [], leads: [], outbound_emails: [], rate_limits: [], history_sources: [] },
      views: { v_job_status: jobStatusView, v_today_deal_dates: () => [], v_email_usage: () => [] },
      defaults: { job_runs: () => ({ started_at: new Date().toISOString() }) },
      rpc: { run_hygiene: () => ({ added: 0, fixed: 0 }), db_size_bytes: () => 1 },
    });
    const { MockAdapter } = await import('@/lib/email/mock');
    await runTick({ db: t as any, adapter: new MockAdapter(), appUrl: 'https://crm.example.com', now: new Date(), selfTest: async () => ({ ok: true, detail: '' }), fakeLead: async () => ({ ok: true, detail: '' }) });
    expect(t.tables.imports.find((r: any) => r.id === 'imp-old')!.raw_csv).toBeNull();
    expect(t.tables.imports.find((r: any) => r.id === 'imp-new')!.raw_csv).not.toBeNull();
  });
  it('a contract error file never repeats a refused column name', async () => {
    const { validateContract, errorsCsv } = await import('../contract/lib/validate.mjs');
    const v = validateContract({ manifest: '{"contract_version":"1.0.0","created_at":"2026-11-01T00:00:00Z"}', files: { households: 'household_id,display_name,ssn 123-45-6789\nh1,Testy,x\n', people: 'person_id,household_id,first_name\n', contact_methods: 'household_id,kind,value\n' } });
    expect(errorsCsv(v.errors)).not.toContain('123-45-6789');
  });
});
