import { describe, it, expect } from 'vitest';
import { neutralizeCell, csvCell, toCsv, parseCsv } from '@/lib/csv';
import { signLink, verifyLink } from '@/lib/tokens';
import { messageFor, withMessage } from '@/lib/messages';
import { bearerMatches, constantTimeEqual, verifySvix, signSvixForTest } from '@/lib/secure';
import { localDate, localHour, weekStart } from '@/lib/time';
import { noReplyDue, dealReminderDue, pageWindow } from '@/lib/logic';
import { parseRealtorLead } from '@/lib/parsers/realtor';
import { splitRows, guessMapping, errorFile } from '@/lib/importing';
import { evaluateHealth, failingChecks, goLiveReady, GOLIVE_ITEMS } from '@/lib/health';
import { REALTOR_SAMPLE, SCRAMBLED_SAMPLE } from './fixtures';
import { APP_NAME } from '@/lib/config';

describe('bug 4: spreadsheet formulas', () => {
  it.each(['=HYPERLINK("http://example.com","x")','=1+1','+SUM(A1)','-2+3','@cmd','\tx','\r=1',' =1+1'])('neutralizes %j', (v) => {
    expect(neutralizeCell(v).startsWith("'")).toBe(true);
  });
  it.each(['+1 828 555 0100','(828) 555-0100','828-555-0100','+18285550100','Testy','a=b'])('leaves %j alone', (v) => {
    expect(neutralizeCell(v)).toBe(v);
  });
  it('catches a phone-shaped formula with a second plus', () => {
    expect(neutralizeCell('+1+1').startsWith("'")).toBe(true);
    expect(neutralizeCell('+SUM(1)').startsWith("'")).toBe(true);
  });
  it('quotes and round-trips', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    const out = toCsv(['name'], [{ name: 'line\nbreak' }, { name: '=evil()' }]);
    expect(parseCsv(out)).toEqual([['name'], ['line\nbreak'], ["'=evil()"]]);
  });
});

describe('signed links', () => {
  const secret = 'test-secret-test-secret-test-secret';
  it('verifies for its own purpose only', () => {
    const t = signLink(secret, 'lead_replied', 'abc', 60);
    expect(verifyLink(secret, 'lead_replied', t)).toBe('abc');
    expect(verifyLink(secret, 'wasnt_me', t)).toBeNull();
    expect(verifyLink(secret, 'unsubscribe', t)).toBeNull();
  });
  it('rejects tampering, expiry, wrong secret, no secret, junk', () => {
    const t = signLink(secret, 'lead_replied', 'abc', 60);
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ p: 'lead_replied', s: 'other', e: 9999999999 })).toString('base64url');
    expect(verifyLink(secret, 'lead_replied', `${forged}.${s}`)).toBeNull();
    expect(verifyLink(secret, 'lead_replied', `${p}.xx`)).toBeNull();
    expect(verifyLink('other-secret', 'lead_replied', t)).toBeNull();
    expect(verifyLink(undefined, 'lead_replied', t)).toBeNull();
    expect(verifyLink(secret, 'lead_replied', 'junk')).toBeNull();
    expect(verifyLink(secret, 'lead_replied', signLink(secret, 'lead_replied', 'abc', 60, Date.now() - 3600000))).toBeNull();
  });
});

describe('bug 9: flash messages come from a fixed list', () => {
  it('ignores arbitrary text', () => {
    expect(messageFor('<script>alert(1)</script>')).toBeNull();
    expect(messageFor('You have been hacked, call 555-0100')).toBeNull();
    expect(messageFor('constructor')).toBeNull();
    expect(messageFor('__proto__')).toBeNull();
    expect(messageFor(['saved'])).toBeNull();
  });
  it('resolves known codes', () => {
    expect(messageFor('saved')?.text).toBe('Saved.');
    expect(withMessage('/x', 'saved')).toBe('/x?msg=saved');
    expect(withMessage('/x?a=1', 'saved')).toBe('/x?a=1&msg=saved');
  });
});

