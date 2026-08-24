import { NotImplementedError } from "@/lib/errors";
import type { TranscriptionStream, TranscriptionStreamConfig } from "./types";

/**
 * Will open a realtime streaming session against AssemblyAI and forward
 * transcription events via the config callbacks.
 *
 * Not implemented yet: no network call is made. This exists to define the
 * integration boundary the UI is built against so Phase 2 can fill it in
 * without reshaping the rest of the app.
 */
export function createTranscriptionStream(
  _config: TranscriptionStreamConfig,
): TranscriptionStream {
  throw new NotImplementedError("AssemblyAI realtime transcription", "Phase 2");
}
