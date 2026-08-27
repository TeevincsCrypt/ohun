"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, SupabaseConfigError } from "@/lib/supabase/server";
import { isCallLanguage, validateUsername } from "@/types";

export interface AuthFormState {
  error: string | null;
  /** A non-error notice, e.g. "check your email to confirm your account". */
  info?: string | null;
}

/**
 * Absolute base URL for links Supabase emails out.
 *
 * Prefers the configured site URL; falls back to the request's own host so
 * a preview deployment confirms against itself rather than production.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

const CONFIG_ERROR_MESSAGE =
  "Accounts aren't set up on this deployment yet (Supabase isn't configured). Ask the site owner to add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

function isDuplicateUsernameError(message: string): boolean {
  return /duplicate|unique|already exists/i.test(message);
}

/**
 * Creates the auth user. The profile row is created by a database trigger
 * (see supabase/schema.sql: handle_new_user), not here — a client-side
 * insert right after signUp() only works when the project auto-confirms
 * email, since otherwise signUp() returns a user but no session, and an
 * unauthenticated insert is correctly rejected by RLS. The trigger runs in
 * the same transaction as the auth user, so it succeeds either way.
 * Username/display name/language reach it via signUp()'s options.data.
 */
export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const preferredLanguage = String(formData.get("preferredLanguage") ?? "");

  if (!email) return { error: "Enter an email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (!displayName) return { error: "Enter a display name." };

  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  if (!isCallLanguage(preferredLanguage)) {
    return { error: "Choose a supported language." };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { error: CONFIG_ERROR_MESSAGE };
    throw error;
  }

  // Fail fast on an obviously taken username so we don't create an orphaned
  // auth user. The unique index on profiles is still the real guarantee —
  // this is only for a friendlier message in the common case.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing) return { error: `@${username} is already taken.` };

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/confirm`,
      data: {
        username,
        display_name: displayName,
        preferred_language: preferredLanguage,
      },
    },
  });

  if (signUpError) {
    // A username that won the race against our pre-check fails inside the
    // profile-creation trigger, which runs in the same transaction as the
    // auth user — so it surfaces here rather than as a separate error.
    return {
      error: isDuplicateUsernameError(signUpError.message)
        ? `@${username} is already taken.`
        : signUpError.message,
    };
  }
  if (!signUpData.user) return { error: "Could not create the account." };

  // No session means the project requires email confirmation — signUp()
  // created the account but there is nothing to redirect into yet.
  if (!signUpData.session) {
    return {
      error: null,
      info: `Almost there — we sent a confirmation link to ${email}. Open it to activate your account.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/people");
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/people");

  if (!email || !password) return { error: "Enter your email and password." };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { error: CONFIG_ERROR_MESSAGE };
    throw error;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "Confirm your email before logging in — check your inbox."
        : "That email and password don't match an account.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/people");
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    if (!(error instanceof SupabaseConfigError)) throw error;
    // Nothing to sign out of if Supabase was never configured.
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

/** Re-sends the confirmation email for an address that never got activated. */
export async function resendConfirmation(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email you signed up with." };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return { error: CONFIG_ERROR_MESSAGE };
    throw error;
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/confirm` },
  });

  // Deliberately vague on failure: confirming whether an address has an
  // account would let anyone enumerate registered users.
  if (error && !/rate/i.test(error.message)) {
    return { error: null, info: "If that address needs confirming, a new link is on its way." };
  }
  if (error) return { error: "Too many requests — wait a minute and try again." };

  return { error: null, info: "A new confirmation link is on its way." };
}
