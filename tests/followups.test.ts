// Blue smaller items: edit, snooze and repeat follow-ups; birthdays and home anniversaries on Today.
import { describe, it, expect } from 'vitest';
import { snoozeTo, nextRepeatDue, upcomingOccasions, birthdayFromMonthDay, parseRepeat } from '@/lib/followups';

describe('follow-ups', () => {
  it('snoozes from today, so an overdue item moves forward', () => {
    expect(snoozeTo('2026-11-10', '1d')).toBe('2026-11-11');
    expect(snoozeTo('2026-11-10', '1w')).toBe('2026-11-17');
    expect(snoozeTo('2026-11-10', 'forever')).toBeNull();
  });
  it('a repeating follow-up comes back after its interval', () => {
    expect(nextRepeatDue('2026-11-01', 30, '2026-11-10')).toBe('2026-12-10');
    expect(nextRepeatDue('2026-11-20', 7, '2026-11-10')).toBe('2026-11-27');
    expect(parseRepeat('30')).toBe(30);
    expect(parseRepeat('31')).toBeNull();
  });
});

describe('birthdays and home anniversaries', () => {
  const rows = [
    { kind: 'birthday' as const, household_id: 'a', name: 'Testy McExample', date: '2000-11-20' },
    { kind: 'home_anniversary' as const, household_id: 'b', name: 'Sample Family', date: '2021-11-12' },
    { kind: 'birthday' as const, household_id: 'c', name: 'Later Demo', date: '2000-03-01' },
    { kind: 'home_anniversary' as const, household_id: 'd', name: 'New Year Example', date: '2024-01-02' },
  ];
  it('lists the next 30 days in date order, with the years in the home', () => {
    const u = upcomingOccasions(rows, '2026-11-10');
    expect(u.map((o) => o.household_id)).toEqual(['b', 'a']);
    expect(u[0]).toMatchObject({ days_until: 2, years: 5 });
    expect(u[1]).toMatchObject({ days_until: 10 });
    expect(u[1].years).toBeUndefined();
  });
  it('wraps into next year', () => {
    expect(upcomingOccasions(rows, '2026-12-20').map((o) => o.household_id)).toEqual(['d']);
  });
  it('keeps a birthday as month and day only', () => {
    expect(birthdayFromMonthDay(3, 4)).toBe('2000-03-04');
    expect(birthdayFromMonthDay(2, 29)).toBe('2000-02-29');
    expect(birthdayFromMonthDay(2, 30)).toBeNull();
    expect(birthdayFromMonthDay('', '')).toBeNull();
  });
});
