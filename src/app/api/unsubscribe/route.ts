import { serviceClient } from '@/lib/supabase/service';
import { env } from '@/lib/env';
import { unsubscribe } from '@/lib/unsubscribe';
import { json, ipBucket } from '@/lib/http';

// PUBLIC: one-click unsubscribe (RFC 8058) and the button on the unsubscribe page.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const db = serviceClient();
  if ((await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'unsub'), p_max: 30, p_window_seconds: 600 })).data !== true) return json({ error: 'Too many' }, 429);
  let token: unknown = url.searchParams.get('t');
  if (!token) {
    const form = await req.formData().catch(() => null);
    token = form?.get('t');
  }
  const ok = await unsubscribe(token);
  if ((req.headers.get('content-type') || '').includes('form') && !url.searchParams.get('t')) {
    return Response.redirect(new URL(ok ? '/r/done?code=unsubscribed' : '/r/done?code=bad_link', env.appUrl()), 303);
  }
  return json({ ok }, ok ? 200 : 400);
}
