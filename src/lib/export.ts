import type { SupabaseClient } from '@supabase/supabase-js';

export const EXPORTS = [
  { key: 'contacts', label: 'Contacts (households with stage, source and consent)', table: 'v_households' },
  { key: 'people', label: 'People', table: 'people' },
  { key: 'contact_methods', label: 'Emails and phones', table: 'contact_methods' },
  { key: 'notes', label: 'Notes and timeline', table: 'interactions' },
  { key: 'followups', label: 'Follow-ups', table: 'tasks' },
  { key: 'deals', label: 'Deals', table: 'deals' },
  { key: 'deal_dates', label: 'Deal key dates', table: 'deal_dates' },
  { key: 'consent', label: 'Consent history', table: 'consent_records' },
  { key: 'suppressions', label: 'Opt-out list', table: 'suppressions' },
  { key: 'leads', label: 'Lead log', table: 'leads' },
  { key: 'source_evidence', label: 'Where relationships were found', table: 'source_evidence' },
] as const;

// Reads every row, page by page. The database returns at most 1,000 rows per request,
// so a single request would quietly cut off a big list.
export async function readAll(db: SupabaseClient, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select('*').order(table === 'suppressions' ? 'normalized' : 'id').range(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}
