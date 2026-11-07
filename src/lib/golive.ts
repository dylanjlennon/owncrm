import type { SupabaseClient } from '@supabase/supabase-js';
import { goLiveReady, type GoLiveFacts } from './health';
import { runJob } from './jobs';
import { getSettings } from './settings';

export const SIGNUP_OFF = /Public signup is off\./;

export async function goLiveFacts(db: SupabaseClient): Promise<GoLiveFacts> {
  const s = await getSettings(db);
  const { data: jobs } = await db.from('v_job_status').select('job, last_ok, last_success_at, last_detail');
  const find = (j: string) => (jobs ?? []).find((x: any) => x.job === j && x.last_ok && x.last_success_at) as any;
  const ok = (j: string) => !!find(j);
  return {
    firstRunAck: !!s.first_run_ack_at, ownerEmail: !!(s.owner_email && s.sender_email), domain: ok('domain_check'),
    selfTest: ok('self_test'),
    // Off only when the self-test actually read the setting and found it off. A hard blocker.
    signupOff: SIGNUP_OFF.test(String(find('self_test')?.last_detail ?? '')),
    testLead: ok('fake_lead'), testAlert: !!s.test_alert_confirmed_at,
    testBackup: ok('backup'), watchdog: ok('watchdog'),
    // The backup workflow pings its own check, so a backup that never starts still emails you.
    backupWatchdog: !!(jobs ?? []).find((x: any) => x.job === 'backup' && /outside check: pinged/i.test(String(x.last_detail ?? ''))),
    allClear: !!s.all_clear_enabled,
  };
}

/**
 * Finish go-live. Runs the logged-out read test again first, so "public signup is off" is
 * checked live at that moment, not taken from an old run. Returns true only if every item passed.
 */
export async function finishGoLive(db: SupabaseClient, selfTest: () => Promise<{ ok: boolean; detail: string }>, now = new Date()) {
  await runJob(db, 'self_test', selfTest);
  const facts = await goLiveFacts(db);
  if (!goLiveReady(facts)) return { done: false, facts };
  await db.from('app_settings').update({ golive_completed_at: now.toISOString() }).eq('id', true);
  return { done: true, facts };
}
