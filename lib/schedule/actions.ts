"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { startCall } from "@/lib/calls/actions";
import type { ScheduledCall, ScheduledCallStatus } from "@/types";

export interface ScheduleResult {
  scheduledId?: string;
  error?: string;
}

/** Furthest ahead a call may be booked. Keeps the list meaningful. */
const MAX_LEAD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Books a call for later. The organizer is taken from the session, never
 * from client input, so nobody can schedule on someone else's behalf.
 */
export async function scheduleCall(
  inviteeId: string,
  scheduledAt: string,
  note: string,
): Promise<ScheduleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be logged in to schedule a call." };
  if (user.id === inviteeId) return { error: "You can't schedule a call with yourself." };

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return { error: "Pick a valid date and time." };
  if (when.getTime() < Date.now()) return { error: "Pick a time in the future." };
  if (when.getTime() > Date.now() + MAX_LEAD_MS) {
    return { error: "Schedule within the next 90 days." };
  }

  const trimmedNote = note.trim();
  if (trimmedNote.length > 280) return { error: "Keep the note under 280 characters." };

  const { data: invitee } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", inviteeId)
    .maybeSingle();

  if (!invitee) return { error: "Could not find that person." };

  const { data, error } = await supabase
    .from("scheduled_calls")
    .insert({
      organizer_id: user.id,
      invitee_id: inviteeId,
      scheduled_at: when.toISOString(),
      note: trimmedNote || null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not schedule that call." };

  revalidatePath("/people");
  return { scheduledId: data.id as string };
}

/** Either party may call this off. */
export async function cancelScheduledCall(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("scheduled_calls")
    .update({ status: "cancelled" satisfies ScheduledCallStatus })
    .eq("id", id);

  if (error) return { error: "Could not cancel that." };

  revalidatePath("/people");
  return {};
}

/**
 * Turns a booking into a live call. Places the call through the normal
 * path so ringing, language snapshotting and RLS all behave identically to
 * dialling from People, then links the two rows.
 */
export async function startScheduledCall(
  id: string,
): Promise<{ callId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: booking } = await supabase
    .from("scheduled_calls")
    .select("id, organizer_id, invitee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!booking) return { error: "That scheduled call no longer exists." };
  if (booking.status !== "pending") return { error: "That call is no longer scheduled." };

  const isParty = booking.organizer_id === user.id || booking.invitee_id === user.id;
  if (!isParty) return { error: "That isn't your scheduled call." };

  const otherId = booking.organizer_id === user.id ? booking.invitee_id : booking.organizer_id;

  const { callId, error } = await startCall(otherId);
  if (error || !callId) return { error: error ?? "Could not start the call." };

  await supabase
    .from("scheduled_calls")
    .update({ status: "started" satisfies ScheduledCallStatus, call_id: callId })
    .eq("id", id);

  revalidatePath("/people");
  return { callId };
}

interface ScheduledRow {
  id: string;
  organizer_id: string;
  invitee_id: string;
  scheduled_at: string;
  note: string | null;
  status: ScheduledCallStatus;
  call_id: string | null;
  created_at: string;
}

/** Upcoming bookings for the signed-in user, soonest first. */
export async function listScheduledCalls(): Promise<ScheduledCall[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Keep recently-passed bookings visible so a late join still works.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data } = await supabase
    .from("scheduled_calls")
    .select("id, organizer_id, invitee_id, scheduled_at, note, status, call_id, created_at")
    .eq("status", "pending")
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  const rows = (data ?? []) as ScheduledRow[];
  if (rows.length === 0) return [];

  const counterpartIds = rows.map((row) =>
    row.organizer_id === user.id ? row.invitee_id : row.organizer_id,
  );

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username, display_name, preferred_language, avatar_url")
    .in("id", counterpartIds);

  const byId = new Map(
    (profileRows ?? []).map((row) => [
      row.id as string,
      {
        id: row.id as string,
        username: row.username as string,
        displayName: row.display_name as string,
        preferredLanguage:
          row.preferred_language as ScheduledCall["counterpart"]["preferredLanguage"],
        avatarUrl: (row.avatar_url as string | null) ?? null,
      },
    ]),
  );

  return rows.flatMap((row) => {
    const organizedBySelf = row.organizer_id === user.id;
    const counterpart = byId.get(organizedBySelf ? row.invitee_id : row.organizer_id);
    // A deleted account leaves an orphan booking — skip rather than crash.
    if (!counterpart) return [];

    return [
      {
        id: row.id,
        organizerId: row.organizer_id,
        inviteeId: row.invitee_id,
        scheduledAt: row.scheduled_at,
        note: row.note,
        status: row.status,
        callId: row.call_id,
        createdAt: row.created_at,
        counterpart,
        organizedBySelf,
      },
    ];
  });
}
