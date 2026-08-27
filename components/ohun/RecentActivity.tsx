"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { listRecentCalls } from "@/lib/calls/history";
import { Avatar } from "./UserResult";
import { Card, Pill } from "@/components/ui";
import { LANGUAGE_FLAG, type CallHistoryEntry, type CallOutcome, type Profile } from "@/types";

const OUTCOME_COPY: Record<CallOutcome, string> = {
  completed: "Completed",
  missed: "Missed",
  declined: "Declined",
  cancelled: "No answer",
  failed: "Failed",
};

/** Everything that isn't a normal completed call reads as a problem. */
const OUTCOME_TONE: Record<CallOutcome, string> = {
  completed: "text-[var(--accent)]",
  missed: "text-red-400",
  declined: "text-[var(--muted)]",
  cancelled: "text-[var(--muted)]",
  failed: "text-amber-400",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function formatWhen(iso: string, now: number): string {
  const then = new Date(iso);
  const deltaMinutes = Math.round((now - then.getTime()) / 60_000);

  if (deltaMinutes < 1) return "Just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Arrow in for a call you received, out for one you placed. */
function DirectionIcon({ outgoing, missed }: { outgoing: boolean; missed: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={missed ? "text-red-400" : "text-[var(--muted)]"}
    >
      {outgoing ? (
        <>
          <path d="M7 17 17 7" />
          <path d="M9 7h8v8" />
        </>
      ) : (
        <>
          <path d="M17 7 7 17" />
          <path d="M15 17H7V9" />
        </>
      )}
    </svg>
  );
}

function HistoryRow({
  entry,
  now,
  pending,
  onCall,
}: {
  entry: CallHistoryEntry;
  now: number;
  pending: boolean;
  onCall: (profile: CallHistoryEntry["counterpart"]) => void;
}) {
  const missed = entry.outcome === "missed";

  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      <Avatar name={entry.counterpart.displayName} src={entry.counterpart.avatarUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium tracking-tight">{entry.counterpart.displayName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
          <DirectionIcon outgoing={entry.outgoing} missed={missed} />
          <span className={OUTCOME_TONE[entry.outcome]}>{OUTCOME_COPY[entry.outcome]}</span>
          {entry.durationSeconds !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDuration(entry.durationSeconds)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>
            {LANGUAGE_FLAG[entry.fromLanguage]}
            <span aria-hidden> → </span>
            {LANGUAGE_FLAG[entry.toLanguage]}
          </span>
        </div>
      </div>

      <span className="shrink-0 text-xs text-[var(--muted)]">{formatWhen(entry.at, now)}</span>

      <button
        type="button"
        onClick={() => onCall(entry.counterpart)}
        disabled={pending}
        aria-label={`Call ${entry.counterpart.displayName} back`}
        title="Call back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        {pending ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
          />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export function RecentActivity({
  refreshToken,
  onCall,
}: {
  /** Changes whenever a call ends, so the list reloads without a refresh. */
  refreshToken?: number;
  /** Resolves to a message when the call could not be placed. */
  onCall: (profile: Pick<Profile, "id" | "displayName">) => Promise<string | null>;
}) {
  const [entries, setEntries] = useState<CallHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [callingId, setCallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startAction] = useTransition();

  // Placing the call from here rather than handing the click straight up:
  // this section is far below the page-level error pill, so a failure has
  // to be reported next to the button that caused it.
  const callBack = useCallback(
    (profile: CallHistoryEntry["counterpart"]) => {
      setError(null);
      setCallingId(profile.id);
      startAction(async () => {
        const message = await onCall(profile);
        setCallingId(null);
        if (message) setError(message);
      });
    },
    [onCall],
  );

  const refresh = useCallback(() => {
    void listRecentCalls().then((rows) => {
      setEntries(rows);
      setLoaded(true);
    });
  }, []);

  useEffect(refresh, [refresh, refreshToken]);

  // Keeps the relative timestamps honest during a long session.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Render nothing at all until the first load resolves, so the section
  // doesn't flash an empty state before the data arrives.
  if (!loaded) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Recent calls
      </h2>

      {error && (
        <Pill tone="error" className="mb-3 w-full justify-center text-center">
          {error}
        </Pill>
      )}

      <Card className="py-1">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            No calls yet — find someone below to start your first.
          </p>
        ) : (
          entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              now={now}
              pending={callingId === entry.counterpart.id}
              onCall={callBack}
            />
          ))
        )}
      </Card>
    </section>
  );
}
