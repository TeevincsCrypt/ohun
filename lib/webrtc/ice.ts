import "server-only";

/**
 * Server-side only. Resolves the ICE server list (STUN + TURN) that the
 * browser needs to establish a WebRTC peer connection.
 *
 * Metered's documentation is explicit that their credentials endpoint must
 * not be called from the front-end — a backend calls it and hands the
 * result to the browser. That is what this module plus
 * app/api/ice-servers/route.ts do, mirroring how we already mint AssemblyAI
 * streaming tokens.
 *
 * TURN credentials unavoidably end up in the browser: WebRTC requires them
 * in JavaScript. What we avoid is the credential being committed to the
 * repo, baked into the client bundle, or shared across every visitor
 * forever. Fetching per-session from Metered means the account key stays
 * server-side and issued credentials can be rotated or revoked centrally.
 */

/** Public STUN, used alone when no TURN is configured. Enough for most home networks. */
const FALLBACK_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
];

export class IceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IceConfigError";
  }
}

interface MeteredIceServer {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Preferred path: ask Metered for credentials scoped to this account. Their
 * endpoint also returns the servers geographically nearest the caller,
 * which matters for relay latency.
 *
 * Documented shape:
 *   GET https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
 */
async function fetchFromMetered(appName: string, apiKey: string): Promise<RTCIceServer[]> {
  const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new IceConfigError(
      `Could not reach the TURN provider: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (!response.ok) {
    // Deliberately does not echo the response body — it can carry the key back.
    throw new IceConfigError(`TURN provider returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as MeteredIceServer[] | { iceServers?: MeteredIceServer[] };
  const servers = Array.isArray(body) ? body : (body.iceServers ?? []);

  if (servers.length === 0) {
    throw new IceConfigError("TURN provider returned no ICE servers.");
  }

  return servers.map(({ urls, username, credential }) => ({
    urls,
    ...(username ? { username } : {}),
    ...(credential ? { credential } : {}),
  }));
}

/**
 * Fallback path: a static credential pair held in server env vars. Less good
 * than per-session credentials (it is long-lived), but it keeps the secret
 * out of the repo and the client bundle, and can be rotated without a code
 * change.
 */
function staticTurnServers(username: string, credential: string): RTCIceServer[] {
  return [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:global.relay.metered.ca:80", username, credential },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp", username, credential },
    { urls: "turn:global.relay.metered.ca:443", username, credential },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", username, credential },
  ];
}

export interface IceConfig {
  iceServers: RTCIceServer[];
  /** False when only STUN is available — calls will fail behind strict NAT. */
  hasTurn: boolean;
}

export async function resolveIceServers(): Promise<IceConfig> {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (appName && apiKey) {
    const iceServers = await fetchFromMetered(appName, apiKey);
    return { iceServers, hasTurn: iceServers.some((s) => String(s.urls).startsWith("turn")) };
  }

  const username = process.env.METERED_TURN_USERNAME;
  const credential = process.env.METERED_TURN_CREDENTIAL;

  if (username && credential) {
    return { iceServers: staticTurnServers(username, credential), hasTurn: true };
  }

  // No TURN configured. Still usable on permissive networks, so degrade
  // rather than fail — the caller surfaces `hasTurn` so the UI can warn.
  return { iceServers: FALLBACK_STUN, hasTurn: false };
}
