"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMicRecorder } from "@/lib/audio/recorder";
import { MicrophoneError } from "@/lib/audio/errors";
import type { MicRecorder } from "@/lib/audio/types";
import { speak, cancelSpeech, localeFor, isSpeechSupported } from "@/lib/audio/player";
import { translateText, TranslationError } from "@/lib/translation/client";
import { createTranscriptionStream } from "./client";
import { TranscriptionError } from "./errors";
import type { TranscriptionStream } from "./types";
import type { ConnectionState, LanguageCode, MicState } from "@/types";

interface TranscriptionSessionState {
  connectionState: ConnectionState;
  micState: MicState;
  /** What this participant said, in their own language. */
  transcript: string;
  /** The translation the other participant hears. */
  translation: string;
  isTranslating: boolean;
  error: string | null;
  translationError: string | null;
}

/**
 * How many times a dropped session is reopened before giving up. Enough to
 * ride out a timeout or a network blip; low enough that a configuration
 * that can never connect surfaces as an error instead of retrying forever.
 */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Multiplied by the attempt number, so retries back off as they repeat. */
const RECONNECT_BASE_DELAY_MS = 600;

/**
 * A zeroed buffer matching the shape of a real chunk.
 *
 * Allocated fresh rather than cached per size: the SDK buffers audio and
 * flushes it on a timer, so a chunk handed to sendAudio may still be held
 * when the next one arrives. Reusing one instance is an aliasing hazard in
 * exchange for saving a few kilobytes a second.
 */
function silenceLike(chunk: ArrayBuffer): ArrayBuffer {
  return new ArrayBuffer(chunk.byteLength);
}

const initialState: TranscriptionSessionState = {
  connectionState: "disconnected",
  micState: "disconnected",
  transcript: "",
  translation: "",
  isTranslating: false,
  error: null,
  translationError: null,
};

export interface TranslationPayload {
  /** What the speaker said, in their own language. */
  originalText: string;
  /** The same utterance rendered in the listener's language. */
  translatedText: string;
  /** The language it was actually spoken in — detected, not assumed. */
  spokenLanguage: LanguageCode;
}

interface SessionOptions {
  /** The language this participant is expected to speak. */
  language: LanguageCode;
  /** Every language in the conversation, for detection and code-switching. */
  languages?: LanguageCode[];
  /** The language their speech is translated into. */
  targetLanguage: LanguageCode;
  /**
   * Speak the translation on this device. True for the single-device demo
   * at /conversation, where both participants share one browser. False in
   * a call, where the translation has to be spoken on the *other* person's
   * device — see onTranslation.
   */
  speakLocally?: boolean;
  /** Fired once an utterance has been translated, for delivery to the peer. */
  onTranslation?: (payload: TranslationPayload) => void;
  /**
   * Skip the built-in one-to-one translation and hand each finished
   * utterance to onUtterance instead. A group call needs the same sentence
   * in several languages at once, which this hook's single `targetLanguage`
   * cannot express — so the caller does that part itself.
   */
  translateManually?: boolean;
  /**
   * Receives each completed utterance when translateManually is set, along
   * with the language it was actually spoken in — which is not always the
   * one the speaker's profile claims.
   */
  onUtterance?: (text: string, spokenLanguage: LanguageCode) => void | Promise<void>;
  /**
   * A microphone stream the caller already holds, shared rather than
   * captured again. See MicRecorderConfig.stream — a call passes the one
   * WebRTC is using so that muting affects both.
   */
  stream?: MediaStream | null;
}

/**
 * Drives one participant's mic -> AssemblyAI transcription -> translation,
 * and either speaks the result here or hands it to the caller for delivery
 * elsewhere.
 */
