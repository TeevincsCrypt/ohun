import type { LanguageCode, Language } from "./language";
import { SUPPORTED_LANGUAGES } from "./language";

/**
 * Languages a real account may choose. Narrower than SUPPORTED_LANGUAGES:
 * calls run through AssemblyAI streaming, whose models cover English,
 * Spanish, French, German, Portuguese and Italian — not Yoruba. Offering
 * Yoruba here would produce calls that silently fail to transcribe, so it
 * stays available only in the single-device Phase 3 demo at /conversation.
 */
export type CallLanguageCode = Extract<LanguageCode, "en" | "fr" | "es">;

export const CALL_LANGUAGE_CODES: CallLanguageCode[] = ["en", "fr", "es"];

export const CALL_LANGUAGES: Language[] = SUPPORTED_LANGUAGES.filter(
  (language): language is Language & { code: CallLanguageCode } =>
    (CALL_LANGUAGE_CODES as LanguageCode[]).includes(language.code),
);

export function isCallLanguage(value: unknown): value is CallLanguageCode {
  return typeof value === "string" && (CALL_LANGUAGE_CODES as string[]).includes(value);
}

export function getCallLanguage(code: string | null | undefined): Language | undefined {
  return CALL_LANGUAGES.find((language) => language.code === code);
}

/** Flag shown next to a language. Purely decorative. */
export const LANGUAGE_FLAG: Record<CallLanguageCode, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
  es: "🇪🇸",
};

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function validateUsername(username: string): string | null {
  if (!username) return "Pick a username.";
  if (username.length < 3) return "Usernames are at least 3 characters.";
  if (username.length > 20) return "Usernames are at most 20 characters.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use lowercase letters, numbers and underscores only.";
  }
  return null;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  preferredLanguage: CallLanguageCode;
  lastSeenAt: string;
  avatarUrl: string | null;
  phone: string | null;
}

/** E.164: a leading + and 7-15 digits. Mirrors the DB constraint. */
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export function validatePhone(phone: string): string | null {
  if (!phone) return null;
  if (!PHONE_PATTERN.test(phone)) {
    return "Use an international number, e.g. +2348012345678.";
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  if (!displayName.trim()) return "Enter a display name.";
  if (displayName.trim().length > 50) return "Display names are at most 50 characters.";
  return null;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Treated as online if seen within this window. */
export const ONLINE_WINDOW_MS = 60_000;

export function isOnline(profile: Pick<Profile, "lastSeenAt">): boolean {
  return Date.now() - new Date(profile.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

export type CallStatus =
  | "ringing"
  | "accepted"
  | "connected"
  | "declined"
  | "ended"
  | "failed";

/** Client-side connection state within a call room. */
export type CallConnectionState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "declined"
  | "ended"
  | "failed";

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  status: CallStatus;
  callerLanguage: CallLanguageCode;
  receiverLanguage: CallLanguageCode;
  createdAt: string;
  endedAt: string | null;
}

/** Terminal states — the room should tear down and stop listening. */
export const TERMINAL_CALL_STATUSES: CallStatus[] = ["declined", "ended", "failed"];

export function isTerminalStatus(status: CallStatus): boolean {
  return TERMINAL_CALL_STATUSES.includes(status);
}

/** One translated utterance shown in the call room's live captions. */
export interface CallCaption {
  id: string;
  /** True when this is the local user's own speech. */
  fromSelf: boolean;
  /** What was said, in the speaker's own language. */
  originalText: string;
  /** The same utterance in the listener's language. */
  translatedText: string;
  at: number;
}

export type ScheduledCallStatus = "pending" | "started" | "cancelled" | "missed";

export interface ScheduledCall {
  id: string;
  organizerId: string;
  inviteeId: string;
  /** ISO timestamp. */
  scheduledAt: string;
  note: string | null;
  status: ScheduledCallStatus;
  callId: string | null;
  createdAt: string;
  /** The other party, resolved for display. */
  counterpart: Pick<Profile, "id" | "username" | "displayName" | "preferredLanguage" | "avatarUrl">;
  /** True when the signed-in user created this. */
  organizedBySelf: boolean;
}

/** A scheduled call is joinable from a few minutes before until it goes stale. */
export const JOIN_WINDOW_BEFORE_MS = 5 * 60_000;
export const JOIN_WINDOW_AFTER_MS = 30 * 60_000;

export function isJoinable(scheduled: Pick<ScheduledCall, "scheduledAt" | "status">): boolean {
  if (scheduled.status !== "pending") return false;
  const delta = new Date(scheduled.scheduledAt).getTime() - Date.now();
  return delta <= JOIN_WINDOW_BEFORE_MS && delta >= -JOIN_WINDOW_AFTER_MS;
}

/** Past the join window with nobody having started it. */
export function isMissed(scheduled: Pick<ScheduledCall, "scheduledAt" | "status">): boolean {
  if (scheduled.status !== "pending") return false;
  return new Date(scheduled.scheduledAt).getTime() < Date.now() - JOIN_WINDOW_AFTER_MS;
}
