"use client";

import { Card, Pill, Button } from "@/components/ui";
import { LANGUAGE_FLAG, getCallLanguage, isOnline, type Profile } from "@/types";

export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // The large size steps down on narrow viewports: at 96px two of them
  // plus the call-room hub no longer fit a phone.
  // "sm" is the chat bubble's gutter, where an 11 avatar would crowd out
  // the message beside it.
  const dimensions =
    size === "lg"
      ? "h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl"
      : size === "sm"
        ? "h-7 w-7 text-[11px]"
        : "h-11 w-11 text-base";
  const shared = `flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] ${dimensions}`;

  if (src) {
    return (
      // Avatars come from Supabase Storage on a per-project domain, so
      // next/image would need a remotePatterns entry per deployment.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" aria-hidden className={`${shared} bg-[var(--surface)] object-cover`} />
    );
  }

  return (
    <div aria-hidden className={`${shared} bg-[var(--surface)] font-semibold`}>
      {initial}
    </div>
  );
}

export function LanguageTag({ code }: { code: Profile["preferredLanguage"] }) {
  const language = getCallLanguage(code);
  return (
    <span className="text-sm text-[var(--muted)]">
      {LANGUAGE_FLAG[code]} {language?.label ?? code}
    </span>
  );
}

export function PresenceTag({ online }: { online: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-[var(--muted)]"}`}
      />
      {online ? "Available" : "Offline"}
    </span>
  );
}

export function UserResult({
  profile,
  onCall,
  onVideoCall,
  onSchedule,
  onMessage,
  isOpeningChat = false,
  isCalling,
}: {
  profile: Profile;
  onCall: (profile: Profile) => void;
  /**
   * Starts a call with the camera already on, rather than a voice call the
   * camera is toggled on inside afterwards. Optional so callers that have
   * no camera-first flow (recent-calls redial, say) don't need one.
   */
  onVideoCall?: (profile: Profile) => void;
  onSchedule?: (profile: Profile) => void;
  /** Opens (or reopens) the translated chat thread with this person. */
  onMessage?: (profile: Profile) => void;
  /** True while that thread is being opened — it is a server round trip. */
  isOpeningChat?: boolean;
  isCalling: boolean;
}) {
  const online = isOnline(profile);

  return (
    <Card className="flex items-center gap-4">
      <Avatar name={profile.displayName} src={profile.avatarUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold tracking-tight">{profile.displayName}</p>
        <p className="truncate text-sm text-[var(--muted)]">@{profile.username}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <LanguageTag code={profile.preferredLanguage} />
          <PresenceTag online={online} />
        </div>
      </div>

      {isCalling ? (
        <Pill tone="warning">Calling…</Pill>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {onMessage && (
            <button
              type="button"
              onClick={() => onMessage(profile)}
              disabled={isOpeningChat}
              aria-label={`Message ${profile.displayName}`}
              title="Send a message"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              {isOpeningChat ? (
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.6-4.6A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 2.6a8.4 8.4 0 0 1 9 8.9z" />
                </svg>
              )}
            </button>
          )}
          {onSchedule && (
            <button
              type="button"
              onClick={() => onSchedule(profile)}
              aria-label={`Schedule a call with ${profile.displayName}`}
              title="Schedule a call"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {onVideoCall && (
            <button
              type="button"
              onClick={() => onVideoCall(profile)}
              aria-label={`Video call ${profile.displayName}`}
              title="Video call"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 10l5-3v10l-5-3" />
                <rect x="2" y="6" width="13" height="12" rx="2" />
              </svg>
            </button>
          )}
          <Button onClick={() => onCall(profile)} size="md">
            Call
          </Button>
        </div>
      )}
    </Card>
  );
}
