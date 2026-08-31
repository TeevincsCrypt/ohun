import { toMicrophoneError, MicrophoneError } from "./errors";
import type { MicRecorder, MicRecorderConfig } from "./types";

/**
 * Browser-only. Captures the microphone via getUserMedia + an AudioWorklet,
 * resamples to 16kHz mono, and hands little-endian PCM16 chunks to the
 * caller. Knows nothing about AssemblyAI or any other transcription
 * provider — see lib/assemblyai/client.ts for where the chunks go.
 */

const TARGET_SAMPLE_RATE = 16_000;
const CHUNK_MS = 100;
const WORKLET_URL = "/worklets/mic-pcm-worklet.js";
const WORKLET_NAME = "mic-pcm-processor";

/** Linear-interpolation resampler, stateful across calls so chunk boundaries don't click. */
class LinearResampler {
  private readonly ratio: number;
  private lastSample = 0;
  private fractional = 0;

  constructor(
    private readonly sourceRate: number,
    private readonly targetRate: number,
  ) {
    this.ratio = sourceRate / targetRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.sourceRate === this.targetRate) {
      this.lastSample = input[input.length - 1] ?? this.lastSample;
      return input;
    }

    const outLength = Math.floor((input.length - this.fractional) / this.ratio);
    const output = new Float32Array(Math.max(outLength, 0));
    let pos = this.fractional;

    for (let out = 0; out < output.length; out++) {
      const index = Math.floor(pos);
      const frac = pos - index;
      const a = index === 0 ? this.lastSample : input[index - 1];
      const b = input[index];
      output[out] = a + (b - a) * frac;
      pos += this.ratio;
    }

    this.fractional = pos - input.length;
    this.lastSample = input[input.length - 1] ?? this.lastSample;
    return output;
  }
}

function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const output = new ArrayBuffer(input.length * 2);
  const view = new DataView(output);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return output;
}

export function createMicRecorder(config: MicRecorderConfig): MicRecorder {
  let audioContext: AudioContext | null = null;
  let workletNode: AudioWorkletNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let stream: MediaStream | null = null;
  /** True when the stream came from the caller, so teardown must not stop it. */
  let borrowedStream = false;
  let resampler: LinearResampler | null = null;
  /**
   * Set by stop(). The resume-wait below can run for several seconds, and
   * start() keeps using the audioContext/workletNode/stream closure
   * variables directly afterward — if stop() ran during that wait, those
   * are already null, and continuing would throw rather than fail quietly.
   */
  let stopped = false;

  async function start() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneError("unsupported", "This browser does not support microphone capture.");
    }

    if (config.stream) {
      stream = config.stream;
      borrowedStream = true;
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
      } catch (error) {
        throw toMicrophoneError(error);
      }
    }

    try {
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new MicrophoneError("unsupported", "This browser does not support the Web Audio API.");
      }

      audioContext = new AudioContextCtor({ sampleRate: TARGET_SAMPLE_RATE });
      if (!audioContext.audioWorklet) {
        throw new MicrophoneError(
          "unsupported",
          "This browser does not support AudioWorklet, which live transcription requires.",
        );
      }

      // An AudioContext can be constructed in "suspended" state and never
      // process a sample until explicitly resumed — this is separate from,
      // and not covered by, the getUserMedia permission that already
      // succeeded above. WebRTC's own audio never touches this context, so
      // the gap is invisible on the call itself: the other side hears you
      // fine while this graph — and therefore transcription — produces
      // nothing, silently, forever.
      //
      // Browsers are more willing to grant resume() the closer it runs to a
      // real user gesture. The caller who placed the call and then waited
      // out a long ring before the context is even created is in exactly
      // the worst position for this; the person answering, whose own
      // gesture (the Accept tap) lands moments before their context is
      // built, is in the best one — which is why this bug reads as
      // "transcription works for the person I called, not for me."
      await audioContext.resume().catch(() => {
        // Ignored here; the fallback below is what actually recovers this.
      });

      if (audioContext.state !== "running") {
        await new Promise<void>((resolve) => {
          const ctx = audioContext;
          if (!ctx) {
            resolve();
            return;
          }

          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            document.removeEventListener("pointerdown", tryResume, true);
            document.removeEventListener("keydown", tryResume, true);
            document.removeEventListener("touchstart", tryResume, true);
            resolve();
          };

          const tryResume = () => {
            void ctx.resume().finally(finish);
          };

          // The very next tap anywhere — mute, speaker, a caption, the page
          // itself — is a fresh gesture and resumes it. Capture phase, so
          // this fires before whatever the tap was actually for.
          document.addEventListener("pointerdown", tryResume, true);
          document.addEventListener("keydown", tryResume, true);
          document.addEventListener("touchstart", tryResume, true);

          // Some browsers grant this without a further gesture at all once
          // the page has been interacted with even once (the original
          // "Call" tap qualifies) — recheck on a short timer rather than
          // waiting indefinitely on a tap that may never come if that is
          // the case.
          const poll = setInterval(() => {
            if (ctx.state === "running") {
              clearInterval(poll);
              finish();
            }
          }, 250);

          // Caps how long a genuinely silent start can go before recording
          // begins anyway — better to try and fail than to block forever.
          setTimeout(() => {
            clearInterval(poll);
            finish();
          }, 8000);
        });

        // The call may have ended while this was waiting. Nothing has been
        // built yet at this point — stop() already closed the context — so
        // there is nothing to undo, just nowhere further to go.
        if (stopped) return;
      }

      if (audioContext.state !== "running") {
        // Recording still proceeds — better a context that starts working
        // the moment it does resume than no recorder at all — but this is
        // the exact condition that makes transcription silently produce
        // nothing, so it needs to be visible rather than swallowed.
        console.warn(
          `[ohun] AudioContext did not resume before starting (state: ${audioContext.state}). ` +
            "Transcription will stay silent until it does.",
        );
      }

      resampler = new LinearResampler(audioContext.sampleRate, TARGET_SAMPLE_RATE);

      await audioContext.audioWorklet.addModule(WORKLET_URL);
      // Same check, same reason, after the other await in this setup.
      if (stopped) return;

      sourceNode = audioContext.createMediaStreamSource(stream);
      workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME, {
        processorOptions: { chunkMs: CHUNK_MS },
      });

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!resampler) return;
        const resampled = resampler.process(event.data);
        if (resampled.length === 0) return;
        config.onAudioChunk(float32ToPcm16(resampled));
      };

      sourceNode.connect(workletNode);

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          config.onError(new MicrophoneError("unavailable", "The microphone was disconnected or stopped."));
        };
      });
    } catch (error) {
      stop();
      throw error instanceof MicrophoneError ? error : toMicrophoneError(error);
    }
  }

  function stop() {
    stopped = true;
    if (workletNode) {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
    }
    sourceNode?.disconnect();
    // Only stop tracks this recorder opened. A borrowed stream belongs to
    // the call, which is still using it to talk to the other participants.
    if (!borrowedStream) stream?.getTracks().forEach((track) => track.stop());
    void audioContext?.close();

    workletNode = null;
    sourceNode = null;
    stream = null;
    borrowedStream = false;
    audioContext = null;
    resampler = null;
  }

  return { start, stop };
}
