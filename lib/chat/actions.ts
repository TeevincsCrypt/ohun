"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { translateToMany } from "@/lib/translation/translate-many";
import { transcribeVoiceNote } from "./transcribe";
import {
  isCallLanguage,
  type CallLanguageCode,
  type ChatMessage,
  type ChatMessageKind,
  type LanguageCode,
} from "@/types";

/**
 * Chat is the call's asynchronous twin: you write in your language, and
 * everyone else in the thread reads it in theirs.
 *
 * Translation happens here, once, at send time — not per reader. A message
 * is a permanent record several people open at different moments, so
 * translating on read would pay for the same work repeatedly and, worse,
 * could show two readers of one language two different wordings of the same
 * sentence.
 */

/** How long a voice note's signed playback URL stays valid. */
const AUDIO_URL_TTL_SECONDS = 60 * 60;

export interface ChatResult {
  threadId?: string;
  message?: ChatMessage;
  error?: string;
}

interface MemberRow {
  user_id: string;
  language: CallLanguageCode;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  kind: ChatMessageKind;
  original_text: string;
  original_language: LanguageCode;
  audio_path: string | null;
  duration_ms: number | null;
  created_at: string;
}

/** Shapes a row plus its translations into the client-facing message. */
function toMessage(
  row: MessageRow,
  translations: { language: LanguageCode; text: string }[],
  audioUrl: string | null,
): ChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    kind: row.kind,
    originalText: row.original_text,
    originalLanguage: row.original_language,
    audioPath: row.audio_path,
    audioUrl,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    translations: Object.fromEntries(translations.map((t) => [t.language, t.text])),
  };
}

/**
 * Returns the existing one-to-one thread with someone, or opens one.
 *
 * Idempotent by design: "message this person" is a link, and following it
 * twice must not leave two half-used threads behind.
 */
export async function openThread(otherUserId: string): Promise<ChatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to send a message." };
  if (user.id === otherUserId) return { error: "You cannot message yourself." };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, preferred_language")
    .in("id", [user.id, otherUserId]);

  const mine = profiles?.find((row) => row.id === user.id);
  const theirs = profiles?.find((row) => row.id === otherUserId);
  if (!mine || !theirs) return { error: "That person could not be found." };

  // A thread we are both in. Two membership reads intersected here rather
  // than a join, because the roster is only readable through the membership
  // policy and PostgREST cannot express the intersection anyway.
  const [{ data: myThreads }, { data: theirThreads }] = await Promise.all([
    supabase.from("chat_members").select("thread_id").eq("user_id", user.id),
    supabase.from("chat_members").select("thread_id").eq("user_id", otherUserId),
  ]);

  const theirs_ = new Set((theirThreads ?? []).map((row) => row.thread_id));
  const existing = (myThreads ?? []).find((row) => theirs_.has(row.thread_id));
  if (existing) return { threadId: existing.thread_id };

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .insert({ created_by: user.id })
    .select("id")
    .single();

  if (threadError || !thread) {
    return { error: threadError?.message ?? "Could not open that conversation." };
  }

  // Languages are snapshotted at join time, exactly as calls and rooms
  // snapshot theirs: what a message was translated into is a property of
  // the message as sent, and a later profile edit must not rewrite history.
  const { error: memberError } = await supabase.from("chat_members").insert([
    { thread_id: thread.id, user_id: user.id, language: mine.preferred_language },
    { thread_id: thread.id, user_id: otherUserId, language: theirs.preferred_language },
  ]);

  if (memberError) return { error: memberError.message };

  return { threadId: thread.id };
}

/** Every language in a thread except the sender's, deduplicated. */
async function otherLanguages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  from: LanguageCode,
): Promise<CallLanguageCode[]> {
  const { data } = await supabase
    .from("chat_members")
    .select("user_id, language")
    .eq("thread_id", threadId);

  const languages = (data ?? [])
    .map((row: MemberRow) => row.language)
    .filter((language): language is CallLanguageCode => isCallLanguage(language));

  return [...new Set(languages)].filter((language) => language !== from);
}

/**
 * Stores a message and the translations that go with it.
 *
 * A translation failure is deliberately not fatal. The message is already
 * written and the sender considers it sent; losing it because a translation
 * call timed out would be far worse than delivering it untranslated, which
 * the reader can still see in the original.
 */
