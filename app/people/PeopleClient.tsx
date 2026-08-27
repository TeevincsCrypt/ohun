"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startCall, touchPresence } from "@/lib/calls/actions";
import { createRoom } from "@/lib/rooms/actions";
import { listScheduledCalls } from "@/lib/schedule/actions";
import { UserResult } from "@/components/ohun/UserResult";
import { UpcomingCalls } from "@/components/ohun/UpcomingCalls";
import { ScheduleCallDialog } from "@/components/ohun/ScheduleCallDialog";
import { RecentActivity } from "@/components/ohun/RecentActivity";
import { Pill } from "@/components/ui";
import { PROFILE_COLUMNS, toProfile, type ProfileRow } from "@/lib/supabase/profile";
import { PROFILE_SEARCH_LIMIT, type Profile, type ScheduledCall } from "@/types";

const PRESENCE_INTERVAL_MS = 30_000;

export function PeopleClient({ self }: { self: Profile }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Results carry the term they belong to, so "searching" is derived rather
  // than a second state that has to be kept in sync.
  const [results, setResults] = useState<{ term: string; profiles: Profile[] }>({
    term: "",
    profiles: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Profile | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledCall[]>([]);
  const [startingRoom, setStartingRoom] = useState(false);
  const requestRef = useRef(0);

  const refreshScheduled = useCallback(() => {
    void listScheduledCalls().then(setScheduled);
  }, []);

  useEffect(refreshScheduled, [refreshScheduled]);

  const term = query.trim().replace(/^@/, "");
  const matchesQuery = results.term === term;
  const visibleResults = matchesQuery ? results.profiles : [];
  const searching = term.length >= 2 && !matchesQuery;

  // Keep the online indicator honest while this tab is open.
  useEffect(() => {
    void touchPresence();
    const timer = setInterval(() => void touchPresence(), PRESENCE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Debounced search by username or display name.
  useEffect(() => {
    if (term.length < 2) return;

    const generation = ++requestRef.current;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const pattern = `%${term}%`;
      const { data, error: searchError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .neq("id", self.id)
        // Anonymous room-link visitors have profiles so calls work, but
        // they are throwaway identities and must not clutter search.
        .eq("is_guest", false)
        .limit(PROFILE_SEARCH_LIMIT);

      // A newer keystroke already superseded this request.
      if (generation !== requestRef.current) return;

      if (searchError) {
        setError("Could not search right now.");
        setResults({ term, profiles: [] });
      } else {
        setError(null);
        setResults({ term, profiles: ((data ?? []) as ProfileRow[]).map(toProfile) });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term, self.id]);

  /**
   * Places a call and navigates into the room.
   *
   * Returns a message on failure rather than only setting page-level state:
   * Recent calls sits far below the search box, so its own errors have to
   * render next to the button that caused them.
   */
  const handleCall = useCallback(
    async (profile: Pick<Profile, "id" | "displayName">): Promise<string | null> => {
      setCallingId(profile.id);
      setError(null);

      const { callId, error: callError } = await startCall(profile.id);

      if (callError || !callId) {
        setCallingId(null);
        const message = callError ?? "Could not start the call.";
        setError(message);
        return message;
      }

      router.push(`/call/${callId}`);
      return null;
    },
    [router],
  );

  /** Opens an empty group call; people are added from inside it. */
  const startGroupCall = useCallback(async () => {
    setStartingRoom(true);
    setError(null);
    const { roomId, error: roomError } = await createRoom();
    if (roomError || !roomId) {
      setError(roomError ?? "Could not start the call.");
      setStartingRoom(false);
      return;
    }
    router.push(`/room/${roomId}`);
  }, [router]);

  return (
    <>
      {scheduling && (
        <ScheduleCallDialog
          invitee={scheduling}
          onClose={() => setScheduling(null)}
          onScheduled={() => {
            setScheduling(null);
            refreshScheduled();
          }}
        />
      )}

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="search" className="text-sm font-medium text-[var(--muted)]">
            Find someone
          </label>
          <div className="relative">
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="@marie or Marie Dupont"
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-11 pr-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--accent)]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void startGroupCall()}
          disabled={startingRoom}
          className="flex items-center justify-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent)] transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 20v-1a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v1" />
            <circle cx="9.5" cy="8" r="3" />
            <path d="M18 8h4M20 6v4" />
          </svg>
          {startingRoom ? "Starting…" : "Start a group call"}
        </button>

        {error && (
          <Pill tone="error" className="w-full justify-center text-center">
            {error}
          </Pill>
        )}

        <div className="flex flex-col gap-3">
          {visibleResults.map((profile) => (
            <UserResult
              key={profile.id}
              profile={profile}
              onCall={handleCall}
              onSchedule={setScheduling}
              isCalling={callingId === profile.id}
            />
          ))}
        </div>

        {term.length >= 2 && !searching && visibleResults.length === 0 && !error && (
          <p className="text-center text-sm text-[var(--muted)]">
            Nobody matches &ldquo;{term}&rdquo;.
          </p>
        )}

        {term.length >= 2 && searching && (
          <p className="text-center text-sm text-[var(--muted)]">Searching…</p>
        )}
      </div>

      {/* Only reference material below this point, so it sits under the
          search box rather than pushing it down the page. */}
      {term.length < 2 && (
        <div className="mt-10">
          <UpcomingCalls scheduled={scheduled} onChanged={refreshScheduled} />
          <RecentActivity onCall={handleCall} />
        </div>
      )}
    </>
  );
}
