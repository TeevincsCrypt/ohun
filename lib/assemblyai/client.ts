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
 * How long a session may go without speech before AssemblyAI ends it.
 *
 * The default is far shorter than a conversation. Silence is normal on a
 * call — someone mutes, or simply listens for a while — and it is not a
 * sign the session should be torn down. Set generously so a quiet stretch
 * does not end transcription for the rest of the call.
 */
const INACTIVITY_TIMEOUT_SECONDS = 3600;

/**
 * English has a dedicated model that is the fastest thing available;
 * everything else uses the multilingual one, which covers every language
 * calls support.
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
    inactivityTimeout: INACTIVITY_TIMEOUT_SECONDS,
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

/**
 * Universal-3.5 Pro is opt-in, and off by default.
 *
 * It is the only model that accepts `languageCodes`, so it is what makes
 * detection and mid-sentence code-switching possible — but it is not
 * enabled on every account, and an account without it does not fail
 * cleanly. The session connects and then simply never emits a turn, which
 * looks exactly like working audio with no transcription and produces no
 * error to catch. A connect-failure fallback does not help, because the
 * connect succeeds.
 *
 * Rather than gamble the core feature on that, the default is the model
 * that has always worked. Set NEXT_PUBLIC_ASSEMBLYAI_PRO=true to try the
 * newer one on an account known to have it.
 */
function proModelEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ASSEMBLYAI_PRO === "true";
}

export async function createTranscriptionStream(
  config: TranscriptionStreamConfig,
): Promise<TranscriptionStream> {
  const token = await fetchStreamingToken();

  // Deduplicated, and always including the speaker's own language even if
  // the caller forgot it.
  const languages = [...new Set([config.language, ...(config.languages ?? [])])];
  const usePro = languages.length > 1 && proModelEnabled();

  if (!usePro) {
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
    // Only catches a refused connection. A session that opens and stays
    // silent is why this model is opt-in rather than the default.
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
