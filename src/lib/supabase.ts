/**
 * supabase.ts — Supabase client factory for SyncPlay.
 *
 * - Browser/client-side: uses the anon key (safe to expose).
 * - Server/API routes: uses the service role key (bypasses RLS, server-only).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Browser client (singleton) ────────────────────────────────────────────────
let _browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserClient;
}

// ── Server client (per-request, uses service role) ────────────────────────────
export function createServerSupabase(): SupabaseClient {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
