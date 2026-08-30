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
 * The model for a single-language session. English has a dedicated model
 * that is the fastest thing available; everything else uses the
 * multilingual one. Neither needs detection — there is nothing to detect
 * between when only one language is in play.
 */
function speechModelFor(language: LanguageCode): StreamingSpeechModel {
  return language === "en" ? "universal-streaming-english" : "universal-streaming-multilingual";
}

/**
 * Opens one streaming session with a given model, wired and connected.
 *
 * Separated out so the caller can attempt a preferred configuration and
 * fall back without duplicating the wiring — see createTranscriptionStream.
 */
async function openSession(
  config: TranscriptionStreamConfig,
  options: {
    token: string;
    speechModel: StreamingSpeechModel;
    languages: LanguageCode[];
    /** Language steering and detection — Universal-3.5 Pro only. */
    withLanguageOptions: boolean;
  },
): Promise<TranscriptionStream> {
  const { token, speechModel, languages, withLanguageOptions } = options;

  const transcriber = new StreamingTranscriber({
    token,
    sampleRate: STREAMING_SAMPLE_RATE,
    formatTurns: true,
    speechModel,
    ...(withLanguageOptions ? { languageCodes: languages, languageDetection: true } : {}),
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
    // The model reports what it actually heard. Only trust it when it names
    // a language this conversation contains: a stray detection outside the
    // room would send the translator a source nobody is speaking.
    const detected = event.language_code as LanguageCode | undefined;
    const usable = detected && languages.includes(detected) ? detected : undefined;

    config.onTranscript({
      turnOrder: event.turn_order,
      text: event.transcript,
      isFinal: event.end_of_turn,
      detectedLanguage: usable,
      languageConfidence: event.language_confidence,
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
    console.error("[assemblyai] streaming error:", error, { speechModel, hasOpened });
    if (!hasOpened) return;
    config.onError(new TranscriptionError("connection", error.message));
  });

  transcriber.on("close", (code: number, reason: string) => {
    if (code !== 1000) {
      console.error("[assemblyai] socket closed:", { code, reason, speechModel, hasOpened });
    }
    if (!hasOpened) return;
    config.onClose?.(code, reason);
  });

  let beginEvent;
  try {
    beginEvent = await transcriber.connect();
  } catch (error) {
    // Closed explicitly: a failed connect can leave a socket the SDK is
    // still holding, and the fallback attempt must not inherit it.
    void transcriber.close().catch(() => {});
    throw new TranscriptionError(
      "connection",
      error instanceof Error
        ? `Could not connect to the transcription service: ${error.message}`
        : "Could not connect to the transcription service.",
    );
  }

  hasOpened = true;
  config.onOpen?.({ sessionId: beginEvent.id });
  console.info("[assemblyai] session open", { speechModel, languages });

  return {
    sendAudio: (chunk) => transcriber.sendAudio(chunk),
    close: () => transcriber.close(),
  };
}

export async function createTranscriptionStream(
  config: TranscriptionStreamConfig,
): Promise<TranscriptionStream> {
  const token = await fetchStreamingToken();

  // Deduplicated, and always including the speaker's own language even if
  // the caller forgot it.
  const languages = [...new Set([config.language, ...(config.languages ?? [])])];
  const multilingual = languages.length > 1;

  if (!multilingual) {
    return openSession(config, {
      token,
      speechModel: speechModelFor(config.language),
      languages,
      withLanguageOptions: false,
    });
  }

  try {
    return await openSession(config, {
      token,
      speechModel: "universal-3-5-pro",
      languages,
      withLanguageOptions: true,
    });
  } catch (error) {
    // Universal-3.5 Pro is the only model that accepts languageCodes, and
    // it may not be enabled on every account. Rather than let a whole
    // cross-language call go untranscribed — which is nearly every call
    // OHUN makes — fall back to the multilingual model that has always
    // worked, losing detection and code-switching but nothing else.
    console.warn(
      "[assemblyai] universal-3-5-pro unavailable, falling back to universal-streaming-multilingual",
      error,
    );

    // A fresh token: the first may have been consumed by the failed attempt.
    const fallbackToken = await fetchStreamingToken();
    return openSession(config, {
      token: fallbackToken,
      speechModel: "universal-streaming-multilingual",
      languages,
      withLanguageOptions: false,
    });
  }
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
