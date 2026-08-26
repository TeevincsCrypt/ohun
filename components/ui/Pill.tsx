import type { ReactNode } from "react";

type Tone = "neutral" | "live" | "warning" | "error" | "muted";

const tones: Record<Tone, string> = {
  neutral: "border-[var(--border)] text-[var(--foreground)]",
  live: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  error: "border-red-500/30 text-red-600 dark:text-red-400",
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
