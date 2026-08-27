"use client";

import { speak, cancelSpeech } from "./player";
import type { LanguageCode } from "@/types";

/**
 * Serialises spoken translations.
 *
 * In a one-to-one call there is only ever one translation in flight, and
 * speak() cancels whatever came before — the right behaviour when the only
 * thing it could interrupt is a stale utterance of your own.
 *
 * In a group call that is wrong: several people can finish a sentence at
 * once, and cancelling would mean only the last one is ever heard. This
 * plays them in turn instead.
 */

interface QueueItem {
  text: string;
  languageCode: LanguageCode;
  /** Dropped if it has been waiting too long to still be worth hearing. */
  queuedAt: number;
}

/**
 * Past this, a queued line is stale: the conversation has moved on and
 * hearing it now would be more confusing than not hearing it at all.
 */
const MAX_WAIT_MS = 12_000;

/** Never let a backlog build past this; the oldest are dropped first. */
const MAX_QUEUE = 4;

export class SpeechQueue {
  private items: QueueItem[] = [];
  private speaking = false;
  private stopped = false;
  private readonly onSpeakingChange?: (speaking: boolean) => void;

  /**
   * @param onSpeakingChange Fired on each transition into and out of
   * speaking. Callers use it to duck other audio and — importantly — to
   * stop feeding the microphone to transcription, since synthesized speech
   * comes out of the same speakers the microphone is listening to.
   */
  constructor(options: { onSpeakingChange?: (speaking: boolean) => void } = {}) {
    this.onSpeakingChange = options.onSpeakingChange;
  }

  private setSpeaking(next: boolean): void {
    if (this.speaking === next) return;
    this.speaking = next;
    this.onSpeakingChange?.(next);
  }

  /** Adds a line to be spoken once everything ahead of it has finished. */
  enqueue(text: string, languageCode: LanguageCode): void {
    if (this.stopped || !text.trim()) return;

    this.items.push({ text, languageCode, queuedAt: Date.now() });
    if (this.items.length > MAX_QUEUE) this.items.splice(0, this.items.length - MAX_QUEUE);

    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.speaking || this.stopped) return;
    this.setSpeaking(true);

    try {
      while (this.items.length > 0 && !this.stopped) {
        const item = this.items.shift();
        if (!item) break;
        if (Date.now() - item.queuedAt > MAX_WAIT_MS) continue;

        try {
          await speak({ text: item.text, languageCode: item.languageCode });
        } catch {
          // A failed utterance must not stall everything behind it.
        }
      }
    } finally {
      this.setSpeaking(false);
    }
  }

  /** True while something is being spoken — used to duck the remote audio. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Drops anything pending and silences the current utterance. */
  clear(): void {
    this.items = [];
    cancelSpeech();
  }

  /** Permanent teardown; the queue cannot be reused afterwards. */
  stop(): void {
    this.stopped = true;
    this.clear();
    // Anything waiting on the speaking signal must be released, or the
    // microphone would stay suppressed after the call ends.
    this.setSpeaking(false);
  }
}
