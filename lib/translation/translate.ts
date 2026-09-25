import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/types";
import type { TranslationRequest, TranslationResult } from "./types";

/**
 * Server-side only. Translates one utterance between two supported
 * languages using Claude. The `server-only` import makes it a build error
 * to pull this module (and the API key it reads) into client code.
 */

const MODEL = "claude-opus-5";

/** Translations are single utterances — a low ceiling keeps latency down. */
const MAX_TOKENS = 2000;

/**
 * Fail before the platform does.
 *
 * The SDK's default is a ten-minute timeout with two retries, which is far
 * longer than the serverless function is allowed to live. A call that hangs
 * would take the whole function down with it, and a dying function reaches
 * the browser as a network error rather than as anything this code can
 * report. Bounded so that a timeout plus its one retry still finishes
 * inside the function's own limit, leaving a real error to return.
 */
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 1;


export class MissingAnthropicKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set on the server. Add it to your environment (see .env.example) and restart the server.",
    );
    this.name = "MissingAnthropicKeyError";
  }
}

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
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MissingAnthropicKeyError();
  }

  const client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Translating a single utterance is a well-specified task, and this sits
      // in the latency path of a live conversation — minimal deliberation.
      output_config: { effort: "low" },
      system: buildSystemPrompt(request.from, request.to),
      messages: [{ role: "user", content: request.text }],
    });

    if (response.stop_reason === "refusal") {
      throw new TranslationFailedError("the translation was declined");
    }

    const translatedText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!translatedText) {
      throw new TranslationFailedError("no translation was returned");
    }

    return { translatedText };
  } catch (error) {
    if (error instanceof TranslationFailedError) {
      throw error;
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new TranslationFailedError("the Anthropic API key was rejected");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new TranslationFailedError("rate limited — too many requests");
    }
    // The API has no typed class for an exhausted balance — it arrives as a
    // generic 400 — so this is matched on the documented message text.
    if (error instanceof Anthropic.APIError && /credit balance is too low/i.test(error.message)) {
      throw new TranslationFailedError(
        "the Anthropic account is out of credits — add credits in the Anthropic Console under Plans & Billing",
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new TranslationFailedError(`Anthropic API error ${error.status}: ${error.message}`);
    }
    throw new TranslationFailedError(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
