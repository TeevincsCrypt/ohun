"use client";

import { useEffect, useRef } from "react";
import { LANGUAGE_FLAG, type CallCaption, type CallLanguageCode, type Profile } from "@/types";

/**
 * The running translated conversation. Each entry shows what was said and,
 * beneath it, the same utterance in the reader's own language — which is
 * the line that was actually spoken aloud here.
 */
export function LiveCaptions({
  captions,
  liveTranscript,
  isTranslating,
  self,
  other,
}: {
  captions: CallCaption[];
  liveTranscript: string;
  isTranslating: boolean;
  self: Profile;
  other: Profile;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [captions.length, liveTranscript]);

  const empty = captions.length === 0 && !liveTranscript;

  return (
    <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Live translation
      </p>

      <div className="mt-4 flex max-h-64 flex-col gap-4 overflow-y-auto">
        {empty && (
          <p className="text-sm italic text-[var(--muted)]">
            Start talking — what you say is translated and spoken in{" "}
            {LANGUAGE_FLAG[other.preferredLanguage as CallLanguageCode]}{" "}
            {other.displayName.split(" ")[0]}&apos;s language.
          </p>
        )}

        {captions.map((caption) => {
          const speaker = caption.fromSelf ? self : other;
          const spokenLanguage = speaker.preferredLanguage as CallLanguageCode;

          return (
            <div key={caption.id} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--muted)]">
                {LANGUAGE_FLAG[spokenLanguage]}{" "}
                {caption.fromSelf ? "You" : speaker.displayName.split(" ")[0]}
              </span>
              <p className="text-sm text-[var(--foreground)]">
                &ldquo;{caption.originalText}&rdquo;
              </p>
              {/* For their speech this is what was spoken aloud here; for
                  your own it is what they heard. */}
              <p className="text-sm italic text-[var(--muted)]">
                &ldquo;{caption.translatedText}&rdquo;
              </p>
            </div>
          );
        })}

        {liveTranscript && (
          <div className="flex flex-col gap-1 opacity-70">
            <span className="text-xs font-medium text-[var(--muted)]">
              {LANGUAGE_FLAG[self.preferredLanguage as CallLanguageCode]} You
            </span>
            <p className="text-sm text-[var(--foreground)]">{liveTranscript}</p>
            {isTranslating && (
              <p className="text-xs italic text-[var(--muted)]">Translating…</p>
            )}
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
