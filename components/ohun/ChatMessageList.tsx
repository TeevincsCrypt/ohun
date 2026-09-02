"use client";

import { useEffect, useRef } from "react";
import { Avatar } from "./UserResult";
import { PlayLineButton } from "./PlayLineButton";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import {
  LANGUAGE_FLAG,
  renderMessage,
  type CallLanguageCode,
  type ChatMessage,
  type ChatView,
  type Profile,
} from "@/types";

/**
 * The conversation.
 *
 * Every message carries two things: what was actually said, and the same
 * thing in the reader's language. Which of those is shown — and whether the
 * other sits beneath it — is the reader's choice, not the sender's.
 */

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ChatMessageList({
  messages,
  self,
  other,
  view,
  onSpeak,
}: {
  messages: ChatMessage[];
  self: Profile;
  other: Profile;
  view: ChatView;
  /** Reads one line aloud, in the language it is written in. */
  onSpeak: (text: string, language: CallLanguageCode) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 2.6a8.4 8.4 0 0 1 9 8.9z" />
          </svg>
        </span>
        <p className="max-w-[260px] text-sm text-[var(--muted)]">
          Say hello in {LANGUAGE_FLAG[self.preferredLanguage]}{" "}
          {self.preferredLanguage.toUpperCase()} — {other.displayName.split(" ")[0]} reads it in{" "}
          {LANGUAGE_FLAG[other.preferredLanguage]} {other.preferredLanguage.toUpperCase()}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4">
      {messages.map((message, index) => {
        const fromSelf = message.senderId === self.id;
        const speaker = fromSelf ? self : other;

        // The reader is always "me". For my own messages that means the
        // interesting line is what *they* received, so the roles flip.
        const readAs = fromSelf ? other.preferredLanguage : self.preferredLanguage;
        const { primary, secondary } = renderMessage(message, readAs, view);

        const primaryLanguage = (
          primary === message.originalText ? message.originalLanguage : readAs
        ) as CallLanguageCode;

        const previous = messages[index - 1];
        const showDay = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
        // Consecutive messages from one person share an avatar column.
        const grouped = previous && previous.senderId === message.senderId && !showDay;

        return (
          <div key={message.id}>
            {showDay && (
              <p className="py-3 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {dayOf(message.createdAt)}
              </p>
            )}

            <div className={`flex gap-2 ${fromSelf ? "flex-row-reverse" : "flex-row"} ${grouped ? "mt-0.5" : "mt-3"}`}>
              <div className="w-7 shrink-0">
                {!grouped && <Avatar name={speaker.displayName} src={speaker.avatarUrl} size="sm" />}
              </div>

              <div className={`flex max-w-[78%] flex-col ${fromSelf ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 ${
                    fromSelf
                      ? "rounded-br-md border border-[var(--accent-border)] bg-[var(--accent-soft)]"
                      : "rounded-bl-md border border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  {message.kind === "voice" && (
                    <VoiceNotePlayer url={message.audioUrl} durationMs={message.durationMs} />
                  )}

                  <p className="flex items-start gap-1.5 text-sm leading-snug">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{primary}</span>
                    <span className="mt-[3px]">
                      <PlayLineButton text={primary} onPlay={() => onSpeak(primary, primaryLanguage)} />
                    </span>
                  </p>

                  {secondary && (
                    <p className="mt-1.5 flex items-start gap-1.5 border-t border-[var(--border)] pt-1.5 text-sm leading-snug text-[var(--muted)]">
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                        {secondary}
                      </span>
                      <span className="mt-[3px]">
                        <PlayLineButton
                          text={secondary}
                          onPlay={() =>
                            onSpeak(secondary, message.originalLanguage as CallLanguageCode)
                          }
                        />
                      </span>
                    </p>
                  )}
                </div>

                <p className="mt-0.5 px-1 text-[10px] text-[var(--muted)]">
                  {timeOf(message.createdAt)}
                  {message.kind === "voice" && " · voice note"}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      <div ref={endRef} />
    </div>
  );
}
