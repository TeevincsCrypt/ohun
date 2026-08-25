import type { Language, MicState } from "@/types";
import { Card, Pill } from "@/components/ui";
import { MicButton } from "./MicButton";
import { TranscriptPane } from "./TranscriptPane";
import { RepeatTranslationButton } from "./RepeatTranslationButton";

interface PersonPanelProps {
  label: string;
  language?: Language;
  micState?: MicState;
  transcript?: string;
  error?: string | null;
  /** Omit to render Person B's inert placeholder mic (no functional speech input in this phase). */
  onToggleMic?: () => void;
}

export function PersonPanel({
  label,
  language,
  micState,
  transcript,
  error,
  onToggleMic,
}: PersonPanelProps) {
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
        <TranscriptPane label="Translated" emptyHint="Translation will appear here…" />
      </div>

      <RepeatTranslationButton />
    </Card>
  );
}
