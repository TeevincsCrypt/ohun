"use client";

import { speak, cancelSpeech, localeFor } from "./player";
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
  /**
   * Settles this item's enqueue() promise. Called on every exit — spoken,
   * failed, dropped as stale, or cleared — because a caller awaiting a line
   * that gets dropped would otherwise wait forever.
   */
  done: () => void;
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

  /**
   * Adds a line to be spoken once everything ahead of it has finished.
   *
   * The returned promise settles when this line is done with — spoken,
   * failed, or dropped — which is what lets a play button show a spinner
   * that means something rather than flashing once and clearing.
   */
  enqueue(text: string, languageCode: LanguageCode): Promise<void> {
    if (this.stopped || !text.trim()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.items.push({ text, languageCode, queuedAt: Date.now(), done: resolve });
      if (this.items.length > MAX_QUEUE) {
        // Settle what is dropped; nothing may be discarded unresolved.
        this.items.splice(0, this.items.length - MAX_QUEUE).forEach((item) => item.done());
      }

      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.speaking || this.stopped) return;
    this.setSpeaking(true);

    try {
      while (this.items.length > 0 && !this.stopped) {
        const item = this.items.shift();
        if (!item) break;
        if (Date.now() - item.queuedAt > MAX_WAIT_MS) {
          item.done();
          continue;
        }

        try {
          // localeFor here rather than at each call site, so every caller
          // gets the same voice selection: speak() matches on a BCP-47 tag,
          // and a bare "en" picks whichever English voice happens to sort
          // first rather than the intended en-US.
          await speak({ text: item.text, languageCode: localeFor(item.languageCode) });
        } catch {
          // A failed utterance must not stall everything behind it.
        } finally {
          item.done();
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
    const dropped = this.items;
    this.items = [];
    dropped.forEach((item) => item.done());
    // Releases the utterance in flight, whose own done() runs in drain().
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
