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
  size?: "md" | "lg";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  // The large size steps down on narrow viewports: at 96px two of them
  // plus the call-room hub no longer fit a phone.
  const dimensions =
    size === "lg" ? "h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl" : "h-11 w-11 text-base";
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
  onSchedule,
  isCalling,
}: {
  profile: Profile;
  onCall: (profile: Profile) => void;
  onSchedule?: (profile: Profile) => void;
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
          <Button onClick={() => onCall(profile)} size="md">
            Call
          </Button>
        </div>
      )}
    </Card>
  );
}
