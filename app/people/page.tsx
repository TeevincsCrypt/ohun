import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { PeopleClient } from "./PeopleClient";
import { Logo } from "@/components/ohun";
import { LanguageTag } from "@/components/ohun/UserResult";

/** Per-user and session-dependent — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{profile.displayName}</p>
            <p className="text-xs text-[var(--muted)]">
              @{profile.username} · <LanguageTag code={profile.preferredLanguage} />
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface)]"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">People</h1>
        <p className="mt-2 mb-8 text-[var(--muted)]">
          Find someone by username and start a conversation in your own language.
        </p>
        <PeopleClient self={profile} />
      </main>
    </div>
  );
}
