"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, SupabaseConfigError } from "@/lib/supabase/server";
import { isCallLanguage, validateUsername } from "@/types";

export interface AuthFormState {
  error: string | null;
}

const CONFIG_ERROR_MESSAGE =
  "Accounts aren't set up on this deployment yet (Supabase isn't configured). Ask the site owner to add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

/**
 * Creates the auth user, then the profile row. Username uniqueness and the
 * language whitelist are enforced by the database (unique index + CHECK),
 * so a race between two signups still cannot produce a duplicate — the
 * checks here only produce friendlier messages.
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
  // auth user. The unique index is still the real guarantee.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing) return { error: `@${username} is already taken.` };

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) return { error: signUpError.message };
  if (!signUpData.user) return { error: "Could not create the account." };

  const { error: profileError } = await supabase.from("profiles").insert({
    id: signUpData.user.id,
    username,
    display_name: displayName,
    preferred_language: preferredLanguage,
  });

  if (profileError) {
    return {
      error:
        profileError.code === "23505"
          ? `@${username} is already taken.`
          : `Could not create your profile: ${profileError.message}`,
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

  if (error) return { error: "That email and password don't match an account." };

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
