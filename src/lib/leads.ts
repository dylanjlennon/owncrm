import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { getSettings } from './settings';
import { leadAlertText, sendAlert } from './alerts';

export type LeadInput = {
  first_name: string; last_name?: string | null; email?: string | null; phone?: string | null; message?: string | null;
  source: string; source_type?: string; channel: 'form' | 'email' | 'manual';
  consent_status?: 'unknown' | 'opted_in'; consent_wording?: string | null; is_test?: boolean;
};

// Creates the lead and sends the new-lead alert right away. If the alert fails,
// the scheduled job retries it.
export async function takeLead(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, linkSecret: string | undefined, input: LeadInput) {
  const { data, error } = await db.rpc('intake_lead', { p: input });
  if (error || !data) throw new Error(error?.message || 'Lead intake failed');
  const settings = await getSettings(db);
  const name = [input.first_name, input.last_name].filter(Boolean).join(' ');
  const lead = { id: data.lead_id as string, household_id: data.household_id as string, source: input.source };
  const r = await sendAlert(db, adapter, settings, appUrl, {
    subject: `${input.is_test ? '[Test] ' : ''}New lead: ${name}`.slice(0, 200),
    text: leadAlertText(appUrl, linkSecret, lead, { name, phone: input.phone, email: input.email, message: input.message }, 'new'),
    leadId: lead.id, householdId: lead.household_id,
  });
  if (r.ok) await db.from('leads').update({ new_alert_at: new Date().toISOString() }).eq('id', lead.id);
  return { ...lead, alerted: r.ok, created: !!data.created };
}
