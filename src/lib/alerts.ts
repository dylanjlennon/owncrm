import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { deliver } from './email/send';
import { signLink, LINK_TTL_SECONDS } from './tokens';
import type { Settings } from './settings';

// How many alert emails may go out, so a broken check, a flood of form posts or junk sent to
// the inbound address can't use up the email allowance and silence the alerts that matter.
//
// The app never decides this itself. public.alert_admit in the database (migration
// 20261107000300_alert_gate.sql) takes one lock, checks every rule below, and saves the email
// rows in the same transaction; the app only hands those rows to the email provider. So posts
// that arrive at the same moment can't all read "room left" and all send.
//
// The rules (ALERT_POLICY has the same numbers, for Status and tests):
// - Alerts may use at most reserved_alert_budget emails a day (40 by default).
// - Lead alerts (new lead, no reply, the lead list) and system alerts (a broken check) each have
//   a reserve the other kind can't use.
// - Inside the lead share, one-by-one lead alerts stop before the end, so there is always room
//   for the "Many new leads" list.
// - Reminders ("No reply yet", "Still no reply" to owner and backup) have their own reserve (4 at
//   the default 40), held out of the day's allowance. New-lead alerts, the lead list and system
//   alerts can't use it, so a busy day of new leads can't switch off the reminders and the backup
//   contact escalation (review round 4, M2). Reminders past it count against the lead share.
// - When an alert is refused because its share or reserve ran out, the owner gets one "Alerts
//   paused for today" email, from one email kept only for it.
// - Per address: one web form address (or one person) gets one-by-one alerts and reminders for
//   up to 3 leads in 24 hours. Past that, that address's leads go in the "Many new leads" list,
//   without reminders. Leads from every other address keep their own alert, reminders and the
//   backup contact escalation. One noisy address can't switch the whole form to list mode.
// - The lead list is paced: at most one an hour, slower when the lead share runs low.
// - Inside the system share, the last few are only for escalations (alerts that also go to the
//   backup contact, such as "backup stopped"), never fewer than 2, so both people can be told
//   (L5). The database refuses any other alert there.
// - An alert with a key (one per failing check, one per lead and reminder, the flood notice)
//   goes out once per de-dupe window.
export const DIGEST_SUBJECT = 'Many new leads';
const numbers = (s: Settings) => {
  const ceiling = Math.max(1, Number(s.reserved_alert_budget ?? 40));
  const systemReserve = Math.ceil(ceiling * 0.3);
  const leadReserve = Math.ceil(ceiling * 0.4);
  const leadShare = ceiling - systemReserve;
  return {
    ceiling, leadShare, systemShare: ceiling - leadReserve,
    digestReserve: Math.max(1, Math.ceil(leadShare * 0.2)), criticalReserve: Math.max(2, Math.ceil(ceiling * 0.15)),
    reminderReserve: Math.max(3, Math.ceil(ceiling * 0.1)), noticeReserve: 1,
  };
};
// Mirrors private.alert_numbers in the database. Shown on Status and used by tests only.
export const ALERT_POLICY = {
  perAddressDay: 3,
  dedupeHours: 12,
  ceiling: (s: Settings) => numbers(s).ceiling,
  leadShare: (s: Settings) => numbers(s).leadShare,
  systemShare: (s: Settings) => numbers(s).systemShare,
  digestReserve: (s: Settings) => numbers(s).digestReserve,
  criticalReserve: (s: Settings) => numbers(s).criticalReserve,
  reminderReserve: (s: Settings) => numbers(s).reminderReserve,
  noticeReserve: (s: Settings) => numbers(s).noticeReserve,
  /** New-lead alerts one by one, at most, in a day. */
  newLeadOneByOne: (s: Settings) => numbers(s).leadShare - numbers(s).digestReserve,
};
export const PAUSED_SUBJECT = 'Alerts paused for today';

const PAUSED_WHAT: Record<string, string> = {
  lead: 'New-lead emails one by one. New leads are still saved, and are listed in the "Many new leads" email when there is room.',
  lead_reminder: 'Reply reminders ("No reply yet", and "Still no reply" to your backup contact).',
  digest: 'The "Many new leads" list.',
  system: 'Problem alerts (a check on Status turned red).',
  critical: 'Escalations to your backup contact.',
};
export function pausedNoticeText(appUrl: string, cls: string) {
  return `Some alert emails are paused until midnight, because their share of today's alert allowance is used up. This is the only email about it today.\n\nThe first to run out: ${PAUSED_WHAT[cls] ?? cls}\n\nNothing is lost. Every lead and form post is saved. Until midnight, check the CRM yourself:\nNew leads: ${appUrl}/contacts?stage=new+lead\nStatus: ${appUrl}/status\n\nIf this happens on ordinary days, raise "Held back for alerts" in Settings (your email plan's daily limit must allow it).`;
}

export type AlertInput = {
  subject: string; text: string; alsoBackup?: boolean; leadId?: string | null; householdId?: string | null; key?: string;
  /** The lead list. Counts as a lead alert and may use the part of the lead share kept for it. */
  digest?: boolean;
  /** A no-reply reminder about leadId (not the new-lead alert). */
  reminder?: boolean;
  /** Where the lead came from (web form address or the person), hashed. For the per-address rule. */
  floodKey?: string | null;
  /** How long a keyed alert stays quiet. Default dedupeHours. */
  dedupeHours?: number;
  /** At most this many different keys a day that share the part of the key before ":". */
  dailyMax?: number;
};
// held 'digest': a new-lead alert that was not sent one by one. The lead goes in the next lead
// list (see sendLeadDigest). 'flooded': a reminder for a lead from a noisy address, not sent.
// 'paced': a lead list went out too recently. 'ceiling': no room today.
export type AlertResult = { ok: boolean; sent: number; held?: 'duplicate' | 'ceiling' | 'digest' | 'no_owner' | 'flooded' | 'paced' | 'daily_max' };

