import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SUPPORTED_LANGUAGES, type CallLanguageCode } from "@/types";
import { MissingAnthropicKeyError, TranslationFailedError } from "@/lib/translation/translate";

/**
 * Turns a finished conversation into a short summary, written once per
 * language present so nobody has to read a recap of their own call in
 * someone else's language.
 */

const MODEL = "claude-opus-5";
const MAX_TOKENS = 4000;

/**
 * Below this there is nothing worth summarising, and a recap of a two-line
 * call reads worse than no recap at all.
 */
export const MIN_UTTERANCES_FOR_SUMMARY = 4;

export interface SummaryUtterance {
  speaker: string;
  text: string;
  language: CallLanguageCode;
}

function languageName(code: CallLanguageCode): string {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

function buildSystemPrompt(targets: CallLanguageCode[]): string {
  return [
    `You summarise a voice conversation that has just ended.`,
    ``,
    `The participants spoke different languages and were translated for each`,
    `other in real time. You are given what each person actually said, in`,
    `their own language, in order.`,
    ``,
    `Write a short summary — a few sentences, or up to five bullet points if`,
    `the conversation had distinct parts. Cover what was discussed, anything`,
    `decided, and anything either side said they would do.`,
    ``,
    `Rules:`,
    `- Summarise only what was said. Never infer, advise, or add anything.`,
    `- If nothing was decided, say what was discussed and stop. Do not invent`,
    `  action items to fill out the shape of a summary.`,
    `- Refer to people by the names given.`,
    `- The transcript comes from speech recognition and may contain errors.`,
    `  Where the meaning is clear despite them, summarise the meaning; where a`,
    `  passage is unintelligible, leave it out rather than guessing.`,
    `- Keep every version the same length and substance — these are the same`,
    `  summary for different readers, not different summaries.`,
    ``,
    `Output ONLY a JSON object, no code fence and no commentary, with exactly`,
    `these keys, each holding the summary written in that language:`,
    `{`,
    targets.map((code) => `  "${code}": the summary in ${languageName(code)}`).join(",\n"),
    `}`,
  ].join("\n");
}

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

export async function generateSummary({
  utterances,
  languages,
}: {
  utterances: SummaryUtterance[];
  languages: CallLanguageCode[];
}): Promise<Partial<Record<CallLanguageCode, string>>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingAnthropicKeyError();

  const targets = [...new Set(languages)];
  if (targets.length === 0 || utterances.length < MIN_UTTERANCES_FOR_SUMMARY) return {};

  const transcript = utterances
    .map((line) => `${line.speaker} (${languageName(line.language)}): ${line.text}`)
    .join("\n");

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Not in the latency path — the call is already over — so this one gets
    // room to think, unlike the live translation calls.
    output_config: { effort: "medium" },
    system: buildSystemPrompt(targets),
    messages: [{ role: "user", content: transcript }],
  });

  if (response.stop_reason === "refusal") {
    throw new TranslationFailedError("the summary was declined");
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!raw) throw new TranslationFailedError("the response was empty");

  const parsed = parseJsonObject(raw);

  const summaries: Partial<Record<CallLanguageCode, string>> = {};
  for (const code of targets) {
    const value = parsed[code];
    if (typeof value === "string" && value.trim()) summaries[code] = value.trim();
  }

  return summaries;
}
