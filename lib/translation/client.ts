import type { TranslationRequest, TranslationResult } from "./types";

export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}

/**
 * Browser-only. Sends one utterance to our own translation route, which
 * calls Claude server-side. The Anthropic API key never reaches the client.
 */
export async function translateText(
  request: TranslationRequest,
  options?: { signal?: AbortSignal },
): Promise<TranslationResult> {
  let response: Response;
  try {
    response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new TranslationError("Could not reach the translation server.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new TranslationError(body?.error ?? "Could not translate that.");
  }

  return (await response.json()) as TranslationResult;
}
