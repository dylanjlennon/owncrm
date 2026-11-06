'use server';
import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';

export async function verifyCode(form: FormData) {
  const factorId = String(form.get('factorId') || '');
  const code = String(form.get('code') || '').replace(/\D/g, '').slice(0, 6);
  const db = await sessionClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) redirect('/mfa?msg=bad_code');
  redirect('/today');
}
