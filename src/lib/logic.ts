import { daysBetween, localDate, localHour } from './time';

// Pure rules for reminders, kept apart from the database so they can be tested alone.

export type LeadForAlert = { id: string; received_at: string; first_alert_at: string | null; second_alert_at: string | null; replied_at: string | null };

export function noReplyDue(lead: LeadForAlert, firstMin: number, secondMin: number, now: Date): 'first' | 'second' | null {
  if (lead.replied_at) return null;
  const mins = (now.getTime() - Date.parse(lead.received_at)) / 60000;
  if (mins >= secondMin && !lead.second_alert_at) return 'second';
  if (mins >= firstMin && !lead.first_alert_at && !lead.second_alert_at) return 'first';
  return null;
}

export type DealDateForReminder = { id: string; due_on: string; reminded_7_at: string | null; reminded_2_at: string | null; reminded_0_at: string | null };

// 7 days out, 2 days out and the day itself, each once, at the owner's local hour.
export function dealReminderDue(d: DealDateForReminder, now: Date, timeZone: string, reminderHour: number): 'reminded_7_at' | 'reminded_2_at' | 'reminded_0_at' | null {
  if (localHour(now, timeZone) < reminderHour) return null;
  const days = daysBetween(localDate(now, timeZone), d.due_on);
  if (days <= 0) return d.reminded_0_at ? null : 'reminded_0_at';
  if (days <= 2) return d.reminded_2_at ? null : 'reminded_2_at';
  if (days <= 7) return d.reminded_7_at ? null : 'reminded_7_at';
  return null;
}

export function pageWindow(page: number, pageSize: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (current - 1) * pageSize;
  return { current, pages, from, to: from + pageSize - 1, firstShown: total === 0 ? 0 : from + 1, lastShown: Math.min(from + pageSize, total) };
}
