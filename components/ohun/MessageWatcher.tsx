"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "./UserResult";
import type { ChatMessageKind } from "@/types";

/**
 * Tells you a message arrived, wherever you are in the app.
 *
 * The thread view has its own delivery — a broadcast the sender emits once
 * translations are stored — but a broadcast only reaches someone already
 * subscribed to that thread's channel, which is exactly the person who does
 * not need telling. This listens for the row instead, so it works from any
 * page, and RLS keeps it to threads you are actually in.
 *
 * Two notifications, deliberately: an in-app banner that always shows, and
 * a system notification when the tab is in the background and permission
 * has been granted. A system notification while you are looking at the page
 * is noise, and asking for permission before anyone has ever messaged you
 * is the kind of prompt people refuse on reflex — so the ask waits for the
 * first message.
 */

/** Long enough to read a name and a line; short enough not to sit there. */
const BANNER_MS = 6_000;

interface Incoming {
  messageId: string;
  threadId: string;
  senderName: string;
  senderAvatar: string | null;
  preview: string;
  kind: ChatMessageKind;
}

export function MessageWatcher() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  const show = useCallback((next: Incoming) => {
    setIncoming(next);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setIncoming(null), BANNER_MS);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    // A ref would be re-read on every event; this is read once per message
    // and the value is only ever "the path at the time the message landed".
    const currentPath = pathname;

    const channel = supabase
      .channel(`messages:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async ({ new: row }) => {
          const message = row as {
            id: string;
            thread_id: string;
            sender_id: string;
            kind: ChatMessageKind;
            original_text: string;
          };

          // Your own message, echoed back.
          if (message.sender_id === userId) return;
          // Already looking at it.
          if (currentPath === `/chat/${message.thread_id}`) return;

          // The row carries the original; the reader wants their own
          // language. Read it back rather than showing a preview they
          // cannot read — and fall back to the original if the translation
          // has not landed yet.
          const [{ data: profile }, { data: sender }] = await Promise.all([
            supabase.from("profiles").select("preferred_language").eq("id", userId).maybeSingle(),
            supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", message.sender_id)
              .maybeSingle(),
          ]);

          let preview = message.original_text;
          if (profile?.preferred_language) {
            const { data: translation } = await supabase
              .from("chat_translations")
              .select("text")
              .eq("message_id", message.id)
              .eq("language", profile.preferred_language)
              .maybeSingle();
            if (translation?.text) preview = translation.text;
          }

          const senderName = sender?.display_name ?? "New message";
          const body = message.kind === "voice" ? `🎤 ${preview}` : preview;

          show({
            messageId: message.id,
            threadId: message.thread_id,
            senderName,
            senderAvatar: sender?.avatar_url ?? null,
            preview: body,
            kind: message.kind,
          });

          // Only when the tab is not the one being looked at.
          if (typeof Notification === "undefined" || document.visibilityState === "visible") return;
          if (Notification.permission === "granted") {
            new Notification(senderName, { body, tag: message.thread_id });
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [userId, pathname, show]);

  // Asked for once a message has actually arrived, so the prompt has a
  // reason the user can see rather than appearing out of nowhere on load.
  useEffect(() => {
    if (!incoming || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    void Notification.requestPermission();
  }, [incoming]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!incoming) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3">
      <Link
        href={`/chat/${incoming.threadId}`}
        onClick={() => setIncoming(null)}
        className="animate-rise pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-3 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur-md transition-colors hover:border-[var(--accent-border)]"
      >
        <Avatar name={incoming.senderName} src={incoming.senderAvatar} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{incoming.senderName}</p>
          <p className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            {incoming.kind === "voice" && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden>
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
              </svg>
            )}
            <span className="truncate">{incoming.preview}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={(event) => {
            // The banner is a link; dismissing must not follow it.
            event.preventDefault();
            event.stopPropagation();
            setIncoming(null);
          }}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </Link>
    </div>
  );
}
