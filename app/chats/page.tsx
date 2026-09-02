import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { listThreads } from "@/lib/chat/queries";
import { Avatar } from "@/components/ohun/UserResult";
import { Logo } from "@/components/ohun/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { PushNotificationToggle } from "@/components/ohun/PushNotificationToggle";
import { LANGUAGE_FLAG } from "@/types";

/** Per-user and session-dependent — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default async function ChatsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const threads = await listThreads();

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/85 px-6 py-4 backdrop-blur-md">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            href="/people"
            className="flex h-9 items-center rounded-full border border-[var(--border)] px-4 text-sm font-medium transition-colors hover:border-[var(--accent-border)]"
          >
            People
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Write in {LANGUAGE_FLAG[profile.preferredLanguage]}{" "}
              {profile.preferredLanguage.toUpperCase()} — everyone reads it in their own language.
            </p>
          </div>
          <PushNotificationToggle />
        </div>

        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 2.6a8.4 8.4 0 0 1 9 8.9z" />
              </svg>
            </span>
            <p className="max-w-[280px] text-sm text-[var(--muted)]">
              No conversations yet. Find someone on the People page and start one.
            </p>
            <Link
              href="/people"
              className="flex h-11 items-center rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-on)] transition-transform active:scale-[0.98]"
            >
              Find people
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/chat/${thread.id}`}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-[var(--surface)]"
                >
                  <Avatar name={thread.other.displayName} src={thread.other.avatarUrl} />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold tracking-tight">
                        {thread.other.displayName}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--muted)]">
                        {relativeTime(thread.lastMessageAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                      {thread.previewKind === "voice" && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden>
                          <rect x="9" y="2" width="6" height="12" rx="3" />
                          <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                        </svg>
                      )}
                      <span className="truncate">
                        {thread.preview ?? `Say hello to ${thread.other.displayName.split(" ")[0]}`}
                      </span>
                      <span className="shrink-0">
                        {LANGUAGE_FLAG[thread.other.preferredLanguage]}
                      </span>
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
