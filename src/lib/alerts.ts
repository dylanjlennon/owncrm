import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { queueAndSend } from './email/send';
import { signLink } from './tokens';
import type { Settings } from './settings';

// How many alert emails may go out, so a broken check or a flood of form posts can't use up
// the email allowance and silence the alerts that matter.
// - Alerts may use at most reserved_alert_budget emails a day (client mail is held below
//   daily_email_cap minus that, so the two never add up to more than the cap).
// - Lead alerts (new lead, no reply) and system alerts (a broken check) each have a reserve the
//   other kind can't use. A form flood can't bury a "backup stopped" email, and a storm of
//   failing checks can't stop new-lead alerts.
// - At most leadPerHour lead alerts an hour. After that, one "Many new leads" note an hour, and
//   the rest wait: the scheduler retries them, so nothing is dropped.
// - A system alert with a key (one per failing check) goes out once per dedupeHours.
export const ALERT_POLICY = {
  leadPerHour: 10,
  dedupeHours: 12,
  ceiling: (s: Settings) => Math.max(4, Number(s.reserved_alert_budget ?? 25)),
  leadReserve: (s: Settings) => Math.ceil(ALERT_POLICY.ceiling(s) * 0.4),
  systemReserve: (s: Settings) => Math.ceil(ALERT_POLICY.ceiling(s) * 0.3),
  systemShare: (s: Settings) => ALERT_POLICY.ceiling(s) - ALERT_POLICY.leadReserve(s),
  leadShare: (s: Settings) => ALERT_POLICY.ceiling(s) - ALERT_POLICY.systemReserve(s),
};

export type AlertInput = { subject: string; text: string; alsoBackup?: boolean; leadId?: string | null; householdId?: string | null; key?: string };
export type AlertResult = { ok: boolean; sent: number; held?: 'duplicate' | 'ceiling' | 'lead_flood' | 'no_owner' };

function dayStart(now: Date, timeZone: string) {
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  return new Date(now.getTime() - (local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds()) * 1000 - local.getMilliseconds()).toISOString();
}

// Alerts to the owner (and the backup contact for escalations).
export async function sendAlert(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string, a: AlertInput, now = new Date()): Promise<AlertResult> {
  const to = [settings.owner_email, a.alsoBackup ? settings.backup_email : null].filter(Boolean) as string[];
  if (!to.length) return { ok: false, sent: 0, held: 'no_owner' };
  const isLead = !!a.leadId;
  const subject = a.key ? `${a.subject}` : a.subject;
  const { data: today } = await db.from('outbound_emails').select('subject, lead_id, created_at')
    .eq('kind', 'alert').neq('status', 'failed').gte('created_at', dayStart(now, settings.timezone || 'UTC')).limit(1000);
  const rows = (today ?? []) as { subject: string; lead_id: string | null; created_at: string }[];
  if (a.key) {
    const since = new Date(now.getTime() - ALERT_POLICY.dedupeHours * 3600000).toISOString();
    const { data: same } = await db.from('outbound_emails').select('id').eq('kind', 'alert').neq('status', 'failed')
      .eq('subject', subject).gte('created_at', since).limit(1);
    if ((same ?? []).length) return { ok: true, sent: 0, held: 'duplicate' };
  }
  const leadCount = rows.filter((r) => r.lead_id).length;
  const systemCount = rows.length - leadCount;
  if (isLead) {
    if (leadCount + to.length > ALERT_POLICY.leadShare(settings) || rows.length + to.length > ALERT_POLICY.ceiling(settings)) return { ok: false, sent: 0, held: 'ceiling' };
    const hourAgo = new Date(now.getTime() - 3600000).toISOString();
    const lastHour = rows.filter((r) => r.lead_id && r.created_at >= hourAgo);
    if (lastHour.length >= ALERT_POLICY.leadPerHour) {
      // One short note an hour instead of one email per lead.
      if (!lastHour.some((r) => r.subject.startsWith('Many new leads'))) {
        await queueAndSend(db, adapter, { to: settings.owner_email, subject: 'Many new leads in the last hour',
          body: `More than ${ALERT_POLICY.leadPerHour} leads arrived in the last hour, so lead alerts are paused for now. If you did not expect this, it may be spam on your web form.\n\nOpen your leads: ${appUrl}/contacts?stage=new+lead\n\nThe held alerts go out once the hour is over.`,
          kind: 'alert', leadId: a.leadId, householdId: a.householdId }, { settings, appUrl });
      }
      return { ok: false, sent: 0, held: 'lead_flood' };
    }
  } else if (systemCount + to.length > ALERT_POLICY.systemShare(settings) || rows.length + to.length > ALERT_POLICY.ceiling(settings)) {
    return { ok: false, sent: 0, held: 'ceiling' };
  }
  let sent = 0;
  for (const addr of to) {
    const r = await queueAndSend(db, adapter, { to: addr, subject, body: a.text, kind: 'alert', leadId: a.leadId, householdId: a.householdId }, { settings, appUrl });
    if (r.ok) sent++;
  }
  return { ok: sent > 0, sent };
}

export function repliedLink(appUrl: string, secret: string | undefined, leadId: string): string | null {
  if (!secret) return null;
  return `${appUrl}/r/replied?t=${encodeURIComponent(signLink(secret, 'lead_replied', leadId, 14 * 86400))}`;
}

export function leadAlertText(appUrl: string, secret: string | undefined, lead: { id: string; household_id: string; source: string },
  person: { name: string; phone?: string | null; email?: string | null; message?: string | null }, when: 'new' | 'first' | 'second') {
  const lines = [
    when === 'new' ? `New lead from ${lead.source}.` : when === 'first' ? 'This lead has not been answered yet.' : 'Still no reply logged for this lead.',
    '',
    `Name: ${person.name}`,
    person.phone ? `Phone: ${person.phone}  (tap to call: tel:${person.phone.replace(/[^\d+]/g, '')})` : 'Phone: none given',
    person.email ? `Email: ${person.email}` : 'Email: none given',
    person.message ? `Message: ${person.message.slice(0, 500)}` : '',
    '',
    `Open the contact: ${appUrl}/contacts/${lead.household_id}`,
  ];
  const link = repliedLink(appUrl, secret, lead.id);
  if (link) lines.push(`Already replied from your phone? Tap this to stop the reminders: ${link}`, '(That link only marks this lead as replied. It does not log you in.)');
  return lines.filter((l) => l !== null).join('\n');
}
