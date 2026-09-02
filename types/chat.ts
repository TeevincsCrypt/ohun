import type { LanguageCode } from "./language";
import type { CallLanguageCode, Profile } from "./account";

/**
 * A chat message is a call utterance that outlives the moment: written or
 * spoken in one language, stored alongside the same thing in every other
 * language in the thread, and read later by each person in theirs.
 */

export type ChatMessageKind = "text" | "voice";

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  kind: ChatMessageKind;
  /** Exactly what the sender wrote, or what their voice note transcribed to. */
  originalText: string;
  /**
   * The language it was written or spoken in. Not always the sender's
   * profile language — a voice note is transcribed with detection on, and
   * what was heard beats what the profile claims.
   */
  originalLanguage: LanguageCode;
  /** Object key in the voice-notes bucket. Null for text messages. */
  audioPath: string | null;
  /** Short-lived signed URL for that object, resolved at read time. */
  audioUrl: string | null;
  durationMs: number | null;
  createdAt: string;
  /** The same message in each other language present in the thread. */
  translations: Partial<Record<LanguageCode, string>>;
}

export interface ChatThreadSummary {
  id: string;
  lastMessageAt: string;
  /** The person on the other side. Threads are one-to-one today. */
  other: Profile;
  /**
   * Already rendered in the *reader's* language where a translation exists,
   * so a thread list never shows a preview nobody in it can read.
   */
  preview: string | null;
  previewKind: ChatMessageKind | null;
}

/**
 * How much of each message to show.
 *
 * "translated" is the default and the point of the product — you read your
 * own language and nothing else. "both" is for anyone learning the other
 * language, or checking a translation they do not trust. "original" turns
 * the translation off entirely.
 */
export type ChatView = "translated" | "both" | "original";

export const CHAT_VIEW_LABEL: Record<ChatView, string> = {
  translated: "My language only",
  both: "Both languages",
  original: "Original only",
};

/**
 * Picks what a reader sees for one message.
 *
 * The sender's own messages are a deliberate exception: their "original" is
 * already their language, and the interesting line is what the other person
 * received. Everyone else's messages read the other way round.
 */
export function renderMessage(
  message: ChatMessage,
  readerLanguage: CallLanguageCode,
  view: ChatView,
): { primary: string; secondary: string | null } {
  const translated = message.translations[readerLanguage] ?? null;
  const isReadersOwnLanguage = message.originalLanguage === readerLanguage;

  // Nothing to switch between: it was already written in the reader's
  // language, so every view shows the same single line.
  if (isReadersOwnLanguage || !translated) {
    return { primary: message.originalText, secondary: null };
  }

  if (view === "original") return { primary: message.originalText, secondary: null };
  if (view === "translated") return { primary: translated, secondary: null };
  return { primary: translated, secondary: message.originalText };
}
