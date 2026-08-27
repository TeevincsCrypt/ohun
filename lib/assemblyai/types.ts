import type { LanguageCode } from "@/types";

/**
 * App-level types for the AssemblyAI realtime streaming integration.
 * These wrap the `assemblyai` SDK's own `StreamingTranscriber` (see
 * `assemblyai/streaming`) rather than re-inventing the wire protocol.
 */

/** One update to the transcript of a single "turn" (utterance). */
export interface TranscriptUpdate {
  /** Monotonically increasing per-utterance index from AssemblyAI. */
  turnOrder: number;
  /** Current best text for this turn — replaces, does not append to, prior updates for the same turnOrder. */
  text: string;
  /** True once AssemblyAI has detected the end of this turn. */
  isFinal: boolean;
  /**
   * The language actually spoken in this turn, when the model reported one.
   *
   * A participant's profile language is a guess about what they will speak,
   * not a fact about what they just said. Someone whose profile says English
   * may answer a French question in French. Translating that from English
   * produces nonsense, so where the model tells us, this wins.
   */
  detectedLanguage?: LanguageCode;
  /** 0-1 confidence in detectedLanguage, when reported. */
  languageConfidence?: number;
}

export interface TranscriptionStreamConfig {
  /** The language this participant is expected to speak. */
  language: LanguageCode;
  /**
   * Every language in the conversation. Passed to the model so it can
   * follow a speaker switching between them mid-sentence, and so detection
   * is choosing between languages that are actually present rather than the
   * whole world.
   */
  languages?: LanguageCode[];
  /** Fired once the server has accepted the session and is ready for audio. */
  onOpen?: (info: { sessionId: string }) => void;
  onTranscript: (update: TranscriptUpdate) => void;
  onError: (error: Error) => void;
  /** Fired when the socket closes, whether requested or not. */
  onClose?: (code: number, reason: string) => void;
}

export interface TranscriptionStream {
  /** Push a chunk of little-endian PCM16 mono audio into the stream. */
  sendAudio: (chunk: ArrayBuffer) => void;
  /** Tear down the stream and release the underlying connection. */
  close: () => Promise<void>;
}
