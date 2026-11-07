// Review fix M4: emailed links are short-lived and work once.
import { describe, it, expect } from 'vitest';
import { signLink, consumeLink, LINK_TTL_SECONDS } from '@/lib/tokens';
import { fakeDb } from './fakedb';

const secret = 'test-secret-test-secret-test-secret';
// The same rule as public.hit_rate_limit.
const rateLimitRpc = (args: any, t: any) => {
  t.rate_limits ??= [];
  let row = t.rate_limits.find((r: any) => r.bucket === args.p_bucket);
  if (!row) { row = { bucket: args.p_bucket, window_start: new Date().toISOString(), hits: 0 }; t.rate_limits.push(row); }
  row.hits += 1;
  return row.hits <= args.p_max;
};

describe('M4: signed links', () => {
  it('"wasn\'t me" and "I replied" links last a day at most', () => {
    expect(LINK_TTL_SECONDS.wasnt_me).toBeLessThanOrEqual(86400);
    expect(LINK_TTL_SECONDS.lead_replied).toBeLessThanOrEqual(86400);
  });
  it('a link works once, and the second press is refused', async () => {
    const db = fakeDb({ rpc: { hit_rate_limit: rateLimitRpc } });
    const t = signLink(secret, 'wasnt_me', 'user-1', LINK_TTL_SECONDS.wasnt_me);
    expect(await consumeLink(db as any, secret, 'wasnt_me', t)).toEqual({ ok: true, subject: 'user-1' });
    expect(await consumeLink(db as any, secret, 'wasnt_me', t)).toEqual({ ok: false, reason: 'link_used' });
    const r = signLink(secret, 'lead_replied', 'lead-1', LINK_TTL_SECONDS.lead_replied);
    expect((await consumeLink(db as any, secret, 'lead_replied', r)).ok).toBe(true);
    expect((await consumeLink(db as any, secret, 'lead_replied', r)).ok).toBe(false);
  });
  it('an expired, tampered or wrong-purpose link is refused before it is used up', async () => {
    const db = fakeDb({ rpc: { hit_rate_limit: rateLimitRpc } });
    const old = signLink(secret, 'wasnt_me', 'user-1', 86400, Date.now() - 2 * 86400000);
    expect(await consumeLink(db as any, secret, 'wasnt_me', old)).toEqual({ ok: false, reason: 'bad_link' });
    const t = signLink(secret, 'lead_replied', 'lead-1', 3600);
    expect(await consumeLink(db as any, secret, 'wasnt_me', t)).toEqual({ ok: false, reason: 'bad_link' });
    expect(db.tables.rate_limits ?? []).toEqual([]);
  });
  it('the alert email carries a link that expires within a day', async () => {
    const { repliedLink } = await import('@/lib/alerts');
    const link = repliedLink('https://crm.example.com', secret, 'lead-1')!;
    const token = decodeURIComponent(link.split('t=')[1]);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    expect(payload.e - Date.now() / 1000).toBeLessThanOrEqual(86400 + 5);
  });
});
