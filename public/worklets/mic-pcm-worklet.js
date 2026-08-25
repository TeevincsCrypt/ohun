/**
 * AudioWorkletProcessor that buffers the mono mic input at the
 * AudioContext's native sample rate into fixed-size chunks and posts each
 * chunk to the main thread as a transferable Float32Array. Resampling to
 * the target rate and PCM16 packing happen on the main thread — see
 * lib/audio/recorder.ts — so this stays a small, dependency-free processor.
 */
class MicPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const chunkMs = (options && options.processorOptions && options.processorOptions.chunkMs) || 100;
    this.chunkSize = Math.round(sampleRate * (chunkMs / 1000));
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex++] = channel[i];
      if (this.bufferIndex === this.chunkSize) {
        const chunk = this.buffer;
        this.buffer = new Float32Array(this.chunkSize);
        this.bufferIndex = 0;
        this.port.postMessage(chunk, [chunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor("mic-pcm-processor", MicPcmProcessor);