describe('secrets', () => {
  it('constant time compare and bearer check', () => {
    expect(constantTimeEqual('a', 'a')).toBe(true);
    expect(constantTimeEqual('a', 'b')).toBe(false);
    expect(constantTimeEqual(null, null)).toBe(false);
    const s = 'x'.repeat(32);
    expect(bearerMatches(`Bearer ${s}`, s)).toBe(true);
    expect(bearerMatches('Bearer wrong', s)).toBe(false);
    expect(bearerMatches(null, s)).toBe(false);
    expect(bearerMatches('Bearer ', undefined)).toBe(false);
    expect(bearerMatches('Bearer short', 'short')).toBe(false);
  });
  it('webhook signature', () => {
    const secret = 'whsec_' + Buffer.from('fake-secret-for-tests').toString('base64');
    const ts = '1800000000';
    const sig = signSvixForTest(secret, 'msg_1', ts, '{"a":1}');
    const base = { secret, id: 'msg_1', timestamp: ts, signature: sig, body: '{"a":1}', nowSeconds: 1800000000 };
    expect(verifySvix(base)).toBe(true);
    expect(verifySvix({ ...base, body: '{"a":2}' })).toBe(false);
    expect(verifySvix({ ...base, nowSeconds: 1800001000 })).toBe(false);
    expect(verifySvix({ ...base, secret: 'whsec_' + Buffer.from('other').toString('base64') })).toBe(false);
    expect(verifySvix({ ...base, signature: null })).toBe(false);
  });
});