async function persist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    threadId: string;
    senderId: string;
    kind: ChatMessageKind;
    text: string;
    language: LanguageCode;
    audioPath?: string | null;
    durationMs?: number | null;
  },
): Promise<ChatResult> {
  const { data: row, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      sender_id: input.senderId,
      kind: input.kind,
      original_text: input.text,
      original_language: input.language,
      audio_path: input.audioPath ?? null,
      duration_ms: input.durationMs ?? null,
    })
    .select("id, thread_id, sender_id, kind, original_text, original_language, audio_path, duration_ms, created_at")
    .single();

  if (error || !row) return { error: error?.message ?? "That message could not be sent." };

  const targets = await otherLanguages(supabase, input.threadId, input.language);
  const stored: { language: LanguageCode; text: string }[] = [];

  if (targets.length > 0) {
    try {
      const { byLanguage } = await translateToMany({
        text: input.text,
        from: input.language,
        to: targets,
      });

      for (const [language, text] of Object.entries(byLanguage)) {
        if (text) stored.push({ language: language as LanguageCode, text });
      }

      if (stored.length > 0) {
        await supabase
          .from("chat_translations")
          .insert(stored.map((t) => ({ message_id: row.id, language: t.language, text: t.text })));
      }
    } catch (translationError) {
      console.error("[ohun] chat translation failed", translationError);
    }
  }

  // Moves the thread to the top of everyone's list.
  await supabase
    .from("chat_threads")
    .update({ last_message_at: row.created_at })
    .eq("id", input.threadId);

  let audioUrl: string | null = null;
  if (row.audio_path) {
    const { data: signed } = await supabase.storage
      .from("voice-notes")
      .createSignedUrl(row.audio_path, AUDIO_URL_TTL_SECONDS);
    audioUrl = signed?.signedUrl ?? null;
  }

  revalidatePath("/chats");
  return { message: toMessage(row as MessageRow, stored, audioUrl) };
}

export async function sendTextMessage(threadId: string, text: string): Promise<ChatResult> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Write something first." };
  if (trimmed.length > 4000) return { error: "That message is too long." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to send a message." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  const language = profile?.preferred_language;
  if (!isCallLanguage(language)) return { error: "Set your language in your profile first." };

  return persist(supabase, {
    threadId,
    senderId: user.id,
    kind: "text",
    text: trimmed,
    language,
  });
}

/**
 * Turns an uploaded recording into a message.
 *
 * The audio is uploaded by the browser straight to storage — it never
 * passes through a server action, which has a body limit far below what a
 * minute of audio weighs. This step only takes the resulting object key,
 * transcribes it, and treats the transcript exactly like typed text from
 * there on.
 */
export async function sendVoiceNote(
  threadId: string,
  audioPath: string,
  durationMs: number,
): Promise<ChatResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be logged in to send a message." };

  // The path is client-supplied, and it decides which thread's members can
  // read the object. Anything outside this thread's folder is refused here
  // rather than trusted — the storage policy agrees, but a mismatch would
  // otherwise surface as an unplayable message instead of an error.
  if (!audioPath.startsWith(`${threadId}/`)) {
    return { error: "That recording does not belong to this conversation." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  const fallback = profile?.preferred_language;
  if (!isCallLanguage(fallback)) return { error: "Set your language in your profile first." };

  // Signed rather than public: the bucket is private, and AssemblyAI has to
  // be able to fetch the audio to transcribe it.
  const { data: signed, error: signError } = await supabase.storage
    .from("voice-notes")
    .createSignedUrl(audioPath, AUDIO_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return { error: "That recording could not be read back." };
  }

  let transcript;
  try {
    transcript = await transcribeVoiceNote(signed.signedUrl, fallback);
  } catch (error) {
    console.error("[ohun] voice note transcription failed", error);
    return {
      error:
        error instanceof Error ? error.message : "That voice note could not be transcribed.",
    };
  }

  return persist(supabase, {
    threadId,
    senderId: user.id,
    kind: "voice",
    text: transcript.text,
    language: transcript.language,
    audioPath,
    durationMs,
  });
}
