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

export async function speak({ text, languageCode }: SpeechPlaybackOptions): Promise<void> {
  if (!isSpeechSupported() || !text.trim()) return;

  // Only one utterance should be audible at a time in a conversation.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageCode;

  const voice = findVoice(languageCode);
  if (voice) utterance.voice = voice;

  await new Promise<void>((resolve) => {
    // Resolve on either outcome — playback failing (no voice installed for
    // this language, autoplay blocked) must not break the conversation flow.
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}
