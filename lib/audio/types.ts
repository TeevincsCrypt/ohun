export interface MicRecorderConfig {
  /** Called with little-endian PCM16 mono audio chunks as they're captured. */
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError: (error: Error) => void;
}

export interface MicRecorder {
  start: () => Promise<void>;
  stop: () => void;
}

export interface SpeechPlaybackOptions {
  text: string;
  languageCode: string;
}
