"use server";

import { createClient } from "@/lib/supabase/server";
import {
  callOutcome,
  isTerminalStatus,
  type CallHistoryEntry,
  type CallLanguageCode,
  type CallStatus,
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

/**
 * The signed-in user's finished calls, newest first.
 *
 * RLS already restricts `calls` to rows the user is a party to, so there
 * is no ownership filter here — the policy is the filter.
 */
export async function listRecentCalls(): Promise<CallHistoryEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

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

  const counterpartIds = Array.from(
    new Set(rows.map((row) => (row.caller_id === user.id ? row.receiver_id : row.caller_id))),
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
        preferredLanguage: row.preferred_language as CallLanguageCode,
        avatarUrl: (row.avatar_url as string | null) ?? null,
      },
    ]),
  );

  return rows.flatMap((row) => {
    const outgoing = row.caller_id === user.id;
    const counterpart = byId.get(outgoing ? row.receiver_id : row.caller_id);
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
