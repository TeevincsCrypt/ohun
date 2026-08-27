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

  if (roomError || !room) {
    // Logged in full because every failure here surfaces to the user as the
    // same sentence: a missing table, an RLS refusal and a constraint
    // violation are indistinguishable without this.
    console.error("[ohun/rooms] could not create room", roomError);
    return { error: "Could not start the call." };
  }

  const { error: seatError } = await supabase.from("room_participants").insert({
    room_id: room.id,
    user_id: user.id,
    language,
    state: "joined" satisfies ParticipantState,
    joined_at: new Date().toISOString(),
  });

  // Creating the room and seating its host are two statements, so a failure
  // here would otherwise leave a room nobody is in and nobody can reach.
  // Mark it ended rather than deleting, so the two paths that close a room
  // stay the same one.
  if (seatError) {
    console.error("[ohun/rooms] could not seat host", seatError);
    await supabase
      .from("rooms")
      .update({ status: "ended" satisfies RoomStatus, ended_at: new Date().toISOString() })
      .eq("id", room.id);
    return { error: "Could not start the call." };
  }

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
    console.error("[ohun/rooms] could not invite", error);
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
    console.error("[ohun/rooms] could not update participation", error);
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

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, host_id, status, created_at")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) console.error("[ohun/rooms] could not read room", roomError);
  if (!room) return null;

  const { data: rows, error: rowsError } = await supabase
    .from("room_participants")
    .select("user_id, language, state, invited_by")
    .eq("room_id", roomId);

  if (rowsError) {
    console.error("[ohun/rooms] could not read participants", rowsError);
    return null;
  }

  const participantRows = (rows ?? []) as ParticipantRow[];
  if (participantRows.length === 0) {
    return {
      id: room.id as string,
      hostId: room.host_id as string,
      status: room.status as RoomStatus,
      createdAt: room.created_at as string,
      participants: [],
    };
  }

  // Fetched separately rather than as an embedded `profiles(...)` select:
  // room_participants has two foreign keys into profiles (user_id and
  // invited_by), so PostgREST cannot tell which relationship an embed means
  // and refuses the whole query. Two plain reads have no such ambiguity.
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in(
      "id",
      participantRows.map((row) => row.user_id),
    );

  const byId = new Map(
    (profileRows ?? []).map((row) => [
      row.id as string,
      {
        id: row.id as string,
        username: row.username as string,
        displayName: row.display_name as string,
        avatarUrl: (row.avatar_url as string | null) ?? null,
      },
    ]),
  );

  const participants = participantRows.flatMap<RoomParticipant>((row) => {
    const profile = byId.get(row.user_id);
    // A deleted account leaves the participant row behind — skip it rather
    // than rendering a nameless seat.
    if (!profile) return [];
    return [
      {
        userId: row.user_id,
        language: row.language,
        state: row.state,
        invitedBy: row.invited_by,
        profile,
      },
    ];
  });

  return {
    id: room.id as string,
    hostId: room.host_id as string,
    status: room.status as RoomStatus,
    createdAt: room.created_at as string,
    participants,
  };
}
