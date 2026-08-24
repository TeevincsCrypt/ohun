export interface MicRecorder {
  start: () => Promise<void>;
  stop: () => void;
  onAudioChunk: (handler: (chunk: ArrayBuffer) => void) => void;
}

export interface SpeechPlaybackOptions {
  text: string;
  languageCode: string;
}
