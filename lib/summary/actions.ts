"use server";

import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { generateSummary, MIN_UTTERANCES_FOR_SUMMARY } from "./generate";
import { isCallLanguage, type CallLanguageCode, type CallSummary } from "@/types";

/** Identifies which conversation a row belongs to — exactly one is set. */
export type CallRef = { callId: string; roomId?: never } | { roomId: string; callId?: never };

function refColumns(ref: CallRef) {
  return "callId" in ref && ref.callId
    ? { call_id: ref.callId, room_id: null }
    : { call_id: null, room_id: (ref as { roomId: string }).roomId };
}

/**
 * Stores one thing that was said, with its translations.
 *
 * Fire-and-forget from the caller's point of view: a transcript row failing
 * to save must never interrupt a live call, so this reports failure by
 * returning rather than throwing, and callers ignore it.
 */
export async function recordUtterance(
  ref: CallRef,
  utterance: {
    originalText: string;
    spokenLanguage: CallLanguageCode;
    translations: Partial<Record<CallLanguageCode, string>>;
  },
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (!utterance.originalText.trim() || !isCallLanguage(utterance.spokenLanguage)) return;

  const { error } = await supabase.from("utterances").insert({
    ...refColumns(ref),
    // Taken from the session, never the client, so nobody can attribute
    // speech to another participant. RLS enforces the same rule.
    speaker_id: user.id,
    original_text: utterance.originalText,
    spoken_language: utterance.spokenLanguage,
    translations: utterance.translations,
  });

  if (error) console.error("[ohun/summary] could not record utterance", error);
}

/** The stored summary for a finished call, or null if there is none. */
export async function getSummary(ref: CallRef): Promise<CallSummary | null> {
  const supabase = await createClient();

  const columns = refColumns(ref);
  const query = supabase.from("call_summaries").select("summaries, created_at");

  const { data } = await (columns.call_id
    ? query.eq("call_id", columns.call_id)
    : query.eq("room_id", columns.room_id as string)
  ).maybeSingle();

  if (!data) return null;

  return {
    byLanguage: (data.summaries ?? {}) as Partial<Record<CallLanguageCode, string>>,
    createdAt: data.created_at as string,
  };
}

/**
 * Builds the summary for a finished call, once.
 *
 * Written through the service-role client because `call_summaries` has no
 * insert policy: a participant must be able to read a summary of their
 * conversation but never to author one. Reading the transcript still goes
 * through the caller's own session, so RLS decides whether they may see it
 * at all — this cannot be used to summarise someone else's call.
 */
export async function summariseCall(ref: CallRef): Promise<CallSummary | null> {
  const existing = await getSummary(ref);
  if (existing) return existing;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const columns = refColumns(ref);
  const transcriptQuery = supabase
    .from("utterances")
    .select("speaker_id, original_text, spoken_language")
    .order("said_at", { ascending: true });

  const { data: rows } = await (columns.call_id
    ? transcriptQuery.eq("call_id", columns.call_id)
    : transcriptQuery.eq("room_id", columns.room_id as string));

  const utterances = (rows ?? []) as {
    speaker_id: string;
    original_text: string;
    spoken_language: CallLanguageCode;
  }[];

  if (utterances.length < MIN_UTTERANCES_FOR_SUMMARY) return null;

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", Array.from(new Set(utterances.map((row) => row.speaker_id))));

  const names = new Map(
    (profileRows ?? []).map((row) => [row.id as string, row.display_name as string]),
  );

  let byLanguage: Partial<Record<CallLanguageCode, string>>;
  try {
    byLanguage = await generateSummary({
      utterances: utterances.map((row) => ({
        speaker: names.get(row.speaker_id) ?? "Someone",
        text: row.original_text,
        language: row.spoken_language,
      })),
      // One summary per language actually spoken, so each participant has
      // one they can read.
      languages: utterances.map((row) => row.spoken_language),
    });
  } catch (error) {
    console.error("[ohun/summary] could not generate", error);
    return null;
  }

  if (Object.keys(byLanguage).length === 0) return null;

  const admin = tryCreateAdminClient();
  if (!admin) {
    // Without the service-role key the summary cannot be stored, but it can
    // still be shown for this visit rather than thrown away.
    console.warn("[ohun/summary] no service-role key; summary not persisted");
    return { byLanguage, createdAt: new Date().toISOString() };
  }

  const { error } = await admin
    .from("call_summaries")
    .upsert({ ...columns, summaries: byLanguage }, {
      onConflict: columns.call_id ? "call_id" : "room_id",
    });

  if (error) console.error("[ohun/summary] could not store summary", error);

  return { byLanguage, createdAt: new Date().toISOString() };
}
