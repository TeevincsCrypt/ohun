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
 * *it* can recognise.
 *
 * The dangerous part is HOW it fails. AssemblyAI's own confidence
 * threshold for automatic detection defaults to 0 — meaning, left
 * unconfigured, a language it can't really place is not reported as
 * "unknown": detection returns *some* language anyway, picked with low
 * confidence, and transcribes the audio as if it really were that
 * language. Real Yoruba speech in, low-confidence garbage text out in the
 * wrong language, translation then quietly has nothing usable to work
 * with, and nothing anywhere looks like a failure — confirmed directly:
 * one real recording surfaced as an outright error
 * ("language_detection cannot be performed on files with no spoken
 * audio"), a different one detected silently and wrongly and just never
 * translated, no error at all. transcribeVoiceNote() sets an explicit
 * `language_confidence_threshold`, which turns BOTH cases into the same
 * clean, catchable error, and retries once with the sender's own profile
 * language stated directly via `language_code` — sidestepping detection
 * entirely — instead of ever trusting a guess already known to be
 * unreliable below that threshold.
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

/**
 * Below this, a detected language is treated as not detected at all — see
 * the module doc comment for why leaving AssemblyAI's own default (0) was
 * the actual bug. 0.7 is AssemblyAI's own documented example value; not
 * independently tuned against real Yoruba recordings, since doing that
 * needs the live API, which this environment has no egress to.
 */
const LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

async function attemptTranscribe(
  client: AssemblyAI,
  audioUrl: string,
  languageOptions:
    | { language_detection: true; language_confidence_threshold: number }
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

export async function transcribeVoiceNote(
  audioUrl: string,
  fallbackLanguage: LanguageCode,
): Promise<VoiceNoteTranscript> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const client = new AssemblyAI({ apiKey });

  // Someone recording a voice note in a translation app is quite likely not
  // speaking the language their profile says — that is the whole reason
  // they are here. Detect rather than assert, first — but only trust a
  // confident detection; see LANGUAGE_CONFIDENCE_THRESHOLD.
  let transcript = await attemptTranscribe(client, audioUrl, {
    language_detection: true,
    language_confidence_threshold: LANGUAGE_CONFIDENCE_THRESHOLD,
  });

  if (transcript.status === "error") {
    // Whatever the reason detection failed — undetectable entirely, or
    // below the confidence threshold above — naming the sender's own
    // profile language directly sidesteps detection altogether, and is a
    // far better bet than either refusing the recording or transcribing
    // against a guess already known to be unreliable.
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
