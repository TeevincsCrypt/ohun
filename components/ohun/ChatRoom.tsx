"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { repairTranslation } from "@/lib/chat/actions";
import { startCall } from "@/lib/calls/actions";
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
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [view, setView] = usePersistedChoice<ChatView>(VIEW_STORAGE_KEY, VIEWS, "translated");
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speechRef = useRef<SpeechQueue | null>(null);
  /** Messages already sent for repair, so an effect cannot loop on one. */
  const repairedRef = useRef(new Set<string>());

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

  /**
   * Fills in any message that arrived without a translation into my
   * language.
   *
   * Translation happens once when a message is sent, and that can fail
   * without taking the message with it. Nothing else would ever close the
   * gap, so the reader would be left looking at a language they cannot read
   * for the life of the thread. Repairing on read makes that self-healing.
   *
   * One at a time and once per message: a thread that has been offline for
   * a while should not fire twenty translation requests at once, and a
   * message that genuinely cannot be translated must not be retried forever.
   */
  useEffect(() => {
    const pending = messages.filter(
      (message) =>
        message.senderId !== self.id &&
        message.originalLanguage !== self.preferredLanguage &&
        !message.translations[self.preferredLanguage] &&
        !repairedRef.current.has(message.id),
    );
    if (pending.length === 0) return;

    let cancelled = false;

    void (async () => {
      for (const message of pending) {
        if (cancelled) return;
        repairedRef.current.add(message.id);

        const result = await repairTranslation(message.id);
        if (cancelled || !result.translation) continue;

        const { language, text } = result.translation;
        setMessages((current) =>
          current.map((existing) =>
            existing.id === message.id
              ? { ...existing, translations: { ...existing.translations, [language]: text } }
              : existing,
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, self.id, self.preferredLanguage]);

  /** Starts a translated call with the person in this thread. */
  const call = useCallback(async () => {
    setCalling(true);
    setError(null);
    // The tap is a real gesture, so use it to unlock speech for the call
    // that is about to start — the callee taps Accept, but the caller has
    // no equivalent moment once the call room has loaded.
    primeSpeech();

    const { callId, error: callError } = await startCall(other.id);
    if (callError || !callId) {
      setCalling(false);
      setError(callError ?? "Could not start the call.");
      return;
    }
    router.push(`/call/${callId}`);
  }, [other.id, router]);

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

        <button
          type="button"
          onClick={() => void call()}
          disabled={calling}
          aria-label={`Call ${other.displayName}`}
          title="Start a translated call"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] transition-colors hover:border-[var(--accent-border)] disabled:opacity-50"
        >
          {calling ? (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
            </svg>
          )}
        </button>

        <ThemeToggle />
      </header>

      {error && (
        <p className="shrink-0 px-4 py-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}

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
