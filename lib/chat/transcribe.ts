import "server-only";
import { AssemblyAI } from "assemblyai";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/types";
import { MissingApiKeyError } from "@/lib/assemblyai/token";

/**
 * Server-side transcription of a finished audio file.
 *
 * Deliberately not the streaming path a call uses. A voice note is already
 * complete when it arrives, so there is nothing to stream, and the batch
 * API's underlying model can transcribe far more languages than streaming
 * has a model for at all — Yoruba among them. A Yoruba speaker cannot use
 * OHUN on a live call; they can send a voice note.
 *
 * That broader coverage only applies when the language is named directly
 * via `language_code`, though — AssemblyAI's automatic `language_detection`
 * is its own, narrower model, and Yoruba (among others) is outside what
 * *it* can recognise. Fed real Yoruba speech, detection doesn't fail with
 * anything language-specific; it reports the same error it uses for a
 * genuinely silent file ("language_detection cannot be performed on files
 * with no spoken audio") — confirmed directly against a real recording.
 * transcribeWithLanguage() below is what actually reconciles this: try
 * detection first (it is still worth it — see the note there), and when
 * detection itself is what failed, retry once with the sender's own
 * profile language stated explicitly instead of guessed at.
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

type TranscribeResult = Awaited<ReturnType<AssemblyAI["transcripts"]["transcribe"]>>;

async function attemptTranscribe(
  client: AssemblyAI,
  audioUrl: string,
  languageOptions:
    | { language_detection: true }
    | { language_detection: false; language_code: LanguageCode },
): Promise<TranscribeResult> {
  try {
    return await client.transcripts.transcribe({ audio: audioUrl, ...languageOptions });
  } catch (error) {
    throw new VoiceNoteTranscriptionError(
      error instanceof Error ? error.message : "The voice note could not be transcribed.",
    );
  }
}

/**
 * True specifically for automatic detection's own failure mode — not for a
 * recording that genuinely has nothing said in it, which retrying with an
 * explicit language_code cannot fix either, and which is handled below by
 * the plain empty-text check instead.
 */
function isLanguageDetectionFailure(transcript: TranscribeResult): boolean {
  return (
    transcript.status === "error" &&
    (transcript.error ?? "").toLowerCase().includes("language_detection")
  );
}

export async function transcribeVoiceNote(
  audioUrl: string,
  fallbackLanguage: LanguageCode,
): Promise<VoiceNoteTranscript> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new AssemblyAI({ apiKey });

  // Someone recording a voice note in a translation app is quite likely not
  // speaking the language their profile says — that is the whole reason
  // they are here. Detect rather than assert, first.
  let transcript = await attemptTranscribe(client, audioUrl, { language_detection: true });

  if (isLanguageDetectionFailure(transcript)) {
    // Detection is its own, narrower model and doesn't recognise every
    // language this app now does — Yoruba included (see the module doc
    // comment). Once detection itself is what failed, naming the sender's
    // profile language directly is a far better bet than refusing the
    // recording outright.
    transcript = await attemptTranscribe(client, audioUrl, {
      language_detection: false,
      language_code: fallbackLanguage,
    });
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
