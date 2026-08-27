"use client";

import { Card, Pill, Button } from "@/components/ui";
import { LANGUAGE_FLAG, getCallLanguage, isOnline, type Profile } from "@/types";

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dimensions = size === "lg" ? "h-24 w-24 text-3xl" : "h-11 w-11 text-base";
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] font-semibold ${dimensions}`}
    >
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
  isCalling,
}: {
  profile: Profile;
  onCall: (profile: Profile) => void;
  isCalling: boolean;
}) {
  const online = isOnline(profile);

  return (
    <Card className="flex items-center gap-4">
      <Avatar name={profile.displayName} />

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
        <Button onClick={() => onCall(profile)} size="md">
          Call
        </Button>
      )}
    </Card>
  );
}
