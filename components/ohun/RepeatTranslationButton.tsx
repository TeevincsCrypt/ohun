export function RepeatTranslationButton() {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      title="Available once translated speech playback is implemented"
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] opacity-60 cursor-not-allowed"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 1 1 2.6 6.3" strokeLinecap="round" />
        <path d="M3 21v-6h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Repeat translation
    </button>
  );
}
