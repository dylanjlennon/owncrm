import { createHmac } from 'node:crypto';
import { constantTimeEqual } from './secure';

// Signed links in emails. Each does exactly one thing and never logs anyone in.
export type LinkPurpose = 'lead_replied' | 'wasnt_me' | 'unsubscribe';

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signLink(secret: string, purpose: LinkPurpose, subject: string, ttlSeconds: number, nowMs = Date.now()): string {
  const payload = b64(JSON.stringify({ p: purpose, s: subject, e: Math.floor(nowMs / 1000) + ttlSeconds }));
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function verifyLink(secret: string | undefined, purpose: LinkPurpose, token: unknown, nowMs = Date.now()): string | null {
  if (!secret || typeof token !== 'string' || token.length > 2000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.p !== purpose || typeof data.s !== 'string') return null;
    if (typeof data.e !== 'number' || data.e < Math.floor(nowMs / 1000)) return null;
    return data.s;
  } catch { return null; }
}
