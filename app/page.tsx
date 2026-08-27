import { Button } from "@/components/ui";
import {
  LandingNav,
  LanguageBadgeRow,
  Footer,
  FeatureStrip,
  CallPreview,
} from "@/components/ohun";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12h14" strokeLinecap="round" />
      <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </span>
  );
}

const steps = [
  {
    number: "01",
    title: "You speak",
    body: "Talk normally. OHUN transcribes your side as you go, in your own language.",
  },
  {
    number: "02",
    title: "OHUN translates",
    body: "Each finished sentence is translated for meaning, not word by word, into their language.",
  },
  {
    number: "03",
    title: "They hear it",
    body: "The translation is spoken aloud on their device and captioned for both of you.",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Ambient light behind the hero. */}
      <div
        aria-hidden
        className="glow-field left-1/2 top-[-140px] h-[520px] w-[900px] -translate-x-1/2 opacity-45"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 68%)" }}
      />

      <LandingNav />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-16 pt-16 text-center sm:pt-24">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Real-time voice translation
          </span>

          <h1 className="animate-rise mt-7 max-w-4xl text-[2.6rem] font-bold leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-[var(--accent)]">Feels</span> like a call.
            <br />
            Works like a <span className="text-[var(--accent)]">translator</span>.
          </h1>

          <p className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            Two people, two languages, one conversation. Speak the way you always do — OHUN
            translates it live and speaks it aloud in theirs.
          </p>

          <div className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button href="/signup" size="lg" icon={<ArrowIcon />}>
              Start free
            </Button>
            <Button href="/conversation" variant="outline" size="lg">
              Try the live demo
            </Button>
          </div>

          <p className="mt-4 text-xs text-[var(--muted)]">
            No card required · The demo runs in your browser, no account needed
          </p>

          <div className="animate-rise mt-16 w-full max-w-4xl">
            <CallPreview />
          </div>
        </section>

        <FeatureStrip />

        {/* How it works */}
        <section id="product" className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col items-center text-center">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                A conversation, not a translation app.
              </h2>
              <p className="mt-4 max-w-xl text-[var(--muted)]">
                No apps passed back and forth. No typing. Two people talking, each in the language
                they know best.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="card-lit rounded-2xl p-6">
                  <span className="font-mono text-sm font-semibold text-[var(--accent)]">
                    {step.number}
                  </span>
                  <h3 className="mt-3 text-lg font-bold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Languages */}
        <section id="languages" className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-6 text-center">
            <div className="flex flex-col items-center">
              <SectionLabel>Languages</SectionLabel>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Starting small. Built to grow.
              </h2>
              <p className="mt-4 max-w-md text-[var(--muted)]">
                Calls run on the languages our speech models handle reliably today. More follow as
                they get there.
              </p>
            </div>
            <LanguageBadgeRow />
          </div>
        </section>

        {/* Room links */}
        <section className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-2">
            <div>
              <SectionLabel>Room links</SectionLabel>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                One link. Anyone can reach you.
              </h2>
              <p className="mt-4 text-[var(--muted)]">
                Every account gets a shareable room link. Put it in your bio or your signature —
                whoever opens it can call you straight away, in their own language, without making
                an account.
              </p>
              <div className="mt-7">
                <Button href="/signup" size="md" icon={<ArrowIcon />}>
                  Claim your link
                </Button>
              </div>
            </div>

            <div className="card-lit rounded-2xl p-6">
              <p className="text-xs font-medium text-[var(--muted)]">Your room link</p>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <code className="min-w-0 flex-1 truncate font-mono text-sm">
                  ohun.app/r/<span className="text-[var(--accent)]">kp3nx7qw2m</span>
                </code>
                <span className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                  Copy
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                Rotate it whenever you like — the old link stops working the moment you do.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto flex max-w-6xl flex-col items-center px-6 text-center">
            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Free while we build.
            </h2>
            <p className="mt-4 max-w-md text-[var(--muted)]">
              OHUN is in preview and calls are unlimited. Paid plans arrive once the core
              experience is finished.
            </p>
            <div className="mt-8">
              <Button href="/signup" size="lg" icon={<ArrowIcon />}>
                Start free
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
