import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupTestLeads } from './undo';

// Sends a fake lead through the public form, checks the database and the alert, then removes it.
export async function runFakeLead(db: SupabaseClient, appUrl: string, formKey: string | undefined, cronSecret: string | undefined) {
  if (!formKey || !cronSecret) return { ok: false, detail: 'LEAD_FORM_KEY or CRON_SECRET is not set.' };
  const started = new Date(Date.now() - 1000).toISOString();
  const stamp = Date.now();
  const res = await fetch(`${appUrl}/api/lead`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-owncrm-selftest': cronSecret },
    body: new URLSearchParams({ key: formKey, first_name: 'Weekly', last_name: 'Test Lead', email: `test-lead-${stamp}@example.com`, source: 'Weekly test lead', website: '' }).toString(),
  });
  if (res.status !== 303 && res.status !== 200) return { ok: false, detail: `The form answered ${res.status}.` };
  const { data: lead } = await db.from('leads').select('id, new_alert_at').eq('is_test', true).gte('received_at', started).order('received_at', { ascending: false }).limit(1).maybeSingle();
  const cleaned = await cleanupTestLeads(db);
  if (!lead) return { ok: false, detail: 'The form answered, but no lead reached the database.' };
  if (!lead.new_alert_at) return { ok: false, detail: `The lead was saved, but the alert email did not go out. Cleaned up ${cleaned ?? 0}.` };
  return { ok: true, detail: 'Form to database to alert email worked, and the test lead was removed.' };
}
