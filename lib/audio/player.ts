import { NotImplementedError } from "@/lib/errors";
import type { SpeechPlaybackOptions } from "./types";

/**
 * Will speak the translated text aloud (TTS) so the other participant hears
 * the translation without reading it.
 *
 * Not implemented yet: no audio is played.
 */
export async function speak(_options: SpeechPlaybackOptions): Promise<void> {
  throw new NotImplementedError("Translated speech playback", "Phase 2/3");
}
