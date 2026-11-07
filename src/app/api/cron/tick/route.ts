import { serviceClient } from '@/lib/supabase/service';
import { anonClient } from '@/lib/supabase/server';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';
import { bearerMatches } from '@/lib/secure';
import { json, ipBucket } from '@/lib/http';
import { runTick } from '@/lib/tick';
import { runSelfTest } from '@/lib/selftest';
import { runFakeLead } from '@/lib/fakelead';

// PUBLIC: the scheduler calls this every few minutes with CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: Request) {
  if (!bearerMatches(req.headers.get('authorization'), env.cronSecret())) return json({ error: 'Unauthorized' }, 401);
  const db = serviceClient();
  if ((await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'cron'), p_max: 30, p_window_seconds: 600 })).data !== true) return json({ error: 'Too many' }, 429);
  const result = await runTick({
    db, adapter: emailAdapter(), appUrl: env.appUrl(), linkSecret: env.linkSecret(), now: new Date(), healthcheckUrl: env.healthcheckUrl(),
    selfTest: () => runSelfTest(db, anonClient(), env.supabaseUrl(), env.supabaseAnonKey()),
    fakeLead: () => runFakeLead(db, env.appUrl(), env.leadFormKey(), env.cronSecret()),
  });
  // 200 when the scheduler ran, even if a check is red (that goes to the watchdog and email).
  // 500 only when the scheduler itself broke.
  return json({ ok: result.ok, ran: result.ran, detail: result.detail }, result.ran ? 200 : 500);
}
export const GET = handle;
export const POST = handle;
