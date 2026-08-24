import { NotImplementedError } from "@/lib/errors";
import type { MicRecorder } from "./types";

/**
 * Will wrap getUserMedia + an AudioWorklet to capture microphone audio and
 * hand raw PCM chunks to a transcription stream.
 *
 * Not implemented yet: no microphone access is requested.
 */
export function createMicRecorder(): MicRecorder {
  throw new NotImplementedError("Microphone capture", "Phase 2");
}
