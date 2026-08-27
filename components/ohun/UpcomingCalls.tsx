"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelScheduledCall, startScheduledCall } from "@/lib/schedule/actions";
import { Avatar } from "./UserResult";
import { UpgradeDialog } from "./UpgradeDialog";
import { Button, Card, Pill } from "@/components/ui";
import { LANGUAGE_FLAG, isJoinable, type ScheduledCall } from "@/types";

/** How often the "in 5 minutes" labels and join windows re-evaluate. */
const TICK_MS = 30_000;

function relativeLabel(iso: string, now: number): string {
  const delta = new Date(iso).getTime() - now;
  const minutes = Math.round(delta / 60_000);

  if (minutes <= 0 && minutes > -30) return "now";
  if (minutes < 0) return "missed";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

function absoluteLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ScheduledRow({
  scheduled,
  now,
  onChanged,
}: {
  scheduled: ScheduledCall;
  now: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, startAction] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const joinable = isJoinable(scheduled);
  const relative = relativeLabel(scheduled.scheduledAt, now);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar name={scheduled.counterpart.displayName} src={scheduled.counterpart.avatarUrl} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold tracking-tight">
            {scheduled.counterpart.displayName}
          </p>
          <p className="truncate text-sm text-[var(--muted)]">
            @{scheduled.counterpart.username} ·{" "}
            {LANGUAGE_FLAG[scheduled.counterpart.preferredLanguage]}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {absoluteLabel(scheduled.scheduledAt)}
          </p>
        </div>

        <Pill tone={joinable ? "live" : relative === "missed" ? "muted" : "neutral"}>
          {relative}
        </Pill>
      </div>

      {scheduled.note && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          {scheduled.note}
        </p>
      )}

      {!scheduled.organizedBySelf && (
        <p className="text-xs text-[var(--muted)]">
          {scheduled.counterpart.displayName.split(" ")[0]} scheduled this.
        </p>
      )}

      {error && (
        <Pill tone="error" className="w-full justify-center text-center">
          {error}
        </Pill>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startAction(async () => {
              setError(null);
              const result = await cancelScheduledCall(scheduled.id);
              if (result.error) {
                setError(result.error);
                return;
              }
              onChanged();
            })
          }
          className="h-11 flex-1 rounded-full border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--surface)] disabled:opacity-60"
        >
          Cancel
        </button>

        <Button
          size="md"
          className="flex-1"
          disabled={!joinable || pending}
          onClick={() =>
            startAction(async () => {
              setError(null);
              const result = await startScheduledCall(scheduled.id);
              if (result.error || !result.callId) {
                if (result.code === "free_tier_exhausted") {
                  setShowUpgrade(true);
                } else {
                  setError(result.error ?? "Could not start the call.");
                }
                return;
              }
              router.push(`/call/${result.callId}`);
            })
          }
        >
          {pending ? "Starting…" : joinable ? "Start now" : "Not yet"}
        </Button>
      </div>

      {showUpgrade && <UpgradeDialog onClose={() => setShowUpgrade(false)} />}
    </Card>
  );
}

export function UpcomingCalls({
  scheduled,
  onChanged,
}: {
  scheduled: ScheduledCall[];
  onChanged: () => void;
}) {
  // Re-render on a timer so "in 5 min" and the join window stay truthful
  // without the user reloading.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (scheduled.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Upcoming calls
      </h2>
      <div className="flex flex-col gap-4">
        {scheduled.map((entry) => (
          <ScheduledRow key={entry.id} scheduled={entry} now={now} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}
