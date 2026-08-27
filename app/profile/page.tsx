import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/ohun";
import { ProfileClient } from "./ProfileClient";

/** Per-user — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <Link
            href="/people"
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface)]"
          >
            People
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface)]"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
        <p className="mt-2 mb-8 text-[var(--muted)]">
          This is what other people see when they find you.
        </p>
        <ProfileClient profile={profile} />
      </main>
    </div>
  );
}
