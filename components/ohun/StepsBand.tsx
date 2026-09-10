/**
 * The reference layout's full-bleed bright band: a dark app-style mock on
 * one side, a numbered walkthrough on the other. Built here from OHUN's
 * actual three-step loop (speak → translate → hear it) rather than a
 * wallet balance screen.
 */
const steps = [
  {
    title: "You speak",
    body: "Talk normally. OHUN transcribes your side as you go, in your own language.",
    icon: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
        <path d="M12 18v4" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "OHUN translates",
    body: "Each finished sentence is translated for meaning, not word by word, into their language.",
    icon: <path d="M5 9v6M9 5v14M15 7v10M19 10v4" strokeLinecap="round" />,
  },
  {
    title: "They hear it",
    body: "The translation is spoken aloud on their device and captioned for both of you.",
    icon: (
      <>
        <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
        <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
      </>
    ),
  },
];

function MockCall() {
  return (
    <div
      className="rounded-3xl p-6 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.45)] sm:p-8"
      style={{ background: "var(--foreground)", color: "var(--background)" }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium opacity-70">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent-strong, #bef264)" }}
          />
          On a call
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums opacity-60">04:12</span>
      </div>

      <p className="mt-8 text-xs opacity-50">Available Total Translated</p>
      <p className="mt-1 text-4xl font-bold tracking-tight">EN → FR</p>

      <div className="mt-8 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] font-medium opacity-50">Marie hears</p>
        <p className="mt-1.5 text-sm font-medium leading-snug">
          &ldquo;Tu viens d&apos;où ?&rdquo;
        </p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/20 opacity-70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
          </svg>
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current/20 opacity-70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
          </svg>
        </span>
        <span
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: "var(--danger, #f87171)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--background)">
            <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
          </svg>
        </span>
      </div>
    </div>
  );
}

export function StepsBand() {
  return (
    <section className="bg-grain" style={{ background: "var(--accent)" }}>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2">
        <MockCall />

        <div>
          <h2
            className="max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
            style={{ color: "var(--accent-on)" }}
          >
            Start talking in 3 easy steps
          </h2>

          <div className="mt-9 flex flex-col gap-6">
            {steps.map((step, index) => (
              <div key={step.title} className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: "var(--accent-on)", color: "var(--accent)" }}
                >
                  {index + 1}
                </span>
                <p className="pt-2 text-sm leading-relaxed" style={{ color: "var(--accent-on)" }}>
                  <span className="font-semibold">{step.title}.</span>{" "}
                  <span className="opacity-80">{step.body}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
