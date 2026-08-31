import type { LanguageCode } from "@/types";
import type { SpeechPlaybackOptions } from "./types";

/**
 * Browser-only. Speaks translated text aloud using the Web Speech API
 * (SpeechSynthesis), which ships in the browser — no API key, no network
 * call, and no additional dependency.
 */

/** Web Speech wants BCP-47 tags, not our bare ISO codes. */
const VOICE_LOCALE: Record<LanguageCode, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  it: "it-IT",
  yo: "yo-NG",
};

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function localeFor(language: LanguageCode): string {
  return VOICE_LOCALE[language] ?? language;
}

/**
 * Picks the best installed voice for a locale. Voice availability is
 * per-device; when nothing matches we return undefined and let the browser
 * fall back to its default voice rather than failing to speak.
 */
function findVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  const normalized = locale.toLowerCase();
  const language = normalized.split("-")[0];

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ??
    voices.find((voice) => voice.lang.toLowerCase().replace("_", "-") === normalized) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(language))
  );
}

/** Stops anything currently being spoken. */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

/**
 * How long to wait for an utterance to *start* before writing it off.
 *
 * On mobile, speech is frequently refused when it is not tied closely
 * enough to a user gesture. Most browsers report that as an `error` event,
 * but not all of them do — some queue the utterance and simply never speak
 * it, firing neither `start`, `end` nor `error`. Generous enough to cover a
 * slow voice load, short enough that a refusal does not hold anything up.
 */
const START_GRACE_MS = 5_000;

/** Hard ceiling on any single utterance, however long its text. */
const MAX_UTTERANCE_MS = 30_000;

/**
 * A speaking budget for this text: a slow speaking rate, plus headroom.
 * Only ever used to break a wait that is never going to end on its own.
 */
function budgetFor(text: string): number {
  return Math.min(MAX_UTTERANCE_MS, 5_000 + text.length * 120);
}

export async function speak({ text, languageCode }: SpeechPlaybackOptions): Promise<void> {
  if (!isSpeechSupported() || !text.trim()) return;

  // Only one utterance should be audible at a time in a conversation.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageCode;

  const voice = findVoice(languageCode);
  if (voice) utterance.voice = voice;

  await new Promise<void>((resolve) => {
    // This promise MUST settle. Callers hold the microphone away from
    // transcription for its whole duration — synthesized speech comes out
    // of the same speakers the microphone is listening to — so an utterance
    // that never reports an outcome does not merely go unheard: it silences
    // that participant's transcription for the rest of the call. That is a
    // far worse failure than a line being cut off, so every path below
    // resolves, and two timers guarantee one of them is reached.
    let settled = false;
    let started = false;
    const guards: ReturnType<typeof setTimeout>[] = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      guards.forEach(clearTimeout);
      resolve();
    };

    // Playback failing — no voice installed for this language, or playback
    // refused outright — must not break the conversation flow.
    utterance.onend = finish;
    utterance.onerror = finish;

    const startGuard = setTimeout(() => {
      if (started) return;
      console.warn("[ohun] speech never started; releasing the microphone");
      window.speechSynthesis.cancel();
      finish();
    }, START_GRACE_MS);
    guards.push(startGuard);

    utterance.onstart = () => {
      started = true;
      clearTimeout(startGuard);
    };

    guards.push(
      setTimeout(() => {
        console.warn("[ohun] speech never reported an end; releasing the microphone");
        window.speechSynthesis.cancel();
        finish();
      }, budgetFor(text)),
    );

    window.speechSynthesis.speak(utterance);
  });
}
