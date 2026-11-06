'use server';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';

export async function acknowledge(form: FormData) {
  const { db } = await requireOwner();
  if (form.get('costs') !== 'yes' || form.get('policy') !== 'yes') redirect('/welcome?msg=bad_input');
  const timezone = String(form.get('timezone') || 'America/New_York').slice(0, 64);
  const { error } = await db.from('app_settings').update({ first_run_ack_at: new Date().toISOString(), timezone }).eq('id', true);
  if (error) redirect('/welcome?msg=bad_input');
  redirect('/settings?msg=saved');
}
