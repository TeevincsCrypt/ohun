"use client";

import { fetchIceConfig } from "./client";

/**
 * Browser-only wrapper around RTCPeerConnection for a one-to-one audio
 * call. Signalling is injected — this module never talks to Supabase — so
 * the transport can change without touching the media logic.
 */

export type PeerSignal =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

export interface PeerCallbacks {
  /** Send a signal to the other side. */
  onSignal: (signal: PeerSignal) => void;
  onRemoteStream: (stream: MediaStream) => void;
  /**
   * Fired when the other side's shared screen arrives, and again with null
   * when they stop sharing. Distinguished from onRemoteStream by kind — the
   * call has no other source of video, so any video track is a screen.
   */
  onRemoteScreenShare: (stream: MediaStream | null) => void;
  /**
   * Fired whenever OUR OWN screen share ends, for any reason — including
   * the browser's own "Stop sharing" control, which the caller has no other
   * way to learn about. stopScreenShare() calling this itself means a UI
   * toggle button never has to guess whether the end it is reacting to was
   * its own tap or the browser's.
   */
  onScreenShareEnded: () => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
}

/**
 * True in exactly one browser per call: the one that did NOT place it.
 *
 * Every renegotiation before screen share was the single initial offer,
 * sent by the caller once and never contested — glare was structurally
 * impossible. Adding or removing a screen share sends a second offer on
 * whichever side toggles it, and if both sides happen to renegotiate in the
 * same instant, both`RTCPeerConnection`s leave `stable` at once. Politeness
 * is what breaks that tie: the polite side rolls its own offer back and
 * accepts the other's; the impolite side ignores an incoming offer while
 * its own is outstanding, trusting its offer to be answered once the
 * remote side yields. This is the standard "perfect negotiation" pattern —
 * see acceptSignal below.
 */
export interface AudioPeer {
  /** Caller side: create and send the offer. */
  createOffer: () => Promise<void>;
  /** Apply a signal received from the other side. */
  acceptSignal: (signal: PeerSignal) => Promise<void>;
  /** Stop sending audio without tearing down the connection. */
  setMicrophoneEnabled: (enabled: boolean) => void;
  isMicrophoneEnabled: () => boolean;
  /** Captures the screen and adds it to the call. Renegotiates. */
  startScreenShare: () => Promise<void>;
  /** Stops sharing and removes the track. Renegotiates. */
  stopScreenShare: () => Promise<void>;
  isSharingScreen: () => boolean;
  close: () => void;
  /** True when TURN relay was available for this connection. */
  hasTurn: boolean;
  /** The captured microphone stream, for local level metering. */
  localStream: MediaStream;
}

/**
 * Whether this browser can capture the screen at all.
 *
 * Notably false on every iOS browser, Safari included — WebKit has never
 * shipped `getDisplayMedia`, on-device or in a home-screen install, so this
 * is a real platform ceiling rather than something a feature flag or a
 * later browser update quietly lifts. Desktop browsers and Android Chrome
 * support it; that is the actual reach of this feature.
 */
export function isScreenShareSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

export class PeerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerError";
  }
}

