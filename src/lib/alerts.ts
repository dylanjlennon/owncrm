import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { queueAndSend } from './email/send';
import { signLink } from './tokens';
import type { Settings } from './settings';

// Alerts to the owner (and the backup contact for escalations). They use the reserved budget.
export async function sendAlert(db: SupabaseClient, adapter: EmailAdapter, settings: Settings, appUrl: string,
  a: { subject: string; text: string; alsoBackup?: boolean; leadId?: string | null; householdId?: string | null }) {
  const to = [settings.owner_email, a.alsoBackup ? settings.backup_email : null].filter(Boolean) as string[];
  if (!to.length) return { ok: false, sent: 0 };
  let sent = 0;
  for (const addr of to) {
    const r = await queueAndSend(db, adapter, { to: addr, subject: a.subject, body: a.text, kind: 'alert', leadId: a.leadId, householdId: a.householdId }, { settings, appUrl });
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
