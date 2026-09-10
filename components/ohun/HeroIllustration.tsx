/**
 * The hero graphic: two overlapping "cards" inside a dotted ring, a small
 * floating detail card, and a circular badge — the same composition as a
 * fintech hero's stacked payment cards, built from what OHUN actually shows
 * on a call instead: a translated caption card and a live-captioning card.
 */
export function HeroIllustration() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      {/* Dotted ring, same role as the circular guide behind the reference's
          card stack — pure backdrop, no content of its own. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--border)]"
      />
      <div
        aria-hidden
        className="absolute inset-[10%] rounded-full border border-[var(--border)] opacity-60"
      />

      {/* Ambient glow so the cards read as lit rather than flat. */}
      <div
        aria-hidden
        className="glow-field left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 opacity-70"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
      />

      {/* Small floating detail card — top-left, like the reference's
          "Statistics" card sitting in front of the main stack. */}
      <div
        aria-hidden
        className="card-lit animate-rise absolute left-[2%] top-[14%] z-20 w-[42%] rounded-2xl bg-[var(--background)] p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]"
        style={{ animationDelay: "180ms" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Live captions
        </p>
        <p className="mt-1.5 text-xs font-medium leading-snug">
          &ldquo;Tu viens d&apos;où ?&rdquo;
        </p>
        <div className="mt-2 flex items-center gap-1" aria-hidden>
          {[6, 12, 8, 16, 10, 14, 7].map((height, index) => (
            <span
              key={index}
              className="w-[3px] rounded-full bg-[var(--accent)]"
              style={{ height, opacity: 0.4 + height / 24 }}
            />
          ))}
        </div>
      </div>

      {/* Back card — dark, the OHUN call itself: two names, a flag pair,
          the fact of translation. Plays the role of the reference's
          larger, further-back payment card. */}
      <div
        className="card-lit animate-rise absolute right-[4%] top-[8%] z-10 w-[70%] rounded-3xl p-5 text-[var(--background)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.4)]"
        style={{ background: "var(--foreground)", animationDelay: "60ms" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-tight opacity-70">On a call</span>
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--accent-strong, #bef264)" }}>
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent-strong, #bef264)" }}
            />
            Live
          </span>
        </div>
        <p className="mt-6 text-lg font-bold tracking-tight">Teevincs</p>
        <p className="mt-0.5 text-xs opacity-60">🇬🇧 English → 🇫🇷 Français</p>
        <p className="mt-5 text-sm font-medium leading-snug opacity-90">
          &ldquo;Where are you from?&rdquo;
        </p>
      </div>

      {/* Front card — the accent-filled one, overlapping the dark card the
          way the reference's lime card sits in front of the dark one. */}
      <div
        className="card-lit animate-rise absolute bottom-[10%] left-[6%] z-20 w-[62%] rounded-3xl p-5"
        style={{ background: "var(--accent)", color: "var(--accent-on)", animationDelay: "120ms" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-tight opacity-80">Marie hears</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 9v6M9 5v14M15 7v10M19 10v4" />
          </svg>
        </div>
        <p className="mt-6 text-base font-bold leading-snug tracking-tight">
          &ldquo;Tu viens d&apos;où ?&rdquo;
        </p>
        <p className="mt-4 text-xs font-medium opacity-70">Spoken aloud, in her language</p>
      </div>

      {/* Small circular badge, bottom-right — the reference's floating
          wallet-icon circle. Here it's just the mark. */}
      <div
        aria-hidden
        className="animate-rise absolute bottom-[6%] right-[6%] z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-[0_10px_28px_-8px_var(--accent-glow)]"
        style={{ background: "var(--accent)", animationDelay: "220ms" }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" role="presentation">
          <path
            d="M 24.656 23.263 A 11.3 11.3 0 1 1 25.786 10.35"
            stroke="var(--accent-on)"
            strokeWidth="4.4"
            strokeLinecap="round"
          />
          <path
            d="M 11.251 12.015 A 6.2 6.2 0 1 1 10.631 19.1"
            stroke="var(--accent-on)"
            strokeWidth="3.1"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      </div>
    </div>
  );
}
