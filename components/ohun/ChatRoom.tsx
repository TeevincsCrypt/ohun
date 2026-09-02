"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePersistedChoice } from "@/lib/ui/usePersistedChoice";
import { installSpeechPrimer, primeSpeech } from "@/lib/audio/player";
import { SpeechQueue } from "@/lib/audio/queue";
import { Avatar } from "./UserResult";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  CHAT_VIEW_LABEL,
  LANGUAGE_FLAG,
  type CallLanguageCode,
  type ChatMessage,
  type ChatView,
  type Profile,
} from "@/types";

/**
 * One conversation.
 *
 * The reader's view preference lives here rather than on the server: it is
 * a property of who is looking, not of the thread, and it should not cost a
 * round trip to change. Persisted per device so it survives a reload.
 */

const VIEW_STORAGE_KEY = "ohun-chat-view";

const VIEWS = ["translated", "both", "original"] as const;

export function ChatRoom({
  threadId,
  self,
  other,
  initialMessages,
}: {
  threadId: string;
  self: Profile;
  other: Profile;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [view, setView] = usePersistedChoice<ChatView>(VIEW_STORAGE_KEY, VIEWS, "translated");
  const speechRef = useRef<SpeechQueue | null>(null);

  // Speech is refused unless something on this page has been interacted
  // with, and a caption's play button is itself a gesture — but the primer
  // covers the case where the first thing tapped is anything else.
  useEffect(() => installSpeechPrimer(), []);

  useEffect(() => {
    const queue = new SpeechQueue();
    speechRef.current = queue;
    return () => {
      queue.stop();
      speechRef.current = null;
    };
  }, []);

  const speak = useCallback((text: string, language: CallLanguageCode) => {
    primeSpeech();
    return speechRef.current?.enqueue(text, language) ?? Promise.resolve();
  }, []);

  /**
   * Adds a message, ignoring one already present.
   *
   * The sender adds their own message from the action's response and also
   * receives it back over the channel, so this is reached twice for every
   * message they send.
   */
  const append = useCallback((message: ChatMessage) => {
    setMessages((current) =>
      current.some((existing) => existing.id === message.id) ? current : [...current, message],
    );
  }, []);

  // Broadcast rather than postgres_changes on chat_messages: a message and
  // its translations are separate rows, and a row-level event fires as soon
  // as the message lands — before the translations exist. Subscribers would
  // render the untranslated version and never hear about the rest. The
  // sender broadcasts once everything is stored.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`chat:${threadId}`);

    channel
      .on("broadcast", { event: "message" }, ({ payload }) => {
        append(payload as ChatMessage);
      })
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [threadId, append]);

  const handleSent = useCallback(
    (message: ChatMessage) => {
      append(message);
      const supabase = createClient();
      void supabase.channel(`chat:${threadId}`).send({
        type: "broadcast",
        event: "message",
        payload: message,
      });
    },
    [threadId, append],
  );

  return (
    <div className="theme-dark flex h-[100dvh] flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <Link
          href="/chats"
          aria-label="Back to conversations"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>

        <Avatar name={other.displayName} src={other.avatarUrl} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{other.displayName}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {LANGUAGE_FLAG[self.preferredLanguage]} {self.preferredLanguage.toUpperCase()}
            {" → "}
            {LANGUAGE_FLAG[other.preferredLanguage]} {other.preferredLanguage.toUpperCase()}
          </p>
        </div>

        <ThemeToggle />
      </header>

      <ChatMessageList
        messages={messages}
        self={self}
        other={other}
        view={view}
        onSpeak={speak}
      />

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2">
        <p className="truncate text-[11px] text-[var(--muted)]">
          You write in {self.preferredLanguage.toUpperCase()}, {other.displayName.split(" ")[0]}{" "}
          reads {other.preferredLanguage.toUpperCase()}.
        </p>

        <label className="sr-only" htmlFor="chat-view">
          Message languages
        </label>
        <select
          id="chat-view"
          value={view}
          onChange={(event) => setView(event.target.value as ChatView)}
          className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--accent-border)]"
        >
          {(Object.keys(CHAT_VIEW_LABEL) as ChatView[]).map((option) => (
            <option key={option} value={option}>
              {CHAT_VIEW_LABEL[option]}
            </option>
          ))}
        </select>
      </div>

      <ChatComposer threadId={threadId} onSent={handleSent} />
    </div>
  );
}
