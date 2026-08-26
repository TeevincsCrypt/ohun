"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createAudioPeer, type AudioPeer, type PeerSignal } from "@/lib/webrtc/peer";
import { setCallStatus } from "./actions";
import { isTerminalStatus, type Call, type CallConnectionState, type CallStatus } from "@/types";

interface UseCallSessionOptions {
  call: Call;
  /** The signed-in user's id — decides who makes the offer. */
  selfId: string;
}

/**
 * Runs one call: Supabase Realtime carries signalling, WebRTC carries audio.
 *
 * The caller creates the offer once both sides are present. Presence on the
 * call's broadcast channel is what signals readiness, which avoids a race
 * where the offer is sent before the receiver has subscribed.
 */
export function useCallSession({ call, selfId }: UseCallSessionOptions) {
  const isCaller = call.callerId === selfId;

  const [connectionState, setConnectionState] = useState<CallConnectionState>(
    call.status === "ringing" ? (isCaller ? "calling" : "ringing") : "connecting",
  );
  const [micEnabled, setMicEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  // Assume TURN until the peer reports otherwise, so the "no relay" warning
  // only appears once we actually know it is missing.
  const [hasTurn, setHasTurn] = useState(true);

  const peerRef = useRef<AudioPeer | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const offerSentRef = useRef(false);
  const teardownRef = useRef(false);

  /** Attach the remote stream to the <audio> element the room renders. */
  const attachRemoteAudio = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
  }, []);

  const teardown = useCallback(() => {
    teardownRef.current = true;
    peerRef.current?.close();
    peerRef.current = null;
    if (channelRef.current) {
      void channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }, []);

  const endCall = useCallback(async () => {
    teardown();
    setConnectionState("ended");
    await setCallStatus(call.id, "ended");
  }, [call.id, teardown]);

  // --- media + signalling ---------------------------------------------------
  useEffect(() => {
    // Only negotiate once the call has actually been answered.
    if (call.status !== "accepted" && call.status !== "connected") return;

    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel(`call:${call.id}`, {
      config: { presence: { key: selfId } },
    });
    channelRef.current = channel;

    const send = (signal: PeerSignal) => {
      void channel.send({ type: "broadcast", event: "signal", payload: signal });
    };

    async function begin() {
      let peer: AudioPeer;
      try {
        peer = await createAudioPeer({
          onSignal: send,
          onRemoteStream: (stream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = stream;
              void remoteAudioRef.current.play().catch(() => {
                // Autoplay can be blocked until a user gesture; the room's
                // controls provide one.
              });
            }
          },
          onConnectionStateChange: (state) => {
            if (cancelled) return;
            if (state === "connected") {
              setConnectionState("connected");
              startedAtRef.current ??= Date.now();
              void setCallStatus(call.id, "connected");
            } else if (state === "failed") {
              setConnectionState("failed");
              setError("The audio connection failed.");
            } else if (state === "disconnected") {
              setConnectionState("connecting");
            }
          },
          onError: (peerError) => {
            if (cancelled) return;
            setError(peerError.message);
          },
        });
      } catch (peerError) {
        if (!cancelled) {
          setConnectionState("failed");
          setError(peerError instanceof Error ? peerError.message : "Could not start audio.");
        }
        return;
      }

      if (cancelled) {
        peer.close();
        return;
      }
      peerRef.current = peer;
      setMicEnabled(peer.isMicrophoneEnabled());
      setHasTurn(peer.hasTurn);

      channel.on("broadcast", { event: "signal" }, ({ payload }) => {
        void peer.acceptSignal(payload as PeerSignal);
      });

      // The caller waits for the receiver to appear before offering.
      channel.on("presence", { event: "sync" }, () => {
        if (!isCaller || offerSentRef.current) return;
        const others = Object.keys(channel.presenceState()).filter((key) => key !== selfId);
        if (others.length > 0) {
          offerSentRef.current = true;
          void peer.createOffer();
        }
      });

      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ joinedAt: Date.now() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!cancelled) {
            setConnectionState("failed");
            setError("Lost the signalling connection.");
          }
        }
      });
    }

    void begin();

    return () => {
      cancelled = true;
      peerRef.current?.close();
      peerRef.current = null;
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [call.id, call.status, isCaller, selfId]);

  // --- watch the call row so either side leaving ends it for both ----------
  useEffect(() => {
    const supabase = createClient();
    const watcher = supabase
      .channel(`call-row:${call.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${call.id}` },
        (payload) => {
          const status = (payload.new as { status: CallStatus }).status;
          if (isTerminalStatus(status) && !teardownRef.current) {
            teardown();
            setConnectionState(status === "declined" ? "declined" : "ended");
          }
        },
      )
      .subscribe();

    return () => {
      void watcher.unsubscribe();
    };
  }, [call.id, teardown]);

  // --- duration ------------------------------------------------------------
  useEffect(() => {
    if (connectionState !== "connected") return;
    const timer = setInterval(() => {
      if (startedAtRef.current) {
        setDurationSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [connectionState]);

  // --- leaving the page ends the call for the other side -------------------
  useEffect(() => {
    const handleUnload = () => {
      // Fire-and-forget; the row update is what the peer is watching.
      void setCallStatus(call.id, "ended");
    };
    window.addEventListener("pagehide", handleUnload);
    return () => window.removeEventListener("pagehide", handleUnload);
  }, [call.id]);

  const toggleMicrophone = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;
    const next = !peer.isMicrophoneEnabled();
    peer.setMicrophoneEnabled(next);
    setMicEnabled(next);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const element = remoteAudioRef.current;
    if (!element) return;
    const next = !speakerEnabled;
    element.muted = !next;
    setSpeakerEnabled(next);
  }, [speakerEnabled]);

  return {
    connectionState,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    attachRemoteAudio,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
  };
}
