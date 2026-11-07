// Review round 4, M1 and M3: forwarded email. "Known lead source" is decided by the From
// address's domain only, every sender has a limit, and an HTML-only email can't hold the handler.
// The first three tests are the red team's proof of concept (rt4/tests/spoof4.test.ts), kept as
// regression tests. Fake data only.
import { describe, it, expect } from 'vitest';
import { fakeDb, jobStatusView } from './fakedb';
import { takeLead } from '@/lib/leads';
import { processInbound, INBOUND_LIMITS, PORTAL_LIMITS, PORTAL_LEADS_PER_SENDER_DAY } from '@/lib/inbound';
import { knownLeadSource, parsePortalLead } from '@/lib/parsers/realtor';
import { fromAddress } from '@/lib/html-text';
import { ALERT_POLICY } from '@/lib/alerts';
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
  const clock = start;
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
    },
    rpc: {
      intake_lead: ({ p }: any, t: any) => {
        const hid = `h-${t.households.length + 1}`;
        t.households.push({ id: hid, display_name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email });
        const lid = `lead-${t.leads.length + 1}`;
        t.leads.push({ id: lid, household_id: hid, source: p.source, received_at: new Date(clock).toISOString(), is_test: !!p.is_test, new_alert_at: null, first_alert_at: null, second_alert_at: null, replied_at: null, alert_held: null, message: null, flood_key: null });
        return { lead_id: lid, household_id: hid, created: true };
      },
      hit_rate_limit: rateLimit(),
    },
  });
  return { db, now: () => new Date(clock) };
}
const junk = (i: number, body: string, subject = 'Weekly deals', from = `promo${i}@junk${i}.example`) =>
  ({ providerId: `j${i}`, from, to: 'leads@example.com', subject, text: body, html: null });

