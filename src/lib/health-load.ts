import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateHealth, type JobStatus } from './health';
import type { Settings } from './settings';

export async function loadHealth(db: SupabaseClient, s: Settings) {
  const [{ data: jobs }, { data: usage }, { data: size }, { data: hist }] = await Promise.all([
    db.from('v_job_status').select('*'),
    db.from('v_email_usage').select('*').maybeSingle(),
    db.rpc('db_size_bytes'),
    db.from('history_sources').select('last_success_at').order('last_success_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  return evaluateHealth({
    jobs: (jobs ?? []) as JobStatus[], now: new Date(), goLive: !!s.golive_completed_at,
    sendingPaused: !!s.sending_paused, pausedReason: s.sending_paused_reason, usage: usage as any, dbBytes: typeof size === 'number' ? size : null,
    dbLimitBytes: Number(process.env.DB_SIZE_LIMIT_MB || 8192) * 1024 * 1024,
    historySyncHours: s.history_sync_expected_hours, historyLastSuccessAt: hist?.last_success_at ?? null,
  });
}
