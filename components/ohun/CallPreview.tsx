/**
 * A still of the call UI for the landing hero.
 *
 * Deliberately static and self-contained: it needs no microphone, no
 * session and no network, so the marketing page stays a fast static
 * render. The sample exchange is representative of a real call, and the
 * layout mirrors the live room so what people see here is what they get.
 */
function Bars({ color, seed }: { color: string; seed: number[] }) {
  return (
    <span className="flex h-8 items-center gap-[3px]" aria-hidden>
      {seed.map((height, index) => (
        <span
          key={index}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: color, height: `${height}%`, opacity: 0.35 + height / 160 }}
        />
      ))}
    </span>
  );
}

const LEFT = [22, 48, 70, 96, 62, 84, 40, 66, 90, 52, 30, 74, 44, 20];
const RIGHT = [18, 40, 66, 88, 54, 76, 34, 60, 82, 46, 26, 68, 38, 16];

function Face({ initial, color, glow }: { initial: string; color: string; glow: string }) {
  return (
    <span className="relative flex shrink-0 items-center justify-center">
      <span
        aria-hidden
        className="absolute h-[104px] w-[104px] rounded-full"
        style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 68%)` }}
      />
      <span
        aria-hidden
        className="absolute h-[84px] w-[84px] rounded-full border-2"
        style={{ borderColor: color }}
      />
      <span
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-2xl font-semibold"
        style={{ color }}
      >
        {initial}
      </span>
    </span>
  );
}

export function CallPreview() {
  return (
    <div className="card-lit overflow-hidden rounded-3xl p-5 sm:p-7">
      {/* status row */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          Speaking
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--muted)]">
          08:42
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--peer-border)] bg-[var(--peer-soft)] px-3 py-1.5 text-xs font-medium text-[var(--peer)]">
          Listening
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--peer)]" />
        </span>
      </div>

      {/* stage */}
      <div className="mt-7 flex items-center justify-center gap-2 sm:gap-4">
        <Bars color="var(--accent)" seed={LEFT} />
        <Face initial="T" color="var(--accent)" glow="var(--accent-glow)" />
        <Bars color="var(--accent)" seed={LEFT.slice(0, 8)} />

        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--surface)]"
          aria-hidden
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
            <path d="M5 9v6M9 5v14M15 7v10M19 10v4" />
          </svg>
        </span>

        <Bars color="var(--peer)" seed={RIGHT.slice(0, 8)} />
        <Face initial="M" color="var(--peer)" glow="var(--peer-glow)" />
        <Bars color="var(--peer)" seed={RIGHT} />
      </div>

      {/* names */}
      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-4 text-center">
        <div>
          <p className="text-base font-bold tracking-tight sm:text-lg">Teevincs</p>
          <p className="text-xs text-[var(--muted)]">🇬🇧 English</p>
        </div>
        <div className="flex flex-col items-center gap-1 pt-1">
          <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium text-[var(--accent)]">
            Translating…
          </span>
          <span className="text-[11px]">
            <span className="text-[var(--accent)]">English</span>
            <span className="mx-1 text-[var(--muted)]">→</span>
            <span className="text-[var(--peer)]">French</span>
          </span>
        </div>
        <div>
          <p className="text-base font-bold tracking-tight sm:text-lg">Marie</p>
          <p className="text-xs text-[var(--muted)]">🇫🇷 Français</p>
        </div>
      </div>

      {/* utterance pair */}
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
          <p className="text-[11px] font-medium text-[var(--muted)]">🇬🇧 You said</p>
          <p className="mt-1.5 font-medium leading-snug text-[var(--accent)]">
            Where are you from?
          </p>
        </div>
        <span aria-hidden className="hidden text-[var(--muted)] sm:block">
          →
        </span>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left">
          <p className="text-[11px] font-medium text-[var(--muted)]">🇫🇷 Marie hears</p>
          <p className="mt-1.5 font-medium leading-snug text-[var(--peer)]">Tu viens d&apos;où ?</p>
        </div>
      </div>
    </div>
  );
}
