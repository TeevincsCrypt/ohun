import type { LanguageCode } from "./language";

export type SpeakerId = "a" | "b";

/** State of a participant's microphone capture. */
export type MicState = "disconnected" | "connecting" | "listening" | "error";

/** State of the realtime connection to the transcription/translation backend. */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface ConversationParticipant {
  id: SpeakerId;
  name: string;
  language: LanguageCode;
  micState: MicState;
}

export interface TranscriptEntry {
  id: string;
  speaker: SpeakerId;
  /** What the speaker actually said, in their own language. */
  originalText: string;
  /** The translated rendering shown/spoken to the other participant. */
  translatedText: string;
  languageFrom: LanguageCode;
  languageTo: LanguageCode;
  timestamp: number;
  isFinal: boolean;
}
