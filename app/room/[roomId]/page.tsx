import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { getRoom } from "@/lib/rooms/actions";
import { RoomCall } from "@/components/ohun/RoomCall";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: PageProps<"/room/[roomId]">) {
  const { roomId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // RLS decides visibility: getRoom returns null for a room this user is
  // not a participant of, which is indistinguishable from one that does
  // not exist — deliberately, so room ids cannot be probed.
  //
  // Each bounce is logged with its reason. To the user every one of these
  // looks identical — the room simply does not open — so without this the
  // difference between "ended", "never seated" and "already left" is
  // invisible from the outside.
  const room = await getRoom(roomId);
  if (!room) {
    console.warn("[ohun/room] not visible to this user", { roomId, userId: profile.id });
    redirect("/people");
  }
  if (room.status === "ended") {
    console.warn("[ohun/room] already ended", { roomId });
    redirect("/people");
  }

  const seat = room.participants.find((participant) => participant.userId === profile.id);
  if (!seat) {
    console.warn("[ohun/room] no seat for this user", {
      roomId,
      userId: profile.id,
      seatedCount: room.participants.length,
    });
    redirect("/people");
  }
  if (seat.state === "declined" || seat.state === "left") {
    console.warn("[ohun/room] seat is not active", { roomId, state: seat.state });
    redirect("/people");
  }

  return <RoomCall room={room} self={profile} />;
}
