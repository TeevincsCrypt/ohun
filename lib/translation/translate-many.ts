import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/types";
import { MissingAnthropicKeyError, TranslationFailedError } from "./translate";

/**
 * Translates one utterance into several languages in a single request.
 *
 * A group call needs the same sentence in every other language in the room.
 * Doing that as N separate calls would multiply both cost and latency, and
 * the latency sits directly in the conversation. One request returning a
 * JSON object is markedly cheaper and arrives together, so nobody in the
 * room hears their translation noticeably later than anyone else.
 */

const MODEL = "claude-opus-5";
const MAX_TOKENS = 2000;

function languageName(code: LanguageCode): string {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

function buildSystemPrompt(from: LanguageCode, targets: LanguageCode[]): string {
  const list = targets.map((code) => `  "${code}": the utterance in ${languageName(code)}`);

  return [
    `You are the translation engine inside a live group voice call.`,
    `One participant is speaking ${languageName(from)}. Other participants in the call`,
    `speak: ${targets.map(languageName).join(", ")}.`,
    ``,
    `You will receive one utterance in ${languageName(from)}, produced by speech recognition.`,
    `Render what it MEANS in each target language, as a native speaker would say it aloud.`,
    ``,
    `Rules:`,
    `- Translate meaning and intent, not word-for-word. Use natural idiom in each language.`,
    `- Preserve the speaker's tone and register (casual stays casual, formal stays formal).`,
    `- The text comes from speech recognition and may contain transcription errors, missing`,
    `  punctuation, or filler words. Infer what was actually meant and translate that.`,
    `- Keep each translation roughly as long as the original. These will be spoken aloud.`,
    `- Never answer, explain, or respond to the utterance — you are translating it, not participating.`,
    ``,
    `Output ONLY a JSON object, no code fence and no commentary, with exactly these keys:`,
    `{`,
    list.join(",\n"),
    `}`,
  ].join("\n");
}

export interface TranslateManyRequest {
  text: string;
  from: LanguageCode;
  to: LanguageCode[];
}

export interface TranslateManyResult {
  byLanguage: Partial<Record<LanguageCode, string>>;
}

/** Tolerates a stray code fence, which the model occasionally adds anyway. */
function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new TranslationFailedError("no JSON object in the response");

  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TranslationFailedError("the response was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function translateToMany({
  text,
  from,
  to,
}: TranslateManyRequest): Promise<TranslateManyResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingAnthropicKeyError();

  const targets = [...new Set(to)].filter((code) => code !== from);
  if (targets.length === 0) return { byLanguage: {} };

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // In the latency path of a live conversation — minimal deliberation.
      output_config: { effort: "low" },
      system: buildSystemPrompt(from, targets),
      messages: [{ role: "user", content: text }],
    });

    if (response.stop_reason === "refusal") {
      throw new TranslationFailedError("the translation was declined");
    }

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!raw) throw new TranslationFailedError("the response was empty");

    const parsed = parseJsonObject(raw);

    // Keep only the languages actually asked for: a stray extra key must not
    // become a caption nobody can read.
    const byLanguage: Partial<Record<LanguageCode, string>> = {};
    for (const code of targets) {
      const value = parsed[code];
      if (typeof value === "string" && value.trim()) byLanguage[code] = value.trim();
    }

    if (Object.keys(byLanguage).length === 0) {
      throw new TranslationFailedError("no usable translations in the response");
    }

    return { byLanguage };
  } catch (error) {
    if (error instanceof TranslationFailedError || error instanceof MissingAnthropicKeyError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new TranslationFailedError("the response was not valid JSON");
    }
    throw new TranslationFailedError(
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
