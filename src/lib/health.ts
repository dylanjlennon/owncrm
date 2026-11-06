// Turns raw facts into plain-word checks. Used by the Status page and the red banner,
// so the two always agree.
export type JobStatus = { job: string; last_success_at: string | null; last_failure_at: string | null; last_ok: boolean | null; last_detail: string | null };
export type Check = { key: string; label: string; state: 'ok' | 'fail' | 'not_set_up'; detail: string; lastSuccessAt: string | null };

const RULES: { job: string; label: string; maxAgeHours: number; hint: string }[] = [
  { job: 'tick', label: 'Scheduled job', maxAgeHours: 0.5, hint: 'Runs every few minutes. It sends reminders and no-reply alerts.' },
  { job: 'watchdog', label: 'Outside watchdog check-in', maxAgeHours: 1, hint: 'Tells an outside service the app is alive.' },
  { job: 'backup', label: 'Nightly backup', maxAgeHours: 26, hint: 'Encrypted copy stored off the platform.' },
  { job: 'self_test', label: 'Logged-out read test', maxAgeHours: 192, hint: 'Tries to read every table without logging in.' },
  { job: 'fake_lead', label: 'Weekly test lead', maxAgeHours: 192, hint: 'Sends a fake lead through the whole path, then removes it.' },
  { job: 'domain_check', label: 'Sending domain verified', maxAgeHours: 48, hint: 'Your email domain still has its records in place.' },
];

export function evaluateHealth(input: {
  jobs: JobStatus[]; now: Date; goLive: boolean; sendingPaused: boolean; pausedReason?: string | null;
  usage?: { sent_today: number; daily_email_cap: number; sent_this_month: number; monthly_email_cap: number } | null;
  dbBytes?: number | null; dbLimitBytes?: number;
  historySyncHours?: number | null; historyLastSuccessAt?: string | null;
}): Check[] {
  const { jobs, now, goLive } = input;
  const checks: Check[] = RULES.map((rule) => {
    const j = jobs.find((x) => x.job === rule.job);
    if (!j || (!j.last_success_at && !j.last_failure_at)) {
      return { key: rule.job, label: rule.label, state: goLive ? 'fail' : 'not_set_up', detail: goLive ? 'Has never run.' : rule.hint, lastSuccessAt: null };
    }
    if (j.last_ok === false) return { key: rule.job, label: rule.label, state: 'fail', detail: j.last_detail || 'The last run failed.', lastSuccessAt: j.last_success_at };
    const age = j.last_success_at ? (now.getTime() - Date.parse(j.last_success_at)) / 3600000 : Infinity;
    if (age > rule.maxAgeHours) return { key: rule.job, label: rule.label, state: 'fail', detail: 'Has not run on time. It may have stopped.', lastSuccessAt: j.last_success_at };
    return { key: rule.job, label: rule.label, state: 'ok', detail: j.last_detail || rule.hint, lastSuccessAt: j.last_success_at };
  });
  if (input.sendingPaused) {
    checks.push({ key: 'sending', label: 'Email sending', state: 'fail', detail: input.pausedReason || 'Sending is paused.', lastSuccessAt: null });
  }
  if (input.usage) {
    const u = input.usage;
    const high = u.sent_today >= u.daily_email_cap * 0.9 || u.sent_this_month >= u.monthly_email_cap * 0.9;
    checks.push({ key: 'quota', label: 'Email allowance', state: high ? 'fail' : 'ok',
      detail: `${u.sent_today} of ${u.daily_email_cap} today, ${u.sent_this_month} of ${u.monthly_email_cap} this month.`, lastSuccessAt: null });
  }
  if (input.dbBytes != null) {
    const limit = input.dbLimitBytes ?? 8 * 1024 ** 3;
    const mb = Math.round(input.dbBytes / 1024 / 1024);
    checks.push({ key: 'db_size', label: 'Database size', state: input.dbBytes > limit * 0.9 ? 'fail' : 'ok',
      detail: `${mb} MB of ${Math.round(limit / 1024 / 1024)} MB.`, lastSuccessAt: null });
  }
  if (input.historySyncHours) {
    const last = input.historyLastSuccessAt;
    const age = last ? (now.getTime() - Date.parse(last)) / 3600000 : Infinity;
    const stale = age > input.historySyncHours;
    checks.push({ key: 'history_sync', label: 'History sync on your computer', state: stale ? 'fail' : 'ok',
      detail: stale ? 'No recent run. It only works when that computer is on and signed in.' : 'Your computer checked in on time.', lastSuccessAt: last ?? null });
  }
  return checks;
}

export const failingChecks = (checks: Check[]) => checks.filter((c) => c.state === 'fail');

export type GoLiveFacts = {
  firstRunAck: boolean; ownerEmail: boolean; domain: boolean; selfTest: boolean; signupOff: boolean;
  testLead: boolean; testAlert: boolean; testBackup: boolean; watchdog: boolean;
};
export const GOLIVE_ITEMS: { key: keyof GoLiveFacts; label: string }[] = [
  { key: 'firstRunAck', label: 'You read the costs and who should not use this' },
  { key: 'ownerEmail', label: 'Your alert email is set in Settings' },
  { key: 'domain', label: 'Sending domain is verified' },
  { key: 'selfTest', label: 'Logged-out read test passes' },
  { key: 'signupOff', label: 'Public signup is off' },
  { key: 'testLead', label: 'Test lead went all the way through' },
  { key: 'testAlert', label: 'You confirmed a test alert reached you' },
  { key: 'testBackup', label: 'A test backup finished and was checked' },
  { key: 'watchdog', label: 'Outside watchdog received a check-in' },
];
export const goLiveReady = (f: GoLiveFacts) => GOLIVE_ITEMS.every((i) => f[i.key]);
