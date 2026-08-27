"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCallSession } from "@/lib/calls/useCallSession";
import { Avatar } from "./UserResult";
import { LiveCaptions } from "./LiveCaptions";
import { Logo } from "./Logo";
import { Pill } from "@/components/ui";
import {
  LANGUAGE_FLAG,
  getCallLanguage,
  type Call,
  type CallConnectionState,
  type CallLanguageCode,
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

const STATUS_TONE: Record<CallConnectionState, "neutral" | "live" | "warning" | "error" | "muted"> = {
  idle: "muted",
  calling: "warning",
  ringing: "warning",
  connecting: "warning",
  connected: "live",
  declined: "error",
  ended: "muted",
  failed: "error",
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ControlButton({
  label,
  active,
  danger,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tone = danger
    ? "border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/25"
    : active
      ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:opacity-90"
      : "border-amber-500/40 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-14 min-w-14 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors ${tone}`}
    >
      {children}
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

  const {
    connectionState,
    micEnabled,
    speakerEnabled,
    durationSeconds,
    error,
    hasTurn,
    captions,
    liveTranscript,
    isTranslating,
    transcriptionError,
    canSpeakAloud,
    attachRemoteAudio,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
  } = useCallSession({ call, selfId: self.id });

  useEffect(() => {
    attachRemoteAudio(audioRef.current);
  }, [attachRemoteAudio]);

  // Once the call is over, return to People rather than stranding the user.
  useEffect(() => {
    if (connectionState === "ended" || connectionState === "declined") {
      const timer = setTimeout(() => router.push("/people"), 1800);
      return () => clearTimeout(timer);
    }
  }, [connectionState, router]);

  const otherLanguage = getCallLanguage(other.preferredLanguage);
  const selfLanguage = getCallLanguage(self.preferredLanguage);

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* Remote audio. Muting this element is the speaker control — it never
          touches the microphone, which must keep capturing. */}
      <audio ref={audioRef} autoPlay playsInline />

      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <Logo />
        <Pill tone={STATUS_TONE[connectionState]}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connectionState === "connected" ? "bg-emerald-500" : "bg-current opacity-60"
            }`}
          />
          {STATUS_COPY[connectionState]}
          {connectionState === "connected" && ` · ${formatDuration(durationSeconds)}`}
        </Pill>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center">
        <Avatar name={other.displayName} size="lg" />

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{other.displayName}</h1>
          <p className="mt-1 text-[var(--muted)]">@{other.username}</p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {LANGUAGE_FLAG[self.preferredLanguage as CallLanguageCode]} {selfLanguage?.label} ↔{" "}
            {LANGUAGE_FLAG[other.preferredLanguage as CallLanguageCode]} {otherLanguage?.label}
          </p>
        </div>

        {error && (
          <Pill tone="error" className="max-w-md justify-center text-center">
            {error}
          </Pill>
        )}

        {!hasTurn && connectionState === "connecting" && (
          <Pill tone="warning" className="max-w-md justify-center text-center">
            No TURN relay configured — this call may fail on restrictive networks.
          </Pill>
        )}

        <LiveCaptions
          captions={captions}
          liveTranscript={liveTranscript}
          isTranslating={isTranslating}
          self={self}
          other={other}
        />

        {transcriptionError && (
          <Pill tone="warning" className="max-w-md justify-center text-center">
            {transcriptionError}
          </Pill>
        )}

        {!canSpeakAloud && (
          <Pill tone="warning" className="max-w-md justify-center text-center">
            This browser can&apos;t speak translations aloud — they will still appear as captions.
          </Pill>
        )}
      </main>

      <footer className="flex items-center justify-center gap-3 border-t border-[var(--border)] px-6 py-6">
        <ControlButton
          label={micEnabled ? "Mute microphone" : "Unmute microphone"}
          active={micEnabled}
          onClick={toggleMicrophone}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
            <path d="M12 18v4" strokeLinecap="round" />
            {!micEnabled && <path d="M3 3l18 18" strokeLinecap="round" />}
          </svg>
          {micEnabled ? "Mute" : "Unmute"}
        </ControlButton>

        <ControlButton
          label={speakerEnabled ? "Mute audio" : "Unmute audio"}
          active={speakerEnabled}
          onClick={toggleSpeaker}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
            {speakerEnabled ? (
              <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
            ) : (
              <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
            )}
          </svg>
          Audio
        </ControlButton>

        <ControlButton label="End call" danger onClick={() => void endCall()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z"
              strokeLinejoin="round"
            />
          </svg>
          End
        </ControlButton>
      </footer>
    </div>
  );
}
