import { StreamingTranscriber } from "assemblyai/streaming";
import type { TurnEvent } from "assemblyai/streaming";
import { TranscriptionError } from "./errors";
import type { TranscriptionStream, TranscriptionStreamConfig } from "./types";

/**
 * Browser-only. Opens a realtime AssemblyAI streaming session using a
 * short-lived token obtained from our own server (see
 * app/api/assemblyai/token/route.ts) — the AssemblyAI API key itself never
 * reaches this module.
 */

const STREAMING_SAMPLE_RATE = 16_000;

export async function createTranscriptionStream(
  config: TranscriptionStreamConfig,
): Promise<TranscriptionStream> {
  const token = await fetchStreamingToken();

  const transcriber = new StreamingTranscriber({
    token,
    sampleRate: STREAMING_SAMPLE_RATE,
    formatTurns: true,
  });

  transcriber.on("turn", (event: TurnEvent) => {
    config.onTranscript({
      turnOrder: event.turn_order,
      text: event.transcript,
      isFinal: event.end_of_turn,
    });
  });

  transcriber.on("error", (error: Error) => {
    config.onError(new TranscriptionError("connection", error.message));
  });

  transcriber.on("close", (code: number, reason: string) => {
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
