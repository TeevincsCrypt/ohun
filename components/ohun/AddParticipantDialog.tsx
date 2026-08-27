"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { inviteToRoom } from "@/lib/rooms/actions";
import { Avatar } from "./UserResult";
import { Button, Card, Pill } from "@/components/ui";
import {
  LANGUAGE_FLAG,
  MAX_ROOM_PARTICIPANTS,
  PROFILE_SEARCH_LIMIT,
  type CallLanguageCode,
  type Profile,
} from "@/types";
import { PROFILE_COLUMNS, toProfile, type ProfileRow } from "@/lib/supabase/profile";

/** Search for someone and pull them into a call that is already running. */
export function AddParticipantDialog({
  roomId,
  seated,
  onClose,
  onInvited,
}: {
  roomId: string;
  /** Ids already in the room, so they can be marked rather than re-invited. */
  seated: string[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ term: string; profiles: Profile[] }>({
    term: "",
    profiles: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startAction] = useTransition();

  const term = query.trim().replace(/^@/, "");
  const full = seated.length >= MAX_ROOM_PARTICIPANTS;
  const visible = results.term === term ? results.profiles : [];

  useEffect(() => {
    if (term.length < 2) return;

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const pattern = `%${term}%`;
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .eq("is_guest", false)
        .limit(PROFILE_SEARCH_LIMIT);

      if (searchError) {
        setError("Could not search right now.");
        return;
      }
      setError(null);
      setResults({ term, profiles: ((data ?? []) as ProfileRow[]).map(toProfile) });
    }, 250);

    return () => clearTimeout(timer);
  }, [term]);

  const invite = (profile: Profile) =>
    startAction(async () => {
      setError(null);
      setPendingId(profile.id);
      const result = await inviteToRoom(roomId, profile.id);
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      onInvited();
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add someone to this call"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(event) => event.stopPropagation()}>
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Add to this call</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {seated.length} of {MAX_ROOM_PARTICIPANTS} seats taken. Everyone hears everyone
              else in their own language.
            </p>
          </div>

          {full ? (
            <Pill tone="warning" className="w-full justify-center text-center">
              This call is full.
            </Pill>
          ) : (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="@marie or Marie Dupont"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              aria-label="Search for someone to add"
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
            />
          )}

          {error && (
            <Pill tone="error" className="w-full justify-center text-center">
              {error}
            </Pill>
          )}

          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {visible.map((profile) => {
              const already = seated.includes(profile.id);
              return (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <Avatar name={profile.displayName} src={profile.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{profile.displayName}</p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      @{profile.username} ·{" "}
                      {LANGUAGE_FLAG[profile.preferredLanguage as CallLanguageCode]}
                    </p>
                  </div>
                  {already ? (
                    <Pill tone="muted">In call</Pill>
                  ) : (
                    <Button
                      size="md"
                      onClick={() => invite(profile)}
                      disabled={full || pendingId === profile.id}
                    >
                      {pendingId === profile.id ? "Adding…" : "Add"}
                    </Button>
                  )}
                </div>
              );
            })}

            {term.length >= 2 && visible.length === 0 && !error && (
              <p className="py-4 text-center text-sm text-[var(--muted)]">
                Nobody matches &ldquo;{term}&rdquo;.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--surface)]"
          >
            Done
          </button>
        </Card>
      </div>
    </div>
  );
}