describe('time zones and reminders', () => {
  const tz = 'America/New_York';
  it('uses the local date, not UTC', () => {
    const lateEvening = new Date('2026-11-10T03:30:00Z');
    expect(localDate(lateEvening, tz)).toBe('2026-11-09');
    expect(localHour(lateEvening, tz)).toBe(22);
    expect(localDate(lateEvening, 'UTC')).toBe('2026-11-10');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
  it('fires a deadline 2 days out at 8am local and not before', () => {
    const d = { id: '1', due_on: '2026-11-12', reminded_7_at: null, reminded_2_at: null, reminded_0_at: null };
    expect(dealReminderDue(d, new Date('2026-11-10T12:30:00Z'), tz, 8)).toBeNull(); // 7:30am local
    expect(dealReminderDue(d, new Date('2026-11-10T13:05:00Z'), tz, 8)).toBe('reminded_2_at'); // 8:05am
    expect(dealReminderDue({ ...d, reminded_2_at: 'x' }, new Date('2026-11-10T13:05:00Z'), tz, 8)).toBeNull();
    expect(dealReminderDue(d, new Date('2026-11-05T13:05:00Z'), tz, 8)).toBe('reminded_7_at');
    expect(dealReminderDue(d, new Date('2026-11-12T13:05:00Z'), tz, 8)).toBe('reminded_0_at');
    expect(dealReminderDue(d, new Date('2026-11-01T13:05:00Z'), tz, 8)).toBeNull();
  });
  it('no-reply alerts follow the schedule and stop when replied', () => {
    const lead = { id: 'l', received_at: '2026-11-10T12:00:00Z', first_alert_at: null, second_alert_at: null, replied_at: null };
    expect(noReplyDue(lead, 5, 15, new Date('2026-11-10T12:04:00Z'))).toBeNull();
    expect(noReplyDue(lead, 5, 15, new Date('2026-11-10T12:06:00Z'))).toBe('first');
    expect(noReplyDue({ ...lead, first_alert_at: 'x' }, 5, 15, new Date('2026-11-10T12:06:00Z'))).toBeNull();
    expect(noReplyDue({ ...lead, first_alert_at: 'x' }, 5, 15, new Date('2026-11-10T12:16:00Z'))).toBe('second');
    expect(noReplyDue({ ...lead, replied_at: 'x' }, 5, 15, new Date('2026-11-10T13:00:00Z'))).toBeNull();
  });
});

describe('bug 2: true totals with paging', () => {
  it('reports the true total window', () => {
    const w = pageWindow(13, 25, 301);
    expect(w).toMatchObject({ current: 13, pages: 13, firstShown: 301, lastShown: 301 });
    expect(pageWindow(1, 25, 0)).toMatchObject({ firstShown: 0, lastShown: 0, pages: 1 });
    expect(pageWindow(99, 25, 50).current).toBe(2);
  });
});

describe('Realtor.com parser', () => {
  it('reads the sample', () => {
    const r = parseRealtorLead('leads@email.realtor.com', 'New lead', REALTOR_SAMPLE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lead).toMatchObject({ first_name: 'Testy', last_name: 'McExample', email: 'testy.mcexample@example.com', phone: '(828) 555-0142', source: 'Realtor.com', source_type: 'portal' });
  });
  it('reads a forwarded copy', () => {
    const quoted = REALTOR_SAMPLE.split('\n').map((l) => `> ${l}`).join('\n');
    expect(parseRealtorLead('me@example.com', 'Fwd: New lead', quoted).ok).toBe(true);
  });
  it('sends scrambled or unknown mail to review with a reason', () => {
    const r = parseRealtorLead('leads@email.realtor.com', 'New lead', SCRAMBLED_SAMPLE);
    expect(r.ok).toBe(false);
    expect(parseRealtorLead('someone@example.com', 'Hi', 'Name: A\nEmail: a@example.com').ok).toBe(false);
    expect(parseRealtorLead('leads@email.realtor.com', 'x', '').ok).toBe(false);
  });
});

describe('CSV import', () => {
  it('splits 500 rows with 20 bad into 480 and an error file', () => {
    const headers = ['First Name','Last Name','Email','Phone'];
    const rows: string[][] = [];
    for (let i = 0; i < 500; i++) {
      if (i % 25 === 0) rows.push([`Bad${i}`, 'Row', `not-an-email-${i}`, '']);
      else rows.push([`Fake${i}`, 'Person', `fake${i}@example.com`, '828-555-0100']);
    }
    const m = guessMapping(headers);
    expect(m).toMatchObject({ first_name: 0, last_name: 1, email: 2, phone: 3 });
    const { good, bad } = splitRows(rows, m);
    expect(good.length).toBe(480);
    expect(bad.length).toBe(20);
    expect(errorFile(headers, bad).split('\r\n').length).toBe(22);
  });
  it('flags duplicates inside the file and neutralizes the error file', () => {
    const { good, bad } = splitRows([['A','a@example.com'],['B','A@example.com'],['=cmd','']], { first_name: 0, email: 1 });
    expect(good.length).toBe(1);
    expect(bad.length).toBe(2);
    expect(errorFile(['name','email'], bad)).toContain("'=cmd");
  });
});

describe('health and go-live', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const job = (j: string, ago: number, ok = true) => ({ job: j, last_success_at: new Date(now.getTime() - ago * 3600000).toISOString(), last_failure_at: null, last_ok: ok, last_detail: null });
  it('a stopped job turns red within 30 minutes', () => {
    expect(failingChecks(evaluateHealth({ jobs: [job('tick', 0.2)], now, goLive: false, sendingPaused: false })).length).toBe(0);
    const fails = failingChecks(evaluateHealth({ jobs: [job('tick', 0.6)], now, goLive: false, sendingPaused: false }));
    expect(fails.map((f) => f.key)).toEqual(['tick']);
  });
  it('after go-live a job that never ran is a failure', () => {
    expect(failingChecks(evaluateHealth({ jobs: [], now, goLive: true, sendingPaused: false })).length).toBeGreaterThan(3);
  });
  it('a failed backup is red, and a stale history sync is red', () => {
    expect(failingChecks(evaluateHealth({ jobs: [job('backup', 1, false)], now, goLive: false, sendingPaused: false })).map((f) => f.key)).toEqual(['backup']);
    const c = evaluateHealth({ jobs: [], now, goLive: false, sendingPaused: false, historySyncHours: 24, historyLastSuccessAt: new Date(now.getTime() - 48 * 3600000).toISOString() });
    expect(failingChecks(c).map((f) => f.key)).toEqual(['history_sync']);
  });
  it('go-live is blocked until every item passes', () => {
    const all = Object.fromEntries(GOLIVE_ITEMS.map((i) => [i.key, true])) as any;
    expect(goLiveReady(all)).toBe(true);
    for (const i of GOLIVE_ITEMS) expect(goLiveReady({ ...all, [i.key]: false })).toBe(false);
  });
});

describe('name constant', () => {
  it('is set in one place', () => { expect(APP_NAME.length).toBeGreaterThan(0); });
});
