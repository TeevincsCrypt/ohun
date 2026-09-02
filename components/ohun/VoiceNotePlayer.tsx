"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays back the original recording attached to a voice note.
 *
 * Sits above the transcript rather than replacing it: the transcript is
 * what the other side can actually read, and the audio is what was really
 * said. Someone who shares the sender's language may prefer the voice;
 * someone who does not still has the text.
 */

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "0:00";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** A fixed, decorative waveform. Real amplitudes are not stored. */
const BARS = [5, 9, 14, 8, 17, 11, 20, 13, 7, 16, 10, 18, 6, 12, 9, 15, 8, 11, 5, 13];

export function VoiceNotePlayer({
  url,
  durationMs,
}: {
  url: string | null;
  durationMs: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onTime = () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    };

    audio.addEventListener("ended", onEnd);
    audio.addEventListener("timeupdate", onTime);
    // A signed URL that has expired, or a codec this browser cannot decode.
    audio.addEventListener("error", onEnd);

    return () => {
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("error", onEnd);
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      // Refused playback (no gesture credited, or a decode failure) — the
      // transcript below is still readable, so this stays quiet.
      setPlaying(false);
    }
  };

  if (!url) {
    return (
      <p className="mb-1.5 text-xs text-[var(--muted)]">Audio unavailable — transcript below.</p>
    );
  }

  const played = Math.round(progress * BARS.length);

  return (
    <div className="mb-2 flex items-center gap-2.5">
      <audio ref={audioRef} src={url} preload="none" />

      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-on)] transition-transform active:scale-95"
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 5.5v13l11-6.5-11-6.5z" />
          </svg>
        )}
      </button>

      <span aria-hidden className="flex h-6 flex-1 items-center gap-[2px]">
        {BARS.map((height, index) => (
          <span
            key={index}
            className="w-[3px] rounded-full transition-colors"
            style={{
              height: `${height}px`,
              background: index < played ? "var(--accent)" : "var(--border)",
            }}
          />
        ))}
      </span>

      <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
        {formatDuration(durationMs)}
      </span>
    </div>
  );
}
