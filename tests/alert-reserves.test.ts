// Review round 4, M2 and L5: reply reminders keep their own reserve, the owner hears once when a
// share runs out, and "backup stopped" always has room for two people. The real database function
// is tested in scripts/test-db-local.sh; this runs the same rules through the app.
import { describe, it, expect } from 'vitest';
import { fakeDb } from './fakedb';
import { sendAlert, ALERT_POLICY, PAUSED_SUBJECT } from '@/lib/alerts';
import { alertBudgetProblem, ALERT_BUDGET_MIN } from '@/lib/limits';
import { messageFor } from '@/lib/messages';
import { MockAdapter } from '@/lib/email/mock';

const APP = 'https://crm.example.com';
const settings = (over: Record<string, any> = {}) => ({
  id: true, timezone: 'UTC', owner_email: 'owner@example.com', backup_email: 'backup@example.com', sender_email: 'crm@example.com',
  display_name: 'Demo Agent', reserved_alert_budget: 40, daily_email_cap: 100, monthly_email_cap: 3000, ...over,
});
const world = (over: Record<string, any> = {}) => fakeDb({
  tables: { app_settings: [settings(over)], outbound_emails: [], leads: [] },
  defaults: { outbound_emails: () => ({ created_at: new Date().toISOString(), status: 'queued' }) },
});
const newLead = (db: any, a: MockAdapter, s: any, i: number) =>
  sendAlert(db, a, s, APP, { subject: `New lead: Demo${i}`, text: 'x', leadId: `l${i}`, householdId: `h${i}`, floodKey: `lead:addr${i}` });
const reminder = (db: any, a: MockAdapter, s: any, i: number, due: 'first' | 'second') =>
  sendAlert(db, a, s, APP, { subject: `${due === 'first' ? 'No reply yet' : 'Still no reply'}: Demo${i}`, text: 'x', leadId: `l${i}`, householdId: `h${i}`,
    reminder: true, alsoBackup: due === 'second', key: `lead:${due}:l${i}`, floodKey: `lead:addr${i}` });

describe('M2 round 4: reminders and their backup escalation have their own reserve', () => {
  it('a day of new leads from many addresses can\'t use up the reminders for an earlier lead', async () => {
    const db = world(); const a = new MockAdapter(); const s = settings();
    expect((await newLead(db as any, a, s, 0)).ok).toBe(true);
    for (let i = 1; i <= 40; i++) await newLead(db as any, a, s, i);
    const first = await reminder(db as any, a, s, 0, 'first');
    const second = await reminder(db as any, a, s, 0, 'second');
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, sent: 2 });
    expect(a.sent.filter((m) => m.to === 'backup@example.com' && m.subject === 'Still no reply: Demo0')).toHaveLength(1);
  });
  it('the owner gets one "Alerts paused for today" email when a share runs out, however many alerts are refused', async () => {
    const db = world(); const a = new MockAdapter(); const s = settings();
    for (let i = 0; i < 60; i++) await newLead(db as any, a, s, i);
    for (let i = 0; i < 40; i++) await sendAlert(db as any, a, s as any, APP, { subject: `Problem ${i}`, text: 'x' });
    const paused = a.sent.filter((m) => m.subject === PAUSED_SUBJECT);
    expect(paused).toHaveLength(1);
    expect(paused[0].to).toBe('owner@example.com');
    expect(paused[0].text).toMatch(/New-lead emails one by one/);
    expect(paused[0].text).toContain(`${APP}/contacts?stage=new+lead`);
  });
  it('the "Alerts paused" email has its own reserve: it still goes when every other share is full', async () => {
    const db = world(); const a = new MockAdapter(); const s = settings();
    // Fill the day straight from the system side, leaving the reserves alone.
    for (let i = 0; i < 60; i++) await sendAlert(db as any, a, s as any, APP, { subject: `Problem ${i}`, text: 'x' });
    for (let i = 0; i < 60; i++) await newLead(db as any, a, s, i);
    for (let i = 0; i < 10; i++) await sendAlert(db as any, a, s as any, APP, { subject: `Problem: check ${i}`, text: 'x', alsoBackup: true });
    expect(a.sent.filter((m) => m.subject === PAUSED_SUBJECT)).toHaveLength(1);
    expect(a.sent.length).toBeLessThanOrEqual(40);
  });
  it('the numbers make sense for every alert number from the minimum up', () => {
    for (let c = ALERT_BUDGET_MIN; c <= 300; c++) {
      const s = settings({ reserved_alert_budget: c }) as any;
      const held = ALERT_POLICY.criticalReserve(s) + ALERT_POLICY.reminderReserve(s) + ALERT_POLICY.noticeReserve(s);
      expect(ALERT_POLICY.criticalReserve(s), `C=${c}`).toBeGreaterThanOrEqual(2);
      expect(ALERT_POLICY.reminderReserve(s), `C=${c}`).toBeGreaterThanOrEqual(3);
      expect(c - held, `C=${c}`).toBeGreaterThanOrEqual(ALERT_POLICY.digestReserve(s) + 3);
    }
  });
});

describe('L5 round 4: "backup stopped" always reaches both people', () => {
  it.each([5, 15, 40])('at an alert number of %i, after leads, a list and a problem email, "backup stopped" goes to both', async (c) => {
    const db = world({ reserved_alert_budget: c }); const a = new MockAdapter(); const s = settings({ reserved_alert_budget: c });
    await newLead(db as any, a, s, 1); await newLead(db as any, a, s, 2);
    await sendAlert(db as any, a, s as any, APP, { subject: 'Many new leads: 3 waiting', text: 'x', digest: true });
    await sendAlert(db as any, a, s as any, APP, { subject: 'Problem: Domain', text: 'x', key: 'check:domain' });
    const r = await sendAlert(db as any, a, s as any, APP, { subject: 'Problem: Nightly backup', text: 'x', key: 'check:backup', alsoBackup: true });
    expect(r).toMatchObject({ ok: true, sent: 2 });
  });
  it('Settings refuses an alert number below 15 with a message, instead of quietly using 40', () => {
    expect(ALERT_BUDGET_MIN).toBe(15);
    for (const n of [0, 5, 14, 14.5, NaN]) expect(alertBudgetProblem(n), String(n)).toBe(true);
    for (const n of [15, 40, 1000]) expect(alertBudgetProblem(n), String(n)).toBe(false);
    expect(messageFor('alert_budget_too_low')?.text).toMatch(/at least 15/);
  });
});
