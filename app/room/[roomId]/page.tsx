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
  const room = await getRoom(roomId);
  if (!room || room.status === "ended") redirect("/people");

  const seat = room.participants.find((participant) => participant.userId === profile.id);
  if (!seat || seat.state === "declined" || seat.state === "left") redirect("/people");

  return <RoomCall room={room} self={profile} />;
}
