import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Public (publishable/anon) client for the shared Unakin Supabase. RLS restricts it to
// INSERTing leads only — it can never read anything. Never put the secret key on this
// public site.
const env = (k: string) => (import.meta.env as any)[k] ?? process.env[k];
const url = env('PUBLIC_SUPABASE_URL');
const key = env('PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
