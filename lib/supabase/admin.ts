import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';

/** Server and CLI only. Never import into client components or expose this key. */
export function createSupabaseAdminClient() {
  if (typeof window !== 'undefined') throw new Error('Supabase admin credentials are server-only.');
  const { url } = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new Error(
      'Configure SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) for account provisioning.',
    );
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
