"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createAudioPeer, type AudioPeer, type PeerSignal } from "@/lib/webrtc/peer";
import {
  useTranscriptionSession,
  type TranslationPayload,
} from "@/lib/assemblyai/useTranscriptionSession";
import { speak, localeFor } from "@/lib/audio/player";
import { setCallStatus } from "./actions";
import {
  isTerminalStatus,
  type Call,
  type CallCaption,
  type CallConnectionState,
  type CallStatus,
} from "@/types";

/** A translated utterance sent to the other participant over the call channel. */
interface CaptionMessage extends TranslationPayload {
  id: string;
}

/** Keeps the caption list bounded during a long call. */
const MAX_CAPTIONS = 50;

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

  // `call` is a server-render snapshot and never updates. The caller lands
  // here while the row still says "ringing", so the live status has to come
  // from the Realtime watcher below — otherwise the caller would wait
  // forever for an acceptance it can never observe.
  const [liveStatus, setLiveStatus] = useState<CallStatus>(call.status);

  // Deliberately a boolean, not the raw status: it flips false -> true once
  // when the call is answered and then stays true, so the later
  // accepted -> connected transition does not re-run the media effect and
  // tear down a working peer connection.
  const shouldNegotiate = liveStatus === "accepted" || liveStatus === "connected";
  const [micEnabled, setMicEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  // Read inside async playback, where the state value would be stale.
  const speakerEnabledRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  // Assume TURN until the peer reports otherwise, so the "no relay" warning
  // only appears once we actually know it is missing.
  const [hasTurn, setHasTurn] = useState(true);

  const [captions, setCaptions] = useState<CallCaption[]>([]);

  // Held in state rather than a ref so the level meters re-render when the
  // streams arrive. Purely presentational — nothing in the call depends on
  // these.
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Snapshotted on the call row, so a later profile edit cannot change a
  // live room. Which side of the pair is "mine" depends on who called.
  const myLanguage = isCaller ? call.callerLanguage : call.receiverLanguage;
  const theirLanguage = isCaller ? call.receiverLanguage : call.callerLanguage;

  const peerRef = useRef<AudioPeer | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const offerSentRef = useRef(false);
  const teardownRef = useRef(false);
  /** Set once the transcription hook below exists — see speakIncoming. */
  const suppressInputRef = useRef<((suppressed: boolean, reason: string) => void) | null>(null);

  /** Attach the remote stream to the <audio> element the room renders. */
  const attachRemoteAudio = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
  }, []);

  const appendCaption = useCallback((caption: CallCaption) => {
    setCaptions((current) => [...current, caption].slice(-MAX_CAPTIONS));
  }, []);

  /**
   * Speaks a translation that arrived from the other participant.
   *
   * Mutes the *remote* <audio> element for the duration so the synthesized
   * voice is intelligible over their raw speech. This deliberately never
   * touches the microphone: it has to keep feeding transcription, and
   * muting it would silence the local user mid-conversation.
   */
  const speakIncoming = useCallback(
    async (text: string) => {
      const element = remoteAudioRef.current;
      const wasMuted = element?.muted ?? false;
      if (element) element.muted = true;

      // Stop feeding transcription for the duration. Synthesized speech
      // comes out of the same speakers the microphone is listening to, and
      // browser echo cancellation covers the WebRTC render path rather than
      // speechSynthesis — so without this the app transcribes its own
      // output, translates it, and sends it back, and the two sides end up
      // talking to each other unprompted.
      suppressInputRef.current?.(true, "playback");

      try {
        await speak({ text, languageCode: localeFor(myLanguage) });
      } finally {
        suppressInputRef.current?.(false, "playback");
        // Never un-mute something the user muted themselves.
        if (element) element.muted = wasMuted || !speakerEnabledRef.current;
      }
    },
    [myLanguage],
  );

  const teardown = useCallback(() => {
    teardownRef.current = true;
    peerRef.current?.close();
    peerRef.current = null;
    if (channelRef.current) {
      void channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }, []);

  /**
   * My own speech: transcribed here, translated into their language here,
   * then the text is sent to them to be spoken on their device. Only the
   * translated text crosses the network — never synthesized audio.
   */
  const transcription = useTranscriptionSession({
    // The peer's capture, shared rather than opened a second time — see
    // toggleMicrophone.
    stream: localStream,
    language: myLanguage,
    // Both sides' languages, so the model can follow either and report
    // which was actually spoken.
    languages: [myLanguage, theirLanguage],
    targetLanguage: theirLanguage,
    speakLocally: false,
    onTranslation: ({ originalText, translatedText }) => {
      const message: CaptionMessage = {
        id: `${selfId}-${Date.now()}`,
        originalText,
        translatedText,
      };

      appendCaption({
        id: message.id,
        fromSelf: true,
        originalText,
        translatedText,
        at: Date.now(),
      });

      void channelRef.current?.send({
        type: "broadcast",
        event: "caption",
        payload: message,
      });
    },
  });

  useEffect(() => {
    suppressInputRef.current = transcription.setInputSuppressed;
  }, [transcription.setInputSuppressed]);

  const endCall = useCallback(async () => {
    teardown();
    setConnectionState("ended");
    await setCallStatus(call.id, "ended");
  }, [call.id, teardown]);

  // --- media + signalling ---------------------------------------------------
  useEffect(() => {
    // Only negotiate once the call has actually been answered.
    if (!shouldNegotiate) return;

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
            if (!cancelled) setRemoteStream(stream);
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
      setLocalStream(peer.localStream);

      channel.on("broadcast", { event: "signal" }, ({ payload }) => {
        void peer.acceptSignal(payload as PeerSignal);
      });

      // Their speech, already translated into my language by their browser.
      channel.on("broadcast", { event: "caption" }, ({ payload }) => {
        const message = payload as CaptionMessage;
        if (!message?.translatedText) return;

        appendCaption({
          id: message.id,
          fromSelf: false,
          originalText: message.originalText,
          translatedText: message.translatedText,
          at: Date.now(),
        });

        void speakIncoming(message.translatedText);
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
      setLocalStream(null);
      setRemoteStream(null);
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [call.id, shouldNegotiate, isCaller, selfId, appendCaption, speakIncoming]);

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

          // Drives the caller out of "ringing" once the receiver answers.
          setLiveStatus(status);

          if (isTerminalStatus(status) && !teardownRef.current) {
            teardown();
            setConnectionState(status === "declined" ? "declined" : "ended");
            return;
          }

          // Show "connecting" the moment it is answered; the peer's own
          // state change is what later promotes this to "connected".
          if (status === "accepted") {
            setConnectionState((current) =>
              current === "calling" || current === "ringing" ? "connecting" : current,
            );
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        // An UPDATE fired between this page mounting and the subscription
        // going live would be missed entirely, stranding the caller on
        // "calling" forever. Reconcile once against the row itself.
        const { data } = await supabase
          .from("calls")
          .select("status")
          .eq("id", call.id)
          .maybeSingle();

        const current = (data as { status: CallStatus } | null)?.status;
        if (!current) return;

        setLiveStatus(current);
        if (isTerminalStatus(current) && !teardownRef.current) {
          teardown();
          setConnectionState(current === "declined" ? "declined" : "ended");
        } else if (current === "accepted" || current === "connected") {
          setConnectionState((previous) =>
            previous === "calling" || previous === "ringing" ? "connecting" : previous,
          );
        }
      });

    return () => {
      void watcher.unsubscribe();
    };
  }, [call.id, teardown]);

  // --- transcription runs for the life of the connected call ---------------
  const startTranscription = transcription.start;
  const stopTranscription = transcription.stop;

  useEffect(() => {
    if (connectionState !== "connected" || !localStream) return;
    void startTranscription();
    return () => {
      void stopTranscription();
    };
  }, [connectionState, localStream, startTranscription, stopTranscription]);

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
    // Transcription holds its own microphone capture, so disabling the
    // outgoing track only silences the other side. Without this a muted
    // caller is still transcribed, translated and sent as captions.
    suppressInputRef.current?.(!next, "muted");
    setMicEnabled(next);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const element = remoteAudioRef.current;
    if (!element) return;
    const next = !speakerEnabled;
    element.muted = !next;
    speakerEnabledRef.current = next;
    setSpeakerEnabled(next);
  }, [speakerEnabled]);

  return {
    connectionState,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    captions,
    /** Live microphone and peer audio, for the level meters. */
    localStream,
    remoteStream,
    /** My own in-progress speech, before the utterance completes. */
    liveTranscript: transcription.transcript,
    isTranslating: transcription.isTranslating,
    transcriptionError: transcription.error ?? transcription.translationError,
    canSpeakAloud: transcription.canSpeakAloud,
    attachRemoteAudio,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
  };
}
