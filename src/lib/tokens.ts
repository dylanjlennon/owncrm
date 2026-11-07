import { createHash, createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { constantTimeEqual } from './secure';

// Signed links in emails. Each does exactly one thing and never logs anyone in.
export type LinkPurpose = 'lead_replied' | 'wasnt_me' | 'unsubscribe';

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signLink(secret: string, purpose: LinkPurpose, subject: string, ttlSeconds: number, nowMs = Date.now()): string {
  const payload = b64(JSON.stringify({ p: purpose, s: subject, e: Math.floor(nowMs / 1000) + ttlSeconds }));
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

// A token is exactly "payload.signature", both plain base64url. Anything else (a third
// segment, padding, spaces) is refused, so there is only one spelling of each valid link.
const B64URL = /^[A-Za-z0-9_-]+$/;
function splitToken(token: unknown): { payload: string; sig: string } | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !B64URL.test(parts[0]) || !B64URL.test(parts[1])) return null;
  return { payload: parts[0], sig: parts[1] };
}

export function verifyLink(secret: string | undefined, purpose: LinkPurpose, token: unknown, nowMs = Date.now()): string | null {
  if (!secret) return null;
  const parts = splitToken(token);
  if (!parts) return null;
  const { payload, sig } = parts;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.p !== purpose || typeof data.s !== 'string') return null;
    if (typeof data.e !== 'number' || data.e < Math.floor(nowMs / 1000)) return null;
    return data.s;
  } catch { return null; }
}

// How long each emailed link works. Kept short: a leaked "wasn't me" link can end your
// sessions, and an "I replied" link can silence one lead's reminders. The unsubscribe link
// stays long because the law expects it to keep working, and it can only add an opt-out.
export const LINK_TTL_SECONDS: Record<LinkPurpose, number> = {
  wasnt_me: 24 * 3600,
  lead_replied: 24 * 3600,
  unsubscribe: 3 * 365 * 86400,
};
// Used links are remembered for longer than any short link lives, so a link works once only.
export const USED_LINK_MEMORY_SECONDS = 3 * 86400;

/**
 * Checks a signed link and uses it up. The second press of the same link is refused.
 * Returns the subject, or why it was refused.
 */
export async function consumeLink(db: SupabaseClient, secret: string | undefined, purpose: 'wasnt_me' | 'lead_replied', token: unknown):
  Promise<{ ok: true; subject: string } | { ok: false; reason: 'bad_link' | 'link_used' }> {
  const subject = verifyLink(secret, purpose, token);
  if (!subject) return { ok: false, reason: 'bad_link' };
  // The "used" marker is a hash of exactly what the checker verified (the signed payload),
  // not of the raw string, so no other spelling of the same link counts as a new link.
  const id = createHash('sha256').update(splitToken(token)!.payload).digest('hex').slice(0, 40);
  const { data, error } = await db.rpc('hit_rate_limit', { p_bucket: `once:${purpose}:${id}`, p_max: 1, p_window_seconds: USED_LINK_MEMORY_SECONDS });
  if (error) return { ok: false, reason: 'bad_link' };
  return data === true ? { ok: true, subject } : { ok: false, reason: 'link_used' };
}
