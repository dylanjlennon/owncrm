import { serviceClient } from '@/lib/supabase/service';
import { json, readLimited } from '@/lib/http';
import { hashHistoryToken } from '@/lib/history/token';
import { validateHistoryUpload } from '@/lib/history/upload';

// PUBLIC: the rescue tools on the owner's computer send a checked contract folder here.
// They hold a revocable, expiring history token, never the service key. Nothing is saved to
// contacts until the owner approves households in the app.
export const dynamic = 'force-dynamic';
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer och_') ? auth.slice(7) : '';
  if (!token || token.length > 100) return json({ error: 'Unauthorized' }, 401);
  const db = serviceClient();
  const { data: tok } = await db.from('history_tokens').select('id, expires_at, revoked_at, scope').eq('token_hash', hashHistoryToken(token)).maybeSingle();
  if (!tok || tok.revoked_at || Date.parse(tok.expires_at) < Date.now() || tok.scope !== 'history_upload') return json({ error: 'Unauthorized' }, 401);
  if ((await db.rpc('hit_rate_limit', { p_bucket: `history:${tok.id}`, p_max: 30, p_window_seconds: 3600 })).data !== true) return json({ error: 'Too many uploads. Wait an hour.' }, 429);
  const raw = await readLimited(req, MAX_BYTES);
  if (raw === null) return json({ error: 'Too large. Split the folder into uploads under 4 MB.' }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Unreadable' }, 400); }
  const v = validateHistoryUpload(body);
  if (!v.ok) return json({ error: v.reason, errors: v.errors }, 400);
  const now = new Date().toISOString();
  await db.from('history_tokens').update({ last_used_at: now }).eq('id', tok.id);
  await db.from('history_sources').upsert({ source: v.source, status: 'connected', last_run_at: now, ...(v.run.ok ? { last_success_at: now } : {}), last_detail: v.run.detail || null, updated_at: now });
  if (!v.data) return json({ ok: true, heartbeat: true });
  // Same client batch id twice is a resend, not a second batch.
  const { data: existing } = await db.from('history_batches').select('id, status').eq('client_batch_id', v.batchId).maybeSingle();
  if (existing) return json({ ok: true, batch: existing.id, duplicate: true });
  const { data: batch, error } = await db.from('history_batches').insert({
    client_batch_id: v.batchId, source: v.source, range_start: v.rangeStart, range_end: v.rangeEnd,
    payload: v.data, household_count: v.households, token_id: tok.id,
  }).select('id').single();
  if (error || !batch) return json({ error: 'Could not save the batch' }, 500);
  return json({ ok: true, batch: batch.id, households: v.households, review: 'Waiting for your approval in the app. Nothing is in your contacts yet.' });
}
