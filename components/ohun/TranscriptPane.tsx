export function TranscriptPane({
  label,
  value,
  emptyHint,
}: {
  label: string;
  value?: string;
  emptyHint: string;
}) {
  return (
    <div className="flex min-h-32 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {value ? (
        <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
          {value}
        </p>
      ) : (
        <p className="flex flex-1 items-center text-sm italic text-[var(--muted)]">{emptyHint}</p>
      )}
    </div>
  );
}
