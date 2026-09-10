/**
 * The reference layout's trust-logo row — VISA, Mastercard, Forbes and so
 * on, signalling "real companies rely on this." OHUN has no such
 * partnerships to show, and inventing some would just be lying, so this
 * keeps the row's visual job (a quiet line of wordmarks under the hero)
 * while saying something true: the real infrastructure OHUN is built on.
 */
const STACK = ["AssemblyAI", "Claude", "Supabase", "WebRTC", "Next.js"];

export function TrustRow() {
  return (
    <div className="mx-auto max-w-4xl px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Built on
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {STACK.map((name) => (
          <span
            key={name}
            className="text-lg font-bold tracking-tight text-[var(--muted)] opacity-70 grayscale transition-all hover:text-[var(--foreground)] hover:opacity-100 hover:grayscale-0 sm:text-xl"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
