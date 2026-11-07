'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';
import { sha256 } from '@/lib/secure';
import { signLink, LINK_TTL_SECONDS } from '@/lib/tokens';
import { getSettings } from '@/lib/settings';
import { sendAlert } from '@/lib/alerts';

// A password alone opens nothing: the database also needs the second factor.
// A new device gets an email right after the password step, so a stolen password
// still shows up in your inbox even if the attacker can't pass the code step.
export async function login(form: FormData) {
  const email = String(form.get('email') || '').slice(0, 320);
  const password = String(form.get('password') || '').slice(0, 200);
  const db = await sessionClient();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect('/login?msg=bad_login');
  try { await noteDevice(data.user.id); } catch { /* the login still works if the alert fails */ }
  redirect('/mfa');
}

async function noteDevice(userId: string) {
  const h = await headers();
  const ua = (h.get('user-agent') || 'unknown').slice(0, 300);
  const hash = sha256(`${userId}|${ua}|${h.get('accept-language') || ''}`);
  const svc = serviceClient();
  const { data: owner } = await svc.from('app_owner').select('user_id').eq('user_id', userId).maybeSingle();
  if (!owner) return;
  const { data: known } = await svc.from('known_devices').select('device_hash').eq('device_hash', hash).maybeSingle();
  if (known) { await svc.from('known_devices').update({ last_seen_at: new Date().toISOString() }).eq('device_hash', hash); return; }
  const where = [h.get('x-vercel-ip-city'), h.get('x-vercel-ip-country-region'), h.get('x-vercel-ip-country')].filter(Boolean).map((x) => decodeURIComponent(String(x))).join(', ') || 'unknown location';
  await svc.from('known_devices').insert({ device_hash: hash, label: `${ua.slice(0, 120)} (${where})` });
  const s = await getSettings(svc);
  const secret = env.linkSecret();
  const link = secret ? `${env.appUrl()}/r/wasnt-me?t=${encodeURIComponent(signLink(secret, 'wasnt_me', userId, LINK_TTL_SECONDS.wasnt_me))}` : '(link unavailable: LINK_SIGNING_SECRET is not set)';
  await sendAlert(svc, emailAdapter(), s, env.appUrl(), {
    subject: 'New sign-in to your CRM',
    text: `Your password was just used from a device we have not seen.\nDevice: ${ua}\nWhere: ${where}\nTime: ${new Date().toUTCString()}\n\nIf this was you, ignore this email.\nIf it was not you, tap this to end every session right away, then change your password: ${link}\n(The link works once, for 24 hours.)`,
    alsoBackup: true,
  });
}

export async function logout() {
  const db = await sessionClient();
  await db.auth.signOut({ scope: 'local' });
  redirect('/login');
}
