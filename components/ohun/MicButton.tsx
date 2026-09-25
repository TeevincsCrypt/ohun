import type { MicState } from "@/types";

const ringByState: Record<MicState, string> = {
  disconnected: "border-[var(--border)]",
  connecting: "border-amber-500",
  listening: "border-emerald-500",
  error: "border-red-500",
};

const captionByState: Record<MicState, string> = {
  disconnected: "Tap to speak",
  connecting: "Connecting…",
  listening: "Listening — tap to stop",
  error: "Tap to try again",
};

const micIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
    <path d="M12 18v4" strokeLinecap="round" />
    <path d="M8 22h8" strokeLinecap="round" />
  </svg>
);

interface MicButtonProps {
  state?: MicState;
  /** Omit to render the inert, disconnected placeholder (used for Person B in this phase). */
  onClick?: () => void;
}

export function MicButton({ state = "disconnected", onClick }: MicButtonProps) {
  const interactive = Boolean(onClick);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-disabled={!interactive}
        title={interactive ? captionByState[state] : "Microphone capture is not connected yet"}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 ${ringByState[state]} bg-[var(--surface)] text-[var(--foreground)] transition-opacity ${
          interactive ? "cursor-pointer hover:opacity-90" : "opacity-60 cursor-not-allowed"
        }`}
      >
        {interactive && state === "listening" && (
          <span className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-pulse-ring" />
        )}
        {micIcon}
      </button>
      <span className="text-center text-[11px] leading-tight text-[var(--muted)]">
        {interactive ? captionByState[state] : "Mic not connected"}
      </span>
    </div>
  );
}
