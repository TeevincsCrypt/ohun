"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoomSession } from "@/lib/rooms/useRoomSession";
import { Avatar } from "./UserResult";
import { AudioWaveform } from "./AudioWaveform";
import { RoomCaptions } from "./RoomCaptions";
import { AddParticipantDialog } from "./AddParticipantDialog";
import { Logo } from "./Logo";
import {
  LANGUAGE_FLAG,
  MAX_ROOM_PARTICIPANTS,
  activeParticipants,
  getCallLanguage,
  type Profile,
  type Room,
  type RoomParticipant,
} from "@/types";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * One person in the grid, with the <audio> element carrying their voice.
 *
 * The element is per-participant rather than one shared sink because each
 * mesh connection produces its own MediaStream.
 */
function ParticipantTile({
  participant,
  isSelf,
  connected,
  stream,
  attachAudio,
}: {
  participant: RoomParticipant;
  isSelf: boolean;
  connected: boolean;
  /** Only ever set for yourself — your own mic, for the level meter. */
  stream: MediaStream | null;
  attachAudio: (peerId: string, element: HTMLAudioElement | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isSelf) return;
    attachAudio(participant.userId, audioRef.current);
    return () => attachAudio(participant.userId, null);
  }, [attachAudio, participant.userId, isSelf]);

  const color = isSelf ? "var(--accent)" : "var(--peer)";
  const waiting = participant.state === "invited";

  return (
    <div className="card-lit flex flex-col items-center gap-3 rounded-2xl p-4">
      {/* Never rendered for yourself: playing your own mic back would be
          an echo. */}
      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}

      <div className="relative flex items-center justify-center">
        <span
          aria-hidden
          className="absolute h-[76px] w-[76px] rounded-full border-2 transition-colors duration-300"
          style={{ borderColor: connected || isSelf ? color : "var(--border)" }}
        />
        <div className={waiting ? "opacity-50" : ""}>
          <Avatar name={participant.profile.displayName} src={participant.profile.avatarUrl} />
        </div>
      </div>

      <div className="min-w-0 text-center">
        <p className="truncate text-sm font-semibold tracking-tight">
          {isSelf ? "You" : participant.profile.displayName}
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
          {LANGUAGE_FLAG[participant.language]} {getCallLanguage(participant.language)?.label}
        </p>
      </div>

      {isSelf && stream ? (
        <AudioWaveform stream={stream} active color={color} bars={14} className="w-full" />
      ) : (
        <p className="text-[11px] font-medium" style={{ color: waiting ? "var(--muted)" : color }}>
          {waiting ? "Invited…" : connected ? "Connected" : "Connecting…"}
        </p>
      )}
    </div>
  );
}

export function RoomCall({ room: initialRoom, self }: { room: Room; self: Profile }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);

  const {
    room,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    captions,
    connectedPeers,
    localStream,
    myLanguage,
    liveTranscript,
    isTranslating,
    transcriptionError,
    canSpeakAloud,
    attachPeerAudio,
    toggleMicrophone,
    toggleSpeaker,
    leave,
  } = useRoomSession({ room: initialRoom, selfId: self.id });

  const seated = useMemo(() => activeParticipants(room), [room]);
  const seatedIds = useMemo(() => seated.map((participant) => participant.userId), [seated]);
  const full = seated.length >= MAX_ROOM_PARTICIPANTS;

  // Once the host ends the call, everyone is returned to People.
  useEffect(() => {
    if (room.status === "ended") {
      const timer = setTimeout(() => router.push("/people"), 1500);
      return () => clearTimeout(timer);
    }
  }, [room.status, router]);

  const languagesInRoom = useMemo(
    () => [...new Set(seated.map((participant) => participant.language))],
    [seated],
  );

  return (
    <div className="theme-dark relative flex flex-1 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div
        aria-hidden
        className="glow-field left-1/2 top-[14%] h-[380px] w-[560px] -translate-x-1/2 opacity-50"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
      />

      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs font-semibold tabular-nums">
            {formatDuration(durationSeconds)}
          </span>
          <button
            type="button"
            onClick={() => void leave().then(() => router.push("/people"))}
            className="flex items-center gap-2 rounded-full border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:brightness-110"
          >
            <span className="hidden sm:inline">Leave</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1180px] flex-1 gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card-lit animate-rise flex min-h-0 min-w-0 flex-col rounded-3xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Group call · {seated.length} of {MAX_ROOM_PARTICIPANTS}
              </h1>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {languagesInRoom.map((code) => LANGUAGE_FLAG[code]).join(" ")}{" "}
                {languagesInRoom.length === 1
                  ? "everyone shares a language"
                  : `${languagesInRoom.length} languages, translated live`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAdd(true)}
              disabled={full}
              className="flex items-center gap-2 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {full ? "Call full" : "Add someone"}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {seated.map((participant) => (
              <ParticipantTile
                key={participant.userId}
                participant={participant}
                isSelf={participant.userId === self.id}
                connected={connectedPeers.includes(participant.userId)}
                stream={participant.userId === self.id ? localStream : null}
                attachAudio={attachPeerAudio}
              />
            ))}
          </div>

          {(error || transcriptionError || !hasTurn || !canSpeakAloud) && (
            <div className="mt-5 flex flex-col gap-2">
              {error && (
                <p className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2.5 text-center text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}
              {transcriptionError && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-400">
                  {transcriptionError}
                </p>
              )}
              {!hasTurn && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-400">
                  No TURN relay configured — a group call is more likely to fail without one.
                </p>
              )}
              {!canSpeakAloud && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-sm text-amber-400">
                  This browser can&apos;t speak translations aloud — they still appear as captions.
                </p>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center justify-center gap-6 pt-8">
            <button
              type="button"
              onClick={toggleMicrophone}
              aria-label={micEnabled ? "Mute" : "Unmute"}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${
                  micEnabled
                    ? "border-[var(--border)] bg-[var(--surface)] group-hover:bg-[var(--surface-raised)]"
                    : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                  <path d="M12 18v4" strokeLinecap="round" />
                  {!micEnabled && <path d="M3 3l18 18" strokeLinecap="round" />}
                </svg>
              </span>
              <span className="text-[11px] font-medium text-[var(--muted)]">
                {micEnabled ? "Mute" : "Unmute"}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleSpeaker}
              aria-label={speakerEnabled ? "Mute audio" : "Unmute audio"}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${
                  speakerEnabled
                    ? "border-[var(--border)] bg-[var(--surface)] group-hover:bg-[var(--surface-raised)]"
                    : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
                  {speakerEnabled ? (
                    <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
                  ) : (
                    <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
                  )}
                </svg>
              </span>
              <span className="text-[11px] font-medium text-[var(--muted)]">Speaker</span>
            </button>

            <button
              type="button"
              onClick={() => void leave().then(() => router.push("/people"))}
              aria-label="Leave call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger)] text-[#1a0505] shadow-[0_8px_28px_-6px_var(--danger-border)] transition-transform duration-150 hover:brightness-110 active:scale-95"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
              </svg>
            </button>
          </div>
        </section>

        <aside className="card-lit animate-rise flex min-h-0 min-w-0 flex-col rounded-3xl p-4 sm:p-5">
          <RoomCaptions
            captions={captions}
            liveTranscript={liveTranscript}
            isTranslating={isTranslating}
            room={room}
            selfId={self.id}
            myLanguage={myLanguage}
          />
        </aside>
      </main>

      {showAdd && (
        <AddParticipantDialog
          roomId={room.id}
          seated={seatedIds}
          onClose={() => setShowAdd(false)}
          onInvited={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
