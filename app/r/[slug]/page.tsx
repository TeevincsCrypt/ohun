import { notFound } from "next/navigation";
import { getRoomOwner } from "@/lib/room/actions";
import { getCurrentProfile } from "@/lib/supabase/server";
import { Logo } from "@/components/ohun";
import { RoomJoinClient } from "./RoomJoinClient";

/** Depends on who is asking (signed in or not) — never prerender. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  const owner = await getRoomOwner(slug);
  if (!owner) return { title: "Room not found — OHUN" };

  return {
    title: `Talk to ${owner.displayName} — OHUN`,
    description: `Start a live translated voice call with ${owner.displayName}. Speak your language, they hear theirs.`,
  };
}

export default async function RoomPage({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;

  const owner = await getRoomOwner(slug);
  if (!owner) notFound();

  // Null for a visitor with no account — the join form handles that case
  // by creating a guest identity rather than demanding a signup.
  const self = await getCurrentProfile();

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <Logo />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <RoomJoinClient owner={owner} self={self} slug={slug} />
      </main>
    </div>
  );
}