export function useTranscriptionSession({
  language,
  languages,
  targetLanguage,
  speakLocally = true,
  translateManually = false,
  onTranslation,
  onUtterance,
  stream,
}: SessionOptions) {
  const [state, setState] = useState<TranscriptionSessionState>(initialState);

  const recorderRef = useRef<MicRecorder | null>(null);
  const streamRef = useRef<TranscriptionStream | null>(null);
  const mountedRef = useRef(true);

  // Bumped by every start()/stop() call. Async callbacks and continuations
  // from an older call check this before touching state or refs, so a stray
  // "connecting" that resolves after the user already hit stop (or started
  // again) can't clobber the newer session.
  const generationRef = useRef(0);

  // Accumulated transcript text: everything before the in-progress turn,
  // plus the in-progress turn's current text. Keyed off turnOrder so a
  // formatted-vs-unformatted resend of the same turn replaces rather than
  // duplicates.
  const priorTurnsRef = useRef("");
  const currentTurnOrderRef = useRef<number | null>(null);
  const currentTurnTextRef = useRef("");

  /** Turn indices already sent for translation, so a repeated final doesn't re-translate. */
  const translatedTurnsRef = useRef(new Set<number>());
  const translationAbortRef = useRef<AbortController | null>(null);
  /** Latest translation, kept for the "Repeat translation" button. */
  const lastTranslationRef = useRef("");

  /**
   * Reasons transcription input is currently withheld. Audio is still
   * captured; it just is not sent for transcription while any reason holds.
   *
   * A set rather than a flag because the reasons are independent and
   * overlap. Muting while a translation is playing, then the translation
   * finishing, must not un-mute — which is exactly what a single boolean
   * would do, since whichever cause cleared last would win.
   *
   * The two reasons in use:
   *   "playback" — a synthesized translation is being spoken. It comes out
   *     of the same speakers the microphone is listening to, and browser
   *     echo cancellation covers the WebRTC render path rather than
   *     speechSynthesis, so without this the app transcribes its own output.
   *   "muted" — the user muted themselves. Transcription captures the
   *     microphone through its own getUserMedia, separate from the one
   *     WebRTC holds, so disabling the outgoing track silences peers but
   *     leaves transcription running. Muting has to stop both, or a muted
   *     participant is still captioned and translated to the room.
   */
  const suppressReasonsRef = useRef(new Set<string>());

  // Held in a ref so a caller passing an inline arrow does not retrigger the
  // media effect on every render and tear down a live transcription stream.
  const onTranslationRef = useRef(onTranslation);
  onTranslationRef.current = onTranslation;

  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  const streamRefOption = useRef(stream);
  streamRefOption.current = stream;

  /**
   * Held in a ref, not a dependency.
   *
   * `languages` is an array, so a caller writing it inline — which is the
   * natural way to write it — hands this hook a new reference on every
   * render. As a dependency of start() that makes start() a new function
   * every render, and the effect that owns the session then tears it down
   * and opens another. With a duration timer rendering once a second, that
   * meant a fresh token, WebSocket and AudioContext every second for the
   * whole call, which is enough churn to take the peer connection down
   * with it.
   *
   * The set only matters when a session is opened, so reading it at that
   * moment is both sufficient and immune to the caller's array identity.
   */
  const languagesRef = useRef(languages);
  languagesRef.current = languages;

  /**
   * Whether a session is meant to be running.
   *
   * Set by start() and cleared by stop(), so an unexpected close can tell a
   * session that dropped from one the caller deliberately ended.
   */
  const shouldRunRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set by start() so a reconnect can call it without a circular reference. */
  const startRef = useRef<(() => Promise<void>) | null>(null);

  const composeTranscript = useCallback(
    () => [priorTurnsRef.current, currentTurnTextRef.current].filter(Boolean).join(" "),
    [],
  );

  const resetTranscriptState = useCallback(() => {
    priorTurnsRef.current = "";
    currentTurnOrderRef.current = null;
    currentTurnTextRef.current = "";
    translatedTurnsRef.current = new Set();
    lastTranslationRef.current = "";
  }, []);

  /** Releases mic + socket resources without touching visible state. */
  const teardown = useCallback(async () => {
    recorderRef.current?.stop();
    recorderRef.current = null;

    translationAbortRef.current?.abort();
    translationAbortRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      try {
        await stream.close();
      } catch {
        // Already closing/closed — nothing to do.
      }
    }
  }, []);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    // Cleared first: a reconnect scheduled moments ago must not reopen a
    // session the caller has just ended.
    shouldRunRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    cancelSpeech();
    await teardown();
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        connectionState: "disconnected",
        micState: "disconnected",
      }));
    }
  }, [teardown]);

  /**
   * Hands a finished utterance to the caller, which owns the translation.
   * Mirrors translateAndSpeak's state handling so the "Translating…"
   * indicator behaves the same in either mode.
   */
  const delegateUtterance = useCallback(
    async (text: string, spokenLanguage: LanguageCode, isCurrent: () => boolean) => {
      if (isCurrent()) {
        setState((current) => ({ ...current, isTranslating: true, translationError: null }));
      }
      try {
        await onUtteranceRef.current?.(text, spokenLanguage);
      } catch (error) {
        console.error("[ohun] utterance handler failed", error);
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          translationError: "Could not translate that.",
        }));
      } finally {
        if (isCurrent()) {
          setState((current) => ({ ...current, isTranslating: false }));
        }
      }
    },
    [],
  );

  /** Translate one finished utterance, then speak it in the listener's language. */
  const translateAndSpeak = useCallback(
    async (text: string, spokenLanguage: LanguageCode, isCurrent: () => boolean) => {
      translationAbortRef.current?.abort();
      const controller = new AbortController();
      translationAbortRef.current = controller;

      console.info("[ohun] translating", { from: spokenLanguage, to: targetLanguage, text });

      if (isCurrent()) {
        setState((current) => ({ ...current, isTranslating: true, translationError: null }));
      }

      try {
        const { translatedText } = await translateText(
          { text, from: spokenLanguage, to: targetLanguage },
          { signal: controller.signal },
        );

        console.info("[ohun] translated", { translatedText });

        if (!isCurrent()) return;
        lastTranslationRef.current = translatedText;
        setState((current) => ({
          ...current,
          translation: translatedText,
          isTranslating: false,
        }));

        onTranslationRef.current?.({ originalText: text, translatedText, spokenLanguage });

        if (speakLocally) {
          await speak({ text: translatedText, languageCode: localeFor(targetLanguage) });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("[ohun] translation failed", error);
        if (!isCurrent()) return;
        setState((current) => ({
          ...current,
          isTranslating: false,
          translationError:
            error instanceof TranslationError ? error.message : "Could not translate that.",
        }));
      }
    },
    [targetLanguage, speakLocally],
  );

  /** Re-speak the most recent translation. */
  const repeatTranslation = useCallback(() => {
    const text = lastTranslationRef.current;
    if (!text) return;
    void speak({ text, languageCode: localeFor(targetLanguage) });
  }, [targetLanguage]);

  const start = useCallback(async () => {
    const generation = (generationRef.current += 1);

    // Opening a session while one is already live means something upstream
    // is restarting it. That is not fatal, but it costs a token, a
    // handshake and an AudioContext each time, and at any frequency it will
    // destabilise the call it is running inside — so say so rather than
    // quietly absorbing it.
    if (streamRef.current) {
      console.warn(
        "[ohun] transcription restarted while a session was already open — check the effect's dependencies",
      );
    }
    const isCurrent = () => mountedRef.current && generationRef.current === generation;

    shouldRunRef.current = true;

    setState({ ...initialState, connectionState: "connecting", micState: "connecting" });
    resetTranscriptState();

    /**
     * Reopens a session that dropped while the call was still going.
     *
     * A streaming session can end for reasons that have nothing to do with
     * the call: an inactivity timeout after a quiet stretch, a network
     * blip, a server-side restart. Treating any of those as terminal meant
     * one drop ended transcription for the rest of the call, which is what
     * "it stopped working after I muted" actually was.
     *
     * Bounded, so a genuinely broken configuration surfaces as an error
     * rather than retrying forever.
     */
    const reconnect = (why: string) => {
      if (!isCurrent() || !shouldRunRef.current) return false;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return false;

      const attempt = (reconnectAttemptsRef.current += 1);
      const delay = RECONNECT_BASE_DELAY_MS * attempt;
      console.warn(`[ohun] transcription dropped (${why}); reconnecting in ${delay}ms`, {
        attempt,
      });

      if (isCurrent()) {
        setState((current) => ({
          ...current,
          connectionState: "connecting",
          micState: "connecting",
          error: null,
        }));
      }

      void teardown();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        // Only if nothing newer has taken over in the meantime.
        if (mountedRef.current && shouldRunRef.current) void startRef.current?.();
      }, delay);

      return true;
    };

    const fail = (message: string) => {
      if (!isCurrent()) return;
      setState((current) => ({
        ...current,
        connectionState: "error",
        micState: "error",
        error: message,
      }));
    };

    try {
      const stream = await createTranscriptionStream({
        language,
        languages: languagesRef.current,
        onOpen: () => {
          if (!isCurrent()) return;
          // A session that actually opened means the budget is spent on
          // drops, not on a configuration that can never connect.
          reconnectAttemptsRef.current = 0;
          setState((current) => ({
            ...current,
            connectionState: "connected",
            micState: "listening",
          }));
        },
        onTranscript: ({ turnOrder, text, isFinal, detectedLanguage }) => {
          // Whether `isFinal` (AssemblyAI's end_of_turn) ever becomes true is
          // the difference between "translation never fires" and "translation
          // fired and failed" — log it so the console distinguishes them.
          console.info("[ohun] turn", { turnOrder, isFinal, chars: text.length });

          if (currentTurnOrderRef.current !== null && turnOrder !== currentTurnOrderRef.current) {
            priorTurnsRef.current = [priorTurnsRef.current, currentTurnTextRef.current]
              .filter(Boolean)
              .join(" ");
            currentTurnTextRef.current = "";
          }
          currentTurnOrderRef.current = turnOrder;
          currentTurnTextRef.current = text;

          if (isCurrent()) {
            setState((current) => ({ ...current, transcript: composeTranscript() }));
          }

          // Translate only completed utterances — partials would spam the API
          // and produce translations of half-finished sentences.
          if (isFinal && text.trim() && !translatedTurnsRef.current.has(turnOrder)) {
            translatedTurnsRef.current.add(turnOrder);
            // What was heard beats what the profile claims.
            const spoken = detectedLanguage ?? language;
            if (translateManually) {
              void delegateUtterance(text, spoken, isCurrent);
            } else {
              void translateAndSpeak(text, spoken, isCurrent);
            }
          }
        },
        onError: (error) => {
          if (!isCurrent()) return;
          if (reconnect(error.message)) return;
          fail(error.message);
          void teardown();
        },
        onClose: (code, reason) => {
          if (!isCurrent()) return;

          // Which side ended the session is recorded in shouldRunRef. It is
          // NOT readable from the close code.
          //
          // This used to return early whenever the code was 1000, on the
          // assumption that a normal closure could only be one we asked for.
          // It is not: AssemblyAI ends a session on its own too — an
          // inactivity timeout, a session-length limit, a token expiring, a
          // server-side rotation — by sending a Termination frame and
          // closing normally, which reaches us as exactly the same 1000.
          //
          // So a session the server ended was swallowed in silence: no
          // reconnect, no error, the indicator still reading "connected",
          // and nothing transcribed for the rest of the call. A long mute is
          // the likeliest way to reach it, because a muted track feeds the
          // session an unbroken run of pure silence — which is why this
          // presents as "mute broke transcription", and why fixes aimed at
          // the audio path never came near it.
          //
          // stop() clears shouldRunRef before closing the socket, so a close
          // we did ask for still lands here and is still ignored.
          if (!shouldRunRef.current) return;

          if (reconnect(`code ${code}${reason ? `: ${reason}` : ""}`)) return;
          fail(
            `The transcription connection was lost (code ${code}${reason ? `: ${reason}` : ""}).`,
          );
          void teardown();
        },
      });

      if (!isCurrent()) {
        // A newer start()/stop() already took over — discard this session.
        await stream.close().catch(() => {});
        return;
      }
      streamRef.current = stream;

      const recorder = createMicRecorder({
        stream: streamRefOption.current ?? undefined,
        onAudioChunk: (chunk) => {
          // Suppressed audio is replaced with silence rather than dropped,
          // so the session keeps receiving a continuous feed.
          //
          // This matters for the "playback" reason, where the microphone is
          // live and genuinely picking up our own synthesized speech. It is
          // close to a no-op for "muted": a disabled MediaStreamTrack still
          // drives the worklet, it just drives it with zeros, so the chunks
          // arriving here are already silent. (Measured, not assumed —
          // Chromium posts chunks at the same rate either way.)
          //
          // Either way the guarantee is the one that matters: a muted
          // participant must not be captioned, and playback must not be
          // transcribed back into the room.
          if (suppressReasonsRef.current.size > 0) {
            streamRef.current?.sendAudio(silenceLike(chunk));
            return;
          }
          streamRef.current?.sendAudio(chunk);
        },
        onError: (error) => {
          if (!isCurrent()) return;
          fail(error.message);
          void teardown();
        },
      });
      recorderRef.current = recorder;
      await recorder.start();

      if (!isCurrent()) {
        recorder.stop();
      }
    } catch (error) {
      if (!isCurrent()) return;
      const message =
        error instanceof TranscriptionError || error instanceof MicrophoneError
          ? error.message
          : "Something went wrong starting the microphone.";
      fail(message);
      await teardown();
    }
  }, [
    composeTranscript,
    delegateUtterance,
    language,
    resetTranscriptState,
    teardown,
    translateAndSpeak,
    translateManually,
  ]);

  // Published so a scheduled reconnect can reach the current start()
  // without start() having to reference itself.
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // Resolved after mount so server and first client render agree.
  const [canSpeakAloud, setCanSpeakAloud] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    setCanSpeakAloud(isSpeechSupported());
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      shouldRunRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      cancelSpeech();
      void teardown();
    };
  }, [teardown]);

  /** Gate transcription input under a named reason — see suppressReasonsRef. */
  const setInputSuppressed = useCallback((suppressed: boolean, reason: string) => {
    if (suppressed) suppressReasonsRef.current.add(reason);
    else suppressReasonsRef.current.delete(reason);
  }, []);

  return {
    ...state,
    canSpeakAloud,
    hasTranslation: Boolean(state.translation),
    start,
    stop,
    repeatTranslation,
    setInputSuppressed,
  };
}
