"use client";

import { useState } from "react";

/**
 * Speaks one caption line aloud on click.
 *
 * Local, per-button pending state rather than a shared "what's playing"
 * store: playback is queued (see the hooks' playAudio), so several of
 * these can be clicked in a row and each just waits its turn. The spinner
 * is this button's own honest state — "waiting for my turn or playing" —
 * not a claim about the whole queue.
 */
export function PlayLineButton({
  text,
  onPlay,
}: {
  text: string;
  onPlay: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (pending || !text.trim()) return;
    setPending(true);
    try {
      await onPlay();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Play this aloud"
      title="Play aloud"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-[var(--muted)] transition-colors hover:text-[var(--accent)] disabled:text-[var(--accent)]"
    >
      {pending ? (
        <span
          aria-hidden
          className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 5.5v13l11-6.5-11-6.5z" />
        </svg>
      )}
    </button>
  );
}
