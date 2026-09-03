"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  createAudioPeer,
  isCameraSupported,
  isScreenShareSupported,
  type AudioPeer,
  type PeerSignal,
} from "@/lib/webrtc/peer";
import {
  useTranscriptionSession,
  type TranslationPayload,
} from "@/lib/assemblyai/useTranscriptionSession";
import { installSpeechPrimer } from "@/lib/audio/player";
import { SpeechQueue } from "@/lib/audio/queue";
import { setCallStatus } from "./actions";
import { recordUtterance } from "@/lib/summary/actions";
import {
  isCallLanguage,
  isTerminalStatus,
  type Call,
  type CallCaption,
  type CallConnectionState,
  type CallLanguageCode,
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
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  // The other side's camera, and my own captured preview — two separate
  // streams, since each side only ever sees its own local capture directly
  // and the other's over the connection.
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);

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
  /** Serialises everything spoken aloud here — see the effect below. */
  const speechRef = useRef<SpeechQueue | null>(null);

  /** Attach the remote stream to the <audio> element the room renders. */
  const attachRemoteAudio = useCallback((element: HTMLAudioElement | null) => {
    remoteAudioRef.current = element;
  }, []);

  /**
   * Adds a caption, or fills in one already on screen.
   *
   * An utterance appears the moment it is transcribed and is completed when
   * its translation lands, so the two arrive as separate events for the
   * same line — which is why this replaces a plain append.
   */
  const upsertCaption = useCallback((caption: CallCaption) => {
    setCaptions((current) => {
      const index = current.findIndex((existing) => existing.id === caption.id);
      if (index === -1) return [...current, caption].slice(-MAX_CAPTIONS);

      const next = current.slice();
      next[index] = { ...next[index], ...caption };
      return next;
    });
  }, []);

  /**
   * Owns everything spoken aloud on this device, and the ducking that goes
   * with it, for the life of the session.
   *
   * A queue rather than each caller speaking for itself. The previous
   * version ducked and un-ducked inside playAudio, snapshotting
   * element.muted on the way in and restoring it on the way out — which is
   * only correct while exactly one playback is ever in flight. Two
   * overlapping lines (two captions landing together, or a caption line
   * clicked mid-utterance, both routine while you are muted and listening)
   * made the second snapshot the *first* one's ducking, so the remote audio
   * was restored to muted and stayed that way for the rest of the call. The
   * same overlap released the "playback" input suppression while the second
   * line was still audible, feeding our own synthesized speech back into
   * transcription.
   *
   * With one queue there is a single speaking/not-speaking transition to
   * react to, and the element's resting state is derived from the user's
   * own speaker choice rather than re-read from the element.
   */
  // The person who *placed* the call never taps "Accept", so they have no
  // obvious gesture to unlock speech with. Take the next tap anywhere.
  useEffect(() => installSpeechPrimer(), []);

  useEffect(() => {
    const queue = new SpeechQueue({
      onSpeakingChange: (speaking) => {
        // Stop feeding transcription: this comes out of the same speakers
        // the microphone is listening to, and browser echo cancellation
        // covers the WebRTC render path, not speechSynthesis.
        suppressInputRef.current?.(speaking, "playback");
        // Duck their raw voice so the translation stays intelligible over
        // it, then hand the element back to whatever the user chose.
        const element = remoteAudioRef.current;
        if (element) element.muted = speaking || !speakerEnabledRef.current;
      },
    });
    speechRef.current = queue;

    return () => {
      queue.stop();
      speechRef.current = null;
    };
  }, []);

  /**
   * Speaks text aloud in a given language.
   *
   * Also used for on-demand replay: a caption line clicked in any language
   * routes through here rather than calling speak() on its own, because
   * bypassing the queue means bypassing the suppression — which is exactly
   * what let transcription hear and re-translate our own output.
   */
  const playAudio = useCallback(
    (text: string, language: CallLanguageCode): Promise<void> =>
      speechRef.current?.enqueue(text, language) ?? Promise.resolve(),
    [],
  );

  /** Queues an incoming translation to be spoken in my language. */
  const speakIncoming = useCallback(
    (text: string) => playAudio(text, myLanguage),
    [playAudio, myLanguage],
  );

  const teardown = useCallback(() => {
    teardownRef.current = true;
    // Nothing queued is worth hearing once the call is over.
    speechRef.current?.clear();
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
  // Memoised even though the hook now reads it through a ref: an inline
  // array here is what caused the session to restart on every render.
  const callLanguages = useMemo(
    () => [myLanguage, theirLanguage],
    [myLanguage, theirLanguage],
  );

  const transcription = useTranscriptionSession({
    // The peer's capture, shared rather than opened a second time — see
    // toggleMicrophone.
    stream: localStream,
    language: myLanguage,
    // Both sides' languages, so the model can follow either and report
    // which was actually spoken.
    languages: callLanguages,
    targetLanguage: theirLanguage,
    speakLocally: false,
    // Shown the moment it is heard. Waiting for the translation meant a
    // failed translation erased the transcription too — the line never
    // appeared at all, on either side, and nothing was ever spoken.
    onFinalUtterance: ({ id, text }) => {
      upsertCaption({
        id,
        fromSelf: true,
        originalText: text,
        translatedText: "",
        at: Date.now(),
      });
    },
    onTranslation: ({ id, originalText, translatedText, spokenLanguage }) => {
      // The transcriber only ever sees this call's languages, so detection
      // cannot return anything outside them — but narrow rather than assert,
      // since LanguageCode also covers languages calls do not support.
      const spoken = isCallLanguage(spokenLanguage) ? spokenLanguage : myLanguage;

      // Stored so the call can be summarised afterwards. Deliberately not
      // awaited: a transcript row failing to save must not interrupt a call.
      void recordUtterance(
        { callId: call.id },
        { originalText, spokenLanguage: spoken, translations: { [theirLanguage]: translatedText } },
      );

      const message: CaptionMessage = {
        id: `${selfId}-${id}`,
        originalText,
        translatedText,
        spokenLanguage: spoken,
      };

      upsertCaption({
        id,
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
        peer = await createAudioPeer(
          {
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
            onRemoteScreenShare: (stream) => {
              if (!cancelled) setRemoteScreenStream(stream);
            },
            onRemoteCamera: (stream) => {
              if (!cancelled) setRemoteCameraStream(stream);
            },
            onScreenShareEnded: () => {
              if (!cancelled) setScreenSharing(false);
            },
            onCameraEnded: () => {
              if (!cancelled) {
                setCameraOn(false);
                setLocalCameraStream(null);
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
          },
          // The receiver did not place the call, so it is the one that
          // yields if the two sides ever renegotiate at the same instant —
          // see the AudioPeer doc comment in lib/webrtc/peer.ts.
          { polite: !isCaller },
        );
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
        // Their words are worth showing even when their side could not
        // translate them: seeing the original beats seeing nothing, and it
        // can still be played aloud in their language from the transcript.
        if (!message?.originalText) return;

        upsertCaption({
          id: message.id,
          fromSelf: false,
          originalText: message.originalText,
          translatedText: message.translatedText ?? "",
          at: Date.now(),
        });

        if (message.translatedText) void speakIncoming(message.translatedText);
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
      setScreenSharing(false);
      setRemoteScreenStream(null);
      setCameraOn(false);
      setLocalCameraStream(null);
      setRemoteCameraStream(null);
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [call.id, shouldNegotiate, isCaller, selfId, upsertCaption, speakIncoming]);

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

  /**
   * Started once and left running, rather than torn down and rebuilt on
   * every value connectionState passes through.
   *
   * connectionState used to be this effect's dependency directly, which
   * meant ANY change away from "connected" — including a one-frame
   * "connecting" that resolves back to "connected" a moment later —
   * restarted the whole AssemblyAI session and the mic recorder from
   * scratch. Screen sharing is what actually surfaces this: starting or
   * stopping a share renegotiates the connection, and on some networks that
   * renegotiation is enough to trip a transient connectionState blip even
   * though the call itself never actually drops. The AssemblyAI layer
   * already has its own reconnect logic for a real network interruption —
   * see useTranscriptionSession's reconnect() — tearing the whole session
   * down here on a blip that resolves itself bypassed that resilience
   * instead of using it, and did so reacting to the wrong signal: this
   * call's own connectivity, not the transcription session's.
   *
   * startedRef, not state: this only ever needs to gate a side effect, and
   * the value itself is never rendered.
   */
  const transcriptionStartedRef = useRef(false);

  useEffect(() => {
    if (transcriptionStartedRef.current) return;
    if (connectionState !== "connected" || !localStream) return;
    transcriptionStartedRef.current = true;
    void startTranscription();
  }, [connectionState, localStream, startTranscription]);

  // Stopping is genuinely tied to the call ending, not to connectionState —
  // a separate effect whose only dependency is stopTranscription itself
  // (stable for the component's lifetime), so its cleanup runs on unmount
  // and nowhere else.
  useEffect(() => {
    return () => {
      if (!transcriptionStartedRef.current) return;
      transcriptionStartedRef.current = false;
      void stopTranscription();
    };
  }, [stopTranscription]);

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

  /**
   * Starts or stops sharing this device's screen.
   *
   * The busy flag guards against a double-tap sending two starts in a row —
   * peer.ts already serialises the renegotiations that would produce, but
   * this stops it at the source and gives the button somewhere to show a
   * pending state.
   */
  const toggleScreenShare = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || screenShareBusy) return;

    setScreenShareBusy(true);
    setError(null);

    try {
      if (peer.isSharingScreen()) {
        // onScreenShareEnded (wired above) is what flips screenSharing
        // back off — the same callback the browser's own "Stop sharing"
        // control reaches, so this button and that control converge on one
        // path instead of each keeping its own idea of the state.
        await peer.stopScreenShare();
      } else {
        await peer.startScreenShare();
        // startScreenShare() returns having done nothing, without
        // throwing, if the user closed the browser's own picker without
        // choosing a screen — isSharingScreen() is what actually happened,
        // not an assumption that asking succeeded.
        setScreenSharing(peer.isSharingScreen());
      }
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Could not share your screen.");
    } finally {
      setScreenShareBusy(false);
    }
  }, [screenShareBusy]);

  /**
   * Starts or stops this device's camera. Same busy-guard reasoning as
   * toggleScreenShare.
   */
  const toggleCamera = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || cameraBusy) return;

    setCameraBusy(true);
    setError(null);

    try {
      if (peer.isCameraOn()) {
        // onCameraEnded (wired above) clears cameraOn/localCameraStream —
        // the same callback a lost device reaches, so this button and that
        // case converge on one path instead of each keeping its own state.
        await peer.stopCamera();
      } else {
        const stream = await peer.startCamera();
        setCameraOn(true);
        setLocalCameraStream(stream);
      }
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Could not start your camera.");
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const toggleSpeaker = useCallback(() => {
    const element = remoteAudioRef.current;
    if (!element) return;
    const next = !speakerEnabled;
    speakerEnabledRef.current = next;
    // Turning the speaker back on mid-playback must not lift the ducking a
    // line still being spoken depends on; the queue restores it when done.
    element.muted = !next || (speechRef.current?.isSpeaking ?? false);
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
    /** Speak any caption line aloud on demand, in whichever language it is in. */
    playAudio,
    /** True while sharing my own screen through this call. */
    screenSharing,
    /** True while a share is starting or stopping — guards the button. */
    screenShareBusy,
    /** False on any platform WebKit — iOS Safari included — where the
     * browser has no screen-capture API to offer at all. */
    canShareScreen: isScreenShareSupported(),
    /** The other side's shared screen, or null when they are not sharing. */
    remoteScreenStream,
    toggleScreenShare,
    /** True while my own camera is on. */
    cameraOn,
    /** True while the camera is starting or stopping — guards the button. */
    cameraBusy,
    /** True everywhere getUserMedia is available — iOS Safari included,
     * unlike canShareScreen. */
    canUseCamera: isCameraSupported(),
    /** My own captured camera, for a local self-preview tile. */
    localCameraStream,
    /** The other side's camera, or null when theirs is off. */
    remoteCameraStream,
    toggleCamera,
  };
}
