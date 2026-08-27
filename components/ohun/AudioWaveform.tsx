"use client";

import { useEffect, useRef } from "react";

/**
 * Bar-graph level meter driven by the actual audio in a MediaStream.
 *
 * Reads the stream through a Web Audio AnalyserNode rather than animating
 * on a timer, so the bars correspond to what is really being said. With no
 * stream (or a muted one) it settles to a flat idle line instead of
 * pretending there is sound.
 */
export function AudioWaveform({
  stream,
  active,
  color,
  bars = 28,
  className = "",
  mirrored = false,
}: {
  stream: MediaStream | null;
  /** False when muted or disconnected — the meter flattens. */
  active: boolean;
  /** CSS colour for the bars. */
  color: string;
  bars?: number;
  className?: string;
  /** Renders loudest-nearest-the-centre, for the right-hand side of a pair. */
  mirrored?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];

    // No stream to read: hold a low idle line rather than animating noise.
    if (!stream || !active) {
      children.forEach((bar) => {
        bar.style.transform = "scaleY(0.08)";
      });
      return;
    }

    // Safari still only exposes the prefixed constructor.
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    let context: AudioContext;
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;

    try {
      context = new AudioContextClass();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      // Small FFT: this is a level meter, not a spectrogram, and the
      // smaller window keeps it responsive.
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
    } catch {
      // A stream with no live audio track throws here. Nothing to meter.
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    const draw = () => {
      analyser.getByteFrequencyData(data);

      for (let index = 0; index < children.length; index += 1) {
        // Spread the bars across the lower, speech-dominant bins; the top
        // of the range is mostly empty for voice and would read as dead.
        const position = mirrored ? children.length - 1 - index : index;
        const bin = Math.floor((position / children.length) * (data.length * 0.7));
        const level = data[bin] / 255;
        // Floor keeps a visible baseline so the meter never disappears.
        children[index].style.transform = `scaleY(${Math.max(0.08, level * 1.25)})`;
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => {
        // Already closed by a teardown elsewhere.
      });
    };
  }, [stream, active, mirrored]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`flex h-10 items-center gap-[3px] ${className}`}
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className="h-full w-[3px] flex-1 rounded-full transition-transform duration-75 ease-out"
          style={{
            backgroundColor: color,
            transform: "scaleY(0.08)",
            // Fade toward the outer edges so the meter reads as a band
            // rather than a hard-edged block.
            opacity: 0.35 + 0.65 * Math.sin((index / bars) * Math.PI),
          }}
        />
      ))}
    </div>
  );
}
