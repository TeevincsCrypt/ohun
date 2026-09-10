/**
 * The reference layout's feature grid: one visual tile, three colour-graded
 * cards each carrying an oversized, faint watermark icon. Rebuilt here with
 * OHUN's own three real capabilities rather than a fintech's — no card
 * claims anything the product doesn't actually do.
 */
function Watermark({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 opacity-[0.14]"
    >
      {children}
    </svg>
  );
}

const cards = [
  {
    title: "Live voice & video calls",
    body: "Speak naturally. Captions and spoken translation follow you in real time, on either side of the call.",
    background: "var(--foreground)",
    foreground: "var(--background)",
    icon: <path d="M5 9v6M9 5v14M15 7v10M19 10v4" strokeLinecap="round" />,
  },
  {
    title: "Translated chat & voice notes",
    body: "Message anyone with an OHUN account. Every text and voice note arrives already translated, both ways.",
    background: "color-mix(in srgb, var(--accent) 55%, var(--foreground) 20%)",
    foreground: "var(--accent-on)",
    icon: (
      <>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 2.6a8.4 8.4 0 0 1 9 8.9z" />
      </>
    ),
  },
  {
    title: "Group calls, up to 7 people",
    body: "Any mix of languages, one room. Everyone hears everyone else translated into their own.",
    background: "var(--accent-soft)",
    foreground: "var(--foreground)",
    icon: (
      <>
        <path d="M16 20v-1a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v1" />
        <circle cx="9.5" cy="8" r="3" />
        <path d="M21 20v-1a3 3 0 0 0-2.5-3M16 5.5a3 3 0 0 1 0 5" />
      </>
    ),
  },
];

export function FeatureGrid() {
  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-4">
      {/* Visual tile — a waveform, not a stock photo: honest about what
          this product is (a call), not staged. */}
      <div
        className="relative order-first flex min-h-[280px] flex-col justify-end overflow-hidden rounded-3xl p-6 lg:order-none"
        style={{ background: "var(--accent-glow)" }}
      >
        <div aria-hidden className="absolute inset-0 flex items-center justify-center gap-1 opacity-50">
          {[30, 55, 80, 45, 95, 60, 40, 75, 50, 85, 35, 65].map((height, index) => (
            <span
              key={index}
              className="w-2 rounded-full"
              style={{ height: `${height}%`, background: "var(--accent)" }}
            />
          ))}
        </div>
        <p className="relative text-sm font-semibold text-[var(--foreground)]">
          Every call, translated as it happens.
        </p>
      </div>

      {cards.map((card) => (
        <div
          key={card.title}
          className="relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-3xl p-6"
          style={{ background: card.background, color: card.foreground }}
        >
          <Watermark>{card.icon}</Watermark>
          <p className="relative text-lg font-bold leading-snug tracking-tight">{card.title}</p>
          <p className="relative mt-4 text-sm leading-relaxed opacity-80">{card.body}</p>
        </div>
      ))}
    </div>
  );
}
