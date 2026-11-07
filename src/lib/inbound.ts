import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { parseRealtorLead } from './parsers/realtor';
import { takeLead } from './leads';
import { getSettings } from './settings';
import { sendAlert } from './alerts';
import { createHash } from 'node:crypto';

const MAX_BODY = 200_000;
// Forwarded email limits. Past them the email is still saved to Needs review, but it is not
// turned into a lead and does not send an email of its own.
export const INBOUND_LIMITS = { perSender: 20, total: 100 };
const senderBucket = (from: string | null) => {
  const addr = (from ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() ?? 'unknown';
  return `inbound:${createHash('sha256').update(`inbound:${addr}`).digest('hex').slice(0, 24)}`;
};

// Every inbound email is stored before anything else happens. Parsed ones become leads.
// Anything we can't read goes to Needs review and alerts the owner. Nothing is dropped.
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
  // Rate limits: per sender first, so one sender can't use up the hour for everyone.
  const hit = async (bucket: string, max: number) => (await db.rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: 3600 })).data === true;
  const withinLimits = (await hit(senderBucket(e.from), INBOUND_LIMITS.perSender)) && (await hit('inbound:all', INBOUND_LIMITS.total));
  if (!withinLimits) {
    await db.from('inbound_emails').update({ review_reason: 'Saved but not read: too many forwarded emails this hour.' }).eq('id', row.id);
    await reviewAlert(db, adapter, appUrl, row.id);
    return { parsed: false, limited: true };
  }
  const bodyForParse = text || html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const parsed = e.fetchFailed ? { ok: false as const, reason: 'Could not fetch the email body from the provider.' } : parseRealtorLead(e.from, e.subject, bodyForParse);
  if (parsed.ok) {
    try {
      const lead = await takeLead(db, adapter, appUrl, linkSecret, {
        ...parsed.lead, channel: 'email', consent_status: 'unknown', consent_wording: null,
        message: [parsed.lead.property && `Property: ${parsed.lead.property}`, parsed.lead.message].filter(Boolean).join('\n') || null,
      });
      await db.from('inbound_emails').update({ status: 'parsed', parser: 'realtor.com', parsed: parsed.lead, household_id: lead.household_id, review_reason: null }).eq('id', row.id);
      return { parsed: true, householdId: lead.household_id };
    } catch (err: any) {
      await db.from('inbound_emails').update({ review_reason: `Read it, but could not save the lead: ${String(err?.message).slice(0, 200)}` }).eq('id', row.id);
    }
  } else {
    await db.from('inbound_emails').update({ review_reason: parsed.reason }).eq('id', row.id);
  }
  await reviewAlert(db, adapter, appUrl, row.id);
  return { parsed: false };
}

// One "needs review" email per 12 hours, with a count, however many emails arrive. Junk sent to
// the inbound address can't use up the alert allowance this way.
async function reviewAlert(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, rowId: string) {
  const s = await getSettings(db);
  const { count } = await db.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('status', 'needs_review');
  const r = await sendAlert(db, adapter, s, appUrl, {
    subject: 'An email needs review', key: 'inbound_review',
    text: `A forwarded email could not be read as a lead. It is saved, nothing was lost.\n\nEmails waiting in Needs review: ${count ?? 1}.\nOpen Needs review: ${appUrl}/review\n\nYou get this at most once every 12 hours, however many emails arrive.`,
  });
  if (r.ok || r.held === 'duplicate') await db.from('inbound_emails').update({ alerted_at: new Date().toISOString() }).eq('id', rowId);
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
