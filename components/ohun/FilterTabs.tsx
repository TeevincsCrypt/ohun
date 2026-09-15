export type TranscriptFilter = "both" | "original" | "translated";

const FILTER_LABEL: Record<TranscriptFilter, string> = {
  both: "Both",
  original: "Original only",
  translated: "Translation only",
};

/** Segmented tabs for which languages a transcript shows — always
    visible rather than hidden behind a closed dropdown. */
export function FilterTabs({
  value,
  onChange,
}: {
  value: TranscriptFilter;
  onChange: (next: TranscriptFilter) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
      {(Object.keys(FILTER_LABEL) as TranscriptFilter[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === option
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {FILTER_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
