export interface MicRecorderConfig {
  /** Called with little-endian PCM16 mono audio chunks as they're captured. */
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError: (error: Error) => void;
  /**
   * An already-captured microphone stream to read from.
   *
   * A call has one open for WebRTC, and reusing it keeps transcription and
   * the outgoing audio looking at the same tracks — so muting, which
   * disables those tracks, actually stops both. Capturing separately meant
   * a muted participant was silent to everyone but still transcribed.
   *
   * Omitted by the single-device demo, which has no call and so captures
   * its own. A borrowed stream is never stopped on teardown; whoever
   * captured it owns its lifetime.
   */
  stream?: MediaStream;
}

export interface MicRecorder {
  start: () => Promise<void>;
  stop: () => void;
}

export interface SpeechPlaybackOptions {
  text: string;
  languageCode: string;
}
