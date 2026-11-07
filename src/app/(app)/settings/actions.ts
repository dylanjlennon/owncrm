'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { capsProblem } from '@/lib/limits';

const t = (f: FormData, k: string, max = 300) => String(f.get(k) ?? '').trim().slice(0, max);
const int = (f: FormData, k: string, lo: number, hi: number, d: number) => { const n = Number(f.get(k)); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
const email = (v: string) => (v === '' || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v || null : undefined);

export async function saveSettings(f: FormData) {
  const { db } = await requireOwner();
  const owner = email(t(f, 'owner_email', 320)); const backup = email(t(f, 'backup_email', 320));
  const sender = email(t(f, 'sender_email', 320)); const reply = email(t(f, 'reply_to', 320));
  if ([owner, backup, sender, reply].includes(undefined)) redirect('/settings?msg=bad_input');
  const first = int(f, 'no_reply_first_minutes', 1, 1440, 5);
  const second = Math.max(first + 1, int(f, 'no_reply_second_minutes', 2, 2880, 15));
  const caps = {
    daily_email_cap: int(f, 'daily_email_cap', 10, 100000, 100), monthly_email_cap: int(f, 'monthly_email_cap', 100, 10000000, 3000),
    reserved_alert_budget: int(f, 'reserved_alert_budget', 5, 1000, 40),
  };
  if (capsProblem(caps)) redirect('/settings?msg=caps_too_low');
  const { error } = await db.from('app_settings').update({
    display_name: t(f, 'display_name', 120) || null, timezone: t(f, 'timezone', 64) || 'America/New_York',
    owner_email: owner, backup_email: backup, sender_email: sender, reply_to: reply, postal_address: t(f, 'postal_address', 300) || null,
    form_consent_wording: t(f, 'form_consent_wording', 1000) || 'Yes, you may email me market updates and listings. I can unsubscribe at any time.',
    no_reply_first_minutes: first, no_reply_second_minutes: second, reminder_local_hour: int(f, 'reminder_local_hour', 0, 23, 8),
    all_clear_enabled: f.get('all_clear_enabled') === 'yes', all_clear_local_hour: int(f, 'all_clear_local_hour', 0, 23, 8),
    weekly_fake_lead_enabled: f.get('weekly_fake_lead_enabled') === 'yes',
    ...caps,
  }).eq('id', true);
  revalidatePath('/', 'layout');
  redirect(`/settings?msg=${error ? 'bad_input' : 'saved'}`);
}

export async function signOutEverywhere() {
  const { db } = await requireOwner();
  await db.auth.signOut({ scope: 'global' });
  redirect('/login?msg=signed_out_everywhere');
}
