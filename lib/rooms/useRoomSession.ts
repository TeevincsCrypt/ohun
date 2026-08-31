"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createAudioMesh, type AudioMesh, type MeshSignal } from "@/lib/webrtc/mesh";
import { useTranscriptionSession } from "@/lib/assemblyai/useTranscriptionSession";
import { SpeechQueue } from "@/lib/audio/queue";
import { setParticipantState } from "./actions";
import { recordUtterance } from "@/lib/summary/actions";
import {
  activeParticipants,
  isCallLanguage,
  targetLanguagesFor,
  type CallLanguageCode,
  type Room,
  type RoomCaption,
} from "@/types";

/** Keeps the caption list bounded during a long call. */
const MAX_CAPTIONS = 60;

/** What one speaker broadcasts after their utterance has been translated. */
interface CaptionMessage {
  id: string;
  speakerId: string;
  originalText: string;
  byLanguage: Partial<Record<CallLanguageCode, string>>;
}

interface UseRoomSessionOptions {
  room: Room;
  selfId: string;
}

/**
 * Runs one group call.
 *
 * Same shape as useCallSession, scaled to N participants: Supabase
 * Realtime carries signalling and captions, a WebRTC mesh carries audio,
 * and each browser transcribes only its own microphone. Only text crosses
 * the network — never synthesized audio.
 */
