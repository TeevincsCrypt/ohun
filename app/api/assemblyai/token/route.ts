import { NextResponse } from "next/server";
import { createStreamingToken, MissingApiKeyError, TokenRequestFailedError } from "@/lib/assemblyai/token";

/**
 * Mints a short-lived AssemblyAI streaming token for the client. The real
 * API key never leaves the server — see lib/assemblyai/token.ts.
 */
export async function POST() {
  try {
    const token = await createStreamingToken();
    return NextResponse.json({ token });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      console.error("[api/assemblyai/token]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (error instanceof TokenRequestFailedError) {
      console.error("[api/assemblyai/token]", error.message);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[api/assemblyai/token] unexpected error", error);
    return NextResponse.json(
      { error: "Could not create a transcription session." },
      { status: 500 },
    );
  }
}
