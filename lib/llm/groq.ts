import "server-only";

/**
 * Server-side only. Text generation — translation and call summaries — via
 * Groq's OpenAI-compatible chat-completions API. The `server-only` import
 * makes it a build error to pull this module (and the key it reads) into
 * client code.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Overridable without a code change, since Groq's free model list moves. */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

/** Retried once: a single dropped connection shouldn't cost a live caption. */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

export class MissingGroqKeyError extends Error {
  constructor() {
    super(
      "GROQ_API_KEY is not set on the server. Add it to your environment (see .env.example) and restart the server.",
    );
    this.name = "MissingGroqKeyError";
  }
}

export class LlmRequestFailedError extends Error {
  constructor(cause: string) {
    super(cause);
    this.name = "LlmRequestFailedError";
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
}

/** Reads every field an error body might use; the raw body is the fallback. */
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
  };

  if (body) {
    const error = body.error;
    if (error && typeof error === "object" && "message" in error) add(error.message);
    else add(error);
    add(body.message);
  }

  if (parts.length === 0 && rawBody.trim()) parts.push(rawBody.trim());
  return parts.join(" — ").slice(0, 600);
}

function errorMessage(rawBody: string, status: number, model: string): string {
  const detail = describeErrorBody(rawBody);
  const hint =
    status === 401
      ? " (GROQ_API_KEY was rejected — check it in the Groq console)"
      : status === 429
        ? " (Groq rate limit reached — the free tier allows 30 requests a minute and 1,000 a day)"
        : status === 400 || status === 404
          ? ` (model "${model}" — if Groq no longer serves it, set GROQ_MODEL to one listed in the Groq console)`
          : "";
  return `Groq error ${status}${detail ? `: ${detail}` : ""}${hint}`;
}

export async function completeText({
  system,
  user,
  maxTokens,
  timeoutMs,
  reasoningEffort,
}: {
  system: string;
  user: string;
  /** Includes the model's reasoning tokens, so leave headroom above the answer's length. */
  maxTokens: number;
  timeoutMs: number;
  reasoningEffort: "low" | "medium" | "high";
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new MissingGroqKeyError();

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt === 0;
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_completion_tokens: maxTokens,
          reasoning_effort: reasoningEffort,
          // Keeps the model's thinking out of the answer — it would otherwise
          // be spoken aloud as if it were the translation.
          include_reasoning: false,
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
          ? "Groq did not respond in time"
          : `could not reach Groq${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    const rawBody = await response.text().catch(() => "");

    if (!response.ok) {
      if (canRetry && RETRYABLE_STATUS.has(response.status)) continue;
      throw new LlmRequestFailedError(errorMessage(rawBody, response.status, model));
    }

    let body: ChatCompletionResponse;
    try {
      body = JSON.parse(rawBody) as ChatCompletionResponse;
    } catch {
      throw new LlmRequestFailedError("Groq returned a response that wasn't JSON");
    }

    const choice = body.choices?.[0];
    if (choice?.finish_reason === "content_filter") {
      throw new LlmRequestFailedError("the request was declined");
    }

    const text = choice?.message?.content?.trim();
    if (!text) {
      throw new LlmRequestFailedError(
        choice?.finish_reason === "length"
          ? "the response ran out of tokens before answering"
          : "the response was empty",
      );
    }
    return text;
  }
}
