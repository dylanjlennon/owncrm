'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { anonClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { runJob } from '@/lib/jobs';
import { runSelfTest } from '@/lib/selftest';
import { runFakeLead } from '@/lib/fakelead';
import { getSettings } from '@/lib/settings';
import { sendAlert } from '@/lib/alerts';
import { emailAdapter } from '@/lib/email';
import { finishGoLive } from '@/lib/golive';
import { testAlertMissing } from '@/lib/health';

const done = (code: string): never => { revalidatePath('/', 'layout'); redirect(`/status?msg=${code}`); };

export async function selfTestNow() {
  const { db } = await requireOwner();
  const r = await runJob(db, 'self_test', () => runSelfTest(db, anonClient(), env.supabaseUrl(), env.supabaseAnonKey()));
  done(r.ok ? 'selftest_ok' : 'selftest_fail');
}
export async function testLeadNow() {
  const { db } = await requireOwner();
  const r = await runJob(db, 'fake_lead', () => runFakeLead(db, env.appUrl(), env.leadFormKey(), env.cronSecret()));
  done(r.ok ? 'test_lead_ok' : 'test_lead_fail');
}
export async function domainCheckNow() {
  const { db } = await requireOwner();
  const s = await getSettings(db);
  await runJob(db, 'domain_check', async () => {
    const domain = String(s.sender_email || '').split('@')[1];
    if (!domain) return { ok: false, detail: 'No sender address in Settings.' };
    const v = await emailAdapter().domainVerified(domain);
    return v ? { ok: true, detail: `${domain} is verified.` } : { ok: false, detail: v === false ? `${domain} is not verified.` : 'Could not reach the email provider.' };
  });
  done('saved');
}
export async function sendTestAlert() {
  const { db } = await requireOwner();
  const s = await getSettings(db);
  const missing = testAlertMissing(s);
  if (missing) done(missing);
  const r = await sendAlert(db, emailAdapter(), s, env.appUrl(), { subject: 'Test alert from your CRM', text: `If you can read this, alerts reach you. Go back to Status and press "I got the test alert".\n${env.appUrl()}/status`, alsoBackup: true });
  done(r.ok ? 'test_alert_sent' : 'test_alert_failed');
}
export async function confirmTestAlert() {
  const { db } = await requireOwner();
  await db.from('app_settings').update({ test_alert_confirmed_at: new Date().toISOString() }).eq('id', true);
  done('saved');
}
export async function recordRestoreDrill() {
  const { db } = await requireOwner();
  await db.from('app_settings').update({ last_restore_drill_at: new Date().toISOString() }).eq('id', true);
  done('saved');
}
export async function resumeSending() {
  const { db } = await requireOwner();
  await db.from('app_settings').update({ sending_paused: false, sending_paused_reason: null }).eq('id', true);
  done('saved');
}
export async function completeGoLive() {
  const { db } = await requireOwner();
  const r = await finishGoLive(db, () => runSelfTest(db, anonClient(), env.supabaseUrl(), env.supabaseAnonKey()));
  done(r.done ? 'golive_done' : 'golive_blocked');
}
