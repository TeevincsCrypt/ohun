"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCallSession } from "@/lib/calls/useCallSession";
import { Avatar } from "./UserResult";
import { AudioWaveform } from "./AudioWaveform";
import { LiveCaptions } from "./LiveCaptions";
import { Logo } from "./Logo";
import {
  LANGUAGE_FLAG,
  getCallLanguage,
  type Call,
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

/**
 * Connection quality, derived from state we actually have rather than
 * invented. Without a TURN relay a call really is more fragile, which is
 * worth surfacing as "limited" rather than claiming everything is fine.
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

  const label = good ? "Good connection" : limited ? "Limited relay" : STATUS_COPY[state];
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

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[5, 8, 11].map((height, index) => (
          <span
            key={height}
            className="w-[3px] rounded-full transition-colors"
            style={{
              height,
              backgroundColor: index < lit ? color : "var(--border)",
            }}
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
}: {
  label: string;
  color: string;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-opacity ${
        align === "right" ? "flex-row-reverse" : ""
      } ${active ? "opacity-100" : "opacity-45"}`}
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
      {label}
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
        className={`absolute h-[132px] w-[132px] rounded-full transition-opacity duration-500 ${
          speaking ? "animate-breathe opacity-100" : "opacity-0"
        }`}
        style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 68%)` }}
      />
      <span
        aria-hidden
        className="absolute h-[108px] w-[108px] rounded-full border-2 transition-colors duration-300"
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
  tone = "neutral",
  onClick,
  children,
}: {
  label: string;
  showLabel?: boolean;
  active?: boolean;
  tone?: "neutral" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (tone === "danger") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger)] text-[#1a0505] shadow-[0_8px_28px_-6px_var(--danger-border)] transition-transform duration-150 hover:brightness-110 active:scale-95"
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="group flex flex-col items-center gap-1.5"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${
          active
            ? "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] group-hover:bg-[var(--surface-raised)]"
            : "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
        }`}
      >
        {children}
      </span>
      {showLabel && (
        <span className="text-[11px] font-medium text-[var(--muted)]">{label}</span>
      )}
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
  } = useCallSession({ call, selfId: self.id });

  useEffect(() => {
    attachRemoteAudio(audioRef.current);
  }, [attachRemoteAudio]);

  // Once the call is over, return somewhere useful rather than stranding
  // the user. A guest who joined by room link has no contacts, so People
  // would be an empty room — send them to the landing page, which is also
  // where signing up is offered.
  useEffect(() => {
    if (connectionState === "ended" || connectionState === "declined") {
      const destination = self.isGuest ? "/" : "/people";
      const timer = setTimeout(() => router.push(destination), 1800);
      return () => clearTimeout(timer);
    }
  }, [connectionState, router, self.isGuest]);

  const connected = connectionState === "connected";
  const selfLanguage = getCallLanguage(self.preferredLanguage);
  const otherLanguage = getCallLanguage(other.preferredLanguage);

  // The most recent utterance from each side, shown as the "you said /
  // they hear" pair beneath the avatars.
  const lastFromSelf = [...captions].reverse().find((caption) => caption.fromSelf);
  const lastFromOther = [...captions].reverse().find((caption) => !caption.fromSelf);
  const latest = captions[captions.length - 1];

  return (
    <div className="theme-dark relative flex flex-1 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Ambient light, keyed to whichever side last spoke. */}
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

      {/* Remote audio. Muting this element is the speaker control — it never
          touches the microphone, which must keep capturing. */}
      <audio ref={audioRef} autoPlay playsInline />

      <header className="relative z-10 flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
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
            End call
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1180px] flex-1 gap-5 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* --- stage ------------------------------------------------------ */}
        <section className="card-lit animate-rise flex min-h-0 flex-col rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <SpeakerPill label="You" color="var(--accent)" active={connected && micEnabled} />
            <div className="flex flex-col items-center">
              <span className="font-mono text-lg font-semibold tabular-nums tracking-tight">
                {connected ? formatDuration(durationSeconds) : "--:--"}
              </span>
              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
                </svg>
                Audio is end-to-end encrypted
              </span>
            </div>
            <SpeakerPill
              label={other.displayName.split(" ")[0]}
              color="var(--peer)"
              active={connected && speakerEnabled}
              align="right"
            />
          </div>

          {/* Avatars, with the live level meters between and beside them. */}
          <div className="mt-8 flex items-center justify-center gap-3 sm:gap-5">
            <AudioWaveform
              stream={localStream}
              active={connected && micEnabled}
              color="var(--accent)"
              className="hidden w-full max-w-[150px] sm:flex"
              mirrored
            />

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
              bars={18}
              className="w-full max-w-[110px]"
            />

            {/* Translation hub */}
            <div className="relative flex shrink-0 flex-col items-center">
              <span
                aria-hidden
                className={`absolute -inset-3 rounded-full transition-opacity duration-500 ${
                  isTranslating ? "animate-breathe opacity-100" : "opacity-0"
                }`}
                style={{
                  background: "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
                }}
              />
              <span
                className="relative flex h-14 w-14 items-center justify-center rounded-full border"
                style={{
                  borderColor: isTranslating ? "var(--accent)" : "var(--border)",
                  background: "var(--surface)",
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={isTranslating ? "var(--accent)" : "var(--muted)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 9v6M9 5v14M15 7v10M19 10v4" />
                </svg>
              </span>
            </div>

            <AudioWaveform
              stream={remoteStream}
              active={connected && speakerEnabled}
              color="var(--peer)"
              bars={18}
              className="w-full max-w-[110px]"
              mirrored
            />

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
              className="hidden w-full max-w-[150px] sm:flex"
            />
          </div>

          {/* Names + the direction of translation */}
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-4">
            <div className="text-center">
              <p className="text-xl font-bold tracking-tight">{self.displayName}</p>
              <p className="text-sm text-[var(--muted)]">@{self.username}</p>
              <p className="mt-1 text-sm">
                {LANGUAGE_FLAG[self.preferredLanguage]}{" "}
                <span className="text-[var(--muted)]">{selfLanguage?.label}</span>
              </p>
            </div>

            <div className="flex flex-col items-center gap-1.5 pt-1">
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isTranslating
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {isTranslating ? "Translating…" : "Live translation"}
              </span>
              <span className="text-xs">
                <span className="text-[var(--accent)]">{selfLanguage?.label}</span>
                <span className="mx-1 text-[var(--muted)]">→</span>
                <span className="text-[var(--peer)]">{otherLanguage?.label}</span>
              </span>
            </div>

            <div className="text-center">
              <p className="text-xl font-bold tracking-tight">{other.displayName}</p>
              <p className="text-sm text-[var(--muted)]">@{other.username}</p>
              <p className="mt-1 text-sm">
                {LANGUAGE_FLAG[other.preferredLanguage]}{" "}
                <span className="text-[var(--muted)]">{otherLanguage?.label}</span>
              </p>
            </div>
          </div>

          {/* Most recent utterance, each side */}
          {(lastFromSelf || lastFromOther) && (
            <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <UtteranceCard
                flag={LANGUAGE_FLAG[self.preferredLanguage]}
                label="You said"
                text={lastFromSelf?.originalText ?? "—"}
                color="var(--accent)"
              />
              <span aria-hidden className="hidden text-[var(--muted)] sm:block">
                →
              </span>
              <UtteranceCard
                flag={LANGUAGE_FLAG[other.preferredLanguage]}
                label={`${other.displayName.split(" ")[0]} hears`}
                text={lastFromSelf?.translatedText ?? "—"}
                color="var(--peer)"
              />
            </div>
          )}

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
          <div className="mt-auto flex items-center justify-center gap-6 pt-8">
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

            <ControlButton label="End call" tone="danger" onClick={() => void endCall()}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 10.5c5-4 13-4 18 0v3.2c0 .8-.7 1.4-1.5 1.3l-3-.4a1.4 1.4 0 0 1-1.2-1.3v-1.5c-2.7-1-5.9-1-8.6 0v1.5c0 .7-.5 1.2-1.2 1.3l-3 .4A1.4 1.4 0 0 1 3 13.7z" />
              </svg>
            </ControlButton>
          </div>
        </section>

        {/* --- transcript ------------------------------------------------- */}
        <aside className="card-lit animate-rise flex min-h-0 flex-col rounded-3xl p-5">
          <LiveCaptions
            captions={captions}
            liveTranscript={liveTranscript}
            isTranslating={isTranslating}
            self={self}
            other={other}
          />
        </aside>
      </main>
    </div>
  );
}

function UtteranceCard({
  flag,
  label,
  text,
  color,
}: {
  flag: string;
  label: string;
  text: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
        <span aria-hidden>{flag}</span>
        {label}
      </p>
      <p className="mt-2 text-base font-medium leading-snug" style={{ color }}>
        {text}
      </p>
    </div>
  );
}

function Notice({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  const styles =
    tone === "danger"
      ? "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]"
      : "border-amber-500/30 bg-amber-500/10 text-amber-400";

  return (
    <p className={`rounded-xl border px-4 py-2.5 text-center text-sm ${styles}`}>{children}</p>
  );
}
