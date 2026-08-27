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
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (error: Error) => void;
}

export interface AudioPeer {
  /** Caller side: create and send the offer. */
  createOffer: () => Promise<void>;
  /** Apply a signal received from the other side. */
  acceptSignal: (signal: PeerSignal) => Promise<void>;
  /** Stop sending audio without tearing down the connection. */
  setMicrophoneEnabled: (enabled: boolean) => void;
  isMicrophoneEnabled: () => boolean;
  close: () => void;
  /** True when TURN relay was available for this connection. */
  hasTurn: boolean;
  /** The captured microphone stream, for local level metering. */
  localStream: MediaStream;
}

export class PeerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerError";
  }
}

export async function createAudioPeer(callbacks: PeerCallbacks): Promise<AudioPeer> {
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

  // Remote audio arrives as its own stream; the room attaches it to an
  // <audio> element.
  const remoteStream = new MediaStream();
  connection.ontrack = (event) => {
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

    close() {
      connection.ontrack = null;
      connection.onicecandidate = null;
      connection.onconnectionstatechange = null;
      localStream.getTracks().forEach((track) => track.stop());
      remoteStream.getTracks().forEach((track) => remoteStream.removeTrack(track));
      connection.close();
    },
  };
}
