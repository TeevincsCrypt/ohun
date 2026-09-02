import "server-only";
import { AssemblyAI } from "assemblyai";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/types";
import { MissingApiKeyError } from "@/lib/assemblyai/token";

/**
 * Server-side transcription of a finished audio file.
 *
 * Deliberately not the streaming path a call uses. A voice note is already
 * complete when it arrives, so there is nothing to stream, and the batch
 * API is both more accurate on a whole utterance and far broader in the
 * languages it covers — Yoruba among them, which streaming has no model
 * for. A Yoruba speaker cannot use OHUN on a live call; they can send a
 * voice note.
 */

export class VoiceNoteTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceNoteTranscriptionError";
  }
}

/** The set we can translate to and from; anything else is not usable here. */
const KNOWN = new Set<string>(SUPPORTED_LANGUAGES.map((language) => language.code));

/**
 * AssemblyAI reports regional variants ("en_us", "en_uk"). The rest of the
 * app speaks in bare codes, so reduce to the base language and keep it only
 * if it is one we can actually translate.
 */
function normaliseLanguage(detected: string | null | undefined): LanguageCode | null {
  if (!detected) return null;
  const base = detected.toLowerCase().split(/[_-]/)[0];
  return KNOWN.has(base) ? (base as LanguageCode) : null;
}

export interface VoiceNoteTranscript {
  text: string;
  /** What was actually heard, which is not always what the profile claims. */
  language: LanguageCode;
}

export async function transcribeVoiceNote(
  audioUrl: string,
  fallbackLanguage: LanguageCode,
): Promise<VoiceNoteTranscript> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new AssemblyAI({ apiKey });

  let transcript;
  try {
    transcript = await client.transcripts.transcribe({
      audio: audioUrl,
      // Someone recording a voice note in a translation app is quite likely
      // not speaking the language their profile says — that is the whole
      // reason they are here. Detect rather than assert.
      language_detection: true,
    });
  } catch (error) {
    throw new VoiceNoteTranscriptionError(
      error instanceof Error ? error.message : "The voice note could not be transcribed.",
    );
  }

  if (transcript.status === "error") {
    throw new VoiceNoteTranscriptionError(transcript.error ?? "Transcription failed.");
  }

  const text = (transcript.text ?? "").trim();
  if (!text) {
    throw new VoiceNoteTranscriptionError("Nothing could be heard in that recording.");
  }

  return {
    text,
    // Detection can come back as a language we have no translator prompt
    // for. Falling back to the sender's own language is a better guess than
    // refusing to send the note.
    language: normaliseLanguage(transcript.language_code) ?? fallbackLanguage,
  };
}