export async function createAudioPeer(
  callbacks: PeerCallbacks,
  options: { polite: boolean },
): Promise<AudioPeer> {
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
  const connection = new RTCPeerConnection({ iceServers });

  localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

  let screenStream: MediaStream | null = null;
  let screenSender: RTCRtpSender | null = null;

  /**
   * Sends a fresh offer reflecting whatever tracks are on the connection
   * right now. Chained onto itself rather than fired independently, so a
   * stop immediately after a start (or a double click) applies in order
   * instead of two createOffer() calls racing on setLocalDescription.
   */
  let renegotiation: Promise<void> = Promise.resolve();
  function renegotiate(): Promise<void> {
    renegotiation = renegotiation.then(async () => {
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        callbacks.onSignal({ kind: "offer", sdp: offer });
      } catch (error) {
        callbacks.onError(
          new PeerError(`Could not update the connection: ${(error as Error).message}`),
        );
      }
    });
    return renegotiation;
  }

  // Remote audio arrives as its own stream; the room attaches it to an
  // <audio> element.
  const remoteStream = new MediaStream();
  connection.ontrack = (event) => {
    // The call never sends video of its own, so any video track that
    // arrives is unambiguously the other side's shared screen.
    if (event.track.kind === "video") {
      const screenStream = new MediaStream([event.track]);
      callbacks.onRemoteScreenShare(screenStream);

      // `onended` looked like the right event and is not: it fires when a
      // receiver's track is torn down entirely (the connection closing, or
      // its transceiver being stopped outright), which stopScreenShare()
      // never does — it calls removeTrack(), which only renegotiates the
      // m-line's direction down to inactive/recvonly and leaves the
      // transceiver itself alive. Verified directly: a two-peer connection
      // driven end-to-end through a real removeTrack()+renegotiate() cycle
      // left the receiving side's track sitting at readyState "live" with
      // onended never called, so the UI never learned the share had ended.
      // `onmute` is the event the spec actually assigns to "this receiver
      // stopped getting RTP" while the track itself is still alive, which
      // is exactly this case — confirmed by the same test once switched to
      // it. Both are wired regardless: onended costs nothing to also honour
      // if some browser's connection teardown ever fires it here instead,
      // and settled() below stops whichever fires first from being able to
      // double-report.
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        callbacks.onRemoteScreenShare(null);
      };
      event.track.onmute = settle;
      event.track.onended = settle;
      return;
    }

    event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
    callbacks.onRemoteStream(remoteStream);
  };

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      callbacks.onSignal({ kind: "ice", candidate: event.candidate.toJSON() });
    }
  };

  connection.onconnectionstatechange = () => {
    callbacks.onConnectionStateChange(connection.connectionState);
  };

  connection.onicecandidateerror = () => {
    // Individual candidate failures are normal (a blocked STUN server, say)
    // and only matter if the connection as a whole fails, which
    // onconnectionstatechange already reports. Deliberately not surfaced.
  };

  // ICE candidates can arrive before the remote description is set; applying
  // one then throws, so queue until the description lands.
  const pendingCandidates: RTCIceCandidateInit[] = [];
  const flushCandidates = async () => {
    while (pendingCandidates.length > 0) {
      const candidate = pendingCandidates.shift();
      if (!candidate) continue;
      try {
        await connection.addIceCandidate(candidate);
      } catch (error) {
        console.error("[ohun] failed to add ICE candidate", error);
      }
    }
  };

  // A plain function, not a method on the returned object: the browser's
  // own "Stop sharing" control needs to reach this directly from
  // track.onended below, and a method pulled off the returned object loses
  // its `this` the moment a caller destructures it — which the object's
  // own consumer does (see useCallSession.ts).
  async function stopScreenShare() {
    if (!screenStream || !screenSender) return;

    connection.removeTrack(screenSender);
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
    screenSender = null;

    callbacks.onScreenShareEnded();
    await renegotiate();
  }

  return {
    hasTurn,
    localStream,

    async createOffer() {
      try {
        const offer = await connection.createOffer({ offerToReceiveAudio: true });
        await connection.setLocalDescription(offer);
        callbacks.onSignal({ kind: "offer", sdp: offer });
      } catch (error) {
        callbacks.onError(
          new PeerError(`Could not start the connection: ${(error as Error).message}`),
        );
      }
    },

    async acceptSignal(signal) {
      try {
        if (signal.kind === "offer") {
          // Glare: this side already has an offer outstanding (signalingState
          // left "stable" the moment setLocalDescription ran for it) and now
          // one has arrived from the other side too — both started
          // renegotiating at once. See the AudioPeer doc comment for why
          // this is now reachable and how politeness resolves it.
          const collision = connection.signalingState !== "stable";
          if (collision) {
            if (!options.polite) {
              // Ignore theirs; it is impolite to yield. Our own offer is
              // still outstanding and will be answered once they receive it
              // and see they must yield instead.
              return;
            }
            await connection.setLocalDescription({ type: "rollback" });
          }

          await connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushCandidates();
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          callbacks.onSignal({ kind: "answer", sdp: answer });
          return;
        }

        if (signal.kind === "answer") {
          // Ignore a duplicate answer — re-applying in `stable` throws.
          if (connection.signalingState === "stable") return;
          await connection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await flushCandidates();
          return;
        }

        if (connection.remoteDescription) {
          await connection.addIceCandidate(signal.candidate);
        } else {
          pendingCandidates.push(signal.candidate);
        }
      } catch (error) {
        callbacks.onError(
          new PeerError(`Connection negotiation failed: ${(error as Error).message}`),
        );
      }
    },

    setMicrophoneEnabled(enabled) {
      // Disables the outgoing track only. Phase 4b will mute the *remote*
      // <audio> element during TTS playback — a separate concern that must
      // never touch this, since the mic has to keep feeding transcription.
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },

    isMicrophoneEnabled() {
      return localStream.getAudioTracks().some((track) => track.enabled);
    },

    async startScreenShare() {
      if (screenStream) return;

      let captured: MediaStream;
      try {
        // audio: false — this call already has its own microphone audio on
        // its own track; capturing "share tab audio" here would add a
        // second, redundant audio track for no reason this app has.
        captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch (error) {
        // The most common case by far is the user closing the browser's own
        // picker without choosing anything — not a real failure.
        if (error instanceof DOMException && error.name === "NotAllowedError") return;
        throw new PeerError(
          error instanceof Error
            ? `Could not share your screen: ${error.message}`
            : "Could not share your screen.",
        );
      }

      const track = captured.getVideoTracks()[0];
      if (!track) {
        captured.getTracks().forEach((t) => t.stop());
        throw new PeerError("No screen track was returned.");
      }

      screenStream = captured;
      screenSender = connection.addTrack(track, captured);

      // Covers the browser's OWN "Stop sharing" control (the bar/button it
      // draws itself, outside this app's UI entirely) — without this, that
      // stops the capture but leaves this app's state, and the track this
      // sends, believing sharing is still on.
      track.onended = () => {
        void stopScreenShare();
      };

      await renegotiate();
    },

    stopScreenShare,

    isSharingScreen() {
      return screenStream !== null;
    },

    close() {
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.onconnectionstatechange = null;
      localStream.getTracks().forEach((track) => track.stop());
      screenStream?.getTracks().forEach((track) => track.stop());
      remoteStream.getTracks().forEach((track) => remoteStream.removeTrack(track));
      connection.close();
    },
  };
}
