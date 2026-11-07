// Review round 2, N1: one address must not be able to lock every real visitor out of the lead form.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const buckets = new Map<string, { start: number; hits: number }>();
// Same rule as public.hit_rate_limit: fixed window, counts a hit even when it refuses.
const hit = (a: any) => {
  const now = Date.now(); const c = buckets.get(a.p_bucket);
  if (!c || c.start < now - a.p_window_seconds * 1000) { buckets.set(a.p_bucket, { start: now, hits: 1 }); return 1 <= a.p_max; }
  c.hits++; return c.hits <= a.p_max;
};
const taken: { name: string; formFlood: boolean }[] = [];
vi.mock('@/lib/supabase/service', () => ({ serviceClient: () => ({ rpc: async (_n: string, a: any) => ({ data: hit(a) }) }) }));
vi.mock('@/lib/env', () => ({ env: { leadFormKey: () => 'form-key-demo', cronSecret: () => 'cron-secret-demo', appUrl: () => 'https://crm.example.com', linkSecret: () => 'x'.repeat(32) } }));
vi.mock('@/lib/email', () => ({ emailAdapter: () => ({}) }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({ form_consent_wording: '' }) }));
vi.mock('@/lib/leads', () => ({ takeLead: async (_db: any, _a: any, _u: any, _s: any, input: any, opts: any) => { taken.push({ name: input.first_name, formFlood: !!opts?.formFlood }); return {}; } }));
const { POST } = await import('@/app/api/lead/route');
const { LEAD_LIMITS } = await import('@/lib/limits');

const post = (ip: string, name: string) => POST(new Request('https://crm.example.com/api/lead', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ key: 'form-key-demo', first_name: name, email: `${name.toLowerCase()}@example.com` }),
}));

describe('N1: lead form rate limits', () => {
  beforeEach(() => { buckets.clear(); taken.length = 0; });
  it('61 posts from one address do not lock out a real visitor', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await post('203.0.113.9', `Spam${i}`)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(LEAD_LIMITS.perIp);
    expect(codes.filter((c) => c === 429)).toHaveLength(61 - LEAD_LIMITS.perIp);
    const real = await post('198.51.100.7', 'Demo');
    expect(real.status).toBe(200);
    expect(taken.at(-1)).toEqual({ name: 'Demo', formFlood: false });
  });
  it('past the site-wide limit, real leads are saved and held for the list, not refused', async () => {
    const codes: number[] = [];
    for (let i = 0; i < LEAD_LIMITS.perHour + 5; i++) codes.push((await post(`198.51.100.${i % 250}`, `Visitor${i}`)).status);
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(taken.filter((t) => t.formFlood)).toHaveLength(5);
    expect(taken.slice(0, LEAD_LIMITS.perHour).every((t) => !t.formFlood)).toBe(true);
  });
});
