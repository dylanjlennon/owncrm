import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoLiveFacts } from './health';
import { getSettings } from './settings';

export async function goLiveFacts(db: SupabaseClient): Promise<GoLiveFacts> {
  const s = await getSettings(db);
  const { data: jobs } = await db.from('v_job_status').select('job, last_ok, last_success_at');
  const ok = (j: string) => !!(jobs ?? []).find((x: any) => x.job === j && x.last_ok && x.last_success_at);
  return {
    firstRunAck: !!s.first_run_ack_at, ownerEmail: !!(s.owner_email && s.sender_email), domain: ok('domain_check'),
    selfTest: ok('self_test'), signupOff: ok('self_test'), testLead: ok('fake_lead'), testAlert: !!s.test_alert_confirmed_at,
    testBackup: ok('backup'), watchdog: ok('watchdog'),
  };
}
