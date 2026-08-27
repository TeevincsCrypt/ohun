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
}

interface SessionOptions {
  /** The language this participant speaks. */
  language: LanguageCode;
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
  /** Receives each completed utterance when translateManually is set. */
  onUtterance?: (text: string) => void | Promise<void>;
}

/**
 * Drives one participant's mic -> AssemblyAI transcription -> translation,
 * and either speaks the result here or hands it to the caller for delivery
 * elsewhere.
 */
export function useTranscriptionSession({
  language,
  targetLanguage,
  speakLocally = true,
  translateManually = false,
  onTranslation,
  onUtterance,
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

  // Held in a ref so a caller passing an inline arrow does not retrigger the
  // media effect on every render and tear down a live transcription stream.
  const onTranslationRef = useRef(onTranslation);
  onTranslationRef.current = onTranslation;

  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

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
    async (text: string, isCurrent: () => boolean) => {
      if (isCurrent()) {
        setState((current) => ({ ...current, isTranslating: true, translationError: null }));
      }
      try {
        await onUtteranceRef.current?.(text);
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
    async (text: string, isCurrent: () => boolean) => {
      translationAbortRef.current?.abort();
      const controller = new AbortController();
      translationAbortRef.current = controller;

      console.info("[ohun] translating", { from: language, to: targetLanguage, text });

      if (isCurrent()) {
        setState((current) => ({ ...current, isTranslating: true, translationError: null }));
      }

      try {
        const { translatedText } = await translateText(
          { text, from: language, to: targetLanguage },
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

        onTranslationRef.current?.({ originalText: text, translatedText });

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
    [language, targetLanguage, speakLocally],
  );

  /** Re-speak the most recent translation. */
  const repeatTranslation = useCallback(() => {
    const text = lastTranslationRef.current;
    if (!text) return;
    void speak({ text, languageCode: localeFor(targetLanguage) });
  }, [targetLanguage]);

  const start = useCallback(async () => {
    const generation = (generationRef.current += 1);
    const isCurrent = () => mountedRef.current && generationRef.current === generation;

    setState({ ...initialState, connectionState: "connecting", micState: "connecting" });
    resetTranscriptState();

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
        onOpen: () => {
          if (!isCurrent()) return;
          setState((current) => ({
            ...current,
            connectionState: "connected",
            micState: "listening",
          }));
        },
        onTranscript: ({ turnOrder, text, isFinal }) => {
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
            if (translateManually) {
              void delegateUtterance(text, isCurrent);
            } else {
              void translateAndSpeak(text, isCurrent);
            }
          }
        },
        onError: (error) => {
          if (!isCurrent()) return;
          fail(error.message);
          void teardown();
        },
        onClose: (code, reason) => {
          if (!isCurrent() || code === 1000) return;
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
        onAudioChunk: (chunk) => streamRef.current?.sendAudio(chunk),
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

  // Resolved after mount so server and first client render agree.
  const [canSpeakAloud, setCanSpeakAloud] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    setCanSpeakAloud(isSpeechSupported());
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      cancelSpeech();
      void teardown();
    };
  }, [teardown]);

  return {
    ...state,
    canSpeakAloud,
    hasTranslation: Boolean(state.translation),
    start,
    stop,
    repeatTranslation,
  };
}
