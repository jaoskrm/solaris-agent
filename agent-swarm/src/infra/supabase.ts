import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config/index.js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const config = getConfig();
  
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    throw new Error('Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  supabaseClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  return supabaseClient;
}

export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabase();
    const { error } = await client.from('pg_tables').select('count').limit(1);
    return !error;
  } catch {
    return false;
  }
}
