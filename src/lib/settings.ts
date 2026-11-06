import type { SupabaseClient } from '@supabase/supabase-js';

export type Settings = Record<string, any> & { timezone: string; display_name?: string | null; sender_email?: string | null; reply_to?: string | null; postal_address?: string | null };
export async function getSettings(db: SupabaseClient): Promise<Settings> {
  const { data, error } = await db.from('app_settings').select('*').eq('id', true).single();
  if (error || !data) throw new Error('Could not read settings');
  return data as Settings;
}
