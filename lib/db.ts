// Server-only Supabase client using the service-role key. Never import from a client component.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
  return createClient(url, key, { auth: { persistSession: false } });
}
