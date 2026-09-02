"use client";

/**
 * Browser-side plumbing for Web Push: whether it can work here at all, and
 * converting the VAPID public key into the shape PushManager wants.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * PushManager.subscribe wants applicationServerKey as a Uint8Array, and the
 * VAPID public key is handed out base64url-encoded. This is that decode —
 * the standard base64url-to-bytes conversion the Web Push spec assumes.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Allocated via an explicit ArrayBuffer, not the Uint8Array(length)
  // shorthand: PushManager.subscribe's applicationServerKey is typed to
  // BufferSource | ArrayBufferView<ArrayBuffer>, and the shorthand's
  // backing buffer widens to the looser ArrayBufferLike, which no longer
  // satisfies that under current DOM lib typings.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Registers the service worker, or returns the existing registration. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  return existing ?? navigator.serviceWorker.register("/sw.js");
}
