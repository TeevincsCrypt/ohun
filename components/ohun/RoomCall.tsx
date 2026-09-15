"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoomSession } from "@/lib/rooms/useRoomSession";
import { Avatar } from "./UserResult";
import { AudioWaveform } from "./AudioWaveform";
import { RoomCaptions } from "./RoomCaptions";
import { AddParticipantDialog } from "./AddParticipantDialog";
import { CallSummaryPanel } from "./CallSummaryPanel";
import { Logo } from "./Logo";
import {
  LANGUAGE_FLAG,
  MAX_ROOM_PARTICIPANTS,
  activeParticipants,
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
  cameraStream,
  attachAudio,
}: {
  participant: RoomParticipant;
  isSelf: boolean;
  connected: boolean;
  /** Only ever set for yourself — your own mic, for the level meter. */
  stream: MediaStream | null;
  /** This participant's camera, if it's on — mine or theirs. */
  cameraStream: MediaStream | null;
  attachAudio: (peerId: string, element: HTMLAudioElement | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isSelf) return;
    attachAudio(participant.userId, audioRef.current);
    return () => attachAudio(participant.userId, null);
  }, [attachAudio, participant.userId, isSelf]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = cameraStream;
    if (cameraStream) {
      void element.play().catch(() => {
        // Autoplay can be blocked until a user gesture; the room's own
        // controls are already one.
      });
    }
  }, [cameraStream]);

  const color = isSelf ? "var(--accent)" : "var(--peer)";
  const waiting = participant.state === "invited";

  return (
    <div className="bg-weave relative aspect-video overflow-hidden rounded-2xl border border-[var(--border)]">
      {/* Never rendered for yourself: playing your own mic back would be
          an echo. */}
      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}

      {cameraStream ? (
        <video
          ref={videoRef}
          playsInline
          muted={isSelf}
          className={`h-full w-full object-cover ${isSelf ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className={waiting ? "opacity-50" : ""}>
            <Avatar name={participant.profile.displayName} src={participant.profile.avatarUrl} />
          </div>
        </div>
      )}

      {/* Language badge, top-left — the same corner every tile in the
          room uses it, so the room reads as a set. */}
      <span
        className="absolute left-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide backdrop-blur-sm"
        style={{ color }}
      >
        {participant.language.toUpperCase()}
      </span>

      {/* Connection dot, top-right. */}
      <span
        className="absolute right-2 top-2 h-2 w-2 rounded-full"
        style={{
          backgroundColor: waiting ? "var(--muted)" : connected || isSelf ? color : "var(--warn)",
        }}
        title={waiting ? "Invited…" : connected ? "Connected" : "Connecting…"}
      />

      {/* Name, bottom-left, over a scrim so it reads on any background. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-5">
        <p className="truncate text-xs font-medium text-white">
          {isSelf ? "You" : participant.profile.displayName}
        </p>
        {isSelf && stream ? (
          <AudioWaveform stream={stream} active color="var(--accent-strong)" bars={10} className="h-4 w-12 shrink-0" />
        ) : (
          !connected &&
          !waiting && (
            <span className="shrink-0 font-mono text-[10px] text-white/70">connecting</span>
          )
        )}
      </div>
    </div>
  );
}

export function RoomCall({ room: initialRoom, self }: { room: Room; self: Profile }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  // Set by the "video" group-call button on People, mirroring CallRoom's
  // startWithVideo — see the comment there.
  const startWithVideo = useSearchParams().get("video") === "1";

  const {
    room,
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
    liveTranscript,
    isTranslating,
    transcriptionError,
    canSpeakAloud,
    attachPeerAudio,
    toggleMicrophone,
    toggleSpeaker,
    leave,
    playAudio,
    cameraOn,
    cameraBusy,
    canUseCamera,
    localCameraStream,
    remoteCameraStreams,
    toggleCamera,
  } = useRoomSession({ room: initialRoom, selfId: self.id, startWithVideo });

  const seated = useMemo(() => activeParticipants(room), [room]);
  const seatedIds = useMemo(() => seated.map((participant) => participant.userId), [seated]);
  const full = seated.length >= MAX_ROOM_PARTICIPANTS;

  // Once the room closes, everyone gets the recap rather than being
  // bounced straight back to People.
  const [left, setLeft] = useState(false);
  const finished = room.status === "ended" || left;

  const leaveAndShowSummary = () => {
    setLeft(true);
    void leave();
  };

  if (finished) {
    return (
      <div className="theme-dark flex min-h-0 flex-1 flex-col justify-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
        <CallSummaryPanel
          callRef={{ roomId: room.id }}
          myLanguage={myLanguage}
          onDone={() => router.push("/people")}
        />
      </div>
    );
  }

  return (
    <div className="theme-dark relative flex min-h-0 flex-1 flex-col overflow-x-clip bg-[var(--background)] text-[var(--foreground)] lg:h-[100dvh] lg:flex-none lg:overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
<div
        aria-hidden
        className="glow-field left-1/2 top-[14%] h-[380px] w-[560px] -translate-x-1/2 opacity-50"
        style={{ background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)" }}
      />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs font-semibold tabular-nums">
            {formatDuration(durationSeconds)}
          </span>
          <button
            type="button"
            onClick={leaveAndShowSummary}
            className="flex items-center gap-2 rounded-full border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:brightness-110"
          >
            <span className="hidden sm:inline">Leave</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full min-h-0 max-w-[1180px] flex-1 gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
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
                cameraStream={
                  participant.userId === self.id
                    ? localCameraStream
                    : (remoteCameraStreams.get(participant.userId) ?? null)
                }
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
                <p className="rounded-xl border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-2.5 text-center text-sm text-[var(--warn)]">
                  {transcriptionError}
                </p>
              )}
              {!hasTurn && (
                <p className="rounded-xl border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-2.5 text-center text-sm text-[var(--warn)]">
                  No TURN relay configured — a group call is more likely to fail without one.
                </p>
              )}
              {!canSpeakAloud && (
                <p className="rounded-xl border border-[var(--warn-border)] bg-[var(--warn-soft)] px-4 py-2.5 text-center text-sm text-[var(--warn)]">
                  This browser can&apos;t speak translations aloud — they still appear as captions.
                </p>
              )}
            </div>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-center gap-2.5 pt-8">
            <button
              type="button"
              onClick={toggleMicrophone}
              aria-label={micEnabled ? "Mute" : "Unmute"}
              className={`flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors sm:px-4 ${
                micEnabled
                  ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                  : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                <path d="M12 18v4" strokeLinecap="round" />
                {!micEnabled && <path d="M3 3l18 18" strokeLinecap="round" />}
              </svg>
              <span className="hidden sm:inline">{micEnabled ? "Mute" : "Unmute"}</span>
            </button>

            <button
              type="button"
              onClick={toggleSpeaker}
              aria-label={speakerEnabled ? "Mute audio" : "Unmute audio"}
              className={`flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors sm:px-4 ${
                speakerEnabled
                  ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                  : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
                {speakerEnabled ? (
                  <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
                ) : (
                  <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
                )}
              </svg>
              <span className="hidden sm:inline">Speaker</span>
            </button>

            {/* Hidden entirely, not disabled, where getUserMedia doesn't
                exist at all — matching the 1:1 call room's reasoning for
                canShareScreen: there is no state that would ever make this
                start working there. Unlike screen share, this is true
                almost nowhere in practice, iOS Safari included. */}
            {canUseCamera && (
              <button
                type="button"
                onClick={() => void toggleCamera()}
                disabled={cameraBusy}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                className={`flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-50 sm:px-4 ${
                  !cameraOn
                    ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
                    : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                {cameraBusy ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10l5-3v10l-5-3" />
                    <rect x="2" y="6" width="13" height="12" rx="2" />
                    {cameraOn && <path d="M2 3l20 18" />}
                  </svg>
                )}
                <span className="hidden sm:inline">{cameraOn ? "Stop video" : "Video"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={leaveAndShowSummary}
              aria-label="Leave call"
              className="flex h-11 items-center gap-2 rounded-full bg-[var(--danger)] px-3.5 text-sm font-semibold text-white shadow-[0_8px_28px_-6px_var(--danger-border)] transition-transform duration-150 hover:brightness-110 active:scale-95 sm:px-5"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
              </svg>
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </section>

        <aside className="card-lit animate-rise flex max-h-[60vh] min-h-0 min-w-0 flex-col rounded-3xl p-4 sm:p-5 lg:max-h-none">
          <RoomCaptions
            captions={captions}
            liveTranscript={liveTranscript}
            isTranslating={isTranslating}
            room={room}
            selfId={self.id}
            myLanguage={myLanguage}
            onPlay={playAudio}
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
