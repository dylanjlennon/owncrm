import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { queueAndSend } from './email/send';
import { signLink, LINK_TTL_SECONDS } from './tokens';
import type { Settings } from './settings';

// How many alert emails may go out, so a broken check, a flood of form posts or junk sent to
// the inbound address can't use up the email allowance and silence the alerts that matter.
// - Alerts may use at most reserved_alert_budget emails a day. The database enforces this too.
// - Lead alerts (new lead, no reply, the lead digest) and system alerts (a broken check) each
//   have a reserve the other kind can't use.
// - Inside the lead share, a digest reserve: one-by-one lead alerts stop before the share is
//   used up, so there is always room for the "Many new leads" digest. During a flood (more than
//   leadPerHour leads in an hour, or the lead share running low) new leads are not alerted one
//   by one. They are held and listed in a digest email, paced so the share lasts until
//   midnight. A real lead that arrives during or after spam still reaches the owner.
// - Inside the system share, a critical reserve: only escalations (alerts that also go to the
//   backup contact, such as "backup stopped") may use the last few. Junk email or a noisy check
//   can't use them up.
// - A system alert with a key (one per failing check) goes out once per dedupeHours.
export const DIGEST_SUBJECT = 'Many new leads';
export const ALERT_POLICY = {
  leadPerHour: 10,
  dedupeHours: 12,
  ceiling: (s: Settings) => Math.max(4, Number(s.reserved_alert_budget ?? 40)),
  leadReserve: (s: Settings) => Math.ceil(ALERT_POLICY.ceiling(s) * 0.4),
  systemReserve: (s: Settings) => Math.ceil(ALERT_POLICY.ceiling(s) * 0.3),
  systemShare: (s: Settings) => ALERT_POLICY.ceiling(s) - ALERT_POLICY.leadReserve(s),
  leadShare: (s: Settings) => ALERT_POLICY.ceiling(s) - ALERT_POLICY.systemReserve(s),
  // The part of the lead share only the digest may use.
  digestReserve: (s: Settings) => Math.max(1, Math.ceil(ALERT_POLICY.leadShare(s) * 0.2)),
  // The part of the system share only escalations (alsoBackup) may use.
  criticalReserve: (s: Settings) => Math.max(1, Math.ceil(ALERT_POLICY.ceiling(s) * 0.15)),
};

export type AlertInput = {
  subject: string; text: string; alsoBackup?: boolean; leadId?: string | null; householdId?: string | null; key?: string;
  /** The lead digest. Counts as a lead alert and may use the digest reserve. */
  digest?: boolean;
  /** How long a keyed alert stays quiet. Default dedupeHours. */
  dedupeHours?: number;
};
// held 'digest': a lead alert that was not sent one by one. A new lead held this way goes in the
// next digest (see sendLeadDigest). 'ceiling': no room today.
export type AlertResult = { ok: boolean; sent: number; held?: 'duplicate' | 'ceiling' | 'digest' | 'no_owner' };

export function dayStart(now: Date, timeZone: string) {
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  return new Date(now.getTime() - (local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds()) * 1000 - local.getMilliseconds()).toISOString();
}
function hoursLeftToday(now: Date, timeZone: string) {
  const start = Date.parse(dayStart(now, timeZone));
  return Math.max(0, (start + 86400000 - now.getTime()) / 3600000);
}

type Row = { subject: string; lead_id: string | null; created_at: string };
const isLeadRow = (r: Row) => !!r.lead_id || r.subject.startsWith(DIGEST_SUBJECT);

async function todaysAlerts(db: SupabaseClient, settings: Settings, now: Date): Promise<Row[]> {
  const { data } = await db.from('outbound_emails').select('subject, lead_id, created_at')
    .eq('kind', 'alert').neq('status', 'failed').gte('created_at', dayStart(now, settings.timezone || 'UTC')).limit(1000);
  return (data ?? []) as Row[];
}

