import { NextResponse } from "next/server";
import { resolveIceServers, IceConfigError } from "@/lib/webrtc/ice";

/**
 * Hands the browser the ICE servers it needs for a WebRTC connection.
 * The TURN provider account key stays server-side — see lib/webrtc/ice.ts.
 *
 * TODO(Phase 4a): require an authenticated session once auth exists, so
 * TURN relay capacity can't be consumed by anonymous callers.
 */
export async function GET() {
  try {
    const config = await resolveIceServers();
    return NextResponse.json(config, {
      // Credentials are per-session and short-lived; never cache them,
      // at the CDN or in the browser.
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof IceConfigError) {
      console.error("[api/ice-servers]", error.message);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[api/ice-servers] unexpected error", error);
    return NextResponse.json({ error: "Could not load call connection settings." }, { status: 500 });
  }
}
