"use client";

import { fetchIceConfig } from "./client";
import { PeerError, type PeerSignal } from "./peer";

/**
 * Full-mesh audio (and optionally camera video) for a small group call.
 *
 * Every participant holds one RTCPeerConnection to every other, sharing a
 * single captured microphone stream. At the 7-person ceiling that is six
 * connections each and twenty-one in the room — heavy for video, but fine
 * for audio, which runs at tens of kilobits per stream. The alternative is
 * a selective forwarding unit, which means running media-server
 * infrastructure; mesh needs none. Camera video rides the same mesh: it
 * costs one more RTP sender per connection you turn it on for, not a
 * separate topology. At the 7-person ceiling that is six simultaneous
 * outbound video encodes if everyone's camera is on — real cost, but a
 * decision each participant makes for themselves by tapping the button, not
 * one this module needs to police.
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
  /**
   * Fired when a peer's camera arrives, and again with null when it stops.
   * Unlike the 1:1 call, group calls carry no screen share, so — unlike
   * peer.ts — an incoming video track is unambiguously a camera and needs
   * no role signalling to tell it apart from anything else.
   */
  onRemoteCamera: (peerId: string, stream: MediaStream | null) => void;
  onPeerStateChange: (peerId: string, state: RTCPeerConnectionState) => void;
  /** Fired whenever OUR OWN camera ends, for any reason — device loss included. */
  onCameraEnded: () => void;
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
  /**
   * Captures the camera and adds it to every connection currently held, and
   * to any made afterwards. Renegotiates each existing connection. Returns
   * the captured stream for a local self-preview.
   */
  startCamera: () => Promise<MediaStream>;
  /** Stops the camera and removes it from every connection. Renegotiates each. */
  stopCamera: () => Promise<void>;
  isCameraOn: () => boolean;
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
    /**
     * Which side yields if this pair's connection ever renegotiates at the
     * same instant on both ends (SDP glare) — see the AudioPeer doc comment
     * in peer.ts for the full reasoning, reused here per pair rather than
     * per call: whichever side does NOT send this pair's initial offer is
     * the polite one, exactly as isCaller decides it for a 1:1 call.
     */
    polite: boolean;
    /** This connection's sender for the shared camera track, if it has one. */
    cameraSender: RTCRtpSender | null;
    /**
     * Serializes every SDP-mutating operation on this one connection — both
     * the offers WE send (renegotiate) and the offer/answer signals we
     * receive (acceptSignal) — so the two can never interleave on our own
     * side. Without this, createOffer() awaiting while an incoming offer
     * was processed concurrently could let our setLocalDescription() land
     * after the connection had already moved to have-remote-offer, which
     * throws — caught directly by a real 3-way mesh test where two
     * participants started their cameras in the same tick, each
     * renegotiating their shared pairwise connection at once. Genuine
     * cross-connection glare — the OTHER side's own independent offer
     * arriving while ours is outstanding — is unaffected and still exactly
     * what `polite` resolves: this queue only removes the additional,
     * purely-local race between our own two code paths.
     */
    queue: Promise<void>;
  }

  const peers = new Map<string, PeerEntry>();
  let closed = false;
  let cameraStream: MediaStream | null = null;

  function createPeer(peerId: string): PeerEntry {
    const existing = peers.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers });
    const remoteStream = new MediaStream();
    const entry: PeerEntry = {
      connection,
      remoteStream,
      pending: [],
      polite: !shouldOffer(selfId, peerId),
      cameraSender: null,
      queue: Promise.resolve(),
    };
    peers.set(peerId, entry);

    localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

    // A participant whose camera is already on when someone new joins adds
    // it to this brand-new connection immediately, rather than needing to
    // retoggle — the newcomer sees it as soon as this connection completes.
    if (cameraStream) {
      const track = cameraStream.getVideoTracks()[0];
      if (track) entry.cameraSender = connection.addTrack(track, cameraStream);
    }

    connection.ontrack = (event) => {
      if (event.track.kind === "video") {
        // No screen share in a group call, so any video track is
        // unambiguously a camera — no role map needed, unlike peer.ts.
        const videoStream = new MediaStream([event.track]);
        callbacks.onRemoteCamera(peerId, videoStream);

        // Same reasoning as peer.ts: onmute is what actually fires when a
        // receiver stops getting RTP (removeTrack() on the far end, which
        // only renegotiates the m-line down rather than tearing the
        // transceiver out); onended is wired too in case some browser's own
        // teardown reaches it instead.
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          callbacks.onRemoteCamera(peerId, null);
        };
        event.track.onmute = settle;
        event.track.onended = settle;
        return;
      }

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

  /**
   * Runs one SDP-mutating task against a connection after any already
   * queued for it, so it can never interleave with another task on the
   * same connection — see PeerEntry.queue. Every task must catch its own
   * errors (into callbacks.onError) rather than throw, so a failure never
   * leaves the queue itself rejected and stuck.
   */
  function enqueue(entry: PeerEntry, task: () => Promise<void>): Promise<void> {
    entry.queue = entry.queue.then(task);
    return entry.queue;
  }

  /**
   * Sends a fresh offer for one pairwise connection, reflecting whatever
   * tracks are on it right now. Queued rather than fired independently, so
   * a start immediately followed by a stop on the same connection applies
   * in order, and so it cannot race an incoming offer/answer for the same
   * peer being handled at the same time — exactly as peer.ts's
   * renegotiate() does for the 1:1 case, extended here to also serialize
   * against acceptSignal (see PeerEntry.queue for why that part matters
   * more in a mesh, where two different participants can renegotiate the
   * same shared connection from both ends independently).
   */
  function renegotiate(peerId: string, entry: PeerEntry): Promise<void> {
    return enqueue(entry, async () => {
      try {
        const offer = await entry.connection.createOffer();
        await entry.connection.setLocalDescription(offer);
        callbacks.onSignal({ to: peerId, from: selfId, signal: { kind: "offer", sdp: offer } });
      } catch (error) {
        callbacks.onError(
          new PeerError(`Could not update a connection: ${(error as Error).message}`),
        );
      }
    });
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

      // ICE candidates aren't an SDP mutation and don't need to queue
      // behind renegotiate()/offer-answer handling — they only need
      // remoteDescription to already be set, which pending/flush already
      // covers regardless of ordering.
      if (signal.kind === "ice") {
        try {
          if (entry.connection.remoteDescription) {
            await entry.connection.addIceCandidate(signal.candidate);
          } else {
            entry.pending.push(signal.candidate);
          }
        } catch (error) {
          console.error("[ohun] failed to add ICE candidate", error);
        }
        return;
      }

      // Offer and answer both mutate the connection's signalling state, so
      // they run through the same queue renegotiate() uses — see
      // PeerEntry.queue for why that specifically matters here.
      await enqueue(entry, async () => {
        try {
          if (signal.kind === "offer") {
            // Glare: this connection already has an offer outstanding (it
            // left `stable` the moment setLocalDescription ran for it) and
            // now one has arrived from the other side too — both started
            // renegotiating this same pair at once. See PeerEntry.polite.
            const collision = entry.connection.signalingState !== "stable";
            if (collision) {
              if (!entry.polite) {
                // Ignore theirs; our own offer is still outstanding and
                // will be answered once they see they must yield instead.
                return;
              }
              await entry.connection.setLocalDescription({ type: "rollback" });
            }

            await entry.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await flushCandidates(entry);
            const answer = await entry.connection.createAnswer();
            await entry.connection.setLocalDescription(answer);
            callbacks.onSignal({ to: from, from: selfId, signal: { kind: "answer", sdp: answer } });
            return;
          }

          // Ignore a duplicate answer — re-applying in `stable` throws.
          if (entry.connection.signalingState === "stable") return;
          await entry.connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushCandidates(entry);
        } catch (error) {
          callbacks.onError(
            new PeerError(`Connection negotiation failed: ${(error as Error).message}`),
          );
        }
      });
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

    async startCamera() {
      if (cameraStream) return cameraStream;

      let captured: MediaStream;
      try {
        captured = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
      } catch (error) {
        throw new PeerError(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera access was denied. Allow it for this site and try again."
            : error instanceof Error
              ? `Could not access your camera: ${error.message}`
              : "Could not access your camera.",
        );
      }

      const track = captured.getVideoTracks()[0];
      if (!track) {
        captured.getTracks().forEach((t) => t.stop());
        throw new PeerError("No camera track was returned.");
      }

      cameraStream = captured;

      // One capture, added to every connection currently held — each gets
      // its own sender for the same source track and renegotiates
      // independently, so one slow peer's negotiation never blocks another.
      for (const [peerId, entry] of peers) {
        entry.cameraSender = entry.connection.addTrack(track, captured);
        void renegotiate(peerId, entry);
      }

      // Covers the camera device disappearing mid-call — unplugged, or
      // permission revoked from the OS/browser settings while live.
      track.onended = () => {
        void stopCamera();
      };

      return captured;
    },

    stopCamera,

    isCameraOn() {
      return cameraStream !== null;
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
      cameraStream?.getTracks().forEach((track) => track.stop());
    },
  };

  // A plain function, not a method on the returned object: the camera
  // track's own onended (device loss) needs to reach this directly, and a
  // method pulled off the returned object loses its `this` the moment a
  // caller destructures it — same reasoning as peer.ts's stopScreenShare.
  async function stopCamera() {
    if (!cameraStream) return;

    for (const [peerId, entry] of peers) {
      if (!entry.cameraSender) continue;
      entry.connection.removeTrack(entry.cameraSender);
      entry.cameraSender = null;
      void renegotiate(peerId, entry);
    }

    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    callbacks.onCameraEnded();
  }
}
