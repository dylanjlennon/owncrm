'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { takeLead } from '@/lib/leads';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';

const UUID = /^[0-9a-f-]{36}$/i;
const t = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);

export async function resolveReview(f: FormData) {
  const { db } = await requireOwner();
  const id = t(f, 'id', 40);
  if (!UUID.test(id)) redirect('/review?msg=bad_input');
  await db.from('inbound_emails').update({ status: t(f, 'status', 10) === 'ignored' ? 'ignored' : 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/', 'layout');
  redirect('/review?msg=review_resolved');
}

export async function leadFromReview(f: FormData) {
  const { db } = await requireOwner();
  const id = t(f, 'id', 40);
  if (!UUID.test(id)) redirect('/review?msg=bad_input');
  const first = t(f, 'first_name', 100); const email = t(f, 'email', 320); const phone = t(f, 'phone', 40);
  if (!first || (!email && !phone)) redirect('/review?msg=bad_input');
  const lead = await takeLead(db, emailAdapter(), env.appUrl(), env.linkSecret(), {
    first_name: first, last_name: t(f, 'last_name', 100) || null, email: email || null, phone: phone || null,
    source: t(f, 'source', 80) || 'Forwarded email', source_type: 'portal', channel: 'email', consent_status: 'unknown',
  });
  await db.from('inbound_emails').update({ status: 'resolved', household_id: lead.household_id, resolved_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/', 'layout');
  redirect(`/contacts/${lead.household_id}?msg=review_lead_created`);
}
