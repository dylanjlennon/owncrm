// Review round 2, N1 and N2: a lead flood can't silence real lead alerts or system alerts.
import { describe, it, expect } from 'vitest';
import { fakeDb, jobStatusView } from './fakedb';
import { sendAlert, ALERT_POLICY } from '@/lib/alerts';
import { takeLead } from '@/lib/leads';
import { processInbound, INBOUND_LIMITS } from '@/lib/inbound';
import { runTick } from '@/lib/tick';
import { MockAdapter } from '@/lib/email/mock';

const NOON_TZ = (() => { const h = new Date().getUTCHours(); const off = 12 - h; const n = off > 12 ? off - 24 : off < -12 ? off + 24 : off; return n === 0 ? 'UTC' : `Etc/GMT${n > 0 ? '-' : '+'}${Math.abs(n)}`; })();
const APP = 'https://crm.example.com';
const settings = () => ({
  id: true, timezone: NOON_TZ, owner_email: 'owner@example.com', backup_email: 'backup@example.com', sender_email: 'crm@example.com',
  display_name: 'Demo Agent', reply_to: null, postal_address: null, reserved_alert_budget: 40, daily_email_cap: 100, monthly_email_cap: 3000,
  sending_paused: false, no_reply_first_minutes: 5, no_reply_second_minutes: 15, reminder_local_hour: 8, all_clear_enabled: false,
  weekly_fake_lead_enabled: false, golive_completed_at: new Date().toISOString(),
});
const rateLimit = () => {
  const b = new Map<string, number>();
  return (a: any) => { const n = (b.get(a.p_bucket) ?? 0) + 1; b.set(a.p_bucket, n); return n <= a.p_max; };
};

function world(start = Date.now()) {
  let clock = start;
  const db = fakeDb({
    clock: () => clock,
    tables: { app_settings: [settings()], outbound_emails: [], leads: [], households: [], inbound_emails: [], job_runs: [], rate_limits: [], history_sources: [] },
    views: {
      v_households: (t) => t.households.map((h) => ({ id: h.id, display_name: h.display_name, primary_phone: '828-555-0100', primary_email: h.email })),
      v_job_status: jobStatusView, v_today_deal_dates: () => [],
      v_email_usage: () => [{ sent_today: 0, daily_email_cap: 100, sent_this_month: 0, monthly_email_cap: 3000 }],
    },
    defaults: {
      outbound_emails: () => ({ created_at: new Date(clock).toISOString(), status: 'queued' }),
      inbound_emails: () => ({ status: 'needs_review' }),
      job_runs: () => ({ started_at: new Date(clock).toISOString() }),
    },
    rpc: {
      intake_lead: ({ p }: any, t: any) => {
        const hid = `h-${t.households.length + 1}`;
        t.households.push({ id: hid, display_name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email });
        const lid = `lead-${t.leads.length + 1}`;
        t.leads.push({ id: lid, household_id: hid, source: p.source, received_at: new Date(clock).toISOString(), is_test: !!p.is_test, new_alert_at: null, first_alert_at: null, second_alert_at: null, replied_at: null, alert_held: null, message: null, flood_key: null });
        return { lead_id: lid, household_id: hid, created: true };
      },
      hit_rate_limit: rateLimit(), run_hygiene: () => ({ added: 0, fixed: 0 }), db_size_bytes: () => 1024,
    },
  });
  return { db, now: () => new Date(clock), advance: (h: number) => { clock += h * 3600000; }, advanceMin: (m: number) => { clock += m * 60000; } };
}
const lead = (name: string) => ({ first_name: name, email: `${name.toLowerCase()}@example.com`, source: 'Website form', channel: 'form' as const });

const tick = (w: ReturnType<typeof world>, adapter: MockAdapter) => runTick({ db: w.db as any, adapter, appUrl: APP, now: w.now(), selfTest: async () => ({ ok: true, detail: 'ok' }), fakeLead: async () => ({ ok: true, detail: 'ok' }) });
const SPAM = 'lead:spam-address';

