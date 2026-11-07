import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmailAdapter } from './email/adapter';
import { getSettings } from './settings';
import { leadAlertText, sendAlert, sendLeadDigest } from './alerts';

export type LeadInput = {
  first_name: string; last_name?: string | null; email?: string | null; phone?: string | null; message?: string | null;
  source: string; source_type?: string; channel: 'form' | 'email' | 'manual';
  consent_status?: 'unknown' | 'opted_in'; consent_wording?: string | null; is_test?: boolean;
};

// Creates the lead and sends the new-lead alert right away. If the alert fails, the scheduled
// job retries it.
// opts.floodKey: where the lead came from (the web form address, or the person for a forwarded
// portal email), hashed. The database gives each address one-by-one alerts for up to 3 leads a
// day; past that, that address's leads are held for the "Many new leads" list. Leads from other
// addresses are not affected.
// opts.formFlood: the web form is past its site-wide hourly limit. The owner gets one "web form
// is being flooded" email per 12 hours. Each lead still goes through the per-address rule.
export async function takeLead(db: SupabaseClient, adapter: EmailAdapter, appUrl: string, linkSecret: string | undefined, input: LeadInput,
  opts: { formFlood?: boolean; floodKey?: string | null; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const { data, error } = await db.rpc('intake_lead', { p: input });
  if (error || !data) throw new Error(error?.message || 'Lead intake failed');
  const settings = await getSettings(db);
  const name = [input.first_name, input.last_name].filter(Boolean).join(' ');
  const lead = { id: data.lead_id as string, household_id: data.household_id as string, source: input.source };
  const floodKey = opts.floodKey ? opts.floodKey.slice(0, 100) : null;
  if (floodKey) await db.from('leads').update({ flood_key: floodKey }).eq('id', lead.id);
  if (opts.formFlood && !input.is_test) {
    await sendAlert(db, adapter, settings, appUrl, {
      subject: 'Your web form is being flooded', key: 'form_flood',
      text: `More than the usual number of web form posts arrived in the last hour. Every post is still saved, nothing is lost.\n\nAddresses that send more than a few posts get their leads listed in a "Many new leads" email instead of one email each. Leads from everyone else still get their own email, until today's lead alerts run low.\n\nIf you did not expect this, it is probably spam. Check your new leads: ${appUrl}/contacts?stage=new+lead\n\nYou get this once every 12 hours while it lasts.`,
    });
  }
  const r = await sendAlert(db, adapter, settings, appUrl, {
    subject: `${input.is_test ? '[Test] ' : ''}New lead: ${name}`.slice(0, 200),
    text: leadAlertText(appUrl, linkSecret, lead, { name, phone: input.phone, email: input.email, message: input.message }, 'new'),
    leadId: lead.id, householdId: lead.household_id, floodKey,
  });
  if (r.ok) await db.from('leads').update({ new_alert_at: now.toISOString() }).eq('id', lead.id);
  else if (r.held === 'digest' && !input.is_test) {
    await db.from('leads').update({ alert_held: 'digest' }).eq('id', lead.id);
    await sendLeadDigest(db, adapter, settings, appUrl, now);
    return { ...lead, alerted: false, held: true, created: !!data.created };
  }
  return { ...lead, alerted: r.ok, held: false, created: !!data.created };
}
