import { serviceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { verifyLink } from '@/lib/tokens';
import { ipBucket } from '@/lib/http';

// PUBLIC: the "wasn't me" button from a new-login email. Ends every session. Nothing else.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = serviceClient();
  const back = (code: string) => Response.redirect(new URL(`/r/done?code=${code}`, env.appUrl()), 303);
  if ((await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'wasntme'), p_max: 10, p_window_seconds: 600 })).data !== true) return back('bad_link');
  const form = await req.formData().catch(() => null);
  if (!verifyLink(env.linkSecret(), 'wasnt_me', form?.get('t'))) return back('bad_link');
  const { error } = await db.rpc('revoke_all_owner_sessions');
  return back(error ? 'bad_link' : 'signed_out');
}
