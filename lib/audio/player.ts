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

/**
 * Whether speech has been unlocked by a user gesture in this page session.
 *
 * Browsers — phones especially — refuse speech that is not tied closely
 * enough to a real interaction, reporting `not-allowed` or, on some, simply
 * never speaking. Every translation this app speaks is triggered by the
 * *other* person talking, which is never a gesture on this device, so
 * without priming, playback is refused for the whole call and no
 * translation is ever heard.
 *
 * One real utterance inside a genuine gesture lifts that for the rest of
 * the page session. See primeSpeech.
 */
let primed = false;

/**
 * Unlocks speech. MUST be called synchronously inside a user gesture — an
 * onClick handler, before any await — or the browser will refuse it too.
 *
 * Speaking a single inaudible space is enough to satisfy the gesture
 * requirement; nothing is heard.
 */
export function primeSpeech(): void {
  if (primed || !isSpeechSupported()) return;
  primed = true;

  try {
    const warmup = new SpeechSynthesisUtterance(" ");
    warmup.volume = 0;
    window.speechSynthesis.speak(warmup);
    // Chrome can leave the synthesiser in a paused state after a page has
    // been backgrounded, in which case nothing is ever spoken again.
    window.speechSynthesis.resume();
    // Loading voices is itself gated behind the same interaction on some
    // browsers, so warm them here while we are allowed to.
    void ensureVoices();
  } catch {
    // Best effort. A browser that throws here would have refused anyway.
  }
}

/**
 * Primes speech on the first interaction anywhere on the page.
 *
 * A call has an obvious gesture to hang this off — answering it — but not
 * every entry point does, and a translation can arrive before the local
 * user has touched anything meaningful. Capture phase so it runs before
 * whatever the tap was actually for. Returns a cleanup function.
 */
export function installSpeechPrimer(): () => void {
  if (typeof document === "undefined") return () => {};
  if (primed) return () => {};

  const events = ["pointerdown", "keydown", "touchstart"] as const;

  const onGesture = () => {
    primeSpeech();
    remove();
  };

  const remove = () => {
    events.forEach((event) => document.removeEventListener(event, onGesture, true));
  };

  events.forEach((event) => document.addEventListener(event, onGesture, true));
  return remove;
}

/**
 * Resolves once the browser has published its voice list.
 *
 * getVoices() is empty until the engine has loaded them, which on a phone
 * happens well after the page does. Selecting a voice before then silently
 * falls back to the device default — so a French translation is read out
 * in an English voice, which is the difference between "it spoke" and "it
 * spoke their language".
 */
let voicesReady: Promise<void> | null = null;

function ensureVoices(): Promise<void> {
  if (!isSpeechSupported()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();

  voicesReady ??= new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      window.speechSynthesis.onvoiceschanged = null;
      resolve();
    };

    window.speechSynthesis.onvoiceschanged = finish;
    // Not every browser fires voiceschanged; some just populate the list.
    const poll = setInterval(() => {
      if (window.speechSynthesis.getVoices().length > 0) finish();
    }, 200);
    // Speaking with the default voice beats not speaking at all.
    const timer = setTimeout(finish, 3_000);
  });

  return voicesReady;
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

  // Without a loaded voice list this would read the translation in the
  // device's default voice — the right words in the wrong language.
  await ensureVoices();

  // Only one utterance should be audible at a time in a conversation.
  window.speechSynthesis.cancel();
  // A synthesiser left paused (backgrounding the tab does it on Chrome)
  // accepts utterances and never speaks them.
  window.speechSynthesis.resume();

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
    utterance.onerror = (event) => {
      // "not-allowed" is the browser refusing speech that is not tied to a
      // user gesture — the one failure here with a real remedy, so name it
      // rather than letting it look like a missing voice.
      const reason = (event as SpeechSynthesisErrorEvent).error;
      if (reason && reason !== "interrupted" && reason !== "canceled") {
        console.warn(`[ohun] speech failed (${reason})`, { languageCode, primed });
      }
      finish();
    };

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
