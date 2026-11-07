// Security headers for every response. Kept here, apart from the middleware, so it can be tested.

/**
 * Sites allowed to show the lead form in a frame, from LEAD_FORM_FRAME_ANCESTORS
 * (space-separated https origins, like "https://www.example.com https://example.com").
 * Anything that is not a plain https origin is ignored. Empty means no framing at all.
 */
export function formFrameAncestors(value: string | undefined): string[] {
  return (value || '').split(/[\s,]+/).filter((o) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)).slice(0, 10);
}

export const isLeadFormPath = (path: string) => /^\/lead\/[^/]+$/.test(path);

export function securityHeaderValues(path: string, nonce: string, frameAncestorsEnv?: string) {
  const framers = isLeadFormPath(path) ? formFrameAncestors(frameAncestorsEnv) : [];
  const csp = [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`, `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
    // Only the public lead form may be framed, and only by the sites you list.
    `frame-ancestors ${framers.length ? framers.join(' ') : "'none'"}`, "form-action 'self'",
    "base-uri 'none'", "object-src 'none'",
  ].join('; ');
  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  // X-Frame-Options can't list sites, so it is left off only where framing is allowed.
  if (!framers.length) headers['X-Frame-Options'] = 'DENY';
  return headers;
}