// Alerts to the owner (and the backup contact for escalations).
export async function sendAlert(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string, a: AlertInput, now = new Date()): Promise<AlertResult> {
  const to = [settings.owner_email, a.alsoBackup ? settings.backup_email : null].filter(Boolean) as string[];
  if (!to.length) return { ok: false, sent: 0, held: 'no_owner' };
  const isLead = !!a.leadId || !!a.digest;
  const subject = a.subject;
  const rows = await todaysAlerts(db, settings, now);
  if (a.key) {
    const since = new Date(now.getTime() - (a.dedupeHours ?? ALERT_POLICY.dedupeHours) * 3600000).toISOString();
    const { data: same } = await db.from('outbound_emails').select('id').eq('kind', 'alert').neq('status', 'failed')
      .eq('subject', subject).gte('created_at', since).limit(1);
    if ((same ?? []).length) return { ok: true, sent: 0, held: 'duplicate' };
  }
  const leadCount = rows.filter(isLeadRow).length;
  const systemCount = rows.length - leadCount;
  const n = to.length;
  if (rows.length + n > ALERT_POLICY.ceiling(settings)) return { ok: false, sent: 0, held: isLead && !a.digest ? 'digest' : 'ceiling' };
  if (a.digest) {
    if (leadCount + n > ALERT_POLICY.leadShare(settings)) return { ok: false, sent: 0, held: 'ceiling' };
  } else if (isLead) {
    // One-by-one lead alerts stop short of the digest reserve.
    if (leadCount + n > ALERT_POLICY.leadShare(settings) - ALERT_POLICY.digestReserve(settings)) return { ok: false, sent: 0, held: 'digest' };
    const hourAgo = new Date(now.getTime() - 3600000).toISOString();
    // Count leads, not emails: one lead can have a new-lead, a first and a second alert.
    const leadsLastHour = new Set(rows.filter((r) => r.lead_id && r.created_at >= hourAgo && r.lead_id !== a.leadId).map((r) => r.lead_id));
    if (leadsLastHour.size >= ALERT_POLICY.leadPerHour) return { ok: false, sent: 0, held: 'digest' };
  } else {
    const share = ALERT_POLICY.systemShare(settings) - (a.alsoBackup ? 0 : ALERT_POLICY.criticalReserve(settings));
    if (systemCount + n > share) return { ok: false, sent: 0, held: 'ceiling' };
  }
  let sent = 0;
  for (const addr of to) {
    const r = await queueAndSend(db, adapter, { to: addr, subject, body: a.text, kind: 'alert', leadId: a.leadId, householdId: a.householdId }, { settings, appUrl });
    if (r.ok) sent++;
  }
  return { ok: sent > 0, sent };
}

/**
 * Leads held during a flood go out together in one "Many new leads" email. Paced: at most one an
 * hour, and slower when the lead share is running low, so it lasts until midnight. Nothing is
 * dropped: a lead stays held until a digest that lists it has gone out.
 */
export async function sendLeadDigest(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string, now = new Date()) {
  const { data: held } = await db.from('leads').select('id, household_id, source, received_at')
    .eq('alert_held', 'digest').is('new_alert_at', null).eq('is_test', false).order('received_at', { ascending: false }).limit(500);
  const leads = (held ?? []) as { id: string; household_id: string; source: string; received_at: string }[];
  if (!leads.length) return { ok: true, sent: 0, waiting: 0 };
  const rows = await todaysAlerts(db, settings, now);
  const left = ALERT_POLICY.leadShare(settings) - rows.filter(isLeadRow).length;
  const intervalHours = Math.max(1, hoursLeftToday(now, settings.timezone || 'UTC') / Math.max(1, left));
  const last = rows.filter((r) => r.subject.startsWith(DIGEST_SUBJECT)).map((r) => r.created_at).sort().at(-1);
  if (last && now.getTime() - Date.parse(last) < intervalHours * 3600000 - 60000) return { ok: true, sent: 0, waiting: leads.length };
  const { data: hh } = await db.from('v_households').select('id, display_name, primary_phone, primary_email').in('id', [...new Set(leads.map((l) => l.household_id))]);
  const byId = new Map(((hh ?? []) as any[]).map((h) => [h.id, h]));
  const shown = leads.slice(0, 30).map((l) => {
    const h = byId.get(l.household_id);
    return `- ${h?.display_name ?? 'Unknown'} | ${h?.primary_phone ?? 'no phone'} | ${h?.primary_email ?? 'no email'} | ${l.source} | ${appUrl}/contacts/${l.household_id}`;
  });
  const more = leads.length > shown.length ? `\n...and ${leads.length - shown.length} more.` : '';
  const text = `${leads.length} new leads arrived faster than usual, so they are listed here instead of one email each. If you did not expect this, it may be spam on your web form, but real leads are in this list too. Look through it.\n\n${shown.join('\n')}${more}\n\nOpen your new leads: ${appUrl}/contacts?stage=new+lead\n\nReply reminders are off for the leads in this list. While the flood lasts, the next list comes in about ${Math.round(intervalHours)} hour${Math.round(intervalHours) === 1 ? '' : 's'}.`;
  const r = await sendAlert(db, adapter, settings, appUrl, { subject: `${DIGEST_SUBJECT}: ${leads.length} waiting`, text, digest: true }, now);
  if (r.ok) await db.from('leads').update({ new_alert_at: now.toISOString() }).in('id', leads.map((l) => l.id));
  return { ok: r.ok, sent: r.sent, waiting: r.ok ? 0 : leads.length };
}

export function repliedLink(appUrl: string, secret: string | undefined, leadId: string): string | null {
  if (!secret) return null;
  return `${appUrl}/r/replied?t=${encodeURIComponent(signLink(secret, 'lead_replied', leadId, LINK_TTL_SECONDS.lead_replied))}`;
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
