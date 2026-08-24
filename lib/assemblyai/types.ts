import type { LanguageCode } from "@/types";

/**
 * Planned shape of a realtime transcription session backed by AssemblyAI's
 * streaming speech-to-text API. Nothing in this module talks to the network
 * yet — see client.ts.
 */
export interface TranscriptionStreamConfig {
  apiKey: string;
  language: LanguageCode;
  sampleRateHz: number;
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
}

export interface TranscriptionStream {
  /** Push a chunk of raw audio captured from the microphone into the stream. */
  sendAudio: (chunk: ArrayBuffer) => void;
  /** Tear down the stream and release the underlying connection. */
  close: () => Promise<void>;
}
