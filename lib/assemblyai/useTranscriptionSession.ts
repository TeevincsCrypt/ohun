"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createMicRecorder } from "@/lib/audio/recorder";
import { MicrophoneError } from "@/lib/audio/errors";
import type { MicRecorder } from "@/lib/audio/types";
import { createTranscriptionStream } from "./client";
import { TranscriptionError } from "./errors";
import type { TranscriptionStream } from "./types";
import type { ConnectionState, MicState } from "@/types";

interface TranscriptionSessionState {
  connectionState: ConnectionState;
  micState: MicState;
  transcript: string;
  error: string | null;
}

const initialState: TranscriptionSessionState = {
  connectionState: "disconnected",
  micState: "disconnected",
  transcript: "",
  error: null,
};

/**
 * Drives one participant's mic -> AssemblyAI transcription session and
 * exposes the state their panel needs to render. Not implemented for
 * translation or playback — this phase only gets real transcript text
 * onto the screen.
 */
export function useTranscriptionSession() {
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

  const composeTranscript = useCallback(
    () => [priorTurnsRef.current, currentTurnTextRef.current].filter(Boolean).join(" "),
    [],
  );

  const resetTranscriptState = useCallback(() => {
    priorTurnsRef.current = "";
    currentTurnOrderRef.current = null;
    currentTurnTextRef.current = "";
  }, []);

  /** Releases mic + socket resources without touching visible state (used by both stop() and error paths). */
  const teardown = useCallback(async () => {
    recorderRef.current?.stop();
    recorderRef.current = null;

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
    await teardown();
    if (mountedRef.current) {
      setState((current) => ({ ...current, connectionState: "disconnected", micState: "disconnected" }));
    }
  }, [teardown]);

  const start = useCallback(async () => {
    const generation = (generationRef.current += 1);
    const isCurrent = () => mountedRef.current && generationRef.current === generation;

    setState({ ...initialState, connectionState: "connecting", micState: "connecting" });
    resetTranscriptState();

    const fail = (message: string) => {
      if (!isCurrent()) return;
      setState((current) => ({ ...current, connectionState: "error", micState: "error", error: message }));
    };

    try {
      const stream = await createTranscriptionStream({
        onOpen: () => {
          if (!isCurrent()) return;
          setState((current) => ({ ...current, connectionState: "connected", micState: "listening" }));
        },
        onTranscript: ({ turnOrder, text }) => {
          if (currentTurnOrderRef.current !== null && turnOrder !== currentTurnOrderRef.current) {
            priorTurnsRef.current = [priorTurnsRef.current, currentTurnTextRef.current]
              .filter(Boolean)
              .join(" ");
            currentTurnTextRef.current = "";
          }
          currentTurnOrderRef.current = turnOrder;
          currentTurnTextRef.current = text;

          if (!isCurrent()) return;
          setState((current) => ({ ...current, transcript: composeTranscript() }));
        },
        onError: (error) => {
          if (!isCurrent()) return;
          fail(error.message);
          void teardown();
        },
        onClose: (code) => {
          if (!isCurrent() || code === 1000) return;
          fail("The transcription connection was lost.");
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
  }, [composeTranscript, resetTranscriptState, teardown]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      void teardown();
    };
  }, [teardown]);

  return { ...state, start, stop };
}
