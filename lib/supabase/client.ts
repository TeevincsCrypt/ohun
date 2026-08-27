"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 *
 * The URL and anon key are publishable by design — they identify the
 * project and carry no privileges of their own. Row Level Security is what
 * protects the data (see supabase/schema.sql). The service-role key, which
 * bypasses RLS, must never appear here.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }

  return createBrowserClient(url, anonKey);
}
