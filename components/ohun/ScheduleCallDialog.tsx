"use client";

import { useState, useTransition } from "react";
import { scheduleCall } from "@/lib/schedule/actions";
import { Avatar } from "./UserResult";
import { Button, Card, Pill } from "@/components/ui";
import type { Profile } from "@/types";

/**
 * Converts a Date into the `YYYY-MM-DDTHH:mm` a datetime-local input wants,
 * in the browser's own timezone. toISOString() would shift to UTC and show
 * the user the wrong clock time.
 */
function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const NOTE_LIMIT = 280;

export function ScheduleCallDialog({
  invitee,
  onClose,
  onScheduled,
}: {
  invitee: Profile;
  onClose: () => void;
  onScheduled: () => void;
}) {
  // Default to the next round half-hour — a sensible booking, not "now".
  const [when, setWhen] = useState(() => {
    const next = new Date(Date.now() + 30 * 60_000);
    next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
    return toLocalInputValue(next);
  });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      // The input gives a local wall-clock string; make it absolute before
      // it reaches the server, which has no idea what timezone the user is in.
      const result = await scheduleCall(invitee.id, new Date(when).toISOString(), note);
      if (result.error) {
        setError(result.error);
        return;
      }
      onScheduled();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Schedule a call with ${invitee.displayName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Stops a click inside the card from reaching the backdrop's close handler. */}
      <div className="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={invitee.displayName} src={invitee.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight">
              Schedule with {invitee.displayName}
            </p>
            <p className="truncate text-sm text-[var(--muted)]">@{invitee.username}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="scheduled-at" className="text-sm font-medium text-[var(--muted)]">
              When
            </label>
            <input
              id="scheduled-at"
              type="datetime-local"
              value={when}
              min={toLocalInputValue(new Date())}
              onChange={(event) => setWhen(event.target.value)}
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--foreground)]"
            />
            <p className="text-xs text-[var(--muted)]">
              Shown in your timezone. They&apos;ll see it in theirs.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="scheduled-note" className="text-sm font-medium text-[var(--muted)]">
              Note <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id="scheduled-note"
              value={note}
              maxLength={NOTE_LIMIT}
              rows={3}
              placeholder="What's this call about?"
              onChange={(event) => setNote(event.target.value)}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--foreground)]"
            />
            <p className="text-right text-xs text-[var(--muted)]">
              {note.length}/{NOTE_LIMIT}
            </p>
          </div>

          {error && (
            <Pill tone="error" className="w-full justify-center text-center">
              {error}
            </Pill>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-full border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--surface)]"
            >
              Cancel
            </button>
            <Button size="lg" className="flex-1" onClick={submit} disabled={pending}>
              {pending ? "Scheduling…" : "Schedule"}
            </Button>
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}
