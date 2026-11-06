import { serviceClient } from '@/lib/supabase/service';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';
import { readLimited, json } from '@/lib/http';
import { verifySvix } from '@/lib/secure';
import { processEmailEvent } from '@/lib/inbound';
import { handleReceived } from '@/lib/received';

// PUBLIC: delivery events from Resend. Own signing secret.
// Resend's free plan allows one webhook, so received-email events that arrive here are handled too.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readLimited(req, 256 * 1024);
  if (body === null) return json({ error: 'Too large' }, 413);
  const id = req.headers.get('svix-id');
  const ok = verifySvix({ secret: env.resendWebhookSecret(), id, timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature'), body });
  if (!ok) return json({ error: 'Bad signature' }, 401);
  let event: any;
  try { event = JSON.parse(body); } catch { return json({ error: 'Unreadable' }, 400); }
  if (event?.type === 'email.received') return handleReceived(event);
  await processEmailEvent(serviceClient(), emailAdapter(), env.appUrl(), String(id).slice(0, 200), event);
  return json({ ok: true });
}
