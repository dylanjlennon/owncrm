import 'server-only';
import { serviceClient } from './supabase/service';
import { emailAdapter } from './email';
import { env } from './env';
import { json } from './http';
import { processInbound } from './inbound';

export async function handleReceived(event: any) {
  const id = String(event?.data?.email_id || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return json({ error: 'No email id' }, 400);
  const adapter = emailAdapter();
  const full = await adapter.getReceived(id);
  const d = event.data || {};
  await processInbound(serviceClient(), adapter, env.appUrl(), env.linkSecret(), {
    providerId: id, from: full?.from ?? d.from ?? null, to: full?.to ?? (Array.isArray(d.to) ? d.to.join(', ') : null),
    subject: full?.subject ?? d.subject ?? null, text: full?.text ?? null, html: full?.html ?? null, fetchFailed: !full,
  });
  return json({ ok: true });
}

