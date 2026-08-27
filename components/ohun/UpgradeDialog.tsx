"use client";

import { useState, useTransition } from "react";
import { tiun } from "@tiun/sdk";
import { Button, Card, Pill } from "@/components/ui";
import { FREE_CALLS_PER_PERIOD } from "@/types";

export function UpgradeDialog({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const productId = process.env.NEXT_PUBLIC_TIUN_PRODUCT_ID;

  const subscribe = () => {
    if (!productId) {
      setError("Billing isn't configured on this deployment yet.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // tiun.checkout opens its own overlay (with its own login, if the
        // browser has no tiun session yet) and resolves once that overlay
        // closes — success or not. TiunProvider's onUserChange is what
        // actually unlocks the account once the purchase completes.
        await tiun.checkout({ productId });
      } catch {
        setError("Could not open checkout. Try again in a moment.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subscribe to keep calling"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Free plan
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            You&apos;ve used your {FREE_CALLS_PER_PERIOD} free calls this month
          </h2>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Subscribe to keep placing calls with live translation. Your account and
            everyone you&apos;ve talked to stay exactly as they are.
          </p>

          {error && (
            <Pill tone="error" className="mt-4 w-full justify-center text-center">
              {error}
            </Pill>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-full border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--surface)]"
            >
              Not now
            </button>
            <Button size="lg" className="flex-1" onClick={subscribe} disabled={pending}>
              {pending ? "Opening…" : "Subscribe"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
