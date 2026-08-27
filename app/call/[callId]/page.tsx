import { redirect, notFound } from "next/navigation";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, toProfile, type ProfileRow } from "@/lib/supabase/profile";
import { CallRoom } from "@/components/ohun/CallRoom";
import type { Call } from "@/types";

/** Per-user and session-dependent — must never be prerendered at build time. */
export const dynamic = "force-dynamic";

export default async function CallPage({
  params,
}: PageProps<"/call/[callId]">) {
  const { callId } = await params;

  const self = await getCurrentProfile();
  if (!self) redirect("/login");

  const supabase = await createClient();

  // RLS already restricts this to calls the user is party to; the explicit
  // check below turns a filtered-out row into a clear 404 rather than a
  // confusing empty room.
  const { data: callRow } = await supabase
    .from("calls")
    .select(
      "id, caller_id, receiver_id, status, caller_language, receiver_language, created_at, ended_at",
    )
    .eq("id", callId)
    .maybeSingle();

  if (!callRow) notFound();

  const isParty = callRow.caller_id === self.id || callRow.receiver_id === self.id;
  if (!isParty) notFound();

  const otherId = callRow.caller_id === self.id ? callRow.receiver_id : callRow.caller_id;

  const { data: otherRow } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", otherId)
    .maybeSingle();

  if (!otherRow) notFound();

  const call: Call = {
    id: callRow.id,
    callerId: callRow.caller_id,
    receiverId: callRow.receiver_id,
    status: callRow.status,
    callerLanguage: callRow.caller_language,
    receiverLanguage: callRow.receiver_language,
    createdAt: callRow.created_at,
    endedAt: callRow.ended_at,
  };

  const other = toProfile(otherRow as ProfileRow);

  return <CallRoom call={call} self={self} other={other} />;
}
