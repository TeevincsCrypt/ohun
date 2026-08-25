import "server-only";
import { AssemblyAI } from "assemblyai";

/**
 * Server-side only. Mints a short-lived AssemblyAI streaming token so the
 * browser can open a transcription session without ever seeing the real
 * API key. The `server-only` import makes it a build error to pull this
 * module into client code.
 */

const TOKEN_TTL_SECONDS = 60;

/** The server itself isn't configured correctly (missing API key). */
export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ASSEMBLYAI_API_KEY is not set on the server. Add it to your environment (see .env.example) and restart the server.",
    );
    this.name = "MissingApiKeyError";
  }
}

/** AssemblyAI itself rejected the token request (bad key, account issue, network, ...). */
export class TokenRequestFailedError extends Error {
  constructor(cause: string) {
    super(`AssemblyAI rejected the token request: ${cause}`);
    this.name = "TokenRequestFailedError";
  }
}

export async function createStreamingToken(): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const client = new AssemblyAI({ apiKey });

  try {
    return await client.streaming.createTemporaryToken({
      expires_in_seconds: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    throw new TokenRequestFailedError(error instanceof Error ? error.message : "Unknown error");
  }
}
