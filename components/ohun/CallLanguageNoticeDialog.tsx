"use client";

import { Button, Card } from "@/components/ui";

/**
 * Shown instead of an inline error whenever a call, group call, or group
 * invite is turned away specifically for language reasons — currently only
 * ever Yoruba, on either side of the call. A popup rather than the usual
 * inline Pill: this isn't a transient mistake to retry, it's a real,
 * standing limit worth explaining on its own rather than in a line of red
 * text next to a button.
 */
export function CallLanguageNoticeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Call not supported"
      // z-[60]: this can open on top of AddParticipantDialog (z-50), which
      // is itself already a modal over the call it belongs to.
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
        <Card className="flex flex-col gap-4 text-center">
          <div
            aria-hidden
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10l5-3v10l-5-3" />
              <rect x="2" y="6" width="13" height="12" rx="2" />
              <path d="M2 3l20 18" />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-bold tracking-tight">Call is not supported on this language… yet</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Yoruba works for messages and voice notes — it just isn&apos;t supported for voice
              or video calls yet.
            </p>
          </div>

          <Button onClick={onClose}>Got it</Button>
        </Card>
      </div>
    </div>
  );
}
