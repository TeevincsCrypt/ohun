import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, SupabaseConfigError } from "@/lib/supabase/server";

/**
 * Where Supabase's confirmation email lands.
 *
 * Supabase sends either a `token_hash` + `type` pair (the current format,
 * verified here server-side) or, for older templates, a `code` to exchange.
 * Both are handled so an email sent before this route existed still works.
 *
 * On success the user has a session, so send them straight into the app
 * rather than back to a login form they no longer need.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/people";

  // Only ever redirect within this site — an attacker-supplied absolute URL
  // would turn the confirmation link into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/people";

  const failed = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return failed("Accounts aren't set up yet.");
    throw error;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return failed("That confirmation link has expired. Request a new one.");
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed("That confirmation link has expired. Request a new one.");
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  return failed("That confirmation link was incomplete.");
}