export function dayStart(now: Date, timeZone: string) {
  const local = new Date(now.toLocaleString('en-US', { timeZone }));
  return new Date(now.getTime() - (local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds()) * 1000 - local.getMilliseconds()).toISOString();
}

export function alertClass(a: AlertInput): 'lead' | 'lead_reminder' | 'digest' | 'system' | 'critical' {
  if (a.digest) return 'digest';
  if (a.leadId) return a.reminder ? 'lead_reminder' : 'lead';
  return a.alsoBackup ? 'critical' : 'system';
}

// Alerts to the owner (and the backup contact for escalations). The database decides, by its
// own clock; see above.
export async function sendAlert(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string, a: AlertInput): Promise<AlertResult> {
  const to = [settings.owner_email, a.alsoBackup ? settings.backup_email : null].filter(Boolean) as string[];
  if (!to.length) return { ok: false, sent: 0, held: 'no_owner' };
  const cls = alertClass(a);
  const key = a.key ?? (a.leadId && !a.digest && !a.reminder ? `lead:new:${a.leadId}` : null);
  const { data, error } = await db.rpc('alert_admit', {
    p_class: cls, p_to: to, p_subject: a.subject.slice(0, 300), p_body: a.text, p_key: key,
    p_dedupe_hours: a.dedupeHours ?? (cls === 'lead' || cls === 'lead_reminder' ? 72 : ALERT_POLICY.dedupeHours),
    p_lead_id: a.leadId ?? null, p_household_id: a.householdId ?? null, p_flood_key: a.floodKey ?? null, p_daily_max: a.dailyMax ?? null,
    p_notice_body: pausedNoticeText(appUrl, cls),
  });
  if (error || !data) return { ok: false, sent: 0 };
  if (!data.send) {
    const reason = String(data.reason);
    // A share ran out and the database saved the one "Alerts paused for today" email: send it.
    for (const e of (data.notice?.emails ?? []) as { id: string; to: string }[]) {
      await deliver(db, adapter, { id: e.id, to: e.to, subject: PAUSED_SUBJECT, body: pausedNoticeText(appUrl, cls) }, { settings, appUrl });
    }
    return { ok: false, sent: 0, held: (reason === 'hold' ? 'digest' : reason) as AlertResult['held'] };
  }
  let sent = 0;
  for (const e of (data.emails ?? []) as { id: string; to: string }[]) {
    const r = await deliver(db, adapter, { id: e.id, to: e.to, subject: a.subject.slice(0, 300), body: a.text }, { settings, appUrl });
    if (r.ok) sent++;
  }
  return { ok: sent > 0, sent };
}

/**
 * Leads held because their address sent many posts go out together in one "Many new leads"
 * email. The database paces it (at most one an hour, slower when the lead share runs low) and
 * lets only one through at a time. Nothing is dropped: a lead stays held until a list that names
 * it has gone out.
 */
export async function sendLeadDigest(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string, now = new Date()) {
  const { data: held } = await db.from('leads').select('id, household_id, source, received_at')
    .eq('alert_held', 'digest').is('new_alert_at', null).eq('is_test', false).order('received_at', { ascending: false }).limit(500);
  const leads = (held ?? []) as { id: string; household_id: string; source: string; received_at: string }[];
  if (!leads.length) return { ok: true, sent: 0, waiting: 0 };
  const { data: hh } = await db.from('v_households').select('id, display_name, primary_phone, primary_email').in('id', [...new Set(leads.map((l) => l.household_id))]);
  const byId = new Map(((hh ?? []) as any[]).map((h) => [h.id, h]));
  const shown = leads.slice(0, 30).map((l) => {
    const h = byId.get(l.household_id);
    return `- ${h?.display_name ?? 'Unknown'} | ${h?.primary_phone ?? 'no phone'} | ${h?.primary_email ?? 'no email'} | ${l.source} | ${appUrl}/contacts/${l.household_id}`;
  });
  const more = leads.length > shown.length ? `\n...and ${leads.length - shown.length} more.` : '';
  const text = `${leads.length} new leads came from web form addresses (or people) that sent more than a few posts today, so they are listed here instead of one email each. This is often spam, but look through the list: a real lead can be in it.\n\nLeads from everyone else still get their own email.\n\n${shown.join('\n')}${more}\n\nOpen your new leads: ${appUrl}/contacts?stage=new+lead\n\nReply reminders are off for the leads in this list. While this lasts, the next list comes at most once an hour.`;
  const r = await sendAlert(db, adapter, settings, appUrl, { subject: `${DIGEST_SUBJECT}: ${leads.length} waiting`, text, digest: true });
  if (r.ok) await db.from('leads').update({ new_alert_at: now.toISOString() }).in('id', leads.map((l) => l.id));
  return { ok: r.ok || r.held === 'paced', sent: r.sent, waiting: r.ok ? 0 : leads.length };
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
