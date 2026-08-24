"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConversationHeader, PersonPanel } from "@/components/ohun";
import { getLanguage } from "@/types";

function ConversationContent() {
  const searchParams = useSearchParams();
  const yourLanguage = getLanguage(searchParams.get("you")) ?? getLanguage("en");
  const theirLanguage = getLanguage(searchParams.get("them")) ?? getLanguage("fr");

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      <ConversationHeader connectionState="disconnected" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="grid flex-1 gap-6 sm:grid-cols-2">
          <PersonPanel label="Person A" language={yourLanguage} />
          <PersonPanel label="Person B" language={theirLanguage} />
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          Voice capture, transcription, and translation are not connected
          yet — this screen shows the structure the realtime system will
          plug into.
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
