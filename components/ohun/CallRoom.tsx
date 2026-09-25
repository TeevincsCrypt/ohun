"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallSession } from "@/lib/calls/useCallSession";
import { Avatar } from "./UserResult";
import { AudioWaveform } from "./AudioWaveform";
import { LiveCaptions } from "./LiveCaptions";
import { CallSummaryPanel } from "./CallSummaryPanel";
import { Logo } from "./Logo";
import {
  LANGUAGE_FLAG,
  getCallLanguage,
  type Call,
  type CallCaption,
  type CallConnectionState,
  type Profile,
} from "@/types";

const STATUS_COPY: Record<CallConnectionState, string> = {
  idle: "Idle",
  calling: "Calling…",
  ringing: "Ringing…",
  connecting: "Connecting…",
  connected: "Connected",
  declined: "Call declined",
  ended: "Call ended",
  failed: "Connection failed",
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Short enough to survive a narrow header without being dropped. */
const STATUS_SHORT: Record<CallConnectionState, string> = {
  idle: "Idle",
  calling: "Calling",
  ringing: "Ringing",
  connecting: "Connecting",
  connected: "Connected",
  declined: "Declined",
  ended: "Ended",
  failed: "Failed",
};

/**
 * Connection quality, derived from state we actually have rather than
 * invented. Without a TURN relay a call really is more fragile, which is
 * worth surfacing as "limited" rather than claiming everything is fine.
 *
 * The label is never hidden. Bars alone say nothing — three grey ticks look
 * identical whether a call is connecting, has dropped, or is fine without a
 * relay — so a phone gets the short wording rather than no wording.
 */
function ConnectionQuality({
  state,
  hasTurn,
}: {
  state: CallConnectionState;
  hasTurn: boolean;
}) {
  const good = state === "connected" && hasTurn;
  const limited = state === "connected" && !hasTurn;

  const full = good ? "Good connection" : limited ? "Limited relay" : STATUS_COPY[state];
  const short = good ? "Good" : limited ? "Limited" : STATUS_SHORT[state];

  const color = good
    ? "var(--accent)"
    : limited
      ? "#fbbf24"
      : state === "failed"
        ? "var(--danger)"
        : "var(--muted)";

  // Three bars: all lit when relayed and connected, two when connected
  // without a relay, one otherwise.
  const lit = good ? 3 : limited ? 2 : 1;
  const settling = state === "calling" || state === "ringing" || state === "connecting";

  return (
    <div
      role="status"
      aria-label={full}
      title={full}
      className="flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5 sm:py-2"
      style={{
        borderColor: good || limited || state === "failed" ? color : "var(--border)",
        backgroundColor:
          good || limited || state === "failed"
            ? `color-mix(in srgb, ${color} 12%, transparent)`
            : "var(--surface)",
      }}
    >
      <span
        className={`text-[11px] font-medium sm:text-xs ${settling ? "animate-pulse" : ""}`}
        style={{ color }}
      >
        {/* Short wording on a phone, full wording once there is room. */}
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{full}</span>
      </span>

      <span className="flex items-end gap-[2px]" aria-hidden>
        {[5, 8, 11].map((height, index) => (
          <span
            key={height}
            className="w-[3px] rounded-full transition-colors"
            style={{ height, backgroundColor: index < lit ? color : "var(--border)" }}
          />
        ))}
      </span>
    </div>
  );
}

function SpeakerPill({
  label,
  color,
  active,
  align = "left",
  className = "",
}: {
  label: string;
  color: string;
  active: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity ${
        align === "right" ? "flex-row-reverse" : ""
      } ${active ? "opacity-100" : "opacity-45"} ${className}`}
      style={{
        borderColor: active ? color : "var(--border)",
        backgroundColor: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        color: active ? color : "var(--muted)",
      }}
    >
      <span className="flex gap-1" aria-hidden>
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
          style={{ backgroundColor: active ? color : "var(--muted)" }}
        />
        <span
          className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
          style={{ backgroundColor: active ? color : "var(--muted)", animationDelay: "150ms" }}
        />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

/** Avatar with a coloured halo that lights up while that side is talking. */
function SpeakerAvatar({
  profile,
  color,
  glow,
  speaking,
}: {
  profile: Profile;
  color: string;
  glow: string;
  speaking: boolean;
}) {
  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <span
        aria-hidden
        className={`absolute h-[112px] w-[112px] rounded-full transition-opacity duration-500 sm:h-[132px] sm:w-[132px] ${
          speaking ? "animate-breathe opacity-100" : "opacity-0"
        }`}
        style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 68%)` }}
      />
      <span
        aria-hidden
        className="absolute h-[92px] w-[92px] rounded-full border-2 transition-colors duration-300 sm:h-[108px] sm:w-[108px]"
        style={{ borderColor: speaking ? color : "var(--border)" }}
      />
      <div className="relative">
        <Avatar name={profile.displayName} src={profile.avatarUrl} size="lg" />
      </div>
    </div>
  );
}

