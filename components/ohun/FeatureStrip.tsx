/**
 * The capability strip along the bottom of the landing page.
 *
 * Claims here are deliberately kept to what OHUN actually does today —
 * the language count tracks CALL_LANGUAGES rather than being a round
 * marketing number, and the encryption line is scoped to the audio, which
 * is the part WebRTC actually secures end to end.
 */
import { CALL_LANGUAGES } from "@/types";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)]">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

const features = [
  {
    title: "Real-time voice translation",
    detail: "Speak naturally",
    icon: <path d="M5 9v6M9 5v14M15 7v10M19 10v4" />,
  },
  {
    title: `${CALL_LANGUAGES.length} languages on calls`,
    detail: "More coming",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
      </>
    ),
  },
  {
    title: "Encrypted audio",
    detail: "Peer-to-peer WebRTC",
    icon: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  {
    title: "Live captions",
    detail: "Both languages, always",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 11h4M7 15h2M14 11h3M13 15h4" />
      </>
    ),
  },
  {
    title: "No app to install",
    detail: "Works in the browser",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
];

export function FeatureStrip() {
  return (
    <section className="border-t border-[var(--border)]">
      <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-7 px-6 py-12 sm:grid-cols-2 lg:grid-cols-5">
        {features.map((feature) => (
          <div key={feature.title} className="flex items-center gap-3.5">
            <Icon>{feature.icon}</Icon>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight tracking-tight">{feature.title}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{feature.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
