import type { SupabaseClient } from '@supabase/supabase-js';

// Tries to read every table and view with no login at all. Any row that comes back is a leak.
export async function runSelfTest(db: SupabaseClient, anon: SupabaseClient, supabaseUrl: string, anonKey: string) {
  const { data: tables, error } = await db.rpc('list_app_tables');
  if (error || !Array.isArray(tables) || tables.length === 0) return { ok: false, signupOn: null as boolean | null, detail: 'Could not list tables to test.' };
  const leaks: string[] = [];
  for (const t of tables as string[]) {
    const { data, error: e } = await anon.from(t).select('*').limit(1);
    if (!e && Array.isArray(data) && data.length > 0) leaks.push(t);
  }
  const rpc = await anon.rpc('intake_lead', { p: { email: 'selftest@example.com' } });
  if (!rpc.error) leaks.push('intake_lead (function)');
  let signupOn: boolean | null = null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(8000) });
    if (res.ok) signupOn = !(await res.json()).disable_signup;
  } catch { /* reported below */ }
  const problems = [
    leaks.length ? `Readable without login: ${leaks.join(', ')}` : '',
    signupOn === true ? 'Public signup is ON. Turn it off in Supabase: Authentication, Sign In / Providers, "Allow new users to sign up".' : '',
    signupOn === null ? 'Could not check the signup setting.' : '',
  ].filter(Boolean);
  return { ok: problems.length === 0, signupOn, detail: problems.join(' ') || `All ${tables.length} tables and views refused a logged-out read. Public signup is off.` };
}
