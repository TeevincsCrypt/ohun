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
  let resampler: LinearResampler | null = null;

  async function start() {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new MicrophoneError("unsupported", "This browser does not support microphone capture.");
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      throw toMicrophoneError(error);
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

      resampler = new LinearResampler(audioContext.sampleRate, TARGET_SAMPLE_RATE);

      await audioContext.audioWorklet.addModule(WORKLET_URL);
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
    if (workletNode) {
      workletNode.port.onmessage = null;
      workletNode.disconnect();
    }
    sourceNode?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    void audioContext?.close();

    workletNode = null;
    sourceNode = null;
    stream = null;
    audioContext = null;
    resampler = null;
  }

  return { start, stop };
}
