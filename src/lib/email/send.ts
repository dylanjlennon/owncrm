import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './adapter';
import { signLink } from '../tokens';
import type { MessageCode } from '../messages';

export type SendInput = {
  householdId?: string | null; personId?: string | null; leadId?: string | null;
  to: string; subject: string; body: string; kind: 'one_to_one' | 'marketing' | 'alert' | 'system';
};
export type SendContext = {
  settings: { display_name?: string | null; sender_email?: string | null; reply_to?: string | null; postal_address?: string | null };
  appUrl: string; linkSecret?: string;
};

export function blockCode(dbMessage: string | undefined): MessageCode {
  const m = dbMessage || '';
  if (m.includes('blocked_suppressed')) return 'email_blocked_suppressed';
  if (m.includes('blocked_dnc')) return 'email_blocked_dnc';
  if (m.includes('blocked_no_consent')) return 'email_blocked_consent';
  if (m.includes('blocked_budget')) return 'email_blocked_budget';
  if (m.includes('blocked_paused')) return 'email_blocked_paused';
  if (m.includes('blocked_no_address')) return 'email_blocked_address';
  return 'email_failed';
}

// Records the email first. The database decides if it may go (opt-outs, consent, budget).
// Only a row the database accepted is handed to the provider.
export async function queueAndSend(db: SupabaseClient, adapter: EmailAdapter, input: SendInput, ctx: SendContext):
  Promise<{ ok: true; id: string } | { ok: false; code: MessageCode; id?: string; error?: string }> {
  let body = input.body;
  const headers: Record<string, string> = {};
  if (input.kind === 'marketing') {
    if (!ctx.linkSecret) return { ok: false, code: 'email_failed', error: 'LINK_SIGNING_SECRET missing' };
    const token = signLink(ctx.linkSecret, 'unsubscribe', input.to.trim().toLowerCase(), 3 * 365 * 86400);
    const url = `${ctx.appUrl}/u?t=${encodeURIComponent(token)}`;
    body += `\n\n--\n${ctx.settings.display_name || ''}\n${ctx.settings.postal_address || ''}\nUnsubscribe: ${url}\n`;
    headers['List-Unsubscribe'] = `<${ctx.appUrl}/api/unsubscribe?t=${encodeURIComponent(token)}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const { data, error } = await db.from('outbound_emails').insert({
    household_id: input.householdId ?? null, person_id: input.personId ?? null, lead_id: input.leadId ?? null,
    to_address: input.to, subject: input.subject.slice(0, 300), body_text: body, kind: input.kind,
  }).select('id').single();
  if (error || !data) return { ok: false, code: blockCode(error?.message), error: error?.message };

  const from = ctx.settings.sender_email
    ? `${(ctx.settings.display_name || 'CRM').replace(/[<>"\r\n]/g, '')} <${ctx.settings.sender_email}>` : '';
  if (!from) {
    await db.from('outbound_emails').update({ status: 'failed', error: 'No sender address in Settings' }).eq('id', data.id);
    return { ok: false, code: 'email_failed', id: data.id };
  }
  const result = await adapter.send({ from, to: input.to, replyTo: ctx.settings.reply_to, subject: input.subject, text: body, headers, idempotencyKey: data.id });
  if (!result.ok) {
    await db.from('outbound_emails').update({ status: 'failed', error: result.error }).eq('id', data.id);
    return { ok: false, code: 'email_failed', id: data.id, error: result.error };
  }
  await db.from('outbound_emails').update({ status: 'sent', provider_id: result.providerId, sent_at: new Date().toISOString() }).eq('id', data.id);
  return { ok: true, id: data.id };
}
