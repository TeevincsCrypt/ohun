import type { MicState } from "@/types";

const ringByState: Record<MicState, string> = {
  idle: "border-[var(--border)]",
  listening: "border-emerald-500",
  muted: "border-[var(--border)]",
  error: "border-red-500",
};

/**
 * Renders the microphone affordance for a conversation panel. Intentionally
 * non-interactive for now — there is no audio capture wired up yet, so the
 * button stays visibly disabled rather than pretending to toggle a mic that
 * isn't connected to anything.
 */
export function MicButton({ state = "idle" }: { state?: MicState }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled
        aria-disabled
        title="Microphone capture is not connected yet"
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 ${ringByState[state]} bg-[var(--surface)] text-[var(--foreground)] opacity-60 cursor-not-allowed`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
          <path d="M12 18v4" strokeLinecap="round" />
          <path d="M8 22h8" strokeLinecap="round" />
        </svg>
      </button>
      <span className="text-center text-[11px] leading-tight text-[var(--muted)]">
        Mic not connected
      </span>
    </div>
  );
}
