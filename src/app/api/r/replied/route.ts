import { serviceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { verifyLink } from '@/lib/tokens';
import { ipBucket } from '@/lib/http';

// PUBLIC: the "I replied" button from an alert email. It marks one lead as replied.
// It does not log anyone in and can't do anything else.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = serviceClient();
  const back = (code: string) => Response.redirect(new URL(`/r/done?code=${code}`, env.appUrl()), 303);
  if ((await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'replied'), p_max: 30, p_window_seconds: 600 })).data !== true) return back('bad_link');
  const form = await req.formData().catch(() => null);
  const leadId = verifyLink(env.linkSecret(), 'lead_replied', form?.get('t'));
  if (!leadId) return back('bad_link');
  await db.from('leads').update({ replied_at: new Date().toISOString(), replied_via: 'link' }).eq('id', leadId).is('replied_at', null);
  return back('replied');
}
