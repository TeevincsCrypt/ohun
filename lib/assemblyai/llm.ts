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
  error?: { message?: string } | string;
}

function errorMessage(body: ChatCompletionResponse | null, status: number): string {
  const raw = typeof body?.error === "string" ? body.error : body?.error?.message;
  // A 401/403 here is as often "this account can't use the LLM Gateway"
  // (free tier, no card on file) as a bad key, so the gateway's own
  // explanation is always passed through.
  const hint =
    status === 401 || status === 403
      ? " (check the key, and that the AssemblyAI account is upgraded — the LLM Gateway is not available on the free tier)"
      : status === 429
        ? " (rate limited)"
        : "";
  return `AssemblyAI LLM Gateway error ${status}${raw ? `: ${raw}` : ""}${hint}`;
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

    const body = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

    if (!response.ok) {
      if (canRetry && RETRYABLE_STATUS.has(response.status)) continue;
      throw new LlmRequestFailedError(errorMessage(body, response.status));
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
