import "server-only";
import { MissingApiKeyError } from "./token";

/**
 * Server-side only. Text generation — translation and call summaries — via
 * AssemblyAI's LLM Gateway, an OpenAI-compatible chat-completions endpoint
 * authenticated with the same ASSEMBLYAI_API_KEY the speech-to-text uses.
 */

const ENDPOINT = "https://llm-gateway.assemblyai.com/v1/chat/completions";

/**
 * Overridable without a code change: the gateway's model list moves faster
 * than this file, and GET https://llm-gateway.assemblyai.com/v1/models
 * returns the IDs it currently accepts.
 */
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

/** Retried once: a single dropped connection shouldn't cost a live caption. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class LlmRequestFailedError extends Error {
  constructor(cause: string) {
    super(cause);
    this.name = "LlmRequestFailedError";
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
}

/**
 * The gateway's error bodies don't share one shape — a 400 names the bad
 * fields in `metadata.errors` rather than under `error` — so every known
 * field is read, and the raw body is the fallback when none of them match.
 */
function describeErrorBody(rawBody: string): string {
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    // Not JSON — the raw text below is all there is.
  }

  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
    else if (value && typeof value === "object") parts.push(JSON.stringify(value));
  };

  if (body) {
    const error = body.error;
    if (error && typeof error === "object" && "message" in error) add(error.message);
    else add(error);
    add(body.message);
    add(body.detail);
    const metadata = body.metadata as { errors?: unknown } | undefined;
    if (Array.isArray(metadata?.errors)) metadata.errors.forEach(add);
  }

  if (parts.length === 0 && rawBody.trim()) parts.push(rawBody.trim());
  return parts.join(" — ").slice(0, 600);
}

function errorMessage(rawBody: string, status: number, model: string): string {
  const detail = describeErrorBody(rawBody);
  // A 401/403 here is as often "this account can't use the LLM Gateway"
  // (free tier, no card on file) as a bad key.
  const hint =
    status === 401 || status === 403
      ? " (check the key, and that the AssemblyAI account is upgraded — the LLM Gateway is not available on the free tier)"
      : status === 400
        ? ` (model "${model}" — if the gateway doesn't recognise it, set ASSEMBLYAI_LLM_MODEL to an ID from https://llm-gateway.assemblyai.com/v1/models)`
        : status === 429
          ? " (rate limited)"
          : "";
  return `AssemblyAI LLM Gateway error ${status}${detail ? `: ${detail}` : ""}${hint}`;
}

export async function completeText({
  system,
  user,
  maxTokens,
  timeoutMs,
}: {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const model = process.env.ASSEMBLYAI_LLM_MODEL || DEFAULT_MODEL;

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt === 0;
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (canRetry) continue;
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new LlmRequestFailedError(
        timedOut
          ? "the AssemblyAI LLM Gateway did not respond in time"
          : `could not reach the AssemblyAI LLM Gateway${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    const rawBody = await response.text().catch(() => "");

    if (!response.ok) {
      if (canRetry && RETRYABLE_STATUS.has(response.status)) continue;
      throw new LlmRequestFailedError(errorMessage(rawBody, response.status, model));
    }

    let body: ChatCompletionResponse | null = null;
    try {
      body = JSON.parse(rawBody) as ChatCompletionResponse;
    } catch {
      throw new LlmRequestFailedError("the AssemblyAI LLM Gateway returned a response that wasn't JSON");
    }

    const choice = body?.choices?.[0];
    if (choice?.finish_reason === "content_filter") {
      throw new LlmRequestFailedError("the request was declined");
    }

    const text = choice?.message?.content?.trim();
    if (!text) throw new LlmRequestFailedError("the response was empty");
    return text;
  }
}