export function useRoomSession({ room: initialRoom, selfId }: UseRoomSessionOptions) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [micEnabled, setMicEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasTurn, setHasTurn] = useState(true);
  const [captions, setCaptions] = useState<RoomCaption[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [durationSeconds, setDurationSeconds] = useState(0);

  const meshRef = useRef<AudioMesh | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const speechRef = useRef<SpeechQueue | null>(null);
  /**
   * Set once the transcription hook exists. The speech queue is created in
   * an effect and needs to reach back into it, which this indirection
   * allows without ordering the two.
   */
  const suppressInputRef = useRef<((suppressed: boolean, reason: string) => void) | null>(null);
  const leftRef = useRef(false);

  /** One <audio> element per peer, attached by the room UI. */
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());

  const languagesInRoom = useMemo(
    () => [...new Set(activeParticipants(room).map((participant) => participant.language))],
    [room],
  );

  const myLanguage = useMemo(
    () => room.participants.find((participant) => participant.userId === selfId)?.language ?? "en",
    [room.participants, selfId],
  );

  // Read inside async callbacks, where the state value would be stale.
  // Synced in an effect rather than during render: the roster is only ever
  // read from a callback that runs after paint, so a frame of lag is
  // harmless, and writing a ref during render is not.
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const speakerEnabledRef = useRef(true);

  /** Registers the <audio> element the UI renders for a given peer. */
  const attachPeerAudio = useCallback((peerId: string, element: HTMLAudioElement | null) => {
    if (!element) {
      audioElementsRef.current.delete(peerId);
      return;
    }
    audioElementsRef.current.set(peerId, element);
    element.muted = !speakerEnabledRef.current;

    const stream = remoteStreamsRef.current.get(peerId);
    if (stream && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => {
        // Autoplay can be blocked until a user gesture; the controls provide one.
      });
    }
  }, []);

  const appendCaption = useCallback((caption: RoomCaption) => {
    setCaptions((current) => [...current, caption].slice(-MAX_CAPTIONS));
  }, []);

  /**
   * Speaks text aloud in a given language, queued through the same
   * SpeechQueue as live incoming translations — which is what gives it
   * ducking and input-suppression, exactly as automatic playback gets. A
   * caption line played on demand is not exempt from that: it comes out of
   * the same speakers, and bypassing the queue is exactly what let the room
   * transcribe and re-translate its own output before this queue existed.
   *
   * Queued rather than interrupting whatever is already playing, which
   * matches the queue's own reasoning: several people finishing at once,
   * or a click landing mid-utterance, should not cut a line off — it should
   * simply play after.
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

  /**
   * My own speech: transcribed here, then translated into every other
   * language present and broadcast for the others to speak and caption.
   */
  const transcription = useTranscriptionSession({
    // The mesh's capture, shared rather than opened a second time, so that
    // muting — which disables these tracks — stops transcription too.
    stream: localStream,
    language: myLanguage,
    languages: languagesInRoom,
    // Unused in the group path — onTranslation below does the fan-out — but
    // the hook requires a target, so name the first one for its logging.
    targetLanguage: myLanguage,
    speakLocally: false,
    translateManually: true,
    onUtterance: async (text, spokenLanguage) => {
      // Targets are computed against what was actually spoken, so someone
      // answering in another participant's language is not translated back
      // into it pointlessly.
      const spoken = isCallLanguage(spokenLanguage) ? spokenLanguage : myLanguage;
      const targets = targetLanguagesFor(roomRef.current, selfId).filter(
        (code) => code !== spoken,
      );

      // Everyone in the room already speaks my language: nothing to do.
      if (targets.length === 0) return;

      const response = await fetch("/api/translate-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, from: spoken, to: targets }),
      });

      if (!response.ok) {
        setError("Could not translate that utterance.");
        return;
      }

      const { byLanguage } = (await response.json()) as {
        byLanguage: Partial<Record<CallLanguageCode, string>>;
      };

      void recordUtterance(
        { roomId: initialRoom.id },
        { originalText: text, spokenLanguage: spoken, translations: byLanguage },
      );

      const message: CaptionMessage = {
        id: `${selfId}-${Date.now()}`,
        speakerId: selfId,
        originalText: text,
        byLanguage,
      };

      appendCaption({ ...message, at: Date.now() });

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

  const leave = useCallback(async () => {
    leftRef.current = true;
    meshRef.current?.close();
    meshRef.current = null;
    speechRef.current?.stop();
    if (channelRef.current) {
      void channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    await setParticipantState(initialRoom.id, "left");
  }, [initialRoom.id]);

  // --- media + signalling ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const queue = new SpeechQueue({
      onSpeakingChange: (speaking) => {
        // Duck every peer so the synthesized voice stays intelligible over
        // live speech, and stop feeding transcription so the microphone
        // does not hear this playback and transcribe it back — which is
        // what makes a room start talking to itself.
        suppressInputRef.current?.(speaking, "playback");
        audioElementsRef.current.forEach((element) => {
          element.muted = speaking || !speakerEnabledRef.current;
        });
      },
    });
    speechRef.current = queue;

    const channel = supabase.channel(`room:${initialRoom.id}`, {
      config: { presence: { key: selfId } },
    });
    channelRef.current = channel;

    async function begin() {
      let mesh: AudioMesh;
      try {
        mesh = await createAudioMesh(selfId, {
          onSignal: (message) => {
            void channel.send({ type: "broadcast", event: "signal", payload: message });
          },
          onRemoteStream: (peerId, stream) => {
            remoteStreamsRef.current.set(peerId, stream);
            const element = audioElementsRef.current.get(peerId);
            if (element) {
              element.srcObject = stream;
              void element.play().catch(() => {});
            }
          },
          onPeerStateChange: (peerId, state) => {
            if (cancelled) return;
            setConnectedPeers((current) => {
              const connected = state === "connected";
              const has = current.includes(peerId);
              if (connected && !has) return [...current, peerId];
              if (!connected && has) return current.filter((id) => id !== peerId);
              return current;
            });
          },
          onError: (meshError) => {
            if (!cancelled) setError(meshError.message);
          },
        });
      } catch (meshError) {
        if (!cancelled) {
          setError(meshError instanceof Error ? meshError.message : "Could not start audio.");
        }
        return;
      }

      if (cancelled) {
        mesh.close();
        return;
      }

      meshRef.current = mesh;
      setMicEnabled(mesh.isMicrophoneEnabled());
      setHasTurn(mesh.hasTurn);
      setLocalStream(mesh.localStream);

      channel.on("broadcast", { event: "signal" }, ({ payload }) => {
        void mesh.acceptSignal(payload as MeshSignal);
      });

      // Someone else's speech, already translated into every language the
      // room needs. Pick mine; ignore it if there is nothing for me.
      channel.on("broadcast", { event: "caption" }, ({ payload }) => {
        const message = payload as CaptionMessage;
        if (!message?.speakerId || message.speakerId === selfId) return;

        appendCaption({ ...message, at: Date.now() });

        const mine = message.byLanguage[myLanguage];
        if (mine) speakIncoming(mine);
      });

      // Presence is what drives the mesh: connect to everyone present,
      // drop anyone who disappears.
      channel.on("presence", { event: "sync" }, () => {
        const present = Object.keys(channel.presenceState()).filter((id) => id !== selfId);
        for (const peerId of present) void mesh.connectTo(peerId);
        for (const peerId of mesh.peerIds()) {
          if (!present.includes(peerId)) mesh.disconnectFrom(peerId);
        }
      });

      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ joinedAt: Date.now() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          if (!cancelled) setError("Lost the connection to the call.");
        }
      });
    }

    void begin();

    return () => {
      cancelled = true;
      meshRef.current?.close();
      meshRef.current = null;
      queue.stop();
      speechRef.current = null;
      void channel.unsubscribe();
      channelRef.current = null;
    };
  }, [initialRoom.id, selfId, appendCaption, speakIncoming, myLanguage]);

  // --- watch the roster so joins and departures land live ------------------
  useEffect(() => {
    const supabase = createClient();
    const watcher = supabase
      .channel(`room-rows:${initialRoom.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${initialRoom.id}` },
        () => {
          void fetch(`/api/rooms/${initialRoom.id}`)
            .then((response) => (response.ok ? response.json() : null))
            .then((next: Room | null) => {
              if (next) setRoom(next);
            })
            .catch(() => {
              // A failed refresh just means the roster is briefly stale.
            });
        },
      )
      .subscribe();

    return () => {
      void watcher.unsubscribe();
    };
  }, [initialRoom.id]);

  // --- transcription runs for the life of the call -------------------------
  const startTranscription = transcription.start;
  const stopTranscription = transcription.stop;

  // Waits for the mesh's capture: starting earlier would make the recorder
  // fall back to opening its own microphone, which is the split that let a
  // muted participant keep being transcribed.
  useEffect(() => {
    if (!localStream) return;
    void startTranscription();
    return () => {
      void stopTranscription();
    };
  }, [localStream, startTranscription, stopTranscription]);

  // --- duration ------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      setDurationSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // --- leaving the page drops you from the call ----------------------------
  useEffect(() => {
    const handleUnload = () => {
      void setParticipantState(initialRoom.id, "left");
    };
    window.addEventListener("pagehide", handleUnload);
    return () => window.removeEventListener("pagehide", handleUnload);
  }, [initialRoom.id]);

  const toggleMicrophone = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const next = !mesh.isMicrophoneEnabled();
    mesh.setMicrophoneEnabled(next);
    // Transcription holds its own microphone capture, so disabling the
    // outgoing track only silences peers. Without this a muted participant
    // is still transcribed, translated and captioned to the whole room.
    suppressInputRef.current?.(!next, "muted");
    setMicEnabled(next);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabled;
    speakerEnabledRef.current = next;
    audioElementsRef.current.forEach((element) => {
      element.muted = !next;
    });
    setSpeakerEnabled(next);
  }, [speakerEnabled]);

  const others = useMemo(
    () => activeParticipants(room).filter((participant) => participant.userId !== selfId),
    [room, selfId],
  );

  return {
    room,
    others,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    captions,
    connectedPeers,
    languagesInRoom,
    localStream,
    myLanguage,
    liveTranscript: transcription.transcript,
    isTranslating: transcription.isTranslating,
    transcriptionError: transcription.error ?? transcription.translationError,
    canSpeakAloud: transcription.canSpeakAloud,
    attachPeerAudio,
    toggleMicrophone,
    toggleSpeaker,
    leave,
    /** Speak any caption line aloud on demand, in whichever language it is in. */
    playAudio,
  };
}
