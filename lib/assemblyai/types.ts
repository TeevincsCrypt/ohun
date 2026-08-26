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
}

export interface TranscriptionStreamConfig {
  /** The language this participant speaks; selects the streaming speech model. */
  language: LanguageCode;
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
