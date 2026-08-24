import { Button } from "@/components/ui";
import { LandingNav, HandsBridge, LanguageBadgeRow, Footer } from "@/components/ohun";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12h14" strokeLinecap="round" />
      <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="bg-grain flex flex-1 flex-col">
      <LandingNav />

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-20 pt-20 text-center sm:pt-28">
          <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Speak Freely.
            <br />
            Understand Instantly.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            Real-time voice translation that feels natural. Break language
            barriers in conversations, meetings, and travel — with zero lag.
          </p>
          <div className="mt-9">
            <Button href="/setup" size="lg" icon={<ArrowIcon />}>
              Try Live Demo
            </Button>
          </div>

          <div className="mt-20 w-full max-w-3xl">
            <HandsBridge />
          </div>
        </section>

        {/* Product */}
        <section id="product" className="border-t border-[var(--border)] py-24">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:grid-cols-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Product
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                A conversation, not a translation app.
              </h2>
            </div>
            <div className="sm:col-span-2">
              <p className="text-lg leading-relaxed text-[var(--muted)]">
                OHUN listens as two people speak, transcribes what each person
                says in real time, translates the meaning — not just the
                words — into the other person&apos;s language, and speaks it
                back aloud. No apps to pass back and forth. No typing. Just
                two people talking, each in the language they know best.
              </p>
            </div>
          </div>
        </section>

        {/* Languages */}
        <section id="languages" className="border-t border-[var(--border)] py-24">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 text-center">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Languages
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Starting with four. Built to grow.
              </h2>
            </div>
            <LanguageBadgeRow />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-[var(--border)] py-24">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Pricing
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, usage-based pricing.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[var(--muted)]">
              We&apos;re finalizing plans while the core experience is built.
              Details coming soon.
            </p>
          </div>
        </section>

        {/* Insights */}
        <section id="insights" className="border-t border-[var(--border)] py-24">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Insights
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Field notes on real-time translation.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[var(--muted)]">
              We&apos;ll share what we learn building OHUN here. Nothing
              published yet.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
