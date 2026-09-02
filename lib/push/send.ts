import "server-only";
import webpush from "web-push";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side only. Sends a Web Push notification to every device a user
 * has subscribed from.
 *
 * This is the piece that reaches someone who is not looking at OHUN at
 * all — closed tab, phone locked, app not in the foreground. Nothing else
 * in this codebase can: a realtime `postgres_changes` listener and the
 * Notification API it drives (see components/ohun/MessageWatcher.tsx) both
 * need this tab's JavaScript to still be running, which is exactly the
 * condition that does not hold for the person this exists to reach.
 */

let vapidConfigured = false;

/** Wires the VAPID keypair into the library, once, the first time it is needed. */
function ensureConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  // Any contact URI satisfies the spec; a push service uses it only to
  // reach the sender if a subscription is behaving badly.
  const subject = process.env.VAPID_SUBJECT || "mailto:support@ohun.app";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open on click, e.g. /chat/<threadId>. */
  url: string;
  /** Groups related notifications so a new one replaces the last rather than stacking. */
  tag?: string;
}

/**
 * Pushes to every device one user has subscribed from.
 *
 * Best-effort and silent by design, the same way lib/email — the message
 * this accompanies is already sent and stored by the time this runs, and
 * losing it because a push provider had a bad moment would be far worse
 * than one missed notification.
 *
 * Missing VAPID keys or a missing service-role key both degrade to a no-op
 * rather than an error, matching how the rest of this codebase treats
 * notification channels as optional infrastructure the core feature must
 * never depend on.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  // Every early return below is logged. This whole path runs silently by
  // design — a push failure must never surface to the sender — which means
  // a Vercel function log is the ONLY way anyone can ever tell which of
  // these five things happened for a given message. Without that, "it just
  // doesn't work" has no way to become "here is exactly where it stops."
  if (!ensureConfigured()) {
    console.warn(
      "[ohun] push: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — skipping",
    );
    return;
  }

  const admin = tryCreateAdminClient();
  if (!admin) {
    console.warn("[ohun] push: SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }

  const { data: subscriptions, error: readError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (readError) {
    console.error("[ohun] push: could not read push_subscriptions", readError);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.info(`[ohun] push: user ${userId} has no subscribed devices — nothing to send`);
    return;
  }

  console.info(`[ohun] push: sending to ${subscriptions.length} device(s) for user ${userId}`);
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
        );
        console.info(`[ohun] push: delivered to subscription ${subscription.id}`);
      } catch (error) {
        // 404/410 is the push service itself saying this subscription is
        // gone — the browser dropped it, the device was reset, the app was
        // uninstalled. Nothing will ever revive it, so stop keeping it: an
        // endpoint that fails forever would otherwise cost a request on
        // every single message sent to this user, permanently.
        const statusCode =
          error instanceof webpush.WebPushError ? error.statusCode : undefined;

        if (statusCode === 404 || statusCode === 410) {
          console.warn(
            `[ohun] push: subscription ${subscription.id} is gone (${statusCode}) — deleting it`,
          );
          await admin.from("push_subscriptions").delete().eq("id", subscription.id);
          return;
        }

        console.error(
          `[ohun] push: send failed for subscription ${subscription.id}` +
            (statusCode ? ` (status ${statusCode})` : ""),
          error,
        );
      }
    }),
  );
}