describe('N2: a lead flood does not silence real leads', () => {
  it('after three hours of spam from one address, a real lead gets its own alert at once, and "backup stopped" still goes', async () => {
    const w = world(); const adapter = new MockAdapter(); const s = settings();
    w.advance(-3);
    for (let hour = 0; hour < 3; hour++) {
      for (let i = 0; i < 60; i++) { await takeLead(w.db as any, adapter, APP, undefined, lead(`Spam${hour}x${i}`), { now: w.now(), floodKey: SPAM }); w.advance(1 / 60); }
    }
    expect(adapter.sent.filter((m) => m.subject.startsWith('New lead: Spam'))).toHaveLength(ALERT_POLICY.perAddressDay);
    const r = await takeLead(w.db as any, adapter, APP, undefined, lead('Realbuyer'), { now: w.now(), floodKey: 'lead:real-address' });
    expect(r.alerted).toBe(true);
    expect(adapter.sent.some((m) => m.subject === 'New lead: Realbuyer')).toBe(true);
    expect(adapter.sent.length).toBeLessThanOrEqual(ALERT_POLICY.leadShare(s as any));
    const sys = await sendAlert(w.db as any, adapter, s as any, APP, { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup', alsoBackup: true });
    expect(sys.ok).toBe(true);
  });
  it('N1: past the site-wide form limit the owner is told once; a noisy address goes in the list', async () => {
    const w = world(); const adapter = new MockAdapter();
    for (let i = 0; i < 5; i++) await takeLead(w.db as any, adapter, APP, undefined, lead(`Flood${i}`), { formFlood: true, now: w.now(), floodKey: SPAM });
    expect(adapter.sent.filter((m) => m.subject === 'Your web form is being flooded')).toHaveLength(1);
    expect(w.db.tables.leads.filter((l: any) => l.alert_held === 'digest').map((l: any) => l.id)).toEqual(['lead-4', 'lead-5']);
    // The first list went out at once and names them.
    expect(adapter.sent.some((m) => m.subject.startsWith('Many new leads') && m.text.includes('Flood3'))).toBe(true);
  });
  it('missed new-lead alerts are retried newest first, so a real lead is not stuck behind spam', async () => {
    const w = world(); const adapter = new MockAdapter();
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    for (let i = 0; i < 80; i++) {
      w.db.tables.households.push({ id: `hs${i}`, display_name: `Spam ${i}`, email: `s${i}@example.com` });
      w.db.tables.leads.push({ id: `ls${i}`, household_id: `hs${i}`, source: 'x', received_at: old, is_test: false, new_alert_at: null, first_alert_at: old, second_alert_at: old, replied_at: null, alert_held: null });
    }
    w.db.tables.households.push({ id: 'hreal', display_name: 'Realbuyer Example', email: 'real@example.com' });
    w.db.tables.leads.push({ id: 'lreal', household_id: 'hreal', source: 'x', received_at: new Date().toISOString(), is_test: false, new_alert_at: null, first_alert_at: null, second_alert_at: null, replied_at: null, alert_held: null });
    await runTick({ db: w.db as any, adapter, appUrl: APP, now: new Date(), selfTest: async () => ({ ok: true, detail: 'ok' }), fakeLead: async () => ({ ok: true, detail: 'ok' }) });
    expect(adapter.sent.some((m) => m.text.includes('Realbuyer Example'))).toBe(true);
  });
});

describe('N2: junk sent to the inbound address', () => {
  const junk = (i: number, from = `junk${i}@example.com`) => ({ providerId: `p${i}`, from, to: 'leads@example.com', subject: `Junk ${i}`, text: 'nothing here', html: null });
  it('sends one "needs review" email however many arrive, and "backup stopped" still goes', async () => {
    const w = world(); const adapter = new MockAdapter();
    for (let i = 0; i < 40; i++) await processInbound(w.db as any, adapter, APP, undefined, junk(i));
    expect(adapter.sent.filter((m) => m.subject === 'An email needs review')).toHaveLength(1);
    expect(w.db.tables.inbound_emails).toHaveLength(40);
    const sys = await sendAlert(w.db as any, adapter, settings() as any, APP, { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup', alsoBackup: true });
    expect(sys.ok).toBe(true);
  });
  it('one sender can only turn so many emails into leads in an hour; the rest are kept for review', async () => {
    const w = world(); const adapter = new MockAdapter();
    const rdc = (i: number) => ({ providerId: `r${i}`, from: 'leads@notify.example.com', to: 'leads@example.com', subject: 'New realtor.com lead',
      text: `realtor.com\nName: Demo Person${i}\nEmail: demo${i}@example.com\nPhone: 828-555-01${String(i % 100).padStart(2, '0')}\n`, html: null });
    const results = [];
    for (let i = 0; i < INBOUND_LIMITS.perSender + 5; i++) results.push(await processInbound(w.db as any, adapter, APP, undefined, rdc(i)));
    expect(results.filter((r: any) => r.limited)).toHaveLength(5);
    expect(results.filter((r: any) => r.parsed)).toHaveLength(INBOUND_LIMITS.perSender);
    expect(w.db.tables.inbound_emails).toHaveLength(INBOUND_LIMITS.perSender + 5);
  });
});

describe('N2: system alerts keep a reserve for escalations', () => {
  it('40 ordinary system alerts leave room for "backup stopped"', async () => {
    const w = world(); const adapter = new MockAdapter(); const s = settings();
    for (let i = 0; i < 40; i++) await sendAlert(w.db as any, adapter, s as any, APP, { subject: `Someone marked your email as spam ${i}`, text: 'x' });
    const r = await sendAlert(w.db as any, adapter, s as any, APP, { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup', alsoBackup: true });
    expect(r.ok).toBe(true);
    expect(r.sent).toBe(2);
  });
});

describe('M1 round 3: ten spam posts an hour from one address do not cost a real lead its alert or reminders', () => {
  it('a real lead mid-afternoon is alerted at once, gets both reminders, and the backup contact hears about it', async () => {
    const midnight = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })();
    const w = world(midnight); const adapter = new MockAdapter();
    w.db.tables.app_settings[0].timezone = 'UTC';
    let realAt = 0;
    for (let min = 0; min < 24 * 60 - 5; min += 5) {
      if (min % 60 === 0) for (let i = 0; i < 10; i++) await takeLead(w.db as any, adapter, APP, undefined, lead(`Spam${min}x${i}`), { now: w.now(), floodKey: SPAM });
      if (min === 14 * 60 + 10) { realAt = w.now().getTime(); await takeLead(w.db as any, adapter, APP, undefined, lead('Realbuyer'), { now: w.now(), floodKey: 'lead:real-address' }); }
      await tick(w, adapter);
      w.advanceMin(5);
    }
    const about = (re: RegExp) => adapter.sent.filter((m) => re.test(m.subject) && m.text.includes('Realbuyer'));
    const first = w.db.tables.outbound_emails.find((o: any) => o.subject === 'New lead: Realbuyer');
    expect(first).toBeDefined();
    expect(Date.parse(first!.created_at) - realAt).toBe(0);
    expect(about(/^No reply yet/)).toHaveLength(1);
    expect(adapter.sent.filter((m) => m.to === 'backup@example.com' && m.subject.startsWith('Still no reply') && m.text.includes('Realbuyer'))).toHaveLength(1);
    // The spam address: three one-by-one alerts, no reminders, the rest listed (about hourly).
    expect(adapter.sent.filter((m) => m.subject.startsWith('New lead: Spam'))).toHaveLength(ALERT_POLICY.perAddressDay);
    expect(adapter.sent.filter((m) => /no reply/i.test(m.subject) && /Spam/.test(m.subject))).toHaveLength(0);
    const digests = w.db.tables.outbound_emails.filter((o: any) => o.subject.startsWith('Many new leads')).map((o: any) => Date.parse(o.created_at));
    expect(digests.length).toBeGreaterThan(15);
    for (let i = 1; i < digests.length; i++) expect(digests[i] - digests[i - 1]).toBeLessThanOrEqual(2 * 3600000);
    expect(adapter.sent.length).toBeLessThanOrEqual(40);
  });
});

describe('H1 and M3 round 3: posts that arrive at the same moment (the app side)', () => {
  // The fake database runs alert_admit one call at a time, like the real lock. The real function
  // under 40 parallel connections is tested in scripts/test-db-local.sh.
  it('40 posts at once from 4 addresses send 12 new-lead alerts, and "backup stopped" still goes', async () => {
    const w = world(); const adapter = new MockAdapter(); const s = settings();
    await Promise.all(Array.from({ length: 40 }, (_, i) => takeLead(w.db as any, adapter, APP, undefined, lead(`Par${i}`), { now: w.now(), floodKey: `lead:addr${i % 4}` })));
    expect(adapter.sent.filter((m) => m.subject.startsWith('New lead'))).toHaveLength(4 * ALERT_POLICY.perAddressDay);
    expect(adapter.sent.filter((m) => m.subject.startsWith('Many new leads'))).toHaveLength(1);
    const sys = await sendAlert(w.db as any, adapter, s as any, APP, { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup', alsoBackup: true });
    expect(sys.ok).toBe(true);
  });
  it('40 posts at once past the form limit send one flood notice and one lead list', async () => {
    const w = world(); const adapter = new MockAdapter();
    await Promise.all(Array.from({ length: 40 }, (_, i) => takeLead(w.db as any, adapter, APP, undefined, lead(`Burst${i}`), { formFlood: true, now: w.now(), floodKey: SPAM })));
    expect(adapter.sent.filter((m) => m.subject.startsWith('Your web form'))).toHaveLength(1);
    expect(adapter.sent.filter((m) => m.subject.startsWith('Many new leads'))).toHaveLength(1);
    w.advance(1);
    const r = await takeLead(w.db as any, adapter, APP, undefined, lead('Realbuyer'), { now: w.now(), floodKey: 'lead:real-address' });
    expect(r.alerted).toBe(true);
  });
});
