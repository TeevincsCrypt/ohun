"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IncomingCallDialog } from "./IncomingCallDialog";
import { RoomInviteWatcher } from "./RoomInviteWatcher";

/**
 * Keeps a signed-in user reachable on every page, not just /people.
 *
 * Resolves the session on the client rather than taking it as a prop from
 * a server layout: doing it server-side would force the whole app —
 * including the static marketing page — to render dynamically just to
 * answer "is anyone logged in".
 *
 * Renders nothing when Supabase isn't configured, when nobody is signed
 * in, or while already inside a call room (a second invitation over a
 * live call would hijack it; that belongs in a later "busy" flow).
 */
export function IncomingCallWatcher() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  useEffect(() => {
    if (!configured) return;

    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });

    // Keeps the listener in step with logging in or out without a reload.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  if (!userId) return null;
  // Already in a call of either kind — do not interrupt it with another.
  if (pathname?.startsWith("/call/") || pathname?.startsWith("/room/")) return null;

  // `theme-dark` lives on each page's own wrapper div, but this renders as a
  // sibling of {children} in <body> — outside it. Re-declared here so the
  // call UI is styled correctly wherever it appears.
  return (
    <div className="theme-dark">
      <IncomingCallDialog selfId={userId} />
      <RoomInviteWatcher selfId={userId} />
    </div>
  );
}
