// Review fixes M2 and blue #1 to #3: alert storms, the alert reserve, the daily all-clear,
// and backup or watchdog problems that must email the owner.
import { describe, it, expect } from 'vitest';
import { fakeDb, jobStatusView } from './fakedb';
import { runTick } from '@/lib/tick';
import { sendAlert, ALERT_POLICY } from '@/lib/alerts';
import { MockAdapter } from '@/lib/email/mock';
import { GOLIVE_ITEMS } from '@/lib/health';
import { goLiveFacts } from '@/lib/golive';

// A fixed-offset zone where it is midday now, so daily and weekly jobs are due whatever the UTC hour.
const NOON_TZ = (() => { const h = new Date().getUTCHours(); const off = 12 - h; const n = off > 12 ? off - 24 : off < -12 ? off + 24 : off; return n === 0 ? 'UTC' : `Etc/GMT${n > 0 ? '-' : '+'}${Math.abs(n)}`; })();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const settings = (over: Record<string, any> = {}) => ({
  id: true, timezone: NOON_TZ, owner_email: 'owner@example.com', backup_email: 'backup@example.com', sender_email: 'crm@example.com',
  display_name: 'Demo Agent', reply_to: null, postal_address: null, no_reply_first_minutes: 5, no_reply_second_minutes: 15,
  reminder_local_hour: 8, all_clear_enabled: true, all_clear_local_hour: 0, weekly_fake_lead_enabled: false,
  daily_email_cap: 100, monthly_email_cap: 3000, reserved_alert_budget: 40, sending_paused: false, history_sync_expected_hours: null,
  golive_completed_at: hoursAgo(24 * 10), ...over,
});

function world(opts: { settings?: Record<string, any>; jobRuns?: any[]; outbound?: any[] } = {}) {
  const db = fakeDb({
    tables: { app_settings: [settings(opts.settings)], job_runs: opts.jobRuns ?? [], outbound_emails: opts.outbound ?? [], leads: [], rate_limits: [], history_sources: [] },
    views: {
      v_job_status: jobStatusView,
      v_today_deal_dates: () => [],
      v_households: () => [{ id: 'h1', display_name: 'Testy McExample', primary_phone: '828-555-0142', primary_email: 'testy@example.com' }],
      v_email_usage: (t) => [{ sent_today: t.outbound_emails.length, daily_email_cap: 100, sent_this_month: t.outbound_emails.length, monthly_email_cap: 3000 }],
    },
    defaults: {
      job_runs: () => ({ started_at: new Date().toISOString() }),
      outbound_emails: () => ({ created_at: new Date().toISOString(), status: 'queued' }),
    },
    rpc: { run_hygiene: () => ({ added: 0, fixed: 0 }), db_size_bytes: () => 1024 },
  });
  return db;
}
const okJobs = () => ['backup', 'watchdog', 'self_test', 'fake_lead', 'domain_check', 'hygiene', 'tick'].map((job, i) => ({
  id: 1000 + i, job, started_at: hoursAgo(0.1), finished_at: hoursAgo(0.1), ok: true, detail: `${job} fine`,
}));
const tickOnce = (db: any, adapter: MockAdapter, extra: Partial<Parameters<typeof runTick>[0]> = {}) => runTick({
  db, adapter, appUrl: 'https://crm.example.com', linkSecret: 'x'.repeat(32), now: new Date(),
  selfTest: async () => ({ ok: true, detail: 'All tables refused. Public signup is off.' }), fakeLead: async () => ({ ok: true, detail: 'ok' }),
  ...extra,
});

describe('blue #1: a failing weekly check does not become an alert storm', () => {
  it('twelve ticks in a row with a failing self-test send one alert pair and run the test once', async () => {
    const db = world({ jobRuns: okJobs().filter((j) => j.job !== 'self_test') });
    const adapter = new MockAdapter();
    let runs = 0;
    const selfTest = async () => { runs++; return { ok: false, detail: 'Public signup is ON.' }; };
    for (let i = 0; i < 12; i++) await tickOnce(db, adapter, { selfTest });
    const selfTestMail = adapter.sent.filter((m) => /self-test|Logged-out read test/i.test(m.subject));
    expect(selfTestMail.length).toBeLessThanOrEqual(2);
    expect(selfTestMail.length).toBeGreaterThan(0);
    expect(runs).toBe(1);
  });
});

