import type { IceConfig } from "./ice";

export type { IceConfig };

/** Used when /api/ice-servers is unreachable, so a call can still attempt to connect. */
const STUN_ONLY: IceConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  hasTurn: false,
};

/**
 * Browser-only. Fetches ICE servers from our own route, which holds the
 * TURN provider key server-side.
 *
 * Never throws: a call attempt with STUN alone still succeeds on permissive
 * networks, so a provider outage degrades connectivity rather than blocking
 * the call outright. `hasTurn` tells the caller which case they are in.
 */
export async function fetchIceConfig(): Promise<IceConfig> {
  try {
    const response = await fetch("/api/ice-servers", { cache: "no-store" });
    if (!response.ok) {
      console.error("[ohun] ice-servers returned", response.status, "— falling back to STUN only");
      return STUN_ONLY;
    }
    return (await response.json()) as IceConfig;
  } catch (error) {
    console.error("[ohun] could not fetch ICE servers — falling back to STUN only", error);
    return STUN_ONLY;
  }
}