function ControlButton({
  label,
  showLabel = true,
  active = true,
  disabled = false,
  tone = "neutral",
  onClick,
  children,
}: {
  label: string;
  showLabel?: boolean;
  active?: boolean;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (tone === "danger") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-11 items-center gap-2 rounded-full bg-[var(--danger)] px-3.5 text-sm font-semibold text-white shadow-[0_8px_28px_-6px_var(--danger-border)] transition-transform duration-150 hover:brightness-110 active:scale-95 disabled:opacity-50 sm:px-5"
      >
        {children}
        {showLabel && <span className="hidden sm:inline">{label}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors disabled:opacity-50 sm:px-4 ${
        active
          ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-raised)]"
          : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
      }`}
    >
      {children}
      {showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

export function CallRoom({
  call,
  self,
  other,
}: {
  call: Call;
  self: Profile;
  other: Profile;
}) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set by the "Video call" button (as opposed to "Call"), so the camera
  // comes on by itself once connected instead of requiring the in-call
  // toggle. Read once — the query string cannot meaningfully change under
  // this page — via useSearchParams rather than threading it through the
  // server page component, since only this client component needs it.
  const startWithVideo = useSearchParams().get("video") === "1";

  const {
    connectionState,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    captions,
    localStream,
    remoteStream,
    liveTranscript,
    isTranslating,
    transcriptionError,
    canSpeakAloud,
    attachRemoteAudio,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
    playAudio,
    screenSharing,
    screenShareBusy,
    canShareScreen,
    remoteScreenStream,
    toggleScreenShare,
    cameraOn,
    cameraBusy,
    canUseCamera,
    localCameraStream,
    remoteCameraStream,
    toggleCamera,
  } = useCallSession({ call, selfId: self.id, startWithVideo });

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = screenVideoRef.current;
    if (!element) return;
    element.srcObject = remoteScreenStream;
    if (remoteScreenStream) {
      void element.play().catch(() => {
        // Same autoplay caveat as the remote <audio> element — the room's
        // own controls are already a user gesture away if this is blocked.
      });
    }
  }, [remoteScreenStream]);

  const remoteCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = remoteCameraVideoRef.current;
    if (!element) return;
    element.srcObject = remoteCameraStream;
    if (remoteCameraStream) {
      void element.play().catch(() => {
        // Same autoplay caveat as above.
      });
    }
  }, [remoteCameraStream]);

  const localCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = localCameraVideoRef.current;
    if (!element) return;
    element.srcObject = localCameraStream;
    if (localCameraStream) {
      void element.play().catch(() => {
        // Same autoplay caveat as above.
      });
    }
  }, [localCameraStream]);

  useEffect(() => {
    attachRemoteAudio(audioRef.current);
  }, [attachRemoteAudio]);

  // A guest who joined by room link has no contacts, so People would be an
  // empty room — send them to the landing page, which is also where signing
  // up is offered.
  const exitTo = self.isGuest ? "/" : "/people";

  // A declined call has nothing to summarise, so it still leaves on its own.
  // An ended one stops and offers the recap instead of navigating away.
  useEffect(() => {
    if (connectionState === "declined") {
      const timer = setTimeout(() => router.push(exitTo), 1800);
      return () => clearTimeout(timer);
    }
  }, [connectionState, router, exitTo]);

  if (connectionState === "ended") {
    return (
      <div className="theme-dark flex min-h-0 flex-1 flex-col justify-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
        <CallSummaryPanel
          callRef={{ callId: call.id }}
          myLanguage={self.preferredLanguage}
          onDone={() => router.push(exitTo)}
          doneLabel={self.isGuest ? "Done" : "Back to People"}
        />
      </div>
    );
  }

  const connected = connectionState === "connected";
  const selfLanguage = getCallLanguage(self.preferredLanguage);
  const otherLanguage = getCallLanguage(other.preferredLanguage);

  // The most recent utterance from either side, shown as the caption
  // overlaid on the stage.
  const latest = captions[captions.length - 1];

  return (
    <div className="theme-dark relative flex min-h-0 flex-1 flex-col overflow-x-clip bg-[var(--background)] text-[var(--foreground)] lg:h-[100dvh] lg:flex-none lg:overflow-hidden">
      {/* Ambient light, keyed to whichever side last spoke. Given its own
          clipping container now that the page wrapper only clips
          horizontally, so it cannot add scroll height of its own. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        aria-hidden
        className="glow-field left-1/2 top-[18%] h-[420px] w-[620px] -translate-x-1/2 opacity-60 transition-opacity duration-1000"
        style={{
          background: connected
            ? `radial-gradient(circle, ${
                latest?.fromSelf ? "var(--accent-glow)" : "var(--peer-glow)"
              } 0%, transparent 70%)`
            : "transparent",
        }}
      />
      </div>

      {/* Remote audio. Muting this element is the speaker control — it never
          touches the microphone, which must keep capturing. */}
      <audio ref={audioRef} autoPlay playsInline />

      <header className="relative z-10 flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4">
        <Logo />
        <div className="flex items-center gap-3">
          <ConnectionQuality state={connectionState} hasTurn={hasTurn} />
          <button
            type="button"
            onClick={() => void endCall()}
            className="flex items-center gap-2 rounded-full border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-sm font-medium text-[var(--danger)] transition-colors hover:brightness-110"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path
                d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden sm:inline">End call</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full min-h-0 max-w-[1180px] flex-1 gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
        {/* --- stage ------------------------------------------------------ */}
        {/* overflow-y-auto: on desktop this column sits in a viewport-height
            layout with everything else in the call — status row, avatars,
            names, utterance cards, controls — stacked above and below the
            video panels below. Without a scroll affordance here, a flex
            column's default flex-shrink squeezes EVERY child to fit that
            fixed height, the video panel included — and since its own
            content (the <video>) has no minimum size of its own, it was the
            one that gave, getting crushed down to just its caption bar with
            the video clipped to a sliver. Verified directly: a faithful
            static reproduction of this exact layout at a real 1280x720
            viewport rendered the panel at 48px tall (just the caption row)
            with the actual video cropped out entirely; adding shrink-0 to
            the panels below plus overflow-y-auto here (so anything that
            still doesn't fit scrolls instead of being crushed) fixed it. */}
        <section className="card-lit animate-rise flex min-h-0 min-w-0 flex-col overflow-y-auto rounded-3xl p-4 sm:p-6">
          {/* On a phone the timer takes its own line above the two speaker
              pills — all three side by side collide at 390px. sm:contents
              dissolves the pill wrapper at wider sizes so the three sit in
              one row again, ordered around the timer. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div className="flex flex-col items-center sm:order-2">
              <span className="font-mono text-lg font-semibold tabular-nums tracking-tight">
                {connected ? formatDuration(durationSeconds) : "--:--"}
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
                </svg>
                Audio is end-to-end encrypted
              </span>
              {/* The browser draws its own "you are sharing — Stop" bar
                  outside this page entirely, which is real feedback but easy
                  to miss on a phone-sized window — this is the same fact,
                  restated where the rest of the call's status already is. */}
              {screenSharing && (
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  Sharing your screen
                </span>
              )}
              {cameraOn && (
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--accent)]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  Camera on
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 sm:contents">
              <SpeakerPill
                label="You"
                color="var(--accent)"
                active={connected && micEnabled}
                className="min-w-0 sm:order-1"
              />
              <SpeakerPill
                label={other.displayName.split(" ")[0]}
                color="var(--peer)"
                active={connected && speakerEnabled}
                align="right"
                className="min-w-0 sm:order-3"
              />
            </div>
          </div>

          {/* The stage — one active-speaker frame, badges and the live
              caption overlaid on it rather than in separate rows beneath.
              Screen share and camera each get their own frame when active
              (never both at once in practice); with neither, the frame
              shows the weave with both avatars resting on it. */}
          {remoteScreenStream ? (
            <div className="animate-rise bg-weave relative mt-6 aspect-video shrink-0 overflow-hidden rounded-2xl border border-[var(--border)]">
              <video
                ref={screenVideoRef}
                muted
                playsInline
                className="h-full w-full object-contain"
              />
              <StageIdentity
                name={`${other.displayName.split(" ")[0]} is presenting`}
                direction={`${selfLanguage?.code.toUpperCase()} → ${otherLanguage?.code.toUpperCase()}`}
              />
              <LiveBadge isTranslating={isTranslating} />
              <StageCaption caption={latest} self={self} other={other} />
            </div>
          ) : remoteCameraStream || localCameraStream ? (
            <div className="animate-rise bg-weave relative mt-6 aspect-video shrink-0 overflow-hidden rounded-2xl border border-[var(--border)]">
              {remoteCameraStream ? (
                <video
                  ref={remoteCameraVideoRef}
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  ref={localCameraVideoRef}
                  playsInline
                  muted
                  className="h-full w-full scale-x-[-1] object-cover"
                />
              )}
              {remoteCameraStream && localCameraStream && (
                <video
                  ref={localCameraVideoRef}
                  playsInline
                  muted
                  className="absolute bottom-3 right-3 h-24 w-36 scale-x-[-1] rounded-lg border border-[var(--border)] object-cover sm:h-28 sm:w-44"
                />
              )}
              <StageIdentity
                name={remoteCameraStream ? other.displayName : self.displayName}
                direction={`${selfLanguage?.code.toUpperCase()} → ${otherLanguage?.code.toUpperCase()}`}
              />
              <LiveBadge isTranslating={isTranslating} />
              <StageCaption caption={latest} self={self} other={other} />
            </div>
          ) : (
            <div className="animate-rise bg-weave relative mt-6 flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="flex items-center gap-8 sm:gap-12">
                <div className="flex flex-col items-center gap-3">
                  <SpeakerAvatar
                    profile={self}
                    color="var(--accent)"
                    glow="var(--accent-glow)"
                    speaking={connected && micEnabled}
                  />
                  <AudioWaveform
                    stream={localStream}
                    active={connected && micEnabled}
                    color="var(--accent)"
                    bars={14}
                    className="hidden w-24 sm:flex"
                  />
                </div>
                <div className="flex flex-col items-center gap-3">
                  <SpeakerAvatar
                    profile={other}
                    color="var(--peer)"
                    glow="var(--peer-glow)"
                    speaking={connected && speakerEnabled}
                  />
                  <AudioWaveform
                    stream={remoteStream}
                    active={connected && speakerEnabled}
                    color="var(--peer)"
                    bars={14}
                    className="hidden w-24 sm:flex"
                  />
                </div>
              </div>
              <StageIdentity
                name={other.displayName}
                direction={`${selfLanguage?.code.toUpperCase()} → ${otherLanguage?.code.toUpperCase()}`}
              />
              <LiveBadge isTranslating={isTranslating} />
              <StageCaption caption={latest} self={self} other={other} />
            </div>
          )}

          {/* The meters, for viewports too narrow to show them on the
              stage above. */}
          <div className="mt-3 flex items-center gap-3 sm:hidden">
            <AudioWaveform
              stream={localStream}
              active={connected && micEnabled}
              color="var(--accent)"
              bars={20}
              className="min-w-0 flex-1"
            />
            <AudioWaveform
              stream={remoteStream}
              active={connected && speakerEnabled}
              color="var(--peer)"
              bars={20}
              className="min-w-0 flex-1"
              mirrored
            />
          </div>

          {/* Names, kept compact now that identity lives on the stage
              badge above — still here for the full name, handle, and
              language every account actually has. */}
          <div className="mt-5 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <span className="min-w-0 truncate">
              <span className="font-medium text-[var(--foreground)]">{self.displayName}</span>{" "}
              @{self.username} · {LANGUAGE_FLAG[self.preferredLanguage]} {selfLanguage?.label}
            </span>
            <span className="min-w-0 truncate text-right">
              <span className="font-medium text-[var(--foreground)]">{other.displayName}</span>{" "}
              @{other.username} · {LANGUAGE_FLAG[other.preferredLanguage]} {otherLanguage?.label}
            </span>
          </div>

          {/* Errors and capability warnings, kept out of the way until needed. */}
          {(error || transcriptionError || !canSpeakAloud) && (
            <div className="mt-5 flex flex-col gap-2">
              {error && <Notice tone="danger">{error}</Notice>}
              {transcriptionError && <Notice tone="warn">{transcriptionError}</Notice>}
              {!canSpeakAloud && (
                <Notice tone="warn">
                  This browser can&apos;t speak translations aloud — they still appear as captions.
                </Notice>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="mt-auto flex flex-wrap items-center justify-center gap-2.5 pt-8">
            <ControlButton
              label={micEnabled ? "Mute" : "Unmute"}
              active={micEnabled}
              onClick={toggleMicrophone}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                <path d="M12 18v4" strokeLinecap="round" />
                {!micEnabled && <path d="M3 3l18 18" strokeLinecap="round" />}
              </svg>
            </ControlButton>

            <ControlButton
              label={speakerEnabled ? "Speaker" : "Muted"}
              active={speakerEnabled}
              onClick={toggleSpeaker}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
                {speakerEnabled ? (
                  <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
                ) : (
                  <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
                )}
              </svg>
            </ControlButton>

            {/* Hidden rather than disabled where the browser has no
                screen-capture API at all — every iOS browser, WebKit
                included — since there is no version of this that could ever
                start working there, unlike a control waiting on permission
                or a network condition. */}
            {canShareScreen && (
              <ControlButton
                label={screenSharing ? "Stop sharing" : "Share screen"}
                active={!screenSharing}
                disabled={screenShareBusy}
                onClick={() => void toggleScreenShare()}
              >
                {screenShareBusy ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="13" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                    {screenSharing && <path d="M2 3l20 18" />}
                  </svg>
                )}
              </ControlButton>
            )}

            {canUseCamera && (
              <ControlButton
                label={cameraOn ? "Turn camera off" : "Turn camera on"}
                active={!cameraOn}
                disabled={cameraBusy}
                onClick={() => void toggleCamera()}
              >
                {cameraBusy ? (
                  <span
                    aria-hidden
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10l5-3v10l-5-3" />
                    <rect x="2" y="6" width="13" height="12" rx="2" />
                    {cameraOn && <path d="M2 3l20 18" />}
                  </svg>
                )}
              </ControlButton>
            )}

            <ControlButton label="End call" tone="danger" onClick={() => void endCall()}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
              </svg>
            </ControlButton>
          </div>
        </section>

        {/* --- transcript ------------------------------------------------- */}
        <aside className="card-lit animate-rise flex max-h-[60vh] min-h-0 min-w-0 flex-col rounded-3xl p-4 sm:p-5 lg:max-h-none">
          <LiveCaptions
            captions={captions}
            liveTranscript={liveTranscript}
            isTranslating={isTranslating}
            self={self}
            other={other}
            onPlay={playAudio}
          />
        </aside>
      </main>
    </div>
  );
}

/** Who this stage frame is of, and which way translation is running —
    pinned to its top-left corner the way a real call overlays a name
    tag on the video rather than captioning it separately below. */
function StageIdentity({ name, direction }: { name: string; direction: string }) {
  return (
    <div className="absolute left-3 top-3 rounded-xl bg-black/45 px-3 py-2 backdrop-blur-sm sm:left-4 sm:top-4">
      <p className="truncate text-sm font-semibold text-white">{name}</p>
      <p className="mt-0.5 font-mono text-[11px] tracking-wide text-white/70">{direction}</p>
    </div>
  );
}

/** Top-right corner pill — the one place "translation is active" gets
    said in as many words, everywhere else it's just the accent colour. */
function LiveBadge({ isTranslating }: { isTranslating: boolean }) {
  return (
    <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 font-mono text-[11px] text-[var(--accent)] backdrop-blur-sm sm:right-4 sm:top-4">
      <span
        className={`h-1.5 w-1.5 rounded-full bg-[var(--accent)] ${isTranslating ? "animate-pulse" : ""}`}
      />
      {isTranslating ? "Translating" : "Live"}
    </span>
  );
}

/** The most recent line, original above and in the source-language serif
    italic, translation below in the hearing side's colour — overlaid on
    the stage itself rather than in a card underneath it. */
function StageCaption({
  caption,
  self,
  other,
}: {
  caption: CallCaption | undefined;
  self: Profile;
  other: Profile;
}) {
  if (!caption) return null;
  const listenerColor = caption.fromSelf ? "var(--peer)" : "var(--accent)";
  const speakerName = caption.fromSelf ? self.displayName.split(" ")[0] : other.displayName.split(" ")[0];

  return (
    <div className="absolute inset-x-3 bottom-3 sm:inset-x-4 sm:bottom-4">
      <div className="rounded-2xl bg-black/55 px-4 py-3 backdrop-blur-md">
        <p className="font-mono text-[10px] uppercase tracking-wide text-white/50">{speakerName}</p>
        <p className="text-original mt-1 text-sm leading-snug text-white">{caption.originalText}</p>
        {caption.translatedText && (
          <p className="mt-1 text-sm font-medium leading-snug" style={{ color: listenerColor }}>
            {caption.translatedText}
          </p>
        )}
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "danger"
      ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn)]";

  return (
    <p className={`rounded-xl border px-4 py-2.5 text-center text-sm ${styles}`}>{children}</p>
  );
}
