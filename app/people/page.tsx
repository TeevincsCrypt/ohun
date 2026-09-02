import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { PeopleClient } from "./PeopleClient";
import { Logo } from "@/components/ohun";
import { Avatar, LanguageTag } from "@/components/ohun/UserResult";
import { getCallLanguage } from "@/types";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/** Per-user and session-dependent — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* Sticky so the identity and log-out stay reachable once the
          recent-calls list makes the page scroll. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/85 px-6 py-4 backdrop-blur-md">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-full py-1 pl-3 pr-1 transition-colors hover:bg-[var(--surface)]"
          >
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{profile.displayName}</p>
              <p className="text-xs leading-tight text-[var(--muted)]">
                @{profile.username} · <LanguageTag code={profile.preferredLanguage} />
              </p>
            </div>
            <Avatar name={profile.displayName} src={profile.avatarUrl} />
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Log out"
              title="Log out"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 pb-16 pt-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Talk to anyone,{" "}
          <span className="text-[var(--accent)]">in any language</span>
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Speak {getCallLanguage(profile.preferredLanguage)?.label ?? "your language"} — they hear
          their own, translated live.
        </p>

        {/* The room link is the low-friction way in for anyone who is not
            already on OHUN, so it belongs on the main surface, not buried
            in settings. */}
        <Link
          href="/profile"
          className="mt-4 mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition-opacity hover:opacity-85"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
          </svg>
          Share your room link — no account needed to call you
        </Link>
        <PeopleClient self={profile} />
      </main>
    </div>
  );
}
