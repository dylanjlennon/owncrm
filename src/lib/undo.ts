import type { SupabaseClient } from '@supabase/supabase-js';

// One click undo for any import. Removes what the import created and what it added to
// contacts that already existed. Opt-outs and consent history stay. Safe to press again
// if it is interrupted: each step only removes rows still tagged with this import.
export async function undoImport(db: SupabaseClient, importId: string): Promise<{ ok: boolean; removed: number }> {
  const { data: imp } = await db.from('imports').select('status').eq('id', importId).maybeSingle();
  if (!imp || imp.status !== 'done') return { ok: false, removed: 0 };
  for (const table of ['interactions', 'tasks', 'source_evidence', 'deals', 'contact_methods']) {
    const { error } = await db.from(table).delete().eq('import_id', importId);
    if (error) return { ok: false, removed: 0 };
  }
  const { count, error } = await db.from('households').delete({ count: 'exact' }).eq('import_id', importId);
  if (error) return { ok: false, removed: 0 };
  await db.from('people').delete().eq('import_id', importId);
  await db.from('imports').update({ status: 'undone', undone_at: new Date().toISOString(), raw_csv: null }).eq('id', importId);
  return { ok: true, removed: count ?? 0 };
}

// Removes the weekly fake lead and everything attached to it, using its own flag.
export async function cleanupTestLeads(db: SupabaseClient): Promise<number> {
  const { count } = await db.from('households').delete({ count: 'exact' }).eq('is_test', true);
  return count ?? 0;
}
