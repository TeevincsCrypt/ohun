import { Button } from "@/components/ui";
import {
  LandingNav,
  LanguageBadgeRow,
  Footer,
  TrustRow,
  FeatureGrid,
  StepsBand,
  HeroIllustration,
} from "@/components/ohun";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12h14" strokeLinecap="round" />
      <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 items-center justify-center rounded-full"
      style={{ background: "var(--accent)", color: "var(--accent-on)" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </span>
  );
}

const heroTags = [
  "Live translation",
  "Voice & video calls",
  "Group calls",
  "Chat",
  "Voice notes",
  "Room links",
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <LandingNav />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-20 pt-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-8">
          <div>
            <h1 className="animate-rise text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Your bridge to{" "}
              <span className="text-[var(--accent)]">every conversation</span>
            </h1>

            <p className="animate-rise mt-6 max-w-lg text-lg leading-relaxed text-[var(--muted)]">
              Speak, message, or call — in your own language. OHUN translates it live and speaks
              it aloud in theirs, so the conversation stays a conversation.
            </p>

            <div className="animate-rise mt-8 flex flex-wrap items-center gap-4">
              <Button href="/signup" size="lg" icon={<ArrowIcon />}>
                Start free
              </Button>
              <Button href="/conversation" variant="ghost" size="lg" className="pl-1">
                <PlayIcon />
                Try the live demo
              </Button>
            </div>

            <div className="animate-rise mt-9 h-px w-full max-w-md bg-[var(--border)]" />

            <div className="animate-rise mt-6 flex flex-wrap gap-2">
              {heroTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs font-medium text-[var(--muted)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-rise">
            <HeroIllustration />
          </div>
        </section>

        <TrustRow />

        {/* Features */}
        <section id="features" className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <SectionLabel>Features</SectionLabel>
                <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                  Everything a real conversation needs,{" "}
                  <span className="text-[var(--accent)]">nothing it doesn&apos;t</span>.
                </h2>
              </div>
              <p className="max-w-xs text-sm text-[var(--muted)] sm:text-right">
                One account. Chat, calls, and group calls — every language translated
                automatically.
              </p>
            </div>

            <div className="mt-12">
              <FeatureGrid />
            </div>
          </div>
        </section>

        <StepsBand />

        {/* How it works */}
        <section id="how-it-works" className="border-t border-[var(--border)] py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col items-center text-center">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                A conversation, not a translation app.
              </h2>
              <p className="mt-4 max-w-xl text-[var(--muted)]">
                No apps passed back and forth. No typing required. Two people talking, each in
                the language they know best.
              </p>
            </div>

            <div className="mt-12 w-full max-w-4xl mx-auto card-lit overflow-hidden rounded-3xl p-5 sm:p-7">
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
                  <p className="mt-1.5 font-medium leading-snug text-[var(--peer)]">
                    Tu viens d&apos;où ?
                  </p>
                </div>
              </div>
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
                Chat and voice notes work in every language below. Calls run on the six our
                speech models handle reliably today — more follow as they get there.
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
                whoever opens it can call you straight away, in their own language, without
                making an account.
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
            <p className="mt-3 text-sm text-[var(--muted)]">Try it free. No card required.</p>
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
