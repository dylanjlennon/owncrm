import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

// Session client for the logged-in owner. Cookies are httpOnly, so page scripts can't read tokens.
export async function sessionClient() {
  const store = await cookies();
  const secure = env.appUrl().startsWith('https://');
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure, path: '/' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure });
        } catch { /* called from a server component; the middleware refreshes cookies */ }
      },
    },
  });
}

// A client with no session at all. Used by the self-test to prove logged-out reads fail.
export function anonClient() {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
