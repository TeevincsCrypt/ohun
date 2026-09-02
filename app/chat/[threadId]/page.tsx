import { redirect, notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { loadThread } from "@/lib/chat/queries";
import { ChatRoom } from "@/components/ohun/ChatRoom";

/** Per-user and session-dependent — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

/**
 * Server Actions inherit this page's limit, and sending a message is the
 * slowest thing this app does: a voice note is transcribed and then
 * translated before the action returns. At the 10-second default the
 * function was being killed partway — after the message row was written
 * but before its translations were — which is exactly a message arriving
 * and staying untranslated forever.
 */
export const maxDuration = 60;

export default async function ChatPage({ params }: PageProps<"/chat/[threadId]">) {
  const { threadId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // RLS already hides a thread this user is not in, so "no rows" and "not
  // yours" arrive as the same answer — both are a 404 here.
  const thread = await loadThread(threadId);
  if (!thread) notFound();

  return (
    <ChatRoom
      threadId={thread.threadId}
      self={thread.self}
      other={thread.other}
      initialMessages={thread.messages}
    />
  );
}
