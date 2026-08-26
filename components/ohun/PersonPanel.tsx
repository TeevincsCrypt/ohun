import type { Language, MicState } from "@/types";
import { Card, Pill } from "@/components/ui";
import { MicButton } from "./MicButton";
import { TranscriptPane } from "./TranscriptPane";
import { RepeatTranslationButton } from "./RepeatTranslationButton";

interface PersonPanelProps {
  label: string;
  language?: Language;
  /** The language this person's speech is translated into. */
  targetLanguage?: Language;
  micState?: MicState;
  transcript?: string;
  translation?: string;
  isTranslating?: boolean;
  error?: string | null;
  translationError?: string | null;
  /** Omit to render an inert placeholder mic. */
  onToggleMic?: () => void;
  /** Omit to render the repeat button inert. */
  onRepeatTranslation?: () => void;
  canSpeakAloud?: boolean;
}

export function PersonPanel({
  label,
  language,
  targetLanguage,
  micState,
  transcript,
  translation,
  isTranslating,
  error,
  translationError,
  onToggleMic,
  onRepeatTranslation,
  canSpeakAloud = true,
}: PersonPanelProps) {
  const translatedLabel = targetLanguage
    ? `Translated · ${targetLanguage.label}`
    : "Translated";

  const translatedHint = isTranslating
    ? "Translating…"
    : "Translation will appear here…";

  return (
    <Card className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{label}</h3>
          <p className="text-sm text-[var(--muted)]">
            {language ? `${language.label} · ${language.nativeLabel}` : "Language not set"}
          </p>
        </div>
        {language && <Pill tone="muted">{language.code.toUpperCase()}</Pill>}
      </div>

      <MicButton state={micState} onClick={onToggleMic} />

      {error && (
        <Pill tone="error" className="w-full justify-center text-center">
          {error}
        </Pill>
      )}

      <div className="flex flex-col gap-3">
        <TranscriptPane label="Live transcript" value={transcript} emptyHint="Waiting for speech…" />
        <TranscriptPane label={translatedLabel} value={translation} emptyHint={translatedHint} />
      </div>

      {translationError && (
        <Pill tone="error" className="w-full justify-center text-center">
          {translationError}
        </Pill>
      )}

      {!canSpeakAloud && (
        <Pill tone="warning" className="w-full justify-center text-center">
          This browser can&apos;t speak translations aloud — they will still appear as text.
        </Pill>
      )}

      <RepeatTranslationButton
        onClick={onRepeatTranslation}
        disabledReason={
          canSpeakAloud
            ? undefined
            : "This browser does not support speech playback"
        }
      />
    </Card>
  );
}
