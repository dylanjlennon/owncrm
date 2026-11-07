import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { securityHeaderValues } from '@/lib/csp';

// Public paths. Everything else needs the owner's session with a second factor.
const PUBLIC = [/^\/login$/, /^\/lead\//, /^\/u$/, /^\/r\//, /^\/api\/(lead|inbound|webhooks|cron|backup-report|history\/upload|unsubscribe|r)\b/];
const SESSION_ONLY = [/^\/mfa$/];

function securityHeaders(res: NextResponse, nonce: string, isApi: boolean, path: string) {
  for (const [k, v] of Object.entries(securityHeaderValues(path, nonce, process.env.LEAD_FORM_FRAME_ANCESTORS))) res.headers.set(k, v);
  if (isApi || !res.headers.get('Cache-Control')) res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return res;
}

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const path = req.nextUrl.pathname;
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('x-pathname', path);
  reqHeaders.set('Content-Security-Policy', `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'nonce-${nonce}'`);
  const isApi = path.startsWith('/api/');

  if (PUBLIC.some((re) => re.test(path))) {
    return securityHeaders(NextResponse.next({ request: { headers: reqHeaders } }), nonce, isApi, path);
  }

  let res = NextResponse.next({ request: { headers: reqHeaders } });
  const secure = (process.env.APP_URL || '').startsWith('https://');
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure, path: '/' },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: { headers: reqHeaders } });
        for (const { name, value, options } of list) res.cookies.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure });
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const redirectTo = (to: string) => {
    const r = NextResponse.redirect(new URL(to, req.url), 303);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return securityHeaders(r, nonce, isApi, path);
  };
  if (!user) return isApi ? securityHeaders(NextResponse.json({ error: 'Log in first' }, { status: 401 }), nonce, true, path) : redirectTo('/login');
  if (!SESSION_ONLY.some((re) => re.test(path))) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') return isApi ? securityHeaders(NextResponse.json({ error: 'Second factor required' }, { status: 401 }), nonce, true, path) : redirectTo('/mfa');
  }
  return securityHeaders(res, nonce, isApi, path);
}

// Node runtime, so settings are read when the server starts, not frozen in at build time.
export const config = { runtime: 'nodejs', matcher: ['/((?!_next/static|_next/image|fonts/|favicon.ico).*)'] };
