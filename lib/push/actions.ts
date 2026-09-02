"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Owns exactly one device's Web Push subscription. The device speaks for
 * itself — see components/ohun/PushNotificationToggle.tsx, which is the
 * only caller — never someone else's.
 */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface ActionResult {
  error?: string;
}

export async function savePushSubscription(
  subscription: PushSubscriptionInput,
  userAgent?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  // Upserted on endpoint: a browser hands out one endpoint per
  // installation, so re-subscribing (a permission re-grant, a key
  // rotation) replaces the same row rather than accumulating duplicates.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) return { error: error.message };
  return {};
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in." };

  // Scoped to the caller even though the endpoint alone is already unique —
  // defense in depth against ever deleting a row this account does not own.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  return {};
}
