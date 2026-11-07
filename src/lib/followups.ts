import { addDays, daysBetween } from './time';

// Repeating follow-ups, snoozing, and the birthdays and home anniversaries list.
export const REPEAT_CHOICES: { days: number; label: string }[] = [
  { days: 7, label: 'Every week' }, { days: 14, label: 'Every 2 weeks' }, { days: 30, label: 'Every month' },
  { days: 90, label: 'Every 3 months' }, { days: 180, label: 'Every 6 months' }, { days: 365, label: 'Every year' },
];
export const repeatLabel = (days: number | null | undefined) => REPEAT_CHOICES.find((c) => c.days === days)?.label ?? null;
export const parseRepeat = (v: unknown): number | null => {
  const n = Number(v);
  return REPEAT_CHOICES.some((c) => c.days === n) ? n : null;
};

export const SNOOZE_CHOICES: Record<string, { days: number; label: string }> = {
  '1d': { days: 1, label: 'Tomorrow' }, '3d': { days: 3, label: 'In 3 days' }, '1w': { days: 7, label: 'Next week' }, '1m': { days: 30, label: 'In a month' },
};
/** New due date when a follow-up is snoozed. Counts from today, so an overdue item moves forward. */
export function snoozeTo(today: string, choice: string): string | null {
  const c = SNOOZE_CHOICES[choice];
  return c ? addDays(today, c.days) : null;
}

/** When a repeating follow-up is done, the next one is due this many days after today (or after its due date, if done early). */
export function nextRepeatDue(dueOn: string, repeatDays: number, today: string): string {
  return addDays(dueOn > today ? dueOn : today, repeatDays);
}

export type Occasion = { kind: 'birthday' | 'home_anniversary'; household_id: string; name: string; on: string; days_until: number; years?: number };

/**
 * Birthdays and home anniversaries in the next `days` days, by month and day. Birthdays never
 * show an age: only the month and day are kept (see AGENTS.md rule 6).
 */
export function upcomingOccasions(
  rows: { kind: 'birthday' | 'home_anniversary'; household_id: string; name: string; date: string }[], today: string, days = 30,
): Occasion[] {
  const out: Occasion[] = [];
  const year = Number(today.slice(0, 4));
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(r.date)) continue;
    const md = r.date.slice(5, 10);
    let on = `${year}-${md}`;
    if (md === '02-29' && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) on = `${year}-02-28`;
    if (on < today) on = `${year + 1}-${md === '02-29' ? '02-28' : md}`;
    const until = daysBetween(today, on);
    if (until > days) continue;
    const o: Occasion = { kind: r.kind, household_id: r.household_id, name: r.name, on, days_until: until };
    if (r.kind === 'home_anniversary') { const y = Number(on.slice(0, 4)) - Number(r.date.slice(0, 4)); if (y > 0) o.years = y; }
    out.push(o);
  }
  return out.sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));
}

/** Birthdays are stored with the year 2000, so no age is ever kept. */
export function birthdayFromMonthDay(month: unknown, day: unknown): string | null {
  const m = Number(month); const d = Number(day);
  if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return null;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > max) return null;
  return `2000-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
