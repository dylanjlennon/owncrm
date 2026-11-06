import { createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Compares hashes so lengths match and timing reveals nothing.
export function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header?.startsWith('Bearer ')) return false;
  return constantTimeEqual(header.slice(7), secret);
}

// Signature check for Svix-style webhooks, which is what Resend uses.
export function verifySvix(params: {
  secret: string | undefined; id: string | null; timestamp: string | null; signature: string | null;
  body: string; nowSeconds?: number; toleranceSeconds?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = params;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (params.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && constantTimeEqual(sig, expected);
  });
}

export function signSvixForTest(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

// AES-256-GCM for the optional AI key. The key lives only in the host's environment.
function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
export function decryptSecret(payload: string, secret: string): string {
  const [v, iv, tag, enc] = payload.split('.');
  if (v !== 'v1') throw new Error('Unknown format');
  const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}
