"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { startCall, touchPresence } from "@/lib/calls/actions";
import { UserResult } from "@/components/ohun/UserResult";
import { Pill } from "@/components/ui";
import type { Profile } from "@/types";

const PRESENCE_INTERVAL_MS = 30_000;

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  preferred_language: Profile["preferredLanguage"];
  last_seen_at: string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    preferredLanguage: row.preferred_language,
    lastSeenAt: row.last_seen_at,
  };
}

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
  const requestRef = useRef(0);

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
        .select("id, username, display_name, preferred_language, last_seen_at")
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .neq("id", self.id)
        .limit(20);

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

  const handleCall = useCallback(
    async (profile: Profile) => {
      setCallingId(profile.id);
      setError(null);
      const { callId, error: callError } = await startCall(profile.id);
      if (callError || !callId) {
        setError(callError ?? "Could not start the call.");
        setCallingId(null);
        return;
      }
      router.push(`/call/${callId}`);
    },
    [router],
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="search" className="text-sm font-medium text-[var(--muted)]">
            Find someone
          </label>
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="@marie or Marie Dupont"
            autoComplete="off"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--foreground)]"
          />
        </div>

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
              isCalling={callingId === profile.id}
            />
          ))}
        </div>

        {term.length >= 2 && !searching && visibleResults.length === 0 && !error && (
          <p className="text-center text-sm text-[var(--muted)]">
            Nobody matches &ldquo;{term}&rdquo;.
          </p>
        )}

        {term.length < 2 && (
          <p className="text-center text-sm text-[var(--muted)]">
            Search by username or name to start a call.
          </p>
        )}
      </div>
    </>
  );
}
