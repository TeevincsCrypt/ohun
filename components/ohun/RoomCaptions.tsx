"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./UserResult";
import { LANGUAGE_FLAG, type CallLanguageCode, type Room, type RoomCaption } from "@/types";

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
          // For someone else's line this is what was spoken aloud here; for
          // my own there is no "my language" entry, so show nothing extra.
          const mine = fromSelf ? null : caption.byLanguage[myLanguage];

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
                  {speaker && (
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">
                      {LANGUAGE_FLAG[speaker.language]}
                    </span>
                  )}
                </p>

                <p className="mt-0.5 text-sm leading-snug text-[var(--foreground)]">
                  {caption.originalText}
                </p>

                {mine && (
                  <p className="mt-1 text-sm leading-snug text-[var(--peer)]">{mine}</p>
                )}
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
