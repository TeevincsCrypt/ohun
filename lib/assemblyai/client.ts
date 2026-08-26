import { StreamingTranscriber } from "assemblyai/streaming";
import type { StreamingSpeechModel, TurnEvent } from "assemblyai/streaming";
import { TranscriptionError } from "./errors";
import type { TranscriptionStream, TranscriptionStreamConfig } from "./types";
import type { LanguageCode } from "@/types";

/**
 * Browser-only. Opens a realtime AssemblyAI streaming session using a
 * short-lived token obtained from our own server (see
 * app/api/assemblyai/token/route.ts) — the AssemblyAI API key itself never
 * reaches this module.
 */

const STREAMING_SAMPLE_RATE = 16_000;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * AssemblyAI ships separate streaming models: an English-only one (fastest)
 * and a multilingual one covering English, Spanish, German, French,
 * Portuguese and Italian. Picking per-language is what makes French and
 * Spanish transcribe properly instead of being forced through the
 * English-tuned model.
 */
function speechModelFor(language: LanguageCode): StreamingSpeechModel {
  return language === "en"
    ? "universal-streaming-english"
    : "universal-streaming-multilingual";
}

export async function createTranscriptionStream(
  config: TranscriptionStreamConfig,
): Promise<TranscriptionStream> {
  const token = await fetchStreamingToken();

  const transcriber = new StreamingTranscriber({
    token,
    sampleRate: STREAMING_SAMPLE_RATE,
    formatTurns: true,
    speechModel: speechModelFor(config.language),
    // The SDK defaults to a 1000ms handshake budget, which is sized for a
    // server sitting close to AssemblyAI. From a browser that budget has to
    // cover DNS + TCP + TLS + the HTTP upgrade + the server's `Begin` frame,
    // which is easily over a second on a normal consumer connection or from
    // a region far from AssemblyAI's infrastructure. Give it real headroom.
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxConnectionRetries: 3,
    connectionRetryDelay: 750,
  });

  transcriber.on("turn", (event: TurnEvent) => {
    config.onTranscript({
      turnOrder: event.turn_order,
      text: event.transcript,
      isFinal: event.end_of_turn,
    });
  });

  // The SDK's connect() retries internally, and its cleanup between attempts
  // (discardPendingSocket) calls `socket.removeAllListeners?.()` — a Node `ws`
  // method that does not exist on the browser's native WebSocket. So in a
  // browser the listeners survive, and the subsequent `socket.close()` fires a
  // spurious close (code 1006) for a socket the SDK already abandoned. Those
  // events must not be reported as "the connection dropped", or they mask the
  // real reason connect() ultimately fails. Only forward close/error once the
  // session has genuinely opened.
  let hasOpened = false;

  transcriber.on("error", (error: Error) => {
    console.error("[assemblyai] streaming error:", error, { hasOpened });
    if (!hasOpened) return;
    config.onError(new TranscriptionError("connection", error.message));
  });

  transcriber.on("close", (code: number, reason: string) => {
    if (code !== 1000) {
      console.error("[assemblyai] socket closed:", { code, reason, hasOpened });
    }
    if (!hasOpened) return;
    config.onClose?.(code, reason);
  });

  let beginEvent;
  try {
    beginEvent = await transcriber.connect();
  } catch (error) {
    throw new TranscriptionError(
      "connection",
      error instanceof Error
        ? `Could not connect to the transcription service: ${error.message}`
        : "Could not connect to the transcription service.",
    );
  }

  hasOpened = true;
  config.onOpen?.({ sessionId: beginEvent.id });

  return {
    sendAudio: (chunk) => transcriber.sendAudio(chunk),
    close: () => transcriber.close(),
  };
}

async function fetchStreamingToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/assemblyai/token", { method: "POST" });
  } catch {
    throw new TranscriptionError("connection", "Could not reach the transcription server.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new TranscriptionError(
      response.status === 500 ? "server-config" : "auth",
      body?.error ?? "Could not authenticate with the transcription service.",
    );
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}
