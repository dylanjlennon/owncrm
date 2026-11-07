import { serviceClient } from '@/lib/supabase/service';
import { emailAdapter } from '@/lib/email';
import { env } from '@/lib/env';
import { readLimited, ipBucket, json } from '@/lib/http';
import { constantTimeEqual } from '@/lib/secure';
import { takeLead } from '@/lib/leads';
import { getSettings } from '@/lib/settings';

// PUBLIC: the web lead form. Own key, honeypot, size limit, rate limit.
export const dynamic = 'force-dynamic';
const MAX_BYTES = 16 * 1024;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(req: Request) {
  const raw = await readLimited(req, MAX_BYTES);
  if (raw === null) return json({ error: 'Too large' }, 413);
  const type = req.headers.get('content-type') || '';
  let f: Record<string, unknown> = {};
  try {
    f = type.includes('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch { return json({ error: 'Unreadable' }, 400); }
  const wantsHtml = !type.includes('application/json');
  const done = () => (wantsHtml ? Response.redirect(new URL('/lead/thanks', env.appUrl()), 303) : json({ ok: true }));

  if (!constantTimeEqual(clean(f.key, 200), env.leadFormKey())) return json({ error: 'Unknown form' }, 404);
  // Bots fill the hidden field. Pretend it worked and store nothing.
  if (clean(f.website, 500) !== '') return done();

  const db = serviceClient();
  const isTest = constantTimeEqual(req.headers.get('x-owncrm-selftest'), env.cronSecret());
  if (!isTest) {
    const okIp = (await db.rpc('hit_rate_limit', { p_bucket: ipBucket(req, 'lead'), p_max: 10, p_window_seconds: 600 })).data;
    const okAll = (await db.rpc('hit_rate_limit', { p_bucket: 'lead:all', p_max: 60, p_window_seconds: 3600 })).data;
    if (okIp !== true || okAll !== true) return json({ error: 'Too many requests. Try again later.' }, 429);
  }
  const first = clean(f.first_name, 100);
  const email = clean(f.email, 320);
  const phone = clean(f.phone, 40);
  if (!first || (!email && !phone)) return json({ error: 'Name and an email or phone are required' }, 400);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return json({ error: 'Email looks wrong' }, 400);
  const settings = await getSettings(db);
  const consented = clean(f.consent, 10) === 'yes';
  await takeLead(db, emailAdapter(), env.appUrl(), env.linkSecret(), {
    first_name: first, last_name: clean(f.last_name, 100) || null, email: email || null, phone: phone || null,
    message: clean(f.message, 2000) || null, source: clean(f.source, 80) || 'Website form', source_type: 'personal', channel: 'form',
    consent_status: consented ? 'opted_in' : 'unknown',
    // The exact words shown next to the checkbox, read from Settings on the server, not from the browser.
    consent_wording: consented ? settings.form_consent_wording : null,
    is_test: isTest,
  });
  return done();
}
