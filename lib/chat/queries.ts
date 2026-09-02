import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, toProfile, type ProfileRow } from "@/lib/supabase/profile";
import type {
  CallLanguageCode,
  ChatMessage,
  ChatMessageKind,
  ChatThreadSummary,
  LanguageCode,
  Profile,
} from "@/types";

/**
 * Server-side reads for chat.
 *
 * Kept apart from actions.ts so a page can load a thread without pulling in
 * the translation and transcription stack that only sending needs.
 */

const AUDIO_URL_TTL_SECONDS = 60 * 60;

/** Newest-last, so the view can render straight down the page. */
const MESSAGE_PAGE = 200;

const MESSAGE_COLUMNS =
  "id, thread_id, sender_id, kind, original_text, original_language, audio_path, duration_ms, created_at";

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

/** Just enough of a message to render a thread-list preview line. */
interface PreviewRow {
  id: string;
  thread_id: string;
  kind: ChatMessageKind;
  original_text: string;
  created_at: string;
}

export interface ThreadContext {
  threadId: string;
  self: Profile;
  other: Profile;
  messages: ChatMessage[];
}

/**
 * Everything one thread's view needs.
 *
 * Returns null rather than throwing when the thread is not readable: RLS
 * already makes someone else's thread invisible, so "no rows" and "not
 * yours" are the same answer, and the caller turns both into a 404.
 */
export async function loadThread(threadId: string): Promise<ThreadContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: members } = await supabase
    .from("chat_members")
    .select("user_id")
    .eq("thread_id", threadId);

  if (!members || members.length === 0) return null;

  const otherId = members.find((row) => row.user_id !== user.id)?.user_id;
  if (!otherId) return null;

  // Two plain reads rather than an embedded select: chat_members has a
  // foreign key to profiles from more than one direction elsewhere in this
  // schema, and an ambiguous embed fails at runtime rather than at build.
  const { data: profiles } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", [user.id, otherId]);

  const self = (profiles as ProfileRow[] | null)?.find((row) => row.id === user.id);
  const other = (profiles as ProfileRow[] | null)?.find((row) => row.id === otherId);
  if (!self || !other) return null;

  return {
    threadId,
    self: toProfile(self),
    other: toProfile(other),
    messages: await loadMessages(threadId),
  };
}

export async function loadMessages(threadId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE);

  const messages = ((rows ?? []) as MessageRow[]).slice().reverse();
  if (messages.length === 0) return [];

  const { data: translations } = await supabase
    .from("chat_translations")
    .select("message_id, language, text")
    .in(
      "message_id",
      messages.map((row) => row.id),
    );

  const byMessage = new Map<string, Partial<Record<LanguageCode, string>>>();
  for (const row of translations ?? []) {
    const existing = byMessage.get(row.message_id) ?? {};
    existing[row.language as LanguageCode] = row.text;
    byMessage.set(row.message_id, existing);
  }

  // One signed URL per voice note. Signed rather than public because the
  // bucket is private — a voice note is conversation content, not an avatar.
  const audioUrls = new Map<string, string>();
  const paths = messages.map((row) => row.audio_path).filter((path): path is string => !!path);
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("voice-notes")
      .createSignedUrls(paths, AUDIO_URL_TTL_SECONDS);

    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) audioUrls.set(entry.path, entry.signedUrl);
    }
  }

  return messages.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    kind: row.kind,
    originalText: row.original_text,
    originalLanguage: row.original_language,
    audioPath: row.audio_path,
    audioUrl: row.audio_path ? (audioUrls.get(row.audio_path) ?? null) : null,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    translations: byMessage.get(row.id) ?? {},
  }));
}

/** Every thread this user is in, most recently active first. */
export async function listThreads(): Promise<ChatThreadSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myMemberships } = await supabase
    .from("chat_members")
    .select("thread_id, language")
    .eq("user_id", user.id);

  const threadIds = (myMemberships ?? []).map((row) => row.thread_id);
  if (threadIds.length === 0) return [];

  const myLanguage = (myMemberships?.[0]?.language ?? "en") as CallLanguageCode;

  const [{ data: threads }, { data: allMembers }] = await Promise.all([
    supabase
      .from("chat_threads")
      .select("id, last_message_at")
      .in("id", threadIds)
      .order("last_message_at", { ascending: false }),
    supabase.from("chat_members").select("thread_id, user_id").in("thread_id", threadIds),
  ]);

  const otherByThread = new Map<string, string>();
  for (const row of allMembers ?? []) {
    if (row.user_id !== user.id) otherByThread.set(row.thread_id, row.user_id);
  }

  const otherIds = [...new Set(otherByThread.values())];
  const { data: profiles } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", otherIds.length > 0 ? otherIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((row) => [row.id, toProfile(row)]),
  );

  // The newest message per thread, for the preview line. Fetched in one
  // query and reduced here rather than one query per thread.
  const { data: recent } = await supabase
    .from("chat_messages")
    .select("id, thread_id, kind, original_text, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false })
    // Enough rows to be confident of catching every thread's newest, in one
    // query rather than one per thread.
    .limit(threadIds.length * 5);

  const latestByThread = new Map<string, PreviewRow>();
  for (const row of (recent ?? []) as PreviewRow[]) {
    if (!latestByThread.has(row.thread_id)) latestByThread.set(row.thread_id, row);
  }

  const { data: previewTranslations } = await supabase
    .from("chat_translations")
    .select("message_id, text")
    .eq("language", myLanguage)
    .in(
      "message_id",
      [...latestByThread.values()].map((row) => row.id),
    );

  const translatedPreview = new Map(
    (previewTranslations ?? []).map((row) => [row.message_id, row.text]),
  );

  return (threads ?? []).flatMap((thread) => {
    const other = profileById.get(otherByThread.get(thread.id) ?? "");
    if (!other) return [];

    const latest = latestByThread.get(thread.id);
    // Shown in the reader's own language wherever a translation exists, so
    // a thread list never previews a line nobody in it can read.
    const preview = latest
      ? (translatedPreview.get(latest.id) ?? latest.original_text)
      : null;

    return [
      {
        id: thread.id,
        lastMessageAt: thread.last_message_at,
        other,
        preview,
        previewKind: (latest?.kind ?? null) as ChatMessageKind | null,
      },
    ];
  });
}
