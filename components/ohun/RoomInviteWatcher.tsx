"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getRoom, setParticipantState } from "@/lib/rooms/actions";
import { Avatar } from "./UserResult";
import { Button, Card, Pill } from "@/components/ui";
import { LANGUAGE_FLAG, activeParticipants, type Room } from "@/types";

/**
 * Listens for being added to a group call and offers the invitation.
 *
 * Deliberately separate from IncomingCallDialog: a direct call and a group
 * invitation are different rows, different tables and different accept
 * paths, and folding them together would tangle two straightforward
 * watchers into one conditional one.
 */
export function RoomInviteWatcher({ selfId }: { selfId: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<Room | null>(null);
  const [, startAction] = useTransition();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`room-invites:${selfId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_participants",
          filter: `user_id=eq.${selfId}`,
        },
        (payload) => {
          const row = payload.new as { room_id?: string; state?: string } | null;
          if (!row?.room_id || row.state !== "invited") return;

          // The row says only that an invitation exists; the room itself
          // has to be read for who is in it and which languages.
          void getRoom(row.room_id).then((room) => {
            if (room && room.status === "live") setInvite(room);
          });
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [selfId]);

  if (!invite) return null;

  const seated = activeParticipants(invite).filter(
    (participant) => participant.userId !== selfId,
  );
  const languages = [...new Set(seated.map((participant) => participant.language))];

  const respond = (state: "joined" | "declined") =>
    startAction(async () => {
      const result = await setParticipantState(invite.id, state);
      const roomId = invite.id;
      setInvite(null);
      if (state === "joined" && !result.error) router.push(`/room/${roomId}`);
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Group call invitation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <Card className="animate-rise w-full max-w-sm text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          Group call
        </p>

        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="flex -space-x-3">
            {seated.slice(0, 4).map((participant) => (
              <div key={participant.userId} className="rounded-full ring-2 ring-[var(--background)]">
                <Avatar
                  name={participant.profile.displayName}
                  src={participant.profile.avatarUrl}
                />
              </div>
            ))}
            {seated.length > 4 && (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-medium ring-2 ring-[var(--background)]">
                +{seated.length - 4}
              </span>
            )}
          </div>

          <div>
            <p className="text-lg font-semibold tracking-tight">
              {seated.length === 1
                ? `${seated[0].profile.displayName} is calling`
                : `${seated.length} people are on a call`}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              They&apos;d like you to join.
            </p>
          </div>

          {languages.length > 0 && (
            <Pill tone="neutral">
              {languages.map((code) => LANGUAGE_FLAG[code]).join(" ")}{" "}
              {languages.length === 1 ? "1 language" : `${languages.length} languages`}
            </Pill>
          )}
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => respond("declined")}
            className="h-11 flex-1 rounded-full border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--surface)]"
          >
            Decline
          </button>
          <Button className="flex-1" onClick={() => respond("joined")}>
            Join
          </Button>
        </div>
      </Card>
    </div>
  );
}
