import { NextResponse } from "next/server";
import { getRoom } from "@/lib/rooms/actions";

/**
 * Current state of one room, for the client to re-read when the roster
 * changes. RLS is the authorisation: getRoom returns null for a room the
 * caller is not a participant of.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const room = await getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(room, { headers: { "Cache-Control": "no-store" } });
}
