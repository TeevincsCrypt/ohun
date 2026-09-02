"use client";

import { useEffect, useState } from "react";
import { isPushSupported, ensureServiceWorker, urlBase64ToUint8Array } from "@/lib/push/client";
import { savePushSubscription, removePushSubscription } from "@/lib/push/actions";

/**
 * Turns on push notifications for new messages, on this device.
 *
 * A real Web Push subscription, not the Notification API alone — see
 * public/sw.js for why that distinction is the whole point: only a
 * subscription reaches you when this tab is not open at all.
 *
 * Subscribing needs a browser permission grant, which every browser ties
 * to a genuine click — asking on page load gets silently refused by some
 * and reads as spam to the person on all of them. This is that click.
 */

type Status = "unsupported" | "checking" | "off" | "denied" | "on" | "busy";

export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    // The synchronous checks live inside the same async body as the ones
    // that genuinely await something, rather than running eagerly before
    // it — setState during an effect's synchronous phase can cascade into
    // an extra render; deferring everything to a microtask avoids that.
    let cancelled = false;

    void (async () => {
      if (!vapidPublicKey || !isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      try {
        const registration = await ensureServiceWorker();
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const enable = async () => {
    if (!vapidPublicKey) return;
    setStatus("busy");
    setError(null);

    try {
      const registration = await ensureServiceWorker();

      // The permission prompt itself — must stay inside this click handler,
      // not behind an earlier await, or some browsers refuse it outright.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("The browser returned an incomplete subscription.");
      }

      const result = await savePushSubscription(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent,
      );

      if (result.error) {
        await subscription.unsubscribe().catch(() => {});
        setError(result.error);
        setStatus("off");
        return;
      }

      setStatus("on");
    } catch {
      setError("Could not turn on notifications on this device.");
      setStatus("off");
    }
  };

  const disable = async () => {
    setStatus("busy");
    setError(null);

    try {
      const registration = await ensureServiceWorker();
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }

      setStatus("off");
    } catch {
      setError("Could not turn off notifications on this device.");
      setStatus("on");
    }
  };

  if (status === "unsupported") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-[var(--muted)]" title="Notifications were blocked for this site in your browser settings.">
        Notifications are blocked in your browser
      </p>
    );
  }

  const on = status === "on";
  const busy = status === "busy" || status === "checking";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void (on ? disable() : enable())}
        disabled={busy}
        aria-pressed={on}
        className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          on
            ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent-border)]"
        }`}
      >
        {busy ? (
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
        {on ? "Notifications on" : "Get notified of new messages"}
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </div>
  );
}
