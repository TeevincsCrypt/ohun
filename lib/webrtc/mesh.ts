"use client";

import { fetchIceConfig } from "./client";
import { PeerError, type PeerSignal } from "./peer";

/**
 * Full-mesh audio for a small group call.
 *
 * Every participant holds one RTCPeerConnection to every other, sharing a
 * single captured microphone stream. At the 7-person ceiling that is six
 * connections each and twenty-one in the room — heavy for video, but fine
 * for audio, which runs at tens of kilobits per stream. The alternative is
 * a selective forwarding unit, which means running media-server
 * infrastructure; mesh needs none.
 *
 * Signalling is injected, exactly as in peer.ts — this module never talks
 * to Supabase.
 */

/** A signal addressed to one specific peer. */
export interface MeshSignal {
  /** Who it is for. Everyone else on the channel ignores it. */
  to: string;
  from: string;
  signal: PeerSignal;
}

export interface MeshCallbacks {
  onSignal: (message: MeshSignal) => void;
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
}

export interface AudioMesh {
  /** Open a connection to a peer, offering if we are the designated initiator. */
  connectTo: (peerId: string) => Promise<void>;
  /** Tear down one peer without touching the rest of the room. */
  disconnectFrom: (peerId: string) => void;
  acceptSignal: (message: MeshSignal) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => void;
  isMicrophoneEnabled: () => boolean;
  /** Peer ids currently held, connected or not. */
  peerIds: () => string[];
  close: () => void;
  hasTurn: boolean;
  localStream: MediaStream;
}

/**
 * Decides which side of a pair sends the offer.
 *
 * Both peers notice each other at the same moment, so without a rule both
 * would offer at once and collide (SDP "glare"). Comparing ids is
 * arbitrary but consistent: both sides compute the same answer without
 * exchanging anything.
 */
function shouldOffer(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}

export async function createAudioMesh(
  selfId: string,
  callbacks: MeshCallbacks,
): Promise<AudioMesh> {
  let localStream: MediaStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (error) {
    throw new PeerError(
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it for this site and try again."
        : "Could not access your microphone.",
    );
  }

  const { iceServers, hasTurn } = await fetchIceConfig();

  interface PeerEntry {
    connection: RTCPeerConnection;
    remoteStream: MediaStream;
    /** Candidates that arrived before the remote description was set. */
    pending: RTCIceCandidateInit[];
  }

  const peers = new Map<string, PeerEntry>();
  let closed = false;

  function createPeer(peerId: string): PeerEntry {
    const existing = peers.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers });
    const remoteStream = new MediaStream();
    const entry: PeerEntry = { connection, remoteStream, pending: [] };
    peers.set(peerId, entry);

    localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

    connection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
      callbacks.onRemoteStream(peerId, remoteStream);
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        callbacks.onSignal({
          to: peerId,
          from: selfId,
          signal: { kind: "ice", candidate: event.candidate.toJSON() },
        });
      }
    };

    connection.onconnectionstatechange = () => {
      callbacks.onPeerStateChange(peerId, connection.connectionState);
    };

    connection.onicecandidateerror = () => {
      // Individual candidate failures are normal and only matter if the
      // connection as a whole fails, which onconnectionstatechange reports.
    };

    return entry;
  }

  async function flushCandidates(entry: PeerEntry) {
    while (entry.pending.length > 0) {
      const candidate = entry.pending.shift();
      if (!candidate) continue;
      try {
        await entry.connection.addIceCandidate(candidate);
      } catch (error) {
        console.error("[ohun] failed to add ICE candidate", error);
      }
    }
  }

  return {
    hasTurn,
    localStream,

    peerIds() {
      return [...peers.keys()];
    },

    async connectTo(peerId) {
      if (closed || peerId === selfId || peers.has(peerId)) return;

      const entry = createPeer(peerId);

      // Only one side offers; the other simply waits for it.
      if (!shouldOffer(selfId, peerId)) return;

      try {
        const offer = await entry.connection.createOffer({ offerToReceiveAudio: true });
        await entry.connection.setLocalDescription(offer);
        callbacks.onSignal({ to: peerId, from: selfId, signal: { kind: "offer", sdp: offer } });
      } catch (error) {
        callbacks.onError(
          new PeerError(`Could not reach a participant: ${(error as Error).message}`),
        );
      }
    },

    disconnectFrom(peerId) {
      const entry = peers.get(peerId);
      if (!entry) return;
      peers.delete(peerId);
      entry.connection.ontrack = null;
      entry.connection.onicecandidate = null;
      entry.connection.onconnectionstatechange = null;
      entry.connection.close();
    },

    async acceptSignal({ to, from, signal }) {
      if (closed || to !== selfId || from === selfId) return;

      // An offer can arrive before presence has told us about the sender,
      // so the entry is created on demand rather than assumed.
      const entry = createPeer(from);

      try {
        if (signal.kind === "offer") {
          await entry.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushCandidates(entry);
          const answer = await entry.connection.createAnswer();
          await entry.connection.setLocalDescription(answer);
          callbacks.onSignal({ to: from, from: selfId, signal: { kind: "answer", sdp: answer } });
          return;
        }

        if (signal.kind === "answer") {
          // Ignore a duplicate answer — re-applying in `stable` throws.
          if (entry.connection.signalingState === "stable") return;
          await entry.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushCandidates(entry);
          return;
        }

        if (entry.connection.remoteDescription) {
          await entry.connection.addIceCandidate(signal.candidate);
        } else {
          entry.pending.push(signal.candidate);
        }
      } catch (error) {
        callbacks.onError(
          new PeerError(`Connection negotiation failed: ${(error as Error).message}`),
        );
      }
    },

    setMicrophoneEnabled(enabled) {
      // One capture shared by every connection, so this mutes us everywhere
      // at once. Deliberately never touches remote audio, which is the
      // speaker control, or transcription, which must keep running.
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },

    isMicrophoneEnabled() {
      return localStream.getAudioTracks().some((track) => track.enabled);
    },

    close() {
      closed = true;
      for (const [, entry] of peers) {
        entry.connection.ontrack = null;
        entry.connection.onicecandidate = null;
        entry.connection.onconnectionstatechange = null;
        entry.connection.close();
      }
      peers.clear();
      localStream.getTracks().forEach((track) => track.stop());
    },
  };
}