describe('M2: alert budget with a ceiling and a reserve for new-lead alerts', () => {
  it('system alerts stop at their share of the ceiling, and a new-lead alert still goes', async () => {
    const db = world();
    const adapter = new MockAdapter();
    const s = (await db.from('app_settings').select('*').single()).data;
    for (let i = 0; i < 40; i++) await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: `Problem ${i}`, text: 'x' });
    const system = adapter.sent.length;
    expect(system).toBeLessThanOrEqual(ALERT_POLICY.systemShare(s));
    expect(system).toBeLessThan(25);
    const lead = await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: 'New lead: Testy', text: 'x', leadId: 'l1', householdId: 'h1' });
    expect(lead.ok).toBe(true);
  });
  it('the same problem is sent once per window, not once per tick', async () => {
    const db = world();
    const adapter = new MockAdapter();
    const s = (await db.from('app_settings').select('*').single()).data;
    for (let i = 0; i < 5; i++) await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup' });
    expect(adapter.sent.length).toBe(1);
  });
  it('one address flooding the form is collapsed, and a system alert still gets through after it', async () => {
    const db = world();
    const adapter = new MockAdapter();
    const s = (await db.from('app_settings').select('*').single()).data;
    const held: (string | undefined)[] = [];
    for (let i = 0; i < 60; i++) held.push((await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: `New lead: Spam ${i}`, text: 'x', leadId: `l${i}`, householdId: 'h1', floodKey: 'lead:spam' })).held);
    const leadMail = adapter.sent.length;
    expect(leadMail).toBe(ALERT_POLICY.perAddressDay);
    // The rest are held for the "Many new leads" list (see lead-flood.test.ts), not dropped.
    expect(held.filter((h) => h === 'digest')).toHaveLength(60 - leadMail);
    const sys = await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup' });
    expect(sys.ok).toBe(true);
  });
  it('many addresses at once stop at the one-by-one lead share, short of the lead list reserve', async () => {
    const db = world();
    const adapter = new MockAdapter();
    const s = (await db.from('app_settings').select('*').single()).data;
    for (let i = 0; i < 60; i++) await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: `New lead: Spam ${i}`, text: 'x', leadId: `l${i}`, householdId: 'h1', floodKey: `lead:addr${i}` });
    expect(adapter.sent.length).toBe(ALERT_POLICY.leadShare(s) - ALERT_POLICY.digestReserve(s));
  });
});

describe('blue #2 and #3: the all-clear and stopped backups', () => {
  it('the daily all-clear is not "all clear" when the backup is 3 days old', async () => {
    const jobs = okJobs().map((j) => (j.job === 'backup' ? { ...j, finished_at: hoursAgo(72), started_at: hoursAgo(72) } : j));
    const db = world({ jobRuns: jobs });
    const adapter = new MockAdapter();
    await tickOnce(db, adapter);
    const daily = adapter.sent.find((m) => m.subject.startsWith('Daily check'));
    expect(daily?.subject).toBe('Daily check: something needs attention');
    expect(daily?.text).toMatch(/backup/i);
  });
  it('the all-clear names the backup age and the watchdog when everything is fine', async () => {
    const db = world({ jobRuns: okJobs() });
    const adapter = new MockAdapter();
    await tickOnce(db, adapter);
    const daily = adapter.sent.find((m) => m.subject.startsWith('Daily check'));
    expect(daily?.subject).toBe('Daily check: all clear');
    expect(daily?.text).toMatch(/Last backup/);
    expect(daily?.text).toMatch(/watchdog/i);
  });
  it('a stopped backup emails the owner once, and tells the second watchdog check', async () => {
    const jobs = okJobs().map((j) => (j.job === 'backup' ? { ...j, finished_at: hoursAgo(30), started_at: hoursAgo(30) } : j));
    const db = world({ jobRuns: jobs, settings: { all_clear_enabled: false } });
    const adapter = new MockAdapter();
    const pings: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => { pings.push(String(url)); return new Response('OK'); }) as any;
    try {
      await tickOnce(db, adapter, { healthcheckUrl: 'https://hc.example.com/abc', checksHealthcheckUrl: 'https://hc.example.com/checks' });
      await tickOnce(db, adapter, { healthcheckUrl: 'https://hc.example.com/abc', checksHealthcheckUrl: 'https://hc.example.com/checks' });
    } finally { globalThis.fetch = realFetch; }
    const backupMail = adapter.sent.filter((m) => /backup/i.test(m.subject));
    expect(backupMail.map((m) => m.to).sort()).toEqual(['backup@example.com', 'owner@example.com']);
    // The scheduler ran, so the main check is up; the second check reports the red backup.
    expect(pings.filter((p) => p.startsWith('https://hc.example.com/abc'))).toEqual(['https://hc.example.com/abc', 'https://hc.example.com/abc']);
    expect(pings.at(-1)).toBe('https://hc.example.com/checks/fail');
  });
  it('a failed backup run emails the owner too', async () => {
    const jobs = okJobs().map((j) => (j.job === 'backup' ? { ...j, ok: false, detail: 'pg_dump failed' } : j));
    const db = world({ jobRuns: jobs, settings: { all_clear_enabled: false } });
    const adapter = new MockAdapter();
    await tickOnce(db, adapter);
    expect(adapter.sent.some((m) => /backup/i.test(m.subject) && m.text.includes('pg_dump failed'))).toBe(true);
  });
});

