import type { SupabaseClient } from '@supabase/supabase-js';

// The only way any screen gets a count. One database view, one query.
export type Counts = {
  households: number; new_leads: number; unreplied_leads: number; followups_due: number;
  deal_dates_soon: number; open_deals: number; needs_review: number; open_findings: number;
};
export async function getCounts(db: SupabaseClient): Promise<Counts> {
  const { data, error } = await db.from('v_counts').select('*').single();
  if (error || !data) throw new Error('Could not read counts');
  return data as Counts;
}
