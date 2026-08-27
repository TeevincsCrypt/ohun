"use server";

import { createClient } from "@/lib/supabase/server";
import {
  callOutcome,
  isTerminalStatus,
  type CallHistoryEntry,
  type CallLanguageCode,
  type CallOutcome,
  type CallStatus,
  type HistoryPerson,
  type ParticipantState,
} from "@/types";

interface CallRow {
  id: string;
  caller_id: string;
  receiver_id: string;
  status: CallStatus;
  caller_language: CallLanguageCode;
  receiver_language: CallLanguageCode;
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
}

const HISTORY_LIMIT = 20;

interface RoomRow {
  id: string;
  host_id: string;
  created_at: string;
  ended_at: string | null;
}

interface RoomParticipantRow {
  room_id: string;
  user_id: string;
  language: CallLanguageCode;
  state: ParticipantState;
}

/** Profiles for a set of ids, keyed by id. */
async function loadPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, HistoryPerson>> {
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, preferred_language, avatar_url")
    .in("id", ids);

  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      {
        id: row.id as string,
        username: row.username as string,
        displayName: row.display_name as string,
        preferredLanguage: row.preferred_language as CallLanguageCode,
        avatarUrl: (row.avatar_url as string | null) ?? null,
      },
    ]),
  );
}

/**
 * The signed-in user's finished calls, newest first.
 *
 * RLS already restricts `calls` to rows the user is a party to, so there
 * is no ownership filter here — the policy is the filter.
 */
/**
 * The signed-in user's finished calls, direct and group, newest first.
 *
 * RLS is the filter in both cases: `calls` is restricted to rows the user
 * is a party to, and `rooms` to rooms they were a participant of, so
 * neither query needs an ownership clause.
 */
export async function listRecentCalls(): Promise<CallHistoryEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [directEntries, groupEntries] = await Promise.all([
    listDirectCalls(supabase, user.id),
    listGroupCalls(supabase, user.id),
  ]);

  return [...directEntries, ...groupEntries]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, HISTORY_LIMIT);
}

async function listDirectCalls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CallHistoryEntry[]> {
  const { data } = await supabase
    .from("calls")
    .select(
      "id, caller_id, receiver_id, status, caller_language, receiver_language, created_at, connected_at, ended_at",
    )
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  // Anything still live belongs in the call room, not in history.
  const rows = ((data ?? []) as CallRow[]).filter((row) => isTerminalStatus(row.status));
  if (rows.length === 0) return [];

  const people = await loadPeople(
    supabase,
    Array.from(
      new Set(rows.map((row) => (row.caller_id === userId ? row.receiver_id : row.caller_id))),
    ),
  );

  return rows.flatMap<CallHistoryEntry>((row) => {
    const outgoing = row.caller_id === userId;
    const counterpart = people.get(outgoing ? row.receiver_id : row.caller_id);
    // A deleted account leaves the call row behind — skip rather than crash.
    if (!counterpart) return [];

    const durationSeconds =
      row.connected_at && row.ended_at
        ? Math.max(
            0,
            Math.round(
              (new Date(row.ended_at).getTime() - new Date(row.connected_at).getTime()) / 1000,
            ),
          )
        : null;

    return [
      {
        kind: "direct",
        id: row.id,
        counterpart,
        outgoing,
        outcome: callOutcome({
          status: row.status,
          connected: Boolean(row.connected_at),
          outgoing,
        }),
        at: row.created_at,
        durationSeconds,
        // Stored caller-side/receiver-side; flip so it always reads
        // "my language -> theirs" regardless of who dialled.
        fromLanguage: outgoing ? row.caller_language : row.receiver_language,
        toLanguage: outgoing ? row.receiver_language : row.caller_language,
      },
    ];
  });
}

async function listGroupCalls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<CallHistoryEntry[]> {
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("id, host_id, created_at, ended_at")
    .eq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const rooms = (roomRows ?? []) as RoomRow[];
  if (rooms.length === 0) return [];

  const { data: participantRows } = await supabase
    .from("room_participants")
    .select("room_id, user_id, language, state")
    .in(
      "room_id",
      rooms.map((room) => room.id),
    );

  const participants = (participantRows ?? []) as RoomParticipantRow[];

  const people = await loadPeople(
    supabase,
    Array.from(new Set(participants.map((row) => row.user_id))),
  );

  return rooms.flatMap<CallHistoryEntry>((room) => {
    const roster = participants.filter((row) => row.room_id === room.id);
    const mine = roster.find((row) => row.user_id === userId);
    // A room the user was never actually seated in is not their history.
    if (!mine) return [];

    const others = roster
      .filter((row) => row.user_id !== userId)
      .flatMap((row) => {
        const person = people.get(row.user_id);
        return person ? [person] : [];
      });

    // A room with nobody else in it was opened and abandoned; showing it
    // would just be noise.
    if (others.length === 0) return [];

    // Rooms have no equivalent of connected_at, so this is wall time from
    // opening the room to closing it rather than strict talk time. Only
    // counted for someone who actually joined.
    const joined = mine.state === "joined" || mine.state === "left";
    const durationSeconds =
      joined && room.ended_at
        ? Math.max(
            0,
            Math.round(
              (new Date(room.ended_at).getTime() - new Date(room.created_at).getTime()) / 1000,
            ),
          )
        : null;

    // Only two outcomes are reachable. A declined room is invisible to the
    // person who declined it — is_room_participant excludes that state, so
    // RLS filters the room out before it gets here. That is deliberate:
    // letting a declined invitee read the room would also let them read its
    // live roster, and the parity with direct calls, where a decline does
    // show in history, is not worth that. Someone still 'invited' when the
    // room closed never answered, which is a missed call.
    const outcome: CallOutcome = joined ? "completed" : "missed";

    return [
      {
        kind: "group",
        id: room.id,
        others,
        hostedBySelf: room.host_id === userId,
        outcome,
        at: room.created_at,
        durationSeconds,
        languages: Array.from(new Set(roster.map((row) => row.language))),
      },
    ];
  });
}
