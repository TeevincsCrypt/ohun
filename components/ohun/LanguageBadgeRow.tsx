import { SUPPORTED_LANGUAGES } from "@/types";
import { Pill } from "@/components/ui";

export function LanguageBadgeRow() {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {SUPPORTED_LANGUAGES.map((language) => (
        <Pill key={language.code} className="px-4 py-2 text-sm">
          {language.nativeLabel}
        </Pill>
      ))}
    </div>
  );
}
