import 'server-only';
import { serviceClient } from './supabase/service';
import { env } from './env';
import { verifyLink } from './tokens';

export async function unsubscribe(token: unknown) {
  const email = verifyLink(env.linkSecret(), 'unsubscribe', token);
  if (!email) return false;
  const db = serviceClient();
  await db.from('suppressions').upsert({ kind: 'email', value: email, reason: 'unsubscribe link' }, { onConflict: 'kind,normalized', ignoreDuplicates: true });
  const { data: methods } = await db.from('contact_methods').select('household_id, person_id').eq('kind', 'email').eq('normalized', email.trim().toLowerCase());
  for (const m of methods ?? []) {
    await db.from('consent_records').insert({ household_id: m.household_id, person_id: m.person_id, status: 'opted_out', source: 'Unsubscribe link' });
  }
  return true;
}

