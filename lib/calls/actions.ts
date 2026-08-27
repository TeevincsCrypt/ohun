"use server";

import { createClient } from "@/lib/supabase/server";
import { isCallLanguage, type CallStatus } from "@/types";

export interface StartCallResult {
  callId?: string;
  error?: string;
}

/**
 * Places a call. The caller is taken from the session, never from client
 * input, so a client cannot dial as someone else. RLS enforces the same
 * rule at the database level.
 */
export async function startCall(receiverId: string): Promise<StartCallResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be logged in to place a call." };
  if (user.id === receiverId) return { error: "You can't call yourself." };

  const { data: parties, error: partiesError } = await supabase
    .from("profiles")
    .select("id, preferred_language")
    .in("id", [user.id, receiverId]);

  if (partiesError || !parties || parties.length !== 2) {
    return { error: "Could not find that person." };
  }

  const caller = parties.find((p) => p.id === user.id);
  const receiver = parties.find((p) => p.id === receiverId);

  if (!caller || !receiver) return { error: "Could not find that person." };
  if (!isCallLanguage(caller.preferred_language) || !isCallLanguage(receiver.preferred_language)) {
    return { error: "One of you has an unsupported language set." };
  }

  // Clear any of this caller's stale ringing calls so a refresh mid-ring
  // doesn't leave a zombie invitation on the other side.
  await supabase
    .from("calls")
    .update({ status: "ended" satisfies CallStatus, ended_at: new Date().toISOString() })
    .eq("caller_id", user.id)
    .in("status", ["ringing", "accepted", "connected"]);

  const { data, error } = await supabase
    .from("calls")
    .insert({
      caller_id: user.id,
      receiver_id: receiverId,
      status: "ringing" satisfies CallStatus,
      caller_language: caller.preferred_language,
      receiver_language: receiver.preferred_language,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not start the call." };

  return { callId: data.id as string };
}

/**
 * Moves a call to a new status. RLS restricts updates to the two parties,
 * and only the receiver may accept or decline — that is what stops a third
 * party (or the caller) answering on someone's behalf.
 */
export async function setCallStatus(
  callId: string,
  status: Extract<CallStatus, "accepted" | "declined" | "connected" | "ended" | "failed">,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data: call, error: readError } = await supabase
    .from("calls")
    .select("id, caller_id, receiver_id, status")
    .eq("id", callId)
    .maybeSingle();

  if (readError || !call) return { error: "That call no longer exists." };

  const isCaller = call.caller_id === user.id;
  const isReceiver = call.receiver_id === user.id;
  if (!isCaller && !isReceiver) return { error: "That isn't your call." };

  if ((status === "accepted" || status === "declined") && !isReceiver) {
    return { error: "Only the person being called can answer." };
  }

  const patch: Record<string, unknown> = { status };
  if (status === "declined" || status === "ended" || status === "failed") {
    patch.ended_at = new Date().toISOString();
  }

  const { error } = await supabase.from("calls").update(patch).eq("id", callId);
  if (error) return { error: "Could not update the call." };

  return {};
}

/** Heartbeat backing the online indicator. */
export async function touchPresence(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id);
}
