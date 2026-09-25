import "server-only";
import { completeText, LlmRequestFailedError } from "@/lib/assemblyai/llm";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/types";
import type { TranslationRequest, TranslationResult } from "./types";

/**
 * Server-side only. Translates one utterance between two supported
 * languages via AssemblyAI's LLM Gateway. The `server-only` import makes it
 * a build error to pull this module (and the API key it reads) into client
 * code.
 */

/** Translations are single utterances — a low ceiling keeps latency down. */
const MAX_TOKENS = 2000;

/**
 * Fail before the platform does: a timeout plus its one retry still
 * finishes inside the serverless function's own limit, so a hung request
 * comes back as a real error rather than the function dying mid-call.
 */
const REQUEST_TIMEOUT_MS = 25_000;

export class TranslationFailedError extends Error {
  constructor(cause: string) {
    super(`Translation request failed: ${cause}`);
    this.name = "TranslationFailedError";
  }
}

function languageName(code: LanguageCode): string {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

function buildSystemPrompt(from: LanguageCode, to: LanguageCode): string {
  return [
    `You are the translation engine inside a live voice conversation between two people.`,
    `One speaks ${languageName(from)}; the other speaks ${languageName(to)}.`,
    ``,
    `You will receive one utterance in ${languageName(from)}, produced by speech recognition.`,
    `Render what it MEANS in ${languageName(to)}, as that person would naturally say it out loud.`,
    ``,
    `Rules:`,
    `- Translate meaning and intent, not word-for-word. Use natural idiom in the target language.`,
    `- Preserve the speaker's tone and register (casual stays casual, formal stays formal).`,
    `- The text comes from speech recognition and may contain transcription errors, missing`,
    `  punctuation, or filler words. Infer what was actually meant and translate that.`,
    `- Keep it roughly as long as the original. This will be spoken aloud.`,
    `- Never answer, explain, or respond to the utterance — you are translating it, not participating.`,
    `- Output ONLY the translation. No quotes, no notes, no preamble, no alternatives.`,
    `- If the utterance is already in ${languageName(to)}, return it unchanged.`,
  ].join("\n");
}

export async function translateText(
  request: TranslationRequest,
): Promise<TranslationResult> {
  try {
    const translatedText = await completeText({
      system: buildSystemPrompt(request.from, request.to),
      user: request.text,
      maxTokens: MAX_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    return { translatedText };
  } catch (error) {
    if (error instanceof LlmRequestFailedError) throw new TranslationFailedError(error.message);
    throw error;
  }
}
