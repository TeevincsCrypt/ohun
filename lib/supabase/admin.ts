import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely, so it must never be
 * constructed in code that can reach the browser — the `server-only` import
 * above turns any such attempt into a build error.
 *
 * The only thing it is used for is reading a user's email address out of
 * auth.users to send them a notification. Email deliberately does not live
 * in `profiles`, which is world-readable by design (username search), so
 * there is no way to reach it with the anon key.
 */
export class AdminNotConfiguredError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not set — notification emails are disabled.");
    this.name = "AdminNotConfiguredError";
  }
}

/**
 * Admin client, or null when the service-role key is absent.
 *
 * For callers where the service-role key is genuinely optional — anything
 * that should degrade rather than fail. Placing a call must never depend
 * on a key that only notification email and billing need.
 */
export function tryCreateAdminClient() {
  try {
    return createAdminClient();
  } catch (error) {
    if (error instanceof AdminNotConfiguredError) return null;
    throw error;
  }
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) throw new AdminNotConfiguredError();

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Email addresses for the given user ids, keyed by id. Missing users are
 * simply absent from the map rather than throwing — a notification is not
 * worth failing the action that triggered it.
 */
export async function getUserEmails(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;

  const admin = createAdminClient();

  // There is no bulk "get users by id" in the admin API, and listUsers()
  // would page through the whole project. For the handful of ids a
  // notification needs, individual lookups are cheaper and clearer.
  await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user?.email) return;
      emails.set(id, data.user.email);
    }),
  );

  return emails;
}
