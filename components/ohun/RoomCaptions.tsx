"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./UserResult";
import {
  CALL_LANGUAGE_CODES,
  LANGUAGE_FLAG,
  getCallLanguage,
  type CallLanguageCode,
  type Room,
  type RoomCaption,
} from "@/types";

/**
 * One line of an utterance, labelled with its language.
 *
 * The reader's own language is emphasised because it is the one spoken
 * aloud here; the rest are shown so anyone can follow, or check, what the
 * other people in the call are hearing.
 */
function LanguageLine({
  code,
  text,
  tone,
  note,
}: {
  code: CallLanguageCode | undefined;
  text: string;
  tone: "original" | "mine" | "other";
  note?: string;
}) {
  if (!text) return null;

  const styles = {
    original: "text-[var(--foreground)]",
    mine: "text-[var(--peer)] font-medium",
    other: "text-[var(--muted)]",
  }[tone];

  return (
    <p className="mt-1 flex gap-2 text-sm leading-snug" title={note}>
      {/* Fixed width so every line starts at the same column. The labels
          differ in length, and a ragged left edge makes a stack of four
          translations much harder to scan. */}
      <span
        className="mt-[3px] flex w-[42px] shrink-0 select-none items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
        title={code ? getCallLanguage(code)?.label : undefined}
      >
        <span aria-hidden>{code ? LANGUAGE_FLAG[code] : "🏳"}</span>
        {code ? code.toUpperCase() : "??"}
      </span>
      <span className={`min-w-0 flex-1 ${styles}`}>
        {text}
        {/* Marks the line that was actually spoken aloud on this device,
            without widening the label column. */}
        {tone === "mine" && (
          <span
            aria-label="spoken aloud here"
            className="ml-1.5 inline-block align-middle text-[9px] text-[var(--peer)] opacity-70"
          >
            ◂ heard
          </span>
        )}
      </span>
    </p>
  );
}

/**
 * The running conversation in a group call.
 *
 * Each entry shows what the speaker said and, beneath it, the version in
 * the reader's own language — the line that was actually spoken aloud here.
 */
export function RoomCaptions({
  captions,
  liveTranscript,
  isTranslating,
  room,
  selfId,
  myLanguage,
}: {
  captions: RoomCaption[];
  liveTranscript: string;
  isTranslating: boolean;
  room: Room;
  selfId: string;
  myLanguage: CallLanguageCode;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [captions.length, liveTranscript]);

  const self = room.participants.find((participant) => participant.userId === selfId);
  const empty = captions.length === 0 && !liveTranscript;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
        Live transcript
      </p>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {empty && (
          <p className="py-10 text-center text-sm text-[var(--muted)]">
            Start talking — everything said here is translated into each person&apos;s own
            language.
          </p>
        )}

        {captions.map((caption) => {
          const speaker = room.participants.find(
            (participant) => participant.userId === caption.speakerId,
          );
          const fromSelf = caption.speakerId === selfId;
          const spokenIn = speaker?.language;

          // Every language the utterance was rendered into, in a stable
          // order so the list does not reshuffle between messages, with the
          // reader's own first because it is the one spoken aloud here.
          const translations = CALL_LANGUAGE_CODES.filter(
            (code) => code !== spokenIn && Boolean(caption.byLanguage[code]),
          ).sort((a, b) => Number(b === myLanguage) - Number(a === myLanguage));

          return (
            <div key={caption.id} className="animate-rise flex gap-3">
              <div className="mt-0.5 shrink-0">
                <Avatar
                  name={speaker?.profile.displayName ?? "?"}
                  src={speaker?.profile.avatarUrl}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold tracking-tight">
                    {fromSelf ? "You" : (speaker?.profile.displayName.split(" ")[0] ?? "Someone")}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">
                    {new Date(caption.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>

                {/* What was actually said, labelled with the language it
                    was said in. */}
                <LanguageLine
                  code={spokenIn}
                  text={caption.originalText}
                  tone="original"
                  note="spoken"
                />

                {translations.map((code) => (
                  <LanguageLine
                    key={code}
                    code={code}
                    text={caption.byLanguage[code] ?? ""}
                    tone={code === myLanguage ? "mine" : "other"}
                    note={code === myLanguage ? "you hear" : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {liveTranscript && (
          <div className="flex gap-3 opacity-60">
            <div className="mt-0.5 shrink-0">
              <Avatar name={self?.profile.displayName ?? "You"} src={self?.profile.avatarUrl} />
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
    </div>
  );
}
