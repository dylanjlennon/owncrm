// L3 and the HOW-TO framing claim: inline styles are refused, and only the lead form can be
// framed, only by the sites the owner lists.
import { describe, it, expect } from 'vitest';
import { securityHeaderValues } from '@/lib/csp';

describe('security headers', () => {
  it('L3: styles need the nonce; no unsafe-inline anywhere', () => {
    const h = securityHeaderValues('/today', 'abc');
    expect(h['Content-Security-Policy']).toContain("style-src 'self' 'nonce-abc'");
    expect(h['Content-Security-Policy']).not.toContain('unsafe-inline');
  });
  it('the app can never be framed', () => {
    for (const p of ['/login', '/today', '/lead/thanks/x', '/api/lead']) {
      const h = securityHeaderValues(p, 'n', 'https://www.example.com');
      expect(h['X-Frame-Options']).toBe('DENY');
      expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    }
  });
  it('the lead form can be framed by the listed sites only', () => {
    const h = securityHeaderValues('/lead/key123', 'n', 'https://www.example.com https://example.com');
    expect(h['X-Frame-Options']).toBeUndefined();
    expect(h['Content-Security-Policy']).toContain('frame-ancestors https://www.example.com https://example.com;');
  });
  it('ignores anything that is not a plain https origin, and frames nothing by default', () => {
    expect(securityHeaderValues('/lead/key123', 'n', "* http://x.example.com 'self' https://a.example.com/path")['X-Frame-Options']).toBe('DENY');
    expect(securityHeaderValues('/lead/key123', 'n')['X-Frame-Options']).toBe('DENY');
  });
});
