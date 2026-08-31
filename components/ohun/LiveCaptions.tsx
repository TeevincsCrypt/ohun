"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./UserResult";
import { PlayLineButton } from "./PlayLineButton";
import { LANGUAGE_FLAG, type CallCaption, type CallLanguageCode, type Profile } from "@/types";

type Filter = "both" | "original" | "translated";

const FILTER_LABEL: Record<Filter, string> = {
  both: "Both languages",
  original: "Original only",
  translated: "Translation only",
};

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
  onPlay,
}: {
  captions: CallCaption[];
  liveTranscript: string;
  isTranslating: boolean;
  self: Profile;
  other: Profile;
  /** Speaks one line aloud in a given language, on demand. */
  onPlay: (text: string, language: CallLanguageCode) => Promise<void> | void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState<Filter>("both");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [captions.length, liveTranscript]);

  const empty = captions.length === 0 && !liveTranscript;

  /** Plain-text export of the conversation so far. */
  const download = () => {
    const lines = captions.map((caption) => {
      const who = caption.fromSelf ? self.displayName : other.displayName;
      const time = new Date(caption.at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${time}] ${who}\n  ${caption.originalText}\n  ${caption.translatedText}\n`;
    });

    const blob = new Blob(
      [`OHUN conversation — ${self.displayName} & ${other.displayName}\n\n${lines.join("\n")}`],
      { type: "text/plain" },
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ohun-${other.username}-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M4 6h16M4 12h10M4 18h13" />
          </svg>
          Live transcript
        </p>
        <button
          type="button"
          onClick={download}
          disabled={captions.length === 0}
          aria-label="Download transcript"
          title="Download transcript"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 12 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {empty && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
              </svg>
            </span>
            <p className="max-w-[220px] text-sm text-[var(--muted)]">
              Start talking — what you say appears here, translated into{" "}
              {LANGUAGE_FLAG[other.preferredLanguage]}{" "}
              {other.displayName.split(" ")[0]}&apos;s language.
            </p>
          </div>
        )}

        {captions.map((caption) => {
          const speaker = caption.fromSelf ? self : other;
          const listener = caption.fromSelf ? other : self;
          // originalText is always in the speaker's language; translatedText
          // is always in whichever side did not speak it.
          const spokenLanguage = speaker.preferredLanguage as CallLanguageCode;
          const heardLanguage = listener.preferredLanguage as CallLanguageCode;
          const color = caption.fromSelf ? "var(--accent)" : "var(--peer)";
          const time = new Date(caption.at).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div key={caption.id} className="animate-rise flex gap-3">
              <div className="mt-0.5 shrink-0">
                <Avatar name={speaker.displayName} src={speaker.avatarUrl} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {caption.fromSelf ? "You" : speaker.displayName.split(" ")[0]}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">{time}</span>
                </p>

                {filter !== "translated" && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm leading-snug text-[var(--foreground)]">
                    <span className="min-w-0 flex-1">{caption.originalText}</span>
                    <span className="mt-[3px]">
                      <PlayLineButton
                        text={caption.originalText}
                        onPlay={() => onPlay(caption.originalText, spokenLanguage)}
                      />
                    </span>
                  </p>
                )}

                {/* For their speech this is what was spoken aloud here; for
                    your own it is what they heard. */}
                {filter !== "original" && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm leading-snug" style={{ color }}>
                    <span className="min-w-0 flex-1">{caption.translatedText}</span>
                    <span className="mt-[3px]">
                      <PlayLineButton
                        text={caption.translatedText}
                        onPlay={() => onPlay(caption.translatedText, heardLanguage)}
                      />
                    </span>
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {liveTranscript && (
          <div className="flex gap-3 opacity-60">
            <div className="mt-0.5 shrink-0">
              <Avatar name={self.displayName} src={self.avatarUrl} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">You</p>
              <p className="mt-0.5 text-sm leading-snug">{liveTranscript}</p>
              {isTranslating && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  Translating…
                </p>
              )}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          Live
        </span>

        <label className="sr-only" htmlFor="caption-filter">
          Transcript languages
        </label>
        <select
          id="caption-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--accent)]"
        >
          {(Object.keys(FILTER_LABEL) as Filter[]).map((option) => (
            <option key={option} value={option}>
              {FILTER_LABEL[option]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
