"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationHeader, PersonPanel } from "@/components/ohun";
import { getLanguage, SUPPORTED_LANGUAGES, type ConnectionState, type Language } from "@/types";
import { useTranscriptionSession } from "@/lib/assemblyai/useTranscriptionSession";

const DEFAULT_YOUR_LANGUAGE = SUPPORTED_LANGUAGES[0];
const DEFAULT_THEIR_LANGUAGE = SUPPORTED_LANGUAGES[1];

/** The header shows the most active of the two sessions. */
function combineConnectionStates(a: ConnectionState, b: ConnectionState): ConnectionState {
  const priority: ConnectionState[] = [
    "connected",
    "connecting",
    "reconnecting",
    "error",
    "disconnected",
  ];
  return priority.find((state) => a === state || b === state) ?? "disconnected";
}

function ConversationContent() {
  const searchParams = useSearchParams();
  const yourLanguage: Language = getLanguage(searchParams.get("you")) ?? DEFAULT_YOUR_LANGUAGE;
  const theirLanguage: Language = getLanguage(searchParams.get("them")) ?? DEFAULT_THEIR_LANGUAGE;

  const personA = useTranscriptionSession({
    language: yourLanguage.code,
    targetLanguage: theirLanguage.code,
  });
  const personB = useTranscriptionSession({
    language: theirLanguage.code,
    targetLanguage: yourLanguage.code,
  });

  const toggle = useCallback(
    (session: typeof personA, other: typeof personB) => () => {
      if (session.micState === "disconnected" || session.micState === "error") {
        // Only one mic at a time — otherwise each side transcribes the
        // other's translation playback back into the conversation.
        if (other.micState === "listening" || other.micState === "connecting") {
          void other.stop();
        }
        void session.start();
      } else {
        void session.stop();
      }
    },
    [],
  );

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <ConversationHeader
        connectionState={combineConnectionStates(
          personA.connectionState,
          personB.connectionState,
        )}
      />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="grid flex-1 gap-6 sm:grid-cols-2">
          <PersonPanel
            label="Person A"
            language={yourLanguage}
            targetLanguage={theirLanguage}
            micState={personA.micState}
            transcript={personA.transcript}
            translation={personA.translation}
            isTranslating={personA.isTranslating}
            error={personA.error}
            translationError={personA.translationError}
            canSpeakAloud={personA.canSpeakAloud}
            onToggleMic={toggle(personA, personB)}
            onRepeatTranslation={
              personA.hasTranslation && personA.canSpeakAloud
                ? personA.repeatTranslation
                : undefined
            }
          />
          <PersonPanel
            label="Person B"
            language={theirLanguage}
            targetLanguage={yourLanguage}
            micState={personB.micState}
            transcript={personB.transcript}
            translation={personB.translation}
            isTranslating={personB.isTranslating}
            error={personB.error}
            translationError={personB.translationError}
            canSpeakAloud={personB.canSpeakAloud}
            onToggleMic={toggle(personB, personA)}
            onRepeatTranslation={
              personB.hasTranslation && personB.canSpeakAloud
                ? personB.repeatTranslation
                : undefined
            }
          />
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          Tap a microphone and speak. What you say is transcribed, translated
          into the other language, and spoken aloud. One microphone runs at a
          time so each side doesn&apos;t hear the other&apos;s playback.
        </p>
      </main>
    </div>
  );
}

export default function ConversationPage() {
  return (
    <Suspense fallback={null}>
      <ConversationContent />
    </Suspense>
  );
}
