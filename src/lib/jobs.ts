import type { SupabaseClient } from '@supabase/supabase-js';

export async function runJob<T>(db: SupabaseClient, job: string, fn: () => Promise<{ ok: boolean; detail: string; value?: T }>) {
  const { data: row } = await db.from('job_runs').insert({ job }).select('id').single();
  let res: { ok: boolean; detail: string; value?: T };
  try { res = await fn(); } catch (e: any) { res = { ok: false, detail: `Error: ${String(e?.message || e).slice(0, 300)}` }; }
  if (row) await db.from('job_runs').update({ ok: res.ok, detail: res.detail.slice(0, 1000), finished_at: new Date().toISOString() }).eq('id', row.id);
  return res;
}

export async function lastSuccess(db: SupabaseClient, job: string): Promise<string | null> {
  const { data } = await db.from('job_runs').select('finished_at').eq('job', job).eq('ok', true).order('finished_at', { ascending: false }).limit(1).maybeSingle();
  return data?.finished_at ?? null;
}

/** When the job last finished, whether it worked or not. */
export async function lastFinished(db: SupabaseClient, job: string): Promise<string | null> {
  const { data } = await db.from('job_runs').select('finished_at').eq('job', job).not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1).maybeSingle();
  return data?.finished_at ?? null;
}
