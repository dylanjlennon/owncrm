import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { parsePortalLead, knownLeadSource } from './parsers/realtor';
import { takeLead } from './leads';
import { getSettings } from './settings';
import { sendAlert } from './alerts';
import { createHash } from 'node:crypto';

const MAX_BODY = 200_000;
// Forwarded email limits, for senders we can't read only. Past them the email is still saved to
// Needs review, but it is not read and sends no email of its own. Email from a known lead source
// (Realtor.com, Zillow, Homes.com, Trulia, Redfin) is never held back by these limits: it is
// read first, and a real lead is never lost because junk used up the hour.
export const INBOUND_LIMITS = { perSender: 20, total: 100 };
// "Needs review" emails: one per sender per 12 hours, and at most this many senders a day.
export const REVIEW_ALERTS_PER_DAY = 5;
const hashed = (prefix: string, value: string) => `${prefix}:${createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 24)}`;
const senderAddress = (from: string | null) => (from ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() ?? 'unknown';

// Every inbound email is stored before anything else happens. Emails from a known lead source
// become leads. Anything we can't read goes to Needs review and alerts the owner. Nothing is dropped.
export async function processInbound(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, linkSecret: string | undefined,
  e: { providerId: string; from: string | null; to: string | null; subject: string | null; text: string | null; html: string | null; fetchFailed?: boolean }) {
  const text = (e.text ?? '').slice(0, MAX_BODY);
  const html = (e.html ?? '').slice(0, MAX_BODY);
  const { data: row, error } = await db.from('inbound_emails').insert({
    provider_id: e.providerId, from_address: e.from?.slice(0, 320), to_address: e.to?.slice(0, 1000), subject: e.subject?.slice(0, 500),
    text_body: text, html_body: html || null, body_truncated: (e.text?.length ?? 0) > MAX_BODY || (e.html?.length ?? 0) > MAX_BODY,
    status: 'needs_review', review_reason: e.fetchFailed ? 'Could not fetch the email body from the provider.' : 'Waiting to be read.',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { duplicate: true };
    throw new Error(error.message);
  }
  const sender = senderAddress(e.from);
  const bodyForParse = text || html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  // Known lead sources first, before any limit.
  const known = !e.fetchFailed && !!knownLeadSource(e.from, e.subject, bodyForParse);
  if (!known) {
    // Rate limits for everything else: per sender first, so one sender can't use up the hour for everyone.
    const hit = async (bucket: string, max: number) => (await db.rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: 3600 })).data === true;
    const withinLimits = (await hit(hashed('inbound', sender), INBOUND_LIMITS.perSender)) && (await hit('inbound:all', INBOUND_LIMITS.total));
    if (!withinLimits) {
      await db.from('inbound_emails').update({ review_reason: 'Saved but not read: too many forwarded emails this hour from senders the CRM cannot read.' }).eq('id', row.id);
      return { parsed: false, limited: true };
    }
  }
  const parsed = e.fetchFailed ? { ok: false as const, reason: 'Could not fetch the email body from the provider.' } : parsePortalLead(e.from, e.subject, bodyForParse);
  if (parsed.ok) {
    try {
      // The per-address rule for portal leads is per person (the lead's own email or phone):
      // every portal lead comes from the same portal sender.
      const person = (parsed.lead.email ?? parsed.lead.phone ?? '').toLowerCase().replace(/[^\w@.+-]/g, '');
      const lead = await takeLead(db, adapter, appUrl, linkSecret, {
        ...parsed.lead, channel: 'email', consent_status: 'unknown', consent_wording: null,
        message: [parsed.lead.property && `Property: ${parsed.lead.property}`, parsed.lead.message].filter(Boolean).join('\n') || null,
      }, { floodKey: person ? hashed('lead-person', person) : null });
      await db.from('inbound_emails').update({ status: 'parsed', parser: parsed.lead.source, parsed: parsed.lead, household_id: lead.household_id, review_reason: null }).eq('id', row.id);
      return { parsed: true, householdId: lead.household_id };
    } catch (err: any) {
      await db.from('inbound_emails').update({ review_reason: `Read it, but could not save the lead: ${String(err?.message).slice(0, 200)}` }).eq('id', row.id);
    }
  } else {
    await db.from('inbound_emails').update({ review_reason: parsed.reason }).eq('id', row.id);
  }
  await reviewAlert(db, adapter, appUrl, row.id, sender, e.subject);
  return { parsed: false };
}

