import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PROFILE_COLUMNS, toProfile, type ProfileRow } from "./profile";

export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
    this.name = "SupabaseConfigError";
  }
}

/**
 * Server-side Supabase client bound to the request's cookies, so Server
 * Components, Route Handlers and Server Actions see the signed-in user.
 *
 * Throws SupabaseConfigError (not a bare Error) when the env vars are
 * missing, so callers can catch specifically that and show a real message
 * instead of the generic Next.js error boundary.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new SupabaseConfigError();
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session instead, so this is safe.
        }
      },
    },
  });
}

/** The signed-in user's profile, or null. Returns null (not a throw) if Supabase isn't configured. */
export async function getCurrentProfile() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  return toProfile(data as ProfileRow);
}
