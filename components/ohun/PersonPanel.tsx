import type { Language } from "@/types";
import { Card, Pill } from "@/components/ui";
import { MicButton } from "./MicButton";
import { TranscriptPane } from "./TranscriptPane";
import { RepeatTranslationButton } from "./RepeatTranslationButton";

export function PersonPanel({
  label,
  language,
}: {
  label: string;
  language?: Language;
}) {
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

      <MicButton />

      <div className="flex flex-col gap-3">
        <TranscriptPane label="Live transcript" emptyHint="Waiting for speech…" />
        <TranscriptPane label="Translated" emptyHint="Translation will appear here…" />
      </div>

      <RepeatTranslationButton />
    </Card>
  );
}
