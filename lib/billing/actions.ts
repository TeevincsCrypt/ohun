"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_CALLS_PER_PERIOD, type BillingStatus, type SubscriptionStatus } from "@/types";

/** How long a free period lasts before its call counter resets. */
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

interface BillingRow {
  subscription_status: SubscriptionStatus;
  free_calls_used: number;
  free_period_started_at: string;
}

/**
 * Reads the row and, if the current period has expired, resets it — a
 * lazy rollover rather than a cron job, since nothing depends on the
 * reset happening exactly on schedule.
 *
 * Writes go through the admin client: these four columns are revoked from
 * `authenticated` in the database (see schema.sql) specifically so that
 * only server code holding the service-role key can move them. The
 * ordinary per-request client — even running here, server-side — connects
 * as `authenticated` and would be rejected by the same privilege check a
 * browser client hitting the table directly would hit.
 */
async function loadBilling(userId: string): Promise<BillingRow> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("subscription_status, free_calls_used, free_period_started_at")
    .eq("id", userId)
    .single();

  const row = data as BillingRow;
  const periodAge = Date.now() - new Date(row.free_period_started_at).getTime();

  if (periodAge < PERIOD_MS) return row;

  const resetAt = new Date().toISOString();
  await admin
    .from("profiles")
    .update({ free_calls_used: 0, free_period_started_at: resetAt })
    .eq("id", userId);

  return { ...row, free_calls_used: 0, free_period_started_at: resetAt };
}

/** Billing status for the signed-in user — plan, and free calls left this period. */
export async function getBillingStatus(): Promise<BillingStatus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const row = await loadBilling(user.id);

  return {
    status: row.subscription_status,
    freeCallsUsed: row.free_calls_used,
    freeCallsLimit: FREE_CALLS_PER_PERIOD,
    freeCallsRemaining: Math.max(0, FREE_CALLS_PER_PERIOD - row.free_calls_used),
    enforced: isBillingEnabled(),
  };
}

/**
 * Whether a payment provider is actually wired up on this deployment.
 *
 * When it is not, metering is pointless and actively harmful: there would
 * be no way for anyone who hits the cap to lift it, so the app would just
 * stop working with a dead "Subscribe" button. The counter keeps
 * incrementing either way — only the refusal is conditional — so turning
 * billing on later does not hand everyone a fresh allowance.
 */
function isBillingEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TIUN_SNIPPET_ID && process.env.NEXT_PUBLIC_TIUN_PRODUCT_ID);
}

/**
 * Called by startCall() before placing a call. Returns false when the
 * caller is on the free plan and has used up this period's calls — the
 * caller of this function is responsible for stopping there rather than
 * inserting the call row.
 *
 * Subscribed accounts are never metered: incrementing a counter nobody
 * checks would just be wasted writes.
 */
export async function consumeFreeCallOrReject(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const row = await loadBilling(userId);

  if (row.subscription_status === "active") return true;
  if (row.free_calls_used >= FREE_CALLS_PER_PERIOD && isBillingEnabled()) return false;

  await admin
    .from("profiles")
    .update({ free_calls_used: row.free_calls_used + 1 })
    .eq("id", userId);

  return true;
}

/**
 * Marks the signed-in account as subscribed.
 *
 * IMPORTANT — trust boundary: this is called from the client once tiun
 * reports a successful checkout (see components/ohun/TiunProvider.tsx). It
 * does not independently verify that report against tiun's own servers.
 * tiun's SDK documents a getUserVerificationToken() + server-side
 * verification flow for exactly this purpose, but the verification
 * endpoint is on docs.tiun.io / api.tiun.io, both unreachable from the
 * sandbox this was built in — so that half could not be written without
 * guessing an API contract. Until it's wired in, a user could forge this
 * call from devtools and grant themselves a subscription for free. Treat
 * this as a placeholder to harden before charging real money.
 */
export async function activateSubscription(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      subscription_status: "active" satisfies SubscriptionStatus,
      subscription_product_id: productId,
    })
    .eq("id", user.id);

  if (error) return { error: "Could not activate your subscription." };

  revalidatePath("/people");
  revalidatePath("/profile");
  return {};
}
