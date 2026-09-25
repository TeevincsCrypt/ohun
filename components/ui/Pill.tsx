import type { ReactNode } from "react";

type Tone = "neutral" | "live" | "warning" | "error" | "muted";

const tones: Record<Tone, string> = {
  neutral: "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]",
  live: "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  error: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
  muted: "border-[var(--border)] text-[var(--muted)]",
};

export function Pill({
  children,
  tone = "neutral",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-tight ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
