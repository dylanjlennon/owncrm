import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

// The service key skips row level security. Only the narrow public routes listed in
// tests/service-key.test.ts may import this file. Each checks its own secret first.
let cached: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl(), env.serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cached;
}