// One "needs review" email per sender per 12 hours, and at most REVIEW_ALERTS_PER_DAY different
// senders a day, with a count. Junk from one sender can't silence an email from another, and junk
// from many senders can't use up the alert allowance.
async function reviewAlert(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, rowId: string, sender: string, subject: string | null) {
  const s = await getSettings(db);
  const { count } = await db.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('status', 'needs_review');
  const shown = (v: string) => v.replace(/[\r\n]+/g, ' ').slice(0, 150);
  const r = await sendAlert(db, adapter, s, appUrl, {
    subject: 'An email needs review', key: hashed('inbound_review', sender), dailyMax: REVIEW_ALERTS_PER_DAY,
    text: `A forwarded email could not be read as a lead. It is saved, nothing was lost.\n\nFrom: ${shown(sender)}\nSubject: ${shown(subject ?? '(none)')}\n\nEmails waiting in Needs review: ${count ?? 1}.\nOpen Needs review: ${appUrl}/review\n\nYou get this once per sender every 12 hours, and for at most ${REVIEW_ALERTS_PER_DAY} senders a day. The rest wait in Needs review.`,
  });
  if (r.ok || r.held === 'duplicate' || r.held === 'daily_max') await db.from('inbound_emails').update({ alerted_at: new Date().toISOString() }).eq('id', rowId);
}

// Delivery events from the email provider. "Delivered" and "Bounced" only appear once these arrive.
export async function processEmailEvent(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, eventId: string, event: any) {
  const type = String(event?.type || '');
  const providerId = event?.data?.email_id;
  const { data: msg } = providerId ? await db.from('outbound_emails').select('id, to_address, household_id, kind').eq('provider_id', providerId).maybeSingle() : { data: null };
  const { error } = await db.from('email_events').insert({ provider_event_id: eventId, outbound_id: msg?.id ?? null, type, detail: { bounce: event?.data?.bounce ?? null } });
  if (error?.code === '23505') return { duplicate: true };
  if (!msg) return { matched: false };
  const map: Record<string, string> = { 'email.delivered': 'delivered', 'email.delivery_delayed': 'delayed', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed' };
  if (map[type]) await db.from('outbound_emails').update({ status: map[type], last_event_at: new Date().toISOString() }).eq('id', msg.id);
  const s = await getSettings(db);
  if (type === 'email.bounced') {
    const permanent = !event?.data?.bounce?.type || /permanent|hard/i.test(String(event.data.bounce.type));
    if (permanent) {
      await db.from('contact_methods').update({ is_valid: false, invalid_reason: 'Hard bounce' }).eq('kind', 'email').eq('normalized', msg.to_address.trim().toLowerCase());
      await db.from('suppressions').upsert({ kind: 'email', value: msg.to_address, reason: 'hard bounce' }, { onConflict: 'kind,normalized', ignoreDuplicates: true });
    }
    const { count } = await db.from('outbound_emails').select('id', { count: 'exact', head: true }).eq('status', 'bounced').gte('last_event_at', new Date(Date.now() - 86400000).toISOString());
    if ((count ?? 0) >= 5 && !s.sending_paused) {
      await db.from('app_settings').update({ sending_paused: true, sending_paused_reason: `${count} bounces in 24 hours. Sending paused to protect your domain.` }).eq('id', true);
      await sendAlert(db, adapter, s, appUrl, { subject: 'Sending paused: too many bounces', text: `${count} emails bounced in the last 24 hours. Client email is paused. Check your list, then turn sending back on in Settings.`, alsoBackup: true });
    }
  }
  if (type === 'email.complained') {
    await db.from('suppressions').upsert({ kind: 'email', value: msg.to_address, reason: 'spam complaint' }, { onConflict: 'kind,normalized', ignoreDuplicates: true });
    await sendAlert(db, adapter, s, appUrl, { subject: 'Someone marked your email as spam', text: `A message to ${msg.to_address} was reported as spam. That address is now on the opt-out list.\n${appUrl}/contacts/${msg.household_id ?? ''}` });
  }
  return { matched: true };
}
