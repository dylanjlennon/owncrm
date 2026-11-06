// All due dates follow the time zone in Settings, never the server's.
function parts(now: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(now)) out[p.type] = p.value;
  return out;
}
export function localDate(now: Date, timeZone: string): string {
  const p = parts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function localHour(now: Date, timeZone: string): number {
  return Number(parts(now, timeZone).hour);
}
export function localWeekday(now: Date, timeZone: string): string {
  return parts(now, timeZone).weekday;
}
export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
// The local Monday of the week holding this date.
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((d + 6) % 7));
}
export function formatDate(date: string | null | undefined): string {
  if (!date) return 'Not set';
  return new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}
export function formatDateTime(ts: string | null | undefined, timeZone: string): string {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
