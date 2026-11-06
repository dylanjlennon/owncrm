import { env } from '@/lib/env';
import { readLimited, json } from '@/lib/http';
import { verifySvix } from '@/lib/secure';
import { handleReceived } from '@/lib/received';

// PUBLIC: forwarded lead emails (Resend "email.received"). Own signing secret.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await readLimited(req, 256 * 1024);
  if (body === null) return json({ error: 'Too large' }, 413);
  const ok = verifySvix({ secret: env.resendInboundSecret(), id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature'), body });
  if (!ok) return json({ error: 'Bad signature' }, 401);
  let event: any;
  try { event = JSON.parse(body); } catch { return json({ error: 'Unreadable' }, 400); }
  if (event?.type !== 'email.received') return json({ ignored: true });
  return handleReceived(event);
}
