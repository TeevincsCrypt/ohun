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

const styles = `
  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { box-shadow: 0 0 0 24px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  @keyframes float-up {
    0% { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes glow {
    0%, 100% { filter: drop-shadow(0 0 0 rgba(16, 185, 129, 0)); }
    50% { filter: drop-shadow(0 0 12px rgba(16, 185, 129, 0.5)); }
  }
  .pulse-ring { animation: pulse-ring 2s infinite; }
  .float-up { animation: float-up 0.4s ease-out; }
  .glow-connected { animation: glow 2s ease-in-out infinite; }
`;

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
    ? "border-red-500/50 bg-gradient-to-br from-red-500/20 to-red-500/10 text-red-400 hover:from-red-500/30 hover:to-red-500/15 shadow-lg shadow-red-500/20"
    : active
      ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 text-emerald-300 hover:from-emerald-500/30 hover:to-emerald-500/15 shadow-lg shadow-emerald-500/20"
      : "border-amber-500/50 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-400 hover:from-amber-500/30 hover:to-amber-500/15 shadow-lg shadow-amber-500/20";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-14 min-w-14 items-center justify-center gap-2 rounded-full border px-5 text-sm font-medium transition-all duration-200 active:scale-95 ${tone}`}
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

  // Once the call is over, return somewhere useful rather than stranding
  // the user. A guest who joined by room link has no contacts and nothing
  // to search for, so People would be an empty room — send them to the
  // landing page, which is also where signing up is offered.
  useEffect(() => {
    if (connectionState === "ended" || connectionState === "declined") {
      const destination = self.isGuest ? "/" : "/people";
      const timer = setTimeout(() => router.push(destination), 1800);
      return () => clearTimeout(timer);
    }
  }, [connectionState, router, self.isGuest]);

  const otherLanguage = getCallLanguage(other.preferredLanguage);
  const selfLanguage = getCallLanguage(self.preferredLanguage);

  return (
    <div className="theme-dark flex flex-1 flex-col bg-[var(--background)] text-[var(--foreground)] relative overflow-hidden">
      <style>{styles}</style>

      {/* Animated background accent */}
      {connectionState === "connected" && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
        </div>
      )}

      {/* Remote audio. Muting this element is the speaker control — it never
          touches the microphone, which must keep capturing. */}
      <audio ref={audioRef} autoPlay playsInline />

      <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 relative z-10">
        <Logo />
        <Pill tone={STATUS_TONE[connectionState]}>
          <span
            className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
              connectionState === "connected"
                ? "bg-emerald-500 pulse-ring"
                : "bg-current opacity-60"
            }`}
          />
          {STATUS_COPY[connectionState]}
          {connectionState === "connected" && ` · ${formatDuration(durationSeconds)}`}
        </Pill>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center relative z-10">
        <div className={connectionState === "connected" ? "float-up" : ""}>
          <div className={connectionState === "connected" ? "glow-connected" : ""}>
            <Avatar name={other.displayName} src={other.avatarUrl} size="lg" />
          </div>
        </div>

        <div className={connectionState === "connected" ? "float-up" : ""}>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[var(--foreground)] to-emerald-400 bg-clip-text text-transparent">
            {other.displayName}
          </h1>
          <p className="mt-1 text-[var(--muted)]">@{other.username}</p>
          <p className="mt-4 text-sm font-medium">
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              {LANGUAGE_FLAG[self.preferredLanguage as CallLanguageCode]} {selfLanguage?.label} ↔{" "}
              {LANGUAGE_FLAG[other.preferredLanguage as CallLanguageCode]} {otherLanguage?.label}
            </span>
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

      <footer className="flex items-center justify-center gap-4 border-t border-[var(--border)] px-6 py-8 relative z-10">
        <ControlButton
          label={micEnabled ? "Mute microphone" : "Unmute microphone"}
          active={micEnabled}
          onClick={toggleMicrophone}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
            <path d="M12 18v4" strokeLinecap="round" />
            {!micEnabled && <path d="M3 3l18 18" strokeLinecap="round" />}
          </svg>
          <span className="hidden sm:inline">{micEnabled ? "Mute" : "Unmute"}</span>
        </ControlButton>

        <ControlButton
          label={speakerEnabled ? "Mute audio" : "Unmute audio"}
          active={speakerEnabled}
          onClick={toggleSpeaker}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
            {speakerEnabled ? (
              <path d="M17 9a4 4 0 0 1 0 6" strokeLinecap="round" />
            ) : (
              <path d="M17 9l4 6M21 9l-4 6" strokeLinecap="round" />
            )}
          </svg>
          <span className="hidden sm:inline">Audio</span>
        </ControlButton>

        <ControlButton label="End call" danger onClick={() => void endCall()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hidden sm:inline">End</span>
        </ControlButton>
      </footer>
    </div>
  );
}
