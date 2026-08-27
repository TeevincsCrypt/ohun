"use client";

import { useEffect, useRef } from "react";
import { LANGUAGE_FLAG, type CallCaption, type CallLanguageCode, type Profile } from "@/types";

const captionStyles = `
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .caption-entry { animation: slide-in 0.3s ease-out; }
`;

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
    <>
      <style>{captionStyles}</style>
      <div className="w-full rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface)]/80 p-6 text-left backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Live translation
          </p>
        </div>

        <div className="mt-4 flex max-h-64 flex-col gap-3 overflow-y-auto pr-2">
          {empty && (
            <p className="text-sm italic text-[var(--muted)] py-8 text-center">
              <span className="block mb-2">🎤</span>
              Start talking — what you say is translated and spoken in{" "}
              {LANGUAGE_FLAG[other.preferredLanguage as CallLanguageCode]}{" "}
              {other.displayName.split(" ")[0]}&apos;s language.
            </p>
          )}

          {captions.map((caption) => {
            const speaker = caption.fromSelf ? self : other;
            const spokenLanguage = speaker.preferredLanguage as CallLanguageCode;

            return (
              <div key={caption.id} className="caption-entry border-l-2 border-emerald-500/30 pl-4 py-2">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                  <span>{LANGUAGE_FLAG[spokenLanguage]}</span>
                  <span>{caption.fromSelf ? "You" : speaker.displayName.split(" ")[0]}</span>
                </span>
                <p className="text-sm text-[var(--foreground)] mt-1 font-medium">
                  &ldquo;{caption.originalText}&rdquo;
                </p>
                <p className="text-sm text-[var(--muted)] mt-1 italic opacity-75">
                  &ldquo;{caption.translatedText}&rdquo;
                </p>
              </div>
            );
          })}

          {liveTranscript && (
            <div className="caption-entry border-l-2 border-amber-500/30 pl-4 py-2">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1">
                <span>{LANGUAGE_FLAG[self.preferredLanguage as CallLanguageCode]}</span>
                <span>You</span>
              </span>
              <p className="text-sm text-[var(--foreground)] mt-1">{liveTranscript}</p>
              {isTranslating && (
                <p className="text-xs text-amber-400 mt-1.5 font-medium flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Translating…
                </p>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>
    </>
  );
}
