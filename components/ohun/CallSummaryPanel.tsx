"use client";

import { useEffect, useState } from "react";
import { summariseCall, type CallRef } from "@/lib/summary/actions";
import { Button } from "@/components/ui";
import { LANGUAGE_FLAG, getCallLanguage, type CallLanguageCode, type CallSummary } from "@/types";

/**
 * Shown once a call has ended: a recap of what was discussed, in the
 * reader's own language.
 *
 * Generated on first view rather than when the call ends, because whoever
 * hangs up first would otherwise have to stay on the page long enough for
 * the request to finish. The result is stored, so the second person to look
 * reads the same summary rather than paying for another one.
 */
export function CallSummaryPanel({
  callRef,
  myLanguage,
  onDone,
  doneLabel = "Back to People",
}: {
  callRef: CallRef;
  myLanguage: CallLanguageCode;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");

  useEffect(() => {
    let cancelled = false;

    void summariseCall(callRef)
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
        setState(result ? "ready" : "none");
      })
      .catch(() => {
        if (!cancelled) setState("none");
      });

    return () => {
      cancelled = true;
    };
    // callRef is a fresh object each render; the ids inside it are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callRef.callId, callRef.roomId]);

  // Falls back to any language present when nothing was written in the
  // reader's own — better a summary they can partly follow than none.
  const text =
    summary?.byLanguage[myLanguage] ?? Object.values(summary?.byLanguage ?? {})[0] ?? null;
  const shownIn = summary?.byLanguage[myLanguage]
    ? myLanguage
    : (Object.keys(summary?.byLanguage ?? {})[0] as CallLanguageCode | undefined);

  return (
    <div className="card-lit animate-rise mx-auto w-full max-w-lg rounded-3xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
        Call ended
      </p>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">What was discussed</h1>

      {state === "loading" && (
        <div className="mt-6 flex items-center gap-3 text-sm text-[var(--muted)]">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
          />
          Writing your summary…
        </div>
      )}

      {state === "none" && (
        <p className="mt-4 text-sm text-[var(--muted)]">
          That call was too short to summarise. Nothing was recorded beyond the transcript you
          already saw.
        </p>
      )}

      {state === "ready" && text && (
        <>
          {shownIn && shownIn !== myLanguage && (
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
              Shown in {getCallLanguage(shownIn)?.label} — no {getCallLanguage(myLanguage)?.label}{" "}
              version was written.
            </p>
          )}
          <div className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--foreground)]">
            {text}
          </div>
          {shownIn && (
            <p className="mt-5 text-xs text-[var(--muted)]">
              {LANGUAGE_FLAG[shownIn]} Written from what each person actually said, in their own
              language.
            </p>
          )}
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={onDone}>{doneLabel}</Button>
        {state === "ready" && text && (
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(text).catch(() => {})}
            className="h-11 rounded-full border border-[var(--border)] px-5 text-sm font-medium transition-colors hover:bg-[var(--surface)]"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}