describe('go-live list', () => {
  it('includes the daily all-clear', () => {
    expect(GOLIVE_ITEMS.map((i) => i.key)).toContain('allClear');
  });
  it('M1: public signup counts as off only when the self-test confirmed it', async () => {
    const db = world({ jobRuns: [{ id: 1, job: 'self_test', started_at: hoursAgo(1), finished_at: hoursAgo(1), ok: true, detail: 'Could not list tables.' }] });
    expect((await goLiveFacts(db as any)).signupOff).toBe(false);
    const db2 = world({ jobRuns: [{ id: 1, job: 'self_test', started_at: hoursAgo(1), finished_at: hoursAgo(1), ok: true, detail: 'All 30 tables and views refused a logged-out read. Public signup is off.' }] });
    expect((await goLiveFacts(db2 as any)).signupOff).toBe(true);
  });
});

describe('go-live can finish', () => {
  const passing = () => world({
    settings: { golive_completed_at: null, first_run_ack_at: hoursAgo(2), test_alert_confirmed_at: hoursAgo(1), all_clear_enabled: true },
    jobRuns: [
      ...okJobs().filter((j) => j.job !== 'backup' && j.job !== 'self_test'),
      { id: 50, job: 'backup', started_at: hoursAgo(1), finished_at: hoursAgo(1), ok: true, detail: 'Backup checked: 24 tables. Outside check: pinged.' },
    ],
  });
  it('finishes when every item passes, and re-checks signup at that moment', async () => {
    const { finishGoLive } = await import('@/lib/golive');
    const db = passing();
    const r = await finishGoLive(db as any, async () => ({ ok: true, detail: 'All 30 tables and views refused a logged-out read. Public signup is off.' }));
    expect(Object.entries(r.facts).filter(([, v]) => !v)).toEqual([]);
    expect(r.done).toBe(true);
    expect(db.tables.app_settings[0].golive_completed_at).toBeTruthy();
  });
  it('does not finish if signup was turned back on since the last test', async () => {
    const { finishGoLive } = await import('@/lib/golive');
    const db = passing();
    const r = await finishGoLive(db as any, async () => ({ ok: false, detail: 'Public signup is ON.' }));
    expect(r.done).toBe(false);
    expect(db.tables.app_settings[0].golive_completed_at).toBeNull();
  });
});

describe('M2: one lead with escalations is not a flood', () => {
  it('counts leads per hour, not emails', async () => {
    const db = world();
    const adapter = new MockAdapter();
    const s = (await db.from('app_settings').select('*').single()).data;
    // Five leads with every reminder (20 emails) fit in the one-by-one lead share; past it, new
    // leads go in the digest instead.
    for (let i = 0; i < 5; i++) {
      for (const [subject, key] of [['New lead', undefined], ['No reply yet', `lead:first:l${i}`], ['Still no reply', `lead:second:l${i}`]] as const) {
        await sendAlert(db as any, adapter, s, 'https://crm.example.com', { subject: `${subject}: Lead ${i}`, text: 'x', leadId: `l${i}`, householdId: 'h1', alsoBackup: subject === 'Still no reply', reminder: !!key, key });
      }
    }
    expect(adapter.sent.some((m) => /Many new leads/.test(m.subject))).toBe(false);
    expect(adapter.sent.filter((m) => m.subject === 'Still no reply: Lead 4').length).toBe(2);
  });
});

describe('N8: the outside watchdog means "the scheduler ran"', () => {
  const capture = async (fn: () => Promise<unknown>) => {
    const pings: string[] = []; const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => { pings.push(String(url)); return new Response('OK'); }) as any;
    try { await fn(); } finally { globalThis.fetch = realFetch; }
    return pings;
  };
  it('a red history sync (laptop off) does not hold the main check down', async () => {
    const db = world({ jobRuns: okJobs(), settings: { all_clear_enabled: false, history_sync_expected_hours: 24 } });
    db.tables.history_sources.push({ source: 'gmail', status: 'connected', last_success_at: hoursAgo(24 * 7), last_run_at: hoursAgo(24 * 7) });
    const adapter = new MockAdapter();
    const pings = await capture(() => tickOnce(db, adapter, { healthcheckUrl: 'https://hc.example.com/abc', checksHealthcheckUrl: 'https://hc.example.com/checks' }));
    expect(pings).toEqual(['https://hc.example.com/abc', 'https://hc.example.com/checks']);
  });
  it('a stopped backup does not hold the main check down either: only the second check fails', async () => {
    const jobs = okJobs().map((j) => (j.job === 'backup' ? { ...j, finished_at: hoursAgo(30), started_at: hoursAgo(30) } : j));
    const db = world({ jobRuns: jobs, settings: { all_clear_enabled: false } });
    const pings = await capture(() => tickOnce(db, new MockAdapter(), { healthcheckUrl: 'https://hc.example.com/abc' }));
    expect(pings).toEqual(['https://hc.example.com/abc']);
  });
});
