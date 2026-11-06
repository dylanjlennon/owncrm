'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { newHistoryToken } from '@/lib/history/token';
import { filterContract } from '../../../../contract/lib/validate.mjs';
import { HISTORY_SOURCES } from '../../../../contract/lib/policy.mjs';

const UUID = /^[0-9a-f-]{36}$/i;

// Returns the new token to the form once. It never goes in a URL, a cookie or a log.
export async function createToken(_prev: { token: string | null }, f: FormData): Promise<{ token: string | null }> {
  const { db } = await requireOwner();
  const days = [7, 30, 90].includes(Number(f.get('days'))) ? Number(f.get('days')) : 30;
  const { token, hash } = newHistoryToken();
  const { error } = await db.from('history_tokens').insert({ token_hash: hash, label: String(f.get('label') || 'My computer').slice(0, 80), expires_at: new Date(Date.now() + days * 86400000).toISOString() });
  revalidatePath('/history');
  return { token: error ? null : token };
}

export async function revokeToken(f: FormData) {
  const { db } = await requireOwner();
  const id = String(f.get('id') || '');
  if (UUID.test(id)) await db.from('history_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  redirect('/history?msg=token_revoked');
}

export async function disconnectSource(f: FormData) {
  const { db } = await requireOwner();
  const source = String(f.get('source') || '');
  if (HISTORY_SOURCES.includes(source)) await db.from('history_sources').upsert({ source, status: 'disconnected', updated_at: new Date().toISOString() });
  redirect('/history?msg=source_disconnected');
}

export async function setSyncExpectation(f: FormData) {
  const { db } = await requireOwner();
  const h = Number(f.get('hours'));
  await db.from('app_settings').update({ history_sync_expected_hours: [24, 48, 168].includes(h) ? h : null }).eq('id', true);
  redirect('/history?msg=saved');
}

export async function saveDecisions(f: FormData) {
  const { db } = await requireOwner();
  const id = String(f.get('id') || '');
  if (!UUID.test(id)) redirect('/history?msg=bad_input');
  const { data: batch } = await db.from('history_batches').select('*').eq('id', id).eq('status', 'pending_review').single();
  if (!batch) redirect('/history?msg=bad_input');
  const all = (batch.payload.households ?? []).map((h: any) => h.household_id as string);
  const chosen = f.get('approve_all') === 'yes' ? all : f.getAll('approve').map(String).filter((x) => all.includes(x));
  const action = String(f.get('do') || 'save');
  if (action === 'reject') {
    await db.from('history_batches').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id);
    redirect(`/history/${id}?msg=batch_rejected`);
  }
  if (!chosen.length) redirect(`/history/${id}?msg=bad_input`);
  const payload = filterContract(batch.payload, new Set(chosen));
  const { data: imp } = await db.from('imports').insert({ kind: 'history', filename: `History: ${batch.source}`, total_rows: chosen.length }).select('id').single();
  const { error } = await db.rpc('import_contract', { p: payload, p_import: imp!.id });
  if (error) redirect(`/history/${id}?msg=bad_input`);
  await db.from('history_batches').update({ status: 'saved', approved: chosen, saved_count: chosen.length, import_id: imp!.id, reviewed_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/', 'layout');
  redirect(`/history/${id}?msg=batch_saved`);
}