describe('M1 round 4: an email that names a portal is not a known lead source', () => {
  it('300 junk emails from one sender, subject "Zillow", with Name and Email lines: limited, and a real lead afterwards is alerted at once', async () => {
    const w = world(); const adapter = new MockAdapter();
    let limited = 0, parsed = 0;
    for (let i = 0; i < 300; i++) {
      const r: any = await processInbound(w.db as any, adapter, APP, undefined,
        junk(i, `Name: Spam Example${i}\nEmail: spam${i}@example.com\nMessage: buy now`, 'Zillow', 'bulk@junk.example'));
      if (r.limited) limited++; if (r.parsed) parsed++;
    }
    expect(parsed).toBe(INBOUND_LIMITS.perSender);
    expect(limited).toBe(300 - INBOUND_LIMITS.perSender);
    // The leads it did make are counted as one sender: 3 one-by-one alerts, the rest in the list.
    expect(adapter.sent.filter((m) => m.subject.startsWith('New lead: Spam'))).toHaveLength(ALERT_POLICY.perAddressDay);
    const real = await takeLead(w.db as any, adapter, APP, undefined, { first_name: 'Realbuyer', email: 'real@example.com', source: 'Website form', channel: 'form' }, { now: w.now(), floodKey: 'lead:real-address' });
    expect(real).toMatchObject({ alerted: true, held: false });
    expect(adapter.sent.filter((m) => m.text.includes('Realbuyer'))).toHaveLength(1);
  });
  it('"Zillow Premier Agent" in the display name does not lift the limits', async () => {
    const w = world(); const adapter = new MockAdapter();
    let limited = 0;
    for (let i = 0; i < 150; i++) {
      const r: any = await processInbound(w.db as any, adapter, APP, undefined, junk(i, 'hello', 'hi', '"Zillow Premier Agent" <x@junk.example>'));
      if (r.limited) limited++;
    }
    expect(limited).toBe(150 - INBOUND_LIMITS.perSender);
    expect(w.db.tables.inbound_emails).toHaveLength(150);
  });
  it('a portal address typed into the display name, or a look-alike domain, is not a portal', () => {
    for (const f of ['"leads@zillow.com" <x@junk.example>', 'leads@zillow.com <x@junk.example>', 'x@zillow.com.junk.example', 'x@notzillow.com',
      'x@zillow.co', 'Zillow', 'zillow.com', '<x@junk.example> leads@zillow.com', null])
      expect(knownLeadSource(f), String(f)).toBeNull();
    expect(fromAddress('"leads@zillow.com" <x@junk.example>')).toBe('x@junk.example');
  });
  it('the real portal sending domains, and their subdomains, are known', () => {
    expect(knownLeadSource('leads@email.realtor.com')).toBe('Realtor.com');
    expect(knownLeadSource('Realtor.com <Leads@Email.Realtor.com>')).toBe('Realtor.com');
    expect(knownLeadSource('noreply@move.com')).toBe('Realtor.com');
    expect(knownLeadSource('"Zillow" <no-reply@mail.zillow.com>')).toBe('Zillow');
    expect(knownLeadSource('leads@trulia.com')).toBe('Trulia');
    expect(knownLeadSource('leads@homes.com')).toBe('Homes.com');
    expect(knownLeadSource('listings@redfin.com')).toBe('Redfin');
  });
  it('an email the owner forwarded by hand is still read, with the portal named in the text as its source', () => {
    const r = parsePortalLead('owner@example.com', 'Fwd: New Zillow lead', '> Zillow\n> Name: Pat Example\n> Email: pat.example@example.com');
    expect(r.ok && r.lead.source).toBe('Zillow');
  });
  it('known sources still have a limit, just a higher one', async () => {
    const w = world(); const adapter = new MockAdapter();
    let limited = 0, parsed = 0;
    for (let i = 0; i < 100; i++) {
      const r: any = await processInbound(w.db as any, adapter, APP, undefined, { providerId: `z${i}`, from: 'Zillow <leads@mail.zillow.com>', to: 'leads@example.com',
        subject: 'New lead', text: `Name: Demo Person${i}\nEmail: demo${i}@example.com`, html: null });
      if (r.limited) limited++; if (r.parsed) parsed++;
    }
    expect(PORTAL_LIMITS.perSender).toBeGreaterThan(INBOUND_LIMITS.perSender);
    expect(parsed).toBe(PORTAL_LIMITS.perSender);
    expect(limited).toBe(100 - PORTAL_LIMITS.perSender);
    // One portal address gets per-person alerts for its first few leads a day, then counts as one sender.
    expect(adapter.sent.filter((m) => m.subject.startsWith('New lead: Demo'))).toHaveLength(PORTAL_LEADS_PER_SENDER_DAY + ALERT_POLICY.perAddressDay);
  });
  it('junk from other senders does not use up the hour for a real portal lead', async () => {
    const w = world(); const adapter = new MockAdapter();
    for (let i = 0; i < INBOUND_LIMITS.total + 20; i++) await processInbound(w.db as any, adapter, APP, undefined, junk(i, 'nothing here'));
    const r: any = await processInbound(w.db as any, adapter, APP, undefined, { providerId: 'real', from: 'leads@email.realtor.com', to: 'leads@example.com',
      subject: 'New realtor.com lead', text: 'Name: Demo Realbuyer\nEmail: demo.real@example.com\nPhone: 828-555-0142', html: null });
    expect(r.parsed).toBe(true);
    expect(adapter.sent.some((m) => m.subject === 'New lead: Demo Realbuyer')).toBe(true);
  });
});

describe('M3 round 4: an HTML-only email of 200,000 "<" does not hold the handler', () => {
  it('processInbound finishes quickly', async () => {
    const w = world(); const adapter = new MockAdapter();
    const t0 = performance.now();
    await processInbound(w.db as any, adapter, APP, undefined, { providerId: 'h1', from: 'x@junk.example', to: 'leads@example.com', subject: 'x', text: null, html: '<'.repeat(200_000) });
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
