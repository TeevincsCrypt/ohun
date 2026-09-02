"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendTextMessage, sendVoiceNote } from "@/lib/chat/actions";
import type { ChatMessage } from "@/types";

/**
 * The message box: type, or hold to record.
 *
 * Voice notes upload straight from the browser to storage and only then
 * hand the object key to a server action. Audio does not go through the
 * action itself — a minute of Opus is comfortably past a server action's
 * body limit, and routing it through the server would double the transfer
 * for no benefit.
 */

/** Long enough to be a sentence; short enough not to be a podcast. */
const MAX_RECORDING_MS = 120_000;

/** Below this it is a mis-tap, not a message. */
const MIN_RECORDING_MS = 500;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The best container this browser will record.
 *
 * Safari has no Opus-in-WebM; Chrome and Firefox prefer it. An empty string
 * lets MediaRecorder pick its own default, which is always better than
 * throwing on an unsupported type.
 */
function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export function ChatComposer({
  threadId,
  onSent,
}: {
  threadId: string;
  /** Shows the message immediately rather than waiting for the round trip. */
  onSent: (message: ChatMessage) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  /** Set when the user cancels, so the stop handler discards instead of sending. */
  const abandonedRef = useRef(false);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => releaseMicrophone, [releaseMicrophone]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
    return () => clearInterval(timer);
  }, [recording]);

  const submitText = async () => {
    const value = text.trim();
    if (!value || busy) return;

    setBusy(true);
    setError(null);
    // Cleared up front: leaving the text in place while the request is in
    // flight invites a second send of the same message.
    setText("");

    const result = await sendTextMessage(threadId, value);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      // Give it back rather than losing what they wrote.
      setText(value);
      return;
    }
    if (result.message) onSent(result.message);
  };

  const upload = useCallback(
    async (blob: Blob, mimeType: string, durationMs: number) => {
      setBusy(true);
      setError(null);

      const supabase = createClient();
      // The thread id has to lead the path: the storage policy reads it to
      // decide who may fetch the object back.
      const path = `${threadId}/${crypto.randomUUID()}.${extensionFor(mimeType)}`;

      const { error: uploadError } = await supabase.storage
        .from("voice-notes")
        .upload(path, blob, { contentType: mimeType || "audio/webm", upsert: false });

      if (uploadError) {
        setBusy(false);
        setError("That recording could not be uploaded.");
        return;
      }

      const result = await sendVoiceNote(threadId, path, durationMs);
      setBusy(false);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.message) onSent(result.message);
    },
    [threadId, onSent],
  );

  const startRecording = async () => {
    if (busy || recording) return;
    setError(null);
    abandonedRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Microphone access is needed to record a voice note.");
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    startedAtRef.current = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const parts = chunksRef.current;
      const type = recorder.mimeType || mimeType || "audio/webm";
      releaseMicrophone();
      setRecording(false);
      setElapsed(0);

      if (abandonedRef.current) return;
      if (durationMs < MIN_RECORDING_MS || parts.length === 0) {
        setError("That was too short to send.");
        return;
      }
      void upload(new Blob(parts, { type }), type, durationMs);
    };

    recorder.start();
    setRecording(true);
    setElapsed(0);

    // A recording nobody stops would otherwise run until the tab closes.
    setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === "recording") recorder.stop();
    }, MAX_RECORDING_MS);
  };

  const stopRecording = (abandon: boolean) => {
    abandonedRef.current = abandon;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
      {error && (
        <p className="mb-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

      {recording ? (
        <div className="flex items-center gap-3">
          <span className="flex flex-1 items-center gap-2.5 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--danger)]" />
            <span className="text-sm font-medium tabular-nums">{formatDuration(elapsed)}</span>
            <span className="text-xs text-[var(--muted)]">Recording…</span>
          </span>

          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="h-11 rounded-full px-4 text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            aria-label="Send voice note"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-on)] transition-transform active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.39 10l12.6 2-12.6 2z" />
            </svg>
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitText();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a new line, as every chat does.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitText();
              }
            }}
            rows={1}
            placeholder="Write in your language…"
            disabled={busy}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--accent-border)] disabled:opacity-60"
          />

          {text.trim() ? (
            <button
              type="submit"
              disabled={busy}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-on)] transition-transform active:scale-95 disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3.4 20.4 21 12 3.4 3.6 3.39 10l12.6 2-12.6 2z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={busy}
              aria-label="Record a voice note"
              title="Record a voice note"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] transition-colors hover:border-[var(--accent-border)] disabled:opacity-50"
            >
              {busy ? (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                  <path d="M12 18v3" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
