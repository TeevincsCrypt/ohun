"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startCall } from "@/lib/calls/actions";
import type { RoomOwner } from "@/lib/room/actions";
import { Avatar } from "@/components/ohun/UserResult";
import { Button, Card, Pill } from "@/components/ui";
import {
  CALL_LANGUAGES,
  LANGUAGE_FLAG,
  getCallLanguage,
  isOnline,
  validateDisplayName,
  type CallLanguageCode,
  type Profile,
} from "@/types";

export function RoomJoinClient({
  owner,
  self,
  slug,
}: {
  owner: RoomOwner;
  /** Null when the visitor has no account yet. */
  self: Profile | null;
  /** Needed so logging in returns here rather than to /people. */
  slug: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<CallLanguageCode>("en");
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();

  const online = isOnline({ lastSeenAt: owner.lastSeenAt });
  const ownerLanguage = getCallLanguage(owner.preferredLanguage);

  /** Places the call and hands off to the room. */
  const dial = async () => {
    const { callId, error: callError } = await startCall(owner.id);
    if (callError || !callId) {
      setError(callError ?? "Could not start the call.");
      return;
    }
    router.push(`/call/${callId}`);
  };

  /** Signed-in visitor: nothing to set up, just ring them. */
  const callAsSelf = () =>
    startAction(async () => {
      setError(null);
      await dial();
    });

  /**
   * Visitor with no account. Anonymous sign-in creates a real auth user,
   * so the call, its RLS policies and the translation pipeline all work
   * exactly as they do for a full account — no parallel guest path.
   *
   * Done from the browser rather than a server action so the Supabase
   * client persists the session itself before the call is placed.
   */
  const joinAsGuest = () =>
    startAction(async () => {
      setError(null);

      const nameError = validateDisplayName(name);
      if (nameError) {
        setError(nameError);
        return;
      }

      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInAnonymously({
        options: { data: { display_name: name.trim(), preferred_language: language } },
      });

      if (authError) {
        setError(
          /disabled|not enabled/i.test(authError.message)
            ? "Guest access isn't enabled on this deployment. Log in instead."
            : "Could not join as a guest. Try logging in instead.",
        );
        return;
      }

      await dial();
    });

  return (
    <Card className="flex flex-col items-center gap-5 text-center">
      <Avatar name={owner.displayName} src={owner.avatarUrl} size="lg" />

      <div>
        <p className="text-sm text-[var(--muted)]">You&apos;re invited to talk with</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{owner.displayName}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">@{owner.username}</p>
      </div>

      <Pill tone={online ? "live" : "muted"}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[var(--accent)]" : "bg-current opacity-60"}`}
        />
        {online ? "Available now" : "Away — they'll see a missed call"}
      </Pill>

      <p className="text-sm text-[var(--muted)]">
        They speak {LANGUAGE_FLAG[owner.preferredLanguage]} {ownerLanguage?.label}. Speak your own
        language — OHUN translates both ways, live.
      </p>

      {self ? (
        <>
          <p className="text-sm text-[var(--muted)]">
            Calling as <span className="text-[var(--foreground)]">{self.displayName}</span> ·{" "}
            {LANGUAGE_FLAG[self.preferredLanguage]} {getCallLanguage(self.preferredLanguage)?.label}
          </p>
          <Button size="lg" className="w-full" onClick={callAsSelf} disabled={pending}>
            {pending ? "Calling…" : `Call ${owner.displayName.split(" ")[0]}`}
          </Button>
        </>
      ) : (
        <div className="flex w-full flex-col gap-4 text-left">
          <div className="flex flex-col gap-2">
            <label htmlFor="guest-name" className="text-sm font-medium text-[var(--muted)]">
              Your name
            </label>
            <input
              id="guest-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex"
              maxLength={50}
              autoComplete="name"
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="guest-language" className="text-sm font-medium text-[var(--muted)]">
              Language you speak
            </label>
            <select
              id="guest-language"
              value={language}
              onChange={(event) => setLanguage(event.target.value as CallLanguageCode)}
              className="h-12 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors focus-visible:border-[var(--accent)]"
            >
              {CALL_LANGUAGES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {LANGUAGE_FLAG[entry.code as CallLanguageCode]} {entry.label} · {entry.nativeLabel}
                </option>
              ))}
            </select>
          </div>

          <Button size="lg" className="w-full" onClick={joinAsGuest} disabled={pending}>
            {pending ? "Joining…" : "Join the call"}
          </Button>

          <p className="text-center text-xs text-[var(--muted)]">
            No account needed. Already have one?{" "}
            <a
              href={`/login?next=${encodeURIComponent(`/r/${slug}`)}`}
              className="text-[var(--foreground)] underline underline-offset-4"
            >
              Log in
            </a>
          </p>
        </div>
      )}

      {error && (
        <Pill tone="error" className="w-full justify-center text-center">
          {error}
        </Pill>
      )}
    </Card>
  );
}
