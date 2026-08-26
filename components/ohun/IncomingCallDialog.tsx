"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setCallStatus } from "@/lib/calls/actions";
import { Button, Card, Pill } from "@/components/ui";
import { Avatar } from "./UserResult";
import { LANGUAGE_FLAG, getCallLanguage, type CallLanguageCode, type Profile } from "@/types";

interface IncomingCall {
  callId: string;
  caller: Profile;
  callerLanguage: CallLanguageCode;
  receiverLanguage: CallLanguageCode;
}

type ListenStatus = "connecting" | "ready" | "error";

/**
 * Listens for calls addressed to the signed-in user and presents the
 * accept/decline prompt. Mounted on /people so a user is reachable while
 * browsing. RLS means only rows where they are the receiver arrive.
 *
 * Also renders a small always-visible connection badge — not just the
 * modal — so whether this is actually working is visible on the page
 * itself, with no need to open the browser console.
 */
export function IncomingCallDialog({ self }: { self: Profile }) {
  const router = useRouter();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [listenStatus, setListenStatus] = useState<ListenStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`incoming:${self.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `receiver_id=eq.${self.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            caller_id: string;
            status: string;
            caller_language: CallLanguageCode;
            receiver_language: CallLanguageCode;
          };

          if (row.status !== "ringing") return;

          const { data, error: callerLookupError } = await supabase
            .from("profiles")
            .select("id, username, display_name, preferred_language, last_seen_at")
            .eq("id", row.caller_id)
            .maybeSingle();

          if (callerLookupError || !data) {
            setListenStatus("error");
            setStatusDetail(
              callerLookupError?.message ?? "Could not load the caller's profile.",
            );
            return;
          }

          setIncoming({
            callId: row.id,
            caller: {
              id: data.id,
              username: data.username,
              displayName: data.display_name,
              preferredLanguage: data.preferred_language,
              lastSeenAt: data.last_seen_at,
            },
            callerLanguage: row.caller_language,
            receiverLanguage: row.receiver_language,
          });
        },
      )
      // If the caller hangs up while ringing, dismiss the prompt.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `receiver_id=eq.${self.id}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status !== "ringing") {
            setIncoming((current) => (current?.callId === row.id ? null : current));
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setListenStatus("ready");
          setStatusDetail(null);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setListenStatus("error");
          setStatusDetail(err?.message ?? status);
        }
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [self.id]);

  const accept = useCallback(async () => {
    if (!incoming) return;
    setBusy(true);
    const { error } = await setCallStatus(incoming.callId, "accepted");
    setBusy(false);
    if (error) return;
    const callId = incoming.callId;
    setIncoming(null);
    router.push(`/call/${callId}`);
  }, [incoming, router]);

  const decline = useCallback(async () => {
    if (!incoming) return;
    setBusy(true);
    await setCallStatus(incoming.callId, "declined");
    setBusy(false);
    setIncoming(null);
  }, [incoming]);

  const callerLang = incoming ? getCallLanguage(incoming.callerLanguage) : undefined;
  const receiverLang = incoming ? getCallLanguage(incoming.receiverLanguage) : undefined;

  return (
    <>
      {/* Always visible — this is the "does this even need DevTools" answer. */}
      <div className="fixed bottom-4 right-4 z-40">
        {listenStatus === "ready" && (
          <Pill tone="live">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ready for calls
          </Pill>
        )}
        {listenStatus === "connecting" && <Pill tone="warning">Connecting…</Pill>}
        {listenStatus === "error" && (
          <div className="flex flex-col items-end gap-1">
            <Pill tone="error">Not receiving calls — refresh the page</Pill>
            {statusDetail && (
              <span className="max-w-xs text-right text-[10px] text-[var(--muted)]">
                {statusDetail}
              </span>
            )}
          </div>
        )}
      </div>

      {incoming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Incoming Ohun call"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
        >
          <Card className="w-full max-w-sm text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Incoming Ohun call
            </p>

            <div className="mt-6 flex flex-col items-center gap-4">
              <Avatar name={incoming.caller.displayName} size="lg" />
              <div>
                <p className="text-xl font-semibold tracking-tight">
                  {incoming.caller.displayName} wants to talk with you.
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">@{incoming.caller.username}</p>
              </div>

              <p className="text-sm text-[var(--muted)]">
                {LANGUAGE_FLAG[incoming.callerLanguage]} {callerLang?.label} ↔{" "}
                {LANGUAGE_FLAG[incoming.receiverLanguage]} {receiverLang?.label}
              </p>
            </div>

            <div className="mt-8 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={decline} disabled={busy}>
                Decline
              </Button>
              <Button className="flex-1" onClick={accept} disabled={busy}>
                {busy ? "…" : "Accept"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
