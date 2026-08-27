"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_ROOM_PARTICIPANTS,
  isCallLanguage,
  type CallLanguageCode,
  type ParticipantState,
  type Room,
  type RoomParticipant,
  type RoomStatus,
} from "@/types";

export interface RoomResult {
  roomId?: string;
  error?: string;
}

interface ParticipantRow {
  user_id: string;
  language: CallLanguageCode;
  state: ParticipantState;
  invited_by: string | null;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

function toParticipant(row: ParticipantRow): RoomParticipant | null {
  // A participant whose profile has been deleted leaves an orphan row.
  if (!row.profiles) return null;
  return {
    userId: row.user_id,
    language: row.language,
    state: row.state,
    invitedBy: row.invited_by,
    profile: {
      id: row.profiles.id,
      username: row.profiles.username,
      displayName: row.profiles.display_name,
      avatarUrl: row.profiles.avatar_url,
    },
  };
}

/**
 * Opens a group call and seats the creator.
 *
 * The host's own language is snapshotted here, exactly as a direct call
 * snapshots caller_language, so a profile edit mid-call cannot change what
 * the room is translating into.
 */
export async function createRoom(): Promise<RoomResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to start a call." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  const language = profile?.preferred_language;
  if (!isCallLanguage(language)) return { error: "Your language isn't supported on calls." };

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .insert({ host_id: user.id })
    .select("id")
    .single();

  if (roomError || !room) return { error: "Could not start the call." };

  const { error: seatError } = await supabase.from("room_participants").insert({
    room_id: room.id,
    user_id: user.id,
    language,
    state: "joined" satisfies ParticipantState,
    joined_at: new Date().toISOString(),
  });

  if (seatError) return { error: "Could not start the call." };

  return { roomId: room.id as string };
}

/**
 * Invites someone into a live room.
 *
 * The seven-person cap is enforced by a database trigger, not here — a
 * check in this function would race two people inviting at once. The
 * pre-check exists only to produce a friendlier message in the common case.
 */
export async function inviteToRoom(
  roomId: string,
  inviteeId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: invitee } = await supabase
    .from("profiles")
    .select("preferred_language, is_guest")
    .eq("id", inviteeId)
    .maybeSingle();

  if (!invitee) return { error: "Could not find that person." };
  if (!isCallLanguage(invitee.preferred_language)) {
    return { error: "That person's language isn't supported on calls." };
  }

  const { count } = await supabase
    .from("room_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .in("state", ["invited", "joined"]);

  if ((count ?? 0) >= MAX_ROOM_PARTICIPANTS) {
    return { error: `This call is full (${MAX_ROOM_PARTICIPANTS} people maximum).` };
  }

  const { error } = await supabase.from("room_participants").upsert(
    {
      room_id: roomId,
      user_id: inviteeId,
      language: invitee.preferred_language,
      invited_by: user.id,
      state: "invited" satisfies ParticipantState,
    },
    { onConflict: "room_id,user_id" },
  );

  if (error) {
    // The capacity trigger raises check_violation; surface its message
    // rather than a generic failure.
    return {
      error: /full/i.test(error.message)
        ? `This call is full (${MAX_ROOM_PARTICIPANTS} people maximum).`
        : "Could not add them to the call.",
    };
  }

  return {};
}

/** Moves the signed-in user's own participation row. */
export async function setParticipantState(
  roomId: string,
  state: Extract<ParticipantState, "joined" | "left" | "declined">,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const patch: Record<string, unknown> = { state };
  if (state === "joined") patch.joined_at = new Date().toISOString();
  if (state === "left" || state === "declined") patch.left_at = new Date().toISOString();

  const { error } = await supabase
    .from("room_participants")
    .update(patch)
    .eq("room_id", roomId)
    .eq("user_id", user.id);

  if (error) {
    return {
      error: /full/i.test(error.message)
        ? "That call is full now."
        : "Could not update the call.",
    };
  }

  // Once the last person leaves, close the room rather than leaving a live
  // one that nobody is in.
  const { count } = await supabase
    .from("room_participants")
    .select("user_id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .in("state", ["invited", "joined"]);

  if ((count ?? 0) === 0) {
    await supabase
      .from("rooms")
      .update({ status: "ended" satisfies RoomStatus, ended_at: new Date().toISOString() })
      .eq("id", roomId);
  }

  revalidatePath("/people");
  return {};
}

/** Ends the whole call for everyone. */
export async function endRoom(roomId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("rooms")
    .update({ status: "ended" satisfies RoomStatus, ended_at: new Date().toISOString() })
    .eq("id", roomId);

  return error ? { error: "Could not end the call." } : {};
}

/** The room and everyone in it, or null when it is not visible to this user. */
export async function getRoom(roomId: string): Promise<Room | null> {
  const supabase = await createClient();

  const { data: room } = await supabase
    .from("rooms")
    .select("id, host_id, status, created_at")
    .eq("id", roomId)
    .maybeSingle();

  if (!room) return null;

  const { data: rows } = await supabase
    .from("room_participants")
    .select("user_id, language, state, invited_by, profiles(id, username, display_name, avatar_url)")
    .eq("room_id", roomId);

  const participants = ((rows ?? []) as unknown as ParticipantRow[])
    .map(toParticipant)
    .filter((participant): participant is RoomParticipant => participant !== null);

  return {
    id: room.id as string,
    hostId: room.host_id as string,
    status: room.status as RoomStatus,
    createdAt: room.created_at as string,
    participants,
  };
}
