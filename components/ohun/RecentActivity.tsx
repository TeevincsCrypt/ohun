"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { listRecentCalls } from "@/lib/calls/history";
import { Avatar } from "./UserResult";
import { Card, Pill } from "@/components/ui";
import {
  LANGUAGE_FLAG,
  type CallHistoryEntry,
  type CallOutcome,
  type DirectCallEntry,
  type GroupCallEntry,
  type HistoryPerson,
  type Profile,
} from "@/types";

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

/** Shared chrome for a history row, whichever kind it is. */
function Row({
  avatar,
  title,
  meta,
  when,
  action,
}: {
  avatar: React.ReactNode;
  title: string;
  meta: React.ReactNode;
  when: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium tracking-tight">{title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
          {meta}
        </div>
      </div>
      <span className="shrink-0 text-xs text-[var(--muted)]">{when}</span>
      {action}
    </div>
  );
}

function CallBackButton({
  label,
  pending,
  onClick,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      title={label}
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
  );
}

function DirectRow({
  entry,
  now,
  pending,
  onCall,
}: {
  entry: DirectCallEntry;
  now: number;
  pending: boolean;
  onCall: (profile: HistoryPerson) => void;
}) {
  const missed = entry.outcome === "missed";

  return (
    <Row
      avatar={<Avatar name={entry.counterpart.displayName} src={entry.counterpart.avatarUrl} />}
      title={entry.counterpart.displayName}
      when={formatWhen(entry.at, now)}
      meta={
        <>
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
        </>
      }
      action={
        <CallBackButton
          label={`Call ${entry.counterpart.displayName} back`}
          pending={pending}
          onClick={() => onCall(entry.counterpart)}
        />
      }
    />
  );
}

function GroupRow({ entry, now }: { entry: GroupCallEntry; now: number }) {
  const names = entry.others.map((person) => person.displayName.split(" ")[0]);
  const title =
    names.length <= 2
      ? `Group call with ${names.join(" and ")}`
      : `Group call with ${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;

  return (
    <Row
      avatar={
        // Overlapping faces rather than one, so the row reads as a group at
        // a glance without a separate badge.
        <div className="flex shrink-0 -space-x-3">
          {entry.others.slice(0, 3).map((person) => (
            <div key={person.id} className="rounded-full ring-2 ring-[var(--background)]">
              <Avatar name={person.displayName} src={person.avatarUrl} />
            </div>
          ))}
        </div>
      }
      title={title}
      when={formatWhen(entry.at, now)}
      meta={
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={entry.outcome === "missed" ? "text-red-400" : "text-[var(--muted)]"}
          >
            <path d="M16 20v-1a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v1" />
            <circle cx="9.5" cy="8" r="3" />
            <path d="M21 20v-1a3 3 0 0 0-2.5-3M16 5.5a3 3 0 0 1 0 5" />
          </svg>
          <span className={OUTCOME_TONE[entry.outcome]}>{OUTCOME_COPY[entry.outcome]}</span>
          {entry.durationSeconds !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDuration(entry.durationSeconds)}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{entry.others.length + 1} people</span>
          <span aria-hidden>·</span>
          <span>{entry.languages.map((code) => LANGUAGE_FLAG[code]).join(" ")}</span>
        </>
      }
      // No call-back button: reopening a group call means opening a new room
      // and re-inviting, which is a different action from redialling one
      // person, and belongs to the deliberate "Start a group call" flow.
      action={null}
    />
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
    (profile: HistoryPerson) => {
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
            entry.kind === "group" ? (
              <GroupRow key={entry.id} entry={entry} now={now} />
            ) : (
              <DirectRow
                key={entry.id}
                entry={entry}
                now={now}
                pending={callingId === entry.counterpart.id}
                onCall={callBack}
              />
            )
          ))
        )}
      </Card>
    </section>
  );
}
