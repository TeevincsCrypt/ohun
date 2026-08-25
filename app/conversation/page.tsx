"use client";

import { Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationHeader, PersonPanel } from "@/components/ohun";
import { getLanguage } from "@/types";
import { useTranscriptionSession } from "@/lib/assemblyai/useTranscriptionSession";

function ConversationContent() {
  const searchParams = useSearchParams();
  const yourLanguage = getLanguage(searchParams.get("you")) ?? getLanguage("en");
  const theirLanguage = getLanguage(searchParams.get("them")) ?? getLanguage("fr");

  const personA = useTranscriptionSession();

  const handleToggleMic = useCallback(() => {
    if (personA.micState === "disconnected" || personA.micState === "error") {
      void personA.start();
    } else {
      void personA.stop();
    }
  }, [personA]);

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <ConversationHeader connectionState={personA.connectionState} />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="grid flex-1 gap-6 sm:grid-cols-2">
          <PersonPanel
            label="Person A"
            language={yourLanguage}
            micState={personA.micState}
            transcript={personA.transcript}
            error={personA.error}
            onToggleMic={handleToggleMic}
          />
          <PersonPanel label="Person B" language={theirLanguage} />
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          Person A&apos;s microphone streams to AssemblyAI for live
          transcription. Translation and Person B&apos;s microphone are not
          connected yet — this screen shows the structure they&apos;ll plug
          into.
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
